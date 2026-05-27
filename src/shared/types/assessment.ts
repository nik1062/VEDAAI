export const QUESTION_TYPES = ["MCQ", "ShortAnswer", "LongAnswer"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const DIFFICULTY_LEVELS = ["Easy", "Moderate", "Hard"] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

export const ASSESSMENT_STATUSES = [
  "queued",
  "generating",
  "storing",
  "completed",
  "failed",
] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export const SOURCE_MIME_TYPES = ["application/pdf", "text/plain"] as const;
export type SourceMimeType = (typeof SOURCE_MIME_TYPES)[number];

export interface IUploadedSource {
  originalName: string;
  mimeType: SourceMimeType;
  sizeBytes: number;
  checksumSha256: string;
  storageKey: string;
  extractedTextLength: number;
}

export interface IAssessmentGenerationConfig {
  dueDate: Date;
  questionTypes: QuestionType[];
  numberOfQuestions: number;
  totalMarks: number;
  additionalInstructions?: string | undefined;
}

export interface IQuestionOption {
  key: "A" | "B" | "C" | "D";
  text: string;
}

interface IQuestionBase {
  questionId: string;
  questionType: QuestionType;
  prompt: string;
  marks: number;
  difficulty: DifficultyLevel;
  learningObjective: string;
}

export interface IMcqQuestion extends IQuestionBase {
  questionType: "MCQ";
  options: IQuestionOption[];
  correctAnswerKey: IQuestionOption["key"];
  explanation: string;
}

export interface IShortAnswerQuestion extends IQuestionBase {
  questionType: "ShortAnswer";
  expectedAnswerPoints: string[];
  maxWordCount: number;
}

export interface ILongAnswerQuestion extends IQuestionBase {
  questionType: "LongAnswer";
  expectedAnswerPoints: string[];
  maxWordCount: number;
}

export type IQuestion =
  | IMcqQuestion
  | IShortAnswerQuestion
  | ILongAnswerQuestion;

export interface ISection {
  sectionId: string;
  title: string;
  instructions: string;
  totalMarks: number;
  questions: IQuestion[];
}

export interface IStudentHeaderBlock {
  nameLabel: "Name";
  rollNumberLabel: "Roll Number";
  sectionLabel: "Section";
}

export interface IGeneratedAssessmentContent {
  title: string;
  globalInstructions: string[];
  sections: ISection[];
  totalMarks: number;
  totalQuestions: number;
}

export interface IAssessmentGenerationJobPayload {
  jobId: string;
  assessmentId: string;
  ownerId: string;
  source: IUploadedSource;
  sourceText: string;
  generationConfig: IAssessmentGenerationConfig;
}

export interface IAssessment {
  assessmentId: string;
  ownerId: string;
  title: string;
  status: AssessmentStatus;
  source: IUploadedSource;
  generationConfig: IAssessmentGenerationConfig;
  studentHeader: IStudentHeaderBlock;
  globalInstructions: string[];
  sections: ISection[];
  totalMarks: number;
  totalQuestions: number;
  jobId?: string | undefined;
  failureReason?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
}
