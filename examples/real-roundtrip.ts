/**
 * Real HumanID round-trip: enroll a face, then authenticate with it.
 *
 * By default it uses the bundled AI-generated synthetic face
 * (./faces/generated-test-face.jpg). To use a different face, supply it locally
 * (it is never committed - face images are biometric data; see .gitignore):
 *
 *   HUMANAUTHN_FACE_IMAGE=/absolute/path/to/your-selfie.jpg
 *   # or a pre-encoded base64 string:
 *   HUMANAUTHN_FACE_BASE64=<base64>
 *
 * Against the real Verifik API (charges credits), set your client JWT:
 *
 *   VERIFIK_CLIENT_JWT=<token> npm run verify:roundtrip
 *
 * With no JWT it runs against a local in-process mock so you can validate the
 * wiring (the mock hashes the image bytes rather than doing real face matching).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { HumanAuthnClient } from "../src/index.js";
import { startMockServer, type MockServerHandle } from "./mock-server.js";

const DEFAULT_FACE = fileURLToPath(new URL("./faces/generated-test-face.jpg", import.meta.url));

function loadFaceBase64(): string {
  const inline = process.env.HUMANAUTHN_FACE_BASE64;
  if (inline && inline.trim() !== "") return inline.trim();

  const path = process.env.HUMANAUTHN_FACE_IMAGE ?? DEFAULT_FACE;
  return readFileSync(path).toString("base64");
}

function log(step: string, detail?: unknown): void {
  const suffix = detail === undefined ? "" : ` ${JSON.stringify(detail)}`;
  console.log(`\u2192 ${step}${suffix}`);
}

async function main(): Promise<void> {
  const faceBase64 = loadFaceBase64();
  const jwt = process.env.VERIFIK_CLIENT_JWT ?? process.env.VERIFIK_TOKEN;

  let mock: MockServerHandle | undefined;
  let apiKey: string;
  let baseUrl: string | undefined;
  if (jwt) {
    apiKey = jwt;
    baseUrl = process.env.HUMANAUTHN_BASE_URL;
    console.log("Running a REAL round-trip against", baseUrl ?? "https://api.verifik.co");
  } else {
    mock = await startMockServer();
    apiKey = mock.apiKey;
    baseUrl = mock.url;
    console.log("No VERIFIK_CLIENT_JWT set - running against a LOCAL mock:", baseUrl);
  }

  const client = new HumanAuthnClient({ apiKey, ...(baseUrl ? { baseUrl } : {}) });
  const identifier = process.env.HUMANAUTHN_IDENTIFIER ?? `test${Date.now()}`;

  try {
    console.log("\n== Enroll (encrypt) ==");
    const enrolled = await client.encrypt({
      faceBase64,
      identifier,
      publicData: { app: "humanauthn-sdk-test" },
      metadata: { note: "round-trip test", createdAt: new Date().toISOString() },
      requireLiveness: false,
    });
    log("HumanID (zelfProof, truncated)", `${enrolled.zelfProof.slice(0, 28)}...`);

    console.log("\n== Preview ==");
    const preview = await client.preview({ zelfProof: enrolled.zelfProof });
    log("Public data", preview.publicData);

    console.log("\n== Authenticate (decrypt) with the same face ==");
    const result = await client.decrypt({ zelfProof: enrolled.zelfProof, faceBase64 });
    log("Identifier", result.identifier);
    log("Revealed private metadata", result.metadata);
    if (result.difficulty) log("Difficulty", result.difficulty);

    console.log("\n\u2705 Round-trip succeeded: the face enrolled and then authenticated.");
  } finally {
    if (mock) await mock.close();
  }
}

main().catch((err) => {
  console.error("\n\u274c Round-trip failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
