import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { sanitize, XUseError } from "./errors.js";

export const X_MCP_URL = "https://api.x.com/mcp?read_only=true";

export const X_MCP_READ_TOOLS = [
  "get_users_me",
  "get_users_by_username",
  "get_users_by_id",
  "get_users_mentions",
  "get_users_posts",
  "get_users_timeline",
  "get_posts_by_id",
  "get_posts_by_ids",
  "search_posts_all",
  "get_chat_conversations",
  "get_chat_conversation",
  "get_chat_conversation_events",
  "get_chat_message_requests",
  "get_chat_message_request",
  "get_users_public_key",
  "get_users_public_keys",
];

const ALLOWED = new Set(X_MCP_READ_TOOLS);

function decodeToolResult(result) {
  const text = result.content?.find((item) => item.type === "text")?.text;
  let body;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  if (!result.isError) {
    return body ?? sanitize(result.content ?? null);
  }

  const reason = String(body?.reason ?? "").toLowerCase();
  const type = String(body?.type ?? "").toLowerCase();
  const detail = body?.detail ?? body?.message ?? body?.title ?? text ?? "X MCP request failed";
  let code = "unknown";
  if (reason === "client-not-enrolled" || type.includes("client-forbidden")) {
    code = "forbidden";
  } else if (reason.includes("rate") || type.includes("rate-limit")) {
    code = "rate_limited";
  } else if (type.includes("not-found")) {
    code = "not_found";
  } else if (type.includes("invalid-request")) {
    code = "invalid_request";
  }
  throw new XUseError(code, String(detail), {
    details: sanitize(body ?? { content: result.content ?? null }),
    retryable: code === "rate_limited",
  });
}

export class XurlMcpClient {
  constructor({ env = process.env, clientFactory } = {}) {
    this.env = env;
    this.bin = env.X_USE_XURL_BIN || "xurl";
    this.app = env.X_USE_APP?.trim() || undefined;
    this.user = env.X_USE_USER?.trim() || undefined;
    this.clientFactory = clientFactory ?? (() => new Client({
      name: "x-use-upstream-xmcp",
      version: "0.3.0",
    }));
    this.client = undefined;
    this.transport = undefined;
    this.connecting = undefined;
  }

  config() {
    return {
      url: X_MCP_URL,
      xurl_bin: this.bin,
      app: this.app ?? null,
      user: this.user ?? null,
    };
  }

  async connect() {
    if (this.client) {
      return this.client;
    }
    if (this.connecting) {
      return this.connecting;
    }
    this.connecting = (async () => {
      const args = [];
      if (this.app) {
        args.push("--app", this.app);
      }
      if (this.user) {
        args.push("--username", this.user);
      }
      args.push("mcp", X_MCP_URL);
      this.transport = new StdioClientTransport({
        command: this.bin,
        args,
        env: this.env,
        stderr: "pipe",
      });
      this.transport.stderr?.on("data", () => {});
      const client = this.clientFactory();
      await client.connect(this.transport);
      this.client = client;
      this.connecting = undefined;
      return client;
    })().catch((error) => {
      this.connecting = undefined;
      throw error;
    });
    return this.connecting;
  }

  async listTools() {
    const client = await this.connect();
    try {
      return await client.listTools();
    } catch (error) {
      throw new XUseError("unknown", error instanceof Error ? error.message : "X MCP tool discovery failed");
    }
  }

  async callTool(name, args) {
    if (!ALLOWED.has(name)) {
      throw new XUseError("invalid_request", `X MCP tool is not allowed: ${name}`);
    }
    const client = await this.connect();
    let result;
    try {
      result = await client.callTool({ name, arguments: args });
    } catch (error) {
      throw new XUseError("unknown", error instanceof Error ? error.message : "X MCP request failed");
    }
    return decodeToolResult(result);
  }

  async close() {
    if (this.client) {
      await this.client.close();
    }
    this.client = undefined;
    this.transport = undefined;
  }
}
