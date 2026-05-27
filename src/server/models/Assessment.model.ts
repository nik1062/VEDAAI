import mongoose from "mongoose";
const { Schema, model, models } = mongoose;
import type { HydratedDocument, Model } from "mongoose";
import type {
  IAssessment,
  DifficultyLevel,
  IQuestion,
  IQuestionOption,
  ISection,
  IUploadedSource,
  QuestionType,
} from "../../shared/types/assessment.js";
import {
  ASSESSMENT_STATUSES,
  DIFFICULTY_LEVELS,
  QUESTION_TYPES,
} from "../../shared/types/assessment.js";

export type AssessmentDocument = HydratedDocument<IAssessment>;
export type AssessmentModel = Model<IAssessment>;

type QuestionPersistenceShape = {
  questionId: string;
  questionType: QuestionType;
  prompt: string;
  marks: number;
  difficulty: DifficultyLevel;
  learningObjective: string;
  options?: IQuestionOption[];
  correctAnswerKey?: IQuestionOption["key"];
  explanation?: string;
  expectedAnswerPoints?: string[];
  maxWordCount?: number;
};

const uploadedSourceSchema = new Schema<IUploadedSource>(
  {
    originalName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    mimeType: {
      type: String,
      enum: ["application/pdf", "text/plain"],
      required: true,
    },
    sizeBytes: {
      type: Number,
      required: true,
      min: 1,
      max: 50 * 1024 * 1024,
    },
    checksumSha256: {
      type: String,
      required: true,
      match: /^[a-f0-9]{64}$/i,
      index: true,
    },
    storageKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 512,
    },
    extractedTextLength: {
      type: Number,
      required: true,
      min: 80,
      max: 120_000,
    },
  },
  { _id: false, strict: "throw" },
);

const questionOptionSchema = new Schema<IQuestionOption>(
  {
    key: {
      type: String,
      enum: ["A", "B", "C", "D"],
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 400,
    },
  },
  { _id: false, strict: "throw" },
);

const questionSchema = new Schema<QuestionPersistenceShape>(
  {
    questionId: {
      type: String,
      required: true,
      trim: true,
      match: /^Q-[A-Z]-\d{2}$/,
    },
    questionType: {
      type: String,
      enum: QUESTION_TYPES,
      required: true,
    },
    prompt: {
      type: String,
      required: true,
      trim: true,
      minlength: 8,
      maxlength: 2_000,
    },
    marks: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
    },
    difficulty: {
      type: String,
      enum: DIFFICULTY_LEVELS,
      required: true,
      index: true,
    },
    learningObjective: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 300,
    },
    options: {
      type: [questionOptionSchema],
      default: undefined,
      validate: {
        validator(options?: IQuestionOption[]): boolean {
          if (options === undefined) {
            return true;
          }

          const optionKeys = new Set(options.map((option) => option.key));

          return (
            options.length === 4 &&
            optionKeys.has("A") &&
            optionKeys.has("B") &&
            optionKeys.has("C") &&
            optionKeys.has("D")
          );
        },
        message: "MCQ options must contain one each of A, B, C, and D.",
      },
    },
    correctAnswerKey: {
      type: String,
      enum: ["A", "B", "C", "D"],
      default: undefined,
    },
    explanation: {
      type: String,
      trim: true,
      maxlength: 800,
      default: undefined,
    },
    expectedAnswerPoints: {
      type: [String],
      default: undefined,
      validate: {
        validator(points?: string[]): boolean {
          return points === undefined || points.length > 0;
        },
        message: "Text questions require at least one expected answer point.",
      },
    },
    maxWordCount: {
      type: Number,
      min: 20,
      max: 1_500,
      default: undefined,
    },
  },
  { _id: false, strict: "throw" },
);

questionSchema.pre("validate", function validateQuestionShape(next) {
  const question = this as QuestionPersistenceShape;

  if (question.questionType === "MCQ") {
    if (
      !Array.isArray(question.options) ||
      question.options.length !== 4 ||
      question.correctAnswerKey === undefined ||
      typeof question.explanation !== "string" ||
      question.explanation.trim().length === 0 ||
      question.expectedAnswerPoints !== undefined ||
      question.maxWordCount !== undefined
    ) {
      next(
        new Error(
          "MCQ questions require only options, answer key, and explanation as answer metadata.",
        ),
      );
      return;
    }
  }

  if (question.questionType !== "MCQ") {
    if (
      !Array.isArray(question.expectedAnswerPoints) ||
      question.expectedAnswerPoints.length === 0 ||
      typeof question.maxWordCount !== "number" ||
      question.maxWordCount < 20 ||
      question.options !== undefined ||
      question.correctAnswerKey !== undefined ||
      question.explanation !== undefined
    ) {
      next(
        new Error(
          "Text questions require only expected answer points and maxWordCount as answer metadata.",
        ),
      );
      return;
    }
  }

  next();
});

