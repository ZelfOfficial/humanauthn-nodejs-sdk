import { describe, expect, it } from "vitest";
import {
  HumanAuthnApiError,
  HumanAuthnClient,
  HumanAuthnTimeoutError,
} from "../src/index.js";
import { mockFetch, SAMPLE_IMAGE } from "./helpers.js";

describe("retries and resilience", () => {
  it("retries transient 5xx failures and eventually succeeds", async () => {
    const { fetch, calls } = mockFetch([
      { status: 503, body: { message: "temporarily unavailable" } },
      { status: 200, body: { humanId: "hid_retry" } },
    ]);
    const client = new HumanAuthnClient({
      apiKey: "token",
      baseUrl: "https://api.example.test",
      fetch,
      maxRetries: 2,
    });

    const result = await client.encrypt({ image: SAMPLE_IMAGE });
    expect(result.humanId).toBe("hid_retry");
    expect(calls).toHaveLength(2);
  });

  it("gives up after exhausting retries and throws the API error", async () => {
    const { fetch, calls } = mockFetch([{ status: 500, body: { message: "boom" } }]);
    const client = new HumanAuthnClient({
      apiKey: "token",
      baseUrl: "https://api.example.test",
      fetch,
      maxRetries: 1,
    });

    await expect(client.encrypt({ image: SAMPLE_IMAGE })).rejects.toBeInstanceOf(
      HumanAuthnApiError,
    );
    // Initial attempt + 1 retry.
    expect(calls).toHaveLength(2);
  });

  it("does not retry 4xx client errors", async () => {
    const { fetch, calls } = mockFetch([{ status: 400, body: { message: "bad request" } }]);
    const client = new HumanAuthnClient({
      apiKey: "token",
      baseUrl: "https://api.example.test",
      fetch,
      maxRetries: 3,
    });

    await expect(client.encrypt({ image: SAMPLE_IMAGE })).rejects.toBeInstanceOf(
      HumanAuthnApiError,
    );
    expect(calls).toHaveLength(1);
  });

  it("raises a timeout error when the request is too slow", async () => {
    const { fetch } = mockFetch([{ delayMs: 1000, body: { humanId: "late" } }]);
    const client = new HumanAuthnClient({
      apiKey: "token",
      baseUrl: "https://api.example.test",
      fetch,
      timeoutMs: 25,
      maxRetries: 0,
    });

    await expect(client.encrypt({ image: SAMPLE_IMAGE })).rejects.toBeInstanceOf(
      HumanAuthnTimeoutError,
    );
  });
});
