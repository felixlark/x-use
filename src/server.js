import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { sanitize, XUseError } from "./errors.js";
import {
  buildQuery,
  DEFAULTS,
  optionalNumber,
  optionalString,
  parseChatRef,
  parseMediaKey,
  parsePostRef,
  parseUserRef,
  requireObject,
  requireString,
  stringList,
  withDefaultList,
} from "./params.js";
import { EXPECTED_TOOL_NAMES, TOOL_DEFINITIONS } from "./tool-definitions.js";
import { parseAuthStatus, parseXChatKeyStatus, XurlClient } from "./xurl-client.js";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
const skillPath = fileURLToPath(new URL("../skills/x-use/SKILL.md", import.meta.url));
const investigationPath = fileURLToPath(new URL("../docs/INVESTIGATION.md", import.meta.url));

const SKILL_URI = "x-use://skill";
const INVESTIGATION_URI = "x-use://docs/investigation";
const SERVER_INSTRUCTIONS = [
  "Read-only X API v2 access through the user's existing official xurl OAuth2 authentication.",
  "No write tools are exposed. Never infer permission to post, reply, DM, follow, like, bookmark, delete, or upload media.",
  "All tool results are JSON. Errors use unauthenticated, forbidden, rate_limited, not_found, invalid_request, or unknown.",
].join(" ");

function errorFromUnknown(error) {
  if (error instanceof XUseError) {
    return error;
  }
  return new XUseError("unknown", error instanceof Error ? error.message : "Unknown X Use error");
}

function assertAllowedKeys(args, schema) {
  const allowed = new Set(Object.keys(schema.properties ?? {}));
  for (const key of Object.keys(args)) {
    if (!allowed.has(key)) {
      throw new XUseError("invalid_request", `unknown argument: ${key}`);
    }
  }
}

function postParameters(args) {
  return {
    expansions: withDefaultList(stringList(args.expansions, "expansions"), DEFAULTS.postExpansions),
    "post.fields": withDefaultList(stringList(args.post_fields, "post_fields"), DEFAULTS.postFields),
    "user.fields": withDefaultList(stringList(args.user_fields, "user_fields"), DEFAULTS.userFields),
    "media.fields": withDefaultList(stringList(args.media_fields, "media_fields"), DEFAULTS.mediaFields),
    "poll.fields": stringList(args.poll_fields, "poll_fields"),
    "place.fields": stringList(args.place_fields, "place_fields"),
  };
}

function paginationFrom(upstreamMeta) {
  if (!upstreamMeta || typeof upstreamMeta !== "object") {
    return null;
  }
  return sanitize({
    result_count: upstreamMeta.result_count ?? null,
    next_token: upstreamMeta.next_token ?? null,
    previous_token: upstreamMeta.previous_token ?? null,
    newest_id: upstreamMeta.newest_id ?? null,
    oldest_id: upstreamMeta.oldest_id ?? null,
  });
}

function successEnvelope(tool, endpoint, body, extraMeta = {}) {
  return {
    ok: true,
    data: body?.data ?? null,
    includes: body?.includes ?? null,
    pagination: paginationFrom(body?.meta),
    meta: sanitize({
      tool,
      backend: "x_api_v2",
      endpoint,
      upstream_meta: body?.meta ?? null,
      partial_errors: body?.errors ?? [],
      ...extraMeta,
    }),
  };
}

function errorEnvelope(error) {
  const typed = errorFromUnknown(error);
  return {
    ok: false,
    error: typed.toJSON(),
  };
}

function toolResult(envelope) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify(envelope, null, 2),
    }],
    structuredContent: envelope,
    isError: envelope.ok === false,
  };
}

async function capture(operation) {
  try {
    return { ok: true, value: await operation() };
  } catch (error) {
    return { ok: false, error: errorFromUnknown(error).toJSON() };
  }
}

