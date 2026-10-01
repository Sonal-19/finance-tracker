import { createFileRoute, Navigate } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BellRing,
  Calculator,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  IndianRupee,
  Landmark,
  Layers,
  Lock,
  Moon,
  PiggyBank,
  Play,
  Receipt,
  Repeat,
  RotateCcw,
  ShieldCheck,
  Sliders,
  SmartphoneNfc,
  Sparkles,
  Sun,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { Logo } from "@/components/common/logo";
import { AnimatedHero } from "@/components/landing/animated-hero";
import { AuthCard, type AuthMode } from "@/components/landing/auth-card";
import { FeatureBento } from "@/components/landing/feature-bento";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { money } from "@/lib/format";
import { useThemeStore } from "@/stores/theme-store";

export const Route = createFileRoute("/")({
  component: Landing,
});

const FAQS = [
  {
    q: "Is Finance Tracker completely free to use?",
    a: "Yes! Finance Tracker is completely free. There are no hidden fees, paywalls, or premium tiers. All features—including unlimited transactions, budgets, recurring rules, reports, and CSV export—are unlocked for everyone.",
  },
  {
    q: "Do you ask for my bank netbanking password or read my SMS?",
    a: "Never! Unlike commercial fintech apps that scrape your private SMS inbox or request bank login credentials, Finance Tracker respects your privacy completely. You log transactions cleanly without linking sensitive bank credentials.",
  },
  {
    q: "How does the email OTP verification work?",
    a: "When you sign up or reset your password, a secure 6-digit code is dispatched to your email. In local development mode, you can simply use the pre-configured code 123456 for instant testing.",
  },
  {
    q: "Can I install Finance Tracker on my phone?",
    a: "Yes! Finance Tracker is an installable Progressive Web App (PWA). Tap 'Add to Home Screen' in Safari on iOS or Chrome on Android. It launches fullscreen with native bottom navigation and swipe sheets.",
  },
  {
    q: "How does split expense tracking work?",
    a: "You can create an Event (e.g. 'Manali Trip') and record group expenses. Finance Tracker automatically calculates your exact share, tracks who paid, and shows who owes whom without touching your personal bank accounts until settled.",
  },
  {
    q: "Can I export my financial data for tax season?",
    a: "Yes! With one tap, you can download a complete CSV of all or filtered transactions. It formats cleanly for Excel, Google Sheets, or your CA during ITR filing season.",
  },
];

const HOW_IT_WORKS_STEPS = [
  {
    step: "1",
    title: "Sign up, It's Free!",
    desc: "Create your account in under 30 seconds with instant email OTP. Zero bank passwords, zero SMS scraping, and no credit card required.",
  },
  {
    step: "2",
    title: "Log Cash, Cards & Banks",
    desc: "Add your cash wallet, bank accounts, and monthly category limits with real-time 80% & 100% threshold alerts.",
  },
  {
    step: "3",
    title: "Gain 100% Financial Clarity",
    desc: "Split trip & flat bills with friends, watch savings milestones compound, and export tax-ready CSV reports anytime.",
  },
];

/* -------------------------------------------------------------------------- */
/*                     INTERACTIVE PAYMENT SLIP SIMULATOR                     */
/* -------------------------------------------------------------------------- */

type SlipType = "upi" | "budget" | "split" | "goal";

interface UpiOption {
  id: string;
  name: string;
  account: string;
  badgeBg: string;
  badgeText: string;
  ref: string;
  note: string;
}

const UPI_OPTIONS: UpiOption[] = [
  {
    id: "gpay",
    name: "Google Pay",
    account: "HDFC Salary Bank (**3210)",
    badgeBg:
      "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
    badgeText: "UPI · Google Pay",
    ref: "FT-UPI-8942001",
    note: "Instant QR scan payment. Auto-allocated to Grocery cap.",
  },
  {
    id: "phonepe",
    name: "PhonePe",
    account: "ICICI Savings A/c (**7418)",
    badgeBg:
      "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/25",
    badgeText: "UPI · PhonePe",
    ref: "FT-UPI-7712390",
    note: "Merchant VPA payment verified. Zero OTP wait time.",
  },
  {
    id: "paytm",
    name: "Paytm UPI",
    account: "Paytm Payments Bank / Wallet",
    badgeBg: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/25",
    badgeText: "UPI · Paytm",
    ref: "FT-UPI-5521908",
    note: "Soundbox verified. Wallet & bank balance linked.",
  },
  {
    id: "cash",
    name: "Cash in Wallet",
    account: "Physical Pocket Cash",
    badgeBg:
      "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25",
    badgeText: "Physical Cash",
    ref: "FT-CASH-00142",
    note: "Cash withdrawn from ATM auto-synced to pocket balance.",
  },
];

const SLIP_TABS: {
  id: SlipType;
  label: string;
  icon: typeof SmartphoneNfc;
  badge: string;
}[] = [
  {
    id: "upi",
    label: "UPI & Cash Slip",
    icon: SmartphoneNfc,
    badge: "Instant Tags",
  },
  {
    id: "budget",
    label: "Smart Budget Alert",
    icon: AlertTriangle,
    badge: "Pacing Warning",
  },
  {
    id: "split",
    label: "Group Trip Split",
    icon: Users,
    badge: "Zero IOU Stress",
  },
  {
    id: "goal",
    label: "Savings Milestone",
    icon: PiggyBank,
    badge: "Target Compounding",
  },
];

