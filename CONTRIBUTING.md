# Contributing

Thanks for helping improve X Use.

## Before opening a change

Open an issue for:

- a new MCP tool;
- any write-capable endpoint;
- changes to authentication, credential storage, or token handling;
- changes to the success/error envelope;
- new runtime dependencies.

Small documentation, test, compatibility, and bug fixes can go directly to a pull request.

## Development setup

```bash
npm ci
npm test
```

The offline suite must pass without network access or credentials. Real X checks are optional and must use an account and credits you are authorised to consume:

```bash
X_USE_APP=your-xurl-app X_USE_USER=your-x-username npm run check:live
```

## Read-only boundary

The project currently has no external-write tools. A pull request that adds a write action must explain:

1. the exact user-visible action and API endpoint;
2. OAuth scope and account entitlement;
3. how the action is explicitly authorised per call;
4. idempotency, unknown-result reconciliation, and rollback/compensation;
5. how tests avoid performing real external writes.

Do not add a write tool merely because the underlying X App has a write scope.

## Credential rules

Never commit or include in prompts, issues, pull requests, fixtures, or logs:

- access or refresh tokens;
- client secrets;
- cookies;
- XChat PINs, private keys, or exported key blobs;
- private account identifiers that are not needed for a public test.

Use existing `xurl` authentication. Do not create a second secret store.

## Pull requests

Please include:

- the user-visible behaviour and scope;
- the relevant API sources when query semantics change;
- offline test results;
- installed-MCP verification when packaging changes;
- a live read sample only when the change affects X API calls;
- explicit unknown, blocked, or unavailable items.

Keep changes focused. Preserve unrelated user changes and never rewrite someone else's branch without coordination.

## License

By contributing, you agree that your contribution is licensed under the repository's MIT License.

