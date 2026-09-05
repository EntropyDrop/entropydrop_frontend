# Contributing

## Local verification

Use Node.js 24 or newer, npm 10 or newer, and a `protoc` release with
proto3 optional-field support:

Install the sibling `entropydrop_space_engine` repository with `npm ci` first.
Then from this application directory:

```bash
npm ci
npm run check
npm run audit:deps
```

`entropydrop_space_engine/proto/inventory.proto` is the shared frontend/backend resource contract, while
`entropydrop_space_engine/proto/backpack.proto` is browser-local state. After either schema changes, run
`npm run generate:protobuf` and commit the regenerated TypeScript descriptor and
bindings in the engine repository; shared resource changes must also regenerate the backend Python binding.
`npm run check` includes engine checks and frontend integration tests.

Add a regression test for behavior changes. Browser-facing changes should also
be checked manually in a current WebGL 2 browser with the developer console open.

## API and documentation changes

The public entity scripting API is mirrored in `README.md`,
`docs/agent-skill.md`, the in-game reference in `index.html`, and the Agent
system prompt in `src/engine/contraption/AgentChat.ts`. Update all affected
surfaces and add a semantic contract test whenever API behavior changes.

Multiplayer protocol changes must update `backend/protocol.proto`,
`docs/backend-storage.md`, and `test/backend-design.test.ts` together. The
backend directory is a target-state design until a server implementation is
added.

## Security-sensitive boundaries

- Treat entity scripts and imported files as untrusted input.
- Keep QuickJS memory, time, state, and command-buffer limits intact.
- Never send an Agent API key to a non-HTTPS remote endpoint.
- Validate compressed and uncompressed sizes before allocating or decoding.
