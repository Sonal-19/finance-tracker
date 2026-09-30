import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { api, call, callMsg } from "@/lib/api";

export type TxnType = "credit" | "debit";
export type Period = "day" | "week" | "month" | "year" | "custom";

export type TxnFilters = {
  type?: TxnType;
  categoryIds?: string;
  paymentMethod?:
    | "cash"
    | "upi"
    | "bank"
    | "debit_card"
    | "credit_card"
    | "other";
  accountId?: number;
  /** 0 = not in any event */
  eventId?: number;
  from?: string;
  to?: string;
  q?: string;
};

const PAGE = 30;

/* ---------- queries ---------- */

export const useCategories = () =>
  useQuery({
    queryKey: ["categories"],
    queryFn: () => call(api.categories.get()),
    staleTime: 5 * 60_000,
  });
export type Category = NonNullable<
  ReturnType<typeof useCategories>["data"]
>[number];

export const useTransactions = (filters: TxnFilters) =>
  useInfiniteQuery({
    queryKey: ["transactions", filters],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      call(
        api.transactions.get({
          query: { ...filters, limit: PAGE, offset: pageParam },
        }),
      ),
    getNextPageParam: (last, pages) =>
      last.hasMore ? pages.length * PAGE : undefined,
    placeholderData: keepPreviousData,
  });
export type Txn = NonNullable<
  ReturnType<typeof useTransactions>["data"]
>["pages"][number]["items"][number];

export const useSummary = (q: {
  period: Period;
  date?: string;
  from?: string;
  to?: string;
  accountId?: number;
  eventId?: number;
}) =>
  useQuery({
    queryKey: ["reports", "summary", q],
    queryFn: () => call(api.reports.summary.get({ query: q })),
    placeholderData: keepPreviousData,
    enabled: q.period !== "custom" || (!!q.from && !!q.to),
  });
export type Summary = NonNullable<ReturnType<typeof useSummary>["data"]>;

export const useCalendar = (month: string, accountId?: number) =>
  useQuery({
    queryKey: ["reports", "calendar", month, accountId],
    queryFn: () =>
      call(api.reports.calendar.get({ query: { month, accountId } })),
    placeholderData: keepPreviousData,
  });

/** Foreign → INR rate for a date (today = live). */
export const useFxRate = (currency: Currency, date: string) =>
  useQuery({
    queryKey: ["fx", currency, date],
    queryFn: () =>
      call(api.fx.rate.get({ query: { currency: currency as "USD", date } })),
    enabled: currency !== "INR" && /^\d{4}-\d{2}-\d{2}$/.test(date),
    staleTime: 30 * 60_000,
    placeholderData: keepPreviousData,
  });

export const useBalance = () =>
  useQuery({
    queryKey: ["reports", "balance"],
    queryFn: () => call(api.reports.balance.get()),
  });

export const useBudgets = (month?: string) =>
  useQuery({
    queryKey: ["budgets", month ?? "current"],
    queryFn: () => call(api.budgets.get({ query: month ? { month } : {} })),
    placeholderData: keepPreviousData,
  });

export const useRecurring = () =>
  useQuery({
    queryKey: ["recurring"],
    queryFn: () => call(api.recurring.get()),
  });
export type RecurringRule = NonNullable<
  ReturnType<typeof useRecurring>["data"]
>[number];

export const useGoals = () =>
  useQuery({ queryKey: ["goals"], queryFn: () => call(api.goals.get()) });
export type Goal = NonNullable<ReturnType<typeof useGoals>["data"]>[number];

/* ---------- mutations ---------- */

/** Anything that changes money invalidates every derived view. */
function useInvalidate() {
  const qc = useQueryClient();
  return (...keys: string[]) =>
    Promise.all(
      (keys.length
        ? keys
        : [
            "transactions",
            "reports",
            "budgets",
            "categories",
            "recurring",
            "accounts",
            "events",
          ]
      ).map((k) => qc.invalidateQueries({ queryKey: [k] })),
    );
}

function onError(e: Error) {
  toast.error(e.message);
}

export type Currency = "INR" | "USD";

export type TxnInput = {
  type: TxnType;
  /** In `currency`; the server converts to INR before saving. */
  amount: number;
  currency?: Currency;
  /** Manual exchange rate; omitted = the day's market rate. */
  fxRate?: number;
  categoryId: number;
  date: string;
  paymentMethod: NonNullable<TxnFilters["paymentMethod"]>;
  accountId?: number;
  eventId?: number | null;
  note?: string | null;
};

