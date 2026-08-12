#!/usr/bin/env node
import { parseArgs, stringArg } from "../args.js";
import { loadCache } from "../cache.js";
import { DEFAULT_CACHE, DEFAULT_INPUT } from "@lambdamoo-mcp/core/constants";
import { checkDescriptionCache } from "../descriptions.js";
import { errorMessage } from "@lambdamoo-mcp/core/errors";

try {
  const args = parseArgs(process.argv.slice(2));
  const input = stringArg(args, "input", DEFAULT_INPUT);
  const cachePath = stringArg(args, "cache", DEFAULT_CACHE);
  const cache = await loadCache(cachePath);
  const problems = await checkDescriptionCache(input, cache);
  if (problems.length > 0) {
    const shown = problems.slice(0, 50);
    for (const problem of shown) console.error(`${problem.id} ${problem.sha256}: ${problem.reason}`);
    if (problems.length > shown.length) console.error(`...and ${problems.length - shown.length} more`);
    throw new Error(`${problems.length} verb description cache entr${problems.length === 1 ? "y is" : "ies are"} missing or invalid`);
  }
  console.log("All verb SHA-256 values have valid checked-in descriptions.");
} catch (error) {
  console.error(errorMessage(error));
  process.exitCode = 1;
}
