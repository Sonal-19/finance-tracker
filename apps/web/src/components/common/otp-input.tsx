import { OTPInput, type SlotProps } from "input-otp";
import { cn } from "@/lib/utils";

function Slot({ char, hasFakeCaret, isActive }: SlotProps) {
  return (
    <div
      className={cn(
        "relative grid h-12 w-10 place-items-center rounded-lg border border-input bg-background text-xl font-semibold transition-all sm:w-11",
        isActive && "border-ring ring-[3px] ring-ring/40",
      )}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="h-5 w-px animate-pulse bg-foreground" />
        </div>
      )}
    </div>
  );
}

export function OtpInput({
  value,
  onChange,
  onComplete,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <OTPInput
      maxLength={6}
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      autoFocus={autoFocus}
      inputMode="numeric"
      autoComplete="one-time-code"
      pattern="^[0-9]*$"
      containerClassName="flex items-center justify-center gap-2"
      render={({ slots }) => (
        <>
          {slots.slice(0, 3).map((s, i) => (
            <Slot key={i} {...s} />
          ))}
          <span className="text-muted-foreground">–</span>
          {slots.slice(3).map((s, i) => (
            <Slot key={i + 3} {...s} />
          ))}
        </>
      )}
    />
  );
}
