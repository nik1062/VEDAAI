import type {
  IAssessmentGenerationJobPayload,
} from "../../shared/types/assessment.js";
import { loadRuntimeEnv, type RuntimeEnv } from "../config/env.js";
import {
  createRedisConnection,
  type RedisConnection,
} from "../infrastructure/redis.js";
import {
  loadBullMqRuntime,
  type BullMqJobsOptions,
  type BullMqQueue,
  type BullMqQueueEvents,
} from "./bullmq-runtime.js";

export const ASSESSMENT_GENERATION_QUEUE_NAME = "assessment-generation";
export const ASSESSMENT_GENERATION_JOB_NAME = "generate-assessment";

export interface AssessmentGenerationQueueBundle {
  readonly queue: BullMqQueue<IAssessmentGenerationJobPayload>;
  readonly queueEvents: BullMqQueueEvents;
  readonly connection: RedisConnection;
}

export const defaultAssessmentGenerationJobOptions: BullMqJobsOptions = {
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 60_000,
  },
  removeOnComplete: 1_000,
  removeOnFail: 5_000,
};

export const createAssessmentGenerationQueueBundle = (
  env: RuntimeEnv = loadRuntimeEnv(),
): AssessmentGenerationQueueBundle => {
  const connection = createRedisConnection(env.redisUrl);
  const { Queue, QueueEvents } = loadBullMqRuntime();

  return {
    queue: new Queue<IAssessmentGenerationJobPayload>(env.assessmentQueueName, {
      connection,
      defaultJobOptions: defaultAssessmentGenerationJobOptions,
    }),
    queueEvents: new QueueEvents(env.assessmentQueueName, { connection }),
    connection,
  };
};

export const enqueueAssessmentGenerationJob = async (
  queue: BullMqQueue<IAssessmentGenerationJobPayload>,
  payload: IAssessmentGenerationJobPayload,
): Promise<string> => {
  const job = await queue.add(ASSESSMENT_GENERATION_JOB_NAME, payload, {
    ...defaultAssessmentGenerationJobOptions,
    jobId: payload.jobId,
  });

  return job.id ?? payload.jobId;
};
