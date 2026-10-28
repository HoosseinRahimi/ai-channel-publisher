import { useAuth } from "@/_core/hooks/useAuth";

export const ADMIN_ROLES = ["owner", "editor", "viewer"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/** Dashboard capabilities derived from the signed-in account's role. */
export function useRole() {
  const { user } = useAuth();
  const role: AdminRole = user?.role ?? "viewer";
  return {
    role,
    isOwner: role === "owner",
    canEdit: role === "owner" || role === "editor",
    isViewer: role === "viewer",
  };
}
