#!/usr/bin/env node
import { parseArgs, stringArg } from "../args.js";
import { loadCache, saveCacheAtomic } from "../cache.js";
import { DEFAULT_CACHE, DEFAULT_INPUT } from "@lambdamoo-mcp/core/constants";
import { errorMessage } from "@lambdamoo-mcp/core/errors";
import { codeSha256 } from "@lambdamoo-mcp/core/hash";
import { streamJsonl } from "@lambdamoo-mcp/core/jsonl";

try {
  const args = parseArgs(process.argv.slice(2));
  const source = stringArg(args, "from", "embeddings_cache.json");
  const destination = stringArg(args, "to", DEFAULT_CACHE);
  const input = stringArg(args, "input", DEFAULT_INPUT);
  const cache = await loadCache(source);
  const activeHashes = new Set<string>();
  for await (const record of streamJsonl(input)) {
    if (record.type === "verb") activeHashes.add(codeSha256(record.code));
  }
  const before = Object.keys(cache.entries).length;
  cache.entries = Object.fromEntries(
    Object.entries(cache.entries).filter(([sha256]) => activeHashes.has(sha256)),
  );
  await saveCacheAtomic(destination, cache);
  console.log(`Migrated ${Object.keys(cache.entries).length} entries to ${destination}; pruned ${before - Object.keys(cache.entries).length} inactive hashes.`);
} catch (error) {
  console.error(errorMessage(error));
  process.exitCode = 1;
}
