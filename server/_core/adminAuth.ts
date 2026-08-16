import { verifyPassword } from "@shared/password";
import type { InsertUser } from "../../drizzle/schema";
import { ENV } from "./env";

export async function verifyAdminCredentials(username: string, password: string): Promise<boolean> {
  if (username !== ENV.adminUsername || !ENV.adminPasswordHash) return false;
  return verifyPassword(password, ENV.adminPasswordHash);
}

export function getAdminIdentity(): InsertUser {
  return {
    openId: ENV.adminUserId,
    name: ENV.adminDisplayName,
    email: null,
    loginMethod: "password",
    role: "admin",
    lastSignedIn: new Date(),
  };
}
