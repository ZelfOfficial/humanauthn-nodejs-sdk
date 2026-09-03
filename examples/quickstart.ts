/**
 * End-to-end quickstart for humanauthn-nodejs-sdk.
 *
 * By default this runs the real SDK against a local in-process mock of the
 * Verifik HumanAuthn API (see ./mock-server.ts), so it works with no
 * credentials:
 *
 *   npm run demo
 *
 * To run against the real Verifik API instead, set a client JWT (and,
 * optionally, a base URL):
 *
 *   VERIFIK_CLIENT_JWT=<token> npm run demo
 */
import { HumanAuthnApiError, HumanAuthnClient } from "../src/index.js";
import { startMockServer, type MockServerHandle } from "./mock-server.js";

// Two distinct "faces". Against the real API these would be live camera
// captures; the local mock treats distinct byte payloads as different people.
const ALICE_FACE = Buffer.from("alice-live-biometric-sample").toString("base64");
const MALLORY_FACE = Buffer.from("mallory-live-biometric-sample").toString("base64");

function log(step: string, detail?: unknown): void {
  const suffix = detail === undefined ? "" : ` ${JSON.stringify(detail)}`;
  console.log(`\u2192 ${step}${suffix}`);
}

async function main(): Promise<void> {
  const jwt = process.env.VERIFIK_CLIENT_JWT ?? process.env.VERIFIK_TOKEN;
  let mock: MockServerHandle | undefined;

  let apiKey: string;
  let baseUrl: string | undefined;
  if (jwt) {
    apiKey = jwt;
    baseUrl = process.env.HUMANAUTHN_BASE_URL;
    console.log("Running against the REAL Verifik API:", baseUrl ?? "https://api.verifik.co");
  } else {
    mock = await startMockServer();
    apiKey = mock.apiKey;
    baseUrl = mock.url;
    console.log("Running against a LOCAL mock HumanAuthn server:", baseUrl);
  }

  const client = new HumanAuthnClient({ apiKey, ...(baseUrl ? { baseUrl } : {}) });

  try {
    console.log("\n== Enrollment (encrypt) ==");
    const enrolled = await client.encrypt({
      faceBase64: ALICE_FACE,
      identifier: "user42",
      publicData: { org: "Zelf", tier: "pro" },
      metadata: { userId: "42", role: "admin" },
      requireLiveness: false,
    });
    log("Created HumanID (zelfProof, truncated)", `${enrolled.zelfProof.slice(0, 24)}...`);
    log("Credits", enrolled.credits);

    console.log("\n== Preview (public data, no biometrics) ==");
    const preview = await client.preview({ zelfProof: enrolled.zelfProof });
    log("Public data", preview.publicData);
    log("Password protected", preview.passwordProtected ?? false);

    console.log("\n== Authentication (decrypt) with the enrolled face ==");
    const ok = await client.decrypt({ zelfProof: enrolled.zelfProof, faceBase64: ALICE_FACE });
    log("Identifier", ok.identifier);
    log("Revealed private metadata", ok.metadata);
    assert(ok.metadata?.userId === "42", "expected private metadata to be revealed");

    console.log("\n== Authentication (decrypt) with a different face ==");
    try {
      await client.decrypt({ zelfProof: enrolled.zelfProof, faceBase64: MALLORY_FACE });
      throw new Error("expected a different face to be rejected");
    } catch (err) {
      if (err instanceof HumanAuthnApiError) {
        log("Rejected as expected", { status: err.status, code: err.code, message: err.message });
      } else {
        throw err;
      }
    }

    console.log("\n\u2705 End-to-end HumanAuthn flow completed successfully.");
  } finally {
    if (mock) await mock.close();
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

main().catch((err) => {
  console.error("\n\u274c Demo failed:", err);
  process.exitCode = 1;
});
