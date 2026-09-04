# humanauthn-nodejs-sdk

Node.js SDK for the online (HTTP API) version of [HumanAuthn](https://docs.verifik.co/biometrics/humanauthn/) by Verifik.

HumanAuthn is an authentication + encryption primitive that turns a live
biometric sample plus stored entropy into a verifiable credential — a
**HumanID**, represented on the wire as a `zelfProof` token. This SDK wraps the
current online HumanAuthn endpoints (`/v2/human-id/encrypt`,
`/encrypt-qr-code`, `/decrypt`, `/preview`) in a small, strongly-typed,
zero-runtime-dependency client. (The legacy `/v2/zelf-proof/*` routes are
deprecated and not used.)

## How it works

- Enrollment (`encrypt`): capture a live face, bind it to your `publicData` and
  private `metadata`, and receive a `zelfProof` HumanID token. Store that token
  (for example on the user record). HumanAuthn keeps no biometric template.
- Authentication (`decrypt`): send a fresh face plus the stored `zelfProof`. Only
  the enrolled face reconstructs the key, so a successful decrypt *is* the
  authentication, and it returns the private `metadata`.
- Preview (`preview`): read the public, non-sensitive data of a HumanID without
  any biometric input.

See the [HumanAuthn overview](https://docs.verifik.co/biometrics/humanauthn/) for
the underlying primitive.

## Installation

```bash
npm install humanauthn-nodejs-sdk
```

Requires Node.js 18+ (uses the built-in global `fetch`). The development
environment targets the latest Node.js (26.x).

## Authentication (Verifik JWT)

Every request authenticates with a **Verifik client JWT** (a bearer token). You
pass it as `apiKey`; the SDK sends it as `Authorization: Bearer <token>`. Keep it
in an environment variable and **server-side only** — never ship it to a browser.

```bash
# .env
VERIFIK_CLIENT_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVC...
```

Without a valid token, real API calls fail with `401`
(`HumanAuthnApiError` with `.isAuthError === true`).

### Getting a token

- Dashboard (recommended): sign in to the Verifik web app at
  [ai.verifik.co](https://ai.verifik.co) and copy your client access token.
- API (email OTP): request a code, then confirm it — see
  [API key access via email](https://docs.verifik.co/authentication/api-key-access-via-email/).

  ```bash
  # 1) Request an OTP by email
  curl -X POST "https://api.verifik.co/v2/projects/email-login?email=you@example.com" \
    -H "Accept: application/json"

  # 2) Confirm it -> { data: { accessToken, tokenType: "bearer" } }
  curl -X POST "https://api.verifik.co/v2/projects/email-login/confirm" \
    -H "Content-Type: application/json" \
    -d '{ "email": "you@example.com", "otp": "123456" }'
  ```

  (The OTP can be delivered by email/SMS/WhatsApp depending on your account, so
  this flow is interactive — the SDK does not automate it. Generate the token
  once and paste it into `VERIFIK_CLIENT_JWT`.)

### Lifetime, renewal, and expiry

- A token is valid for about **30 days**.
- Renew a still-valid token (no re-login) via
  [`/v2/auth/session`](https://docs.verifik.co/authentication/renew-your-token-jwt/).
  `expiresIn` is measured in **months** (`1` = one month):

  ```bash
  curl "https://api.verifik.co/v2/auth/session?origin=refresh&expiresIn=1" \
    -H "Authorization: Bearer $VERIFIK_CLIENT_JWT"
  # -> { "accessToken": "<new-jwt>", "tokenType": "bearer" }
  ```

- Once a token has **expired** it can no longer be renewed — generate a new one
  (dashboard or email OTP) and update `VERIFIK_CLIENT_JWT`.
- Treat the token like a password: if it leaks, re-issue it and replace the env
  var.

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

## Costs and credits

Verifik bills through a shared **credit** system; you buy and monitor credits in
the [dashboard](https://ai.verifik.co). Approximate HumanAuthn usage:

| Operation | Typical cost |
| --- | --- |
| `encrypt` / `encryptQrCode` (create a HumanID) | ~0.84 credits per HumanID |
| `decrypt` (authenticate) | billed monthly per active user, not per call |
| `preview` | small per-call charge |

Each successful `encrypt` returns a `credits` object describing the charge. Exact
pricing and inclusions depend on your plan, so check your
[dashboard](https://ai.verifik.co) and the
[credits docs](https://docs.verifik.co/resources/credits). Credits can expire, so
purchase them close to when you plan to use them. (Costs above are indicative and
may change — treat the dashboard as the source of truth.)

## Integrations

Reference examples live in
[`examples/integrations/`](examples/integrations/). They import the published
package and keep the Verifik JWT **server-side**:

- [Express](examples/integrations/express) — `enroll` + `authenticate` routes.
- [Next.js](examples/integrations/nextjs) — App Router route handlers.
- [Browser capture](examples/integrations/browser) — grab `faceBase64` from a
  webcam and POST it to your backend.

Typical flow: the browser captures a face → your backend calls `encrypt` (enroll)
or `decrypt` (authenticate) with your JWT → you store the returned `zelfProof` on
the user and issue your own session.

## Security and privacy

- HumanAuthn stores **no biometric templates** — authentication reconstructs an
  ephemeral key from the live face plus stored entropy.
- Keep the Verifik JWT server-side; never expose it to the browser or commit it.
- Do not log `faceBase64`, `metadata`, or the JWT, and send everything over HTTPS.
- Treat face images as sensitive biometric data; don't persist them unless you
  have a lawful basis and user consent.

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

## Resources

- Dashboard / web app: [ai.verifik.co](https://ai.verifik.co)
- HumanAuthn docs: [docs.verifik.co/biometrics/humanauthn](https://docs.verifik.co/biometrics/humanauthn/)
- Credits and pricing: [docs.verifik.co/resources/credits](https://docs.verifik.co/resources/credits)
- Authentication: [API key via email](https://docs.verifik.co/authentication/api-key-access-via-email/) and [renew token](https://docs.verifik.co/authentication/renew-your-token-jwt/)
- Package on JSR: [@zelf/humanauthn](https://jsr.io/@zelf/humanauthn)

## License

MIT
