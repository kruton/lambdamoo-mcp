import assert from "node:assert/strict";
import test from "node:test";
import { MooDependencyGraph } from "../src/dependencies.js";
import type { RawMooRecord } from "../src/types.js";

function record(value: Partial<RawMooRecord> & Pick<RawMooRecord, "id" | "type" | "name">): RawMooRecord {
  return { parent_id: null, args: "", code: "", ...value };
}

test("weights MOO calls by object, ancestry, registry, and literal receiver", () => {
  const graph = new MooDependencyGraph();
  for (const value of [
    record({ id: "object:#0", type: "object", name: "system" }),
    record({ id: "object:#5", type: "object", name: "thing", parent_id: "object:#1" }),
    record({ id: "object:#10", type: "object", name: "child", parent_id: "object:#5" }),
    record({ id: "object:#20", type: "object", name: "string utils" }),
    record({ id: "object:#30", type: "object", name: "local" }),
    record({ id: "object:#31", type: "object", name: "json" }),
    record({ id: "property:#0:thing", type: "property", name: "thing", parent_id: "object:#0", code: "#5" }),
    record({ id: "property:#0:string_utils", type: "property", name: "string_utils", parent_id: "object:#0", code: "#20" }),
    record({ id: "property:#0:local", type: "property", name: "local", parent_id: "object:#0", code: "#30" }),
    record({ id: "property:#30:json", type: "property", name: "json", parent_id: "object:#30", code: "#31" }),
  ]) graph.add(value);

  const edges = graph.resolve([
    "this:random_verb",
    "$thing:moveto",
    "$string_utils:explode",
    "$local.json:parse",
    "#243:random_verb",
    "pass",
  ], "object:#10");

  assert.deepEqual(edges.map((item) => [item.relationship, item.target_object_id, item.weight]), [
    ["same_object", "object:#10", 1],
    ["ancestor", "object:#5", 0.9],
    ["registry", "object:#20", 0.75],
    ["registry", "object:#31", 0.75],
    ["explicit_object", "object:#243", 0.35],
    ["ancestor", "object:#5", 0.9],
  ]);
});
