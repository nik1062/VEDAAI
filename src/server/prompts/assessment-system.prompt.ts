import type { AssignmentCreationInput } from "../../shared/validation/assessment-generation.schema.js";

export interface AssessmentPromptContext {
  sourceText: string;
  config: AssignmentCreationInput;
}

export const ASSESSMENT_SYSTEM_PROMPT = `
You are VedaAI, an expert academic assessment designer.

Return only data matching the provided structured-output JSON schema.
Do not return markdown, prose wrappers, code fences, or unstructured text.
Do not invent fields outside the schema. Do not omit required fields.

Assessment construction rules:
1. Generate a print-ready academic assessment from the provided source text only.
2. Create sections named with single uppercase IDs: A, B, C, and so on.
3. Every question must include a stable questionId in the format Q-<SECTION>-<NUMBER>, for example Q-A-01.
4. Every question must include one difficulty tag: Easy, Moderate, or Hard.
5. Total question count must exactly match the requested numberOfQuestions.
6. Total marks must exactly match the requested totalMarks.
7. Each section totalMarks must equal the sum of its question marks.
8. MCQ questions must include exactly four options with keys A, B, C, and D, one correctAnswerKey, and a concise explanation.
9. ShortAnswer and LongAnswer questions must include expectedAnswerPoints and a reasonable maxWordCount.
10. Avoid duplicate questions and avoid asking questions that cannot be answered from the source text.
11. Use clear, student-facing language suitable for a formal exam paper.
12. Respect additional instructions unless they conflict with schema validity or the source material.
13. Use "Moderate" as the middle difficulty label; never use "Medium".
14. Keep marks as positive integers and distribute them across sections without fractional values.
`.trim();

export const buildAssessmentUserPrompt = ({
  sourceText,
  config,
}: AssessmentPromptContext): string => {
  const instructions =
    config.additionalInstructions?.trim() || "No additional instructions.";

  return `
Create an assessment with these exact constraints:
- Due date: ${config.dueDate.toISOString()}
- Question types: ${config.questionTypes.join(", ")}
- Number of questions: ${config.numberOfQuestions}
- Total marks: ${config.totalMarks}
- Additional instructions: ${instructions}

Source material:
${sourceText}
`.trim();
};
