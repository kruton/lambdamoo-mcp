import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import {
  DEFAULT_LANCEDB_PATH,
  LANCEDB_TABLE_NAME,
  loadMcpServerConfiguration,
} from "../src/index.js";

test("loads default and environment MCP server configuration", () => {
  assert.deepEqual(loadMcpServerConfiguration({}), {
    databasePath: resolve(DEFAULT_LANCEDB_PATH),
    tableName: LANCEDB_TABLE_NAME,
  });
  assert.deepEqual(loadMcpServerConfiguration({
    MOO_LANCEDB_PATH: "fixtures/custom.lancedb",
    MOO_LANCEDB_TABLE: "custom_records",
  }), {
    databasePath: resolve("fixtures/custom.lancedb"),
    tableName: "custom_records",
  });
});
