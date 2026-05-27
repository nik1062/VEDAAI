import { z } from "zod";
import type { QuestionType } from "../../shared/types/assessment.js";

const acceptedAssessmentResponseSchema = z
  .object({
    assessmentId: z.string().min(8),
    jobId: z.string().min(8),
    status: z.literal("accepted"),
  })
  .strict();

const apiErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string(),
        message: z.string(),
      })
      .passthrough(),
  })
  .strict();

export type AcceptedAssessmentResponse = z.infer<
  typeof acceptedAssessmentResponseSchema
>;

export interface CreateAssessmentRequest {
  readonly ownerId: string;
  readonly sourceFile: File;
  readonly dueDate: Date;
  readonly questionTypes: readonly QuestionType[];
  readonly numberOfQuestions: number;
  readonly totalMarks: number;
  readonly additionalInstructions?: string | undefined;
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? window.location.origin;
console.log(`VedaAI Frontend: Using API Base URL: ${apiBaseUrl}`);

const readResponseError = async (response: Response): Promise<string> => {
  const payload: unknown = await response.json().catch(() => undefined);
  const parsedError = apiErrorSchema.safeParse(payload);

  if (parsedError.success) {
    return parsedError.data.error.message;
  }

  return `Request failed with HTTP ${response.status}.`;
};

export const createAssessment = async (
  request: CreateAssessmentRequest,
): Promise<AcceptedAssessmentResponse> => {
  const formData = new FormData();
  formData.append("sourceFile", request.sourceFile);
  formData.append("dueDate", request.dueDate.toISOString());
  formData.append("questionTypes", JSON.stringify(request.questionTypes));
  formData.append("numberOfQuestions", String(request.numberOfQuestions));
  formData.append("totalMarks", String(request.totalMarks));

  if (request.additionalInstructions !== undefined) {
    formData.append("additionalInstructions", request.additionalInstructions);
  }

  const response = await fetch(`${apiBaseUrl}/api/assessments`, {
    method: "POST",
    headers: {
      "x-owner-id": request.ownerId,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await readResponseError(response));
  }

  const payload: unknown = await response.json();
  return acceptedAssessmentResponseSchema.parse(payload);
};

export const getAssessment = async (
  assessmentId: string,
  ownerId: string,
): Promise<{ assessment: import("../../shared/types/assessment.js").IAssessment }> => {
  const response = await fetch(`${apiBaseUrl}/api/assessments/${assessmentId}`, {
    method: "GET",
    headers: {
      "x-owner-id": ownerId,
    },
  });

  if (!response.ok) {
    throw new Error(await readResponseError(response));
  }

  return response.json() as Promise<{ assessment: import("../../shared/types/assessment.js").IAssessment }>;
};

export const buildGenerationWebSocketUrl = (
  jobId: string,
  assessmentId: string,
): string => {
  const apiUrl = new URL(apiBaseUrl);
  apiUrl.protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
  apiUrl.pathname = "/ws/generation";
  apiUrl.search = new URLSearchParams({ jobId, assessmentId }).toString();

  return apiUrl.toString();
};
