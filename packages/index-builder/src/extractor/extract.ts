import { createWriteStream } from "node:fs";
import { access, mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { createInterface } from "node:readline";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomBytes } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { emergencyInjection } from "./moo-code.js";
import { parseProtocolLine } from "./protocol.js";
import { PipelineError, errorMessage } from "@lambdamoo-mcp/core/errors";

export interface ExtractOptions {
  mooExecutable: string;
  database: string;
  output: string;
  startupTimeoutMs?: number;
  extractionTimeoutMs?: number;
  keepTemporary?: boolean;
}

export interface ExtractResult {
  records: number;
  output: string;
}

export async function extractMooDatabase(options: ExtractOptions): Promise<ExtractResult> {
  const executable = resolve(options.mooExecutable);
  const database = resolve(options.database);
  const output = resolve(options.output);
  if (database === output) throw new PipelineError("Input database and JSONL output must differ");
  await access(executable);
  await access(database);
  await mkdir(dirname(output), { recursive: true });

  const temporaryRoot = await mkdtemp(`${tmpdir()}/lambdamoo-mcp-`);
  const scratchDb = `${temporaryRoot}/scratch.db`;
  const logPath = `${temporaryRoot}/moo.log`;
  const temporaryJsonl = `${output}.${process.pid}.tmp`;
  const nonce = randomBytes(24).toString("hex");
  let child: ChildProcessWithoutNullStreams | undefined;
  let success = false;
  try {
    child = spawn(
      executable,
      ["-e", "-l", logPath, database, scratchDb, "-a", "127.0.0.1", "-p", "0"],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    let diagnostics = "";
    child.stdout.on("data", (chunk: Buffer) => { diagnostics = `${diagnostics}${chunk.toString("utf8")}`.slice(-32_768); });
    child.stderr.on("data", (chunk: Buffer) => { diagnostics = `${diagnostics}${chunk.toString("utf8")}`.slice(-32_768); });
    child.stdin.end(emergencyInjection(nonce));

    const port = await waitForReady(
      logPath,
      nonce,
      child,
      options.startupTimeoutMs ?? 30_000,
      () => diagnostics,
    );
    const records = await receiveDump(port, nonce, temporaryJsonl, options.extractionTimeoutMs ?? 30 * 60_000);
    await rename(temporaryJsonl, output);
    success = true;
    return { records, output };
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await Promise.race([new Promise((resolveExit) => child!.once("exit", resolveExit)), delay(2_000)]);
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
    if (!success) await rm(temporaryJsonl, { force: true });
    if (!options.keepTemporary) await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function waitForReady(
  logPath: string,
  nonce: string,
  child: ChildProcessWithoutNullStreams,
  timeoutMs: number,
  diagnostics: () => string,
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  const readyPattern = new RegExp(`MOO_RAG_READY ${nonce} ([0-9]+)`);
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new PipelineError(`LambdaMOO exited before extraction was ready\n${diagnostics()}`);
    }
    try {
      const log = await readFile(logPath, "utf8");
      const injectionError = log.match(new RegExp(`MOO_RAG_INJECT_ERROR ${nonce} ([^\\n]+)`));
      if (injectionError) throw new PipelineError(`LambdaMOO rejected extraction code: ${injectionError[1]}`);
      const ready = log.match(readyPattern);
      if (ready?.[1]) return Number(ready[1]);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await delay(100);
  }
  throw new PipelineError(`Timed out waiting for LambdaMOO extraction listener\n${diagnostics()}`);
}

async function receiveDump(port: number, nonce: string, output: string, timeoutMs: number): Promise<number> {
  const socket = createConnection({ host: "127.0.0.1", port });
  socket.setTimeout(timeoutMs);
  const writer = createWriteStream(output, { encoding: "utf8", flags: "wx" });
  const lines = createInterface({ input: socket, crlfDelay: Infinity });
  let began = false;
  let ended = false;
  let recordCount = 0;
  let protocolLine = 0;
  const socketError = new Promise<never>((_resolve, reject) => {
    socket.once("error", reject);
    socket.once("timeout", () => reject(new PipelineError("Timed out receiving LambdaMOO dump")));
  });
  const writerError = new Promise<never>((_resolve, reject) => {
    writer.on("error", reject);
  });
  socket.once("connect", () => socket.write(`DUMP ${nonce}\n`));
  try {
    await Promise.race([
      (async () => {
        for await (const line of lines) {
          protocolLine += 1;
          if (line.trim() === "") continue;
          const frame = parseProtocolLine(line, protocolLine);
          if ("_moo_rag" in frame) {
            if (frame._moo_rag === "begin") {
              if (began || recordCount > 0) throw new PipelineError("Duplicate or misplaced dump begin frame");
              began = true;
            } else {
              if (!began || ended) throw new PipelineError("Misplaced dump end frame");
              if (frame.records !== recordCount) {
                throw new PipelineError(`Dump declared ${frame.records} records but sent ${recordCount}`);
              }
              ended = true;
            }
            continue;
          }
          if (!began || ended) throw new PipelineError("Record arrived outside dump framing");
          if (!writer.write(`${JSON.stringify(frame)}\n`)) await new Promise<void>((resolveDrain) => writer.once("drain", resolveDrain));
          recordCount += 1;
        }
      })(),
      socketError,
      writerError,
    ]);
    if (!began || !ended) throw new PipelineError("LambdaMOO dump ended without complete framing");
    await new Promise<void>((resolveClose, reject) => writer.end((error?: Error | null) => error ? reject(error) : resolveClose()));
    return recordCount;
  } catch (error) {
    writer.destroy();
    throw new PipelineError(`Failed to receive LambdaMOO dump: ${errorMessage(error)}`, { cause: error });
  } finally {
    try {
      lines.close();
    } catch {
      // The socket may already have closed the readline interface.
    }
    socket.destroy();
  }
}
