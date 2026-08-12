import assert from "node:assert/strict";
import test from "node:test";
import { decodeMooBinary, parseProtocolLine } from "../src/extractor/protocol.js";

test("decodes MOO encode_binary escapes", () => {
  assert.equal(decodeMooBinary("caf~C3~A9~0Aline"), "café\nline");
});

test("reassembles verb source lines using real newlines", () => {
  const frame = parseProtocolLine(JSON.stringify({
    id: "verb:#1:1",
    name: "test",
    type: "verb",
    parent_id: "object:#1",
    args: "{~22this~22, ~22none~22, ~22this~22}",
    code_lines: ["~22docs~22;", "return 1;"],
  }), 1);
  assert.ok(!("_moo_rag" in frame));
  assert.equal(frame.code, '"docs";\nreturn 1;');
});
