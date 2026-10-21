import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { api, call, callMsg } from "@/lib/api";

export const useAdminOverview = () =>
  useQuery({
    queryKey: ["admin", "overview"],
    queryFn: () => call(api.admin.overview.get()),
  });
export type AdminOverview = NonNullable<
  ReturnType<typeof useAdminOverview>["data"]
>;

export const useAdminUsers = (q: string, page: number) =>
  useQuery({
    queryKey: ["admin", "users", q, page],
    queryFn: () =>
      call(api.admin.users.get({ query: { q: q || undefined, page } })),
    placeholderData: keepPreviousData,
  });
export type AdminUser = NonNullable<
  ReturnType<typeof useAdminUsers>["data"]
>["items"][number];

export type NewUser = Parameters<typeof api.admin.users.post>[0];

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NewUser) => callMsg(api.admin.users.post(body)),
    onSuccess: ({ message }) => {
      toast.success(message);
      qc.invalidateQueries({ queryKey: ["admin"] });
      qc.invalidateQueries({ queryKey: ["username-available"] });
    },
    onError: (e) => toast.error(e.message),
  });
}
