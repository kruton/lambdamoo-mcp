import assert from "node:assert/strict";
import test from "node:test";
import { MooAstParser } from "../src/ast.js";

test("extracts only leading bare strings and qualified call dependencies", () => {
  const result = new MooAstParser().enrich(`"First line.";
"Second line.";
value = $string_utils:explode(args[1], ",");
"not documentation";
return $list_utils:map(value, "trim");`);

  assert.equal(result.docstring, "First line.\nSecond line.");
  assert.equal(result.semanticCode, `value = $string_utils:explode(args[1], ",");\nreturn $list_utils:map(value, "trim");`);
  assert.deepEqual(result.metadata.dependencies, ["$string_utils:explode", "$list_utils:map"]);
});

test("rejects a syntax error with verb identity and location", () => {
  assert.throws(
    () => new MooAstParser().enrich("if (1)\n  return 1;", "verb:#1:2"),
    /verb:#1:2: LambdaMOO parse failed near \d+:\d+/,
  );
});

test("accepts legacy range assignment targets", () => {
  assert.doesNotThrow(() => new MooAstParser().enrich("args[2..1] = {this};"));
});

test("removes bare-string comments anywhere in semantic code", () => {
  const result = new MooAstParser().enrich(`"Documentation.";
value = 1;
"an implementation comment";
return value;
"Last modified yesterday by someone.";`);
  assert.equal(result.docstring, "Documentation.");
  assert.equal(result.semanticCode, "value = 1;\nreturn value;");
});
