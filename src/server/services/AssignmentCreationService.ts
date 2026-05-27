import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type {
  IAssessmentGenerationJobPayload,
  IUploadedSource,
} from "../../shared/types/assessment.js";
import type {
  AssignmentCreationInput,
} from "../../shared/validation/assessment-generation.schema.js";
import {
  enqueueAssessmentGenerationJob,
} from "../queues/assessment-generation.queue.js";
import type { BullMqQueue } from "../queues/bullmq-runtime.js";
import {
  AssessmentRepository,
} from "../repositories/AssessmentRepository.js";
import {
  GenerationJobRepository,
} from "../repositories/GenerationJobRepository.js";
import { AppError } from "../errors/AppError.js";
import {
  SourceTextExtractorService,
  type UploadedBufferSource,
} from "./SourceTextExtractorService.js";
import type {
  GenerationJobStatePublisher,
} from "../events/GenerationJobStatePublisher.js";

export interface CreateAssignmentInput {
  readonly ownerId: string;
  readonly file: UploadedBufferSource;
  readonly generationConfig: AssignmentCreationInput;
}

export interface CreateAssignmentResult {
  readonly assessmentId: string;
  readonly jobId: string;
  readonly status: "accepted";
}

const sanitizeStorageName = (fileName: string): string => {
  const parsedName = path.parse(fileName);
  const baseName = parsedName.name.replace(/[^a-zA-Z0-9._-]+/gu, "-").slice(0, 80);
  const extension = parsedName.ext.toLowerCase();

  return `${baseName.length > 0 ? baseName : "source"}${extension}`;
};

export class AssignmentCreationService {
  constructor(
    private readonly queue: BullMqQueue<IAssessmentGenerationJobPayload>,
    private readonly assessmentRepository = new AssessmentRepository(),
    private readonly generationJobRepository = new GenerationJobRepository(),
    private readonly sourceTextExtractor = new SourceTextExtractorService(),
    private readonly statePublisher?: GenerationJobStatePublisher,
  ) {}

  async create(input: CreateAssignmentInput): Promise<CreateAssignmentResult> {
    const assessmentId = randomUUID();
    const jobId = randomUUID();
    const sourceText = await this.sourceTextExtractor.extractText(input.file);
    const checksumSha256 = createHash("sha256").update(input.file.buffer).digest("hex");
    const mimeType = input.file.mimeType;

    if (mimeType !== "application/pdf" && mimeType !== "text/plain") {
      throw new AppError(
        415,
        "UNSUPPORTED_SOURCE_TYPE",
        "Only PDF and plain text source files are supported.",
      );
    }

    const source: IUploadedSource = {
      originalName: input.file.originalName,
      mimeType,
      sizeBytes: input.file.buffer.byteLength,
      checksumSha256,
      storageKey: `uploads/${input.ownerId}/${assessmentId}/${checksumSha256}-${sanitizeStorageName(
        input.file.originalName,
      )}`,
      extractedTextLength: sourceText.length,
    };

    await this.assessmentRepository.createQueued({
      assessmentId,
      ownerId: input.ownerId,
      jobId,
      source,
      generationConfig: input.generationConfig,
    });

    await this.generationJobRepository.createQueued({
      jobId,
      assessmentId,
      ownerId: input.ownerId,
      maxAttempts: 3,
    });

    const payload: IAssessmentGenerationJobPayload = {
      jobId,
      assessmentId,
      ownerId: input.ownerId,
      source,
      sourceText,
      generationConfig: input.generationConfig,
    };

    await enqueueAssessmentGenerationJob(this.queue, payload);
    await this.statePublisher?.publish({
      jobId,
      assessmentId,
      event: "job_created",
      message: "Assessment generation job has been queued.",
      progressPercent: 0,
      occurredAt: new Date(),
    });

    return {
      assessmentId,
      jobId,
      status: "accepted",
    };
  }
}
