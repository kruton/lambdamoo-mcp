#!/usr/bin/env node
import { integerArg, parseArgs, stringArg } from "../args.js";
import { loadCache } from "../cache.js";
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_CACHE,
  DEFAULT_INPUT,
  DEFAULT_OUTPUT,
  DEFAULT_TABLE,
} from "@lambdamoo-mcp/core/constants";
import { checkDescriptionCache } from "../descriptions.js";
import { MiniLmEmbedder } from "@lambdamoo-mcp/core/embeddings";
import { errorMessage } from "@lambdamoo-mcp/core/errors";
import { compileLanceIndex } from "../lance.js";

try {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = stringArg(args, "input", DEFAULT_INPUT);
  const cache = await loadCache(stringArg(args, "cache", DEFAULT_CACHE));
  const problems = await checkDescriptionCache(inputPath, cache);
  if (problems.length > 0) {
    const shown = problems.slice(0, 50);
    for (const problem of shown) console.error(`${problem.id} ${problem.sha256}: ${problem.reason}`);
    if (problems.length > shown.length) console.error(`...and ${problems.length - shown.length} more`);
    throw new Error(`Refusing to build: ${problems.length} verb description cache entries are missing or invalid`);
  }
  const count = await compileLanceIndex({
    inputPath,
    outputPath: stringArg(args, "output", DEFAULT_OUTPUT),
    tableName: stringArg(args, "table", DEFAULT_TABLE),
    batchSize: integerArg(args, "batch-size", DEFAULT_BATCH_SIZE),
    cache,
    embedder: new MiniLmEmbedder(),
  });
  console.log(`Built LanceDB index containing ${count} rows.`);
} catch (error) {
  console.error(errorMessage(error));
  process.exitCode = 1;
}
