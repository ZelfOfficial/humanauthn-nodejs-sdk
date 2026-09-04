import { HumanAuthnClient } from "@zelf/humanauthn";

// Lazily construct the client so importing this module never throws at build
// time. The Verifik JWT lives only on the server (never expose it to the client).
let client: HumanAuthnClient | undefined;

export function getHumanAuthn(): HumanAuthnClient {
  if (!client) {
    const jwt = process.env.VERIFIK_CLIENT_JWT;
    if (!jwt) throw new Error("Set VERIFIK_CLIENT_JWT (your Verifik client JWT).");
    client = new HumanAuthnClient({ apiKey: jwt });
  }
  return client;
}

// Demo store: replace with your database. Persist the zelfProof per user.
export const zelfProofByUser = new Map<string, string>();
