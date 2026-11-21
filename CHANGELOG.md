# Changelog

All notable changes to X Use will be documented here.

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

