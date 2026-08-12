# `@lambdamoo-mcp/server`

Runtime package for exposing the generated LanceDB artifact to coding agents over MCP stdio.

Tools:

- `search_moo_verbs` performs semantic verb search and returns structured implementation evidence.
- `search_moo_help` performs semantic help-topic search.
- `lookup_moo_symbol` resolves exact `$registry` symbols and aliases.

The `moo://syntax-primer` resource and server initialization instructions contain the same compact LambdaMOO syntax primer. Tool results link to that resource. Internal LanceDB row, object, parent, database, and vector identifiers are never part of MCP results.

Configuration:

- `MOO_LANCEDB_PATH` defaults to `build/core-moo-index.lancedb`
- `MOO_LANCEDB_TABLE` defaults to `records`

The npm release embeds `data/core-moo-index.lancedb`; installed copies use it automatically. `MOO_LANCEDB_PATH` remains available to select a separately built index.

Install and register the released CLI with an MCP client using the `lambdamoo-mcp` executable. No database-path environment variable is needed for the npm package.

From the repository, start the server with:

```sh
npm run mcp:start
```

After `npm run build`, a coding agent can launch the compiled server with:

```json
{
  "servers": {
    "lambdamoo": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/dist/packages/mcp-server/src/cli.js"],
      "env": {
        "MOO_LANCEDB_PATH": "${workspaceFolder}/build/core-moo-index.lancedb"
      }
    }
  }
}
```

The first semantic query may download `Xenova/all-MiniLM-L6-v2`; subsequent queries use the local Transformers cache. All diagnostics go to stderr because stdout is reserved for MCP JSON-RPC.
