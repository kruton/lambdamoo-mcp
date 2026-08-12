export const RECORD_TYPES = ["verb", "object", "property", "help"] as const;
export type MooRecordType = (typeof RECORD_TYPES)[number];

export interface RawMooRecord {
  id: string;
  name: string;
  type: MooRecordType;
  parent_id: string | null;
  args: string;
  code: string;
}

export interface AstMetadata {
  dependencies: string[];
  weighted_dependencies?: WeightedDependency[];
}

export type DependencyRelationship =
  | "same_object"
  | "ancestor"
  | "registry"
  | "builtin"
  | "explicit_object"
  | "dynamic";

export interface WeightedDependency {
  callee: string;
  receiver: string | null;
  verb: string;
  relationship: DependencyRelationship;
  receiver_kind: "this" | "registry" | "object_number" | "implicit" | "dynamic";
  target_object_id?: string;
  weight: number;
}

export interface ProcessedRecord {
  id: string;
  canonical_id: string;
  registry_aliases: string;
  database_id: string;
  type: MooRecordType;
  name: string;
  args: string;
  parent_id: string | null;
  code: string | null;
  ast_metadata: string | null;
  description: string | null;
  vector: number[];
}

export interface SemanticSearchQuery {
  query: string;
  limit?: number;
}

export interface MooVerbSearchResult {
  symbol: string | null;
  name: string;
  args: string;
  description: string;
  code: string;
  dependencies: string[];
  distance: number;
}

export interface MooHelpSearchResult {
  topic: string;
  database_symbol: string | null;
  text: string;
  distance: number;
}

export interface MooSymbolLookupResult {
  symbol: string;
  aliases: string[];
  type: MooRecordType;
  name: string;
  args: string;
  description: string | null;
  code: string | null;
}

export interface CacheEntry {
  llm_description: string;
  vector_embedding: number[];
  llm_provider: string;
  llm_model: string;
  llm_parameters: Record<string, string | number | boolean>;
  embedding_model: string;
  embedding_dimension: number;
  embedding_parameters: { pooling: "mean"; normalize: true };
  prompt_version: string;
  updated_at: string;
}

export interface EmbeddingsCache {
  version: 1;
  prompt_version: string;
  embedding_model: string;
  embedding_dimension: number;
  entries: Record<string, CacheEntry>;
}

export interface VerbDescriptionInput {
  name: string;
  args: string;
  code: string;
  docstring: string;
}

export interface DescriptionProvider {
  readonly name: string;
  readonly model: string;
  readonly parameters: Record<string, string | number | boolean>;
  describe(input: VerbDescriptionInput): Promise<string>;
}

export interface CacheProblem {
  id: string;
  sha256: string;
  reason: string;
}
