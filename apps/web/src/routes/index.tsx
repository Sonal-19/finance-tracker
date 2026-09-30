import { createFileRoute, Navigate } from "@tanstack/react-router";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  CalendarRange,
  Download,
  Moon,
  PiggyBank,
  Repeat,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react";
import { useRef, useState } from "react";
import { Logo } from "@/components/common/logo";
import { AuthCard, type AuthMode } from "@/components/landing/auth-card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  component: Landing,
});

const FEATURES = [
  {
    icon: ArrowDownLeft,
    title: "Credit & debit tracking",
    text: "Log salary, freelance and refunds as credit; rent, grocery, medical, travel, food and shopping as debit.",
  },
  {
    icon: CalendarRange,
    title: "Day, week, month, year",
    text: "Jump between periods and compare with the previous one in a tap.",
  },
  {
    icon: BarChart3,
    title: "Beautiful charts",
    text: "Income vs expense bars, category donut, spending trend and a calendar heatmap.",
  },
  {
    icon: Wallet,
    title: "Budgets that warn you",
    text: "Set a monthly budget per category and get alerts at 80% and 100%.",
  },
  {
    icon: Repeat,
    title: "Recurring entries",
    text: "Rent, salary, EMIs and subscriptions are added automatically on schedule.",
  },
  {
    icon: PiggyBank,
    title: "Savings goals",
    text: "Save for a bike, a trip or an emergency fund and watch the progress ring fill.",
  },
  {
    icon: Download,
    title: "Export to CSV",
    text: "Download any filtered list of transactions for Excel or your CA.",
  },
  {
    icon: ShieldCheck,
    title: "Secure by design",
    text: "Email OTP verification, hashed passwords and httpOnly sessions.",
  },
  {
    icon: Smartphone,
    title: "Feels like an app",
    text: "Install it on your phone. Bottom tabs, swipe-down sheets, dark mode.",
  },
];

function PhonePreview() {
  const rows = [
    { name: "Salary", amt: "+₹85,000", c: "#16a34a", credit: true },
    { name: "Room rent", amt: "−₹18,000", c: "#dc2626" },
    { name: "Grocery", amt: "−₹1,240", c: "#16a34a" },
    { name: "Food & dining", amt: "−₹360", c: "#f97316" },
  ];
  return (
    <div className="mx-auto w-full max-w-[300px] rounded-[2.5rem] border-8 border-foreground/90 bg-background p-4 shadow-2xl">
      <p className="text-xs text-muted-foreground">This month</p>
      <p className="text-2xl font-bold">₹28,084</p>
      <p className="text-xs text-income">Saved 30% of income</p>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-card p-2.5 shadow-sm">
          <ArrowDownLeft className="size-4 text-income" />
          <p className="mt-1 text-muted-foreground">Income</p>
          <p className="font-semibold">₹93,818</p>
        </div>
        <div className="rounded-xl bg-card p-2.5 shadow-sm">
          <ArrowUpRight className="size-4 text-expense" />
          <p className="mt-1 text-muted-foreground">Expense</p>
          <p className="font-semibold">₹65,734</p>
        </div>
      </div>
      <div className="mt-3 flex h-16 items-end gap-1">
        {[40, 65, 30, 80, 55, 70, 45, 90, 35, 60].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-chart-expense/80"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((r) => (
          <div
            key={r.name}
            className="flex items-center gap-2 rounded-lg bg-card p-2 text-xs shadow-sm"
          >
            <span
              className="size-6 rounded-full"
              style={{ backgroundColor: `${r.c}33` }}
            />
            <span className="flex-1">{r.name}</span>
            <span
              className={
                r.credit ? "font-semibold text-income" : "font-semibold"
              }
            >
              {r.amt}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Landing() {
  const { user, isLoading } = useAuth();
  const [mode, setMode] = useState<AuthMode>("register");
  const authRef = useRef<HTMLDivElement>(null);

  if (!isLoading && user) return <Navigate to="/dashboard" replace />;

  const goAuth = (m: AuthMode) => {
    setMode(m);
    authRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-dvh overflow-x-hidden">
      <header className="pt-safe sticky top-0 z-30 border-b bg-background/80 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => goAuth("login")}>
              Log in
            </Button>
            <Button
              onClick={() => goAuth("register")}
              className="hidden sm:inline-flex"
            >
              Get started
            </Button>
          </div>
        </div>
      </header>

      <section className="relative">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_20%_0%,color-mix(in_oklab,var(--primary)_18%,transparent),transparent),radial-gradient(40%_40%_at_90%_30%,color-mix(in_oklab,var(--chart-expense)_12%,transparent),transparent)]" />
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-10 md:py-16 lg:grid-cols-[1.1fr_1fr] lg:items-start">
          <div className="space-y-6 lg:pt-8">
            <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium">
              <Moon className="size-3.5 text-primary" /> Personal finance, made
              simple
            </span>
            <h1 className="text-4xl font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Track every <span className="text-primary">rupee</span> you earn
              and spend.
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">
              Record your credits and debits date-wise, see daily, weekly,
              monthly and yearly spending with clear charts, plan budgets and
              grow your savings — all from your phone or laptop.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button size="lg" onClick={() => goAuth("register")}>
                Create free account
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => goAuth("login")}
              >
                I already have an account
              </Button>
            </div>
            <div className="hidden pt-4 lg:block">
              <PhonePreview />
            </div>
          </div>
          <div ref={authRef} className="scroll-mt-24 lg:sticky lg:top-24">
            <AuthCard mode={mode} onModeChange={setMode} />
          </div>
        </div>
      </section>

      <section className="border-t bg-card/50">
        <div className="mx-auto max-w-6xl px-4 py-14 md:py-20">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            Everything your money needs
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
            Built for everyday Indian finances — INR formatting, UPI, cash and
            card payments.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border bg-card p-5 transition-shadow hover:shadow-md"
              >
                <span className="grid size-11 place-items-center rounded-xl bg-accent text-accent-foreground">
                  <f.icon className="size-5" />
                </span>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 lg:hidden">
            <PhonePreview />
          </div>
        </div>
      </section>

      <footer className="pb-safe border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row">
          <Logo className="scale-90" />
          <p>
            © {new Date().getFullYear()} Finance Tracker. Your data stays yours.
          </p>
        </div>
      </footer>
    </div>
  );
}
