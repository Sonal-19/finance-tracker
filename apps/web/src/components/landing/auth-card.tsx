import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  KeyRound,
  Loader2,
  Lock,
  LogIn,
  Mail,
  MailCheck,
  ShieldCheck,
  User,
  UserPlus,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Field } from "@/components/common/field";
import { OtpInput } from "@/components/common/otp-input";
import { PasswordInput } from "@/components/common/password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, callMsg } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

export type AuthMode = "login" | "register";

const IS_DEV = import.meta.env.DEV;

export function DevOtpHint({ onFill }: { onFill?: () => void }) {
  if (!IS_DEV) return null;
  return (
    <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-xs text-primary dark:bg-primary/15">
      <span className="flex items-center gap-1.5 font-medium">
        <KeyRound className="size-3.5" />
        Dev code: <b className="font-mono tracking-widest">123456</b>
      </span>
      {onFill && (
        <button
          type="button"
          onClick={onFill}
          className="rounded bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground shadow-sm hover:opacity-90 active:scale-95"
        >
          Auto-fill
        </button>
      )}
    </div>
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

  const handleFillDemo = () => {
    setEmail("demo@finance.local");
    setPassword("Demo@1234");
    toast.info("Demo credentials loaded! Click Log In.");
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        login.mutate();
      }}
    >
      <Field label="Email address" htmlFor="login-email">
        <div className="relative">
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-11 pl-9 transition-all focus-visible:ring-primary/40"
          />
          <Mail className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" />
        </div>
      </Field>

      <Field label="Password" htmlFor="login-password">
        <div className="relative">
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            className="h-11 transition-all focus-visible:ring-primary/40"
          />
        </div>
      </Field>

      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Session stays active</span>
        <Link
          to="/forgot-password"
          search={{ email: email || undefined }}
          className="font-medium text-primary transition-colors hover:text-primary/80 hover:underline"
        >
          Forgot password?
        </Link>
      </div>

      <Button
        type="submit"
        size="lg"
        className="group relative h-11 w-full overflow-hidden bg-primary font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/95 hover:shadow-xl hover:shadow-primary/30 active:scale-[0.99]"
        disabled={login.isPending}
      >
        {login.isPending ? (
          <span className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" /> Authenticating…
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <span>Log in to your account</span>
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </span>
        )}
      </Button>

      {IS_DEV && (
        <button
          type="button"
          onClick={handleFillDemo}
          className="flex px-4 sm:items-center sm:justify-center gap-1.5 rounded-lg border border-dashed border-primary/30 bg-primary/5 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/10 hover:border-primary/50"
        >
          <Zap className="size-3.5" />
          <span>Quick fill demo credentials</span>
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

  const passwordLengthOk = password.length >= 8;
  const passwordsMatch = confirmPw.length > 0 && confirmPw === password;
  const passwordMismatch = confirmPw.length > 0 && confirmPw !== password;

  // Password strength calculation
  const strengthScore = (() => {
    if (!password) return 0;
    let s = 0;
    if (password.length >= 8) s += 1;
    if (/[A-Z]/.test(password)) s += 1;
    if (/[0-9]/.test(password)) s += 1;
    if (/[^A-Za-z0-9]/.test(password)) s += 1;
    return s;
  })();

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
          <div className="relative">
            <Input
              id="reg-name"
              autoComplete="name"
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sonal Verma"
              className="h-11 pl-9 transition-all focus-visible:ring-primary/40"
            />
            <User className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" />
          </div>
        </Field>

        <Field
          label="Email address"
          htmlFor="reg-email"
          hint="We will send a 6-digit verification code."
        >
          <div className="relative">
            <Input
              id="reg-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-11 pl-9 transition-all focus-visible:ring-primary/40"
            />
            <Mail className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground" />
          </div>
        </Field>

        <Button
          type="submit"
          size="lg"
          className="group relative h-11 w-full overflow-hidden bg-primary font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/95 hover:shadow-xl hover:shadow-primary/30 active:scale-[0.99]"
          disabled={sendOtp.isPending}
        >
          {sendOtp.isPending ? (
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> Sending security code…
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span>Continue to verification</span>
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </span>
          )}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          🔒 No spam. Your email is only used for account security.
        </p>
      </form>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (password !== confirmPw) return toast.error("Passwords don't match");
        verify.mutate();
      }}
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep("details")}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Edit name or email
        </button>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
          Step 2 of 2
        </span>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs dark:bg-primary/10">
        <MailCheck className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="leading-relaxed">
          6-digit OTP sent to{" "}
          <b className="font-semibold text-foreground break-all">{email}</b>
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-foreground">
            Verification code
          </label>
          {cooldown > 0 ? (
            <span className="text-xs text-muted-foreground">
              Resend code in {cooldown}s
            </span>
          ) : (
            <button
              type="button"
              className="text-xs font-semibold text-primary hover:underline"
              disabled={sendOtp.isPending}
              onClick={() => sendOtp.mutate()}
            >
              Resend OTP
            </button>
          )}
        </div>
        <div className="flex justify-center py-1">
          <OtpInput value={otp} onChange={setOtp} autoFocus />
        </div>
      </div>

      <DevOtpHint onFill={() => setOtp("123456")} />

      <Field
        label="Create strong password"
        htmlFor="reg-password"
        hint="Minimum 8 characters."
      >
        <PasswordInput
          id="reg-password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          className="h-11"
        />
        {password.length > 0 && (
          <div className="mt-2 space-y-1">
            <div className="flex h-1.5 gap-1 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full transition-all duration-300 ${
                  strengthScore >= 1 ? "w-1/4 bg-expense" : "w-0"
                }`}
              />
              <div
                className={`h-full transition-all duration-300 ${
                  strengthScore >= 2 ? "w-1/4 bg-warning" : "w-0"
                }`}
              />
              <div
                className={`h-full transition-all duration-300 ${
                  strengthScore >= 3 ? "w-1/4 bg-primary" : "w-0"
                }`}
              />
              <div
                className={`h-full transition-all duration-300 ${
                  strengthScore >= 4 ? "w-1/4 bg-income" : "w-0"
                }`}
              />
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>
                {strengthScore < 2
                  ? "Weak password"
                  : strengthScore < 4
                    ? "Good password"
                    : "Strong password"}
              </span>
              <span>{passwordLengthOk ? "✓ 8+ chars" : "Need 8+ chars"}</span>
            </div>
          </div>
        )}
      </Field>

      <Field label="Confirm password" htmlFor="reg-confirm">
        <div className="relative">
          <PasswordInput
            id="reg-confirm"
            autoComplete="new-password"
            required
            aria-invalid={passwordMismatch}
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
            placeholder="Re-enter your password"
            className="h-11"
          />
          {passwordsMatch && (
            <span className="pointer-events-none absolute top-3 right-10 text-income">
              <CheckCircle2 className="size-4" />
            </span>
          )}
        </div>
        {passwordMismatch && (
          <p className="mt-1 text-xs text-destructive">
            Passwords do not match
          </p>
        )}
      </Field>

      <Button
        type="submit"
        size="lg"
        className="group relative h-11 w-full overflow-hidden bg-primary font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/95 hover:shadow-xl active:scale-[0.99]"
        disabled={
          otp.length !== 6 ||
          password.length < 8 ||
          password !== confirmPw ||
          verify.isPending
        }
      >
        {verify.isPending ? (
          <span className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" /> Finalizing setup…
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Check className="size-4" />
            <span>Complete registration & launch</span>
          </span>
        )}
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
    <div className="relative w-full rounded-3xl border border-border/80 bg-card/90 p-5 shadow-2xl backdrop-blur-xl transition-all sm:p-7 dark:border-border/60 dark:bg-card/80">
      {/* Decorative ambient subtle glow */}
      <div className="pointer-events-none absolute -inset-0.5 -z-10 rounded-3xl bg-gradient-to-b from-primary/25 via-primary/5 to-transparent opacity-50 blur-xl" />

      {/* Header security badge */}
      <div className="mb-4 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary dark:bg-primary/20">
          <ShieldCheck className="size-3.5" /> Bank-grade encryption
        </span>
        <span className="text-[11px] font-medium text-muted-foreground">
          ₹ INR Native
        </span>
      </div>

      <div className="mb-5">
        <h2 className="text-2xl font-extrabold tracking-tight text-foreground">
          {mode === "login" ? "Welcome back" : "Create your free account"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "login"
            ? "Access your dashboard, accounts and transaction insights."
            : "No fees, no card needed. Track your rupees in seconds."}
        </p>
      </div>

      {/* Modern animated Tab Switcher */}
      <div className="relative mb-6 grid grid-cols-2 rounded-xl border border-border bg-muted/70 p-1">
        <button
          type="button"
          onClick={() => onModeChange("login")}
          className={`relative z-10 flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-colors ${
            mode === "login"
              ? "text-primary-foreground dark:text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {mode === "login" && (
            <motion.div
              layoutId="auth-tab-active-indicator"
              className="absolute inset-0 rounded-lg bg-primary shadow-sm"
              transition={{ type: "spring", stiffness: 450, damping: 32 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-1.5">
            <LogIn className="size-3.5" /> Log in
          </span>
        </button>

        <button
          type="button"
          onClick={() => onModeChange("register")}
          className={`relative z-10 flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold transition-colors ${
            mode === "register"
              ? "text-primary-foreground dark:text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {mode === "register" && (
            <motion.div
              layoutId="auth-tab-active-indicator"
              className="absolute inset-0 rounded-lg bg-primary shadow-sm"
              transition={{ type: "spring", stiffness: 450, damping: 32 }}
            />
          )}
          <span className="relative z-10 flex items-center gap-1.5">
            <UserPlus className="size-3.5" /> Register
          </span>
        </button>
      </div>

      {/* Animated Form container */}
      <AnimatePresence mode="wait">
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
        >
          {mode === "login" ? <LoginForm /> : <RegisterForm />}
        </motion.div>
      </AnimatePresence>

      {/* Trust pill footer */}
      <div className="mt-6 hidden sm:flex items-center justify-around border-t border-border/70 pt-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Lock className="size-3 text-primary" /> 100% Private
        </span>
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="size-3 text-primary" /> Verified OTP
        </span>
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="size-3 text-primary" /> No Third-Party Ads
        </span>
      </div>
    </div>
  );
}
