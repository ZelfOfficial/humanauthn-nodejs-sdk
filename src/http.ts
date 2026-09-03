import {
  HumanAuthnApiError,
  HumanAuthnConfigError,
  HumanAuthnError,
  HumanAuthnTimeoutError,
} from "./errors.js";
import type { FetchLike } from "./types.js";

export interface HttpClientConfig {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  fetchImpl: FetchLike;
  defaultHeaders: Record<string, string>;
}

const SDK_VERSION = "0.1.0";

/** Small typed HTTP transport with timeouts, retries, and error mapping. */
export class HttpClient {
  constructor(private readonly config: HttpClientConfig) {}

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  private async request<T>(method: string, path: string, body: unknown): Promise<T> {
    const url = this.buildUrl(path);
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${this.config.apiKey}`,
      "user-agent": `humanauthn-nodejs-sdk/${SDK_VERSION}`,
      ...this.config.defaultHeaders,
    };
    const payload = body === undefined ? undefined : JSON.stringify(body);

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await this.sendOnce<T>(method, url, headers, payload);
      } catch (err) {
        lastError = err;
        if (!this.shouldRetry(err) || attempt === this.config.maxRetries) {
          throw err;
        }
        await delay(backoffMs(attempt));
      }
    }
    // Unreachable, but keeps the type checker satisfied.
    throw lastError instanceof Error
      ? lastError
      : new HumanAuthnError("Request failed for an unknown reason");
  }

  private async sendOnce<T>(
    method: string,
    url: string,
    headers: Record<string, string>,
    payload: string | undefined,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    let response;
    try {
      response = await this.config.fetchImpl(url, {
        method,
        headers,
        body: payload,
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new HumanAuthnTimeoutError(this.config.timeoutMs);
      }
      throw new HumanAuthnError(
        `Network request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    const raw = await response.text();
    const parsed = parseJson(raw);

    if (!response.ok) {
      throw toApiError(response.status, parsed, raw);
    }
    return (parsed ?? {}) as T;
  }

  private buildUrl(path: string): string {
    const base = this.config.baseUrl.replace(/\/+$/, "");
    const suffix = path.startsWith("/") ? path : `/${path}`;
    return `${base}${suffix}`;
  }

  private shouldRetry(err: unknown): boolean {
    if (err instanceof HumanAuthnApiError) return err.isRetryable;
    // Retry transient network failures but never timeouts or config errors.
    if (err instanceof HumanAuthnTimeoutError) return false;
    if (err instanceof HumanAuthnConfigError) return false;
    return err instanceof HumanAuthnError;
  }
}

function toApiError(status: number, parsed: unknown, raw: string): HumanAuthnApiError {
  let message = `HumanAuthn API request failed with status ${status}`;
  let code: string | undefined;
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.message === "string") message = obj.message;
    else if (typeof obj.error === "string") message = obj.error;
    if (typeof obj.code === "string") code = obj.code;
  } else if (raw) {
    message = `${message}: ${raw.slice(0, 200)}`;
  }
  return new HumanAuthnApiError(message, status, code, parsed);
}

function parseJson(raw: string): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function backoffMs(attempt: number): number {
  // Exponential backoff with a little jitter: 200ms, 400ms, 800ms, ...
  const base = 200 * 2 ** attempt;
  return base + Math.floor(Math.random() * 100);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
