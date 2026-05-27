import { z } from "zod";
import { QUESTION_TYPES } from "../../shared/types/assessment.js";

const MAX_SOURCE_SIZE_BYTES = 50 * 1024 * 1024;

const fileListSchema = z
  .custom<FileList>((value) => value instanceof FileList, {
    message: "Source file is required.",
  })
  .refine((fileList) => fileList.length === 1, "Select exactly one source file.")
  .refine((fileList) => {
    const file = fileList.item(0);
    return file !== null && file.size > 0;
  }, "Source file cannot be empty.")
  .refine((fileList) => {
    const file = fileList.item(0);
    return file !== null && file.size <= MAX_SOURCE_SIZE_BYTES;
  }, "Source file cannot exceed 50 MB.")
  .refine((fileList) => {
    const file = fileList.item(0);
    return (
      file !== null &&
      (file.type === "application/pdf" || file.type === "text/plain")
    );
  }, "Only PDF and plain text files are supported.");

export const assignmentFormSchema = z
  .object({
    ownerId: z
      .string()
      .trim()
      .min(3, "Owner ID must contain at least 3 characters.")
      .max(128, "Owner ID cannot exceed 128 characters."),
    sourceFile: fileListSchema,
    dueDate: z
      .string()
      .min(1, "Due date is required.")
      .transform((value, context) => {
        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Due date must be valid.",
          });
          return z.NEVER;
        }

        return date;
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
    numberOfQuestions: z.coerce
      .number()
      .int("Number of questions must be an integer.")
      .min(1, "Number of questions must be at least 1.")
      .max(100, "Number of questions cannot exceed 100."),
    totalMarks: z.coerce
      .number()
      .int("Total marks must be an integer.")
      .min(1, "Total marks must be at least 1.")
      .max(500, "Total marks cannot exceed 500."),
    additionalInstructions: z
      .string()
      .trim()
      .max(2_000, "Additional instructions cannot exceed 2,000 characters.")
      .transform((value) => (value.length === 0 ? undefined : value)),
  })
  .strict()
  .superRefine((formValues, context) => {
    if (formValues.totalMarks < formValues.numberOfQuestions) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalMarks"],
        message: "Total marks must be at least the number of questions.",
      });
    }
  });

export type AssignmentFormInput = z.input<typeof assignmentFormSchema>;
export type AssignmentFormOutput = z.output<typeof assignmentFormSchema>;
