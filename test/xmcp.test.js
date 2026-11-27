import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createXUseServer } from "../src/server.js";
import { XurlMcpClient } from "../src/xmcp-client.js";

let client;
let transport;
let server;
const calls = [];

const upstream = {
  async listTools() {
    return {
      tools: [
        { name: "get_users_mentions", description: "mentions", inputSchema: { type: "object" } },
        { name: "get_chat_conversations", description: "chats", inputSchema: { type: "object" } },
      ],
    };
  },
  async callTool(name, args) {
    calls.push({ name, args });
    if (name === "get_users_mentions") {
      return { data: [{ id: "post-1" }], meta: { result_count: 1 } };
    }
    if (name === "get_chat_conversations") {
      return { data: [{ id: "123-456", type: "direct" }], meta: { result_count: 1 } };
    }
    throw new Error("unexpected");
  },
};

before(async () => {
  const fakeXurl = {
    config: () => ({ app: "xurl", user: "example_user" }),
    version: async () => "xurl 1.3.4",
    authStatus: async () => "▸ xurl\n      oauth2: example_user\n",
    chatKeyStatus: async () => "local keys: none\nregistered: 0 key(s) on account",
    request: async () => ({ data: {} }),
  };
  server = createXUseServer({ client: fakeXurl, xmcp: upstream });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  transport = clientTransport;
  await server.connect(serverTransport);
  client = new Client({ name: "xmcp-integration-test", version: "1.0.0" });
  await client.connect(clientTransport);
});

after(async () => {
  await client?.close();
  await server?.close();
});

function parse(result) {
  return JSON.parse(result.content.find((item) => item.type === "text").text);
}

test("x_mcp lists the official read-only tools", async () => {
  const result = await client.callTool({ name: "x_mcp", arguments: { list_tools: true } });
  const body = parse(result);
  assert.equal(result.isError, false);
  assert.deepEqual(body.data.map((tool) => tool.name), [
    "get_users_mentions",
    "get_chat_conversations",
  ]);
});

test("x_mcp calls public X and X Chat through the official XMCP", async () => {
  for (const [tool, args] of [
    ["get_users_mentions", { id: "10001", max_results: 5 }],
    ["get_chat_conversations", { max_results: 10 }],
  ]) {
    const result = await client.callTool({ name: "x_mcp", arguments: { tool, arguments: args } });
    const body = parse(result);
    assert.equal(result.isError, false);
    assert.equal(body.meta.upstream_tool, tool);
  }
  assert.deepEqual(calls, [
    { name: "get_users_mentions", args: { id: "10001", max_results: 5 } },
    { name: "get_chat_conversations", args: { max_results: 10 } },
  ]);
});

test("x_mcp rejects names outside the read-only allowlist", async () => {
  const result = await client.callTool({
    name: "x_mcp",
    arguments: { tool: "send_chat_message", arguments: {} },
  });
  const body = parse(result);
  assert.equal(result.isError, true);
  assert.equal(body.error.code, "invalid_request");
});

test("official XMCP client parses JSON and classifies upstream enrollment errors", async () => {
  const success = new XurlMcpClient({
    env: {},
    clientFactory: () => ({
      connect: async () => {},
      close: async () => {},
      callTool: async () => ({
        isError: false,
        content: [{ type: "text", text: '{"data":[{"id":"1"}],"meta":{"result_count":1}}' }],
      }),
    }),
  });
  assert.deepEqual(await success.callTool("get_users_mentions", { id: "1" }), {
    data: [{ id: "1" }],
    meta: { result_count: 1 },
  });

  const blocked = new XurlMcpClient({
    env: {},
    clientFactory: () => ({
      connect: async () => {},
      close: async () => {},
      callTool: async () => ({
        isError: true,
        content: [{
          type: "text",
          text: '{"reason":"client-not-enrolled","title":"Client Forbidden"}',
        }],
      }),
    }),
  });
  await assert.rejects(
    blocked.callTool("get_users_public_keys", { ids: ["1"] }),
    (error) => error.code === "forbidden",
  );
});
