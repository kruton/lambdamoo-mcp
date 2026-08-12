import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { streamJsonl } from "./jsonl.js";
import type { AstMetadata, RawMooRecord } from "./types.js";

export class PublicIdentityMap {
  readonly databaseId: string;
  readonly #aliases = new Map<string, string[]>();
  readonly #usage = new Map<string, number>();
  readonly #canonicalCounts = new Map<string, number>();
  readonly #signatureCounts = new Map<string, number>();

  constructor(databaseId: string) {
    this.databaseId = databaseId;
  }

  observe(record: RawMooRecord): void {
    for (const field of [record.name, record.args, record.code]) {
      for (const match of field.matchAll(/\$[A-Za-z_][A-Za-z0-9_]*/g)) {
        const alias = match[0].toLowerCase();
        this.#usage.set(alias, (this.#usage.get(alias) ?? 0) + 1);
      }
    }
  }

  indexCanonical(record: RawMooRecord): void {
    const canonical = this.#canonicalBase(record);
    this.#canonicalCounts.set(canonical, (this.#canonicalCounts.get(canonical) ?? 0) + 1);
    if (record.type === "verb") {
      const signed = `${canonical}(${verbSignature(record.args)})`;
      this.#signatureCounts.set(signed, (this.#signatureCounts.get(signed) ?? 0) + 1);
    }
  }

  add(record: RawMooRecord): void {
    if (record.type !== "property" || record.parent_id !== "object:#0") return;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(record.name)) return;
    const match = record.code.trim().match(/^#(-?\d+)$/);
    if (!match?.[1]) return;
    const objectId = `object:#${match[1]}`;
    const aliases = this.#aliases.get(objectId) ?? [];
    aliases.push(`$${record.name}`);
    this.#aliases.set(objectId, aliases);
  }

  recordId(sourceId: string): string {
    return `rec:${digest(`${this.databaseId}\0${sourceId}`, 24)}`;
  }

  objectIdentity(sourceObjectId: string): string {
    const aliases = this.aliases(sourceObjectId);
    return aliases[0] ?? `<local-object:${digest(`${this.databaseId}\0${sourceObjectId}`, 16)}>`;
  }

  aliases(sourceObjectId: string): string[] {
    return [...(this.#aliases.get(sourceObjectId) ?? [])].sort((left, right) => {
      const usageDifference = (this.#usage.get(right.toLowerCase()) ?? 0) - (this.#usage.get(left.toLowerCase()) ?? 0);
      return usageDifference || compareAliases(left, right);
    });
  }

  canonicalId(record: RawMooRecord): string {
    const canonical = this.#canonicalBase(record);
    if (record.type === "verb" && (this.#canonicalCounts.get(canonical) ?? 0) > 1) {
      const signed = `${canonical}(${verbSignature(record.args)})`;
      if ((this.#signatureCounts.get(signed) ?? 0) === 1) return signed;
      return `${signed}~${digest(`${record.name}\0${record.args}\0${record.code}`, 10)}`;
    }
    return canonical;
  }

  #canonicalBase(record: RawMooRecord): string {
    if (record.type === "object") return this.objectIdentity(record.id);
    const owner = record.parent_id ? this.objectIdentity(record.parent_id) : `<local-object:unknown>`;
    const name = this.sanitizeText(record.name);
    if (record.type === "verb") return `${owner}:${primaryVerbName(name)}`;
    if (record.type === "help") return `${owner}:help/${name}`;
    return `${owner}.${name}`;
  }

  sanitizeText(value: string): string {
    return value.replace(/#-?\d+/g, (objectNumber) => this.objectIdentity(`object:${objectNumber}`));
  }

  publicAstMetadata(metadata: AstMetadata): AstMetadata {
    return {
      dependencies: metadata.dependencies.map((callee) => this.sanitizeText(callee)),
      ...(metadata.weighted_dependencies ? {
        weighted_dependencies: metadata.weighted_dependencies.map((dependency) => ({
          ...dependency,
          callee: this.sanitizeText(dependency.callee),
          receiver: dependency.receiver === null ? null : this.sanitizeText(dependency.receiver),
          ...(dependency.target_object_id
            ? { target_object_id: this.objectIdentity(dependency.target_object_id) }
            : {}),
        })),
      } : {}),
    };
  }
}

export async function loadPublicIdentities(inputPath: string): Promise<PublicIdentityMap> {
  const databaseId = `db:${await fileDigest(inputPath, 20)}`;
  const identities = new PublicIdentityMap(databaseId);
  for await (const record of streamJsonl(inputPath)) identities.add(record);
  for await (const record of streamJsonl(inputPath)) identities.observe(record);
  for await (const record of streamJsonl(inputPath)) identities.indexCanonical(record);
  return identities;
}

async function fileDigest(path: string, length: number): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex").slice(0, length);
}

function digest(value: string, length: number): string {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function compareAliases(left: string, right: string): number {
  const leftPenalty = /_(?:class|utils?)$/.test(left) ? 1 : 0;
  const rightPenalty = /_(?:class|utils?)$/.test(right) ? 1 : 0;
  return leftPenalty - rightPenalty || left.length - right.length || left.localeCompare(right);
}

function primaryVerbName(names: string): string {
  const first = names.trim().split(/\s+/)[0] || "unnamed";
  return first.replaceAll("*", "");
}

function verbSignature(args: string): string {
  try {
    const trimmed = args.trim();
    const json = trimmed.startsWith("{") && trimmed.endsWith("}")
      ? `[${trimmed.slice(1, -1)}]`
      : trimmed;
    const parsed = JSON.parse(json) as unknown;
    if (Array.isArray(parsed) && parsed.length === 3 && parsed.every((item) => typeof item === "string")) {
      return parsed.join(",");
    }
  } catch {
    // Fall through to a conservative identifier-safe representation.
  }
  return args.replace(/[^A-Za-z0-9_/-]+/g, "-").replace(/^-|-$/g, "") || "unknown";
}
