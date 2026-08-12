import {
  DESCRIPTION_INSTRUCTIONS,
  DESCRIPTION_SCHEMA,
  descriptionPrompt,
  parseDescriptionJson,
} from "../prompt.js";
import { withRetry } from "../retry.js";
import type { DescriptionProvider, VerbDescriptionInput } from "@lambdamoo-mcp/core/types";

interface OllamaResponse {
  message?: { content?: string };
}

export class OllamaDescriptionProvider implements DescriptionProvider {
  readonly name = "ollama";
  readonly model: string;
  readonly parameters = {
    temperature: 0,
    think: false,
    num_predict: 128,
    response_format: "json_schema",
  } as const;
  readonly #baseUrl: string;

  constructor(model: string, baseUrl: string) {
    if (model.trim() === "") throw new Error("An Ollama model is required");
    this.model = model;
    this.#baseUrl = baseUrl.replace(/\/$/, "");
  }

  async describe(input: VerbDescriptionInput): Promise<string> {
    const response = await withRetry(
      async () => {
        const result = await fetch(`${this.#baseUrl}/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: this.model,
            stream: false,
            think: this.parameters.think,
            keep_alive: "30m",
            format: DESCRIPTION_SCHEMA,
            options: {
              temperature: this.parameters.temperature,
              num_predict: this.parameters.num_predict,
            },
            messages: [
              { role: "system", content: DESCRIPTION_INSTRUCTIONS },
              { role: "user", content: descriptionPrompt(input) },
            ],
          }),
          signal: AbortSignal.timeout(120_000),
        });
        if (!result.ok) {
          const error = new Error(`Ollama returned HTTP ${result.status}`) as Error & { status?: number };
          error.status = result.status;
          throw error;
        }
        return (await result.json()) as OllamaResponse;
      },
      (error) => {
        const status = (error as { status?: number }).status;
        return status === undefined || status === 429 || status >= 500;
      },
    );
    return parseDescriptionJson(response.message?.content ?? "");
  }
}
