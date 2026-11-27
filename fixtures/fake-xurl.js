#!/usr/bin/env node
const args = process.argv.slice(2);
const endpoint = args.at(-1) ?? "";
const chatIndex = args.indexOf("chat");
const chatArgs = chatIndex >= 0 ? args.slice(chatIndex + 1) : [];

function output(value, code = 0) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
  process.exitCode = code;
}

if (args[0] === "version") {
  process.stdout.write("xurl version 1.3.4\n");
  process.exit(0);
}

if (args.includes("auth") && args.includes("status")) {
  process.stdout.write([
    "  default  [(no credentials)]",
    "      oauth2: (none)",
    "      oauth1: ✓",
    "      bearer: –",
    "",
    "▸ xurl  [client_id: SHOULD_NOT_LEAK…]",
    "      redirect_uri: http://localhost:8080/callback",
    "      oauth2: another_example",
    "      oauth2: example_user",
    "      oauth1: –",
    "      bearer: –",
    "",
  ].join("\n"));
  process.exit(0);
}

if (chatArgs[0] === "keys" && chatArgs[1] === "status") {
  process.stdout.write([
    "user:         @example_user (10001)",
    "local keys:   none — run 'xurl chat keys restore'",
    "registered:   1 key(s) on account",
    "",
  ].join("\n"));
  process.exit(0);
}

if (chatArgs[0] === "conversations") {
  output({
    data: [{
      id: "123-456",
      participant_ids: ["456"],
      is_archived: false,
      is_muted: false,
      type: "direct",
    }],
    meta: {
      has_more: true,
      has_message_requests: false,
      next_token: "fixture-chat-next",
      result_count: 1,
    },
  });
  process.exit(0);
} else if (chatArgs[0] === "read") {
  output([
    {
      id: "event-1",
      type: "message",
      sender_id: "456",
      conversation_id: chatArgs[1],
      message: { id: "message-1", text: "fixture chat message" },
    },
  ]);
  process.exit(0);
}

if (endpoint.startsWith("/2/users/me")) {
  output({ data: { id: "10001", name: "Fixture User", username: "example_user" } });
} else if (endpoint === "/2/usage/credits") {
  output({ data: { free_balance: 10, prepaid_balance: 2, total_balance: 12 } });
} else if (endpoint.startsWith("/2/media/")) {
  output({
    client_id: "SHOULD_NOT_LEAK",
    detail: "When authenticating requests to the X API v2 endpoints, you must use keys and tokens from a developer App that is attached to a Project.",
    reason: "client-not-enrolled",
    title: "Client Forbidden",
    type: "https://api.x.com/2/problems/client-forbidden"
  }, 1);
} else if (endpoint.startsWith("/2/tweets/search/recent")) {
  output({
    data: [{
      id: "2123956286131982720",
      text: "fixture search post",
      conversation_id: "2123956286131982720",
      author_id: "2244994945"
    }],
    includes: {
      users: [{ id: "2244994945", username: "XDevelopers", name: "Developers" }]
    },
    meta: {
      result_count: 1,
      next_token: "fixture-next",
      newest_id: "2123956286131982720",
      oldest_id: "2123956286131982720"
    }
  });
} else if (endpoint.startsWith("/2/tweets/search/all")) {
  output({
    detail: "Valid auth but no full-archive entitlement.",
    title: "Client Forbidden",
    type: "https://api.x.com/2/problems/client-forbidden"
  }, 1);
} else if (endpoint.startsWith("/2/tweets/2")) {
  output({
    errors: [{
      detail: "Could not find post with id: [2].",
      resource_id: "2",
      resource_type: "tweet",
      title: "Not Found Error",
      type: "https://api.x.com/2/problems/resource-not-found"
    }]
  });
} else if (endpoint.startsWith("/2/tweets/1212092628029698048")) {
  output({
    data: {
      id: "1212092628029698048",
      text: "fixture post",
      author_id: "2244994945",
      conversation_id: "1212092619796316161",
      attachments: { media_keys: ["16_1211797899316740096"] }
    },
    includes: {
      users: [{ id: "2244994945", username: "XDevelopers", name: "Developers" }],
      media: [{ media_key: "16_1211797899316740096", type: "animated_gif" }]
    }
  });
} else if (endpoint.startsWith("/2/users/by/username/XDevelopers")) {
  output({
    data: {
      id: "2244994945",
      username: "XDevelopers",
      name: "Developers"
    }
  });
} else if (endpoint.startsWith("/2/users/2244994945/tweets")) {
  output({
    data: [{ id: "2123956286131982720", text: "fixture user post" }],
    meta: { result_count: 1, next_token: "fixture-users-next" }
  });
} else {
  output({
    detail: `unexpected fixture endpoint: ${endpoint}`,
    title: "Fixture Error",
    type: "https://api.x.com/2/problems/internal-error"
  }, 1);
}

