/**
 * End-to-end quickstart for humanauthn-nodejs-sdk.
 *
 * By default this runs the real SDK against a local in-process mock of the
 * HumanAuthn API (see ./mock-server.ts), so it works with no credentials:
 *
 *   npm run demo
 *
 * To run against the real Verifik API instead, set:
 *
 *   HUMANAUTHN_API_KEY=<token> HUMANAUTHN_BASE_URL=https://api.verifik.co npm run demo
 */
import { HumanAuthnClient } from "../src/index.js";
import { startMockServer, type MockServerHandle } from "./mock-server.js";

// Two distinct "faces". With the real API these would be live camera captures;
// here they are just distinct byte payloads the mock treats as different people.
const ALICE_FACE = Buffer.from("alice-live-biometric-sample").toString("base64");
const MALLORY_FACE = Buffer.from("mallory-live-biometric-sample").toString("base64");

function log(step: string, detail?: unknown): void {
  const suffix = detail === undefined ? "" : ` ${JSON.stringify(detail)}`;
  console.log(`\u2192 ${step}${suffix}`);
}

async function main(): Promise<void> {
  const useReal = Boolean(process.env.HUMANAUTHN_API_KEY);
  let mock: MockServerHandle | undefined;

  let apiKey: string;
  let baseUrl: string | undefined;
  if (useReal) {
    apiKey = process.env.HUMANAUTHN_API_KEY!;
    baseUrl = process.env.HUMANAUTHN_BASE_URL;
    console.log("Running against the REAL HumanAuthn API:", baseUrl ?? "(default)");
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
      image: ALICE_FACE,
      metadata: { userId: "user_42", role: "admin" },
      publicMetadata: { org: "Zelf", tier: "pro" },
      liveness: true,
    });
    log("Created HumanID", { humanId: enrolled.humanId });

    console.log("\n== Preview (public metadata, no biometrics) ==");
    const preview = await client.preview({ humanId: enrolled.humanId });
    log("Public metadata", preview.publicMetadata);
    log("Password protected", preview.passwordProtected ?? false);

    console.log("\n== Authentication (decrypt) with the enrolled face ==");
    const ok = await client.decrypt({ humanId: enrolled.humanId, image: ALICE_FACE });
    log("Authenticated", ok.authenticated);
    log("Revealed private metadata", ok.metadata);
    assert(ok.authenticated === true, "expected the enrolled face to authenticate");
    assert(ok.metadata?.userId === "user_42", "expected private metadata to be revealed");

    console.log("\n== Authentication (decrypt) with a different face ==");
    const bad = await client.decrypt({ humanId: enrolled.humanId, image: MALLORY_FACE });
    log("Authenticated", bad.authenticated);
    log("Revealed private metadata", bad.metadata ?? null);
    assert(bad.authenticated === false, "expected a different face to be rejected");
    assert(bad.metadata === undefined, "private metadata must stay hidden on failure");

    console.log("\n== QR code enrollment ==");
    const qr = await client.encryptQrCode({
      image: ALICE_FACE,
      publicMetadata: { org: "Zelf" },
    });
    log("HumanID", { humanId: qr.humanId });
    log("QR code (truncated)", `${qr.qrCode.slice(0, 40)}...`);
    assert(qr.qrCode.length > 0, "expected a QR code payload");

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
