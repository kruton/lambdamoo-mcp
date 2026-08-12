#!/usr/bin/env node
import { parseArgs, booleanArg, integerArg, stringArg } from "../args.js";
import { extractMooDatabase } from "../extractor/extract.js";
import { errorMessage } from "@lambdamoo-mcp/core/errors";

try {
  const args = parseArgs(process.argv.slice(2));
  const result = await extractMooDatabase({
    mooExecutable: stringArg(args, "moo", "moo"),
    database: stringArg(args, "database", "data/waterpoint-core.db"),
    output: stringArg(args, "output", "moo_extract.jsonl"),
    startupTimeoutMs: integerArg(args, "startup-timeout-ms", 30_000),
    extractionTimeoutMs: integerArg(args, "extraction-timeout-ms", 30 * 60_000),
    keepTemporary: booleanArg(args, "keep-temporary"),
  });
  console.log(`Extracted ${result.records} records to ${result.output}`);
} catch (error) {
  console.error(errorMessage(error));
  process.exitCode = 1;
}
