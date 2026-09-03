# humanauthn-nodejs-sdk

Node.js SDK for the online (HTTP API) version of [HumanAuthn](https://docs.verifik.co/biometrics/humanauthn/) by Verifik.

HumanAuthn is an authentication + encryption primitive that turns a live
biometric sample plus stored entropy into a verifiable credential called a
**HumanID**. This SDK wraps the online HumanAuthn endpoints (`encrypt`,
`encrypt-qr-code`, `decrypt`, `preview`) in a small, strongly-typed,
zero-runtime-dependency client.

## Installation

```bash
npm install humanauthn-nodejs-sdk
```

Requires Node.js 18+ (uses the built-in global `fetch`).

## Quick start

```ts
import { HumanAuthnClient } from "humanauthn-nodejs-sdk";

const client = new HumanAuthnClient({
  apiKey: process.env.HUMANAUTHN_API_KEY!,
});

// Enrollment: bind private metadata to a live biometric sample.
const { humanId } = await client.encrypt({
  image: base64FaceImage,
  metadata: { userId: "user_42", role: "admin" },
  publicMetadata: { org: "Zelf" },
});

// Authentication: only the enrolled face reconstructs the key.
const { authenticated, metadata } = await client.decrypt({
  humanId,
  image: liveFaceImage,
});

if (authenticated) {
  console.log("Welcome back", metadata);
}
```

## API

The client exposes one method per HumanAuthn endpoint:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `encrypt(params)` | `/v2/human-authn/encrypt` | Create a HumanID from a live sample + metadata |
| `encryptQrCode(params)` | `/v2/human-authn/encrypt-qr-code` | Same as `encrypt`, plus a QR-code rendering |
| `decrypt(params)` | `/v2/human-authn/decrypt` | Verify a live sample against a HumanID |
| `preview(params)` | `/v2/human-authn/preview` | Read public metadata without biometrics |

### Client options

```ts
new HumanAuthnClient({
  apiKey: "…",              // required
  baseUrl: "https://api.verifik.co", // optional
  timeoutMs: 30_000,        // optional, per-request timeout
  maxRetries: 2,            // optional, retries transient 5xx/network errors
  defaultHeaders: {},       // optional, merged into every request
  fetch: customFetch,       // optional, defaults to global fetch
});
```

Images may be passed either as a raw base64 string or as a `data:image/...;base64,...`
data URI; the SDK normalizes both.

### Errors

All errors extend `HumanAuthnError`:

- `HumanAuthnConfigError` — invalid input or client configuration.
- `HumanAuthnApiError` — non-2xx response (`.status`, `.code`, `.isAuthError`, `.isRetryable`).
- `HumanAuthnTimeoutError` — request exceeded `timeoutMs`.

## Development

```bash
npm install        # install dev dependencies
npm run build      # compile TypeScript to dist/
npm run typecheck  # type-check without emitting
npm run lint       # ESLint
npm test           # run the vitest suite
npm run demo       # run the end-to-end example against a local mock server
```

The test suite injects a mock transport, so it runs fully offline. The
[`examples/quickstart.ts`](examples/quickstart.ts) demo runs the real SDK
against a local in-process mock of the HumanAuthn API
([`examples/mock-server.ts`](examples/mock-server.ts)) so it works with no
credentials. To target the real API instead:

```bash
HUMANAUTHN_API_KEY=<token> HUMANAUTHN_BASE_URL=https://api.verifik.co npm run demo
```

## License

MIT
