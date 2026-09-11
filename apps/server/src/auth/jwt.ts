import { SignJWT, jwtVerify } from "jose";

const secret = () => new TextEncoder().encode(process.env.JWT_SECRET ?? "dev-secret-change-me");

export interface Claims { accountId: string; playerId?: string; kingdomId?: string }

export async function signAccess(c: Claims, ttl = "7d"): Promise<string> {
  return new SignJWT({ ...c }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(ttl).sign(secret());
}

export async function verifyAccess(token: string): Promise<Claims> {
  const { payload } = await jwtVerify(token, secret());
  return { accountId: String(payload.accountId), playerId: payload.playerId as string | undefined, kingdomId: payload.kingdomId as string | undefined };
}
