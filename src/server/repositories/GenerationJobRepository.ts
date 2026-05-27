import type {
  GenerationJobState,
  IGenerationJob,
} from "../../shared/types/generation-job.js";
import { GenerationJob } from "../models/GenerationJob.model.js";

export interface CreateGenerationJobInput {
  readonly jobId: string;
  readonly assessmentId: string;
  readonly ownerId: string;
  readonly maxAttempts: number;
}

export interface GenerationJobFailureInput {
  readonly jobId: string;
  readonly message: string;
  readonly code: string;
  readonly attemptsMade: number;
}

export class GenerationJobRepository {
  async createQueued(input: CreateGenerationJobInput): Promise<void> {
    await GenerationJob.create({
      jobId: input.jobId,
      assessmentId: input.assessmentId,
      ownerId: input.ownerId,
      state: "job_created",
      queueName: "assessment-generation",
      progressPercent: 0,
      attemptsMade: 0,
      maxAttempts: input.maxAttempts,
    });
  }

  async updateState(
    jobId: string,
    state: GenerationJobState,
    progressPercent: number,
    attemptsMade?: number,
  ): Promise<void> {
    await GenerationJob.updateOne(
      { jobId },
      {
        $set: {
          state,
          progressPercent,
          ...(attemptsMade === undefined ? {} : { attemptsMade }),
        },
      },
      { runValidators: true },
    ).exec();
  }

  async findByJobIdForOwner(
    jobId: string,
    ownerId: string,
  ): Promise<IGenerationJob | null> {
    return GenerationJob.findOne({ jobId, ownerId }).lean<IGenerationJob>().exec();
  }

  async fail(input: GenerationJobFailureInput): Promise<void> {
    await GenerationJob.updateOne(
      { jobId: input.jobId },
      {
        $set: {
          state: "failed",
          progressPercent: 100,
          attemptsMade: input.attemptsMade,
          error: {
            message: input.message,
            code: input.code,
            occurredAt: new Date(),
          },
        },
      },
      { runValidators: true },
    ).exec();
  }
}
