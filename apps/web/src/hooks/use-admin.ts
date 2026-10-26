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

export type UserFilter = "all" | "admin" | "suspended";

export const useAdminUsers = (
  q: string,
  page: number,
  filter: UserFilter = "all",
) =>
  useQuery({
    queryKey: ["admin", "users", q, page, filter],
    queryFn: () =>
      call(
        api.admin.users.get({
          query: {
            q: q || undefined,
            page,
            role: filter === "admin" ? "admin" : undefined,
            status: filter === "suspended" ? "suspended" : undefined,
          },
        }),
      ),
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

export const useAdminUser = (id: number) =>
  useQuery({
    queryKey: ["admin", "user", id],
    queryFn: () => call(api.admin.users({ id }).get()),
  });
export type AdminUserDetail = NonNullable<
  ReturnType<typeof useAdminUser>["data"]
>;
export type AdminSession = AdminUserDetail["sessions"][number];

export const useAdminSessions = (q: string, page: number) =>
  useQuery({
    queryKey: ["admin", "sessions", q, page],
    queryFn: () =>
      call(api.admin.sessions.get({ query: { q: q || undefined, page } })),
    placeholderData: keepPreviousData,
  });
export type AdminLiveSession = NonNullable<
  ReturnType<typeof useAdminSessions>["data"]
>["items"][number];

export const useAdminActivity = (page: number) =>
  useQuery({
    queryKey: ["admin", "activity", page],
    queryFn: () => call(api.admin.activity.get({ query: { page } })),
    placeholderData: keepPreviousData,
  });
export type AdminAction = NonNullable<
  ReturnType<typeof useAdminActivity>["data"]
>["items"][number];

/** Every admin write: toast its message and refresh the admin screens. */
function useAdminMutation<V>(fn: (v: V) => Promise<{ message: string }>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: ({ message }) => {
      toast.success(message);
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e) => toast.error(e.message),
  });
}

export const useRevokeSession = () =>
  useAdminMutation((id: number) =>
    callMsg(api.admin.sessions({ id }).delete()),
  );

export const useRevokeAllSessions = () =>
  useAdminMutation((userId: number) =>
    callMsg(api.admin.users({ id: userId }).sessions.delete()),
  );

export const useSetUserRole = () =>
  useAdminMutation(({ id, role }: { id: number; role: "user" | "admin" }) =>
    callMsg(api.admin.users({ id }).role.patch({ role })),
  );

export const useSetUserStatus = () =>
  useAdminMutation(
    ({ id, status }: { id: number; status: "active" | "suspended" }) =>
      callMsg(api.admin.users({ id }).status.patch({ status })),
  );

export const useSetUserPassword = () =>
  useAdminMutation(({ id, password }: { id: number; password: string }) =>
    callMsg(api.admin.users({ id }).password.post({ password })),
  );

/** The signed-in admin's own access: master or not, and their permissions. */
export const useAdminMe = () =>
  useQuery({
    queryKey: ["admin", "me"],
    queryFn: () => call(api.admin.me.get()),
    staleTime: 30_000,
  });
export type AdminPermission = NonNullable<
  ReturnType<typeof useAdminMe>["data"]
>["permissions"][number];

/** `can("users.edit")`; false until the answer arrives. */
export function useAdminCan() {
  const { data } = useAdminMe();
  return {
    master: data?.master ?? false,
    can: (p: AdminPermission) => data?.permissions.includes(p) ?? false,
    loaded: !!data,
  };
}

export const useEditUser = () =>
  useAdminMutation(
    ({
      id,
      ...body
    }: {
      id: number;
      name?: string;
      email?: string;
      username?: string;
    }) => callMsg(api.admin.users({ id }).patch(body)),
  );

export const useDeleteUser = () =>
  useAdminMutation(({ id, confirm }: { id: number; confirm: string }) =>
    callMsg(api.admin.users({ id }).delete({ confirm })),
  );

export const useSetPermissions = () =>
  useAdminMutation(
    ({ id, permissions }: { id: number; permissions: AdminPermission[] }) =>
      callMsg(api.admin.users({ id }).permissions.put({ permissions })),
  );

export const useTransferMaster = () =>
  useAdminMutation((id: number) =>
    callMsg(api.admin.users({ id }).master.post()),
  );