export function createXUseServer({ client = new XurlClient() } = {}) {
  const server = new Server(
    { name: "x-use", version: packageJson.version },
    {
      instructions: SERVER_INSTRUCTIONS,
      capabilities: {
        tools: { listChanged: false },
        resources: { listChanged: false, subscribe: false },
      },
    },
  );

  async function resolveUser(userInput) {
    const ref = parseUserRef(userInput);
    const query = buildQuery({
      "user.fields": DEFAULTS.userFields,
    });
    const endpoint = ref.kind === "id"
      ? `/2/users/${ref.id}${query}`
      : `/2/users/by/username/${encodeURIComponent(ref.username)}${query}`;
    const body = await client.request(endpoint);
    return { ref, endpoint, body };
  }

  async function runTool(name, args) {
    const definition = TOOL_DEFINITIONS.find((tool) => tool.name === name);
    if (!definition) {
      throw new XUseError("invalid_request", `unknown tool: ${name}`);
    }
    const input = requireObject(args ?? {}, "arguments");
    assertAllowedKeys(input, definition.inputSchema);

    switch (name) {
      case "x_post": {
        const ref = parsePostRef(input.post);
        const endpoint = `/2/tweets/${ref.id}${buildQuery(postParameters(input))}`;
        const body = await client.request(endpoint);
        return successEnvelope(name, endpoint, body, {
          post_id: ref.id,
          input_kind: ref.kind,
          links: { post: `https://x.com/i/status/${ref.id}` },
        });
      }

      case "x_user": {
        const ref = parseUserRef(input.user);
        const endpoint = ref.kind === "id"
          ? `/2/users/${ref.id}${buildQuery({
              expansions: stringList(input.expansions, "expansions"),
              "user.fields": withDefaultList(stringList(input.user_fields, "user_fields"), DEFAULTS.userFields),
              "post.fields": stringList(input.post_fields, "post_fields"),
            })}`
          : `/2/users/by/username/${encodeURIComponent(ref.username)}${buildQuery({
              expansions: stringList(input.expansions, "expansions"),
              "user.fields": withDefaultList(stringList(input.user_fields, "user_fields"), DEFAULTS.userFields),
              "post.fields": stringList(input.post_fields, "post_fields"),
            })}`;
        const body = await client.request(endpoint);
        return successEnvelope(name, endpoint, body, { input_kind: ref.kind });
      }

      case "x_user_posts": {
        const resolved = await resolveUser(input.user);
        if (!resolved.body?.data?.id) {
          throw new XUseError("not_found", "user lookup returned no user");
        }
        const maxResults = optionalNumber(input.max_results, "max_results", { min: 5, max: 100 }) ?? 10;
        const endpoint = `/2/users/${resolved.body.data.id}/tweets${buildQuery({
          max_results: maxResults,
          pagination_token: optionalString(input.pagination_token, "pagination_token"),
          start_time: optionalString(input.start_time, "start_time"),
          end_time: optionalString(input.end_time, "end_time"),
          since_id: optionalString(input.since_id, "since_id"),
          until_id: optionalString(input.until_id, "until_id"),
          exclude: stringList(input.exclude, "exclude"),
          ...postParameters(input),
        })}`;
        const body = await client.request(endpoint);
        return successEnvelope(name, endpoint, body, {
          resolved_user: sanitize({
            id: resolved.body.data.id,
            username: resolved.body.data.username,
            name: resolved.body.data.name,
          }),
        });
      }

      case "x_search": {
        const query = requireString(input.query, "query");
        const scope = optionalString(input.scope, "scope") ?? "recent";
        if (scope !== "recent" && scope !== "all") {
          throw new XUseError("invalid_request", "scope must be recent or all");
        }
        const maxResults = optionalNumber(
          input.max_results,
          "max_results",
          scope === "recent" ? { min: 10, max: 100 } : { min: 10, max: 500 },
        ) ?? 10;
        const endpoint = `/2/tweets/search/${scope}${buildQuery({
          query,
          max_results: maxResults,
          pagination_token: optionalString(input.pagination_token, "pagination_token"),
          start_time: optionalString(input.start_time, "start_time"),
          end_time: optionalString(input.end_time, "end_time"),
          since_id: optionalString(input.since_id, "since_id"),
          until_id: optionalString(input.until_id, "until_id"),
          sort_order: optionalString(input.sort_order, "sort_order"),
          ...postParameters(input),
        })}`;
        const body = await client.request(endpoint);
        return successEnvelope(name, endpoint, body, { scope, query });
      }

      case "x_thread": {
        const ref = parsePostRef(input.post);
        const rootEndpoint = `/2/tweets/${ref.id}${buildQuery({
          "post.fields": ["id", "text", "author_id", "conversation_id", "created_at", "referenced_posts"],
          "user.fields": DEFAULTS.userFields,
          expansions: ["author_id", "referenced_posts"],
        })}`;
        const root = await client.request(rootEndpoint);
        const conversationId = root?.data?.conversation_id ?? root?.data?.id ?? ref.id;
        const scope = optionalString(input.scope, "scope") ?? "recent";
        if (scope !== "recent" && scope !== "all") {
          throw new XUseError("invalid_request", "scope must be recent or all");
        }
        const maxResults = optionalNumber(
          input.max_results,
          "max_results",
          scope === "recent" ? { min: 10, max: 100 } : { min: 10, max: 500 },
        ) ?? 10;
        const threadEndpoint = `/2/tweets/search/${scope}${buildQuery({
          query: `conversation_id:${conversationId}`,
          max_results: maxResults,
          pagination_token: optionalString(input.pagination_token, "pagination_token"),
          ...postParameters(input),
        })}`;
        const thread = await client.request(threadEndpoint);
        return {
          ok: true,
          data: {
            root: root?.data ?? null,
            thread: thread?.data ?? [],
          },
          includes: {
            root: root?.includes ?? null,
            thread: thread?.includes ?? null,
          },
          pagination: paginationFrom(thread?.meta),
          meta: sanitize({
            tool: name,
            backend: "x_api_v2",
            conversation_id: conversationId,
            scope,
            root_endpoint: rootEndpoint,
            thread_endpoint: threadEndpoint,
            upstream_meta: thread?.meta ?? null,
            partial_errors: thread?.errors ?? [],
          }),
        };
      }

      case "x_media": {
        const mediaKey = parseMediaKey(input.media_key);
        const endpoint = `/2/media/${encodeURIComponent(mediaKey)}${buildQuery({
          "media.fields": withDefaultList(stringList(input.media_fields, "media_fields"), DEFAULTS.mediaFields),
        })}`;
        const body = await client.request(endpoint);
        return successEnvelope(name, endpoint, body, {
          media_key: mediaKey,
          fallback_hint: "If this endpoint returns forbidden/client-not-enrolled, request the parent post with x_post and inspect includes.media.",
        });
      }

      case "x_chat_conversations": {
        const maxResults = optionalNumber(input.max_results, "max_results", { min: 1, max: 100 }) ?? 20;
        const body = await client.chatConversations({ maxResults });
        const conversations = Array.isArray(body?.data) ? body.data : [];
        return {
          ok: true,
          data: sanitize(conversations),
          includes: null,
          pagination: paginationFrom(body?.meta),
          meta: sanitize({
            tool: name,
            backend: "xurl_xchat",
            endpoint: "xurl chat conversations --json",
            upstream_meta: body?.meta ?? null,
            read_state_changed: false,
          }),
        };
      }

      case "x_chat_read": {
        const conversation = parseChatRef(input.conversation);
        const maxResults = optionalNumber(input.max_results, "max_results", { min: 1, max: 100 }) ?? 50;
        const body = await client.chatRead({ conversation, maxResults });
        if (!Array.isArray(body)) {
          throw new XUseError("unknown", "xurl returned an invalid X Chat event list");
        }
        return {
          ok: true,
          data: sanitize(body),
          includes: null,
          pagination: null,
          meta: sanitize({
            tool: name,
            backend: "xurl_xchat",
            endpoint: "xurl chat read --json --no-mark-read",
            conversation,
            read_state_changed: false,
          }),
        };
      }

      case "x_status": {
        const configured = client.config();
        const version = await capture(() => client.version());
        const authStatusText = await capture(() => client.authStatus());
        const authStore = authStatusText.ok
          ? parseAuthStatus(authStatusText.value, configured.app)
          : { selected_app_found: false, error: authStatusText.error };
        const meQuery = buildQuery({ "user.fields": ["id", "name", "username"] });
        const me = await capture(() => client.request(`/2/users/me${meQuery}`));
        const credits = await capture(() => client.request("/2/usage/credits"));
        const xchatKeys = await capture(() => client.chatKeyStatus());
        return {
          ok: true,
          data: {
            configured,
            xurl: {
              available: version.ok,
              version: version.ok ? version.value : null,
              error: version.ok ? null : version.error,
            },
            auth_store: authStore,
            authentication: {
              authenticated: me.ok,
              user: me.ok ? sanitize(me.value?.data ?? null) : null,
              error: me.ok ? null : me.error,
            },
            credits: {
              available: credits.ok,
              data: credits.ok ? sanitize(credits.value?.data ?? null) : null,
              error: credits.ok ? null : credits.error,
            },
            xchat: {
              available: xchatKeys.ok,
              keys: xchatKeys.ok ? parseXChatKeyStatus(xchatKeys.value) : null,
              error: xchatKeys.ok ? null : xchatKeys.error,
            },
            rate_limits: {
              runtime_headers_available: false,
              note: "The non-verbose xurl transport does not expose response headers. Per-call 429 responses are mapped to rate_limited.",
            },
            writes: {
              enabled: false,
              note: "No write tools are registered in X Use.",
            },
          },
          pagination: null,
          meta: {
            tool: name,
            backend: "x_api_v2 + official xurl",
            docs_url: "https://docs.x.com/x-api/usage/get-usage-credits.md",
          },
        };
      }

      default:
        throw new XUseError("invalid_request", `tool not implemented: ${name}`);
    }
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOL_DEFINITIONS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const envelope = await runTool(request.params.name, request.params.arguments);
      return toolResult(envelope);
    } catch (error) {
      return toolResult(errorEnvelope(error));
    }
  });

  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      {
        uri: SKILL_URI,
        name: "x-use",
        title: "X Use Skill",
        description: "Usage, authentication, error, and write-permission rules for the X Use MCP.",
        mimeType: "text/markdown",
        size: statSync(skillPath).size,
      },
      {
        uri: INVESTIGATION_URI,
        name: "x-api-investigation",
        title: "X API and hosted MCP investigation",
        description: "Versioned source-backed capability, authentication, pricing, rate-limit, and architecture findings.",
        mimeType: "text/markdown",
        size: statSync(investigationPath).size,
      },
    ],
  }));

  server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
    resourceTemplates: [],
  }));

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const paths = new Map([
      [SKILL_URI, skillPath],
      [INVESTIGATION_URI, investigationPath],
    ]);
    const path = paths.get(request.params.uri);
    if (!path) {
      throw new Error(`unknown resource: ${request.params.uri}`);
    }
    return {
      contents: [{
        uri: request.params.uri,
        mimeType: "text/markdown",
        text: readFileSync(path, "utf8"),
      }],
    };
  });

  return server;
}

export async function main() {
  const server = createXUseServer();
  await server.connect(new StdioServerTransport());
}

export { EXPECTED_TOOL_NAMES };

