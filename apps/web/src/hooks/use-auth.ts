import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { ApiError, api, call } from "@/lib/api";
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
    if (data) setUser(data);
    else if (is401) clearUser();
  }, [data, is401, setUser, clearUser]);

  const user = data ?? (is401 ? null : cached);
  return {
    user,
    isLoading: isLoading && !cached,
    isAuthenticated: !!user,
  };
}

export function useLogout() {
  const qc = useQueryClient();
  const clearUser = useAuthStore((s) => s.clearUser);
  return async () => {
    await api.auth.logout.post();
    clearUser();
    qc.clear();
  };
}
