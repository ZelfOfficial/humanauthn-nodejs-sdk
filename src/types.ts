/**
 * Public type definitions for the HumanAuthn Node.js SDK.
 *
 * These mirror the online (HTTP API) HumanAuthn primitive exposed by Verifik
 * (the `human-id` endpoints): an authentication + encryption primitive that
 * turns a live biometric sample plus stored entropy into a verifiable
 * credential — a HumanID, represented on the wire as a `zelfProof` token.
 *
 * @see https://docs.verifik.co/biometrics/humanID-encrypt/
 * @see https://docs.verifik.co/biometrics/humanID-decrypt/
 */

/** Operating system the biometric sample was captured on. */
export type OperatingSystem = "DESKTOP" | "ANDROID" | "IOS";

/** Liveness anti-spoof strictness. Defaults to `HARDENED` when liveness is required. */
export type Tolerance = "SOFT" | "REGULAR" | "HARDENED" | "REGULAR_HARD" | "REGULAR_SOFT";

/** String key-value map. Verifik requires `publicData`/`metadata` to be string pairs. */
export type StringMap = Record<string, string>;

/** Configuration for constructing a {@link HumanAuthnClient}. */
export interface HumanAuthnClientOptions {
  /**
   * Verifik API token (a client JWT, e.g. the `VERIFIK_CLIENT_JWT` secret).
   * Sent as `Authorization: Bearer <apiKey>`. Required.
   */
  apiKey: string;
  /** Base URL of the Verifik API. Defaults to `https://api.verifik.co`. */
  baseUrl?: string;
  /** Default operating system applied to requests that don't set one. Defaults to `DESKTOP`. */
  defaultOs?: OperatingSystem;
  /** Per-request timeout in milliseconds. Defaults to 30000. */
  timeoutMs?: number;
  /** Number of automatic retries for transient (5xx / network) failures. Defaults to 2. */
  maxRetries?: number;
  /** Custom fetch implementation. Defaults to the global `fetch`. */
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
  /** Base64-encoded facial image (raw base64 or a `data:` URI). */
  faceBase64: string;
  /** Unique, alphanumeric identifier (no spaces or special characters). */
  identifier: string;
  /** Public data stored with the HumanID (string key-value pairs). */
  publicData: StringMap;
  /** Private metadata encrypted into the HumanID (string key-value pairs). */
  metadata: StringMap;
  /** Operating system of the capture. Defaults to the client's `defaultOs`. */
  os?: OperatingSystem;
  /** Require a live face when decrypting later. Defaults to `false`. */
  requireLiveness?: boolean;
  /** Require a live face when creating the HumanID. */
  livenessDetectionPriorCreation?: boolean;
  /** Liveness anti-spoof strictness. */
  tolerance?: Tolerance;
  /** Optional password required to decrypt later. */
  password?: string;
  /** Optional reference face image (base64). */
  referenceFaceBase64?: string;
  /** Optional verifier key. */
  verifierKey?: string;
}

/** Result of a successful {@link HumanAuthnClient.encrypt}. */
export interface EncryptResult {
  /** The HumanID token; present it to {@link HumanAuthnClient.decrypt} to authenticate. */
  zelfProof: string;
  /** IPFS storage metadata for the HumanID, when returned. */
  ipfs?: Record<string, unknown>;
  /** Public data echoed back by the API, when returned. */
  publicData?: StringMap;
  /** Credit accounting for the operation, when returned. */
  credits?: Record<string, unknown>;
  /** Any additional fields returned by the API. */
  [key: string]: unknown;
}

/** Result of a successful {@link HumanAuthnClient.encryptQrCode}. */
export interface EncryptQrCodeResult extends EncryptResult {
  /** The HumanID rendered as a QR code (typically a base64 PNG data URI), when returned. */
  qrCode?: string;
}

/** Parameters for the authentication (decrypt) phase. */
export interface DecryptParams {
  /** HumanID token returned by {@link HumanAuthnClient.encrypt}. */
  zelfProof: string;
  /** Live base64-encoded facial image of the HumanID owner. */
  faceBase64: string;
  /** Operating system of the capture. Defaults to the client's `defaultOs`. */
  os?: OperatingSystem;
  /** Password, if the HumanID was created with one. */
  password?: string;
  /** Optional verifier key. */
  verifierKey?: string;
}

/**
 * Result of a successful {@link HumanAuthnClient.decrypt}. Successful decryption
 * *is* the authentication: it only occurs when the live face reconstructs the
 * key, at which point the private metadata is revealed.
 */
export interface DecryptResult {
  /** Identifier the HumanID was created with. */
  identifier?: string;
  /** Private metadata revealed on successful authentication. */
  metadata?: StringMap;
  /** Public data stored with the HumanID. */
  publicData?: StringMap;
  /** Cropped image of the verified face, when returned. */
  faceCropBase64?: string;
  /** Verification difficulty (`EASY`, `MEDIUM`, `HARD`), when returned. */
  difficulty?: string;
  /** Whether liveness was required for this HumanID. */
  requiredLiveness?: boolean;
  /** Whether credits were charged for this verification. */
  charged?: boolean;
  /** Any additional fields returned by the API. */
  [key: string]: unknown;
}

/** Parameters for {@link HumanAuthnClient.preview}. */
export interface PreviewParams {
  /** HumanID token to inspect. */
  zelfProof: string;
}

/** Result of {@link HumanAuthnClient.preview}. */
export interface PreviewResult {
  /** Public data configured by the developer at encryption time. */
  publicData?: StringMap;
  /** Whether the HumanID requires liveness. */
  requiredLiveness?: boolean;
  /** Whether the HumanID is password protected. */
  passwordProtected?: boolean;
  /** Any additional fields returned by the API. */
  [key: string]: unknown;
}