const sectionSchema = new Schema<ISection>(
  {
    sectionId: {
      type: String,
      required: true,
      trim: true,
      match: /^[A-Z]$/,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 80,
    },
    instructions: {
      type: String,
      required: true,
      trim: true,
      minlength: 8,
      maxlength: 500,
    },
    totalMarks: {
      type: Number,
      required: true,
      min: 1,
      max: 300,
    },
    questions: {
      type: [questionSchema],
      required: true,
      validate: {
        validator(questions: IQuestion[]): boolean {
          return questions.length > 0 && questions.length <= 50;
        },
        message: "Each section must include between 1 and 50 questions.",
      },
    },
  },
  { _id: false, strict: "throw" },
);

sectionSchema.pre("validate", function validateSectionMarks(next) {
  const section = this as ISection;
  const questionMarks = section.questions.reduce(
    (sum: number, question: IQuestion) => sum + question.marks,
    0,
  );

  if (questionMarks !== section.totalMarks) {
    next(new Error("Section totalMarks must equal the sum of question marks."));
    return;
  }

  next();
});

const assessmentSchema = new Schema<IAssessment>(
  {
    assessmentId: {
      type: String,
      required: true,
      unique: true,
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
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 120,
    },
    status: {
      type: String,
      enum: ASSESSMENT_STATUSES,
      required: true,
      default: "queued",
      index: true,
    },
    source: {
      type: uploadedSourceSchema,
      required: true,
    },
    generationConfig: {
      dueDate: {
        type: Date,
        required: true,
        index: true,
      },
      questionTypes: {
        type: [String],
        enum: QUESTION_TYPES,
        required: true,
        validate: {
          validator(questionTypes: string[]): boolean {
            return (
              questionTypes.length > 0 &&
              questionTypes.length <= 3 &&
              new Set(questionTypes).size === questionTypes.length
            );
          },
          message: "Question types must be unique and include at least one entry.",
        },
      },
      numberOfQuestions: {
        type: Number,
        required: true,
        min: 1,
        max: 100,
      },
      totalMarks: {
        type: Number,
        required: true,
        min: 1,
        max: 500,
      },
      additionalInstructions: {
        type: String,
        trim: true,
        minlength: 1,
        maxlength: 2_000,
        default: undefined,
      },
    },
    studentHeader: {
      nameLabel: {
        type: String,
        enum: ["Name"],
        required: true,
        default: "Name",
      },
      rollNumberLabel: {
        type: String,
        enum: ["Roll Number"],
        required: true,
        default: "Roll Number",
      },
      sectionLabel: {
        type: String,
        enum: ["Section"],
        required: true,
        default: "Section",
      },
    },
    globalInstructions: {
      type: [String],
      default: [],
      validate: {
        validator(instructions: string[]): boolean {
          return instructions.length <= 8;
        },
        message: "Global instructions cannot exceed eight items.",
      },
    },
    sections: {
      type: [sectionSchema],
      default: [],
      validate: {
        validator(sections: ISection[]): boolean {
          return sections.length <= 8;
        },
        message: "Assessments cannot exceed eight sections.",
      },
    },
    totalMarks: {
      type: Number,
      required: true,
      min: 1,
      max: 500,
    },
    totalQuestions: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
    },
    jobId: {
      type: String,
      trim: true,
      default: undefined,
    },
    failureReason: {
      type: String,
      trim: true,
      maxlength: 2_000,
      default: undefined,
    },
  },
  {
    timestamps: true,
    versionKey: false,
    minimize: true,
    strict: "throw",
  },
);

assessmentSchema.index({ ownerId: 1, createdAt: -1 });
assessmentSchema.index({ ownerId: 1, status: 1, createdAt: -1 });
assessmentSchema.index({ ownerId: 1, status: 1, "generationConfig.dueDate": 1 });
assessmentSchema.index({ jobId: 1 }, { unique: true, sparse: true });
assessmentSchema.index({ jobId: 1, status: 1 });
assessmentSchema.index({ ownerId: 1, "source.checksumSha256": 1, createdAt: -1 });
assessmentSchema.index({ "sections.questions.difficulty": 1, ownerId: 1 });

assessmentSchema.pre("validate", function validateAssessmentTotals(next) {
  const assessment = this as IAssessment;
  const calculatedMarks = assessment.sections.reduce(
    (sum: number, section: ISection) => sum + section.totalMarks,
    0,
  );
  const calculatedQuestions = assessment.sections.reduce(
    (sum: number, section: ISection) => sum + section.questions.length,
    0,
  );

  if (assessment.status === "completed") {
    if (calculatedMarks !== assessment.totalMarks) {
      next(new Error("Assessment totalMarks must equal section totalMarks sum."));
      return;
    }

    if (calculatedQuestions !== assessment.totalQuestions) {
      next(
        new Error(
          "Assessment totalQuestions must equal generated question count.",
        ),
      );
      return;
    }
  }

  next();
});

export const Assessment =
  (models.Assessment as AssessmentModel | undefined) ??
  model<IAssessment>("Assessment", assessmentSchema);
