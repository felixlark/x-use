import { XUseError } from "./errors.js";

export const DEFAULTS = {
  postFields: [
    "id",
    "text",
    "author_id",
    "conversation_id",
    "created_at",
    "attachments",
    "referenced_posts",
    "lang",
    "public_metrics",
    "reply_settings",
  ],
  userFields: [
    "id",
    "name",
    "username",
    "created_at",
    "description",
    "profile_image_url",
    "public_metrics",
    "verified",
    "verified_type",
  ],
  mediaFields: [
    "media_key",
    "type",
    "url",
    "preview_image_url",
    "alt_text",
    "duration_ms",
    "width",
    "height",
    "variants",
    "public_metrics",
  ],
  postExpansions: [
    "author_id",
    "attachments.media_keys",
    "referenced_posts",
  ],
};

export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function requireObject(value, label = "arguments") {
  if (!isPlainObject(value)) {
    throw new XUseError("invalid_request", `${label} must be an object`);
  }
  return value;
}

export function requireString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new XUseError("invalid_request", `${label} must be a non-empty string`);
  }
  return value.trim();
}

export function optionalString(value, label) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return requireString(value, label);
}

export function optionalNumber(value, label, { min, max } = {}) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Number.isInteger(value) || (min !== undefined && value < min) || (max !== undefined && value > max)) {
    const range = min !== undefined || max !== undefined
      ? ` between ${min ?? "-∞"} and ${max ?? "∞"}`
      : "";
    throw new XUseError("invalid_request", `${label} must be an integer${range}`);
  }
  return value;
}

export function stringList(value, label) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new XUseError("invalid_request", `${label} must be an array of non-empty strings`);
  }
  return value.map((item) => item.trim());
}

export function withDefaultList(value, fallback) {
  return value === undefined ? [...fallback] : value;
}

export function buildQuery(parameters) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        continue;
      }
      query.set(key, value.join(","));
      continue;
    }
    query.set(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

export function parsePostRef(input) {
  const value = requireString(input, "post");
  if (/^\d{1,20}$/.test(value)) {
    return { id: value, input: value, kind: "id" };
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new XUseError("invalid_request", "post must be an X post URL or numeric ID");
  }

  const allowedHosts = new Set([
    "x.com",
    "www.x.com",
    "mobile.x.com",
    "twitter.com",
    "www.twitter.com",
    "mobile.twitter.com",
  ]);
  if (!allowedHosts.has(parsed.hostname.toLowerCase())) {
    throw new XUseError("invalid_request", "post URL must use x.com or twitter.com");
  }

  const match = parsed.pathname.match(/\/status(?:es)?\/(\d{1,20})(?:\/|$)/i);
  if (!match) {
    throw new XUseError("invalid_request", "post URL does not contain a numeric status ID");
  }
  return { id: match[1], input: value, kind: "url" };
}

export function parseUserRef(input) {
  const raw = requireString(input, "user");
  if (/^\d{1,20}$/.test(raw)) {
    return { id: raw, username: undefined, kind: "id" };
  }

  const username = raw.startsWith("@") ? raw.slice(1) : raw;
  if (!/^[A-Za-z0-9_]{1,15}$/.test(username)) {
    throw new XUseError("invalid_request", "user must be a numeric X user ID or a username of 1-15 letters, digits, or underscores");
  }
  return { id: undefined, username, kind: "username" };
}

export function parseMediaKey(input) {
  const mediaKey = requireString(input, "media_key");
  if (!/^([0-9]+)_([0-9]+)$/.test(mediaKey)) {
    throw new XUseError("invalid_request", "media_key must have the X form <numeric type>_<numeric id>");
  }
  return mediaKey;
}

export function parseChatRef(input) {
  const value = requireString(input, "conversation");
  if (
    /^@?[A-Za-z0-9_]{1,15}$/.test(value)
    || /^g[0-9]{1,30}$/.test(value)
    || /^[0-9]{1,30}(?:-[0-9]{1,30})?$/.test(value)
  ) {
    return value;
  }
  throw new XUseError(
    "invalid_request",
    "conversation must be an @username, numeric user ID, direct conversation ID, or g-prefixed group ID",
  );
}

export function assertReadEndpoint(endpoint) {
  if (typeof endpoint !== "string" || !endpoint.startsWith("/2/") || /[\r\n]/.test(endpoint)) {
    throw new XUseError("unknown", "internal attempt to call a non-read or malformed X API endpoint");
  }
  return endpoint;
}

