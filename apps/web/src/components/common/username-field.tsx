import { Check, Loader2, X } from "lucide-react";
import { Field } from "@/components/common/field";
import { Input } from "@/components/ui/input";
import { useUsernameStatus } from "@/hooks/use-username";
import { USERNAME_MAX } from "@/lib/username";

/** Username input with live availability. `current` = the user's existing name. */
export function UsernameField({
  id,
  value,
  onChange,
  current,
  label = "Username",
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  current?: string;
  label?: string;
}) {
  const status = useUsernameStatus(value, current);
  return (
    <Field
      label={label}
      htmlFor={id}
      hint={
        status.state === "bad"
          ? status.reason
          : status.state === "ok"
            ? "Available"
            : "Letters, numbers and underscores. Friends tag you with it."
      }
    >
      <div className="relative">
        <span className="pointer-events-none absolute top-2.5 left-3 text-muted-foreground">
          @
        </span>
        <Input
          id={id}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={USERNAME_MAX}
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          placeholder="e.g. sonal_verma"
          aria-invalid={status.state === "bad"}
          className="h-11 pr-9 pl-8"
        />
        <span className="absolute top-3 right-3">
          {status.state === "checking" && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          )}
          {status.state === "ok" && <Check className="size-4 text-income" />}
          {status.state === "bad" && <X className="size-4 text-expense" />}
        </span>
      </div>
    </Field>
  );
}
