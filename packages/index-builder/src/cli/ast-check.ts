#!/usr/bin/env node
import { parseArgs, stringArg } from "../args.js";
import { MooAstParser } from "../ast.js";
import { DEFAULT_INPUT } from "@lambdamoo-mcp/core/constants";
import { errorMessage } from "@lambdamoo-mcp/core/errors";
import { streamJsonl } from "@lambdamoo-mcp/core/jsonl";

try {
  const args = parseArgs(process.argv.slice(2));
  const parser = new MooAstParser();
  let verbs = 0;
  for await (const record of streamJsonl(stringArg(args, "input", DEFAULT_INPUT))) {
    if (record.type !== "verb") continue;
    parser.enrich(record.code, record.id);
    verbs += 1;
  }
  console.log(`Strictly parsed ${verbs} LambdaMOO verbs without errors.`);
} catch (error) {
  console.error(errorMessage(error));
  process.exitCode = 1;
}
