import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const";
import { ForbiddenError } from "../shared/_core/errors";
import { parse as parseCookieHeader } from "cookie";
import type { ShimRequest as Request } from "./expressShim";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../schema";
import * as db from "../db";
import { ENV } from "./env";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = { openId: string; appId: string; name: string };

class SDKServer {
  private getSessionSecret() {
    return new TextEncoder().encode(ENV.cookieSecret);
  }

  async createSessionToken(openId: string, options: { expiresInMs?: number; name?: string } = {}): Promise<string> {
    return this.signSession({ openId, appId: ENV.appId, name: options.name || "" }, options);
  }

  async signSession(payload: SessionPayload, options: { expiresInMs?: number } = {}): Promise<string> {
    const expirationSeconds = Math.floor((Date.now() + (options.expiresInMs ?? ONE_YEAR_MS)) / 1000);
    return new SignJWT(payload)
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(this.getSessionSecret());
  }

  async verifySession(cookieValue: string | undefined | null): Promise<SessionPayload | null> {
    if (!cookieValue) return null;
    try {
      const { payload } = await jwtVerify(cookieValue, this.getSessionSecret(), { algorithms: ["HS256"] });
      const { openId, appId, name } = payload as Record<string, unknown>;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) return null;
      return { openId, appId, name };
    } catch {
      return null;
    }
  }

  async authenticateRequest(req: Request): Promise<User> {
    const cookies = parseCookieHeader(req.headers.cookie ?? "");
    let sessionToken = cookies[COOKIE_NAME];
    const authHeader = req.headers.authorization;
    if (!sessionToken && authHeader?.startsWith("Bearer ")) sessionToken = authHeader.slice("Bearer ".length);

    const session = await this.verifySession(sessionToken);
    if (!session || session.appId !== ENV.appId) throw ForbiddenError("Invalid session cookie");
    const user = await db.getUserByOpenId(session.openId);
    if (!user) throw ForbiddenError("User not found");
    await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
    return user;
  }
}

export const sdk = new SDKServer();
