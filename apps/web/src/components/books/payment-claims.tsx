import { HandCoins } from "lucide-react";
import { useState } from "react";
import { AccountPicker } from "@/components/app/pickers";
import { SectionCard } from "@/components/app/section-card";
import { ResponsiveSheet } from "@/components/common/responsive-sheet";
import { Button } from "@/components/ui/button";
import { useActiveAccounts } from "@/hooks/use-accounts";
import {
  type PaymentClaim,
  useDecideClaim,
  usePaymentClaims,
} from "@/hooks/use-shares";
import { formatAmount, shortDate } from "@/lib/format";

/**
 * "I've paid" reports sent from this book's share links. They are only what
 * the payer says: confirming one records the money as received, dismissing
 * records nothing.
 */
export function PaymentClaims({ bookId }: { bookId: number }) {
  const { data: claims = [] } = usePaymentClaims(bookId);
  const decide = useDecideClaim();
  const { defaultAccount } = useActiveAccounts();
  const [confirming, setConfirming] = useState<PaymentClaim | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const account = accountId ?? defaultAccount?.id ?? null;

  if (!claims.length) return null;
  return (
    <SectionCard title="Payments reported">
      <p className="-mt-2 mb-3 text-sm text-muted-foreground">
        Someone with your link says they paid. Check your bank first, then
        confirm.
      </p>
      <ul className="divide-y">
        {claims.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
              <HandCoins className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="tabular font-semibold">{formatAmount(c.amount)}</p>
              <p className="text-xs break-words text-muted-foreground">
                {[
                  c.payerName,
                  c.reference && `Ref ${c.reference}`,
                  shortDate(c.createdAt),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                disabled={decide.isPending}
                onClick={() => decide.mutate({ dismiss: c.id })}
              >
                Not received
              </Button>
              <Button size="sm" onClick={() => setConfirming(c)}>
                Confirm
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <ResponsiveSheet
        open={!!confirming}
        onOpenChange={(o) => !o && setConfirming(null)}
        title={`Record ${formatAmount(confirming?.amount)} as received?`}
        description="It is added to this book as money received back."
      >
        <div className="space-y-4">
          <AccountPicker
            label="Received in"
            value={account}
            onChange={setAccountId}
          />
          <Button
            size="lg"
            className="w-full"
            disabled={decide.isPending}
            onClick={() =>
              confirming &&
              decide.mutate(
                { id: confirming.id, accountId: account ?? undefined },
                { onSuccess: () => setConfirming(null) },
              )
            }
          >
            {decide.isPending ? "Saving…" : "Confirm payment"}
          </Button>
        </div>
      </ResponsiveSheet>
    </SectionCard>
  );
}
