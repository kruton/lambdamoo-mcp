#!/usr/bin/env node
import { booleanArg, integerArg, parseArgs, stringArg } from "../args.js";
import { loadCache, saveCacheAtomic } from "../cache.js";
import { DEFAULT_CACHE, DEFAULT_INPUT } from "@lambdamoo-mcp/core/constants";
import { updateDescriptions } from "../descriptions.js";
import { MiniLmEmbedder } from "@lambdamoo-mcp/core/embeddings";
import { errorMessage } from "@lambdamoo-mcp/core/errors";
import { createDescriptionProvider } from "../providers/index.js";

try {
  if (process.env.CI === "true") throw new Error("Description generation is disabled when CI=true");
  const args = parseArgs(process.argv.slice(2));
  const inputPath = stringArg(args, "input", DEFAULT_INPUT);
  const cachePath = stringArg(args, "cache", DEFAULT_CACHE);
  const cache = await loadCache(cachePath);
  const result = await updateDescriptions({
    inputPath,
    cache,
    provider: createDescriptionProvider(args),
    embedder: new MiniLmEmbedder(),
    refresh: booleanArg(args, "refresh"),
    concurrency: integerArg(args, "concurrency", 4),
    checkpoint: (nextCache) => saveCacheAtomic(cachePath, nextCache),
  });
  console.log(`Description cache updated: ${result.updated} generated, ${result.reused} reused.`);
} catch (error) {
  console.error(errorMessage(error));
  process.exitCode = 1;
}
