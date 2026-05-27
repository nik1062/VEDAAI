import type {
  IAssessment,
  IAssessmentGenerationConfig,
  IGeneratedAssessmentContent,
  IUploadedSource,
  ISection,
} from "../../shared/types/assessment.js";
import { Assessment } from "../models/Assessment.model.js";

export interface CreateQueuedAssessmentInput {
  readonly assessmentId: string;
  readonly ownerId: string;
  readonly jobId: string;
  readonly source: IUploadedSource;
  readonly generationConfig: IAssessmentGenerationConfig;
}

export class AssessmentRepository {
  async createQueued(input: CreateQueuedAssessmentInput): Promise<void> {
    await Assessment.create({
      assessmentId: input.assessmentId,
      ownerId: input.ownerId,
      title: "Pending Assessment",
      status: "queued",
      source: input.source,
      generationConfig: input.generationConfig,
      studentHeader: {
        nameLabel: "Name",
        rollNumberLabel: "Roll Number",
        sectionLabel: "Section",
      },
      globalInstructions: [],
      sections: [],
      totalMarks: input.generationConfig.totalMarks,
      totalQuestions: input.generationConfig.numberOfQuestions,
      jobId: input.jobId,
    } satisfies Omit<IAssessment, "createdAt" | "updatedAt">);
  }

  async findByAssessmentIdForOwner(
    assessmentId: string,
    ownerId: string,
  ): Promise<IAssessment | null> {
    return Assessment.findOne({ assessmentId, ownerId }).lean<IAssessment>().exec();
  }

  async markGenerating(assessmentId: string, jobId: string): Promise<void> {
    await Assessment.updateOne(
      { assessmentId },
      {
        $set: {
          status: "generating",
          jobId,
          failureReason: undefined,
        },
      },
      { runValidators: true },
    ).exec();
  }

  async markStoring(assessmentId: string): Promise<void> {
    await Assessment.updateOne(
      { assessmentId },
      { $set: { status: "storing" } },
      { runValidators: true },
    ).exec();
  }

  async completeWithGeneratedContent(
    assessmentId: string,
    content: IGeneratedAssessmentContent,
  ): Promise<void> {
    await Assessment.updateOne(
      { assessmentId },
      {
        $set: {
          title: content.title,
          status: "completed",
          globalInstructions: content.globalInstructions,
          sections: content.sections as ISection[],
          totalMarks: content.totalMarks,
          totalQuestions: content.totalQuestions,
          failureReason: undefined,
        },
      },
      { runValidators: true },
    ).exec();
  }

  async fail(assessmentId: string, failureReason: string): Promise<void> {
    await Assessment.updateOne(
      { assessmentId },
      {
        $set: {
          status: "failed",
          failureReason,
        },
      },
      { runValidators: true },
    ).exec();
  }
}
