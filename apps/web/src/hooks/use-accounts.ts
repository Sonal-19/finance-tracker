import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { savedToast } from "@/hooks/use-finance";
import { api, call, callMsg } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import { queueAddTransfer, queueDeleteTransfer } from "@/lib/offline/sync";

/* ---------- accounts ---------- */

export const useAccounts = () =>
  useQuery({
    queryKey: ["accounts"],
    queryFn: () => call(api.accounts.get()),
  });
export type Account = NonNullable<
  ReturnType<typeof useAccounts>["data"]
>["accounts"][number];

/** Active accounts, default first — for pickers. */
export function useActiveAccounts() {
  const q = useAccounts();
  const list = (q.data?.accounts ?? []).filter((a) => a.status === "active");
  return {
    ...q,
    list,
    defaultAccount: list.find((a) => a.defaultSince) ?? list[0],
  };
}

export const useAccount = (id: number) =>
  useQuery({
    queryKey: ["accounts", id],
    queryFn: () => call(api.accounts({ id }).get()),
  });

export const useTransfers = (accountId?: number) =>
  useQuery({
    queryKey: ["accounts", "transfers", accountId ?? "all"],
    queryFn: () =>
      call(api.transfers.get({ query: accountId ? { accountId } : {} })),
  });
export type Transfer = NonNullable<
  ReturnType<typeof useTransfers>["data"]
>[number];

/* ---------- events ---------- */

export const useEvents = () =>
  useQuery({ queryKey: ["events"], queryFn: () => call(api.events.get()) });
export type AppEvent = NonNullable<
  ReturnType<typeof useEvents>["data"]
>[number];

export const useEvent = (id: number) =>
  useQuery({
    queryKey: ["events", id],
    queryFn: () => call(api.events({ id }).get()),
  });

/** The event new transactions are auto-tagged to, if any. */
export function useActiveEvent() {
  const { data } = useEvents();
  return data?.find((e) => e.activeSince) ?? null;
}

/* ---------- mutations ---------- */

function useInvalidateMoney() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [
        "accounts",
        "events",
        "books",
        "transactions",
        "reports",
        "budgets",
        "recurring",
        "splits",
      ].map((k) => qc.invalidateQueries({ queryKey: [k] })),
    );
}
const onError = (e: Error) => toast.error(e.message);

export type AccountType = "bank" | "cash" | "credit_card" | "wallet" | "other";
export type AccountInput = {
  name: string;
  type: AccountType;
  icon: string;
  color: string;
  openingBalance: number;
};

export function useSaveAccount() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: Partial<AccountInput> & { id?: number; status?: Account["status"] }) => {
      if (id) return callMsg(api.accounts({ id }).patch(body));
      return callMsg(api.accounts.post(body as AccountInput));
    },
    onSuccess: ({ message }) => {
      toast.success(message);
      invalidate();
    },
    onError,
  });
}

export function useMakeDefaultAccount() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (id: number) => callMsg(api.accounts({ id }).default.post()),
    onSuccess: ({ message }) => {
      toast.success(message);
      invalidate();
    },
    onError,
  });
}

export function useDeleteAccount() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (id: number) => callMsg(api.accounts({ id }).delete()),
    onSuccess: ({ message }) => {
      toast.success(message);
      invalidate();
    },
    onError,
  });
}

export type TransferInput = {
  fromAccountId: number;
  toAccountId: number;
  amount: number;
  date?: string;
  note?: string | null;
};

/** Saved on this device first, synced in the background (works offline). */
export function useAddTransfer() {
  return useMutation({
    mutationFn: async (body: TransferInput) => queueAddTransfer(body),
    onSuccess: (t) =>
      savedToast(
        `Moved ${formatAmount(t.amount)} from ${t.from.name} to ${t.to.name}`,
      ),
    onError,
  });
}

export function useDeleteTransfer() {
  return useMutation({
    mutationFn: async (id: number) => queueDeleteTransfer(id),
    onSuccess: () => savedToast("Transfer deleted"),
    onError,
  });
}

export type EventInput = {
  name: string;
  icon: string;
  color: string;
  startDate?: string | null;
  endDate?: string | null;
  budget?: number | null;
  note?: string | null;
  activation?: "active" | "inactive";
};

export function useSaveEvent() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: Partial<EventInput> & { id?: number }) => {
      if (id) return callMsg(api.events({ id }).patch(body));
      return callMsg(api.events.post(body as EventInput));
    },
    onSuccess: ({ message }) => {
      toast.success(message);
      invalidate();
    },
    onError,
  });
}

export function useDeleteEvent() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (id: number) => callMsg(api.events({ id }).delete()),
    onSuccess: ({ message }) => {
      toast.success(message);
      invalidate();
    },
    onError,
  });
}
