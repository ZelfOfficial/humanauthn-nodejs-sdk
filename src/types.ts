/**
 * Public type definitions for the HumanAuthn Node.js SDK.
 *
 * These mirror the online (HTTP API) HumanAuthn primitive exposed by Verifik:
 * an authentication + encryption primitive that turns a live biometric sample
 * plus stored entropy into a verifiable credential called a HumanID.
 */

/** A base64-encoded image payload (data URIs are accepted and normalized). */
export type Base64Image = string;

/**
 * Arbitrary JSON-serializable metadata. `private` metadata is encrypted inside
 * the HumanID and only revealed on a successful biometric decryption, while
 * `public` metadata is readable by anyone via {@link preview}.
 */
export type Metadata = Record<string, unknown>;

/** Configuration for constructing a {@link HumanAuthnClient}. */
export interface HumanAuthnClientOptions {
  /** API token issued by Verifik. Required for every request. */
  apiKey: string;
  /** Base URL of the HumanAuthn API. Defaults to the Verifik production host. */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Defaults to 30000. */
  timeoutMs?: number;
  /** Number of automatic retries for transient (5xx / network) failures. Defaults to 2. */
  maxRetries?: number;
  /**
   * Custom fetch implementation. Defaults to the global `fetch`. Useful for
   * testing or for pinning a specific HTTP agent.
   */
  fetch?: FetchLike;
  /** Extra headers merged into every request. */
  defaultHeaders?: Record<string, string>;
}

/** Minimal structural type compatible with the WHATWG `fetch` function. */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<FetchLikeResponse>;

export interface FetchLikeResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

/** Parameters for the enrollment (encrypt) phase. */
export interface EncryptParams {
  /** Live biometric sample as a base64-encoded image. */
  image: Base64Image;
  /** Private metadata encrypted into the HumanID. */
  metadata?: Metadata;
  /** Public metadata, readable without biometric verification. */
  publicMetadata?: Metadata;
  /** Optional additional password layer required to decrypt later. */
  password?: string;
  /** Require liveness detection on the provided sample. Defaults to `true`. */
  liveness?: boolean;
}

/** Result of a successful {@link HumanAuthnClient.encrypt}. */
export interface EncryptResult {
  /** Opaque HumanID token used for later verification. */
  humanId: string;
  /** Public metadata stored alongside the credential, if any. */
  publicMetadata?: Metadata;
  /** Server-reported creation timestamp (ISO 8601), when available. */
  createdAt?: string;
}

/** Parameters for the {@link HumanAuthnClient.encryptQrCode} call. */
export type EncryptQrCodeParams = EncryptParams;

/** Result of a successful {@link HumanAuthnClient.encryptQrCode}. */
export interface EncryptQrCodeResult extends EncryptResult {
  /** The HumanID rendered as a QR code (base64-encoded PNG data URI). */
  qrCode: string;
}

/** Parameters for the authentication (decrypt) phase. */
export interface DecryptParams {
  /** HumanID token returned from a previous encrypt call. */
  humanId: string;
  /** Live biometric sample as a base64-encoded image. */
  image: Base64Image;
  /** Password, if the HumanID was created with one. */
  password?: string;
}

/** Result of {@link HumanAuthnClient.decrypt}. */
export interface DecryptResult {
  /** Whether the live sample reconstructed the key and authenticated the user. */
  authenticated: boolean;
  /** Private metadata revealed on successful authentication. */
  metadata?: Metadata;
}

/** Parameters for {@link HumanAuthnClient.preview}. */
export interface PreviewParams {
  /** HumanID token to inspect. */
  humanId: string;
}

/** Result of {@link HumanAuthnClient.preview}. */
export interface PreviewResult {
  /** Public metadata configured by the developer at encryption time. */
  publicMetadata?: Metadata;
  /** Whether the HumanID requires a password in addition to biometrics. */
  passwordProtected?: boolean;
  /** Server-reported creation timestamp (ISO 8601), when available. */
  createdAt?: string;
}
