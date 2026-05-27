export const GENERATION_JOB_STATES = [
  "job_created",
  "generating_questions",
  "storing_data",
  "completed",
  "failed",
] as const;

export type GenerationJobState = (typeof GENERATION_JOB_STATES)[number];

export interface IGenerationJobStateUpdate {
  jobId: string;
  assessmentId: string;
  event: GenerationJobState;
  message: string;
  progressPercent: number;
  occurredAt: Date;
}

export interface IGenerationJobError {
  message: string;
  code: string;
  occurredAt: Date;
}

export interface IGenerationJob {
  jobId: string;
  assessmentId: string;
  ownerId: string;
  state: GenerationJobState;
  queueName: "assessment-generation";
  progressPercent: number;
  attemptsMade: number;
  maxAttempts: number;
  error?: IGenerationJobError | undefined;
  createdAt: Date;
  updatedAt: Date;
}
