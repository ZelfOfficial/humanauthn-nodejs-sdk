import { createHash } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A tiny in-memory stand-in for the online HumanAuthn API. It implements just
 * enough of the `/encrypt`, `/encrypt-qr-code`, `/decrypt`, and `/preview`
 * contract for the SDK to be exercised end to end over real HTTP without
 * needing Verifik credentials or biometric hardware.
 *
 * A "face" is modeled as the hash of the supplied image bytes: decryption only
 * succeeds when the live sample hashes to the same value used at enrollment,
 * mirroring HumanAuthn's "the right face reconstructs the key" behavior.
 */
interface StoredHumanId {
  faceHash: string;
  metadata?: Record<string, unknown>;
  publicMetadata?: Record<string, unknown>;
  password?: string;
  createdAt: string;
}

export interface MockServerHandle {
  url: string;
  apiKey: string;
  close: () => Promise<void>;
}

const API_KEY = "demo-token";

export async function startMockServer(): Promise<MockServerHandle> {
  const store = new Map<string, StoredHumanId>();
  let counter = 0;

  const server: Server = createServer((req, res) => {
    void handle(req, res).catch((err) => {
      send(res, 500, { message: `mock server error: ${String(err)}` });
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${API_KEY}`) {
      return send(res, 401, { message: "Invalid API token", code: "unauthorized" });
    }

    const body = await readJson(req);
    const url = req.url ?? "";

    if (url.endsWith("/encrypt") || url.endsWith("/encrypt-qr-code")) {
      const humanId = `hid_${(++counter).toString(36)}_${randomSuffix()}`;
      store.set(humanId, {
        faceHash: hashFace(body.image),
        metadata: body.metadata as Record<string, unknown> | undefined,
        publicMetadata: body.publicMetadata as Record<string, unknown> | undefined,
        password: body.password as string | undefined,
        createdAt: new Date().toISOString(),
      });
      const record = store.get(humanId)!;
      const payload: Record<string, unknown> = {
        humanId,
        publicMetadata: record.publicMetadata,
        createdAt: record.createdAt,
      };
      if (url.endsWith("/encrypt-qr-code")) {
        payload.qrCode = `data:image/png;base64,${Buffer.from(humanId).toString("base64")}`;
      }
      return send(res, 200, payload);
    }

    if (url.endsWith("/decrypt")) {
      const record = store.get(String(body.humanId));
      if (!record) return send(res, 404, { message: "HumanID not found", code: "not_found" });
      const faceMatches = record.faceHash === hashFace(body.image);
      const passwordMatches = (record.password ?? undefined) === (body.password ?? undefined);
      const authenticated = faceMatches && passwordMatches;
      return send(res, 200, {
        authenticated,
        metadata: authenticated ? record.metadata : undefined,
      });
    }

    if (url.endsWith("/preview")) {
      const record = store.get(String(body.humanId));
      if (!record) return send(res, 404, { message: "HumanID not found", code: "not_found" });
      return send(res, 200, {
        publicMetadata: record.publicMetadata,
        passwordProtected: Boolean(record.password),
        createdAt: record.createdAt,
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

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
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
  const raw = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(raw);
}
