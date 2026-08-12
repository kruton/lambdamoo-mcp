import assert from "node:assert/strict";
import test from "node:test";
import { PublicIdentityMap } from "../src/identities.js";
import type { RawMooRecord } from "../src/types.js";

const property = (name: string, code: string): RawMooRecord => ({
  id: `property:#0:${name}`,
  type: "property",
  name,
  parent_id: "object:#0",
  args: "",
  code,
});

test("publishes registry symbols and hides numeric object addresses", () => {
  const identities = new PublicIdentityMap("db:test");
  identities.add(property("thing", "#5"));
  identities.add(property("generic_thing_utils", "#5"));
  identities.observe({
    id: "verb:#1:1",
    type: "verb",
    name: "example",
    parent_id: "object:#1",
    args: "",
    code: "$generic_thing_utils:test(); $generic_thing_utils:test(); $thing:test();",
  });
  assert.equal(identities.objectIdentity("object:#5"), "$generic_thing_utils");
  assert.deepEqual(identities.aliases("object:#5"), ["$generic_thing_utils", "$thing"]);
  const sanitized = identities.sanitizeText("return #5:moveto(#243);");
  assert.match(sanitized, /^return \$generic_thing_utils:moveto\(<local-object:[a-f0-9]{16}>\);$/);
  assert.doesNotMatch(sanitized, /#-?\d+/);
  assert.doesNotMatch(identities.recordId("verb:#5:2"), /#|\b5\b/);
});

test("disambiguates overloaded verbs with their LambdaMOO argument signature", () => {
  const identities = new PublicIdentityMap("db:test");
  identities.add(property("player", "#6"));
  const first: RawMooRecord = {
    id: "verb:#6:1", type: "verb", name: "@desc*ribe", parent_id: "object:#6",
    args: '{"any", "as", "any"}', code: "return 1;",
  };
  const second: RawMooRecord = {
    id: "verb:#6:2", type: "verb", name: "@desc*ribe", parent_id: "object:#6",
    args: '{"any", "none", "none"}', code: "return 2;",
  };
  identities.indexCanonical(first);
  identities.indexCanonical(second);
  assert.equal(identities.canonicalId(first), "$player:@describe(any,as,any)");
  assert.equal(identities.canonicalId(second), "$player:@describe(any,none,none)");
});
