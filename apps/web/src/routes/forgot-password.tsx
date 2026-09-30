import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, KeyRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/common/field";
import { Logo } from "@/components/common/logo";
import { OtpInput } from "@/components/common/otp-input";
import { PasswordInput } from "@/components/common/password-input";
import { DevOtpHint, useCountdown } from "@/components/landing/auth-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, callMsg } from "@/lib/api";

export const Route = createFileRoute("/forgot-password")({
  validateSearch: (s: Record<string, unknown>): { email?: string } => ({
    email: typeof s.email === "string" ? s.email : undefined,
  }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState(search.email ?? "");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [cooldown, setCooldown] = useCountdown();

  const send = useMutation({
    mutationFn: () => callMsg(api.auth.password.forgot.post({ email })),
    onSuccess: ({ message }) => {
      toast.success(message);
      setStep("reset");
      setCooldown(60);
    },
    onError: (e) => toast.error(e.message),
  });
  const reset = useMutation({
    mutationFn: () =>
      callMsg(api.auth.password.reset.post({ email, otp, password })),
    onSuccess: ({ message }) => {
      toast.success(message);
      navigate({ to: "/", replace: true });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="pt-safe grid min-h-dvh place-items-center bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent)] px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <Link to="/" className="flex justify-center">
          <Logo />
        </Link>
        <div className="rounded-3xl border bg-card p-5 shadow-xl shadow-black/5 sm:p-7">
          <span className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground">
            <KeyRound className="size-6" />
          </span>
          <h1 className="mt-4 text-xl font-bold">Reset your password</h1>
          <p className="mt-1 mb-5 text-sm text-muted-foreground">
            {step === "email"
              ? "Enter your account email and we'll send you a 6-digit code."
              : `Enter the code sent to ${email} and choose a new password.`}
          </p>

          {step === "email" ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                send.mutate();
              }}
            >
              <Field label="Email" htmlFor="fp-email">
                <Input
                  id="fp-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </Field>
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={send.isPending}
              >
                {send.isPending ? "Sending…" : "Send reset code"}
              </Button>
            </form>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (password !== confirmPw)
                  return toast.error("Passwords don't match");
                reset.mutate();
              }}
            >
              <OtpInput value={otp} onChange={setOtp} autoFocus />
              <DevOtpHint />
              <div className="text-center text-sm">
                {cooldown > 0 ? (
                  <span className="text-muted-foreground">
                    Resend code in {cooldown}s
                  </span>
                ) : (
                  <button
                    type="button"
                    className="font-medium text-primary hover:underline"
                    onClick={() => send.mutate()}
                  >
                    Resend code
                  </button>
                )}
              </div>
              <Field
                label="New password"
                htmlFor="fp-password"
                hint="At least 8 characters."
              >
                <PasswordInput
                  id="fp-password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Field label="Confirm new password" htmlFor="fp-confirm">
                <PasswordInput
                  id="fp-confirm"
                  autoComplete="new-password"
                  required
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                />
              </Field>
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={
                  otp.length !== 6 || password.length < 8 || reset.isPending
                }
              >
                {reset.isPending ? "Updating…" : "Update password"}
              </Button>
            </form>
          )}
        </div>
        <Link
          to="/"
          className="flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to log in
        </Link>
      </div>
    </div>
  );
}
