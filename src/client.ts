import { HumanAuthnConfigError } from "./errors.js";
import { HttpClient } from "./http.js";
import type {
  DecryptParams,
  DecryptResult,
  EncryptParams,
  EncryptQrCodeResult,
  EncryptResult,
  FetchLike,
  HumanAuthnClientOptions,
  OperatingSystem,
  PreviewParams,
  PreviewResult,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.verifik.co";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_OS: OperatingSystem = "DESKTOP";

const IDENTIFIER_PATTERN = /^[a-zA-Z0-9]+$/;

/**
 * Client for the online (HTTP API) version of HumanAuthn, backed by Verifik's
 * `human-id` endpoints (the successor to the deprecated `zelf-proof` routes).
 *
 * @example
 * ```ts
 * const client = new HumanAuthnClient({ apiKey: process.env.VERIFIK_CLIENT_JWT! });
 *
 * const { zelfProof } = await client.encrypt({
 *   faceBase64,
 *   identifier: "user42",
 *   publicData: { org: "Zelf" },
 *   metadata: { userId: "42" },
 * });
 *
 * const { identifier, metadata } = await client.decrypt({ zelfProof, faceBase64: liveSample });
 * ```
 */
export class HumanAuthnClient {
  private readonly http: HttpClient;
  private readonly defaultOs: OperatingSystem;

  constructor(options: HumanAuthnClientOptions) {
    if (!options || typeof options.apiKey !== "string" || options.apiKey.trim() === "") {
      throw new HumanAuthnConfigError(
        "A non-empty `apiKey` (Verifik client JWT) is required to construct a HumanAuthnClient.",
      );
    }

    this.defaultOs = options.defaultOs ?? DEFAULT_OS;
    this.http = new HttpClient({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
      fetchImpl: resolveFetch(options.fetch),
      defaultHeaders: options.defaultHeaders ?? {},
    });
  }

  /**
   * Enrollment phase. Encrypts identity metadata against a live biometric
   * sample and returns a HumanID (`zelfProof`) token for future verification.
   */
  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    const body = this.buildEncryptBody(params);
    const data = await this.http.post<Record<string, unknown>>(
      "/v2/human-id/encrypt",
      body,
    );
    return assertZelfProof(data) as EncryptResult;
  }

  /** Like {@link encrypt}, but also renders the HumanID as a QR code. */
  async encryptQrCode(params: EncryptParams): Promise<EncryptQrCodeResult> {
    const body = this.buildEncryptBody(params);
    const data = await this.http.post<Record<string, unknown>>(
      "/v2/human-id/encrypt-qr-code",
      body,
    );
    return assertZelfProof(data) as EncryptQrCodeResult;
  }

  private buildEncryptBody(params: EncryptParams): Record<string, unknown> {
    requireField(params.faceBase64, "faceBase64", "encrypt");
    requireIdentifier(params.identifier);
    requireStringMap(params.publicData, "publicData", "encrypt");
    requireStringMap(params.metadata, "metadata", "encrypt");

    return {
      faceBase64: normalizeImage(params.faceBase64),
      identifier: params.identifier,
      publicData: params.publicData,
      metadata: params.metadata,
      os: params.os ?? this.defaultOs,
      requireLiveness: params.requireLiveness ?? false,
      ...(params.livenessDetectionPriorCreation !== undefined
        ? { livenessDetectionPriorCreation: params.livenessDetectionPriorCreation }
        : {}),
      ...(params.tolerance ? { tolerance: params.tolerance } : {}),
      ...(params.password ? { password: params.password } : {}),
      ...(params.referenceFaceBase64
        ? { referenceFaceBase64: normalizeImage(params.referenceFaceBase64) }
        : {}),
      ...(params.verifierKey ? { verifierKey: params.verifierKey } : {}),
    };
  }

  /**
   * Authentication phase. Verifies a live biometric sample against a HumanID
   * and, on success, reveals the private metadata. Successful decryption *is*
   * the authentication.
   */
  async decrypt(params: DecryptParams): Promise<DecryptResult> {
    requireField(params.zelfProof, "zelfProof", "decrypt");
    requireField(params.faceBase64, "faceBase64", "decrypt");

    const body: Record<string, unknown> = {
      zelfProof: params.zelfProof,
      faceBase64: normalizeImage(params.faceBase64),
      os: params.os ?? this.defaultOs,
      ...(params.password ? { password: params.password } : {}),
      ...(params.verifierKey ? { verifierKey: params.verifierKey } : {}),
    };

    return this.http.post<DecryptResult>("/v2/human-id/decrypt", body);
  }

  /** Reads the public, non-sensitive data of a HumanID without biometrics. */
  async preview(params: PreviewParams): Promise<PreviewResult> {
    requireField(params.zelfProof, "zelfProof", "preview");
    return this.http.post<PreviewResult>("/v2/human-id/preview", {
      zelfProof: params.zelfProof,
    });
  }
}

function assertZelfProof(data: Record<string, unknown>): Record<string, unknown> {
  if (typeof data.zelfProof !== "string" || data.zelfProof === "") {
    throw new HumanAuthnConfigError(
      "Verifik API response did not include a `zelfProof` token.",
    );
  }
  return data;
}

/** Strip a `data:` URI prefix so callers can pass either form. */
function normalizeImage(image: string): string {
  const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.*)$/s.exec(image);
  return match ? match[1]! : image;
}

function requireField(value: unknown, field: string, method: string): void {
  if (typeof value !== "string" || value.trim() === "") {
    throw new HumanAuthnConfigError(`\`${field}\` is required for ${method}().`);
  }
}

function requireIdentifier(identifier: unknown): void {
  requireField(identifier, "identifier", "encrypt");
  if (!IDENTIFIER_PATTERN.test(identifier as string)) {
    throw new HumanAuthnConfigError(
      "`identifier` must be alphanumeric (no spaces or special characters).",
    );
  }
}

function requireStringMap(value: unknown, field: string, method: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new HumanAuthnConfigError(
      `\`${field}\` is required for ${method}() and must be an object of string values.`,
    );
  }
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (typeof val !== "string") {
      throw new HumanAuthnConfigError(
        `\`${field}.${key}\` must be a string; HumanAuthn only accepts string key-value pairs.`,
      );
    }
  }
}

function resolveFetch(provided: FetchLike | undefined): FetchLike {
  if (provided) return provided;
  if (typeof globalThis.fetch === "function") {
    return globalThis.fetch.bind(globalThis) as unknown as FetchLike;
  }
  throw new HumanAuthnConfigError(
    "No global `fetch` is available. Pass a `fetch` implementation in the client options " +
      "or run on Node.js 18+.",
  );
}
