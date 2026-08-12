import * as lancedb from "@lancedb/lancedb";
import { EMBEDDING_DIMENSION } from "../../core/src/constants.js";
import type { Embedder } from "../../core/src/embeddings.js";
import type {
  MooHelpSearchResult,
  MooRecordType,
  MooSymbolLookupResult,
  MooVerbSearchResult,
  SemanticSearchQuery,
} from "../../core/src/types.js";

const SEARCH_COLUMNS = [
  "canonical_id", "registry_aliases", "type", "name", "args", "code", "ast_metadata", "description", "_distance",
];
const LOOKUP_COLUMNS = [
  "canonical_id", "registry_aliases", "type", "name", "args", "code", "description",
];
const REQUIRED_COLUMNS = [
  "canonical_id", "registry_aliases", "type", "name", "args", "code", "ast_metadata", "description", "vector",
];

type IndexRow = Record<string, unknown>;

export interface MooSearchRepository {
  searchVerbs(input: SemanticSearchQuery): Promise<MooVerbSearchResult[]>;
  searchHelp(input: SemanticSearchQuery): Promise<MooHelpSearchResult[]>;
  lookupSymbol(symbol: string): Promise<MooSymbolLookupResult[]>;
  close(): void;
}

export class LanceMooSearchRepository implements MooSearchRepository {
  constructor(
    private readonly table: lancedb.Table,
    private readonly embedder: Embedder,
    private readonly connection?: lancedb.Connection,
  ) {}

  static async open(databasePath: string, tableName: string, embedder: Embedder): Promise<LanceMooSearchRepository> {
    const connection = await lancedb.connect(databasePath);
    try {
      const table = await connection.openTable(tableName);
      await validateTableSchema(table);
      return new LanceMooSearchRepository(table, embedder, connection);
    } catch (error) {
      connection.close();
      throw error;
    }
  }

  async searchVerbs(input: SemanticSearchQuery): Promise<MooVerbSearchResult[]> {
    const rows = await this.semanticRows(input, "verb");
    return rows.map((row) => sanitizeVerbResult({
      symbol: publicSymbol(stringValue(row.canonical_id)),
      name: stringValue(row.name),
      args: stringValue(row.args),
      description: stringValue(row.description),
      code: stringValue(row.code),
      dependencies: parseDependencies(row.ast_metadata),
      distance: finiteNumber(row._distance),
    }));
  }

  async searchHelp(input: SemanticSearchQuery): Promise<MooHelpSearchResult[]> {
    const rows = await this.semanticRows(input, "help");
    return rows.map((row) => sanitizeHelpResult({
      topic: stringValue(row.name),
      database_symbol: publicSymbol(parseHelpDatabase(row.ast_metadata)),
      text: stringValue(row.code),
      distance: finiteNumber(row._distance),
    }));
  }

  async lookupSymbol(symbol: string): Promise<MooSymbolLookupResult[]> {
    const normalized = symbol.trim();
    if (!normalized.startsWith("$") || normalized.length > 256) return [];

    let rows = await this.exactCanonicalRows(normalized);
    let ownerAliases: string[] | undefined;
    if (rows.length === 0) {
      const { owner, suffix } = splitSymbol(normalized);
      const objects = await this.table.query()
        .where("type = 'object'")
        .select(["canonical_id", "registry_aliases"])
        .toArray() as IndexRow[];
      const ownerRow = objects.find((row) => parseAliases(row.registry_aliases)
        .some((alias) => alias.toLowerCase() === owner.toLowerCase()));
      if (!ownerRow) return [];
      ownerAliases = parseAliases(ownerRow.registry_aliases);
      rows = await this.exactCanonicalRows(`${stringValue(ownerRow.canonical_id)}${suffix}`);
    }

    return rows.map((row) => {
      const aliases = ownerAliases ?? parseAliases(row.registry_aliases);
      const { suffix } = splitSymbol(stringValue(row.canonical_id));
      return sanitizeLookupResult({
        symbol: stringValue(row.canonical_id),
        aliases: suffix ? aliases.map((alias) => `${alias}${suffix}`) : aliases,
        type: recordType(row.type),
        name: stringValue(row.name),
        args: stringValue(row.args),
        description: nullableString(row.description),
        code: nullableString(row.code),
      });
    }).filter((result) => result.symbol.startsWith("$"));
  }

  close(): void {
    this.table.close();
    this.connection?.close();
  }

