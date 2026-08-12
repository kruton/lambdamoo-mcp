#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { MiniLmEmbedder } from "../../core/src/embeddings.js";
import { errorMessage } from "../../core/src/errors.js";
import { loadMcpServerConfiguration } from "./index.js";
import { LanceMooSearchRepository } from "./repository.js";
import { createMcpServer } from "./server.js";

let close: (() => Promise<void>) | undefined;

try {
  const configuration = loadMcpServerConfiguration();
  const repository = await LanceMooSearchRepository.open(
    configuration.databasePath,
    configuration.tableName,
    new MiniLmEmbedder(),
  );
  const server = createMcpServer(repository, writeDiagnostic);
  const transport = new StdioServerTransport();
  let closing: Promise<void> | undefined;
  close = () => closing ??= (async () => {
    await server.close();
    repository.close();
  })();

  process.once("SIGINT", () => { void shutdown(0); });
  process.once("SIGTERM", () => { void shutdown(0); });
  await server.connect(transport);
  await waitForStdinClose();
  await close();
} catch (error) {
  writeDiagnostic(`lambdamoo-mcp server failed: ${errorMessage(error)}`);
  process.exitCode = 1;
}

async function shutdown(exitCode: number): Promise<void> {
  try {
    await close?.();
  } catch (error) {
    writeDiagnostic(`lambdamoo-mcp shutdown failed: ${errorMessage(error)}`);
    exitCode = 1;
  } finally {
    process.exit(exitCode);
  }
}

function writeDiagnostic(message: string): void {
  process.stderr.write(`${message}\n`);
}

function waitForStdinClose(): Promise<void> {
  return new Promise((resolve) => {
    process.stdin.once("end", resolve);
    process.stdin.once("close", resolve);
  });
}
