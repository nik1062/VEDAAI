import { z } from "zod";
import type {
  IAssessmentGenerationConfig,
  IGeneratedAssessmentContent,
} from "../../shared/types/assessment.js";
import {
  validateGeneratedAssessmentAgainstConfig,
  type AssignmentCreationInput,
} from "../../shared/validation/assessment-generation.schema.js";
import {
  ASSESSMENT_STRUCTURED_OUTPUT_NAME,
  assessmentStructuredOutputJsonSchema,
  assessmentResponsesTextFormat,
} from "../ai/assessment-structured-output.js";
import {
  ASSESSMENT_SYSTEM_PROMPT,
  buildAssessmentUserPrompt,
} from "../prompts/assessment-system.prompt.js";

export interface AIGeneratorServiceConfig {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly model: string;
  readonly timeoutMs: number;
}

interface OpenAiErrorResponse {
  readonly error?: {
    readonly message?: string;
    readonly type?: string;
    readonly code?: string;
  };
}

interface OpenAiResponsesRequestBody {
  readonly model: string;
  readonly input: readonly [
    {
      readonly role: "system";
      readonly content: string;
    },
    {
      readonly role: "user";
      readonly content: string;
    },
  ];
  readonly text: {
    readonly format: typeof assessmentResponsesTextFormat;
  };
}

const jsonRecordSchema = z.record(z.string(), z.unknown());

const outputTextContentSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
  refusal: z.string().optional(),
});

const responseOutputItemSchema = z.object({
  type: z.string().optional(),
  content: z.array(outputTextContentSchema).optional(),
});

const openAiResponsesSchema = z.object({
  output_text: z.string().optional(),
  output: z.array(responseOutputItemSchema).optional(),
});

const coerceGenerationConfig = (
  config: IAssessmentGenerationConfig,
): AssignmentCreationInput => ({
  ...config,
  dueDate: config.dueDate,
});

const buildEndpoint = (baseUrl: string): string =>
  `${baseUrl.replace(/\/+$/u, "")}/responses`;

const readErrorMessage = async (response: Response): Promise<string> => {
  const rawBody = await response.text();

  if (rawBody.length === 0) {
    return `OpenAI request failed with HTTP ${response.status}.`;
  }

  try {
    const parsedBody: unknown = JSON.parse(rawBody);
    const errorBody = jsonRecordSchema.parse(parsedBody) as OpenAiErrorResponse;

    return (
      errorBody.error?.message ??
      `OpenAI request failed with HTTP ${response.status}.`
    );
  } catch {
    return `OpenAI request failed with HTTP ${response.status}: ${rawBody.slice(
      0,
      300,
    )}`;
  }
};

const extractStructuredOutputText = (payload: unknown): string => {
  const parsedPayload = openAiResponsesSchema.parse(payload);

  if (parsedPayload.output_text !== undefined) {
    return parsedPayload.output_text;
  }

  const refusal = parsedPayload.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.refusal !== undefined)?.refusal;

  if (refusal !== undefined) {
    throw new Error(`The model refused the assessment generation request: ${refusal}`);
  }

  const outputText = parsedPayload.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text" && content.text !== undefined)
    ?.text;

  if (outputText === undefined) {
    throw new Error("OpenAI response did not include structured output text.");
  }

  return outputText;
};

export class AIGeneratorService {
  private readonly config: AIGeneratorServiceConfig;

  constructor(config: AIGeneratorServiceConfig) {
    this.config = config;
  }

  async generateAssessment(
    sourceText: string,
    generationConfig: IAssessmentGenerationConfig,
  ): Promise<IGeneratedAssessmentContent> {
    const parsedConfig = coerceGenerationConfig(generationConfig);
    const maxRetries = 5;
    const initialDelayMs = 10000;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

      try {
        if (attempt > 0) {
          const delay = initialDelayMs * Math.pow(2, attempt - 1) * (0.5 + Math.random());
          console.log(`[AIGeneratorService] Retry attempt ${attempt}/${maxRetries} after ${Math.round(delay)}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        const requestBody = {
          model: this.config.model,
          messages: [
            {
              role: "system",
              content: ASSESSMENT_SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: buildAssessmentUserPrompt({
                sourceText,
                config: parsedConfig,
              }),
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: ASSESSMENT_STRUCTURED_OUTPUT_NAME,
              strict: true,
              schema: assessmentStructuredOutputJsonSchema,
            },
          },
        };

        const finalUrl = `${this.config.baseUrl.replace(/\/+$/u, "")}/chat/completions`;
        console.log(`[AIGeneratorService] Fetching: ${finalUrl} (Attempt ${attempt + 1})`);
        
        const response = await fetch(finalUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorDetail = await readErrorMessage(response);
          const isRetryable = response.status === 429 || (response.status >= 500 && response.status < 600);
          
          if (isRetryable && attempt < maxRetries) {
            console.warn(`[AIGeneratorService] AI generation failed with status ${response.status} (retryable). Details: ${errorDetail}`);
            continue;
          }
          
          throw new Error(`AI generation failed with status ${response.status}: ${errorDetail}`);
        }

        const responsePayload: any = await response.json();
        const structuredText = responsePayload.choices?.[0]?.message?.content;
        
        if (!structuredText) {
          throw new Error("AI response did not include structured output content.");
        }

        const parsedOutput: unknown = JSON.parse(structuredText);
        return validateGeneratedAssessmentAgainstConfig(parsedOutput, parsedConfig);
      } catch (error: any) {
        lastError = error;
        const isAbortError = error.name === "AbortError";
        
        if ((isAbortError || error.message?.includes("fetch")) && attempt < maxRetries) {
          console.warn(`[AIGeneratorService] AI generation encountered ${isAbortError ? "timeout" : "network error"} (retryable): ${error.message}`);
          continue;
        }
        
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError ?? new Error("AI generation failed after multiple retries.");
  }
}
