# X Use

[![CI](https://github.com/felixlark/x-use/actions/workflows/ci.yml/badge.svg)](https://github.com/felixlark/x-use/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**A read-only MCP server for the X API v2, using the official `xurl` OAuth client as the only credential source.**

`X Use` exposes structured tools for posts, users, timelines, search, conversations, media metadata, and account/credit status. It does not manage a second token store and does not expose posting, reply, DM, follow, like, bookmark, delete, or media-upload tools.

中文说明见下方。

## Features

| Tool | Purpose | X API |
| --- | --- | --- |
| `x_post` | Read a post by URL or ID, including author/media/references | `GET /2/tweets/{id}` |
| `x_user` | Look up a user by username or numeric ID | `GET /2/users/by/username/{username}` / `GET /2/users/{id}` |
| `x_user_posts` | Read a user's recent posts with pagination | `GET /2/users/{id}/tweets` |
| `x_search` | Recent or full-archive search | `GET /2/tweets/search/recent` / `all` |
| `x_thread` | Resolve `conversation_id` and read posts in a conversation | Post lookup + Search |
| `x_media` | Read media metadata by media key | `GET /2/media/{media_key}` |
| `x_status` | Verify authentication and read developer credits | `/2/users/me` + `/2/usage/credits` |

All tool calls return JSON with a stable envelope:

- `data` and `includes`: the relevant upstream X API payload
- `pagination`: mapped `next_token`, `previous_token`, `newest_id`, and `oldest_id`
- `meta`: tool, endpoint, upstream metadata, and `partial_errors`
- `error.code`: `unauthenticated`, `forbidden`, `rate_limited`, `not_found`, `invalid_request`, or `unknown`

## Requirements

- Node.js 20 or newer
- Official [`xurl`](https://github.com/xdevplatform/xurl) with an authorised OAuth2 user
- An X developer App with access to the endpoints you intend to use
- Credits/entitlement for the corresponding X API calls

The server reads X through `xurl` with `--auth oauth2`. It does **not** read `~/.xurl/auth.yml`, print tokens, or accept access tokens through MCP arguments.

## Quick start

```bash
git clone https://github.com/felixlark/x-use.git
cd x-use
npm ci
npm test
```

Run directly from the checkout:

```bash
X_USE_APP=your-xurl-app \
X_USE_USER=your-x-username \
node bin/x-use-mcp.js
```

The process speaks MCP over stdio; it is not intended to be used as a normal HTTP server.

## Install for Codex

The supplied installer creates a versioned local installation, atomically switches `current`, and links the bundled Skill into `~/.agents/skills/x-use`.

```bash
./scripts/install.sh
```

On macOS the default MCP executable is:

```text
$HOME/Library/Application Support/x-use/current/bin/x-use-mcp.js
```

On Linux it is:

```text
$HOME/.local/share/x-use/current/bin/x-use-mcp.js
```

Register it with Codex using your own existing xurl app and OAuth2 username:

```bash
codex mcp add x-use \
  --env X_USE_APP=your-xurl-app \
  --env X_USE_USER=your-x-username \
  -- "$HOME/Library/Application Support/x-use/current/bin/x-use-mcp.js"
```

Use the Linux path shown above where applicable. Reload or restart the MCP connection after installation.

## Configuration

| Variable | Required | Meaning |
| --- | --- | --- |
| `X_USE_APP` | Recommended | Registered app name in xurl |
| `X_USE_USER` | Recommended | Existing OAuth2 username in xurl |
| `X_USE_XURL_BIN` | No | Path to xurl; defaults to `xurl` on `PATH` |
| `X_USE_TIMEOUT_MS` | No | Per-command timeout, 1–120 seconds |
| `X_USE_INSTALL_ROOT` | No | Override the installer's application-data directory |
| `X_USE_SKILLS_ROOT` | No | Override the installer's Skill root |

The implementation always requests OAuth2 user context. It never silently falls back to OAuth1, app-only bearer, another user, or another provider.

## Example

```json
{
  "name": "x_user_posts",
  "arguments": {
    "user": "@XDevelopers",
    "max_results": 5
  }
}
```

A successful result contains the X payload plus a pagination view:

```json
{
  "ok": true,
  "data": ["..."],
  "includes": {"users": ["..."]},
  "pagination": {
    "result_count": 5,
    "next_token": "opaque-next-token",
    "previous_token": null,
    "newest_id": "...",
    "oldest_id": "..."
  },
  "meta": {
    "tool": "x_user_posts",
    "backend": "x_api_v2",
    "partial_errors": []
  }
}
```

## Documentation

- [API investigation](docs/INVESTIGATION.md): source-backed capability, auth, pricing, rate-limit, hosted MCP, and XChat notes
- [Architecture](docs/ARCHITECTURE.md): backend choice, trust boundaries, upgrade and fallback paths
- [Interfaces and implementation](docs/INTERFACES.md): tool contracts, call flow, envelopes, error mapping, and installer
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Support](SUPPORT.md)
- [Changelog](CHANGELOG.md)

## Safety and boundaries

- X Use is deliberately read-only. Write actions require a separate, explicit design and per-action authorization.
- An MCP tool's absence is not evidence that an external action is unauthorized or authorized.
- X API rate limits, account entitlement, and usage charges remain in force; this project does not buy credits or change billing.
- `x_media` may return `forbidden` when the developer App is not enrolled in a required Project. Parent-post `includes.media` remains available through `x_post`.
- XChat is not exposed: encrypted content additionally requires DM scopes, a Chat XDK, and client-held private keys.
- Never put tokens, cookies, XChat PINs, private keys, or private account data in an issue, pull request, fixture, or log.

## Development

```bash
npm ci
npm test
npm run check
npm run check:live
```

`npm test` is offline and covers parsing, pagination/field mapping, error classification, redaction, MCP tool discovery, resources, and mocked tool calls. `npm run check:live` performs a small read-only smoke test and therefore uses real X API credits.

## 中文概览

X Use 是一个只读的 X API v2 MCP Server。它复用本机官方 `xurl` 的 OAuth2 会话，不保存第二份 token，也不暴露发帖、回复、DM、关注、点赞、书签、删除或媒体上传工具。

七个工具分别覆盖帖子、用户、用户帖子、搜索、会话、媒体元数据和认证/额度状态。返回使用统一的 `data`、`includes`、`pagination`、`meta` 信封；错误分为 `unauthenticated`、`forbidden`、`rate_limited`、`not_found`、`invalid_request` 和 `unknown`。

安装、Tool 参数、调用链和错误映射见 [接口与实现](docs/INTERFACES.md)。使用前需要 Node.js 20+、官方 `xurl` 和对应的 X API 权益；本项目的真实读取 smoke 会消耗实际 API credits。

## License

MIT. See [LICENSE](LICENSE).

