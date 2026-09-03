import { describe, expect, it } from "vitest";
import {
  HumanAuthnApiError,
  HumanAuthnClient,
  HumanAuthnConfigError,
} from "../src/index.js";
import { mockFetch, SAMPLE_IMAGE } from "./helpers.js";

function makeClient(fetch: ReturnType<typeof mockFetch>["fetch"]) {
  return new HumanAuthnClient({
    apiKey: "test-jwt",
    baseUrl: "https://api.example.test",
    fetch,
    maxRetries: 0,
  });
}

const validEncrypt = {
  faceBase64: SAMPLE_IMAGE,
  identifier: "user42",
  publicData: { org: "zelf" },
  metadata: { userId: "42" },
};

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
  it("sends auth header, normalizes the body, and returns the zelfProof", async () => {
    const { fetch, calls } = mockFetch([
      { body: { zelfProof: "zp_abc", credits: { amount: -0.84 } } },
    ]);
    const client = makeClient(fetch);

    const result = await client.encrypt({
      ...validEncrypt,
      faceBase64: `data:image/png;base64,${SAMPLE_IMAGE}`,
      requireLiveness: true,
      tolerance: "HARDENED",
    });

    expect(result.zelfProof).toBe("zp_abc");
    expect(result.credits).toEqual({ amount: -0.84 });

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe("https://api.example.test/v2/zelf-proof/encrypt");
    expect(call.method).toBe("POST");
    expect(call.headers.authorization).toBe("Bearer test-jwt");
    expect(call.body).toMatchObject({
      faceBase64: SAMPLE_IMAGE, // data URI prefix stripped
      identifier: "user42",
      publicData: { org: "zelf" },
      metadata: { userId: "42" },
      os: "DESKTOP", // default applied
      requireLiveness: true,
      tolerance: "HARDENED",
    });
  });

  it("honors a custom default OS", async () => {
    const { fetch, calls } = mockFetch([{ body: { zelfProof: "zp" } }]);
    const client = new HumanAuthnClient({
      apiKey: "jwt",
      baseUrl: "https://api.example.test",
      fetch,
      defaultOs: "IOS",
    });
    await client.encrypt(validEncrypt);
    expect(calls[0]!.body).toMatchObject({ os: "IOS" });
  });

  it("requires a faceBase64", async () => {
    const { fetch } = mockFetch([{ body: {} }]);
    const client = makeClient(fetch);
    // @ts-expect-error missing faceBase64
    await expect(client.encrypt({ ...validEncrypt, faceBase64: undefined })).rejects.toBeInstanceOf(
      HumanAuthnConfigError,
    );
  });

  it("rejects a non-alphanumeric identifier", async () => {
    const { fetch } = mockFetch([{ body: {} }]);
    const client = makeClient(fetch);
    await expect(
      client.encrypt({ ...validEncrypt, identifier: "user 42!" }),
    ).rejects.toBeInstanceOf(HumanAuthnConfigError);
  });

  it("rejects non-string metadata values", async () => {
    const { fetch } = mockFetch([{ body: {} }]);
    const client = makeClient(fetch);
    await expect(
      // @ts-expect-error metadata must be string values
      client.encrypt({ ...validEncrypt, metadata: { userId: 42 } }),
    ).rejects.toBeInstanceOf(HumanAuthnConfigError);
  });

  it("throws when the API omits a zelfProof", async () => {
    const { fetch } = mockFetch([{ body: { publicData: {} } }]);
    const client = makeClient(fetch);
    await expect(client.encrypt(validEncrypt)).rejects.toBeInstanceOf(HumanAuthnConfigError);
  });
});

describe("decrypt", () => {
  it("reveals the identifier and private metadata on success", async () => {
    const { fetch, calls } = mockFetch([
      { body: { identifier: "user42", metadata: { userId: "42" }, difficulty: "EASY" } },
    ]);
    const client = makeClient(fetch);

    const result = await client.decrypt({ zelfProof: "zp_abc", faceBase64: SAMPLE_IMAGE });

    expect(result.identifier).toBe("user42");
    expect(result.metadata).toEqual({ userId: "42" });
    expect(result.difficulty).toBe("EASY");
    expect(calls[0]!.url).toBe("https://api.example.test/v2/zelf-proof/decrypt");
    expect(calls[0]!.body).toMatchObject({
      zelfProof: "zp_abc",
      faceBase64: SAMPLE_IMAGE,
      os: "DESKTOP",
    });
  });

  it("surfaces a failed match as an API error", async () => {
    const { fetch } = mockFetch([
      { status: 409, body: { message: "Face verification failed", code: "FaceVerificationFailed" } },
    ]);
    const client = makeClient(fetch);
    await expect(
      client.decrypt({ zelfProof: "zp_abc", faceBase64: SAMPLE_IMAGE }),
    ).rejects.toBeInstanceOf(HumanAuthnApiError);
  });

  it("requires a zelfProof", async () => {
    const { fetch } = mockFetch([{ body: {} }]);
    const client = makeClient(fetch);
    // @ts-expect-error missing zelfProof
    await expect(client.decrypt({ faceBase64: SAMPLE_IMAGE })).rejects.toBeInstanceOf(
      HumanAuthnConfigError,
    );
  });
});

describe("preview", () => {
  it("returns public data without biometrics", async () => {
    const { fetch, calls } = mockFetch([
      { body: { publicData: { org: "zelf" }, passwordProtected: true } },
    ]);
    const client = makeClient(fetch);
    const result = await client.preview({ zelfProof: "zp_abc" });
    expect(result.publicData).toEqual({ org: "zelf" });
    expect(result.passwordProtected).toBe(true);
    expect(calls[0]!.body).toEqual({ zelfProof: "zp_abc" });
  });
});

describe("error handling", () => {
  it("maps a 401 to an auth error", async () => {
    const { fetch } = mockFetch([
      { status: 401, body: { message: "Authentication required", code: "UNAUTHORIZED" } },
    ]);
    const client = makeClient(fetch);
    try {
      await client.encrypt(validEncrypt);
      throw new Error("expected to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(HumanAuthnApiError);
      const apiErr = err as HumanAuthnApiError;
      expect(apiErr.status).toBe(401);
      expect(apiErr.code).toBe("UNAUTHORIZED");
      expect(apiErr.isAuthError).toBe(true);
      expect(apiErr.message).toBe("Authentication required");
    }
  });
});
