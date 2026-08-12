# LambdaMOO MCP server

This repository provides an MCP server that assists coding agents with LambdaMOO programming. It builds an offline-first LanceDB index from a LambdaMOO core database; database extraction and LLM description generation are developer operations, while CI validates checked-in inputs, computes deterministic local embeddings where needed, and packages the server and index.

## Workspace layout

This is an npm-workspaces monorepo:

- `packages/core` contains shared record contracts, canonical identity rules, dependency weighting, JSONL ingestion, and MiniLM query embeddings.
- `packages/index-builder` contains emergency extraction, Tree-sitter enrichment, description/cache maintenance, and LanceDB compilation.
- `packages/mcp-server` serves the artifact to coding agents over MCP stdio with semantic verb search, help search, canonical-symbol lookup, and a compact LambdaMOO syntax primer.

Root npm scripts remain the stable developer and CI interface.

## Prerequisites

- Node.js 22 or newer
- A LambdaMOO executable named `moo` on `PATH` (or supplied with `--moo`)
- An internet connection the first time `Xenova/all-MiniLM-L6-v2` is downloaded
- For offline description maintenance, either `OPENAI_API_KEY` or a local Ollama server

Install dependencies with `npm ci`.

## Refreshing a core database

Extraction always runs against a disposable output database. It starts LambdaMOO in emergency mode, installs `#0:server_started` with `.program`, opens a one-shot ephemeral listener, authenticates with a random nonce, streams JSONL, and shuts down. The source database is never used as the checkpoint destination.

```sh
npm run extract:moo -- \
  --output moo_extract.jsonl
```

Extraction defaults to the checked-in `data/waterpoint-core.db`. Use `--database` only to test another core. Note that only Waterpoint core has been tested so far and other cores may run into issues.

The extraction contains objects, verbs, readable properties, and help topics. Stable IDs use `object:#N`, `verb:#N:index`, `property:#N:name`, and `help:#N:topic`. For `$generic_help` and all descendants, the dumper verifies that the effective `find_topics` and `get_topic` verbs are declared `this none this` before calling them.

Currently Waterpoint core is targeted which returns JText in help articles. This is flattened into searchable text and tagged as a `help_topic` with its source database identity. Retrieval clients can therefore distinguish programmer, builtin, wizard, and user-command databases rather than treating all help as code guidance. MOO strings travel through `encode_binary`, and Node validates framing and record counts before atomically replacing the output.

Generate descriptions and MiniLM embeddings locally, then check both `moo_extract.jsonl` and `embeddings_cache.jsonl` into the repository:

```sh
OPENAI_API_KEY=... npm run descriptions:update -- --provider openai --concurrency 4
```

The default OpenAI model is `gpt-5.6-luna`. Ollama is also supported:

```sh
npm run descriptions:update -- --provider ollama --model qwen3.6:27b --concurrency 4
```

`npm run refresh:core` combines extraction from the checked-in database, description maintenance, and a local index build. Both description-writing commands refuse to run when `CI=true`.

## CI and local verification

```sh
npm run typecheck
npm test
npm run ast:check
npm run descriptions:check
npm run build:index
```

`ast:check` strictly parses every verb with Tree-sitter and aborts on the first error with the verb ID and source location. `descriptions:check` computes SHA-256 over each verb's raw source and fails when an entry is missing, stale, malformed, or has the wrong 384-element embedding. `build:index` repeats both checks while compiling. None of these commands invokes an LLM.

Every cache entry records the LLM provider, exact model, generation parameters, prompt version, embedding model, pooling/normalization settings, dimension, and generation timestamp. Use `--refresh` with `descriptions:update` to regenerate all entries with a stronger model; without it, valid content-addressed entries are reused.

The cache is sorted JSONL: one metadata record followed by one record per SHA-256. Duplicate hashes are resolved using the last record when reading, and migration/compaction prunes hashes no longer present in the current extract.

The output is `build/core-moo-index.lancedb`, containing the `records` table under a strict Arrow schema. CI uploads that directory as the `core-moo-index` artifact.

## Continuous integration and releases

Pull requests and pushes to `main` run typechecking, tests, strict AST validation, description-cache validation, and a complete LanceDB build. Pushing a semantic version tag such as `v1.2.3` repeats those checks and creates a GitHub Release containing both the standalone compressed LanceDB and an installable `@lambdamoo-mcp/server` npm tarball. The npm tarball embeds the approximately 13 MB index so the installed MCP server needs no separate artifact download.

## Coding-agent MCP server

Build the index, then run the local stdio server:

```sh
npm run build:index
npm run mcp:start
```

Set `MOO_LANCEDB_PATH` to use an artifact outside the default `build/core-moo-index.lancedb`. The server exposes `search_moo_verbs`, `search_moo_help`, `lookup_moo_symbol`, and the `moo://syntax-primer` resource. Server instructions carry the same sub-300-word syntax primer so clients that honor MCP instructions receive LambdaMOO-specific guidance before code generation. See `packages/mcp-server/README.md` for a VS Code-compatible stdio configuration.

## Tree-sitter queries

The installed LambdaMOO grammar names string nodes `string`, verb invocations `verb_call`, and built-in invocations `call_expression`. The executable queries are exported from `packages/index-builder/src/ast.ts`:

```scheme
(source_file
  .
  (statement
    (expression_statement
      (expression
        (string) @docstring)))+)
```

```scheme
[
  (verb_call)
  (call_expression)
] @dependency
```

The leading-dot anchor and repetition ensure only consecutive bare strings at the beginning of a verb become its docstring.

All bare-string statements are considered LambdaMOO comments. The raw source remains unchanged for SHA-256 cache identity, while the LanceDB `code` field removes every bare-string statement. Consecutive leading comments remain available separately as the verb docstring used during description generation.

Dependency metadata contains both the original flat call list and resolved weighted edges. Calls through `this` receive the strongest relationship weight, followed by calls resolved to an ancestor, `$` registry paths (including nested paths such as `$local.json`), built-ins, literal object-number receivers, and dynamic receivers. Registry paths are resolved through `#0` properties and subsequent object-valued properties; the symbolic receiver is retained alongside the target object ID.

Database-local object numbers are build-only locators and are not emitted by LanceDB. Public record IDs and parent links are opaque hashes. `canonical_id` uses the preferred `$` registry symbol where available, `registry_aliases` retains every direct symbol, and unregistered objects use deterministic database-scoped `<local-object:…>` identities. Numeric references inside code, descriptions, property values, help metadata, and dependency edges are rewritten to the corresponding public identity.
