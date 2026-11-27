const stringArray = (description) => ({
  type: "array",
  description,
  items: { type: "string" },
  uniqueItems: true,
});

const postShape = {
  expansions: stringArray("X API expansions, for example author_id,attachments.media_keys,referenced_posts."),
  post_fields: stringArray("Mapped to the current query parameter post.fields."),
  user_fields: stringArray("Mapped to user.fields."),
  media_fields: stringArray("Mapped to media.fields."),
  poll_fields: stringArray("Mapped to poll.fields."),
  place_fields: stringArray("Mapped to place.fields."),
};

const readAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export const EXPECTED_TOOL_NAMES = [
  "x_post",
  "x_user",
  "x_user_posts",
  "x_search",
  "x_thread",
  "x_media",
  "x_chat_conversations",
  "x_chat_read",
  "x_status",
];

export const TOOL_DEFINITIONS = [
  {
    name: "x_post",
    title: "Read an X post",
    description: "Read one public/visible X post by URL or numeric ID. Returns upstream data, includes, and structured pagination/error envelopes. Read-only.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["post"],
      properties: {
        post: {
          type: "string",
          description: "X post URL or numeric status ID.",
        },
        ...postShape,
      },
    },
    annotations: readAnnotations,
  },
  {
    name: "x_user",
    title: "Look up an X user",
    description: "Look up an X user by @username, username, or numeric user ID. Read-only.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["user"],
      properties: {
        user: {
          type: "string",
          description: "Username with optional @, or numeric user ID.",
        },
        expansions: stringArray("X API user expansions such as pinned_post_id."),
        user_fields: stringArray("Mapped to user.fields."),
        post_fields: stringArray("Mapped to post.fields for expanded posts."),
      },
    },
    annotations: readAnnotations,
  },
  {
    name: "x_user_posts",
    title: "Read a user's recent posts",
    description: "Read posts authored by an X user. The username is resolved to a user ID first when needed. Read-only.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["user"],
      properties: {
        user: {
          type: "string",
          description: "Username with optional @, or numeric user ID.",
        },
        max_results: {
          type: "integer",
          minimum: 5,
          maximum: 100,
          default: 10,
          description: "Page size accepted by GET /2/users/{id}/tweets.",
        },
        pagination_token: {
          type: "string",
          description: "Opaque next_token from a previous page.",
        },
        start_time: { type: "string", description: "RFC 3339 start time." },
        end_time: { type: "string", description: "RFC 3339 end time." },
        since_id: { type: "string", description: "Return posts newer than this ID." },
        until_id: { type: "string", description: "Return posts older than this ID." },
        exclude: {
          type: "array",
          items: { type: "string", enum: ["replies", "retweets"] },
          uniqueItems: true,
          description: "Exclude replies and/or retweets.",
        },
        ...postShape,
      },
    },
    annotations: readAnnotations,
  },
  {
    name: "x_search",
    title: "Search X posts",
    description: "Search X posts. scope=recent covers the last 7 days; scope=all requests full-archive search and may be forbidden by account entitlement. Read-only.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: {
          type: "string",
          description: "X search query using official search operators.",
        },
        scope: {
          type: "string",
          enum: ["recent", "all"],
          default: "recent",
        },
        max_results: {
          type: "integer",
          minimum: 10,
          maximum: 500,
          default: 10,
          description: "Recent search accepts 10-100; full-archive search accepts 10-500.",
        },
        pagination_token: {
          type: "string",
          description: "Opaque next_token from a previous page.",
        },
        start_time: { type: "string", description: "RFC 3339 start time." },
        end_time: { type: "string", description: "RFC 3339 end time." },
        since_id: { type: "string", description: "Return posts newer than this ID." },
        until_id: { type: "string", description: "Return posts older than this ID." },
        sort_order: {
          type: "string",
          enum: ["recency", "relevancy"],
        },
        ...postShape,
      },
    },
    annotations: readAnnotations,
  },
  {
    name: "x_thread",
    title: "Read an X conversation",
    description: "Resolve a post's conversation_id and read posts in that conversation. Recent scope only covers the last 7 days; full scope may be forbidden. Read-only.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["post"],
      properties: {
        post: {
          type: "string",
          description: "Any post URL or numeric status ID in the conversation.",
        },
        scope: {
          type: "string",
          enum: ["recent", "all"],
          default: "recent",
        },
        max_results: {
          type: "integer",
          minimum: 10,
          maximum: 500,
          default: 10,
          description: "Recent search accepts 10-100; full-archive search accepts 10-500.",
        },
        pagination_token: {
          type: "string",
          description: "Opaque next_token from a previous thread page.",
        },
        ...postShape,
      },
    },
    annotations: readAnnotations,
  },
  {
    name: "x_media",
    title: "Read X media metadata",
    description: "Read media metadata by media key. The direct endpoint may be forbidden when the developer App is not enrolled in a Project; the error is returned without fabricating data. Read-only.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["media_key"],
      properties: {
        media_key: {
          type: "string",
          description: "X media key in the form <type>_<id>.",
        },
        media_fields: stringArray("Mapped to media.fields."),
      },
    },
    annotations: readAnnotations,
  },
  {
    name: "x_chat_conversations",
    title: "List the X Chat inbox",
    description: "List the authenticated user's current X Chat conversations through the official xurl X Chat client. Does not change read state. Read-only.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        max_results: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 20,
          description: "Maximum number of X Chat conversations to list.",
        },
      },
    },
    annotations: readAnnotations,
  },
  {
    name: "x_chat_read",
    title: "Read an X Chat conversation",
    description: "Read and decrypt recent events from one X Chat conversation through the official xurl X Chat client. Always uses --no-mark-read. Read-only.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["conversation"],
      properties: {
        conversation: {
          type: "string",
          description: "X Chat @username, numeric user ID, direct conversation ID, or g-prefixed group ID.",
        },
        max_results: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 50,
          description: "Maximum number of recent X Chat events to read.",
        },
      },
    },
    annotations: readAnnotations,
  },
  {
    name: "x_status",
    title: "Check X authentication and credits",
    description: "Check xurl version and safe auth metadata, verify OAuth2 user access, and read the developer credit balance. Does not print tokens or write to X. Read-only.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    annotations: readAnnotations,
  },
];

