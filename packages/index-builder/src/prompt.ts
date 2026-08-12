import type { VerbDescriptionInput } from "@lambdamoo-mcp/core/types";

export const DESCRIPTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    description: { type: "string" },
  },
  required: ["description"],
} as const;

export const DESCRIPTION_INSTRUCTIONS = `You document LambdaMOO verb implementations for semantic code search.
Return JSON matching the supplied schema. The description must be a dense 2-3 sentence technical description.
Start with an action verb. State the inputs, return value or output, and externally visible side effects.
Do not restate the code line-by-line and do not use Markdown.`;

export function descriptionPrompt(input: VerbDescriptionInput): string {
  return [
    `Verb name: ${input.name}`,
    `Argument specification: ${input.args || "(none supplied)"}`,
    `Leading bare-string documentation:\n${input.docstring || "(none)"}`,
    `LambdaMOO code:\n${input.code}`,
  ].join("\n\n");
}

export function parseDescriptionJson(text: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error("Description provider returned invalid JSON", { cause: error });
  }
  if (parsed === null || typeof parsed !== "object" || typeof (parsed as { description?: unknown }).description !== "string") {
    throw new Error("Description provider response lacks a string description");
  }
  const description = (parsed as { description: string }).description.trim();
  if (description.length < 20) throw new Error("Description provider returned an implausibly short description");
  return description;
}
