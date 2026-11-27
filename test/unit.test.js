import assert from "node:assert/strict";
import test from "node:test";
import { classifyXurlFailure } from "../src/errors.js";
import {
  assertReadEndpoint,
  buildQuery,
  parseChatRef,
  parseMediaKey,
  parsePostRef,
  parseUserRef,
} from "../src/params.js";
import { parseAuthStatus, parseXChatKeyStatus, XurlClient } from "../src/xurl-client.js";

test("post references accept IDs and official URL variants", () => {
  assert.deepEqual(parsePostRef("1212092628029698048"), {
    id: "1212092628029698048",
    input: "1212092628029698048",
    kind: "id",
  });
  assert.equal(
    parsePostRef("https://mobile.twitter.com/XDevelopers/status/1212092628029698048?s=20").id,
    "1212092628029698048",
  );
  assert.throws(() => parsePostRef("https://example.com/status/2"), /x\.com or twitter\.com/);
  assert.throws(() => parsePostRef("https://x.com/XDevelopers"), /numeric status ID/);
});

test("user and media references reject ambiguous input", () => {
  assert.deepEqual(parseUserRef("@XDevelopers"), {
    id: undefined,
    username: "XDevelopers",
    kind: "username",
  });
  assert.equal(parseUserRef("2244994945").kind, "id");
  assert.throws(() => parseUserRef("not valid!"), /username/);
  assert.equal(parseMediaKey("16_1211797899316740096"), "16_1211797899316740096");
  assert.throws(() => parseMediaKey("../../token"), /media_key/);
});

test("X Chat conversation references accept official identifiers", () => {
  assert.equal(parseChatRef("@XDevelopers"), "@XDevelopers");
  assert.equal(parseChatRef("2244994945"), "2244994945");
  assert.equal(parseChatRef("123-456"), "123-456");
  assert.equal(parseChatRef("g2082242994149929240"), "g2082242994149929240");
  assert.throws(() => parseChatRef("../token"), /conversation/);
});

test("query builder maps arrays to current comma-separated X parameters", () => {
  assert.equal(
    buildQuery({
      "post.fields": ["id", "text"],
      expansions: ["author_id", "attachments.media_keys"],
      query: "from:XDevelopers",
      omit: undefined,
    }),
    "?post.fields=id%2Ctext&expansions=author_id%2Cattachments.media_keys&query=from%3AXDevelopers",
  );
});

test("read endpoint guard rejects non-v2 and newline input", () => {
  assert.equal(assertReadEndpoint("/2/tweets/2"), "/2/tweets/2");
  assert.throws(() => assertReadEndpoint("/oauth2/token"), /non-read/);
  assert.throws(() => assertReadEndpoint("/2/tweets/2\nPOST"), /non-read/);
});

test("401 maps to unauthenticated", () => {
  const error = classifyXurlFailure({
    exitCode: 1,
    stdout: JSON.stringify({ status: 401, detail: "Invalid or expired token" }),
    stderr: "Error: request failed",
  });
  assert.equal(error.code, "unauthenticated");
  assert.equal(error.httpStatus, 401);
});

test("client-not-enrolled maps to forbidden and strips app identifiers", () => {
  const error = classifyXurlFailure({
    exitCode: 1,
    stdout: JSON.stringify({
      client_id: "SHOULD_NOT_LEAK",
      reason: "client-not-enrolled",
      title: "Client Forbidden",
      type: "https://api.x.com/2/problems/client-forbidden",
    }),
    stderr: "",
  });
  assert.equal(error.code, "forbidden");
  assert.equal(error.toJSON().details.client_id, undefined);
});

test("429 and usage cap map to rate_limited", () => {
  const status = classifyXurlFailure({
    exitCode: 1,
    stdout: JSON.stringify({ status: 429, detail: "Too many requests" }),
    stderr: "",
  });
  assert.equal(status.code, "rate_limited");
  assert.equal(status.retryable, true);

  const cap = classifyXurlFailure({
    exitCode: 1,
    stdout: JSON.stringify({
      type: "https://api.x.com/2/problems/usage-capped",
      detail: "Usage cap exceeded",
    }),
    stderr: "",
  });
  assert.equal(cap.code, "rate_limited");
});

test("not_found and unknown are distinguished", () => {
  const notFound = classifyXurlFailure({
    exitCode: 0,
    stdout: JSON.stringify({
      errors: [{
        type: "https://api.x.com/2/problems/resource-not-found",
        detail: "Could not find post",
      }],
    }),
    stderr: "",
  });
  assert.equal(notFound.code, "not_found");

  const unknown = classifyXurlFailure({
    exitCode: 1,
    stdout: JSON.stringify({ detail: "mystery" }),
    stderr: "",
  });
  assert.equal(unknown.code, "unknown");
});

test("missing local X Chat keys gets a stable error code", () => {
  const missing = classifyXurlFailure({
    exitCode: 1,
    stdout: "",
    stderr: "Error: no XChat keys found for user 10001 — bring your existing keys to this machine",
  });
  assert.equal(missing.code, "key_unavailable");
});

test("auth status parser returns users but never the client id", () => {
  const parsed = parseAuthStatus([
    "  default  [(no credentials)]",
    "      oauth2: (none)",
    "",
    "▸ xurl  [client_id: SHOULD_NOT_LEAK…]",
    "      oauth2: another_example",
    "      oauth2: example_user",
    "      oauth1: –",
    "      bearer: –",
  ].join("\n"), "xurl");
  assert.deepEqual(parsed.oauth2_users, ["another_example", "example_user"]);
  assert.equal(JSON.stringify(parsed).includes("SHOULD_NOT_LEAK"), false);
});

test("auth status omits the user flag that xurl auth does not accept", async () => {
  const calls = [];
  const client = new XurlClient({
    env: {
      X_USE_APP: "xurl",
      X_USE_USER: "example_user",
    },
    execFileImpl: async (_bin, args) => {
      calls.push(args);
      return { stdout: "▸ xurl\n      oauth2: example_user\n", stderr: "" };
    },
  });
  await client.authStatus();
  assert.deepEqual(calls[0], ["--app", "xurl", "auth", "status"]);
});

test("X Chat status parser exposes key availability without secrets", () => {
  const parsed = parseXChatKeyStatus([
    "user: @example_user (10001)",
    "local keys:   none — run 'xurl chat keys restore'",
    "registered:   1 key(s) on account",
  ].join("\n"));
  assert.deepEqual(parsed, {
    local_available: false,
    local_none: true,
    registered_count: 1,
  });
});

test("X Chat read always passes no-mark-read and OAuth2 user context", async () => {
  const calls = [];
  const client = new XurlClient({
    env: {
      X_USE_APP: "xurl",
      X_USE_USER: "example_user",
    },
    execFileImpl: async (_bin, args) => {
      calls.push(args);
      return { stdout: JSON.stringify([{ id: "event-1" }]), stderr: "" };
    },
  });
  const body = await client.chatRead({ conversation: "123-456", maxResults: 5 });
  assert.equal(body[0].id, "event-1");
  assert.deepEqual(calls[0], [
    "--app", "xurl",
    "--username", "example_user",
    "chat", "read", "123-456",
    "--json", "--no-mark-read", "--auth", "oauth2",
    "--max-results", "5",
  ]);
});

