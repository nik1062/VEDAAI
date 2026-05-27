import mongoose from "mongoose";
const { Schema, model, models } = mongoose;
import type { HydratedDocument, Model } from "mongoose";
import type {
  IGenerationJob,
  IGenerationJobError,
} from "../../shared/types/generation-job.js";
import { GENERATION_JOB_STATES } from "../../shared/types/generation-job.js";

export type GenerationJobDocument = HydratedDocument<IGenerationJob>;
export type GenerationJobModel = Model<IGenerationJob>;

const generationJobErrorSchema = new Schema<IGenerationJobError>(
  {
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2_000,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    occurredAt: {
      type: Date,
      required: true,
    },
  },
  { _id: false, strict: "throw" },
);

const generationJobSchema = new Schema<IGenerationJob>(
  {
    jobId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      maxlength: 128,
    },
    assessmentId: {
      type: String,
      required: true,
      index: true,
      trim: true,
      maxlength: 64,
    },
    ownerId: {
      type: String,
      required: true,
      index: true,
      trim: true,
      maxlength: 128,
    },
    state: {
      type: String,
      enum: GENERATION_JOB_STATES,
      required: true,
      default: "job_created",
      index: true,
    },
    queueName: {
      type: String,
      enum: ["assessment-generation"],
      required: true,
      default: "assessment-generation",
    },
    progressPercent: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 0,
    },
    attemptsMade: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      default: 3,
    },
    error: {
      type: generationJobErrorSchema,
      default: undefined,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    strict: "throw",
  },
);

generationJobSchema.index({ ownerId: 1, createdAt: -1 });
generationJobSchema.index({ ownerId: 1, state: 1, createdAt: -1 });
generationJobSchema.index({ assessmentId: 1, state: 1 });
generationJobSchema.index({ updatedAt: 1, state: 1 });

generationJobSchema.pre("validate", function validateJobProgress(next) {
  const job = this as IGenerationJob;

  if (job.state === "completed" && job.progressPercent !== 100) {
    next(new Error("Completed jobs must have progressPercent set to 100."));
    return;
  }

  if (job.attemptsMade > job.maxAttempts) {
    next(new Error("attemptsMade cannot exceed maxAttempts."));
    return;
  }

  if (job.state === "failed" && job.error === undefined) {
    next(new Error("Failed jobs must include an error payload."));
    return;
  }

  next();
});

export const GenerationJob =
  (models.GenerationJob as GenerationJobModel | undefined) ??
  model<IGenerationJob>("GenerationJob", generationJobSchema);
