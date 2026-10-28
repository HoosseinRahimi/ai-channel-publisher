import { useAuth } from "@/_core/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReactNode } from "react";
import { Redirect } from "wouter";

/** Route guard for owner-only pages (Team and Audit). */
export default function OwnerOnly({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth();
  if (loading || !user) {
    return (
      <DashboardLayout>
        <Skeleton className="h-64 w-full" />
      </DashboardLayout>
    );
  }
  if (user.role !== "owner") return <Redirect to="/" />;
  return <>{children}</>;
}
