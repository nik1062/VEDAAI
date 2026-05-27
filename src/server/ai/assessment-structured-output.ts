import { zodToJsonSchema } from "zod-to-json-schema";
import {
  generatedAssessmentSchema,
  validateGeneratedAssessmentAgainstConfig,
  type AssignmentCreationInput,
  type GeneratedAssessmentPayload,
} from "../../shared/validation/assessment-generation.schema.js";

export const ASSESSMENT_STRUCTURED_OUTPUT_NAME = "vedaai_assessment_v1";

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
type JsonObject = { readonly [key: string]: JsonValue };

export const assessmentStructuredOutputJsonSchema = zodToJsonSchema(
  generatedAssessmentSchema,
  {
    name: ASSESSMENT_STRUCTURED_OUTPUT_NAME,
    target: "jsonSchema7",
    $refStrategy: "none",
  },
) as JsonObject;

export const assessmentStructuredOutputConfig = {
  type: "json_schema",
  json_schema: {
    name: ASSESSMENT_STRUCTURED_OUTPUT_NAME,
    strict: true,
    schema: assessmentStructuredOutputJsonSchema,
  },
} as const;

export const assessmentResponsesTextFormat = {
  type: "json_schema",
  name: ASSESSMENT_STRUCTURED_OUTPUT_NAME,
  strict: true,
  schema: assessmentStructuredOutputJsonSchema,
} as const;

export const assertGeneratedAssessmentPayload = (
  payload: unknown,
): GeneratedAssessmentPayload => generatedAssessmentSchema.parse(payload);

export const assertGeneratedAssessmentPayloadForConfig = (
  payload: unknown,
  config: AssignmentCreationInput,
): GeneratedAssessmentPayload =>
  validateGeneratedAssessmentAgainstConfig(payload, config);
