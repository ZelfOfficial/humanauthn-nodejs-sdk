import { NextResponse } from "next/server";
import { HumanAuthnApiError } from "@zelf/humanauthn";
import { getHumanAuthn, zelfProofByUser } from "../../../../lib/human-authn";

export const runtime = "nodejs";

// POST /api/human-id/authenticate  { userId, faceBase64 }
export async function POST(req: Request) {
  const { userId, faceBase64 } = await req.json().catch(() => ({}));
  if (typeof userId !== "string" || typeof faceBase64 !== "string") {
    return NextResponse.json({ error: "userId and faceBase64 are required" }, { status: 400 });
  }

  const zelfProof = zelfProofByUser.get(userId);
  if (!zelfProof) return NextResponse.json({ error: "user not enrolled" }, { status: 404 });

  try {
    // A successful decrypt IS the authentication.
    const result = await getHumanAuthn().decrypt({ zelfProof, faceBase64 });
    // Set your own session cookie here; do not return Verifik internals.
    return NextResponse.json({ authenticated: true, userId: result.identifier });
  } catch (err) {
    // A non-matching face surfaces as a HumanAuthnApiError (not an auth error).
    if (err instanceof HumanAuthnApiError && !err.isAuthError) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }
    const status = err instanceof HumanAuthnApiError ? err.status : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "error" }, { status });
  }
}