export function useSaveTransaction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...body }: TxnInput & { id?: number }) =>
      callMsg(
        id ? api.transactions({ id }).patch(body) : api.transactions.post(body),
      ),
    onSuccess: ({ message }) => {
      toast.success(message);
      invalidate();
    },
    onError,
  });
}

export function useDeleteTransaction() {
  const invalidate = useInvalidate();
  const save = useSaveTransaction();
  return useMutation({
    mutationFn: (id: number) => callMsg(api.transactions({ id }).delete()),
    onSuccess: ({ data, message }) => {
      invalidate();
      if (!data) return;
      toast.success(message, {
        action: {
          label: "Undo",
          onClick: () =>
            save.mutate({
              type: data.type,
              ...(data.originalCurrency === "USD" &&
              data.originalAmount !== null
                ? {
                    amount: data.originalAmount,
                    currency: "USD" as const,
                    fxRate: data.fxRate ?? undefined,
                  }
                : { amount: data.amount }),
              categoryId: data.categoryId,
              date: String(data.date).slice(0, 10),
              paymentMethod: data.paymentMethod,
              accountId: data.accountId,
              eventId: data.eventId,
              note: data.note,
            }),
        },
      });
    },
    onError,
  });
}

export type CategoryInput = {
  name: string;
  type: TxnType;
  icon: string;
  color: string;
};

export function useSaveCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, type, ...rest }: CategoryInput & { id?: number }) =>
      callMsg(
        id
          ? api.categories({ id }).patch(rest)
          : api.categories.post({ ...rest, type }),
      ),
    onSuccess: ({ message }) => {
      toast.success(message);
      invalidate();
    },
    onError,
  });
}

export function useDeleteCategory() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, reassignTo }: { id: number; reassignTo?: number }) =>
      callMsg(
        api
          .categories({ id })
          .delete(undefined, { query: reassignTo ? { reassignTo } : {} }),
      ),
    onSuccess: ({ message }) => {
      toast.success(message);
      invalidate();
    },
    onError,
  });
}

export function useSaveBudget() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (b: { categoryId: number; amount: number }) =>
      callMsg(api.budgets.put(b)),
    onSuccess: ({ message }) => {
      toast.success(message);
      invalidate("budgets");
    },
    onError,
  });
}

export function useDeleteBudget() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: number) => callMsg(api.budgets({ id }).delete()),
    onSuccess: ({ message }) => {
      toast.success(message);
      invalidate("budgets");
    },
    onError,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { name?: string; monthlyBudget?: number | null }) =>
      callMsg(api.profile.patch(b)),
    onSuccess: ({ message, data }) => {
      toast.success(message);
      qc.setQueryData(["auth", "me"], data);
      qc.invalidateQueries({ queryKey: ["budgets"] });
    },
    onError,
  });
}

export type RecurringInput = {
  type: TxnType;
  amount: number;
  categoryId: number;
  paymentMethod: NonNullable<TxnFilters["paymentMethod"]>;
  accountId?: number;
  note?: string | null;
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  startDate: string;
  endDate?: string | null;
};

export function useSaveRecurring() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({
      id,
      ...body
    }: Partial<RecurringInput> & { id?: number; isActive?: boolean }) => {
      if (id) return callMsg(api.recurring({ id }).patch(body));
      return callMsg(api.recurring.post(body as RecurringInput));
    },
    onSuccess: ({ message }) => {
      toast.success(message);
      invalidate();
    },
    onError,
  });
}

export function useDeleteRecurring() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: number) => callMsg(api.recurring({ id }).delete()),
    onSuccess: ({ message }) => {
      toast.success(message);
      invalidate("recurring");
    },
    onError,
  });
}

export type GoalInput = {
  name: string;
  target: number;
  targetDate?: string | null;
  color: string;
  icon: string;
};

export function useSaveGoal() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async ({ id, ...body }: GoalInput & { id?: number }) => {
      if (id) return callMsg(api.goals({ id }).patch(body));
      return callMsg(api.goals.post(body));
    },
    onSuccess: ({ message }) => {
      toast.success(message);
      invalidate("goals");
    },
    onError,
  });
}

export function useDeleteGoal() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: number) => callMsg(api.goals({ id }).delete()),
    onSuccess: ({ message }) => {
      toast.success(message);
      invalidate("goals");
    },
    onError,
  });
}

export function useGoalContribution() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: number;
      amount: number;
      date?: string;
      note?: string | null;
    }) => callMsg(api.goals({ id }).contributions.post(body)),
    onSuccess: ({ message }) => {
      toast.success(message);
      invalidate("goals");
    },
    onError,
  });
}
