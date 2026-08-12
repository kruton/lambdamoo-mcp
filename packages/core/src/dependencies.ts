import { streamJsonl } from "./jsonl.js";
import type { RawMooRecord, WeightedDependency } from "./types.js";

export const DEPENDENCY_WEIGHTS = {
  same_object: 1,
  ancestor: 0.9,
  registry: 0.75,
  builtin: 0.65,
  explicit_object: 0.35,
  dynamic: 0.25,
} as const;

export class MooDependencyGraph {
  readonly #parents = new Map<string, string | null>();
  readonly #properties = new Map<string, Map<string, string>>();

  add(record: RawMooRecord): void {
    if (record.type === "object") {
      this.#parents.set(record.id, record.parent_id);
    } else if (record.type === "property" && record.parent_id) {
      let properties = this.#properties.get(record.parent_id);
      if (!properties) this.#properties.set(record.parent_id, properties = new Map());
      properties.set(record.name, record.code);
    }
  }

  resolve(callees: string[], ownerObjectId: string): WeightedDependency[] {
    return callees.map((callee) => this.#resolveOne(callee, ownerObjectId));
  }

  #resolveOne(callee: string, ownerObjectId: string): WeightedDependency {
    const colon = callee.lastIndexOf(":");
    if (colon < 0) {
      if (callee === "pass") {
        const target = this.#parents.get(ownerObjectId) ?? undefined;
        return edge(callee, null, callee, "ancestor", "implicit", target, DEPENDENCY_WEIGHTS.ancestor);
      }
      return edge(callee, null, callee, "builtin", "implicit", undefined, DEPENDENCY_WEIGHTS.builtin);
    }

    const receiver = callee.slice(0, colon);
    const verb = callee.slice(colon + 1);
    if (receiver === "this") {
      return edge(callee, receiver, verb, "same_object", "this", ownerObjectId, DEPENDENCY_WEIGHTS.same_object);
    }
    if (receiver.startsWith("$")) {
      const target = this.#resolveRegistryPath(receiver);
      const relationship = target && this.#isOwnerOrAncestor(ownerObjectId, target)
        ? (target === ownerObjectId ? "same_object" : "ancestor")
        : "registry";
      return edge(
        callee,
        receiver,
        verb,
        relationship,
        "registry",
        target,
        DEPENDENCY_WEIGHTS[relationship],
      );
    }
    if (/^#-?\d+$/.test(receiver)) {
      const target = `object:${receiver}`;
      const relationship = this.#isOwnerOrAncestor(ownerObjectId, target) ? "ancestor" : "explicit_object";
      return edge(
        callee,
        receiver,
        verb,
        relationship,
        "object_number",
        target,
        DEPENDENCY_WEIGHTS[relationship],
      );
    }
    return edge(callee, receiver, verb, "dynamic", "dynamic", undefined, DEPENDENCY_WEIGHTS.dynamic);
  }

  #resolveRegistryPath(receiver: string): string | undefined {
    const parts = receiver.slice(1).split(".");
    const root = parts.shift();
    if (!root) return undefined;
    let objectId = this.#propertyObject("object:#0", root);
    for (const property of parts) {
      if (!objectId) return undefined;
      objectId = this.#propertyObject(objectId, property);
    }
    return objectId;
  }

  #propertyObject(startObjectId: string, name: string): string | undefined {
    let current: string | null | undefined = startObjectId;
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      visited.add(current);
      const literal = this.#properties.get(current)?.get(name)?.trim();
      const match = literal?.match(/^#(-?\d+)$/);
      if (match?.[1]) return `object:#${match[1]}`;
      current = this.#parents.get(current);
    }
    return undefined;
  }

  #isOwnerOrAncestor(ownerObjectId: string, targetObjectId: string): boolean {
    let current: string | null | undefined = ownerObjectId;
    const visited = new Set<string>();
    while (current && !visited.has(current)) {
      if (current === targetObjectId) return true;
      visited.add(current);
      current = this.#parents.get(current);
    }
    return false;
  }
}

export async function loadDependencyGraph(inputPath: string): Promise<MooDependencyGraph> {
  const graph = new MooDependencyGraph();
  for await (const record of streamJsonl(inputPath)) graph.add(record);
  return graph;
}

function edge(
  callee: string,
  receiver: string | null,
  verb: string,
  relationship: WeightedDependency["relationship"],
  receiverKind: WeightedDependency["receiver_kind"],
  targetObjectId: string | undefined,
  weight: number,
): WeightedDependency {
  return {
    callee,
    receiver,
    verb,
    relationship,
    receiver_kind: receiverKind,
    ...(targetObjectId ? { target_object_id: targetObjectId } : {}),
    weight,
  };
}
