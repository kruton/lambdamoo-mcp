# LambdaMOO MCP

Give your coding agent searchable access to LambdaMOO verbs, help topics, and
language guidance.

The package runs locally as a Model Context Protocol (MCP) server. It includes
its LambdaMOO search index, needs no API key, and does not require you to clone
this repository or install LambdaMOO.

## Requirements

- Node.js 22 or newer
- An MCP-compatible coding agent
- An internet connection for the first semantic search, when the embedding
  model is downloaded and cached locally

## Install for your coding agent

You do not need to install the package globally. Register this command with
your MCP client:

```sh
npx -y @lambdamoo-mcp/server
```

Choose the command for your agent below, then restart the agent or begin a new
session.

### Codex

```sh
codex mcp add lambdamoo -- npx -y @lambdamoo-mcp/server
```

Confirm the server was added:

```sh
codex mcp list
```

### Claude Code

Install for your user account so it is available in every project:

```sh
claude mcp add --scope user lambdamoo -- npx -y @lambdamoo-mcp/server
```

Confirm the server was added:

```sh
claude mcp list
```

### Gemini CLI

Install for your user account so it is available in every project:

```sh
gemini mcp add --scope user lambdamoo npx -y @lambdamoo-mcp/server
```

Confirm the server was added:

```sh
gemini mcp list
```

### Other MCP clients

Add a stdio server to your client's MCP configuration. Clients commonly use
one of the following top-level keys:

```json
{
  "mcpServers": {
    "lambdamoo": {
      "command": "npx",
      "args": ["-y", "@lambdamoo-mcp/server"]
    }
  }
}
```

VS Code uses `servers` instead:

```json
{
  "servers": {
    "lambdamoo": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@lambdamoo-mcp/server"]
    }
  }
}
```

See your client's documentation for the location and exact shape of its MCP
configuration file.

> `npx skills` installs agent skills, which are instruction packages. This is
> an MCP server, so it is launched directly with `npx` as shown above.

## Use it

Ask your agent LambdaMOO questions naturally. For example:

- "How does LambdaMOO command parsing work? Find relevant core verbs."
- "Look up `$player` and explain its useful verbs."
- "Find LambdaMOO help about property permissions."
- "Write this verb using the LambdaMOO syntax primer and core conventions."

The server gives the agent these capabilities:

- Semantic search over LambdaMOO verbs
- Semantic search over LambdaMOO help topics
- Exact lookup of `$registry` symbols and aliases
- LambdaMOO syntax checking with precise diagnostics
- LambdaMOO source formatting
- A compact LambdaMOO syntax primer

The bundled index currently covers the Waterpoint core database.

## Troubleshooting

**The first search is slow**

The first semantic search downloads `Xenova/all-MiniLM-L6-v2`. Later searches
reuse the locally cached model.

**`npx` or the server will not start**

Check that Node.js 22 or newer is installed:

```sh
node --version
```

You can also run the server command directly. It should remain running and wait
for MCP messages; press Ctrl+C to stop it.

```sh
npx -y @lambdamoo-mcp/server
```

**The agent does not see the tools**

Restart the agent after adding the server, then use its MCP list or status
command to confirm that `lambdamoo` is enabled.

## Optional: use a custom index

Most users should use the bundled index. To select a separately built LanceDB
index, set `MOO_LANCEDB_PATH` in the MCP server configuration. The table name
defaults to `records` and can be changed with `MOO_LANCEDB_TABLE`.

Development, index-building, and release documentation is available in the
[GitHub repository](https://github.com/kruton/lambdamoo-mcp).
