/**
 * Real Verifik API smoke test.
 *
 * Proves the SDK can reach the live HumanAuthn API and that the configured
 * client JWT (`VERIFIK_CLIENT_JWT`) is accepted — without needing a real face
 * image and without charging credits.
 *
 * Strategy: call `decrypt` with an intentionally invalid `zelfProof`. A request
 * that is rejected for authentication reasons returns 401 (UNAUTHORIZED). Any
 * other outcome means the token was accepted and the request reached the
 * HumanAuthn pipeline (it then fails validation on the bogus proof, which does
 * not create a HumanID and is not charged).
 *
 *   VERIFIK_CLIENT_JWT=<token> npm run verify:real
 */
import { HumanAuthnApiError, HumanAuthnClient } from "../src/index.js";

async function main(): Promise<void> {
  const jwt = process.env.VERIFIK_CLIENT_JWT ?? process.env.VERIFIK_TOKEN;
  if (!jwt) {
    console.error(
      "\u274c VERIFIK_CLIENT_JWT is not set. This VM did not receive the secret.\n" +
        "   (Secrets are injected into freshly booted Cloud Agent VMs.)",
    );
    process.exitCode = 2;
    return;
  }

  const baseUrl = process.env.HUMANAUTHN_BASE_URL ?? "https://api.verifik.co";
  console.log(`Verifying real Verifik API auth against ${baseUrl} ...`);
  const client = new HumanAuthnClient({ apiKey: jwt, baseUrl });

  const dummyFace = Buffer.from("smoke-test-not-a-real-face").toString("base64");

  try {
    const result = await client.decrypt({ zelfProof: "invalid-smoke-test-proof", faceBase64: dummyFace });
    // Extremely unlikely, but a 200 also proves auth works.
    console.log("\u2705 Token accepted (request unexpectedly succeeded):", JSON.stringify(result).slice(0, 120));
    return;
  } catch (err) {
    if (err instanceof HumanAuthnApiError) {
      if (err.status === 401) {
        console.error(`\u274c Token REJECTED by Verifik: ${err.status} ${err.code ?? ""} ${err.message}`);
        process.exitCode = 1;
        return;
      }
      console.log(
        `\u2705 Token ACCEPTED by Verifik. Reached the HumanAuthn pipeline; the bogus proof ` +
          `was rejected as expected: ${err.status} ${err.code ?? ""} "${err.message}".`,
      );
      return;
    }
    console.error("\u274c Unexpected error reaching the Verifik API:", err);
    process.exitCode = 1;
  }
}

void main();
