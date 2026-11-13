import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/admin-shell";
import { Logo } from "@/components/common/logo";
import { Spinner } from "@/components/common/states";
import { useAuth } from "@/hooks/use-auth";

/** The admin area: its own shell, apart from the finance app. The API
 * enforces `role = admin`; this only keeps others from seeing the frame. */
export const Route = createFileRoute("/_admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const { user, isLoading, isConfirmed } = useAuth();

  if (isLoading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="flex flex-col items-center gap-4">
          <Logo withText={false} iconClassName="size-14 rounded-2xl" />
          <Spinner />
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/" replace />;
  // Wait for the server's answer: the cached profile can predate a promotion.
  if (isConfirmed && user.role !== "admin")
    return <Navigate to="/dashboard" replace />;

  return (
    <AdminShell user={user}>
      <Outlet />
    </AdminShell>
  );
}
