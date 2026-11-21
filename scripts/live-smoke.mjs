import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

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
const client = new Client({ name: "x-use-live-smoke", version: "1.0.0" });

function jsonResult(result) {
  const text = result.content?.find((item) => item.type === "text")?.text;
  assert.ok(text, "missing JSON text result");
  return JSON.parse(text);
}

async function call(name, args) {
  const result = await client.callTool({ name, arguments: args });
  return { result, body: jsonResult(result) };
}

try {
  await client.connect(transport);
  const tools = await client.listTools();
  assert.deepEqual(
    tools.tools.map((tool) => tool.name).sort(),
    ["x_media", "x_post", "x_search", "x_status", "x_thread", "x_user", "x_user_posts"],
  );

  const status = await call("x_status", {});
  assert.equal(status.result.isError, false);
  assert.equal(status.body.data.authentication.authenticated, true);

  const user = await call("x_user", { user: "XDevelopers" });
  assert.equal(user.result.isError, false);
  assert.equal(user.body.data.username, "XDevelopers");

  const post = await call("x_post", {
    post: "https://x.com/XDevelopers/status/1212092628029698048",
  });
  assert.equal(post.result.isError, false);
  assert.equal(post.body.data.id, "1212092628029698048");

  const userPosts = await call("x_user_posts", { user: "XDevelopers", max_results: 5 });
  assert.equal(userPosts.result.isError, false);

  const search = await call("x_search", {
    query: "from:XDevelopers",
    scope: "recent",
    max_results: 10,
  });
  assert.equal(search.result.isError, false);

  const thread = await call("x_thread", {
    post: "https://x.com/XDevelopers/status/1212092628029698048",
    scope: "recent",
    max_results: 10,
  });
  assert.equal(thread.result.isError, false);

  const media = await call("x_media", {
    media_key: "16_1211797899316740096",
  });

  process.stdout.write(`${JSON.stringify({
    ok: true,
    tools: tools.tools.map((tool) => tool.name),
    authenticated_user: status.body.data.authentication.user,
    credits_available: status.body.data.credits.available,
    user: {
      id: user.body.data.id,
      username: user.body.data.username,
    },
    post: {
      id: post.body.data.id,
      text_prefix: post.body.data.text.slice(0, 80),
      media_count: post.body.includes?.media?.length ?? 0,
    },
    user_posts: {
      result_count: userPosts.body.pagination?.result_count ?? null,
      next_token_present: Boolean(userPosts.body.pagination?.next_token),
    },
    search: {
      result_count: search.body.pagination?.result_count ?? null,
      next_token_present: Boolean(search.body.pagination?.next_token),
    },
    thread: {
      conversation_id: thread.body.meta.conversation_id,
      result_count: thread.body.pagination?.result_count ?? null,
    },
    media: media.result.isError
      ? { error_code: media.body.error.code, blocked_as_expected_from_live_probe: media.body.error.code === "forbidden" }
      : { ok: true, data: media.body.data },
  }, null, 2)}\n`);
} finally {
  await transport.close();
}

