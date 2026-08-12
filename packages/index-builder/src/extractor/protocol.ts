import type { RawMooRecord } from "@lambdamoo-mcp/core/types";
import { parseMooRecord } from "@lambdamoo-mcp/core/jsonl";
import { PipelineError } from "@lambdamoo-mcp/core/errors";

export interface ProtocolBegin {
  _moo_rag: "begin";
  version: 1;
  encoding: "moo-binary";
}

export interface ProtocolEnd {
  _moo_rag: "end";
  records: number;
}

export type ProtocolFrame = ProtocolBegin | ProtocolEnd | RawMooRecord;

export function decodeMooBinary(value: string): string {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    if (char === "~" && /^[0-9A-Fa-f]{2}$/.test(value.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(value.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      const encoded = Buffer.from(char, "utf8");
      bytes.push(...encoded);
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

export function parseProtocolLine(line: string, lineNumber: number): ProtocolFrame {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch (error) {
    throw new PipelineError(
      `Dump protocol line ${lineNumber}: invalid JSON near ${JSON.stringify(line.slice(0, 240))}`,
      { cause: error },
    );
  }
  if (value !== null && typeof value === "object" && "_moo_rag" in value) {
    const control = value as Record<string, unknown>;
    if (control._moo_rag === "begin" && control.version === 1 && control.encoding === "moo-binary") {
      return control as unknown as ProtocolBegin;
    }
    if (control._moo_rag === "end" && Number.isSafeInteger(control.records) && (control.records as number) >= 0) {
      return control as unknown as ProtocolEnd;
    }
    const message = typeof control.message === "string" ? `: ${control.message}` : "";
    throw new PipelineError(`Dump protocol error frame${message}`);
  }
  if (
    value !== null &&
    typeof value === "object" &&
    (value as { type?: unknown }).type === "verb" &&
    Array.isArray((value as { code_lines?: unknown }).code_lines)
  ) {
    const raw = value as Record<string, unknown> & { code_lines: unknown[] };
    if (raw.code_lines.some((item) => typeof item !== "string")) {
      throw new PipelineError(`Dump protocol line ${lineNumber}: code_lines must contain strings`);
    }
    value = { ...raw, code: raw.code_lines.map((item) => decodeMooBinary(item as string)).join("\n") };
  }
  const encoded = parseMooRecord(value, lineNumber);
  return {
    ...encoded,
    id: decodeMooBinary(encoded.id),
    name: decodeMooBinary(encoded.name),
    parent_id: encoded.parent_id === null ? null : decodeMooBinary(encoded.parent_id),
    args: decodeMooBinary(encoded.args),
    code: encoded.type === "verb" ? encoded.code : decodeMooBinary(encoded.code),
  };
}
