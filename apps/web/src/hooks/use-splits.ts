import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { savedToast } from "@/hooks/use-finance";
import { api, call, callMsg } from "@/lib/api";
import {
  queueAddSettlement,
  queueDeleteSettlement,
  queueDeleteSplit,
  queueSaveSplit,
} from "@/lib/offline/sync";
import type { Relation, SplitMethod } from "@/lib/split";

/* ---------- queries ---------- */

export const usePeople = () =>
  useQuery({ queryKey: ["people"], queryFn: () => call(api.people.get()) });
export type Person = NonNullable<ReturnType<typeof usePeople>["data"]>[number];

export const usePerson = (id: number) =>
  useQuery({
    queryKey: ["people", id],
    queryFn: () => call(api.people({ id }).get()),
  });
export type PersonDetail = NonNullable<ReturnType<typeof usePerson>["data"]>;

export const useSplitGroups = () =>
  useQuery({
    queryKey: ["split-groups"],
    queryFn: () => call(api["split-groups"].get()),
  });
export type SplitGroup = NonNullable<
  ReturnType<typeof useSplitGroups>["data"]
>[number];

export const useSplitGroup = (id: number) =>
  useQuery({
    queryKey: ["split-groups", id],
    queryFn: () => call(api["split-groups"]({ id }).get()),
  });

export const useSplits = () =>
  useQuery({
    queryKey: ["splits", "list"],
    queryFn: () => call(api.splits.get({ query: { limit: 100 } })),
  });
export type Split = NonNullable<ReturnType<typeof useSplits>["data"]>[number];

export function useSplit(id: number | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["splits", id],
    queryFn: () => call(api.splits({ id: id! }).get()),
    // A split made offline (negative id) exists only in the cached list.
    enabled: !!id && id > 0,
    initialData: () =>
      qc.getQueryData<Split[]>(["splits", "list"])?.find((s) => s.id === id),
    initialDataUpdatedAt: 0,
  });
}

export const useSplitSummary = () =>
  useQuery({
    queryKey: ["splits", "summary"],
    queryFn: () => call(api.splits.summary.get()),
  });

/* ---------- mutations ---------- */

/** Splits touch balances, the user's share transaction (and so account and
 * event totals), reports and budgets. */
function useInvalidateSplits() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [
        "people",
        "split-groups",
        "splits",
        "transactions",
        "reports",
        "budgets",
        "categories",
        "accounts",
        "events",
      ].map((k) => qc.invalidateQueries({ queryKey: [k] })),
    );
}

const onError = (e: Error) => toast.error(e.message);

export type PersonInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  relation: Relation;
};

export function useSavePerson() {
  const invalidate = useInvalidateSplits();
  return useMutation({
    mutationFn: async ({ id, ...body }: PersonInput & { id?: number }) => {
      if (id) return callMsg(api.people({ id }).patch(body));
      return callMsg(api.people.post(body));
    },
    onSuccess: ({ message }) => {
      toast.success(message);
      invalidate();
    },
    onError,
  });
}

export function useDeletePerson() {
  const invalidate = useInvalidateSplits();
  return useMutation({
    mutationFn: (id: number) => callMsg(api.people({ id }).delete()),
    onSuccess: ({ message }) => {
      toast.success(message);
      invalidate();
    },
    onError,
  });
}

export type GroupInput = {
  name: string;
  icon: string;
  color: string;
  memberIds: number[];
};

export function useSaveGroup() {
  const invalidate = useInvalidateSplits();
  return useMutation({
    mutationFn: async ({ id, ...body }: GroupInput & { id?: number }) => {
      if (id) return callMsg(api["split-groups"]({ id }).patch(body));
      return callMsg(api["split-groups"].post(body));
    },
    onSuccess: ({ message }) => {
      toast.success(message);
      invalidate();
    },
    onError,
  });
}

export function useDeleteGroup() {
  const invalidate = useInvalidateSplits();
  return useMutation({
    mutationFn: (id: number) => callMsg(api["split-groups"]({ id }).delete()),
    onSuccess: ({ message }) => {
      toast.success(message);
      invalidate();
    },
    onError,
  });
}

export type SplitInput = {
  description: string;
  total: number;
  date: string;
  groupId: number | null;
  paidByPersonId: number | null;
  method: SplitMethod;
  participants: { personId: number | null; value?: number }[];
  categoryId: number | null;
  ownShare: "recorded" | "skipped";
  accountId?: number | null;
  eventId?: number | null;
  bookId?: number | null;
  note?: string | null;
  fromTransactionId?: number;
};

/** Saved on this device first, synced in the background (works offline). */
export function useSaveSplit() {
  return useMutation({
    mutationFn: async (input: SplitInput & { id?: number }) => ({
      data: queueSaveSplit(input),
      message: input.id ? "Split updated" : "Expense split",
    }),
    onSuccess: ({ message }) => savedToast(message),
    onError,
  });
}

export function useDeleteSplit() {
  return useMutation({
    mutationFn: async (id: number) => queueDeleteSplit(id),
    onSuccess: () => savedToast("Split deleted"),
    onError,
  });
}

export type SettlementInput = {
  personId: number;
  groupId?: number | null;
  direction: "received" | "paid";
  amount: number;
  date?: string;
  note?: string | null;
};

export function useAddSettlement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: SettlementInput) => {
      const name = qc
        .getQueryData<Person[]>(["people"])
        ?.find((p) => p.id === body.personId)?.name;
      queueAddSettlement(body, name);
      return name;
    },
    onSuccess: (name) =>
      savedToast(name ? `Payment with ${name} recorded` : "Payment recorded"),
    onError,
  });
}

export function useDeleteSettlement() {
  return useMutation({
    mutationFn: async (id: number) => queueDeleteSettlement(id),
    onSuccess: () => savedToast("Payment removed"),
    onError,
  });
}

/** Tag a platform user by exact @username (creates the linked person). */
export function useLinkPerson() {
  const invalidate = useInvalidateSplits();
  return useMutation({
    mutationFn: (username: string) =>
      callMsg(api.people.link.post({ username })),
    onSuccess: ({ message }) => {
      toast.success(message);
      invalidate();
    },
    onError,
  });
}

export const useSharedSplits = () =>
  useQuery({
    queryKey: ["splits", "shared"],
    queryFn: () => call(api.splits.shared.get()),
  });
export type SharedSplit = NonNullable<
  ReturnType<typeof useSharedSplits>["data"]
>[number];

export function useSetSharedAdded() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      decision,
    }: {
      id: number;
      decision: SharedSplit["decision"];
    }) => callMsg(api.splits.shared({ id }).decision.put({ decision })),
    onSuccess: ({ message }) => {
      toast.success(message);
      qc.invalidateQueries({ queryKey: ["splits", "shared"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["budgets"] });
    },
    onError,
  });
}
