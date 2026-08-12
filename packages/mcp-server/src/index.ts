import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export * from "./presentation.js";
export * from "./primer.js";
export * from "./repository.js";
export * from "./server.js";

export const DEFAULT_LANCEDB_PATH = "build/core-moo-index.lancedb";
export const BUNDLED_LANCEDB_PATH = fileURLToPath(
  new URL("../../../data/core-moo-index.lancedb", import.meta.url),
);
export const LANCEDB_TABLE_NAME = "records";

export interface McpServerConfiguration {
  databasePath: string;
  tableName: string;
}

export function loadMcpServerConfiguration(environment: NodeJS.ProcessEnv = process.env): McpServerConfiguration {
  const defaultPath = existsSync(BUNDLED_LANCEDB_PATH)
    ? BUNDLED_LANCEDB_PATH
    : DEFAULT_LANCEDB_PATH;
  return {
    databasePath: resolve(environment.MOO_LANCEDB_PATH ?? defaultPath),
    tableName: environment.MOO_LANCEDB_TABLE ?? LANCEDB_TABLE_NAME,
  };
}
