import { HumanAuthnConfigError } from "./errors.js";
import { HttpClient } from "./http.js";
import type {
  DecryptParams,
  DecryptResult,
  EncryptParams,
  EncryptQrCodeParams,
  EncryptQrCodeResult,
  EncryptResult,
  FetchLike,
  HumanAuthnClientOptions,
  PreviewParams,
  PreviewResult,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.verifik.co";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;

/**
 * Client for the online (HTTP API) version of HumanAuthn.
 *
 * @example
 * ```ts
 * const client = new HumanAuthnClient({ apiKey: process.env.HUMANAUTHN_API_KEY! });
 * const { humanId } = await client.encrypt({ image, metadata: { userId: "42" } });
 * const { authenticated } = await client.decrypt({ humanId, image: liveSample });
 * ```
 */
export class HumanAuthnClient {
  private readonly http: HttpClient;

  constructor(options: HumanAuthnClientOptions) {
    if (!options || typeof options.apiKey !== "string" || options.apiKey.trim() === "") {
      throw new HumanAuthnConfigError(
        "A non-empty `apiKey` is required to construct a HumanAuthnClient.",
      );
    }

    const fetchImpl = resolveFetch(options.fetch);
    this.http = new HttpClient({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
      fetchImpl,
      defaultHeaders: options.defaultHeaders ?? {},
    });
  }

  /**
   * Enrollment phase. Encrypts identity metadata against a live biometric
   * sample and returns a HumanID token for future verification.
   */
  async encrypt(params: EncryptParams): Promise<EncryptResult> {
    requireImage(params.image, "encrypt");
    const body = buildEncryptBody(params);
    const data = await this.http.post<RawEncryptResponse>("/v2/human-authn/encrypt", body);
    return normalizeEncryptResult(data);
  }

  /** Like {@link encrypt}, but also returns the HumanID rendered as a QR code. */
  async encryptQrCode(params: EncryptQrCodeParams): Promise<EncryptQrCodeResult> {
    requireImage(params.image, "encryptQrCode");
    const body = buildEncryptBody(params);
    const data = await this.http.post<RawEncryptResponse>(
      "/v2/human-authn/encrypt-qr-code",
      body,
    );
    const base = normalizeEncryptResult(data);
    return { ...base, qrCode: data.qrCode ?? data.qrCodeImage ?? "" };
  }

  /**
   * Authentication phase. Verifies a live biometric sample against a HumanID
   * and, on success, reveals the private metadata.
   */
  async decrypt(params: DecryptParams): Promise<DecryptResult> {
    requireHumanId(params.humanId, "decrypt");
    requireImage(params.image, "decrypt");
    const data = await this.http.post<RawDecryptResponse>("/v2/human-authn/decrypt", {
      humanId: params.humanId,
      image: normalizeImage(params.image),
      ...(params.password ? { password: params.password } : {}),
    });
    return {
      authenticated: Boolean(data.authenticated ?? data.verified ?? data.success),
      ...(data.metadata !== undefined ? { metadata: data.metadata } : {}),
    };
  }

  /** Reads the public, non-sensitive information of a HumanID without biometrics. */
  async preview(params: PreviewParams): Promise<PreviewResult> {
    requireHumanId(params.humanId, "preview");
    const data = await this.http.post<RawPreviewResponse>("/v2/human-authn/preview", {
      humanId: params.humanId,
    });
    return {
      ...(data.publicMetadata !== undefined ? { publicMetadata: data.publicMetadata } : {}),
      ...(data.passwordProtected !== undefined
        ? { passwordProtected: data.passwordProtected }
        : {}),
      ...(data.createdAt !== undefined ? { createdAt: data.createdAt } : {}),
    };
  }
}

interface RawEncryptResponse {
  humanId?: string;
  humanID?: string;
  id?: string;
  publicMetadata?: Record<string, unknown>;
  createdAt?: string;
  qrCode?: string;
  qrCodeImage?: string;
}

interface RawDecryptResponse {
  authenticated?: boolean;
  verified?: boolean;
  success?: boolean;
  metadata?: Record<string, unknown>;
}

interface RawPreviewResponse {
  publicMetadata?: Record<string, unknown>;
  passwordProtected?: boolean;
  createdAt?: string;
}

function buildEncryptBody(params: EncryptParams): Record<string, unknown> {
  return {
    image: normalizeImage(params.image),
    liveness: params.liveness ?? true,
    ...(params.metadata ? { metadata: params.metadata } : {}),
    ...(params.publicMetadata ? { publicMetadata: params.publicMetadata } : {}),
    ...(params.password ? { password: params.password } : {}),
  };
}

function normalizeEncryptResult(data: RawEncryptResponse): EncryptResult {
  const humanId = data.humanId ?? data.humanID ?? data.id;
  if (!humanId) {
    throw new HumanAuthnConfigError(
      "HumanAuthn API response did not include a HumanID token.",
    );
  }
  return {
    humanId,
    ...(data.publicMetadata !== undefined ? { publicMetadata: data.publicMetadata } : {}),
    ...(data.createdAt !== undefined ? { createdAt: data.createdAt } : {}),
  };
}

/** Strip a `data:` URI prefix so callers can pass either form. */
function normalizeImage(image: string): string {
  const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,(.*)$/s.exec(image);
  return match ? match[1]! : image;
}

function requireImage(image: unknown, method: string): void {
  if (typeof image !== "string" || image.trim() === "") {
    throw new HumanAuthnConfigError(`\`image\` is required for ${method}().`);
  }
}

function requireHumanId(humanId: unknown, method: string): void {
  if (typeof humanId !== "string" || humanId.trim() === "") {
    throw new HumanAuthnConfigError(`\`humanId\` is required for ${method}().`);
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
