import type {
  IAssessmentGenerationJobPayload,
} from "../../shared/types/assessment.js";
import type {
  GenerationJobState,
  IGenerationJobStateUpdate,
} from "../../shared/types/generation-job.js";
import {
  assessmentGenerationJobPayloadSchema,
} from "../../shared/validation/assessment-generation.schema.js";
import { loadRuntimeEnv, type RuntimeEnv } from "../config/env.js";
import { connectMongo, disconnectMongo } from "../database/mongoose.js";
import {
  RedisGenerationJobStatePublisher,
  type GenerationJobStatePublisher,
} from "../events/GenerationJobStatePublisher.js";
import { createRedisConnection } from "../infrastructure/redis.js";
import { AssessmentRepository } from "../repositories/AssessmentRepository.js";
import { GenerationJobRepository } from "../repositories/GenerationJobRepository.js";
import { AIGeneratorService } from "../services/AIGeneratorService.js";
import { loadBullMqRuntime, type BullMqJob, type BullMqWorker } from "../queues/bullmq-runtime.js";

interface AssessmentGenerationWorkerDependencies {
  readonly env?: RuntimeEnv;
  readonly aiGeneratorService?: AIGeneratorService;
  readonly assessmentRepository?: AssessmentRepository;
  readonly generationJobRepository?: GenerationJobRepository;
  readonly statePublisher?: GenerationJobStatePublisher;
}

interface ProcessingError {
  readonly message: string;
  readonly code: string;
}

const toProcessingError = (error: unknown): ProcessingError => {
  if (error instanceof Error) {
    return {
      message: error.message,
      code: error.name.length > 0 ? error.name : "ASSESSMENT_GENERATION_ERROR",
    };
  }

  return {
    message: "Unknown assessment generation failure.",
    code: "UNKNOWN_ASSESSMENT_GENERATION_ERROR",
  };
};

const emitState = async (
  publisher: GenerationJobStatePublisher,
  payload: IAssessmentGenerationJobPayload,
  event: GenerationJobState,
  message: string,
  progressPercent: number,
): Promise<void> => {
  const update: IGenerationJobStateUpdate = {
    jobId: payload.jobId,
    assessmentId: payload.assessmentId,
    event,
    message: message.slice(0, 1000),
    progressPercent,
    occurredAt: new Date(),
  };

  await publisher.publish(update);
};

const readMaxAttempts = (
  job: BullMqJob<IAssessmentGenerationJobPayload>,
): number =>
  typeof job.opts.attempts === "number" && job.opts.attempts > 0
    ? job.opts.attempts
    : 1;