function PaymentSlipSimulator() {
  const [activeSlip, setActiveSlip] = useState<SlipType>("upi");

  // State 1: UPI slip
  const [selectedUpi, setSelectedUpi] = useState<string>("gpay");
  const amount = 1450;
  const upiData =
    UPI_OPTIONS.find((u) => u.id === selectedUpi) ?? UPI_OPTIONS[0]!;

  // State 2: Budget slip
  const [simSpend, setSimSpend] = useState<number>(6800);
  const budgetCap = 8000;
  const budgetPct = Math.round((simSpend / budgetCap) * 100);

  // State 3: Split slip
  const totalBill = 14000;
  const yourShare = 3500;
  const [settled, setSettled] = useState<{ [key: string]: boolean }>({
    rahul: true,
    priya: false,
    amit: false,
  });

  const toggleSettle = (id: string) => {
    setSettled((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const members = [
    { id: "rahul", name: "Rahul Verma", share: 3500, phone: "+91 98210 ••••4" },
    {
      id: "priya",
      name: "Priya Sharma",
      share: 3500,
      phone: "+91 97120 ••••8",
    },
    { id: "amit", name: "Amit Patel", share: 3500, phone: "+91 99340 ••••1" },
  ];
  const unpaidMembers = members.filter((m) => !settled[m.id]);
  const unpaidTotal = unpaidMembers.reduce((acc, m) => acc + m.share, 0);

  // State 4: Goal slip
  const [extraDeposit, setExtraDeposit] = useState<number>(15000);
  const baseGoalSaved = 225000;
  const goalTarget = 300000;
  const totalGoalSaved = Math.min(goalTarget, baseGoalSaved + extraDeposit);
  const goalPct = Math.round((totalGoalSaved / goalTarget) * 100);

  return (
    <div className="w-full">
      {/* -------------------------------------------------------------------- */}
      {/*        SWIPEABLE NATIVE SEGMENTED TABS (MOBILE + DESKTOP)            */}
      {/* -------------------------------------------------------------------- */}
      <div className="no-scrollbar flex items-center justify-start sm:justify-center gap-2 overflow-x-auto pb-4 pt-2 -mx-4 px-4 sm:mx-0 sm:px-0">
        {SLIP_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSlip === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSlip(tab.id)}
              className={`group relative flex shrink-0 items-center gap-2 rounded-2xl sm:rounded-full px-3.5 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-bold transition-all duration-200 cursor-pointer ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 scale-[1.02]"
                  : "bg-card/90 border border-border/80 text-muted-foreground hover:bg-muted/80 hover:text-foreground active:scale-95 dark:bg-[#121a21] dark:border-white/10"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              <span>{tab.label}</span>
              <span
                className={`hidden md:inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                  isActive
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted text-muted-foreground group-hover:text-foreground dark:bg-white/10"
                }`}
              >
                {tab.badge}
              </span>
            </button>
          );
        })}
      </div>

      {/* -------------------------------------------------------------------- */}
      {/*           MAIN TWO-COLUMN STAGE: SLIP CARD + COMPANION PANEL         */}
      {/* -------------------------------------------------------------------- */}
      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 sm:gap-10 items-start">
        {/* =================================================================== */}
        {/*             LEFT COLUMN: THE TACTILE PAYMENT SLIP NOTE              */}
        {/* =================================================================== */}
        <div className="lg:col-span-7 flex justify-center">
          <div className="relative w-full max-w-lg rounded-3xl border border-border/90 bg-white p-5 sm:p-7 shadow-2xl backdrop-blur-xl transition-all dark:border-white/15 dark:bg-[#16212b] dark:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] ring-1 ring-black/5 dark:ring-white/10">
            {/* Top Jagged Receipt Sawtooth Edge */}
            <div className="absolute -top-2 left-6 right-6 h-2 overflow-hidden pointer-events-none">
              <svg
                className="w-full h-2 fill-white dark:fill-[#16212b]"
                preserveAspectRatio="none"
                viewBox="0 0 240 8"
              >
                <polygon points="0,8 3,0 6,8 9,0 12,8 15,0 18,8 21,0 24,8 27,0 30,8 33,0 36,8 39,0 42,8 45,0 48,8 51,0 54,8 57,0 60,8 63,0 66,8 69,0 72,8 75,0 78,8 81,0 84,8 87,0 90,8 93,0 96,8 99,0 102,8 105,0 108,8 111,0 114,8 117,0 120,8 123,0 126,8 129,0 132,8 135,0 138,8 141,0 144,8 147,0 150,8 153,0 156,8 159,0 162,8 165,0 168,8 171,0 174,8 177,0 180,8 183,0 186,8 189,0 192,8 195,0 198,8 201,0 204,8 207,0 210,8 213,0 216,8 219,0 222,8 225,0 228,8 231,0 234,8 237,0 240,8" />
              </svg>
            </div>

            {/* Slip Header */}
            <div className="flex items-center justify-between border-b border-border/70 dark:border-white/10 pb-3 text-xs">
              <div className="flex items-center gap-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                  <Receipt className="size-3.5" />
                </div>
                <div>
                  <p className="font-mono text-[9px] tracking-wider text-muted-foreground uppercase">
                    TACTILE VOUCHER
                  </p>
                  <p className="font-mono text-xs font-bold text-foreground">
                    {activeSlip === "upi" && upiData.ref}
                    {activeSlip === "budget" && "FT-BUDGET-OCT26"}
                    {activeSlip === "split" && "FT-SPLIT-GOA-2026"}
                    {activeSlip === "goal" && "FT-GOAL-RESERVE-01"}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="font-mono text-[10px] font-semibold text-muted-foreground">
                  Today, 2:45 PM
                </p>
                <p className="font-mono text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                  VERIFIED ✓
                </p>
              </div>
            </div>

            {/* Slip Content Morphing via AnimatePresence */}
            <AnimatePresence mode="wait">
              {/* SLIP 1: UPI & Pocket Cash */}
              {activeSlip === "upi" && (
                <motion.div
                  key="slip-upi"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="pt-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${upiData.badgeBg}`}
                    >
                      <Check className="size-3 stroke-[3]" />{" "}
                      {upiData.badgeText}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                      ✓ Deducted
                    </span>
                  </div>

                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
                      Nature Basket Provisions
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Mumbai, Bandra West · Category: Groceries
                    </p>
                  </div>

                  <div className="flex items-baseline gap-2 pt-0.5">
                    <span className="text-3xl sm:text-4xl font-black tracking-tight text-foreground font-mono">
                      −₹{money(amount)}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">
                      via {upiData.name}
                    </span>
                  </div>

                  {/* Itemized Table */}
                  <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/30 dark:bg-black/30 dark:border-white/5 p-3 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Debit Origin
                      </span>
                      <span className="font-semibold text-foreground">
                        {upiData.account}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Monthly Grocery Cap
                      </span>
                      <span className="font-semibold text-foreground">
                        ₹14,000 (₹3,200 remaining)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Privacy Protection
                      </span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        Zero SMS Scraping
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* SLIP 2: Proactive Budget Alert */}
              {activeSlip === "budget" && (
                <motion.div
                  key="slip-budget"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="pt-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    {budgetPct >= 100 ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/15 px-2.5 py-0.5 text-[11px] font-bold text-destructive">
                        <AlertTriangle className="size-3" /> 🚨 100%+ Limit
                        Breached
                      </span>
                    ) : budgetPct >= 80 ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/30 bg-warning/15 px-2.5 py-0.5 text-[11px] font-bold text-warning">
                        <AlertTriangle className="size-3" /> ⚠️ 80% Caution Alert
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-income/30 bg-income/15 px-2.5 py-0.5 text-[11px] font-bold text-income">
                        <Check className="size-3" /> ✓ On Track (Safe)
                      </span>
                    )}
                    <span className="rounded-md bg-muted/80 dark:bg-white/10 px-2 py-0.5 text-[11px] font-mono font-bold text-muted-foreground">
                      {budgetPct}% spent
                    </span>
                  </div>

                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
                      Dining & Weekend Outings
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Monthly Cap: ₹{money(budgetCap)} · Cycle: Oct 2026
                    </p>
                  </div>

                  <div className="flex items-baseline gap-2 pt-0.5">
                    <span
                      className={`text-3xl sm:text-4xl font-black tracking-tight font-mono ${
                        budgetPct >= 100
                          ? "text-destructive"
                          : budgetPct >= 80
                            ? "text-warning"
                            : "text-foreground"
                      }`}
                    >
                      ₹{money(simSpend)}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">
                      of ₹{money(budgetCap)} cap
                    </span>
                  </div>

                  {/* Dynamic Progress Bar */}
                  <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/30 dark:bg-black/30 dark:border-white/5 p-3">
                    <div className="flex justify-between text-xs font-medium text-muted-foreground">
                      <span>Spent: ₹{money(simSpend)}</span>
                      <span>Cap: ₹{money(budgetCap)}</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted dark:bg-white/10">
                      <div
                        className={`h-full transition-all duration-300 ${
                          budgetPct >= 100
                            ? "bg-destructive"
                            : budgetPct >= 80
                              ? "bg-warning"
                              : "bg-income"
                        }`}
                        style={{ width: `${Math.min(budgetPct, 100)}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {simSpend > budgetCap
                        ? `🚨 Exceeded monthly cap by ₹${money(simSpend - budgetCap)}! Dashboard lock engaged.`
                        : `₹${money(budgetCap - simSpend)} remaining before hitting your monthly cap.`}
                    </p>
                  </div>
                </motion.div>
              )}

              {/* SLIP 3: Group Trip Split */}
              {activeSlip === "split" && (
                <motion.div
                  key="slip-split"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="pt-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    {unpaidTotal === 0 ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-income/30 bg-income/15 px-2.5 py-0.5 text-[11px] font-bold text-income">
                        <CheckCircle2 className="size-3" /> ✓ 100% Fully Settled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                        <Users className="size-3" /> 4 Friends · Shared Bill
                      </span>
                    )}
                    <span className="text-[11px] font-semibold text-muted-foreground">
                      Paid Upfront by You
                    </span>
                  </div>

                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
                      Goa Trip Beach Villa
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Total Bill: ₹{money(totalBill)} · 4 Equal Splits
                    </p>
                  </div>

                  <div className="flex items-baseline gap-2 pt-0.5">
                    <span className="text-3xl sm:text-4xl font-black tracking-tight text-foreground font-mono">
                      ₹{money(yourShare)}
                    </span>
                    <span className="text-xs font-semibold text-primary">
                      Your exact personal share
                    </span>
                  </div>

                  {/* Friends Owed Status */}
                  <div className="space-y-1.5 rounded-2xl border border-border/70 bg-muted/30 dark:bg-black/30 dark:border-white/5 p-3 text-xs">
                    {members.map((m) => {
                      const isPaid = settled[m.id];
                      return (
                        <div
                          key={m.id}
                          className="flex items-center justify-between py-0.5"
                        >
                          <span className="font-medium text-foreground">
                            {m.name}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground font-mono">
                              ₹{money(m.share)}
                            </span>
                            {isPaid ? (
                              <span className="rounded-md bg-income/15 px-2 py-0.5 text-[10px] font-bold text-income">
                                Settled ✓
                              </span>
                            ) : (
                              <span className="rounded-md bg-warning/20 px-2 py-0.5 text-[10px] font-bold text-warning">
                                Unpaid
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* SLIP 4: Milestone Savings Goal */}
              {activeSlip === "goal" && (
                <motion.div
                  key="slip-goal"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="pt-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                      <PiggyBank className="size-3" /> Goal #1: Liquid Reserve
                    </span>
                    <span className="rounded-md bg-income/15 px-2 py-0.5 text-[11px] font-bold text-income">
                      {goalPct}% achieved
                    </span>
                  </div>

                  <div>
                    <h3 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
                      Emergency Fund (6 Mos)
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Target: ₹{money(goalTarget)} · Target: Dec 2026
                    </p>
                  </div>

                  <div className="flex items-baseline gap-2 pt-0.5">
                    <span className="text-3xl sm:text-4xl font-black tracking-tight text-primary font-mono">
                      ₹{money(totalGoalSaved)}
                    </span>
                    <span className="text-xs font-semibold text-muted-foreground">
                      of ₹{money(goalTarget)} goal
                    </span>
                  </div>

                  {/* Progress Milestone Bar */}
                  <div className="space-y-2 rounded-2xl border border-border/70 bg-muted/30 dark:bg-black/30 dark:border-white/5 p-3">
                    <div className="flex justify-between text-xs font-medium text-muted-foreground">
                      <span>Saved: ₹{money(totalGoalSaved)}</span>
                      <span>Target: ₹{money(goalTarget)}</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted dark:bg-white/10">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${Math.min(goalPct, 100)}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {goalTarget > totalGoalSaved
                        ? `Only ₹${money(goalTarget - totalGoalSaved)} away from 100% financial peace of mind.`
                        : "🎉 Milestone 100% unlocked! Goal achieved."}
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ---------------------------------------------------------------- */}
            {/*          THE ICONIC PERFORATION LINE WITH TICKET CUTOUTS         */}
            {/* ---------------------------------------------------------------- */}
            <div className="relative my-6 -mx-5 sm:-mx-7 flex items-center">
              {/* Left Circular Punch Notch */}
              <div className="size-6 -ml-3 rounded-full bg-background border-r border-t border-b border-border/80 dark:border-white/10 shadow-[inset_-2px_0_4px_rgba(0,0,0,0.15)]" />
              {/* Dashed Tear Line */}
              <div className="w-full border-t-2 border-dashed border-border/80 dark:border-white/15 mx-1" />
              {/* Right Circular Punch Notch */}
              <div className="size-6 -mr-3 rounded-full bg-background border-l border-t border-b border-border/80 dark:border-white/10 shadow-[inset_2px_0_4px_rgba(0,0,0,0.15)]" />
            </div>

            {/* Slip Tear-Off Stub: Barcode & Bank-Grade Security Guarantee */}
            <div className="flex flex-col items-center justify-center pt-1 text-center">
              {/* Stylized Modern Barcode SVG */}
              <div className="flex h-8 items-end gap-1 px-4 opacity-80 dark:opacity-70">
                {[
                  2, 1, 3, 1, 4, 2, 1, 3, 2, 4, 1, 2, 3, 1, 2, 4, 2, 1, 3, 2, 1,
                  4, 2, 1, 3, 1, 2,
                ].map((w, i) => (
                  <div
                    key={i}
                    className="h-full bg-foreground rounded-xs"
                    style={{ width: `${w * 1.5}px` }}
                  />
                ))}
              </div>
              <p className="mt-1.5 font-mono text-[10px] tracking-[0.25em] text-muted-foreground uppercase">
                FT-INR · 8901 2345 6789 · TACTILE SLIP
              </p>
              <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="size-3.5" />
                <span>Bank-Grade Privacy · Zero Bank SMS Reading</span>
              </div>
            </div>

            {/* Bottom Jagged Receipt Sawtooth Edge */}
            <div className="absolute -bottom-2 left-6 right-6 h-2 overflow-hidden pointer-events-none">
              <svg
                className="w-full h-2 fill-white dark:fill-[#16212b] rotate-180"
                preserveAspectRatio="none"
                viewBox="0 0 240 8"
              >
                <polygon points="0,8 3,0 6,8 9,0 12,8 15,0 18,8 21,0 24,8 27,0 30,8 33,0 36,8 39,0 42,8 45,0 48,8 51,0 54,8 57,0 60,8 63,0 66,8 69,0 72,8 75,0 78,8 81,0 84,8 87,0 90,8 93,0 96,8 99,0 102,8 105,0 108,8 111,0 114,8 117,0 120,8 123,0 126,8 129,0 132,8 135,0 138,8 141,0 144,8 147,0 150,8 153,0 156,8 159,0 162,8 165,0 168,8 171,0 174,8 177,0 180,8 183,0 186,8 189,0 192,8 195,0 198,8 201,0 204,8 207,0 210,8 213,0 216,8 219,0 222,8 225,0 228,8 231,0 234,8 237,0 240,8" />
              </svg>
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/*          RIGHT COLUMN: INTERACTIVE CONTROLS & HIGHLIGHT CARDS       */}
        {/* =================================================================== */}
        <div className="lg:col-span-5 flex flex-col justify-center space-y-6">
          {/* Card: Active Controls */}
          <div className="rounded-3xl border border-border/80 bg-card/90 p-5 sm:p-6 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-[#141d26]">
            {/* Interactive controls for UPI */}
            {activeSlip === "upi" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">
                    Interactive Controls
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Tap to test tags
                  </span>
                </div>
                <h4 className="text-base sm:text-lg font-bold text-foreground">
                  Switch Payment Tag in Real Time
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Tag Google Pay, PhonePe, Paytm, or pocket cash in a single
                  tap. Balances sync without double-counting ATM withdrawals.
                </p>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  {UPI_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSelectedUpi(opt.id)}
                      className={`flex items-center gap-2 rounded-xl p-2.5 text-xs font-bold transition-all cursor-pointer ${
                        selectedUpi === opt.id
                          ? "bg-primary text-primary-foreground shadow-md scale-[1.02]"
                          : "border border-border/80 bg-muted/40 text-foreground hover:bg-muted active:scale-95 dark:border-white/10 dark:bg-white/5"
                      }`}
                    >
                      <span className="size-2 rounded-full bg-current" />
                      <span>{opt.name}</span>
                    </button>
                  ))}
                </div>

                <div className="rounded-xl border border-border/70 bg-muted/30 dark:bg-black/30 dark:border-white/5 p-3 text-xs text-muted-foreground">
                  💡 <b className="text-foreground">Tactile Note:</b>{" "}
                  {upiData.note}
                </div>
              </div>
            )}

            {/* Interactive controls for Budget */}
            {activeSlip === "budget" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">
                    Interactive Controls
                  </span>
                  <span className="text-[11px] font-semibold text-primary">
                    ₹{money(simSpend)} simulated
                  </span>
                </div>
                <h4 className="text-base sm:text-lg font-bold text-foreground">
                  Simulate Spend Pacing Alerts
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Drag the slider to test the dynamic 80% caution amber trigger
                  and 100% budget limit red warning.
                </p>

                {/* Slider */}
                <div className="space-y-2 pt-2">
                  <input
                    type="range"
                    min={4500}
                    max={9000}
                    step={250}
                    value={simSpend}
                    onChange={(e) => setSimSpend(Number(e.target.value))}
                    className="w-full accent-primary cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] font-medium text-muted-foreground">
                    <span>Safe (₹4.5K)</span>
                    <span>80% Alert (₹6.4K)</span>
                    <span>100% Cap (₹8K)</span>
                  </div>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setSimSpend(5500)}
                    className="rounded-lg border border-border bg-muted/50 dark:border-white/10 dark:bg-white/5 px-2.5 py-1 text-xs font-semibold text-foreground hover:bg-muted active:scale-95 cursor-pointer"
                  >
                    Safe: ₹5.5K
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimSpend(6800)}
                    className="rounded-lg border border-warning/30 bg-warning/15 px-2.5 py-1 text-xs font-semibold text-warning hover:bg-warning/25 active:scale-95 cursor-pointer"
                  >
                    ⚠️ 80% Alert: ₹6.8K
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimSpend(8500)}
                    className="rounded-lg border border-destructive/30 bg-destructive/15 px-2.5 py-1 text-xs font-semibold text-destructive hover:bg-destructive/25 active:scale-95 cursor-pointer"
                  >
                    🚨 Cap: ₹8.5K
                  </button>
                </div>
              </div>
            )}

            {/* Interactive controls for Split */}
            {activeSlip === "split" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">
                    Interactive Controls
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    One-tap settlement
                  </span>
                </div>
                <h4 className="text-base sm:text-lg font-bold text-foreground">
                  Settle Group Trip IOUs
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Tap to mark friends as settled when they transfer their share
                  via UPI. No awkward math in WhatsApp group chats.
                </p>

                <div className="space-y-2 pt-1">
                  {members.map((m) => {
                    const isPaid = settled[m.id];
                    return (
                      <div
                        key={m.id}
                        className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/40 dark:border-white/10 dark:bg-white/5 p-2.5 text-xs"
                      >
                        <div>
                          <p className="font-bold text-foreground">{m.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {m.phone}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleSettle(m.id)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                            isPaid
                              ? "bg-income text-white shadow-xs"
                              : "border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 active:scale-95"
                          }`}
                        >
                          {isPaid ? "Settled ✓" : "Settle UPI"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Interactive controls for Goal */}
            {activeSlip === "goal" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-primary">
                    Interactive Controls
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    SIP Compound Test
                  </span>
                </div>
                <h4 className="text-base sm:text-lg font-bold text-foreground">
                  Simulate Monthly Savings Deposits
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Add monthly savings to watch incremental rupee deposits
                  compound toward your ₹3,00,000 emergency buffer.
                </p>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  {[5000, 15000, 25000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() =>
                        setExtraDeposit((prev) => Math.min(75000, prev + amt))
                      }
                      className="rounded-xl border border-primary/30 bg-primary/10 p-2.5 text-center text-xs font-bold text-primary hover:bg-primary/20 active:scale-95 cursor-pointer"
                    >
                      +₹{money(amt)}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between border-t border-border/70 dark:border-white/10 pt-2 text-xs">
                  <span className="text-muted-foreground">
                    Simulated additions: +₹{money(extraDeposit)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setExtraDeposit(0)}
                    className="flex items-center gap-1 font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <RotateCcw className="size-3" /> Reset
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Quick Highlight Proof Badges */}
          <div className="grid grid-cols-1 gap-3 text-xs">
            <div className="flex items-center gap-2.5 rounded-2xl border border-border/70 bg-card/60 dark:bg-[#141d26] dark:border-white/10 p-3.5 shadow-xs">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShieldCheck className="size-4" />
              </span>
              <div>
                <p className="font-bold text-foreground">Zero SMS Scraping</p>
                <p className="text-[11px] text-muted-foreground">
                  100% private ledger
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-2xl border border-border/70 bg-card/60 dark:bg-[#141d26] dark:border-white/10 p-3.5 shadow-xs">
              <span className="flex size-7 items-center justify-center rounded-lg bg-income/10 text-income">
                <Zap className="size-4" />
              </span>
              <div>
                <p className="font-bold text-foreground">₹ Lakhs Native</p>
                <p className="text-[11px] text-muted-foreground">
                  Indian financial format
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                     INTERACTIVE WEALTH CALCULATOR                          */
/* -------------------------------------------------------------------------- */

interface WealthCalculatorProps {
  onStartFree?: () => void;
}

function WealthCalculator({ onStartFree }: WealthCalculatorProps) {
  // Monthly take-home salary
  const [income, setIncome] = useState<number>(75000);
  // Target savings rate percentage
  const [savingsRate, setSavingsRate] = useState<number>(30);
  // Time horizon in years
  const [years, setYears] = useState<number>(5);
  // Expected annual CAGR return
  const [cagr, setCagr] = useState<number>(12);

  // Dynamic calculations
  const monthlySavings = (income * savingsRate) / 100;
  const yearlySavings = monthlySavings * 12;
  const months = years * 12;
  const r = cagr / 100 / 12;

  // Future Value using SIP compounding formula
  const futureValue = Math.round(
    monthlySavings * (((1 + r) ** months - 1) / r) * (1 + r),
  );
  const totalInvested = monthlySavings * months;
  const compoundInterest = Math.max(0, futureValue - totalInvested);
  const principalRatio = Math.max(8, Math.min(92, Math.round((totalInvested / futureValue) * 100)));
  const gainRatio = 100 - principalRatio;
  const multiplier = (futureValue / (totalInvested || 1)).toFixed(2);

  // Smart Indian compact currency formatter
  const formatCompactInr = (val: number) => {
    if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)} Cr`;
    if (val >= 100000) return `₹${(val / 100000).toFixed(2)} L`;
    if (val >= 1000) return `₹${(val / 1000).toFixed(1)} K`;
    return `₹${val.toLocaleString("en-IN")}`;
  };

  return (
    <div className="relative overflow-hidden rounded-[32px] border border-border/80 bg-card p-5 sm:p-8 md:p-10 shadow-2xl backdrop-blur-xl dark:border-border/50">
      {/* Radiant ambient glow orbs */}
      <div className="pointer-events-none absolute -top-32 -right-32 size-96 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 size-96 rounded-full bg-emerald-500/10 blur-3xl" />

      {/* Main Grid: Responsive 2-Column Desktop / Fluid Stacked Mobile */}
      <div className="relative grid gap-8 lg:grid-cols-12 lg:items-stretch">
        {/* ------------------------------------------------------------------ */}
        {/*           PANEL A: NATIVE MOBILE TACTILE CONTROLS (5 COLS)         */}
        {/* ------------------------------------------------------------------ */}
        <div className="lg:col-span-6 flex flex-col justify-between space-y-6">
          <div>
            {/* Header Badge */}
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1 text-xs font-bold text-primary">
                <Calculator className="size-3.5" /> Compound Wealth Engine
              </span>
            </div>

            {/* Punchy Title */}
            <h3 className="mt-3 text-2xl sm:text-3xl font-black tracking-tight text-foreground">
              Turn Daily Leaks Into <br className="hidden sm:inline" />
              <span className="text-gradient-primary">Generational Capital</span>.
            </h3>
            <p className="mt-2 text-xs sm:text-sm text-muted-foreground">
              Tweak parameters to project compounding power on your monthly surplus.
            </p>
          </div>

          {/* Interactive Native Input Modules */}
          <div className="space-y-5 rounded-2xl border border-border/80 bg-muted/40 p-4 sm:p-5">
            {/* Control 1: Monthly Income */}
            <div>
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-foreground">Monthly In-Hand</span>
                <span className="font-mono text-sm text-primary font-black">
                  ₹{income.toLocaleString("en-IN")}
                </span>
              </div>

              {/* Slider */}
              <input
                type="range"
                min={25000}
                max={300000}
                step={5000}
                value={income}
                onChange={(e) => setIncome(Number(e.target.value))}
                className="mt-3 w-full accent-primary cursor-pointer h-2 rounded-lg bg-muted"
              />

              {/* Native Quick Thumb Chips */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  { label: "₹35K", val: 35000 },
                  { label: "₹75K", val: 75000 },
                  { label: "₹1.5L", val: 150000 },
                  { label: "₹2.5L", val: 250000 },
                ].map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => setIncome(chip.val)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                      income === chip.val
                        ? "bg-primary text-primary-foreground shadow-xs scale-105"
                        : "border border-border/80 bg-card/60 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Control 2: Savings Velocity */}
            <div className="pt-3 border-t border-border/60">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-foreground">Target Savings Rate</span>
                <span className="font-mono text-sm text-emerald-600 dark:text-emerald-400 font-black">
                  {savingsRate}% ({formatCompactInr(monthlySavings)}/mo)
                </span>
              </div>

              {/* Slider */}
              <input
                type="range"
                min={10}
                max={60}
                step={5}
                value={savingsRate}
                onChange={(e) => setSavingsRate(Number(e.target.value))}
                className="mt-3 w-full accent-emerald-500 cursor-pointer h-2 rounded-lg bg-muted"
              />

              {/* Native Quick Thumb Chips */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  { label: "15% Relaxed", val: 15 },
                  { label: "30% Optimal", val: 30 },
                  { label: "50% F.I.R.E", val: 50 },
                ].map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => setSavingsRate(chip.val)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                      savingsRate === chip.val
                        ? "bg-emerald-600 text-white shadow-xs scale-105"
                        : "border border-border/80 bg-card/60 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Control 3: Time Horizon & CAGR Benchmarks */}
            <div className="pt-3 border-t border-border/60 grid gap-3 sm:grid-cols-2">
              {/* Horizon Segmented */}
              <div>
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Horizon
                </span>
                <div className="mt-1.5 flex rounded-xl border border-border/80 bg-muted/60 p-1">
                  {[3, 5, 10, 15].map((y) => (
                    <button
                      key={y}
                      type="button"
                      onClick={() => setYears(y)}
                      className={`flex-1 rounded-lg py-1 text-xs font-bold transition-all cursor-pointer ${
                        years === y
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {y}Y
                    </button>
                  ))}
                </div>
              </div>

              {/* Expected CAGR */}
              <div>
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  Benchmark Return
                </span>
                <div className="mt-1.5 flex rounded-xl border border-border/80 bg-muted/60 p-1">
                  {[
                    { label: "9% FD", val: 9 },
                    { label: "12% Nifty", val: 12 },
                    { label: "15% Alpha", val: 15 },
                  ].map((item) => (
                    <button
                      key={item.val}
                      type="button"
                      onClick={() => setCagr(item.val)}
                      className={`flex-1 rounded-lg py-1 text-xs font-bold transition-all cursor-pointer ${
                        cagr === item.val
                          ? "bg-emerald-600 text-white shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/*           PANEL B: HIGH-IMPACT VISUAL CORPUS SHOWCASE (7 COLS)     */}
        {/* ------------------------------------------------------------------ */}
        <div className="lg:col-span-6 flex flex-col justify-between space-y-6">
          {/* Main Hero Projection Card */}
          <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/10 via-card to-emerald-500/5 p-6 sm:p-8 shadow-inner">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-primary flex items-center gap-1.5">
                <TrendingUp className="size-4" /> Projected Total Wealth ({years} Years)
              </span>
              <span className="hidden sm:block rounded-full bg-primary/20 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                {cagr}% CAGR
              </span>
            </div>

            {/* Giant Highlight Number */}
            <div className="mt-4">
              <p className="text-4xl sm:text-5xl font-black tracking-tight text-foreground">
                {formatCompactInr(futureValue)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground font-mono">
                ₹{futureValue.toLocaleString("en-IN")} total compound corpus
              </p>
            </div>

            {/* Highlight Growth Badge */}
            <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 border border-emerald-500/25 px-3 py-1.5 text-xs font-extrabold text-emerald-600 dark:text-emerald-400">
              <Zap className="size-3.5 fill-emerald-500" />
              <span>+{formatCompactInr(compoundInterest)} ({gainRatio}%) in Pure Compound Growth</span>
            </div>

            {/* Dual-Segment Visual Allocation Bar */}
            <div className="mt-6">
              <div className="flex justify-between text-[11px] font-bold text-muted-foreground mb-1.5">
                <span className="text-foreground">Capital Composition</span>
                <span>{multiplier}x Wealth Multiplier</span>
              </div>
              <div className="relative h-3.5 w-full overflow-hidden rounded-full bg-muted border border-border/80 flex">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${principalRatio}%` }}
                />
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300 shadow-sm"
                  style={{ width: `${gainRatio}%` }}
                />
              </div>

              {/* Legend */}
              <div className="mt-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 font-semibold text-muted-foreground">
                  <span className="size-2.5 rounded-full bg-primary" />
                  <span>Invested: <strong className="text-foreground">{formatCompactInr(totalInvested)}</strong></span>
                </div>
                <div className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="size-2.5 rounded-full bg-emerald-500" />
                  <span>Interest: <strong className="text-emerald-600 dark:text-emerald-400">+{formatCompactInr(compoundInterest)}</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* 3 Native Mobile App KPI Tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-border/80 bg-muted/30 p-3.5">
              <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                <Wallet className="size-3 text-primary" /> Monthly Surplus
              </span>
              <p className="mt-1 text-base font-black text-foreground">
                ₹{monthlySavings.toLocaleString("en-IN")}
              </p>
              <p className="text-[10px] text-muted-foreground">Retained cashflow</p>
            </div>

            <div className="rounded-2xl border border-border/80 bg-muted/30 p-3.5">
              <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                <ShieldCheck className="size-3 text-emerald-500" /> 1-Year Reserve
              </span>
              <p className="mt-1 text-base font-black text-emerald-600 dark:text-emerald-400">
                {formatCompactInr(yearlySavings)}
              </p>
              <p className="text-[10px] text-muted-foreground">Liquid runway</p>
            </div>

            <div className="rounded-2xl border border-border/80 bg-muted/30 p-3.5">
              <span className="text-[11px] font-bold text-muted-foreground flex items-center gap-1">
                <TrendingUp className="size-3 text-teal-500" /> Multiplier
              </span>
              <p className="mt-1 text-base font-black text-teal-600 dark:text-teal-400">
                {multiplier}x
              </p>
              <p className="text-[10px] text-muted-foreground">Capital efficiency</p>
            </div>
          </div>

          {/* Native Action Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
              <Lock className="size-3.5 text-primary" /> 100% Private · Zero tracking telemetry
            </p>
            {onStartFree && (
              <button
                type="button"
                onClick={onStartFree}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground shadow-md transition-all hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                <span>Lock In Your Wealth Plan</span>
                <ArrowRight className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                               MAIN COMPONENT                               */
/* -------------------------------------------------------------------------- */

function Landing() {
  const { user, isLoading } = useAuth();
  const [mode, setMode] = useState<AuthMode>("register");
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const authRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);

  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  if (!isLoading && user) return <Navigate to="/dashboard" replace />;

  const scrollToAuth = (m: AuthMode) => {
    setMode(m);
    authRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToSimulator = () => {
    simRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToFeatures = () => {
    featuresRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const toggleTheme = () => {
    if (theme === "dark") setTheme("light");
    else if (theme === "light") setTheme("dark");
    else setTheme("dark");
  };

  return (
    <div className="relative min-h-dvh bg-background text-foreground antialiased selection:bg-primary/20 selection:text-primary">
      {/* -------------------------------------------------------------------- */}
      {/*                            STICKY HEADER                             */}
      {/* -------------------------------------------------------------------- */}
      <header className="pt-safe sticky top-0 z-50 border-b border-border/80 bg-background/85 backdrop-blur-xl text-foreground transition-colors duration-300 shadow-xs">
        <div className="mx-auto flex h-14 sm:h-16 max-w-7xl items-center justify-between px-3 sm:px-6 lg:px-8 gap-1.5 sm:gap-3">
          {/* Left: ONLY Logo (guaranteed compact on small phones) */}
          <div className="flex items-center min-w-0 shrink-0">
            <Logo />
          </div>

          {/* Right: Theme Toggle, Log in (responsive), and Get started free */}
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Interactive Theme Toggle Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="rounded-full size-8 sm:size-9 shrink-0 text-foreground/80 hover:text-foreground hover:bg-muted/80 transition-all duration-200 cursor-pointer"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <Sun className="size-4 text-warning transition-transform duration-300 hover:rotate-45" />
              ) : (
                <Moon className="size-4 text-primary transition-transform duration-300 hover:-rotate-12" />
              )}
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => scrollToAuth("login")}
              className="hidden sm:inline-flex h-8 sm:h-9 px-2.5 sm:px-3.5 text-xs sm:text-sm font-semibold rounded-full text-foreground/85 hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
            >
              Log in
            </Button>

            <Button
              size="sm"
              onClick={() => scrollToAuth("login")}
              className="hidden sm:block h-8 sm:h-9 bg-[#22c55e] hover:bg-[#16a34a] px-3 sm:px-4 text-xs sm:text-sm font-bold text-white shadow-md shadow-emerald-500/25 shrink-0 rounded-full transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <span>Get started free</span>
            </Button>

            <Button
              size="sm"
              onClick={() => scrollToAuth("register")}
              className="sm:hidden h-8 sm:h-9 bg-[#22c55e] hover:bg-[#16a34a] px-3 sm:px-4 text-xs sm:text-sm font-bold text-white shadow-md shadow-emerald-500/25 shrink-0 rounded-full transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <span>Get started</span>
            </Button>
          </div>
        </div>
      </header>

      {/* -------------------------------------------------------------------- */}
      {/*                             HERO SECTION                             */}
      {/* -------------------------------------------------------------------- */}
      <AnimatedHero
        onStartFree={() => scrollToAuth("register")}
        onExploreDemo={scrollToSimulator}
      />

      {/* -------------------------------------------------------------------- */}
      {/*            1. INTERACTIVE LIVE PRODUCT SANDBOX SHOWCASE              */}
      {/* -------------------------------------------------------------------- */}
      <section
        ref={simRef}
        id="live-demo"
        className="scroll-mt-20 relative overflow-hidden bg-gradient-to-b from-card/30 via-background to-card/20 py-16 sm:py-24"
      >
        <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 size-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mx-auto max-w-4xl text-center"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1 text-xs font-bold text-primary">
              <Receipt className="size-3.5 text-primary" /> Tactile Payment
              Slips
            </span>
            <h2 className="mt-3 text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground leading-snug">
              Every Rupee in <br className="sm:hidden" />
              <span className="text-gradient-primary">
                Tactile Payment Slips
              </span>
              .
            </h2>
            <p className="mt-3 text-muted-foreground text-sm sm:text-base md:text-lg max-w-3xl mx-auto leading-relaxed">
              No bloated spreadsheets or overwhelming tables. Test payment tags,
              proactive budget cautions, and trip settlements in realistic,
              tactile voucher slips.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 }}
            className="mt-10"
          >
            <PaymentSlipSimulator />
          </motion.div>
        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/*            2. INTERACTIVE FEATURE BENTO SUITE (MODERN SAAS)          */}
      {/* -------------------------------------------------------------------- */}
      <section
        ref={featuresRef}
        id="features"
        className="relative overflow-hidden border-t border-border/70 bg-card/40 py-16 sm:py-24"
      >
        <div className="pointer-events-none absolute -top-24 right-1/4 -z-10 size-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mx-auto max-w-3xl text-center mb-12"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1 text-xs font-bold text-primary">
              <Layers className="size-3.5" /> Interactive Feature Suite
            </span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              Engineered for the nuances of Indian personal finance.
            </h2>
            <p className="mt-3 text-muted-foreground sm:text-lg">
              Tap payment tags, test alert thresholds, and switch tracking
              periods in real time.
            </p>
          </motion.div>

          <FeatureBento />
        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/*          3. INTERACTIVE COMPOUND WEALTH & SAVINGS SIMULATOR          */}
      {/* -------------------------------------------------------------------- */}
      <section
        id="calculator-section"
        className="relative overflow-hidden border-t border-border/70 bg-background py-16 sm:py-24"
      >
        <div className="pointer-events-none absolute -bottom-20 -left-20 size-80 rounded-full bg-primary/10 blur-3xl" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 20 }}
            whileInView={{ opacity: 1, scale: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
          >
            <WealthCalculator onStartFree={() => scrollToAuth("register")} />
          </motion.div>
        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/*       4. BUILT FOR INDIA & COMPARISON ARCHITECTURE                   */}
      {/* -------------------------------------------------------------------- */}
      <section
        id="indian-finance"
        className="relative overflow-hidden border-t border-border/70 bg-card/30 py-16 sm:py-24"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mx-auto max-w-3xl text-center"
          >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1 text-xs font-bold text-primary">
              <ShieldCheck className="size-3.5 text-primary" /> Privacy & Local
              Standards
            </span>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              Why Finance Tracker is different.
            </h2>
            <p className="mt-3 text-muted-foreground sm:text-lg">
              Commercial budgeting apps scrape your private SMS inbox, push
              unwanted personal loans, and sell your data. Finance Tracker is
              clean, private, and 100% free.
            </p>
          </motion.div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {/* Bad Option 1 */}
            <div className="rounded-3xl border border-destructive/25 bg-destructive/5 p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <span className="rounded-full bg-destructive/15 px-3 py-1 text-xs font-bold text-destructive">
                  ❌ Commercial Fintech Apps
                </span>
                <h3 className="mt-4 text-lg font-bold text-foreground">
                  SMS Scrapers & Loan Pushes
                </h3>
                <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Requires invasive read access to your entire SMS inbox.
                  Constantly pushes high-interest personal loans and credit
                  cards. Slow and ad-ridden.
                </p>
              </div>
              <p className="mt-6 text-xs font-semibold text-destructive">
                Violates your bank-grade privacy
              </p>
            </div>

            {/* Bad Option 2 */}
            <div className="rounded-3xl border border-warning/25 bg-warning/5 p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <span className="rounded-full bg-warning/15 px-3 py-1 text-xs font-bold text-warning">
                  ❌ Manual Excel Spreadsheets
                </span>
                <h3 className="mt-4 text-lg font-bold text-foreground">
                  Cumbersome & Clunky on Mobile
                </h3>
                <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Extremely painful to update on an iPhone or Android screen.
                  Zero proactive budget warning alerts, manual formula breakage,
                  and no automatic recurring rules.
                </p>
              </div>
              <p className="mt-6 text-xs font-semibold text-warning">
                High friction causes tracking abandonment
              </p>
            </div>

            {/* The Solution */}
            <div className="rounded-3xl border-2 border-[#22c55e]/50 bg-emerald-500/5 p-6 sm:p-8 flex flex-col justify-between shadow-xl shadow-emerald-500/10">
              <div>
                <span className="rounded-full bg-[#22c55e] text-white px-3 py-1 text-xs font-extrabold shadow-sm">
                  ✓ Finance Tracker
                </span>
                <h3 className="mt-4 text-lg font-bold text-foreground">
                  Tactile, Native & 100% Private
                </h3>
                <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  Installable PWA on iOS/Android, native Indian ₹ Lakhs
                  formatting, 80%/100% budget alerts, event bill splitting, and
                  zero SMS scraping.
                </p>
              </div>
              <div className="mt-6 flex items-center justify-between text-xs font-bold text-[#16a34a] dark:text-[#4ade80]">
                <span>100% Free · No Paywalls</span>
                <CheckCircle2 className="size-4" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/*            5. FOCUSED SIGN-UP & LOGIN GATEWAY                        */}
      {/* -------------------------------------------------------------------- */}
      <section
        ref={authRef}
        id="auth-section"
        className="relative scroll-mt-20 border-t border-border/70 bg-gradient-to-b from-card/30 via-background to-card/10 py-3 sm:py-10"
      >
        <div className="mx-auto max-w-3xl px-4">
          <AuthCard mode={mode} onModeChange={setMode} />
        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/*            6. PROCESS TIMELINE & INTERACTIVE FAQ ACCORDION           */}
      {/* -------------------------------------------------------------------- */}
      <section
        id="faq-section"
        className="border-t border-border/70 bg-gradient-to-b from-card/30 via-background to-card/20 py-14 sm:py-20 lg:py-24"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 sm:gap-12 lg:gap-10 xl:gap-16 items-start">
            {/* ---------------------------------------------------------------- */}
            {/*                 LEFT COLUMN: THE PROCESS / HOW IT WORKS          */}
            {/* ---------------------------------------------------------------- */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="lg:col-span-5"
            >
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-primary">
                The Process
              </span>
              <h2 className="mt-3 text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-foreground">
                How it Works
              </h2>
              <p className="mt-2 text-xs sm:text-sm md:text-base text-muted-foreground leading-relaxed max-w-md">
                Start tracking in three simple, frictionless steps. No
                netbanking passwords, zero bank SMS reading.
              </p>

              {/* Vertical Step Timeline */}
              <div className="relative mt-8 sm:mt-10 space-y-6 sm:space-y-8">
                {/* Continuous Connecting Line */}
                <div className="pointer-events-none absolute left-4 sm:left-5 top-4 bottom-5 w-0.5 bg-gradient-to-b from-primary/40 via-primary/20 to-border/50" />

                {HOW_IT_WORKS_STEPS.map((item, idx) => (
                  <div
                    key={idx}
                    className="relative flex items-start gap-4 sm:gap-5"
                  >
                    {/* Step number badge */}
                    <div className="relative z-10 flex size-8 sm:size-10 shrink-0 items-center justify-center rounded-xl border border-border/90 bg-card font-black text-xs sm:text-sm text-foreground shadow-sm shadow-black/5 dark:border-border/60">
                      {item.step}
                    </div>

                    {/* Step text content */}
                    <div className="pt-0.5 sm:pt-1">
                      <h3 className="text-sm sm:text-base lg:text-lg font-bold text-foreground">
                        {item.title}
                      </h3>
                      <p className="mt-1 sm:mt-1.5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* ---------------------------------------------------------------- */}
            {/*               RIGHT COLUMN: FREQUENTLY ASKED QUESTIONS           */}
            {/* ---------------------------------------------------------------- */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="lg:col-span-7"
            >
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3.5 py-1 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-primary">
                General FAQs
              </span>
              <h2 className="mt-3 text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-foreground">
                Frequently Asked Questions
              </h2>
              <p className="mt-2 text-xs sm:text-sm md:text-base text-muted-foreground leading-relaxed">
                Quick answers to common questions about privacy, features, and
                security.
              </p>

              {/* Accordion List */}
              <div className="mt-8 sm:mt-10 space-y-3 sm:space-y-3.5">
                {FAQS.map((faq, idx) => {
                  const isOpen = openFaqIndex === idx;
                  return (
                    <div
                      key={idx}
                      className={`rounded-2xl border transition-all duration-200 ${
                        isOpen
                          ? "border-[#22c55e]/40 bg-card shadow-md shadow-[#22c55e]/5 dark:border-[#22c55e]/30"
                          : "border-border/80 bg-card/90 hover:border-border hover:bg-card shadow-xs dark:border-border/60"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                        className="flex w-full items-center justify-between gap-3 p-4 sm:p-5 text-left cursor-pointer transition-colors"
                        aria-expanded={isOpen}
                      >
                        <span
                          className={`text-xs sm:text-sm md:text-base font-bold transition-colors ${
                            isOpen
                              ? "text-[#16a34a] dark:text-[#4ade80]"
                              : "text-foreground hover:text-foreground/80"
                          }`}
                        >
                          {faq.q}
                        </span>
                        <div
                          className={`flex size-6 sm:size-7 shrink-0 items-center justify-center rounded-full transition-colors ${
                            isOpen
                              ? "text-[#16a34a] bg-[#16a34a]/10 dark:text-[#4ade80] dark:bg-[#4ade80]/15"
                              : "text-muted-foreground bg-muted/60"
                          }`}
                        >
                          <ChevronDown
                            className={`size-3.5 sm:size-4 transition-transform duration-200 ${
                              isOpen ? "rotate-180" : ""
                            }`}
                          />
                        </div>
                      </button>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2, ease: "easeInOut" }}
                            className="overflow-hidden"
                          >
                            <p className="px-4 pb-4 sm:px-5 sm:pb-5 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                              {faq.a}
                            </p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/*            7. HIGH-IMPACT BOTTOM CTA BANNER                          */}
      {/* -------------------------------------------------------------------- */}
      <section className="relative overflow-hidden border-t border-border/70 py-16 sm:py-28 bg-gradient-to-b from-card/30 via-background to-card/20">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50%_50%_at_50%_50%,color-mix(in_oklab,var(--primary)_15%,transparent),transparent)]" />

        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1 text-xs font-bold text-primary">
            <Zap className="size-3.5 fill-primary text-primary" /> Start Today
            in Under 60 Seconds
          </span>
          <h2 className="mt-4 text-3xl font-black tracking-tight text-foreground sm:text-5xl">
            Stop wondering where your money went.
            <br />
            <span className="text-[#22c55e]">
              Start deciding where it goes.
            </span>
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground sm:text-lg">
            From handwritten khata notes to smart bank and wallet balances.
            Create your account now with instant OTP verification. 100% free
            forever.
          </p>

          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <button
              type="button"
              onClick={() => scrollToAuth("register")}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#22c55e] hover:bg-[#16a34a] px-8 py-3.5 sm:py-4 text-sm sm:text-base font-bold text-white shadow-xl shadow-emerald-500/25 transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <span>Create free account</span>
              <ArrowRight className="size-4 stroke-[2.5]" />
            </button>
            <button
              type="button"
              onClick={() => scrollToAuth("login")}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-border/80 bg-card hover:bg-muted/80 px-7 py-3.5 sm:py-4 text-sm sm:text-base font-semibold text-foreground shadow-md transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <span>Log in to existing account</span>
            </button>
          </div>
        </motion.div>
      </section>

      {/* -------------------------------------------------------------------- */}
      {/*                               FOOTER                                 */}
      {/* -------------------------------------------------------------------- */}
      <footer className="pb-safe border-t border-border/70 bg-card/60">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex flex-col items-center sm:items-start gap-1">
              <Logo />
              <p className="text-xs text-muted-foreground">
                Personal finance tracker built for everyday Indian finances.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
              <button
                type="button"
                onClick={scrollToFeatures}
                className="hover:text-foreground"
              >
                Features
              </button>
              <button
                type="button"
                onClick={scrollToSimulator}
                className="hover:text-foreground"
              >
                Live Demo
              </button>
              <button
                type="button"
                onClick={() => scrollToAuth("register")}
                className="hover:text-foreground"
              >
                Sign Up
              </button>
              <span className="text-border">|</span>
              <span className="inline-flex items-center gap-1.5 text-income font-medium">
                <span className="size-2 rounded-full bg-income animate-pulse" />
                All Systems Operational
              </span>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row">
            <p>
              © {new Date().getFullYear()} Finance Tracker · Built with INR ₹
              Standards. Your data stays yours.
            </p>
            <div className="flex items-center gap-2">
              <span>Theme:</span>
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={`rounded px-1.5 py-0.5 ${
                  theme === "light"
                    ? "bg-primary text-primary-foreground font-bold"
                    : "hover:text-foreground"
                }`}
              >
                Light
              </button>
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={`rounded px-1.5 py-0.5 ${
                  theme === "dark"
                    ? "bg-primary text-primary-foreground font-bold"
                    : "hover:text-foreground"
                }`}
              >
                Dark
              </button>
              <button
                type="button"
                onClick={() => setTheme("system")}
                className={`rounded px-1.5 py-0.5 ${
                  theme === "system"
                    ? "bg-primary text-primary-foreground font-bold"
                    : "hover:text-foreground"
                }`}
              >
                System
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
