import OpenAI from "openai";
import {
  DESCRIPTION_INSTRUCTIONS,
  DESCRIPTION_SCHEMA,
  descriptionPrompt,
  parseDescriptionJson,
} from "../prompt.js";
import type { DescriptionProvider, VerbDescriptionInput } from "@lambdamoo-mcp/core/types";

export class OpenAIDescriptionProvider implements DescriptionProvider {
  readonly name = "openai";
  readonly model: string;
  readonly parameters = {
    api: "responses",
    reasoning_effort: "none",
    response_format: "strict_json_schema",
  } as const;
  readonly #client: OpenAI;

  constructor(model: string, apiKey = process.env.OPENAI_API_KEY) {
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for OpenAI description generation");
    this.model = model;
    this.#client = new OpenAI({ apiKey, maxRetries: 5, timeout: 60_000 });
  }

  async describe(input: VerbDescriptionInput): Promise<string> {
    const response = await this.#client.responses.create({
      model: this.model,
      instructions: DESCRIPTION_INSTRUCTIONS,
      input: descriptionPrompt(input),
      reasoning: { effort: "none" },
      text: {
        format: {
          type: "json_schema",
          name: "verb_description",
          strict: true,
          schema: DESCRIPTION_SCHEMA,
        },
      },
    });
    return parseDescriptionJson(response.output_text);
  }
}
