import { createHash, randomBytes } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A tiny in-memory stand-in for Verifik's online HumanAuthn (`human-id`) API.
 * It implements just enough of the
 * `/v2/human-id/{encrypt,encrypt-qr-code,decrypt,preview}` contract for the SDK
 * to be exercised end to end over real HTTP without needing Verifik credentials
 * or biometric hardware.
 *
 * A "face" is modeled as the hash of the supplied image bytes: decryption only
 * succeeds when the live sample hashes to the same value used at enrollment,
 * mirroring HumanAuthn's "the right face reconstructs the key" behavior. A
 * mismatched face fails key reconstruction, which the API surfaces as an error.
 */
interface StoredProof {
  faceHash: string;
  identifier: string;
  metadata: Record<string, string>;
  publicData: Record<string, string>;
  password?: string;
  requireLiveness: boolean;
  createdAt: string;
}

export interface MockServerHandle {
  url: string;
  apiKey: string;
  close: () => Promise<void>;
}

const API_KEY = "demo-jwt-token";

export async function startMockServer(): Promise<MockServerHandle> {
  const store = new Map<string, StoredProof>();

  const server: Server = createServer((req, res) => {
    void handle(req, res).catch((err) => {
      send(res, 500, { message: `mock server error: ${String(err)}`, code: "ERROR" });
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.headers.authorization !== `Bearer ${API_KEY}`) {
      return send(res, 401, { message: "Authentication required", code: "UNAUTHORIZED" });
    }

    const body = await readJson(req);
    const url = req.url ?? "";

    if (url.endsWith("/encrypt") || url.endsWith("/encrypt-qr-code")) {
      for (const field of ["faceBase64", "identifier", "publicData", "metadata"]) {
        if (body[field] === undefined) {
          return send(res, 409, { message: `"${field}" is required`, code: "MissingParameter" });
        }
      }
      const zelfProof = randomBytes(48).toString("base64");
      store.set(zelfProof, {
        faceHash: hashFace(body.faceBase64),
        identifier: String(body.identifier),
        metadata: body.metadata as Record<string, string>,
        publicData: body.publicData as Record<string, string>,
        password: body.password as string | undefined,
        requireLiveness: Boolean(body.requireLiveness),
        createdAt: new Date().toISOString(),
      });
      const record = store.get(zelfProof)!;
      const payload: Record<string, unknown> = {
        zelfProof,
        publicData: record.publicData,
        ipfs: {
          url: "https://mock.ipfs.local/ipfs/bafyMockHash",
          IpfsHash: "bafyMockHash",
          pinned: true,
        },
        credits: { amount: -0.84, status: "approved", category: "usage", code: "zelf-proofs" },
      };
      if (url.endsWith("/encrypt-qr-code")) {
        payload.qrCode = `data:image/png;base64,${Buffer.from(zelfProof).toString("base64")}`;
      }
      return send(res, 200, payload);
    }

    if (url.endsWith("/decrypt")) {
      if (body.zelfProof === undefined) {
        return send(res, 409, { message: '"zelfProof" is required', code: "MissingParameter" });
      }
      if (body.faceBase64 === undefined) {
        return send(res, 409, { message: '"faceBase64" is required', code: "MissingParameter" });
      }
      const record = store.get(String(body.zelfProof));
      if (!record) {
        return send(res, 409, { message: "Invalid zelfProof", code: "InvalidProof" });
      }
      const faceMatches = record.faceHash === hashFace(body.faceBase64);
      const passwordMatches = (record.password ?? undefined) === (body.password ?? undefined);
      if (!faceMatches || !passwordMatches) {
        // Key reconstruction failed: decryption is impossible.
        return send(res, 409, {
          message: "Face verification failed",
          code: "FaceVerificationFailed",
        });
      }
      return send(res, 200, {
        identifier: record.identifier,
        metadata: record.metadata,
        publicData: record.publicData,
        faceCropBase64: "/9j/mockcrop",
        difficulty: "EASY",
        requiredLiveness: record.requireLiveness,
        charged: false,
      });
    }

    if (url.endsWith("/preview")) {
      const record = store.get(String(body.zelfProof));
      if (!record) {
        return send(res, 409, { message: "Invalid zelfProof", code: "InvalidProof" });
      }
      return send(res, 200, {
        publicData: record.publicData,
        requiredLiveness: record.requireLiveness,
        passwordProtected: Boolean(record.password),
      });
    }

    return send(res, 404, { message: `Unknown endpoint: ${url}`, code: "not_found" });
  }

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    apiKey: API_KEY,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

function hashFace(image: unknown): string {
  return createHash("sha256").update(String(image)).digest("hex");
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
