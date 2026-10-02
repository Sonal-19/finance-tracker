import { formatDistanceToNow } from "date-fns";
import { Fingerprint, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { SectionCard } from "@/components/app/section-card";
import { confirm } from "@/components/common/confirm-dialog";
import { Field } from "@/components/common/field";
import { ResponsiveSheet } from "@/components/common/responsive-sheet";
import { Spinner } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  isPasskeySupported,
  type Passkey,
  useAddPasskey,
  usePasskeys,
  useRemovePasskey,
} from "@/hooks/use-passkeys";

const ago = (d: string | Date) =>
  formatDistanceToNow(new Date(d), { addSuffix: true });

/** Settings section: list, add and remove the user's own passkeys. */
export function PasskeysCard() {
  const { data, isLoading } = usePasskeys();
  const remove = useRemovePasskey();
  const [addOpen, setAddOpen] = useState(false);

  const passkeys = data?.passkeys ?? [];
  const atCap = !!data && data.max > 0 && passkeys.length >= data.max;
  const supported = isPasskeySupported();
  const blocked = !data?.enabled
    ? "Passkeys are turned off right now. You can still remove existing ones."
    : !supported
      ? "This browser doesn't support passkeys."
      : atCap
        ? `You've reached the limit of ${data.max} passkey${data.max === 1 ? "" : "s"}.`
        : null;

  const onRemove = async (p: Passkey) => {
    const yes = await confirm({
      title: `Remove "${p.title}"?`,
      description:
        "You won't be able to sign in with it any more. Also delete it from your device or password manager.",
      confirmText: "Remove",
      destructive: true,
    });
    if (yes) remove.mutate(p.id);
  };

  return (
    <SectionCard
      title="Passkeys"
      action={
        <Button
          size="sm"
          variant="outline"
          disabled={isLoading || !!blocked}
          onClick={() => setAddOpen(true)}
        >
          <Plus /> Add passkey
        </Button>
      }
    >
      <p className="mb-3 text-sm text-muted-foreground">
        Sign in with your fingerprint, face or screen lock instead of your
        password.
      </p>
      {isLoading ? (
        <Spinner />
      ) : passkeys.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          No passkeys yet.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
                <Fingerprint className="size-4.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  Added {ago(p.createdAt)} ·{" "}
                  {p.lastUsedAt
                    ? `last used ${ago(p.lastUsedAt)}`
                    : "not used yet"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remove ${p.title}`}
                disabled={remove.isPending}
                onClick={() => onRemove(p)}
              >
                <Trash2 className="text-destructive" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {!isLoading && blocked && (
        <p className="mt-3 text-xs text-muted-foreground">{blocked}</p>
      )}
      <AddPasskeySheet open={addOpen} onOpenChange={setAddOpen} />
    </SectionCard>
  );
}

function AddPasskeySheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const [title, setTitle] = useState("");
  const add = useAddPasskey();
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add a passkey"
      description="Your device will ask for your fingerprint, face or screen lock."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate(title, {
            onSuccess: () => {
              setTitle("");
              onOpenChange(false);
            },
          });
        }}
      >
        <Field
          label="Name"
          htmlFor="passkey-title"
          hint="Optional. Helps you tell your passkeys apart."
        >
          <Input
            id="passkey-title"
            maxLength={60}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. MacBook Touch ID"
          />
        </Field>
        <Button type="submit" className="w-full" disabled={add.isPending}>
          <Fingerprint />{" "}
          {add.isPending ? "Waiting for your device…" : "Continue"}
        </Button>
      </form>
    </ResponsiveSheet>
  );
}
