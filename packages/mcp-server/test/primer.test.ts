import assert from "node:assert/strict";
import test from "node:test";
import { LAMBDAMOO_CODING_WORKFLOW, LAMBDAMOO_SERVER_INSTRUCTIONS, LAMBDAMOO_SYNTAX_PRIMER } from "../src/primer.js";

test("syntax primer is compact and covers LambdaMOO-specific traps", () => {
  const words = LAMBDAMOO_SYNTAX_PRIMER.trim().split(/\s+/);
  assert.ok(words.length <= 300, `primer contains ${words.length} words`);
  for (const required of [
    "elseif", "endif", "endfor", "endwhile", "endtry", "1-based", "args", "different types", "not a type error",
    "$nothing", "$ambiguous_match", "$failed_match",
  ]) {
    assert.ok(LAMBDAMOO_SYNTAX_PRIMER.includes(required), `primer should mention ${required}`);
  }
});

test("server instructions require validation of generated LambdaMOO code", () => {
  assert.ok(LAMBDAMOO_CODING_WORKFLOW.includes("check_moo_code"));
  assert.ok(LAMBDAMOO_CODING_WORKFLOW.includes("format_moo_code"));
  assert.ok(LAMBDAMOO_SERVER_INSTRUCTIONS.includes(LAMBDAMOO_CODING_WORKFLOW));
  assert.ok(LAMBDAMOO_SERVER_INSTRUCTIONS.includes(LAMBDAMOO_SYNTAX_PRIMER));
});
