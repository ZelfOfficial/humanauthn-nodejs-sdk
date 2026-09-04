/**
 * Express integration example for humanauthn-nodejs-sdk.
 *
 * Shows how to add face enrollment + authentication to an existing backend:
 *   POST /human-id/enroll        { userId, faceBase64 }  -> stores a zelfProof
 *   POST /human-id/authenticate  { userId, faceBase64 }  -> verifies the face
 *
 * The Verifik JWT stays on the server. The browser only ever sends a base64
 * face image (see ../browser) and receives your own app session, never the JWT.
 *
 * This is a reference snippet (not compiled by the SDK build). To run it:
 *   npm i express @zelf/humanauthn        # or: humanauthn-nodejs-sdk
 *   VERIFIK_CLIENT_JWT=<token> npx tsx server.ts
 */
import express from "express";
import { HumanAuthnClient, HumanAuthnApiError } from "@zelf/humanauthn";

const jwt = process.env.VERIFIK_CLIENT_JWT;
if (!jwt) throw new Error("Set VERIFIK_CLIENT_JWT (your Verifik client JWT).");

const humanAuthn = new HumanAuthnClient({ apiKey: jwt });

// Replace this in-memory map with your real datastore. Store the zelfProof
// (a HumanID token) on the user record; it is safe to persist.
const zelfProofByUser = new Map<string, string>();

const app = express();
// Base64 face images are large; raise the JSON body limit accordingly.
app.use(express.json({ limit: "8mb" }));

// Enrollment: bind the user's face to a HumanID and store the token.
app.post("/human-id/enroll", async (req, res) => {
  const { userId, faceBase64 } = req.body ?? {};
  if (typeof userId !== "string" || typeof faceBase64 !== "string") {
    return res.status(400).json({ error: "userId and faceBase64 are required" });
  }

  try {
    const { zelfProof } = await humanAuthn.encrypt({
      faceBase64,
      identifier: userId, // must be alphanumeric
      publicData: { app: "my-app" },
      metadata: { userId },
      requireLiveness: true,
    });
    zelfProofByUser.set(userId, zelfProof);
    return res.status(201).json({ enrolled: true });
  } catch (err) {
    return res.status(statusFor(err)).json({ error: messageFor(err) });
  }
});

// Authentication: verify a fresh face against the stored HumanID.
app.post("/human-id/authenticate", async (req, res) => {
  const { userId, faceBase64 } = req.body ?? {};
  if (typeof userId !== "string" || typeof faceBase64 !== "string") {
    return res.status(400).json({ error: "userId and faceBase64 are required" });
  }

  const zelfProof = zelfProofByUser.get(userId);
  if (!zelfProof) return res.status(404).json({ error: "user not enrolled" });

  try {
    // A successful decrypt IS the authentication.
    const result = await humanAuthn.decrypt({ zelfProof, faceBase64 });
    // Issue your own app session here (cookie/JWT). Do not return Verifik data.
    return res.json({ authenticated: true, userId: result.identifier });
  } catch (err) {
    // A non-matching face surfaces as a HumanAuthnApiError.
    if (err instanceof HumanAuthnApiError && !err.isAuthError) {
      return res.status(401).json({ authenticated: false });
    }
    return res.status(statusFor(err)).json({ error: messageFor(err) });
  }
});

function statusFor(err: unknown): number {
  return err instanceof HumanAuthnApiError ? err.status : 500;
}

function messageFor(err: unknown): string {
  // Never leak the JWT or the face image; surface only a safe message.
  return err instanceof Error ? err.message : "internal error";
}

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`listening on http://localhost:${port}`));
