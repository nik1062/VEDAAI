import { z } from "zod";
import {
  DIFFICULTY_LEVELS,
  QUESTION_TYPES,
  SOURCE_MIME_TYPES,
} from "../types/assessment.js";
import { GENERATION_JOB_STATES } from "../types/generation-job.js";
import type {
  IGeneratedAssessmentContent,
  IQuestion,
  ISection,
} from "../types/assessment.js";

const trimmedString = (fieldName: string, min: number, max: number) =>
  z
    .string({
      required_error: `${fieldName} is required.`,
      invalid_type_error: `${fieldName} must be a string.`,
    })
    .trim()
    .min(min, `${fieldName} must contain at least ${min} characters.`)
    .max(max, `${fieldName} must contain at most ${max} characters.`);

const questionOptionSchema = z
  .object({
    key: z.enum(["A", "B", "C", "D"]),
    text: trimmedString("Option text", 1, 400),
  })
  .strict();

const mcqOptionsSchema = z
  .array(questionOptionSchema)
  .length(4, "MCQ questions must include exactly four options.")
  .refine(
    (options) => {
      const optionKeys = new Set(options.map((option) => option.key));

      return (
        optionKeys.has("A") &&
        optionKeys.has("B") &&
        optionKeys.has("C") &&
        optionKeys.has("D")
      );
    },
    {
      message: "MCQ options must contain one each of A, B, C, and D.",
    },
  );

export const uploadedSourceSchema = z
  .object({
    originalName: trimmedString("File name", 1, 255).regex(
      /^[^<>:"|?*\u0000-\u001F]+$/,
      "File name contains unsupported characters.",
    ),
    mimeType: z.enum(SOURCE_MIME_TYPES),
    sizeBytes: z
      .number()
      .int("File size must be an integer number of bytes.")
      .min(1, "Uploaded file cannot be empty.")
      .max(50 * 1024 * 1024, "Uploaded file cannot exceed 50 MB."),
    checksumSha256: trimmedString("File checksum", 64, 64).regex(
      /^[a-f0-9]{64}$/i,
      "File checksum must be a valid SHA-256 hex digest.",
    ),
    storageKey: trimmedString("Storage key", 8, 512),
    extractedTextLength: z
      .number()
      .int("Extracted text length must be an integer.")
      .min(80, "Source material must contain at least 80 extracted characters.")
      .max(120_000, "Source material cannot exceed 120,000 characters."),
  })
  .strict();

export const sourceTextSchema = trimmedString("Source text", 80, 120_000);

const baseQuestionSchema = z.object({
  questionId: trimmedString("Question ID", 3, 64).regex(
    /^Q-[A-Z]-\d{2}$/,
    "Question ID must follow Q-<SECTION>-<NUMBER>, for example Q-A-01.",
  ),
  prompt: trimmedString("Question prompt", 8, 2_000),
  marks: z
    .number()
    .int("Marks must be an integer.")
    .min(1, "Marks must be at least 1.")
    .max(100, "Marks cannot exceed 100."),
  difficulty: z.enum(DIFFICULTY_LEVELS),
  learningObjective: trimmedString("Learning objective", 5, 300),
});

export const generatedMcqQuestionSchema = baseQuestionSchema
  .extend({
    questionType: z.literal("MCQ"),
    options: mcqOptionsSchema,
    correctAnswerKey: z.enum(["A", "B", "C", "D"]),
    explanation: trimmedString("Explanation", 8, 800),
  })
  .strict();

export const generatedShortAnswerQuestionSchema = baseQuestionSchema
  .extend({
    questionType: z.literal("ShortAnswer"),
    expectedAnswerPoints: z
      .array(trimmedString("Expected answer point", 3, 250))
      .min(1, "Short answer questions need at least one scoring point.")
      .max(6, "Short answer questions cannot exceed six scoring points."),
    maxWordCount: z
      .number()
      .int("Maximum word count must be an integer.")
      .min(20, "Short answers need at least 20 words.")
      .max(250, "Short answers cannot exceed 250 words."),
  })
  .strict();

export const generatedLongAnswerQuestionSchema = baseQuestionSchema
  .extend({
    questionType: z.literal("LongAnswer"),
    expectedAnswerPoints: z
      .array(trimmedString("Expected answer point", 3, 300))
      .min(2, "Long answer questions need at least two scoring points.")
      .max(10, "Long answer questions cannot exceed ten scoring points."),
    maxWordCount: z
      .number()
      .int("Maximum word count must be an integer.")
      .min(250, "Long answers need at least 250 words.")
      .max(1_500, "Long answers cannot exceed 1,500 words."),
  })
  .strict();

export const generatedQuestionSchema: z.ZodType<IQuestion> = z.discriminatedUnion("questionType", [
  generatedMcqQuestionSchema,
  generatedShortAnswerQuestionSchema,
  generatedLongAnswerQuestionSchema,
]) as z.ZodType<IQuestion>;

export const generatedSectionSchema: z.ZodType<ISection> = z
  .object({
    sectionId: trimmedString("Section ID", 1, 1).regex(
      /^[A-Z]$/,
      "Section ID must be a single uppercase letter.",
    ),
    title: trimmedString("Section title", 3, 80),
    instructions: trimmedString("Section instructions", 8, 500),
    totalMarks: z
      .number()
      .int("Section marks must be an integer.")
      .min(1, "Section marks must be positive.")
      .max(300, "Section marks cannot exceed 300."),
    questions: z
      .array(generatedQuestionSchema)
      .min(1, "Each section must contain at least one question.")
      .max(50, "A section cannot contain more than 50 questions."),
  })
  .strict()
  .superRefine((section, context) => {
    const calculatedMarks = section.questions.reduce(
      (sum: number, question: IQuestion) => sum + question.marks,
      0,
    );

    if (calculatedMarks !== section.totalMarks) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalMarks"],
        message: "Section totalMarks must equal the sum of question marks.",
      });
    }

    const seenQuestionIds = new Set<string>();

    section.questions.forEach((question: IQuestion, index: number) => {
      if (seenQuestionIds.has(question.questionId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", index, "questionId"],
          message: "Question IDs must be unique within a section.",
        });
      }

      seenQuestionIds.add(question.questionId);

      if (!question.questionId.startsWith(`Q-${section.sectionId}-`)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["questions", index, "questionId"],
          message: "Question ID section prefix must match the parent section.",
        });
      }
    });
  });

