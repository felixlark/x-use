import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { classifyXurlFailure, hasOnlyProblems, sanitize, XUseError } from "./errors.js";
import { assertReadEndpoint } from "./params.js";

const execFileAsync = promisify(execFile);

function timeoutFromEnv(env) {
  const raw = env.X_USE_TIMEOUT_MS;
  if (raw === undefined || raw === "") {
    return 30_000;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1_000 || value > 120_000) {
    throw new XUseError("invalid_request", "X_USE_TIMEOUT_MS must be an integer between 1000 and 120000");
  }
  return value;
}

export class XurlClient {
  constructor({ execFileImpl = execFileAsync, env = process.env } = {}) {
    this.execFile = execFileImpl;
    this.env = env;
    this.bin = env.X_USE_XURL_BIN || "xurl";
    this.app = env.X_USE_APP?.trim() || undefined;
    this.user = env.X_USE_USER?.trim() || undefined;
    this.timeout = timeoutFromEnv(env);
  }

  config() {
    return {
      xurl_bin: this.bin,
      app: this.app ?? null,
      user: this.user ?? null,
      auth: "oauth2",
      timeout_ms: this.timeout,
    };
  }

  baseArgs() {
    const args = [];
    if (this.app) {
      args.push("--app", this.app);
    }
    if (this.user) {
      args.push("--username", this.user);
    }
    return args;
  }

  async execute(args) {
    try {
      const { stdout, stderr } = await this.execFile(this.bin, args, {
        encoding: "utf8",
        env: this.env,
        maxBuffer: 10 * 1024 * 1024,
        timeout: this.timeout,
      });
      return { exitCode: 0, stdout: stdout ?? "", stderr: stderr ?? "" };
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new XUseError("unknown", `xurl executable not found: ${this.bin}`, {
          details: { hint: "Install xurl or set X_USE_XURL_BIN" },
        });
      }
      if (error?.killed || error?.signal === "SIGTERM") {
        throw new XUseError("unknown", "xurl command timed out", {
          retryable: true,
          details: { timeout_ms: this.timeout },
        });
      }
      return {
        exitCode: typeof error?.code === "number" ? error.code : 1,
        stdout: error?.stdout ?? "",
        stderr: error?.stderr ?? "",
      };
    }
  }

  async request(endpoint) {
    assertReadEndpoint(endpoint);
    const args = [...this.baseArgs(), "--auth", "oauth2", endpoint];
    const result = await this.execute(args);
    let body;
    try {
      body = result.stdout.trim() === "" ? undefined : JSON.parse(result.stdout);
    } catch {
      body = undefined;
    }

    if (result.exitCode !== 0 || hasOnlyProblems(body)) {
      throw classifyXurlFailure(result);
    }
    if (body === undefined) {
      throw new XUseError("unknown", "xurl returned no parseable JSON");
    }
    return body;
  }

  async authStatus() {
    const args = [];
    if (this.app) {
      args.push("--app", this.app);
    }
    args.push("auth", "status");
    const result = await this.execute(args);
    if (result.exitCode !== 0) {
      throw classifyXurlFailure(result);
    }
    return result.stdout;
  }

  async version() {
    const result = await this.execute(["version"]);
    if (result.exitCode !== 0) {
      throw classifyXurlFailure(result);
    }
    return result.stdout.trim();
  }
}

export function parseAuthStatus(text, selectedApp) {
  const blocks = String(text)
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  const selected = selectedApp
    ? blocks.find((block) => block.includes(`▸ ${selectedApp}`) || block.startsWith(`${selectedApp} `))
    : undefined;
  if (!selected) {
    return {
      selected_app_found: false,
      oauth2_users: [],
      oauth1: false,
      app_only_bearer: false,
    };
  }

  const oauth2Users = [...selected.matchAll(/^\s*oauth2:\s*(\S+)\s*$/gm)]
    .map((match) => match[1])
    .filter((value) => value !== "(none)");
  return sanitize({
    selected_app_found: true,
    oauth2_users: oauth2Users,
    oauth1: /^\s*oauth1:\s*✓/m.test(selected),
    app_only_bearer: /^\s*bearer:\s*✓/m.test(selected),
  });
}