  private async semanticRows(input: SemanticSearchQuery, type: "verb" | "help"): Promise<IndexRow[]> {
    const query = input.query.trim();
    if (!query) throw new Error("Search query must not be empty");
    const vector = await this.embedder.embed(query);
    if (vector.length !== EMBEDDING_DIMENSION) {
      throw new Error(`Query embedder returned ${vector.length} dimensions; expected ${EMBEDDING_DIMENSION}`);
    }
    return this.table.query()
      .nearestTo(vector)
      .where(`type = '${type}'`)
      .select(SEARCH_COLUMNS)
      .limit(searchLimit(input.limit))
      .toArray() as Promise<IndexRow[]>;
  }

  private exactCanonicalRows(symbol: string): Promise<IndexRow[]> {
    return this.table.query()
      .where(`canonical_id = ${sqlString(symbol)}`)
      .select(LOOKUP_COLUMNS)
      .limit(20)
      .toArray() as Promise<IndexRow[]>;
  }
}

export async function validateTableSchema(table: lancedb.Table): Promise<void> {
  const schema = await table.schema();
  const fields = new Map(schema.fields.map((field) => [field.name, field]));
  const missing = REQUIRED_COLUMNS.filter((name) => !fields.has(name));
  if (missing.length > 0) throw new Error(`LanceDB table is missing required columns: ${missing.join(", ")}`);
  const vector = fields.get("vector");
  if (!vector || !String(vector.type).startsWith(`FixedSizeList[${EMBEDDING_DIMENSION}]<Float32>`)) {
    throw new Error(`LanceDB vector column must be FixedSizeList<Float32> with ${EMBEDDING_DIMENSION} dimensions`);
  }
}

export function searchLimit(limit: number | undefined): number {
  return Math.min(20, Math.max(1, limit ?? 5));
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function splitSymbol(symbol: string): { owner: string; suffix: string } {
  const separator = symbol.search(/[:.]/);
  return separator < 0
    ? { owner: symbol, suffix: "" }
    : { owner: symbol.slice(0, separator), suffix: symbol.slice(separator) };
}

function parseAliases(value: unknown): string[] {
  try {
    const parsed = JSON.parse(stringValue(value)) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseDependencies(value: unknown): string[] {
  try {
    const parsed = JSON.parse(stringValue(value)) as { dependencies?: unknown };
    return Array.isArray(parsed.dependencies)
      ? parsed.dependencies.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parseHelpDatabase(value: unknown): string {
  try {
    const parsed = JSON.parse(stringValue(value)) as { database?: unknown };
    return stringValue(parsed.database);
  } catch {
    return "";
  }
}

function sanitizeVerbResult(result: MooVerbSearchResult): MooVerbSearchResult {
  return {
    ...result,
    symbol: result.symbol ? sanitizeText(result.symbol) : null,
    name: sanitizeText(result.name),
    args: sanitizeText(result.args),
    description: sanitizeText(result.description),
    code: sanitizeText(result.code),
    dependencies: result.dependencies.map(sanitizeText),
  };
}

function sanitizeHelpResult(result: MooHelpSearchResult): MooHelpSearchResult {
  return {
    ...result,
    topic: sanitizeText(result.topic),
    database_symbol: result.database_symbol ? sanitizeText(result.database_symbol) : null,
    text: sanitizeText(result.text),
  };
}

function sanitizeLookupResult(result: MooSymbolLookupResult): MooSymbolLookupResult {
  return {
    ...result,
    symbol: sanitizeText(result.symbol),
    aliases: result.aliases.map(sanitizeText),
    name: sanitizeText(result.name),
    args: sanitizeText(result.args),
    description: result.description === null ? null : sanitizeText(result.description),
    code: result.code === null ? null : sanitizeText(result.code),
  };
}

export function sanitizeText(value: string): string {
  return value
    .replace(/<local-object:[a-f0-9]+>/gi, "<unregistered-object>")
    .replace(/#-1(?!\d)/g, "$nothing")
    .replace(/#-2(?!\d)/g, "$ambiguous_match")
    .replace(/#-3(?!\d)/g, "$failed_match")
    .replace(/#-?\d+/g, "<unregistered-object>");
}

function publicSymbol(value: string): string | null {
  return value.startsWith("$") ? value : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function recordType(value: unknown): MooRecordType {
  if (value === "verb" || value === "object" || value === "property" || value === "help") return value;
  throw new Error(`Unexpected LanceDB record type: ${String(value)}`);
}