export const generatedAssessmentSchema: z.ZodType<IGeneratedAssessmentContent> = z
  .object({
    title: trimmedString("Assessment title", 5, 120),
    globalInstructions: z
      .array(trimmedString("Global instruction", 8, 250))
      .min(2, "At least two global instructions are required.")
      .max(8, "Global instructions cannot exceed eight items."),
    sections: z
      .array(generatedSectionSchema)
      .min(1, "At least one section is required.")
      .max(8, "Assessments cannot exceed eight sections."),
    totalMarks: z
      .number()
      .int("Total marks must be an integer.")
      .min(1, "Total marks must be positive.")
      .max(500, "Total marks cannot exceed 500."),
    totalQuestions: z
      .number()
      .int("Total questions must be an integer.")
      .min(1, "At least one question is required.")
      .max(100, "Total questions cannot exceed 100."),
  })
  .strict()
  .superRefine((assessment, context) => {
    const calculatedMarks = assessment.sections.reduce(
      (sum: number, section: ISection) => sum + section.totalMarks,
      0,
    );
    const calculatedQuestions = assessment.sections.reduce(
      (sum: number, section: ISection) => sum + section.questions.length,
      0,
    );

    if (calculatedMarks !== assessment.totalMarks) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalMarks"],
        message: "Assessment totalMarks must equal the sum of section marks.",
      });
    }

    if (calculatedQuestions !== assessment.totalQuestions) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalQuestions"],
        message:
          "Assessment totalQuestions must equal the number of generated questions.",
      });
    }

    const seenSectionIds = new Set<string>();
    const seenQuestionIds = new Set<string>();

    assessment.sections.forEach((section: ISection, sectionIndex: number) => {
      if (seenSectionIds.has(section.sectionId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["sections", sectionIndex, "sectionId"],
          message: "Section IDs must be unique.",
        });
      }

      seenSectionIds.add(section.sectionId);

      section.questions.forEach((question: IQuestion, questionIndex: number) => {
        if (seenQuestionIds.has(question.questionId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["sections", sectionIndex, "questions", questionIndex, "questionId"],
            message: "Question IDs must be unique across the assessment.",
          });
        }

        seenQuestionIds.add(question.questionId);
      });
    });
  });

