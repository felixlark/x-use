# Changelog

All notable changes to X Use will be documented here.

## 0.3.0 - 2026-11-27

### Added

- `x_mcp` integration with the official read-only X MCP at `https://api.x.com/mcp?read_only=true`.
- Whitelisted official tools for public X reads and X Chat conversations/events.

### Security

- The upstream X MCP connection is fixed to read-only mode.
- X Chat event ciphertext is never presented as decrypted message text.

## 0.2.0 - 2026-11-27

### Added

- Read-only `x_chat_conversations` and `x_chat_read` MCP tools backed by the official `xurl` X Chat client.
- X Chat key availability in `x_status`.
- Stable `key_unavailable` and `decrypt_failed` errors.

### Security

- X Chat reads always use `--no-mark-read`.
- X Chat sends, replies, read-state changes, media writes, and key operations remain unavailable through MCP.

## 0.1.0 - 2026-11-21

### Added

- Read-only MCP server over stdio.
- Tools for post, user, user posts, search, conversation, media metadata, and auth/credit status.
- Official `xurl` OAuth2 transport with no secondary credential store.
- Structured success envelopes, pagination mapping, partial errors, and six error classes.
- Offline contract tests and real read-only smoke checks.
- Versioned installer, bundled Skill, CI, contribution and security documentation.

### Security

- No write tools are exposed.
- Authentication files and token values are never read or printed.
- Error payloads are recursively sanitized.

