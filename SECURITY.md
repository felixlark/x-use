# Security Policy

## Supported versions

Security fixes target the latest commit on `main` and the current installed release.

## Reporting a vulnerability

Please use GitHub's private security advisory flow:

<https://github.com/felixlark/x-use/security/advisories/new>

Do not open a public issue containing credentials, exploit details, private account data, or unredacted logs.

Include, where applicable:

- affected commit or release;
- Node and `xurl` versions;
- affected tool and endpoint;
- sanitized request/response shape;
- impact and reproduction steps;
- whether any token, cookie, or private key may have been exposed.

If credentials may be exposed, revoke/rotate them through the owning provider before sharing non-secret diagnostic evidence.

## Security model

- `xurl` is the only credential source.
- X Use does not read auth files, print access tokens, or expose write tools.
- The transport uses `execFile` with an argument array rather than a shell.
- Error objects are redacted before leaving the process.
- MCP is a local stdio process; do not expose it as an unauthenticated network service.

