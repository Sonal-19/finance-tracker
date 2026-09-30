import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  Link,
  Outlet,
} from "@tanstack/react-router";
import { Toaster } from "sonner";
import { ConfirmHost } from "@/components/common/confirm-dialog";
import { useIsMobile } from "@/hooks/use-media-query";
import { useThemeStore } from "@/stores/theme-store";

interface RouterContext {
  queryClient: QueryClient;
}

function Root() {
  const isMobile = useIsMobile();
  const theme = useThemeStore((s) => s.theme);
  return (
    <>
      <Outlet />
      <ConfirmHost />
      <Toaster
        position={isMobile ? "top-center" : "bottom-right"}
        richColors
        closeButton
        theme={theme}
        offset={
          isMobile
            ? { top: "calc(env(safe-area-inset-top) + 12px)" }
            : undefined
        }
      />
    </>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Root,
  notFoundComponent: () => (
    <div className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <p className="text-6xl font-bold text-primary">404</p>
        <p className="mt-3 text-muted-foreground">
          This page could not be found.
        </p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-full bg-primary px-6 py-2.5 font-semibold text-primary-foreground"
        >
          Go home
        </Link>
      </div>
    </div>
  ),
});
