import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { EXPECTED_TOOL_NAMES } from "../src/tool-definitions.js";

const serverPath = fileURLToPath(new URL("../bin/x-use-mcp.js", import.meta.url));
const fakeXurl = fileURLToPath(new URL("../fixtures/fake-xurl.js", import.meta.url));

let client;
let transport;

before(async () => {
  transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: {
      ...process.env,
      X_USE_XURL_BIN: fakeXurl,
      X_USE_APP: "xurl",
      X_USE_USER: "example_user",
    },
    stderr: "pipe",
  });
  client = new Client({ name: "x-use-contract-test", version: "1.0.0" });
  await client.connect(transport);
});

after(async () => {
  await transport?.close();
});

function parseResult(result) {
  const text = result.content?.find((item) => item.type === "text")?.text;
  assert.ok(text, "tool result must contain JSON text");
  return JSON.parse(text);
}

test("tools/list exposes exactly ten read-only tools", async () => {
  const result = await client.listTools();
  const names = result.tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, [...EXPECTED_TOOL_NAMES].sort());
  for (const tool of result.tools) {
    assert.equal(tool.annotations?.readOnlyHint, true, `${tool.name} must be read-only`);
    assert.equal(tool.annotations?.destructiveHint, false, `${tool.name} must not be destructive`);
  }
});

test("Skill and investigation resources are installed and readable", async () => {
  const listed = await client.listResources();
  assert.ok(listed.resources.some((resource) => resource.uri === "x-use://skill"));
  assert.ok(listed.resources.some((resource) => resource.uri === "x-use://docs/investigation"));
  const templates = await client.listResourceTemplates();
  assert.deepEqual(templates.resourceTemplates, []);
  const skill = await client.readResource({ uri: "x-use://skill" });
  assert.match(skill.contents[0].text, /X Use/);
});

test("x_post returns upstream data and includes", async () => {
  const result = await client.callTool({
    name: "x_post",
    arguments: {
      post: "https://x.com/XDevelopers/status/1212092628029698048",
    },
  });
  const body = parseResult(result);
  assert.equal(result.isError, false);
  assert.equal(body.ok, true);
  assert.equal(body.data.id, "1212092628029698048");
  assert.equal(body.includes.media[0].media_key, "16_1211797899316740096");
  assert.equal(body.meta.post_id, "1212092628029698048");
});

test("x_search returns real pagination mapping", async () => {
  const result = await client.callTool({
    name: "x_search",
    arguments: {
      query: "from:XDevelopers",
      max_results: 10,
    },
  });
  const body = parseResult(result);
  assert.equal(result.isError, false);
  assert.equal(body.pagination.next_token, "fixture-next");
  assert.equal(body.pagination.newest_id, "2123956286131982720");
});

test("x_user_posts resolves username and returns next page token", async () => {
  const result = await client.callTool({
    name: "x_user_posts",
    arguments: {
      user: "@XDevelopers",
      max_results: 5,
    },
  });
  const body = parseResult(result);
  assert.equal(result.isError, false);
  assert.equal(body.meta.resolved_user.id, "2244994945");
  assert.equal(body.pagination.next_token, "fixture-users-next");
});

test("x_media surfaces forbidden with no fabricated data", async () => {
  const result = await client.callTool({
    name: "x_media",
    arguments: { media_key: "16_1211797899316740096" },
  });
  const body = parseResult(result);
  assert.equal(result.isError, true);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "forbidden");
  assert.equal(body.data, undefined);
  assert.equal(JSON.stringify(body).includes("SHOULD_NOT_LEAK"), false);
});

test("x_chat_conversations returns the current inbox without changing read state", async () => {
  const result = await client.callTool({
    name: "x_chat_conversations",
    arguments: { max_results: 5 },
  });
  const body = parseResult(result);
  assert.equal(result.isError, false);
  assert.equal(body.data[0].id, "123-456");
  assert.equal(body.pagination.next_token, "fixture-chat-next");
  assert.equal(body.meta.read_state_changed, false);
});

test("x_chat_read returns decrypted events and never marks the chat read", async () => {
  const result = await client.callTool({
    name: "x_chat_read",
    arguments: { conversation: "123-456", max_results: 5 },
  });
  const body = parseResult(result);
  assert.equal(result.isError, false);
  assert.equal(body.data[0].id, "event-1");
  assert.equal(body.data[0].message.text, "fixture chat message");
  assert.equal(body.meta.read_state_changed, false);
});

test("not found is a structured tool error", async () => {
  const result = await client.callTool({
    name: "x_post",
    arguments: { post: "2" },
  });
  const body = parseResult(result);
  assert.equal(result.isError, true);
  assert.equal(body.error.code, "not_found");
});

test("x_status verifies auth and credits without leaking auth store ids", async () => {
  const result = await client.callTool({ name: "x_status", arguments: {} });
  const body = parseResult(result);
  assert.equal(result.isError, false);
  assert.equal(body.data.authentication.authenticated, true);
  assert.equal(body.data.credits.available, true);
  assert.equal(body.data.xchat.keys.local_none, true);
  assert.equal(body.data.xchat.keys.registered_count, 1);
  assert.equal(body.data.auth_store.oauth2_users.includes("example_user"), true);
  assert.equal(JSON.stringify(body).includes("SHOULD_NOT_LEAK"), false);
});

