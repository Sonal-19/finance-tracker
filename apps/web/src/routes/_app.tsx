import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/app/app-shell";
import { Logo } from "@/components/common/logo";
import { Spinner } from "@/components/common/states";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

function AppLayout() {
  const { user, isLoading } = useAuth();

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

  return (
    <AppShell user={user}>
      <Outlet />
    </AppShell>
  );
}
