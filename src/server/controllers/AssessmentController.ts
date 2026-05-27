import type { Request, Response } from "express";
import { z } from "zod";
import {
  assignmentCreationSchema,
  type AssignmentCreationInput,
} from "../../shared/validation/assessment-generation.schema.js";
import { AppError } from "../errors/AppError.js";
import type { AssignmentCreationService } from "../services/AssignmentCreationService.js";
import { AssessmentRepository } from "../repositories/AssessmentRepository.js";
import { GenerationJobRepository } from "../repositories/GenerationJobRepository.js";

type UploadRequest = Request & {
  readonly file?: Express.Multer.File;
};

const ownerIdSchema = z
  .string()
  .trim()
  .min(3, "Owner ID must contain at least 3 characters.")
  .max(128, "Owner ID cannot exceed 128 characters.");

const routeIdSchema = z
  .string()
  .trim()
  .min(8, "ID must contain at least 8 characters.")
  .max(128, "ID cannot exceed 128 characters.");

const bodyRecordSchema = z.record(z.string(), z.unknown());

const parseOwnerId = (request: Request): string => {
  const rawOwnerId = request.header("x-owner-id");

  if (rawOwnerId === undefined) {
    throw new AppError(
      401,
      "OWNER_ID_REQUIRED",
      "The x-owner-id header is required.",
    );
  }

  return ownerIdSchema.parse(rawOwnerId);
};

const parseQuestionTypes = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();

  if (trimmedValue.startsWith("[")) {
    try {
      const parsedValue: unknown = JSON.parse(trimmedValue);
      return parsedValue;
    } catch {
      throw new AppError(
        422,
        "INVALID_QUESTION_TYPES",
        "questionTypes must be a JSON array or comma-separated list.",
      );
    }
  }

  return trimmedValue
    .split(",")
    .map((questionType) => questionType.trim())
    .filter((questionType) => questionType.length > 0);
};

const parseOptionalInstructions = (value: unknown): unknown => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();

  return trimmedValue.length === 0 ? undefined : trimmedValue;
};

const parseAssignmentCreationBody = (body: unknown): AssignmentCreationInput => {
  const record = bodyRecordSchema.parse(body);

  return assignmentCreationSchema.parse({
    dueDate: record.dueDate,
    questionTypes: parseQuestionTypes(record.questionTypes),
    numberOfQuestions:
      typeof record.numberOfQuestions === "string"
        ? Number(record.numberOfQuestions)
        : record.numberOfQuestions,
    totalMarks:
      typeof record.totalMarks === "string"
        ? Number(record.totalMarks)
        : record.totalMarks,
    additionalInstructions: parseOptionalInstructions(
      record.additionalInstructions,
    ),
  });
};

export class AssessmentController {
  constructor(
    private readonly assignmentCreationService: AssignmentCreationService,
    private readonly assessmentRepository = new AssessmentRepository(),
    private readonly generationJobRepository = new GenerationJobRepository(),
  ) {}

  createAssessment = async (
    request: UploadRequest,
    response: Response,
  ): Promise<void> => {
    const ownerId = parseOwnerId(request);

    if (request.file === undefined) {
      throw new AppError(
        400,
        "SOURCE_FILE_REQUIRED",
        "A source file must be uploaded with the field name sourceFile.",
      );
    }

    const generationConfig = parseAssignmentCreationBody(request.body);
    const result = await this.assignmentCreationService.create({
      ownerId,
      generationConfig,
      file: {
        originalName: request.file.originalname,
        mimeType: request.file.mimetype,
        buffer: request.file.buffer,
      },
    });

    response.status(202).json(result);
  };

  getAssessment = async (
    request: Request<{ assessmentId: string }>,
    response: Response,
  ): Promise<void> => {
    const ownerId = parseOwnerId(request);
    const assessmentId = routeIdSchema.parse(request.params.assessmentId);
    const assessment = await this.assessmentRepository.findByAssessmentIdForOwner(
      assessmentId,
      ownerId,
    );

    if (assessment === null) {
      throw new AppError(404, "ASSESSMENT_NOT_FOUND", "Assessment not found.");
    }

    response.status(200).json({ assessment });
  };

  getGenerationJob = async (
    request: Request<{ jobId: string }>,
    response: Response,
  ): Promise<void> => {
    const ownerId = parseOwnerId(request);
    const jobId = routeIdSchema.parse(request.params.jobId);
    const generationJob = await this.generationJobRepository.findByJobIdForOwner(
      jobId,
      ownerId,
    );

    if (generationJob === null) {
      throw new AppError(404, "GENERATION_JOB_NOT_FOUND", "Generation job not found.");
    }

    response.status(200).json({ generationJob });
  };
}
