import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { MooSearchRepository } from "../src/repository.js";
import { LAMBDAMOO_SYNTAX_PRIMER, SYNTAX_PRIMER_URI } from "../src/primer.js";
import { createMcpServer } from "../src/server.js";

const repository: MooSearchRepository = {
  async searchVerbs() {
    return [{ symbol: "$thing:moveto", name: "moveto", args: '{"this", "none", "this"}', description: "Moves this object.", code: "return 1;", dependencies: ["$object_utils:isa"], distance: 0.1 }];
  },
  async searchHelp() {
    return [{ topic: "verbs", database_symbol: "$help", text: "Help on verbs.", distance: 0.2 }];
  },
  async lookupSymbol() {
    return [{ symbol: "$thing", aliases: ["$thing"], type: "object", name: "Generic Thing", args: "{}", description: "An object.", code: null }];
  },
  close() {},
};

test("serves tools, structured results, instructions, and the primer resource", async () => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer(repository);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    assert.equal(client.getInstructions(), LAMBDAMOO_SYNTAX_PRIMER);

    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), ["lookup_moo_symbol", "search_moo_help", "search_moo_verbs"]);

    const resources = await client.listResources();
    assert.equal(resources.resources[0]?.uri, SYNTAX_PRIMER_URI);
    const primer = await client.readResource({ uri: SYNTAX_PRIMER_URI });
    assert.equal(primer.contents[0] && "text" in primer.contents[0] ? primer.contents[0].text : undefined, LAMBDAMOO_SYNTAX_PRIMER);

    const result = await client.callTool({ name: "search_moo_verbs", arguments: { query: "move object" } });
    assert.equal(result.isError, undefined);
    assert.deepEqual(result.structuredContent, { results: await repository.searchVerbs({ query: "ignored" }) });
    const content = result.content as Array<{ type: string; uri?: string }>;
    assert.ok(content.some((item) => item.type === "resource_link" && item.uri === SYNTAX_PRIMER_URI));
    const serialized = JSON.stringify(result);
    for (const forbidden of ["private-row-id", "private-parent-id", "private-database-id", '"vector"']) {
      assert.equal(serialized.includes(forbidden), false);
    }
  } finally {
    await client.close();
    await server.close();
  }
});
