import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, call, callMsg } from "@/lib/api";

/* ---------- the owner's side ---------- */

/** One person's public links, newest first. */
export const usePersonShares = (personId: number) =>
  useQuery({
    queryKey: ["person-shares", personId],
    queryFn: () => call(api["person-shares"].get({ query: { personId } })),
  });
export type PersonShare = NonNullable<
  ReturnType<typeof usePersonShares>["data"]
>[number];

export const personShareUrl = (token: string) =>
  `${window.location.origin}/p/${token}`;

export type PersonShareInput = {
  message?: string | null;
  expiresOn?: string | null;
  /** A string sets it, null removes it, omitted keeps it. */
  password?: string | null;
  upiId?: string | null;
  payeeName?: string | null;
  payButton?: PersonShare["payButton"];
  participants?: PersonShare["participants"];
};

const onError = (e: Error) => toast.error(e.message);

export function useSavePersonShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      personId,
      ...body
    }: PersonShareInput & { id?: number; personId: number }) =>
      callMsg(
        id
          ? api["person-shares"]({ id }).patch(body)
          : api["person-shares"].post({ personId, ...body }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["person-shares"] }),
    onError,
  });
}

export function useDeletePersonShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => callMsg(api["person-shares"]({ id }).delete()),
    onSuccess: ({ message }) => {
      toast.success(message);
      qc.invalidateQueries({ queryKey: ["person-shares"] });
    },
    onError,
  });
}

export const useSettlementClaims = (personId: number) =>
  useQuery({
    queryKey: ["person-shares", "claims", personId],
    queryFn: () =>
      call(api["person-shares"].claims.get({ query: { personId } })),
  });

/** Confirming records a settlement, so balances everywhere refresh. */
export function useDecideSettlementClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { confirm: number } | { dismiss: number }) =>
      callMsg(
        "dismiss" in v
          ? api["person-shares"].claims({ id: v.dismiss }).dismiss.post()
          : api["person-shares"].claims({ id: v.confirm }).confirm.post(),
      ),
    onSuccess: ({ message }) => {
      toast.success(message);
      for (const k of ["person-shares", "people", "splits", "split-groups"])
        qc.invalidateQueries({ queryKey: [k] });
    },
    onError,
  });
}

/* ---------- the public page (no login) ---------- */

export const usePublicPersonShare = (token: string) =>
  useQuery({
    queryKey: ["public-person-share", token],
    queryFn: () => call(api.public["person-shares"]({ token }).get()),
    retry: false,
  });
export type PublicPersonShare = Extract<
  NonNullable<ReturnType<typeof usePublicPersonShare>["data"]>,
  { locked: false }
>;

export function useUnlockPersonShare(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) =>
      call(api.public["person-shares"]({ token }).unlock.post({ password })),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["public-person-share", token] }),
  });
}

export function useReportSettlement(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      amount: number;
      reference?: string | null;
      note?: string | null;
    }) => callMsg(api.public["person-shares"]({ token }).claims.post(body)),
    onSuccess: ({ message }) => {
      toast.success(message);
      qc.invalidateQueries({ queryKey: ["public-person-share", token] });
    },
    onError,
  });
}
