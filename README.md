# humanauthn-nodejs-sdk

Node.js SDK for the online (HTTP API) version of [HumanAuthn](https://docs.verifik.co/biometrics/humanauthn/) by Verifik.

HumanAuthn is an authentication + encryption primitive that turns a live
biometric sample plus stored entropy into a verifiable credential — a
**HumanID**, represented on the wire as a `zelfProof` token. This SDK wraps the
current online HumanAuthn endpoints (`/v2/human-id/encrypt`,
`/encrypt-qr-code`, `/decrypt`, `/preview`) in a small, strongly-typed,
zero-runtime-dependency client. (The legacy `/v2/zelf-proof/*` routes are
deprecated and not used.)

## Installation

```bash
npm install humanauthn-nodejs-sdk
```

Requires Node.js 18+ (uses the built-in global `fetch`). The development
environment targets the latest Node.js (26.x).

## Quick start

```ts
import { HumanAuthnClient } from "humanauthn-nodejs-sdk";

const client = new HumanAuthnClient({
  apiKey: process.env.VERIFIK_CLIENT_JWT!, // Verifik client JWT
});

// Enrollment: bind metadata to a live biometric sample, get a HumanID token.
const { zelfProof } = await client.encrypt({
  faceBase64,                       // base64 (or data: URI) facial image
  identifier: "user42",             // alphanumeric
  publicData: { org: "Zelf" },      // string key-value pairs
  metadata: { userId: "42" },       // encrypted, owner-only
  requireLiveness: true,
});

// Authentication: only the enrolled face reconstructs the key and decrypts.
const result = await client.decrypt({ zelfProof, faceBase64: liveFaceImage });
console.log("Welcome back", result.identifier, result.metadata);
```

## API

The client exposes one method per HumanAuthn endpoint:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `encrypt(params)` | `POST /v2/human-id/encrypt` | Create a HumanID from a live sample + metadata |
| `encryptQrCode(params)` | `POST /v2/human-id/encrypt-qr-code` | Same as `encrypt`, plus a QR-code rendering |
| `decrypt(params)` | `POST /v2/human-id/decrypt` | Verify a live sample against a HumanID and reveal metadata |
| `preview(params)` | `POST /v2/human-id/preview` | Read public data without biometrics |

### `encrypt(params)`

Required: `faceBase64`, `identifier` (alphanumeric), `publicData` (string map),
`metadata` (string map). Optional: `os` (`DESKTOP` \| `ANDROID` \| `IOS`),
`requireLiveness`, `livenessDetectionPriorCreation`, `tolerance`, `password`,
`referenceFaceBase64`, `verifierKey`. Returns `{ zelfProof, ipfs?, publicData?, credits? }`.

### `decrypt(params)`

Required: `zelfProof`, `faceBase64`. Optional: `os`, `password`, `verifierKey`.
Successful decryption *is* authentication; it returns
`{ identifier, metadata, publicData, faceCropBase64?, difficulty?, ... }`. A face
that doesn't match cannot reconstruct the key and surfaces as a
`HumanAuthnApiError`.

### Client options

```ts
new HumanAuthnClient({
  apiKey: "…",                       // required: Verifik client JWT
  baseUrl: "https://api.verifik.co", // optional
  defaultOs: "DESKTOP",              // optional, applied when a call omits `os`
  timeoutMs: 30_000,                 // optional, per-request timeout
  maxRetries: 2,                     // optional, retries transient 5xx/network errors
  defaultHeaders: {},                // optional, merged into every request
  fetch: customFetch,                // optional, defaults to global fetch
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
  npm run demo       # end-to-end example against a local mock server
  npm run verify:real # smoke-test auth against the real Verifik API (needs VERIFIK_CLIENT_JWT)
  npm run verify:roundtrip # enroll + authenticate a real face (see below)
```

### Testing with a real face

`npm run verify:roundtrip` runs a full enroll → preview → authenticate cycle. By
default it uses the bundled **AI-generated synthetic** face at
[`examples/faces/generated-test-face.jpg`](examples/faces/generated-test-face.jpg)
(not a real person; licensed for testing).

```bash
# Default synthetic face, against a local mock (no credentials):
npm run verify:roundtrip

# Against the real Verifik API (charges credits):
VERIFIK_CLIENT_JWT=<token> npm run verify:roundtrip
```

To use a different face, supply it **locally** — it is never committed (face
images are biometric data, and `fixtures/` plus image files are git-ignored).
Use your own face or a licensed/synthetic one; do not commit other people's faces.

```bash
HUMANAUTHN_FACE_IMAGE=./fixtures/me.jpg npm run verify:roundtrip
# or a pre-encoded image:
HUMANAUTHN_FACE_BASE64=<base64> npm run verify:roundtrip
```

The test suite injects a mock transport, so it runs fully offline. The
[`examples/quickstart.ts`](examples/quickstart.ts) demo runs the real SDK
against a local in-process mock of the HumanAuthn API
([`examples/mock-server.ts`](examples/mock-server.ts)) so it works with no
credentials. To target the real API, set your Verifik client JWT:

```bash
VERIFIK_CLIENT_JWT=<token> npm run demo
```

## License

MIT
