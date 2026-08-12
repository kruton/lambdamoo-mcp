import { codeSha256 } from "@lambdamoo-mcp/core/hash";
import { streamJsonl } from "@lambdamoo-mcp/core/jsonl";
import { validateCacheEntry } from "./cache.js";
import { EMBEDDING_DIMENSION, EMBEDDING_MODEL, PROMPT_VERSION } from "@lambdamoo-mcp/core/constants";
import { MooAstParser } from "./ast.js";
import type {
  CacheProblem,
  DescriptionProvider,
  EmbeddingsCache,
  RawMooRecord,
} from "@lambdamoo-mcp/core/types";
import type { Embedder } from "@lambdamoo-mcp/core/embeddings";

export async function checkDescriptionCache(inputPath: string, cache: EmbeddingsCache): Promise<CacheProblem[]> {
  const problems: CacheProblem[] = [];
  for await (const record of streamJsonl(inputPath)) {
    if (record.type !== "verb") continue;
    const sha256 = codeSha256(record.code);
    const reason = validateCacheEntry(cache.entries[sha256]);
    if (reason) problems.push({ id: record.id, sha256, reason });
  }
  return problems;
}

export interface UpdateDescriptionsOptions {
  inputPath: string;
  cache: EmbeddingsCache;
  provider: DescriptionProvider;
  embedder: Embedder;
  refresh: boolean;
  checkpoint: (cache: EmbeddingsCache) => Promise<void>;
  checkpointEvery?: number;
  concurrency?: number;
}

export async function updateDescriptions(options: UpdateDescriptionsOptions): Promise<{ updated: number; reused: number }> {
  const parser = new MooAstParser();
  let updated = 0;
  let reused = 0;
  const checkpointEvery = options.checkpointEvery ?? 25;
  const concurrency = options.concurrency ?? 4;
  const pending = new Set<Promise<void>>();
  let lastCheckpoint = 0;
  try {
    for await (const record of streamJsonl(options.inputPath)) {
      if (record.type !== "verb") continue;
      const sha256 = codeSha256(record.code);
      const existing = options.cache.entries[sha256];
      if (!options.refresh && validateCacheEntry(existing) === null) {
        reused += 1;
        continue;
      }
      const task = generateEntry(record, sha256, existing, options, parser).then(() => { updated += 1; });
      pending.add(task);
      void task.then(
        () => pending.delete(task),
        () => pending.delete(task),
      );
      if (pending.size >= concurrency) await Promise.race(pending);
      if (updated - lastCheckpoint >= checkpointEvery) {
        await options.checkpoint(options.cache);
        lastCheckpoint = updated;
      }
    }
    await Promise.all(pending);
  } finally {
    await Promise.allSettled(pending);
    if (updated > lastCheckpoint) await options.checkpoint(options.cache);
  }
  return { updated, reused };
}

async function generateEntry(
  record: RawMooRecord,
  sha256: string,
  existing: EmbeddingsCache["entries"][string] | undefined,
  options: UpdateDescriptionsOptions,
  parser: MooAstParser,
): Promise<void> {
  let description: string;
  if (
    !options.refresh &&
    existing?.llm_description.trim() &&
    existing.prompt_version === PROMPT_VERSION &&
    existing.llm_parameters &&
    existing.embedding_parameters
  ) {
    description = existing.llm_description;
  } else {
    const ast = parser.enrich(record.code, record.id);
    description = await options.provider.describe({
      name: record.name,
      args: record.args,
      code: record.code,
      docstring: ast.docstring,
    });
  }
  const vector = await options.embedder.embed(description);
  options.cache.entries[sha256] = {
    llm_description: description,
    vector_embedding: vector,
    llm_provider: options.provider.name,
    llm_model: options.provider.model,
    llm_parameters: { ...options.provider.parameters },
    embedding_model: EMBEDDING_MODEL,
    embedding_dimension: EMBEDDING_DIMENSION,
    embedding_parameters: { pooling: "mean", normalize: true },
    prompt_version: PROMPT_VERSION,
    updated_at: new Date().toISOString(),
  };
}

export function deterministicDescription(record: RawMooRecord): string {
  const parent = record.parent_id ?? "no parent";
  if (record.type === "object") {
    return `Represents the LambdaMOO object ${record.name} (${record.id}) with ${parent}. Stores object metadata used to locate its properties and verbs.`;
  }
  if (record.type === "help") {
    return `${record.name}\n${record.code}`;
  }
  return `Defines the LambdaMOO property ${record.name} on ${parent}. Stores its public metadata and serialized value for semantic lookup.`;
}