export const assignmentCreationSchema = z
  .object({
    dueDate: z.coerce
      .date({
        required_error: "Due date is required.",
        invalid_type_error: "Due date must be a valid date.",
      })
      .refine((date) => date.getTime() > Date.now(), {
        message: "Due date must be in the future.",
      }),
    questionTypes: z
      .array(z.enum(QUESTION_TYPES))
      .min(1, "Select at least one question type.")
      .max(3, "Only supported question types may be selected.")
      .refine(
        (questionTypes) => new Set(questionTypes).size === questionTypes.length,
        "Question types cannot contain duplicates.",
      ),
    numberOfQuestions: z
      .number()
      .int("Number of questions must be an integer.")
      .min(1, "Number of questions must be at least 1.")
      .max(100, "Number of questions cannot exceed 100."),
    totalMarks: z
      .number()
      .int("Total marks must be an integer.")
      .min(1, "Total marks must be at least 1.")
      .max(500, "Total marks cannot exceed 500."),
    additionalInstructions: z
      .string()
      .trim()
      .min(1, "Additional instructions cannot be blank when provided.")
      .max(2_000, "Additional instructions cannot exceed 2,000 characters.")
      .optional(),
  })
  .strict()
  .superRefine((config, context) => {
    if (config.totalMarks < config.numberOfQuestions) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalMarks"],
        message:
          "Total marks must be at least the number of questions because every question carries at least one mark.",
      });
    }
  });

export const assessmentGenerationJobPayloadSchema = z
  .object({
    jobId: trimmedString("Job ID", 8, 128),
    assessmentId: trimmedString("Assessment ID", 8, 128),
    ownerId: trimmedString("Owner ID", 3, 128),
    source: uploadedSourceSchema,
    sourceText: sourceTextSchema,
    generationConfig: assignmentCreationSchema,
  })
  .strict();

export const generationJobStateSchema = z
  .object({
    jobId: trimmedString("Job ID", 8, 128),
    assessmentId: trimmedString("Assessment ID", 8, 128),
    event: z.enum(GENERATION_JOB_STATES),
    message: trimmedString("Job state message", 3, 1000),
    progressPercent: z
      .number()
      .int("Progress percentage must be an integer.")
      .min(0, "Progress cannot be negative.")
      .max(100, "Progress cannot exceed 100."),
    occurredAt: z.coerce.date(),
  })
  .strict();

export type GeneratedAssessmentPayload = z.infer<
  typeof generatedAssessmentSchema
>;
export type AssignmentCreationInput = z.infer<typeof assignmentCreationSchema>;
export type UploadedSourceInput = z.infer<typeof uploadedSourceSchema>;
export type AssessmentGenerationJobPayload = z.infer<
  typeof assessmentGenerationJobPayloadSchema
>;
export type GenerationJobStatePayload = z.infer<typeof generationJobStateSchema>;

export const validateGeneratedAssessmentAgainstConfig = (
  payload: unknown,
  config: AssignmentCreationInput,
): GeneratedAssessmentPayload => {
  const assessment = generatedAssessmentSchema.parse(payload);

  if (assessment.totalMarks !== config.totalMarks) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: ["totalMarks"],
        message: `Generated totalMarks must equal requested totalMarks (${config.totalMarks}).`,
      },
    ]);
  }

  if (assessment.totalQuestions !== config.numberOfQuestions) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: ["totalQuestions"],
        message: `Generated totalQuestions must equal requested numberOfQuestions (${config.numberOfQuestions}).`,
      },
    ]);
  }

  const allowedQuestionTypes = new Set(config.questionTypes);
  const disallowedQuestion = assessment.sections
    .flatMap((section: ISection) => section.questions)
    .find((question: IQuestion) => !allowedQuestionTypes.has(question.questionType));

  if (disallowedQuestion !== undefined) {
    throw new z.ZodError([
      {
        code: z.ZodIssueCode.custom,
        path: ["sections"],
        message: `Generated question ${disallowedQuestion.questionId} used unsupported type ${disallowedQuestion.questionType}.`,
      },
    ]);
  }

  return assessment;
};
