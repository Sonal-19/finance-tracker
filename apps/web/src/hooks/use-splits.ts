import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, call, callMsg } from "@/lib/api";
import type { PaymentMethod } from "@/lib/format";
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

export const useSplit = (id: number | null) =>
  useQuery({
    queryKey: ["splits", id],
    queryFn: () => call(api.splits({ id: id! }).get()),
    enabled: !!id,
  });

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
  recordExpense: boolean;
  accountId?: number | null;
  eventId?: number | null;
  paymentMethod?: PaymentMethod;
  note?: string | null;
  fromTransactionId?: number;
};

export function useSaveSplit() {
  const invalidate = useInvalidateSplits();
  return useMutation({
    mutationFn: async ({
      id,
      fromTransactionId,
      ...body
    }: SplitInput & { id?: number }) => {
      if (id) return callMsg(api.splits({ id }).put(body));
      return callMsg(api.splits.post({ ...body, fromTransactionId }));
    },
    onSuccess: ({ message }) => {
      toast.success(message);
      invalidate();
    },
    onError,
  });
}

export function useDeleteSplit() {
  const invalidate = useInvalidateSplits();
  return useMutation({
    mutationFn: (id: number) => callMsg(api.splits({ id }).delete()),
    onSuccess: ({ message }) => {
      toast.success(message);
      invalidate();
    },
    onError,
  });
}

export type SettlementInput = {
  personId: number;
  groupId?: number | null;
  direction: "received" | "paid";
  amount: number;
  date?: string;
  paymentMethod?: PaymentMethod;
  note?: string | null;
};

export function useAddSettlement() {
  const invalidate = useInvalidateSplits();
  return useMutation({
    mutationFn: (body: SettlementInput) => callMsg(api.settlements.post(body)),
    onSuccess: ({ message }) => {
      toast.success(message);
      invalidate();
    },
    onError,
  });
}

export function useDeleteSettlement() {
  const invalidate = useInvalidateSplits();
  return useMutation({
    mutationFn: (id: number) => callMsg(api.settlements({ id }).delete()),
    onSuccess: ({ message }) => {
      toast.success(message);
      invalidate();
    },
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
    mutationFn: ({ id, added }: { id: number; added: boolean }) =>
      callMsg(api.splits.shared({ id }).added.put({ added })),
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
