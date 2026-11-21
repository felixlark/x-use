const SENSITIVE_KEYS = new Set([
  "access_token",
  "authorization",
  "bearer",
  "client_id",
  "client_secret",
  "cookie",
  "id_token",
  "password",
  "pin",
  "refresh_token",
  "secret",
  "token",
]);

export class XUseError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = "XUseError";
    this.code = code;
    this.details = options.details;
    this.httpStatus = options.httpStatus;
    this.upstreamType = options.upstreamType;
    this.retryable = options.retryable ?? false;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      http_status: this.httpStatus ?? null,
      upstream_type: this.upstreamType ?? null,
      details: this.details ?? null,
    };
  }
}

export function sanitize(value, seen = new WeakSet()) {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return "[circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, seen));
  }

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      continue;
    }
    result[key] = sanitize(item, seen);
  }
  return result;
}

function parseJson(text) {
  if (typeof text !== "string" || text.trim() === "") {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function problemEntries(body) {
  if (!body || typeof body !== "object") {
    return [];
  }
  if (Array.isArray(body.errors)) {
    return body.errors;
  }
  return [body];
}

function firstString(body, keys) {
  for (const key of keys) {
    if (typeof body?.[key] === "string" && body[key].trim() !== "") {
      return body[key];
    }
  }
  return undefined;
}

export function classifyXurlFailure({ exitCode = 1, stdout = "", stderr = "" } = {}) {
  const body = parseJson(stdout);
  const problems = problemEntries(body);
  const types = problems.map((problem) => problem?.type).filter(Boolean);
  const hasResourceNotFound = types.some((type) => String(type).includes("resource-not-found"));
  const hasRateLimit = types.some((type) => String(type).includes("rate-limit-exceeded") || String(type).includes("usage-capped"));
  const hasForbidden = types.some((type) => (
    String(type).includes("client-forbidden")
    || String(type).includes("not-authorized-for")
    || String(type).includes("unsupported-authentication")
  ));
  const httpStatus = typeof body?.status === "number"
    ? body.status
    : typeof body?.errors?.[0]?.status === "number"
      ? body.errors[0].status
      : undefined;
  const message = firstString(body, ["detail", "message", "title"])
    ?? firstString(body?.errors?.[0], ["detail", "message", "title"])
    ?? (String(stderr).replace(/\u001b\[[0-9;]*m/g, "").trim() || "X API request failed");
  const upstreamType = types[0] ?? (typeof body?.type === "string" ? body.type : undefined);
  const details = body ? sanitize(body) : undefined;

  let code;
  if (
    httpStatus === 401
    || /noauthmethod|no authentication method|not authenticated|missing (?:an? )?(?:token|credential)|invalid or expired token/i.test(`${message}\n${stderr}\n${stdout}`)
  ) {
    code = "unauthenticated";
  } else if (httpStatus === 429 || hasRateLimit) {
    code = "rate_limited";
  } else if (hasResourceNotFound || httpStatus === 404) {
    code = "not_found";
  } else if (hasForbidden || httpStatus === 403) {
    code = "forbidden";
  } else if (httpStatus === 400 || types.some((type) => String(type).includes("invalid-request"))) {
    code = "invalid_request";
  } else {
    code = "unknown";
  }

  return new XUseError(code, message, {
    details,
    httpStatus,
    upstreamType,
    retryable: code === "rate_limited" || (httpStatus !== undefined && httpStatus >= 500),
  });
}

export function hasOnlyProblems(body) {
  return Boolean(
    body
    && typeof body === "object"
    && Array.isArray(body.errors)
    && body.errors.length > 0
    && body.data === undefined
    && body.includes === undefined,
  );
}

