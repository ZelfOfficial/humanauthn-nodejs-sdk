import { describe, expect, it } from "vitest";
import {
  HumanAuthnApiError,
  HumanAuthnClient,
  HumanAuthnTimeoutError,
} from "../src/index.js";
import { mockFetch, SAMPLE_IMAGE } from "./helpers.js";

const validEncrypt = {
  faceBase64: SAMPLE_IMAGE,
  identifier: "user42",
  publicData: { org: "zelf" },
  metadata: { userId: "42" },
};

function makeClient(fetch: ReturnType<typeof mockFetch>["fetch"], maxRetries: number, timeoutMs?: number) {
  return new HumanAuthnClient({
    apiKey: "jwt",
    baseUrl: "https://api.example.test",
    fetch,
    maxRetries,
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
  });
}

describe("retries and resilience", () => {
  it("retries transient 5xx failures and eventually succeeds", async () => {
    const { fetch, calls } = mockFetch([
      { status: 503, body: { message: "temporarily unavailable" } },
      { status: 200, body: { zelfProof: "zp_retry" } },
    ]);
    const client = makeClient(fetch, 2);

    const result = await client.encrypt(validEncrypt);
    expect(result.zelfProof).toBe("zp_retry");
    expect(calls).toHaveLength(2);
  });

  it("gives up after exhausting retries and throws the API error", async () => {
    const { fetch, calls } = mockFetch([{ status: 500, body: { message: "boom" } }]);
    const client = makeClient(fetch, 1);

    await expect(client.encrypt(validEncrypt)).rejects.toBeInstanceOf(HumanAuthnApiError);
    expect(calls).toHaveLength(2); // initial attempt + 1 retry
  });

  it("does not retry 4xx client errors", async () => {
    const { fetch, calls } = mockFetch([{ status: 400, body: { message: "bad request" } }]);
    const client = makeClient(fetch, 3);

    await expect(client.encrypt(validEncrypt)).rejects.toBeInstanceOf(HumanAuthnApiError);
    expect(calls).toHaveLength(1);
  });

  it("raises a timeout error when the request is too slow", async () => {
    const { fetch } = mockFetch([{ delayMs: 1000, body: { zelfProof: "late" } }]);
    const client = makeClient(fetch, 0, 25);

    await expect(client.encrypt(validEncrypt)).rejects.toBeInstanceOf(HumanAuthnTimeoutError);
  });
});
