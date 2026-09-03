import type { FetchLike, FetchLikeResponse } from "../src/index.js";

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface MockResponse {
  status?: number;
  body?: unknown;
  /** Raw string body (overrides `body` when set). */
  raw?: string;
  /** Throw a network error instead of responding. */
  networkError?: string;
  /** Delay before responding, in ms (used to exercise timeouts). */
  delayMs?: number;
}

/**
 * Build a mock `fetch` that returns queued responses in order. Useful for
 * asserting request shape and simulating retries without real network access.
 */
export function mockFetch(responses: MockResponse[]): {
  fetch: FetchLike;
  calls: RecordedCall[];
} {
  const calls: RecordedCall[] = [];
  let index = 0;

  const fetch: FetchLike = async (url, init) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      headers: init?.headers ?? {},
      body: init?.body ? JSON.parse(init.body) : undefined,
    });

    const spec = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (!spec) throw new Error("mockFetch: no response configured");

    if (spec.delayMs) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, spec.delayMs);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    }

    if (spec.networkError) {
      throw new Error(spec.networkError);
    }

    const status = spec.status ?? 200;
    const raw = spec.raw ?? (spec.body === undefined ? "" : JSON.stringify(spec.body));
    const response: FetchLikeResponse = {
      ok: status >= 200 && status < 300,
      status,
      text: async () => raw,
    };
    return response;
  };

  return { fetch, calls };
}

/** A tiny valid-looking base64 image payload for tests. */
export const SAMPLE_IMAGE =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
