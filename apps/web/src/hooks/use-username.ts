import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, call } from "@/lib/api";
import { normalizeUsername, usernameProblem } from "@/lib/username";

export type UsernameStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "ok" }
  | { state: "bad"; reason: string };

/** Debounced availability check. `current` (your own name) counts as fine. */
export function useUsernameStatus(
  value: string,
  current?: string,
): UsernameStatus {
  const name = normalizeUsername(value);
  const [debounced, setDebounced] = useState(name);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(name), 350);
    return () => clearTimeout(id);
  }, [name]);

  const local = usernameProblem(name);
  const skip = !name || name === current || !!local;
  const { data, isFetching } = useQuery({
    queryKey: ["username-available", debounced],
    queryFn: () =>
      call(
        api.auth["username-available"].get({ query: { username: debounced } }),
      ),
    enabled: !!debounced && debounced === name && !skip,
    staleTime: 10_000,
    retry: false,
  });

  if (!name || name === current) return { state: "idle" };
  if (local) return { state: "bad", reason: local };
  if (debounced !== name || isFetching || !data) return { state: "checking" };
  return data.available
    ? { state: "ok" }
    : { state: "bad", reason: data.reason ?? "Not available" };
}
