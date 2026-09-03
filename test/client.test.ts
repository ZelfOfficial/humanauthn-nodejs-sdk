import { describe, expect, it } from "vitest";
import {
  HumanAuthnApiError,
  HumanAuthnClient,
  HumanAuthnConfigError,
} from "../src/index.js";
import { mockFetch, SAMPLE_IMAGE } from "./helpers.js";

function makeClient(fetch: ReturnType<typeof mockFetch>["fetch"]) {
  return new HumanAuthnClient({
    apiKey: "test-token",
    baseUrl: "https://api.example.test",
    fetch,
    maxRetries: 0,
  });
}

describe("HumanAuthnClient construction", () => {
  it("throws when no apiKey is provided", () => {
    // @ts-expect-error intentionally invalid
    expect(() => new HumanAuthnClient({})).toThrow(HumanAuthnConfigError);
  });

  it("throws when apiKey is blank", () => {
    expect(() => new HumanAuthnClient({ apiKey: "   " })).toThrow(HumanAuthnConfigError);
  });
});

describe("encrypt", () => {
  it("sends auth header, normalizes body, and returns the HumanID", async () => {
    const { fetch, calls } = mockFetch([
      { body: { humanId: "hid_123", createdAt: "2026-01-01T00:00:00Z" } },
    ]);
    const client = makeClient(fetch);

    const result = await client.encrypt({
      image: `data:image/png;base64,${SAMPLE_IMAGE}`,
      metadata: { userId: "42" },
      publicMetadata: { org: "zelf" },
    });

    expect(result.humanId).toBe("hid_123");
    expect(result.createdAt).toBe("2026-01-01T00:00:00Z");

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe("https://api.example.test/v2/human-authn/encrypt");
    expect(call.method).toBe("POST");
    expect(call.headers.authorization).toBe("Bearer test-token");
    expect(call.headers["content-type"]).toBe("application/json");
    // The data URI prefix must be stripped before sending.
    expect(call.body).toMatchObject({
      image: SAMPLE_IMAGE,
      liveness: true,
      metadata: { userId: "42" },
      publicMetadata: { org: "zelf" },
    });
  });

  it("requires an image", async () => {
    const { fetch } = mockFetch([{ body: {} }]);
    const client = makeClient(fetch);
    // @ts-expect-error missing image
    await expect(client.encrypt({})).rejects.toBeInstanceOf(HumanAuthnConfigError);
  });

  it("throws when the API omits a HumanID", async () => {
    const { fetch } = mockFetch([{ body: { publicMetadata: {} } }]);
    const client = makeClient(fetch);
    await expect(client.encrypt({ image: SAMPLE_IMAGE })).rejects.toBeInstanceOf(
      HumanAuthnConfigError,
    );
  });
});

describe("encryptQrCode", () => {
  it("returns the QR code alongside the HumanID", async () => {
    const { fetch } = mockFetch([
      { body: { humanId: "hid_qr", qrCode: "data:image/png;base64,QR==" } },
    ]);
    const client = makeClient(fetch);
    const result = await client.encryptQrCode({ image: SAMPLE_IMAGE });
    expect(result.humanId).toBe("hid_qr");
    expect(result.qrCode).toBe("data:image/png;base64,QR==");
  });
});

describe("decrypt", () => {
  it("reports authentication success and reveals metadata", async () => {
    const { fetch, calls } = mockFetch([
      { body: { authenticated: true, metadata: { userId: "42" } } },
    ]);
    const client = makeClient(fetch);

    const result = await client.decrypt({ humanId: "hid_123", image: SAMPLE_IMAGE });

    expect(result.authenticated).toBe(true);
    expect(result.metadata).toEqual({ userId: "42" });
    expect(calls[0]!.url).toBe("https://api.example.test/v2/human-authn/decrypt");
  });

  it("reports a failed match", async () => {
    const { fetch } = mockFetch([{ body: { authenticated: false } }]);
    const client = makeClient(fetch);
    const result = await client.decrypt({ humanId: "hid_123", image: SAMPLE_IMAGE });
    expect(result.authenticated).toBe(false);
    expect(result.metadata).toBeUndefined();
  });

  it("requires a humanId", async () => {
    const { fetch } = mockFetch([{ body: {} }]);
    const client = makeClient(fetch);
    // @ts-expect-error missing humanId
    await expect(client.decrypt({ image: SAMPLE_IMAGE })).rejects.toBeInstanceOf(
      HumanAuthnConfigError,
    );
  });
});

describe("preview", () => {
  it("returns public metadata without biometrics", async () => {
    const { fetch, calls } = mockFetch([
      { body: { publicMetadata: { org: "zelf" }, passwordProtected: true } },
    ]);
    const client = makeClient(fetch);
    const result = await client.preview({ humanId: "hid_123" });
    expect(result.publicMetadata).toEqual({ org: "zelf" });
    expect(result.passwordProtected).toBe(true);
    expect(calls[0]!.body).toEqual({ humanId: "hid_123" });
  });
});

describe("error handling", () => {
  it("maps a 401 to an auth error", async () => {
    const { fetch } = mockFetch([
      { status: 401, body: { message: "Invalid token", code: "unauthorized" } },
    ]);
    const client = makeClient(fetch);
    try {
      await client.encrypt({ image: SAMPLE_IMAGE });
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(HumanAuthnApiError);
      const apiErr = err as HumanAuthnApiError;
      expect(apiErr.status).toBe(401);
      expect(apiErr.code).toBe("unauthorized");
      expect(apiErr.isAuthError).toBe(true);
      expect(apiErr.message).toBe("Invalid token");
    }
  });
});
