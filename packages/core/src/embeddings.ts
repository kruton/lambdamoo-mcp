import { EMBEDDING_DIMENSION, EMBEDDING_MODEL } from "./constants.js";
import { PipelineError } from "./errors.js";

interface TensorLike {
  tolist(): unknown;
}

type FeatureExtractor = (
  text: string | string[],
  options: { pooling: "mean"; normalize: true },
) => Promise<TensorLike>;

export interface Embedder {
  readonly model: string;
  readonly dimension: number;
  embed(text: string): Promise<number[]>;
}

export class MiniLmEmbedder implements Embedder {
  readonly model = EMBEDDING_MODEL;
  readonly dimension = EMBEDDING_DIMENSION;
  #pipeline?: Promise<FeatureExtractor>;

  async embed(text: string): Promise<number[]> {
    const extractor = await (this.#pipeline ??= this.#load());
    const output = await extractor(text, { pooling: "mean", normalize: true });
    const raw = output.tolist();
    const vector = Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : raw;
    if (!Array.isArray(vector) || vector.length !== this.dimension || vector.some((item) => !Number.isFinite(item))) {
      throw new PipelineError(`MiniLM returned an invalid ${this.dimension}-dimensional embedding`);
    }
    return vector as number[];
  }

  async #load(): Promise<FeatureExtractor> {
    const transformers = await import("@xenova/transformers");
    return transformers.pipeline("feature-extraction", this.model) as Promise<FeatureExtractor>;
  }
}
