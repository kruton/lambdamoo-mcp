import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { RECORD_TYPES, type RawMooRecord } from "./types.js";
import { PipelineError } from "./errors.js";

function requireString(value: unknown, field: string, lineNumber: number): string {
  if (typeof value !== "string") {
    throw new PipelineError(`Line ${lineNumber}: ${field} must be a string`);
  }
  return value;
}

export function parseMooRecord(value: unknown, lineNumber: number): RawMooRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new PipelineError(`Line ${lineNumber}: expected a JSON object`);
  }
  const row = value as Record<string, unknown>;
  const type = requireString(row.type, "type", lineNumber);
  if (!(RECORD_TYPES as readonly string[]).includes(type)) {
    throw new PipelineError(`Line ${lineNumber}: unsupported type ${JSON.stringify(type)}`);
  }
  const parent = row.parent_id;
  if (parent !== null && typeof parent !== "string") {
    throw new PipelineError(`Line ${lineNumber}: parent_id must be a string or null`);
  }
  return {
    id: requireString(row.id, "id", lineNumber),
    name: requireString(row.name, "name", lineNumber),
    type: type as RawMooRecord["type"],
    parent_id: parent,
    args: requireString(row.args, "args", lineNumber),
    code: requireString(row.code, "code", lineNumber),
  };
}

export async function* streamJsonl(path: string): AsyncGenerator<RawMooRecord> {
  const input = createReadStream(path, { encoding: "utf8" });
  input.on("error", () => undefined);
  const lines = createInterface({ input, crlfDelay: Infinity });
  const ids = new Set<string>();
  let lineNumber = 0;
  try {
    for await (const rawLine of lines) {
      lineNumber += 1;
      if (rawLine.trim() === "") continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawLine);
      } catch (error) {
        throw new PipelineError(`Line ${lineNumber}: invalid JSON`, { cause: error });
      }
      const record = parseMooRecord(parsed, lineNumber);
      if (ids.has(record.id)) {
        throw new PipelineError(`Line ${lineNumber}: duplicate record id ${record.id}`);
      }
      ids.add(record.id);
      yield record;
    }
  } catch (error) {
    input.destroy();
    throw error;
  } finally {
    lines.close();
  }
}
