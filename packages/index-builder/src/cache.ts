import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  CACHE_VERSION,
  EMBEDDING_DIMENSION,
  EMBEDDING_MODEL,
  PROMPT_VERSION,
} from "@lambdamoo-mcp/core/constants";
import { PipelineError } from "@lambdamoo-mcp/core/errors";
import type { CacheEntry, EmbeddingsCache } from "@lambdamoo-mcp/core/types";

export function emptyCache(): EmbeddingsCache {
  return {
    version: CACHE_VERSION,
    prompt_version: PROMPT_VERSION,
    embedding_model: EMBEDDING_MODEL,
    embedding_dimension: EMBEDDING_DIMENSION,
    entries: {},
  };
}

export async function loadCache(path: string): Promise<EmbeddingsCache> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyCache();
    throw error;
  }
  let value: unknown;
  try {
    value = path.endsWith(".jsonl") ? parseCacheJsonl(text, path) : JSON.parse(text);
  } catch (error) {
    throw new PipelineError(`${path}: invalid cache JSON`, { cause: error });
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new PipelineError(`${path}: cache root must be an object`);
  }
  const cache = value as Partial<EmbeddingsCache>;
  if (cache.version !== CACHE_VERSION || cache.entries === null || typeof cache.entries !== "object") {
    throw new PipelineError(`${path}: unsupported cache format`);
  }
  return cache as EmbeddingsCache;
}

export function validateCacheEntry(entry: CacheEntry | undefined): string | null {
  if (!entry) return "missing cache entry";
  if (typeof entry.llm_description !== "string" || entry.llm_description.trim() === "") {
    return "description is empty";
  }
  if (entry.prompt_version !== PROMPT_VERSION) return "prompt version is stale";
  if (entry.llm_parameters === null || typeof entry.llm_parameters !== "object" || Array.isArray(entry.llm_parameters)) {
    return "LLM generation parameters are missing";
  }
  if (entry.embedding_model !== EMBEDDING_MODEL) return "embedding model is stale";
  if (entry.embedding_dimension !== EMBEDDING_DIMENSION) return "embedding dimension metadata is invalid";
  if (entry.embedding_parameters?.pooling !== "mean" || entry.embedding_parameters.normalize !== true) {
    return "embedding generation parameters are missing or invalid";
  }
  if (!Array.isArray(entry.vector_embedding) || entry.vector_embedding.length !== EMBEDDING_DIMENSION) {
    return `embedding must contain ${EMBEDDING_DIMENSION} values`;
  }
  if (entry.vector_embedding.some((number) => !Number.isFinite(number))) {
    return "embedding contains non-finite values";
  }
  return null;
}

export async function saveCacheAtomic(path: string, cache: EmbeddingsCache): Promise<void> {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${process.pid}.tmp`;
  const metadata = {
    _type: "metadata",
    version: cache.version,
    prompt_version: cache.prompt_version,
    embedding_model: cache.embedding_model,
    embedding_dimension: cache.embedding_dimension,
  };
  const lines = [JSON.stringify(metadata)];
  for (const [sha256, entry] of Object.entries(cache.entries).sort(([left], [right]) => left.localeCompare(right))) {
    lines.push(JSON.stringify({ _type: "entry", sha256, ...entry }));
  }
  await writeFile(temporary, `${lines.join("\n")}\n`, "utf8");
  await rename(temporary, absolute);
}

function parseCacheJsonl(text: string, path: string): EmbeddingsCache {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  if (lines.length === 0) return emptyCache();
  const parseLine = (line: string, index: number): Record<string, unknown> => {
    const value = JSON.parse(line) as unknown;
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new PipelineError(`${path}:${index + 1}: cache record must be an object`);
    }
    return value as Record<string, unknown>;
  };
  const metadata = parseLine(lines[0]!, 0);
  if (metadata._type !== "metadata") throw new PipelineError(`${path}: first record must be cache metadata`);
  const cache: EmbeddingsCache = {
    version: metadata.version as EmbeddingsCache["version"],
    prompt_version: metadata.prompt_version as string,
    embedding_model: metadata.embedding_model as string,
    embedding_dimension: metadata.embedding_dimension as number,
    entries: {},
  };
  for (let index = 1; index < lines.length; index += 1) {
    const row = parseLine(lines[index]!, index);
    if (row._type !== "entry" || typeof row.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(row.sha256)) {
      throw new PipelineError(`${path}:${index + 1}: invalid cache entry record`);
    }
    const { _type: _ignoredType, sha256, ...entry } = row;
    cache.entries[sha256 as string] = entry as unknown as CacheEntry;
  }
  return cache;
}
