import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { emptyCache, loadCache, saveCacheAtomic, validateCacheEntry } from "../src/cache.js";
import { EMBEDDING_DIMENSION, EMBEDDING_MODEL, PROMPT_VERSION } from "@lambdamoo-mcp/core/constants";

test("requires exact cache metadata and embedding dimensions", () => {
  assert.equal(Object.keys(emptyCache().entries).length, 0);
  assert.equal(validateCacheEntry(undefined), "missing cache entry");
  assert.equal(validateCacheEntry({
    llm_description: "Performs a sufficiently detailed operation description.",
    vector_embedding: Array(EMBEDDING_DIMENSION).fill(0),
    llm_provider: "test",
    llm_model: "test",
    llm_parameters: { temperature: 0 },
    embedding_model: EMBEDDING_MODEL,
    embedding_dimension: EMBEDDING_DIMENSION,
    embedding_parameters: { pooling: "mean", normalize: true },
    prompt_version: PROMPT_VERSION,
    updated_at: new Date(0).toISOString(),
  }), null);
});

test("round-trips a sorted JSONL cache", async () => {
  const directory = await mkdtemp(join(tmpdir(), "moo-cache-test-"));
  const path = join(directory, "cache.jsonl");
  const cache = emptyCache();
  const entry = {
    llm_description: "Performs a sufficiently detailed operation description.",
    vector_embedding: Array(EMBEDDING_DIMENSION).fill(0),
    llm_provider: "test",
    llm_model: "test",
    llm_parameters: { temperature: 0 },
    embedding_model: EMBEDDING_MODEL,
    embedding_dimension: EMBEDDING_DIMENSION,
    embedding_parameters: { pooling: "mean" as const, normalize: true as const },
    prompt_version: PROMPT_VERSION,
    updated_at: new Date(0).toISOString(),
  };
  cache.entries["b".repeat(64)] = entry;
  cache.entries["a".repeat(64)] = entry;
  try {
    await saveCacheAtomic(path, cache);
    const loaded = await loadCache(path);
    assert.deepEqual(Object.keys(loaded.entries), ["a".repeat(64), "b".repeat(64)]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
