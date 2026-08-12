import { DEFAULT_LLM_MODEL, DEFAULT_OLLAMA_URL } from "@lambdamoo-mcp/core/constants";
import { PipelineError } from "@lambdamoo-mcp/core/errors";
import type { CliArgs } from "../args.js";
import { stringArg } from "../args.js";
import type { DescriptionProvider } from "@lambdamoo-mcp/core/types";
import { OllamaDescriptionProvider } from "./ollama.js";
import { OpenAIDescriptionProvider } from "./openai.js";

export function createDescriptionProvider(args: CliArgs): DescriptionProvider {
  const provider = stringArg(args, "provider", "openai");
  if (provider === "openai") {
    return new OpenAIDescriptionProvider(stringArg(args, "model", DEFAULT_LLM_MODEL));
  }
  if (provider === "ollama") {
    return new OllamaDescriptionProvider(
      stringArg(args, "model"),
      stringArg(args, "ollama-url", DEFAULT_OLLAMA_URL),
    );
  }
  throw new PipelineError(`Unsupported description provider: ${provider}`);
}