export const processAssessmentGenerationJob = async (
  job: BullMqJob<IAssessmentGenerationJobPayload>,
  dependencies: Required<AssessmentGenerationWorkerDependencies>,
): Promise<void> => {
  const payload = assessmentGenerationJobPayloadSchema.parse(job.data);
  const attemptsMade = job.attemptsMade + 1;

  try {
    await dependencies.generationJobRepository.updateState(
      payload.jobId,
      "generating_questions",
      15,
      attemptsMade,
    );
    await dependencies.assessmentRepository.markGenerating(
      payload.assessmentId,
      payload.jobId,
    );
    await job.updateProgress(15);
    await emitState(
      dependencies.statePublisher,
      payload,
      "generating_questions",
      "Generating assessment questions from source material.",
      15,
    );

    const generatedAssessment =
      await dependencies.aiGeneratorService.generateAssessment(
        payload.sourceText,
        payload.generationConfig,
      );

    await dependencies.generationJobRepository.updateState(
      payload.jobId,
      "storing_data",
      85,
      attemptsMade,
    );
    await dependencies.assessmentRepository.markStoring(payload.assessmentId);
    await job.updateProgress(85);
    await emitState(
      dependencies.statePublisher,
      payload,
      "storing_data",
      "Persisting generated assessment structure.",
      85,
    );

    await dependencies.assessmentRepository.completeWithGeneratedContent(
      payload.assessmentId,
      generatedAssessment,
    );
    await dependencies.generationJobRepository.updateState(
      payload.jobId,
      "completed",
      100,
      attemptsMade,
    );
    await job.updateProgress(100);
    await emitState(
      dependencies.statePublisher,
      payload,
      "completed",
      "Assessment generation completed.",
      100,
    );
  } catch (error: unknown) {
    const processingError = toProcessingError(error);
    const maxAttempts = readMaxAttempts(job);
    const isLastAttempt = attemptsMade >= maxAttempts;

    if (isLastAttempt) {
      await dependencies.assessmentRepository.fail(
        payload.assessmentId,
        processingError.message,
      );
      await dependencies.generationJobRepository.fail({
        jobId: payload.jobId,
        message: processingError.message,
        code: processingError.code,
        attemptsMade,
      });
      await job.updateProgress(100);
      await emitState(
        dependencies.statePublisher,
        payload,
        "failed",
        processingError.message,
        100,
      );
    } else {
      console.warn(`Job ${payload.jobId} failed on attempt ${attemptsMade}/${maxAttempts}, retrying... Error: ${processingError.message}`);
      await dependencies.generationJobRepository.updateState(
        payload.jobId,
        "generating_questions", // Keep in same state but update attempts
        15,
        attemptsMade,
      );
      await emitState(
        dependencies.statePublisher,
        payload,
        "generating_questions",
        `Attempt ${attemptsMade} failed, retrying: ${processingError.message}`,
        15,
      );
    }

    throw error;
  }
};

export const createAssessmentGenerationWorker = (
  dependencies: AssessmentGenerationWorkerDependencies = {},
): BullMqWorker<IAssessmentGenerationJobPayload> => {
  const env = dependencies.env ?? loadRuntimeEnv();
  const maskedRedisUrl = env.redisUrl.replace(/\/\/([^:]+):[^@]+@/, "//$1:****@");
  console.log(`Connecting worker to Redis at: ${maskedRedisUrl}`);
  const connection = createRedisConnection(env.redisUrl);
  const { Worker } = loadBullMqRuntime();

  const resolvedDependencies: Required<AssessmentGenerationWorkerDependencies> = {
    env,
    aiGeneratorService:
      dependencies.aiGeneratorService ??
      new AIGeneratorService({
        apiKey: env.openAiApiKey,
        baseUrl: env.openAiBaseUrl,
        model: env.openAiModel,
        timeoutMs: 300_000, // Increased to 5 minutes for large assessments
      }),
    assessmentRepository:
      dependencies.assessmentRepository ?? new AssessmentRepository(),
    generationJobRepository:
      dependencies.generationJobRepository ?? new GenerationJobRepository(),
    statePublisher:
      dependencies.statePublisher ??
      new RedisGenerationJobStatePublisher(env.redisUrl),
  };

  const worker = new Worker<IAssessmentGenerationJobPayload>(
    env.assessmentQueueName,
    (job) => processAssessmentGenerationJob(job, resolvedDependencies),
    {
      connection,
      concurrency: env.assessmentWorkerConcurrency,
    },
  );

  worker.on("failed", (job, error) => {
    const jobId = job?.id ?? "unknown";
    console.error(`Assessment worker job ${jobId} failed: ${error.message}`);
  });

  worker.on("error", (error) => {
    console.error(`Assessment worker runtime error: ${error.message}`);
  });

  return worker;
};

if (
  import.meta.url === `file://${process.argv[1]?.replace(/\\/gu, "/")}` ||
  decodeURI(import.meta.url) === `file:///${process.argv[1]?.replace(/\\/gu, "/")}`
) {
  const env = loadRuntimeEnv();
  console.log("Connecting worker to MongoDB...");
  await connectMongo(env);
  console.log("Starting Assessment Generation Worker...");
  createAssessmentGenerationWorker({ env });
}
