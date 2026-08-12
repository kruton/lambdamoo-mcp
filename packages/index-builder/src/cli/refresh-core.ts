#!/usr/bin/env node
import { booleanArg, integerArg, parseArgs, stringArg } from "../args.js";
import { loadCache, saveCacheAtomic } from "../cache.js";
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_CACHE,
  DEFAULT_INPUT,
  DEFAULT_OUTPUT,
  DEFAULT_TABLE,
} from "@lambdamoo-mcp/core/constants";
import { checkDescriptionCache, updateDescriptions } from "../descriptions.js";
import { MiniLmEmbedder } from "@lambdamoo-mcp/core/embeddings";
import { errorMessage } from "@lambdamoo-mcp/core/errors";
import { extractMooDatabase } from "../extractor/extract.js";
import { compileLanceIndex } from "../lance.js";
import { createDescriptionProvider } from "../providers/index.js";

try {
  if (process.env.CI === "true") throw new Error("refresh:core is a developer-only command and is disabled when CI=true");
  const args = parseArgs(process.argv.slice(2));
  const inputPath = stringArg(args, "input", DEFAULT_INPUT);
  const cachePath = stringArg(args, "cache", DEFAULT_CACHE);
  const extraction = await extractMooDatabase({
    mooExecutable: stringArg(args, "moo", "moo"),
    database: stringArg(args, "database", "data/waterpoint-core.db"),
    output: inputPath,
    startupTimeoutMs: integerArg(args, "startup-timeout-ms", 30_000),
    extractionTimeoutMs: integerArg(args, "extraction-timeout-ms", 30 * 60_000),
    keepTemporary: booleanArg(args, "keep-temporary"),
  });
  console.log(`Extracted ${extraction.records} records.`);
  const cache = await loadCache(cachePath);
  const embedder = new MiniLmEmbedder();
  const descriptions = await updateDescriptions({
    inputPath,
    cache,
    provider: createDescriptionProvider(args),
    embedder,
    refresh: booleanArg(args, "refresh"),
    concurrency: integerArg(args, "concurrency", 4),
    checkpoint: (nextCache) => saveCacheAtomic(cachePath, nextCache),
  });
  console.log(`Descriptions: ${descriptions.updated} generated, ${descriptions.reused} reused.`);
  const problems = await checkDescriptionCache(inputPath, cache);
  if (problems.length > 0) throw new Error(`${problems.length} verb descriptions remain invalid after refresh`);
  const rows = await compileLanceIndex({
    inputPath,
    outputPath: stringArg(args, "output", DEFAULT_OUTPUT),
    tableName: stringArg(args, "table", DEFAULT_TABLE),
    batchSize: integerArg(args, "batch-size", DEFAULT_BATCH_SIZE),
    cache,
    embedder,
  });
  console.log(`Built LanceDB index containing ${rows} rows.`);
} catch (error) {
  console.error(errorMessage(error));
  process.exitCode = 1;
}
