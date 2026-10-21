import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, call, callMsg } from "@/lib/api";

/** Every public link the user has made, newest first. */
export const useShares = () =>
  useQuery({
    queryKey: ["shares"],
    queryFn: () => call(api.shares.get({ query: {} })),
  });
export type Share = NonNullable<ReturnType<typeof useShares>["data"]>[number];

export const shareUrl = (token: string) =>
  `${window.location.origin}/s/${token}`;

export type ShareInput = {
  message?: string | null;
  fromDate?: string | null;
  toDate?: string | null;
  expiresOn?: string | null;
  /** A string sets it, null removes it, omitted keeps it. */
  password?: string | null;
  upiId?: string | null;
  payeeName?: string | null;
  attachments?: Share["attachments"];
  payButton?: Share["payButton"];
};

const onError = (e: Error) => toast.error(e.message);

export function useSaveShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      bookId,
      ...body
    }: ShareInput & { id?: number; bookId: number }) =>
      callMsg(
        id
          ? api.shares({ id }).patch(body)
          : api.shares.post({ bookId, ...body }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shares"] }),
    onError,
  });
}

export function useDeleteShare() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => callMsg(api.shares({ id }).delete()),
    onSuccess: ({ message }) => {
      toast.success(message);
      qc.invalidateQueries({ queryKey: ["shares"] });
    },
    onError,
  });
}

/* ---------- "I've paid" reports, for the owner ---------- */

export const usePaymentClaims = (bookId: number) =>
  useQuery({
    queryKey: ["shares", "claims", bookId],
    queryFn: () => call(api.shares.claims.get({ query: { bookId } })),
  });
export type PaymentClaim = NonNullable<
  ReturnType<typeof usePaymentClaims>["data"]
>[number];

/** Confirming books the money, so every money view refreshes. */
export function useDecideClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: number; accountId?: number } | { dismiss: number }) =>
      callMsg(
        "dismiss" in v
          ? api.shares.claims({ id: v.dismiss }).dismiss.post()
          : api.shares
              .claims({ id: v.id })
              .confirm.post({ accountId: v.accountId }),
      ),
    onSuccess: ({ message }) => {
      toast.success(message);
      for (const k of [
        "shares",
        "books",
        "transactions",
        "reports",
        "accounts",
      ])
        qc.invalidateQueries({ queryKey: [k] });
    },
    onError,
  });
}

/* ---------- the public page (no login) ---------- */

export const usePublicShare = (token: string) =>
  useQuery({
    queryKey: ["public-share", token],
    queryFn: () => call(api.public.shares({ token }).get()),
    retry: false,
  });
export type PublicShare = Extract<
  NonNullable<ReturnType<typeof usePublicShare>["data"]>,
  { locked: false }
>;

export function useUnlockShare(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) =>
      call(api.public.shares({ token }).unlock.post({ password })),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["public-share", token] }),
  });
}

export function useReportPayment(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      amount: number;
      payerName?: string | null;
      reference?: string | null;
    }) => callMsg(api.public.shares({ token }).claims.post(body)),
    onSuccess: ({ message }) => {
      toast.success(message);
      qc.invalidateQueries({ queryKey: ["public-share", token] });
    },
    onError,
  });
}

/** `upi://pay` link every UPI app (and its QR scanner) understands. */
export function upiLink(o: {
  id: string;
  payeeName: string;
  /** Stored amount; omitted lets the payer type one. */
  amount?: number;
  note?: string;
}) {
  const q = new URLSearchParams({ pa: o.id, pn: o.payeeName, cu: "INR" });
  if (o.amount && o.amount > 0) q.set("am", (o.amount / 100).toFixed(2));
  if (o.note) q.set("tn", o.note.slice(0, 50));
  // UPI apps expect spaces as %20 and the `@` of the ID left as it is.
  return `upi://pay?${q.toString().replace(/\+/g, "%20").replace(/%40/g, "@")}`;
}
