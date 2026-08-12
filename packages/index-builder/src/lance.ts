import { access, mkdir, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { Field, FixedSizeList, Float32, Schema, Utf8 } from "apache-arrow";
import { MooAstParser } from "./ast.js";
import { validateCacheEntry } from "./cache.js";
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_TABLE,
  EMBEDDING_DIMENSION,
} from "@lambdamoo-mcp/core/constants";
import { deterministicDescription } from "./descriptions.js";
import { loadDependencyGraph, type MooDependencyGraph } from "@lambdamoo-mcp/core/dependencies";
import { loadPublicIdentities, type PublicIdentityMap } from "@lambdamoo-mcp/core/identities";
import type { Embedder } from "@lambdamoo-mcp/core/embeddings";
import { PipelineError } from "@lambdamoo-mcp/core/errors";
import { codeSha256 } from "@lambdamoo-mcp/core/hash";
import { streamJsonl } from "@lambdamoo-mcp/core/jsonl";
import type { EmbeddingsCache, ProcessedRecord, RawMooRecord } from "@lambdamoo-mcp/core/types";

export const LANCE_SCHEMA = new Schema([
  new Field("id", new Utf8(), false),
  new Field("canonical_id", new Utf8(), false),
  new Field("registry_aliases", new Utf8(), false),
  new Field("database_id", new Utf8(), false),
  new Field("type", new Utf8(), false),
  new Field("name", new Utf8(), false),
  new Field("args", new Utf8(), false),
  new Field("parent_id", new Utf8(), true),
  new Field("code", new Utf8(), true),
  new Field("ast_metadata", new Utf8(), true),
  new Field("description", new Utf8(), true),
  new Field(
    "vector",
    new FixedSizeList(EMBEDDING_DIMENSION, new Field("item", new Float32(), false)),
    false,
  ),
]);

export interface CompileIndexOptions {
  inputPath: string;
  outputPath: string;
  cache: EmbeddingsCache;
  embedder: Embedder;
  batchSize?: number;
  tableName?: string;
}

export async function compileLanceIndex(options: CompileIndexOptions): Promise<number> {
  const output = resolve(options.outputPath);
  const temporary = `${output}.tmp-${process.pid}`;
  const backup = `${output}.backup-${process.pid}`;
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const dependencyGraph = await loadDependencyGraph(options.inputPath);
  const identities = await loadPublicIdentities(options.inputPath);
  await mkdir(dirname(output), { recursive: true });
  await rm(temporary, { recursive: true, force: true });
  await rm(backup, { recursive: true, force: true });

  const db = await lancedb.connect(temporary);
  const table = await db.createEmptyTable(options.tableName ?? DEFAULT_TABLE, LANCE_SCHEMA);
  const parser = new MooAstParser();
  const batch: ProcessedRecord[] = [];
  let count = 0;
  try {
    for await (const record of streamJsonl(options.inputPath)) {
      batch.push(await processRecord(record, options.cache, options.embedder, parser, dependencyGraph, identities));
      if (batch.length >= batchSize) {
        await addBatch(table, batch);
        count += batch.length;
        batch.length = 0;
      }
    }
    if (batch.length > 0) {
      await addBatch(table, batch);
      count += batch.length;
    }
    table.close();
    db.close();

    const hadOutput = await exists(output);
    if (hadOutput) await rename(output, backup);
    try {
      await rename(temporary, output);
      if (hadOutput) await rm(backup, { recursive: true, force: true });
    } catch (error) {
      if (hadOutput && !(await exists(output)) && await exists(backup)) await rename(backup, output);
      throw error;
    }
    return count;
  } catch (error) {
    table.close();
    db.close();
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

async function processRecord(
  record: RawMooRecord,
  cache: EmbeddingsCache,
  embedder: Embedder,
  parser: MooAstParser,
  dependencyGraph: MooDependencyGraph,
  identities: PublicIdentityMap,
): Promise<ProcessedRecord> {
  if (record.type === "verb") {
    const sha256 = codeSha256(record.code);
    const entry = cache.entries[sha256];
    const problem = validateCacheEntry(entry);
    if (problem || !entry) throw new PipelineError(`${record.id} (${sha256}): ${problem ?? "invalid cache entry"}`);
    if (!record.parent_id) throw new PipelineError(`${record.id}: verb record has no owning object`);
    const ast = parser.enrich(record.code, record.id);
    ast.metadata.weighted_dependencies = dependencyGraph.resolve(ast.metadata.dependencies, record.parent_id);
    const publicMetadata = identities.publicAstMetadata(ast.metadata);
    return {
      id: identities.recordId(record.id),
      canonical_id: identities.canonicalId(record),
      registry_aliases: JSON.stringify(identities.aliases(record.parent_id)),
      database_id: identities.databaseId,
      type: record.type,
      name: identities.sanitizeText(record.name),
      args: identities.sanitizeText(record.args),
      parent_id: identities.recordId(record.parent_id),
      code: ast.semanticCode ? identities.sanitizeText(ast.semanticCode) : null,
      ast_metadata: JSON.stringify(publicMetadata),
      description: identities.sanitizeText(entry.llm_description),
      vector: entry.vector_embedding,
    };
  }
  const description = deterministicDescription(record);
  const ownerId = record.type === "object" ? record.id : record.parent_id;
  return {
    id: identities.recordId(record.id),
    canonical_id: identities.canonicalId(record),
    registry_aliases: JSON.stringify(ownerId ? identities.aliases(ownerId) : []),
    database_id: identities.databaseId,
    type: record.type,
    name: identities.sanitizeText(record.name),
    args: identities.sanitizeText(record.args),
    parent_id: record.parent_id ? identities.recordId(record.parent_id) : null,
    code: record.code ? identities.sanitizeText(record.code) : null,
    ast_metadata: record.type === "help"
      ? JSON.stringify({ kind: "help_topic", database: identities.sanitizeText(record.args) })
      : null,
    description: identities.sanitizeText(description),
    vector: await embedder.embed(description),
  };
}

async function addBatch(table: lancedb.Table, rows: ProcessedRecord[]): Promise<void> {
  const arrow = lancedb.makeArrowTable(rows as unknown as Array<Record<string, unknown>>, { schema: LANCE_SCHEMA });
  await table.add(arrow);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
