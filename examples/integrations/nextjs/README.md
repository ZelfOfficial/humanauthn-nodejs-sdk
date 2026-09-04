# Next.js (App Router) integration

Server-side route handlers that add face enrollment + authentication with
[`@zelf/humanauthn`](https://jsr.io/@zelf/humanauthn). The Verifik JWT is read
from the server environment and never reaches the client.

## Files

- [`lib/human-authn.ts`](lib/human-authn.ts) — lazily builds the client from
  `VERIFIK_CLIENT_JWT`, plus a demo store (replace with your DB).
- [`app/api/human-id/enroll/route.ts`](app/api/human-id/enroll/route.ts) —
  `POST` `{ userId, faceBase64 }` → `encrypt` → store `zelfProof`.
- [`app/api/human-id/authenticate/route.ts`](app/api/human-id/authenticate/route.ts) —
  `POST` `{ userId, faceBase64 }` → `decrypt` → authenticate.

## Setup

```bash
npm i @zelf/humanauthn   # or the npm name: humanauthn-nodejs-sdk
```

Add the token to your server environment (e.g. `.env.local`):

```bash
VERIFIK_CLIENT_JWT=<token>
```

See the repo root [Authentication](../../../README.md#authentication-verifik-jwt)
section for how to obtain and renew the JWT.

## Notes

- Handlers set `export const runtime = "nodejs"` because the SDK uses `fetch`
  and runs server-side; do not move them to the Edge runtime with secrets.
- Persist the `zelfProof` on the user record and issue your own session cookie
  after a successful authenticate.
- The imports use relative paths; in a real app prefer a path alias like
  `@/lib/human-authn`.
- Capture `faceBase64` in the browser with the [browser example](../browser).
