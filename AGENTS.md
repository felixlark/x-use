# X Use Contributor Notes

X Use is an open-source, read-only MCP server for the official X API v2. The canonical repository is `felixlark/x-use`.

## Engineering rules

- Keep read access and write access separate. Do not add posting, reply, DM, follow, like, bookmark, delete, or media-upload tools without a public design discussion and a new authorization model.
- Treat the user's existing `xurl` authentication as the only credential source. Never read or copy auth files, print tokens, run `xurl token`, or add secret-bearing arguments.
- Preserve the official X API names in query mapping, especially `post.fields` and current expansion names.
- Keep errors and diagnostics sanitized. Tests must not contain real tokens, cookies, private keys, or private account identifiers.
- Public documentation and commits use the `felixlark` public identity only. Do not add personal paths, email addresses, real names, organization details, or private account IDs.

## Verification

- Offline: `npm ci && npm test`
- Installed MCP: `npm run check`
- Real read-only smoke: `npm run check:live`
- Documentation links must resolve within the repository.

Source, tests, installed versions, MCP discovery, and live reads are separate evidence layers. A README, fixture, or local unit test does not by itself prove a live X API read.

