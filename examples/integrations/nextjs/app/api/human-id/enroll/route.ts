import { NextResponse } from "next/server";
import { HumanAuthnApiError } from "@zelf/humanauthn";
import { getHumanAuthn, zelfProofByUser } from "../../../../lib/human-authn";

// Uses Node.js APIs (fetch) — keep this on the Node runtime, not the Edge one.
export const runtime = "nodejs";

// POST /api/human-id/enroll  { userId, faceBase64 }
export async function POST(req: Request) {
  const { userId, faceBase64 } = await req.json().catch(() => ({}));
  if (typeof userId !== "string" || typeof faceBase64 !== "string") {
    return NextResponse.json({ error: "userId and faceBase64 are required" }, { status: 400 });
  }

  try {
    const { zelfProof } = await getHumanAuthn().encrypt({
      faceBase64,
      identifier: userId, // must be alphanumeric
      publicData: { app: "my-app" },
      metadata: { userId },
      requireLiveness: true,
    });
    zelfProofByUser.set(userId, zelfProof); // persist on the user in a real app
    return NextResponse.json({ enrolled: true }, { status: 201 });
  } catch (err) {
    const status = err instanceof HumanAuthnApiError ? err.status : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "error" }, { status });
  }
}
