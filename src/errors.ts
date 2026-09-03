/** Base class for all errors thrown by the SDK. */
export class HumanAuthnError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    // Restore prototype chain for extending built-ins under some transpile targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when the client is misconfigured (e.g. missing API key). */
export class HumanAuthnConfigError extends HumanAuthnError {}

/** Thrown when a request exceeds the configured timeout. */
export class HumanAuthnTimeoutError extends HumanAuthnError {
  constructor(public readonly timeoutMs: number) {
    super(`Request timed out after ${timeoutMs}ms`);
  }
}

/** Thrown when the API returns a non-2xx response. */
export class HumanAuthnApiError extends HumanAuthnError {
  constructor(
    message: string,
    /** HTTP status code. */
    public readonly status: number,
    /** Machine-readable error code returned by the API, if any. */
    public readonly code?: string,
    /** Raw parsed response body, if any. */
    public readonly details?: unknown,
  ) {
    super(message);
  }

  /** True for authentication/authorization failures (401/403). */
  get isAuthError(): boolean {
    return this.status === 401 || this.status === 403;
  }

  /** True for transient server errors worth retrying. */
  get isRetryable(): boolean {
    return this.status >= 500;
  }
}
