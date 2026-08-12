import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as lancedb from "@lancedb/lancedb";
import { EMBEDDING_DIMENSION, EMBEDDING_MODEL } from "@lambdamoo-mcp/core/constants";
import type { Embedder } from "@lambdamoo-mcp/core/embeddings";
import { LANCE_SCHEMA } from "../../index-builder/src/lance.js";
import { LanceMooSearchRepository, sanitizeText, validateTableSchema } from "../src/repository.js";

const zeroVector = Array(EMBEDDING_DIMENSION).fill(0) as number[];
const embedder: Embedder = {
  model: EMBEDDING_MODEL,
  dimension: EMBEDDING_DIMENSION,
  async embed() { return zeroVector; },
};

test("queries LanceDB through presentation-safe repository contracts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "moo-mcp-repository-"));
  const db = await lancedb.connect(directory);
  const rows = [
    row({ canonical_id: "$thing:moveto", registry_aliases: '["$thing","$generic_thing"]', type: "verb", name: "moveto", args: '{"this", "none", "this"}', code: "return $nothing;", description: "Moves this object.", ast_metadata: '{"dependencies":["$object_utils:isa"]}' }),
    row({ canonical_id: "$help:help/verbs", registry_aliases: '["$help"]', type: "help", name: "verbs", args: "$help", code: "Help on verbs.", description: "verbs\nHelp on verbs." }),
    row({ canonical_id: "$thing", registry_aliases: '["$thing","$generic_thing"]', type: "object", name: "Generic Thing", args: "{}", description: "An object." }),
  ];
  const table = await db.createTable("records", lancedb.makeArrowTable(rows, { schema: LANCE_SCHEMA }));
  const repository = new LanceMooSearchRepository(table, embedder, db);
  try {
    await validateTableSchema(table);
    const verbs = await repository.searchVerbs({ query: "move an object" });
    assert.equal(verbs.length, 1);
    assert.deepEqual(verbs[0]?.dependencies, ["$object_utils:isa"]);
    assert.equal(verbs[0]?.symbol, "$thing:moveto");
    assert.equal("id" in (verbs[0] ?? {}), false);
    assert.equal("vector" in (verbs[0] ?? {}), false);

    const help = await repository.searchHelp({ query: "verb documentation" });
    assert.equal(help[0]?.topic, "verbs");

    const aliases = await repository.lookupSymbol("$generic_thing:moveto");
    assert.equal(aliases[0]?.symbol, "$thing:moveto");
    assert.deepEqual(aliases[0]?.aliases, ["$thing:moveto", "$generic_thing:moveto"]);
    assert.deepEqual(await repository.lookupSymbol("$thing' OR true --"), []);
  } finally {
    repository.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("sanitizes raw and opaque object identities but preserves negative sentinels", () => {
  assert.equal(
    sanitizeText("#4 #-1 #-2 #-3 <local-object:abcdef0123>"),
    "<unregistered-object> $nothing $ambiguous_match $failed_match <unregistered-object>",
  );
});

function row(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "private-row-id",
    canonical_id: "<local-object:abcdef>:unknown",
    registry_aliases: "[]",
    database_id: "private-database-id",
    type: "property",
    name: "unknown",
    args: "{}",
    parent_id: "private-parent-id",
    code: null,
    ast_metadata: null,
    description: null,
    vector: zeroVector,
    ...overrides,
  };
}
