import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const expected = [
  "x_chat_conversations",
  "x_chat_read",
  "x_media",
  "x_post",
  "x_search",
  "x_status",
  "x_thread",
  "x_user",
  "x_user_posts",
];
const repoServer = fileURLToPath(new URL("../bin/x-use-mcp.js", import.meta.url));
const server = process.env.X_USE_SERVER_BIN || repoServer;
if (!existsSync(server)) {
  throw new Error(`X Use MCP entry does not exist: ${server}`);
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [server],
  env: process.env,
  stderr: "pipe",
});
const client = new Client({ name: "x-use-install-check", version: "1.0.0" });

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const names = tools.tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, expected);
  for (const tool of tools.tools) {
    assert.equal(tool.annotations?.readOnlyHint, true);
    assert.equal(tool.annotations?.destructiveHint, false);
  }

  const resources = await client.listResources();
  assert.ok(resources.resources.some((resource) => resource.uri === "x-use://skill"));
  const skill = await client.readResource({ uri: "x-use://skill" });
  assert.match(skill.contents[0].text, /X Use/);

  const summary = {
    server,
    tools: names,
    resources: resources.resources.map((resource) => resource.uri),
    skill_bytes: Buffer.byteLength(skill.contents[0].text),
  };

  if (process.argv.includes("--live")) {
    const status = await client.callTool({ name: "x_status", arguments: {} });
    const statusBody = JSON.parse(status.content.find((item) => item.type === "text").text);
    assert.equal(status.isError, false);
    assert.equal(statusBody.data.authentication.authenticated, true);
    summary.status = statusBody.data;

    const post = await client.callTool({
      name: "x_post",
      arguments: { post: "https://x.com/XDevelopers/status/1212092628029698048" },
    });
    const postBody = JSON.parse(post.content.find((item) => item.type === "text").text);
    assert.equal(post.isError, false);
    assert.equal(postBody.data.id, "1212092628029698048");
    summary.live_post = {
      id: postBody.data.id,
      text_prefix: postBody.data.text.slice(0, 80),
    };
  }

  process.stdout.write(`${JSON.stringify({ ok: true, ...summary }, null, 2)}\n`);
} finally {
  await transport.close();
}

