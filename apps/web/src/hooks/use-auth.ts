import { queryOptions, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ApiError, api, call } from "@/lib/api";
import { claimDevice, forgetDevice } from "@/lib/offline/sync";
import { resetPush } from "@/lib/push";
import { useAuthStore } from "@/stores/auth-store";

export const authQueryOptions = queryOptions({
  queryKey: ["auth", "me"] as const,
  queryFn: () => call(api.auth.me.get()),
  retry: false,
  staleTime: 5 * 60 * 1000,
});

export function useAuth() {
  const { user: cached, setUser, clearUser } = useAuthStore();
  const { data, isLoading, error } = useQuery(authQueryOptions);
  const is401 = error instanceof ApiError && error.status === 401;

  useEffect(() => {
    if (data) {
      void claimDevice(data.id);
      setUser(data);
    } else if (is401) clearUser();
  }, [data, is401, setUser, clearUser]);

  const user = data ?? (is401 ? null : cached);
  return {
    user,
    isLoading: isLoading && !cached,
    isAuthenticated: !!user,
    /** True once `/auth/me` has answered; before that `user` may be the
     * locally cached copy (e.g. with an out-of-date role). */
    isConfirmed: !!data,
  };
}

export function useLogout() {
  const clearUser = useAuthStore((s) => s.clearUser);
  return async () => {
    void resetPush();
    await api.auth.logout.post().catch(() => {});
    clearUser();
    await forgetDevice();
  };
}
