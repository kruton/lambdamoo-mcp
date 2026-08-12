import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { streamJsonl } from "../src/jsonl.js";

test("streams and validates JSONL records", async () => {
  const directory = await mkdtemp(join(tmpdir(), "moo-jsonl-test-"));
  const path = join(directory, "records.jsonl");
  try {
    await writeFile(path, `${JSON.stringify({
      id: "verb:#1:1", name: "test", type: "verb", parent_id: "object:#1", args: "{}", code: "return 1;",
    })}\n`);
    const records = [];
    for await (const record of streamJsonl(path)) records.push(record);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.code, "return 1;");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects duplicate stable IDs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "moo-jsonl-test-"));
  const path = join(directory, "records.jsonl");
  const row = { id: "object:#1", name: "one", type: "object", parent_id: null, args: "{}", code: "" };
  try {
    await writeFile(path, `${JSON.stringify(row)}\n${JSON.stringify(row)}\n`);
    await assert.rejects(async () => {
      for await (const _record of streamJsonl(path)) { /* consume */ }
    }, /duplicate record id object:#1/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
