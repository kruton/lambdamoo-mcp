import assert from "node:assert/strict";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as lancedb from "@lancedb/lancedb";
import { emptyCache } from "../src/cache.js";
import { EMBEDDING_DIMENSION, EMBEDDING_MODEL, PROMPT_VERSION } from "@lambdamoo-mcp/core/constants";
import { codeSha256 } from "@lambdamoo-mcp/core/hash";
import { compileLanceIndex } from "../src/lance.js";
import type { Embedder } from "@lambdamoo-mcp/core/embeddings";

const embedder: Embedder = {
  model: EMBEDDING_MODEL,
  dimension: EMBEDDING_DIMENSION,
  async embed() { return Array(EMBEDDING_DIMENSION).fill(0); },
};

test("compiles a strict LanceDB table without an LLM", async () => {
  const directory = await mkdtemp(join(tmpdir(), "moo-lance-test-"));
  const input = join(directory, "input.jsonl");
  const output = join(directory, "index.lancedb");
  const code = '"Returns one.";\nreturn 1;';
  const cache = emptyCache();
  cache.entries[codeSha256(code)] = {
    llm_description: "Returns the numeric value one without producing external side effects.",
    vector_embedding: Array(EMBEDDING_DIMENSION).fill(0),
    llm_provider: "test",
    llm_model: "test",
    llm_parameters: { temperature: 0 },
    embedding_model: EMBEDDING_MODEL,
    embedding_dimension: EMBEDDING_DIMENSION,
    embedding_parameters: { pooling: "mean", normalize: true },
    prompt_version: PROMPT_VERSION,
    updated_at: new Date(0).toISOString(),
  };
  try {
    await writeFile(input, [
      { id: "object:#1", type: "object", name: "one", parent_id: null, args: "{}", code: "" },
      { id: "verb:#1:1", type: "verb", name: "one", parent_id: "object:#1", args: "{}", code },
    ].map((row) => JSON.stringify(row)).join("\n") + "\n");
    assert.equal(await compileLanceIndex({ inputPath: input, outputPath: output, cache, embedder }), 2);
    await access(output);
    const database = await lancedb.connect(output);
    const table = await database.openTable("records");
    const schema = await table.schema();
    assert.equal(schema.fields.find((field) => field.name === "args")?.nullable, false);
    table.close();
    database.close();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
