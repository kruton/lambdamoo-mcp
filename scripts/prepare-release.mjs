import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const tag = process.argv[2];
if (!tag) throw new Error("Usage: npm run release:stage -- vMAJOR.MINOR.PATCH");

const match = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/.exec(tag);
if (!match?.[1]) throw new Error(`Release tag ${JSON.stringify(tag)} is not a supported semantic version tag`);
const version = match[1];

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "release/npm");
const assets = resolve(root, "release/assets");
const compiledMcp = resolve(root, "dist/packages/mcp-server/src");
const compiledCore = resolve(root, "dist/packages/core/src");
const index = resolve(root, "build/core-moo-index.lancedb");

await rm(resolve(root, "release"), { recursive: true, force: true });
await mkdir(resolve(output, "packages"), { recursive: true });
await mkdir(resolve(output, "data"), { recursive: true });
await mkdir(assets, { recursive: true });
await cp(compiledMcp, resolve(output, "packages/mcp-server/src"), { recursive: true });
await cp(compiledCore, resolve(output, "packages/core/src"), { recursive: true });
await cp(index, resolve(output, "data/core-moo-index.lancedb"), { recursive: true });
await cp(resolve(root, "packages/mcp-server/README.md"), resolve(output, "README.md"));

const repository = process.env.GITHUB_REPOSITORY;
const manifest = {
  name: "@lambdamoo-mcp/server",
  version,
  description: "Offline-first LambdaMOO semantic search MCP server with a bundled LanceDB index",
  type: "module",
  bin: {
    "lambdamoo-mcp": "packages/mcp-server/src/cli.js",
  },
  exports: {
    ".": "./packages/mcp-server/src/index.js",
  },
  files: ["packages", "data", "README.md"],
  engines: { node: ">=22" },
  dependencies: {
    "@lancedb/lancedb": "^0.30.0",
    "@modelcontextprotocol/sdk": "1.30.0",
    "@xenova/transformers": "^2.17.2",
    zod: "4.2.0",
  },
  publishConfig: { access: "public" },
  ...(repository ? {
    repository: {
      type: "git",
      url: `git+https://github.com/${repository}.git`,
    },
    bugs: { url: `https://github.com/${repository}/issues` },
    homepage: `https://github.com/${repository}#readme`,
  } : {}),
};

await writeFile(resolve(output, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const cli = resolve(output, manifest.bin["lambdamoo-mcp"]);
const cliSource = await readFile(cli, "utf8");
if (!cliSource.startsWith("#!/usr/bin/env node")) {
  throw new Error(`Compiled CLI at ${cli} is missing its executable shebang`);
}
console.log(`Staged ${manifest.name}@${version} with its bundled LanceDB index in ${output}`);
