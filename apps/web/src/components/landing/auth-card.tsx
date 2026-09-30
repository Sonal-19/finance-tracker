import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, MailCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/common/field";
import { OtpInput } from "@/components/common/otp-input";
import { PasswordInput } from "@/components/common/password-input";
import { Segmented } from "@/components/common/segmented";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, callMsg } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

export type AuthMode = "login" | "register";

const IS_DEV = import.meta.env.DEV;

export function DevOtpHint() {
  if (!IS_DEV) return null;
  return (
    <p className="rounded-lg bg-accent px-3 py-2 text-center text-xs text-accent-foreground">
      Development mode: use code <b className="tracking-widest">123456</b>
    </p>
  );
}

/** Seconds left before "Resend" is allowed again. */
export function useCountdown() {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((l) => l - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, setLeft] as const;
}

function useOnAuthed() {
  const qc = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  const navigate = useNavigate();
  return (user: Parameters<typeof setUser>[0], message: string) => {
    setUser(user);
    qc.setQueryData(["auth", "me"], user);
    toast.success(message);
    navigate({ to: "/dashboard", replace: true });
  };
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const onAuthed = useOnAuthed();
  const login = useMutation({
    mutationFn: () => callMsg(api.auth.login.post({ email, password })),
    onSuccess: ({ data, message }) => onAuthed(data, message),
    onError: (e) => toast.error(e.message),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        login.mutate();
      }}
    >
      <Field label="Email" htmlFor="login-email">
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </Field>
      <Field label="Password" htmlFor="login-password">
        <PasswordInput
          id="login-password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Your password"
        />
      </Field>
      <div className="flex justify-end">
        <Link
          to="/forgot-password"
          search={{ email: email || undefined }}
          className="text-sm font-medium text-primary hover:underline"
        >
          Forgot password?
        </Link>
      </div>
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={login.isPending}
      >
        {login.isPending ? "Logging in…" : "Log in"}
      </Button>
      {IS_DEV && (
        <button
          type="button"
          className="w-full text-center text-xs text-muted-foreground hover:underline"
          onClick={() => {
            setEmail("demo@finance.local");
            setPassword("Demo@1234");
          }}
        >
          Dev: fill demo account
        </button>
      )}
    </form>
  );
}

function RegisterForm() {
  const [step, setStep] = useState<"details" | "verify">("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [cooldown, setCooldown] = useCountdown();
  const onAuthed = useOnAuthed();

  const sendOtp = useMutation({
    mutationFn: () =>
      callMsg(api.auth.register["send-otp"].post({ name, email })),
    onSuccess: ({ message }) => {
      toast.success(message);
      setStep("verify");
      setCooldown(60);
    },
    onError: (e) => toast.error(e.message),
  });
  const verify = useMutation({
    mutationFn: () =>
      callMsg(api.auth.register.verify.post({ name, email, otp, password })),
    onSuccess: ({ data, message }) => onAuthed(data, message),
    onError: (e) => toast.error(e.message),
  });

  if (step === "details") {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          sendOtp.mutate();
        }}
      >
        <Field label="Full name" htmlFor="reg-name">
          <Input
            id="reg-name"
            autoComplete="name"
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
          />
        </Field>
        <Field
          label="Email"
          htmlFor="reg-email"
          hint="We'll send a 6-digit code to verify it."
        >
          <Input
            id="reg-email"
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
          disabled={sendOtp.isPending}
        >
          {sendOtp.isPending ? "Sending code…" : "Send verification code"}
        </Button>
      </form>
    );
  }

  const mismatch = confirmPw.length > 0 && confirmPw !== password;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (password !== confirmPw) return toast.error("Passwords don't match");
        verify.mutate();
      }}
    >
      <button
        type="button"
        onClick={() => setStep("details")}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Change details
      </button>
      <div className="flex items-start gap-3 rounded-xl bg-muted p-3 text-sm">
        <MailCheck className="mt-0.5 size-5 shrink-0 text-primary" />
        <p>
          Enter the code sent to <b className="break-all">{email}</b>
        </p>
      </div>
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
            disabled={sendOtp.isPending}
            onClick={() => sendOtp.mutate()}
          >
            Resend code
          </button>
        )}
      </div>
      <Field
        label="Create password"
        htmlFor="reg-password"
        hint="At least 8 characters."
      >
        <PasswordInput
          id="reg-password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Field label="Confirm password" htmlFor="reg-confirm">
        <PasswordInput
          id="reg-confirm"
          autoComplete="new-password"
          required
          aria-invalid={mismatch}
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
        />
      </Field>
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={otp.length !== 6 || password.length < 8 || verify.isPending}
      >
        {verify.isPending ? "Creating account…" : "Verify & create account"}
      </Button>
    </form>
  );
}

export function AuthCard({
  mode,
  onModeChange,
}: {
  mode: AuthMode;
  onModeChange: (m: AuthMode) => void;
}) {
  return (
    <div className="w-full rounded-3xl border bg-card p-5 shadow-xl shadow-black/5 sm:p-7">
      <h2 className="text-xl font-bold">
        {mode === "login" ? "Welcome back" : "Create your account"}
      </h2>
      <p className="mt-1 mb-5 text-sm text-muted-foreground">
        {mode === "login"
          ? "Log in to see your money at a glance."
          : "Free forever. Takes under a minute."}
      </p>
      <Segmented
        className="mb-5 w-full"
        value={mode}
        onChange={onModeChange}
        options={[
          { value: "login", label: "Log in" },
          { value: "register", label: "Register" },
        ]}
      />
      {mode === "login" ? <LoginForm /> : <RegisterForm />}
    </div>
  );
}
