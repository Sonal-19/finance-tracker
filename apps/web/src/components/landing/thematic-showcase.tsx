import {
  BookOpen,
  CheckCircle2,
  Coins,
  CreditCard,
  IndianRupee,
  Landmark,
  Lock,
  PenTool,
  PiggyBank,
  RefreshCw,
  ShieldCheck,
  SmartphoneNfc,
  Sparkles,
  Wallet,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatAmount, toAmount } from "@/lib/format";

type ThematicTab = "notebook" | "wallet" | "bank" | "piggy";

interface LedgerEntry {
  id: string;
  title: string;
  category: string;
  amount: number;
  type: "credit" | "debit";
  time: string;
}

const INITIAL_LEDGER: LedgerEntry[] = [
  {
    id: "1",
    title: "Client UI Design Contract",
    category: "Freelance",
    amount: 35000,
    type: "credit",
    time: "Today, 10:30 AM",
  },
  {
    id: "2",
    title: "Blue Tokai Coffee & Croissant",
    category: "Café",
    amount: 420,
    type: "debit",
    time: "Today, 12:15 PM",
  },
  {
    id: "3",
    title: "Shell Petrol Bunk (Fuel)",
    category: "Transport",
    amount: 1500,
    type: "debit",
    time: "Today, 2:40 PM",
  },
  {
    id: "4",
    title: "Nature's Basket Organic",
    category: "Grocery",
    amount: 2850,
    type: "debit",
    time: "Yesterday, 6:00 PM",
  },
];

export function ThematicShowcase() {
  const [activeTab, setActiveTab] = useState<ThematicTab>("notebook");

  // State for Notebook simulator
  const [ledgerEntries, setLedgerEntries] =
    useState<LedgerEntry[]>(INITIAL_LEDGER);
  const [isWriting, setIsWriting] = useState(false);
  const [lastWrittenItem, setLastWrittenItem] = useState<string | null>(null);

  // State for Wallet simulator
  const [cashBalance, setCashBalance] = useState(4200);
  const [bankBalance, setBankBalance] = useState(88200);
  const [atmTransferSuccess, setAtmTransferSuccess] = useState(false);

  // State for Piggy Bank simulator
  const [piggySavings, setPiggySavings] = useState(130000);
  const [coinAnimating, setCoinAnimating] = useState(false);
  const targetGoal = 175000;
  const piggyPct = Math.min(100, Math.round((piggySavings / targetGoal) * 100));

  // State for Bank Vault simulator
  const [isScanning, setIsScanning] = useState(false);
  const [vaultStatus, setVaultStatus] = useState<"secure" | "scanning">(
    "secure",
  );

  // Add ledger entry handler
  const handleAddEntry = (
    title: string,
    category: string,
    amount: number,
    type: "credit" | "debit",
  ) => {
    setIsWriting(true);
    setLastWrittenItem(title);
    setTimeout(() => {
      setLedgerEntries((prev) => [
        {
          id: Date.now().toString(),
          title,
          category,
          amount,
          type,
          time: "Just now",
        },
        ...prev.slice(0, 4),
      ]);
      setIsWriting(false);
    }, 700);
  };

  // ATM cash withdrawal simulation
  const handleAtmWithdrawal = (amt: number) => {
    if (bankBalance >= amt) {
      setBankBalance((b) => b - amt);
      setCashBalance((c) => c + amt);
      setAtmTransferSuccess(true);
      setTimeout(() => setAtmTransferSuccess(false), 2000);
    }
  };

  // Piggy bank coin drop simulation
  const handleDropCoin = (amt: number) => {
    setCoinAnimating(true);
    setTimeout(() => {
      setPiggySavings((prev) => Math.min(targetGoal, prev + amt));
      setCoinAnimating(false);
    }, 600);
  };

  // Bank security scan simulation
  const handleRunSecurityAudit = () => {
    setIsScanning(true);
    setVaultStatus("scanning");
    setTimeout(() => {
      setIsScanning(false);
      setVaultStatus("secure");
    }, 1200);
  };

  // Ledger totals
  const totalCredits = ledgerEntries
    .filter((e) => e.type === "credit")
    .reduce((sum, e) => sum + e.amount, 0);
  const totalDebits = ledgerEntries
    .filter((e) => e.type === "debit")
    .reduce((sum, e) => sum + e.amount, 0);
  const ledgerNet = totalCredits - totalDebits;

  return (
    <section className="relative overflow-hidden py-16 sm:py-28 border-t border-border/70 bg-gradient-to-b from-card/50 via-background to-card/30">
      {/* Ambient background decoration */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-96 w-full -translate-x-1/2 bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--primary)_18%,transparent)_0%,transparent_70%)] blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 -z-10 size-96 rounded-full bg-income/10 blur-3xl" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="mx-auto max-w-3xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 text-xs font-bold text-primary shadow-sm"
          >
            <Sparkles
              className="size-3.5 animate-spin"
              style={{ animationDuration: "8s" }}
            />
            <span>The 4 Pillars of Effortless Wealth</span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mt-4 text-3xl font-black tracking-tight text-foreground sm:text-5xl"
          >
            From your{" "}
            <span className="text-gradient-primary">Notebook & Pen</span> to
            your <span className="text-gradient-warm">Wallet & Bank</span>.
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="mt-4 text-base text-muted-foreground sm:text-lg leading-relaxed"
          >
            Remember writing expenses in a pocket notebook or diary? We took the
            intimacy of the classic handwritten ledger and combined it with
            smart cash wallet management, zero-scraping bank vaults, and
            automatic goal compounding.
          </motion.p>
        </div>

        {/* 4 Interactive Thematic Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.25 }}
          className="mt-10 flex justify-center"
        >
          <div className="no-scrollbar inline-flex max-w-full overflow-x-auto rounded-2xl border border-border/80 bg-card/80 p-1.5 shadow-xl backdrop-blur-xl">
            {[
              {
                id: "notebook",
                label: "Notebook & Pen",
                sub: "The Digital Khata",
                icon: PenTool,
                badge: "Intuitive",
                accent: "text-primary",
              },
              {
                id: "wallet",
                label: "Smart Wallet",
                sub: "Cash & UPI In Hand",
                icon: Wallet,
                badge: "Cash Native",
                accent: "text-amber-500 dark:text-amber-400",
              },
              {
                id: "bank",
                label: "Bank Vault",
                sub: "Zero Scraping Privacy",
                icon: Landmark,
                badge: "100% Private",
                accent: "text-emerald-500",
              },
              {
                id: "piggy",
                label: "Growth Piggy Bank",
                sub: "Visual Milestones",
                icon: PiggyBank,
                badge: "11% CAGR",
                accent: "text-cyan-500",
              },
            ].map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as ThematicTab)}
                  className={`group relative flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all duration-300 sm:px-5 ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[1.02]"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  }`}
                >
                  <div
                    className={`grid size-9 place-items-center rounded-lg transition-colors ${
                      isActive
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-muted text-muted-foreground group-hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-4.5" />
                  </div>
                  <div className="hidden sm:block">
                    <p
                      className={`text-xs font-bold ${isActive ? "text-primary-foreground" : "text-foreground"}`}
                    >
                      {tab.label}
                    </p>
                    <p
                      className={`text-[11px] ${isActive ? "text-primary-foreground/80" : "text-muted-foreground"}`}
                    >
                      {tab.sub}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* Tab Showcase Cards */}
        <div className="mt-8">
          <AnimatePresence mode="wait">
            {/* -------------------------------------------------------------- */}
            {/*                   TAB 1: NOTEBOOK & PEN                        */}
            {/* -------------------------------------------------------------- */}
            {activeTab === "notebook" && (
              <motion.div
                key="thematic-notebook"
                initial={{ opacity: 0, scale: 0.98, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: -12 }}
                transition={{ duration: 0.35 }}
                className="grid gap-8 rounded-3xl border border-border/80 bg-card/90 p-6 shadow-2xl backdrop-blur-xl lg:grid-cols-[1.1fr_1fr] lg:p-8"
              >
                {/* Left Side: 3D Art & The Metaphor */}
                <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card/70 to-accent/20 p-6">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
                        <PenTool className="size-3.5 animate-pen-write" />{" "}
                        Traditional Habit · Modern Speed
                      </span>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        Khata Bahi 2.0
                      </span>
                    </div>

                    <h3 className="mt-4 text-2xl font-black text-foreground sm:text-3xl">
                      The Digital Notebook & Pen.
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      Generations of shopkeepers and prudent families kept a
                      diary with a blue or gold fountain pen. Finance Tracker
                      honors that clarity: zero bloated ads, zero friction, and
                      an instant log of every rupee spent.
                    </p>
                  </div>

                  {/* 3D Image Showcase with Animated Floating Overlay */}
                  <div className="relative mt-6 overflow-hidden rounded-2xl border border-border/80 shadow-lg">
                    <img
                      src="/images/hero-notebook-pen.jpg"
                      alt="3D Notebook and Pen Financial Ledger"
                      className="h-64 sm:h-80 w-full object-cover transition-transform duration-700 hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />

                    {/* Floating Live Ink Badge */}
                    <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-xl border border-border/80 bg-card/85 p-3 backdrop-blur-md">
                      <div className="flex items-center gap-2.5">
                        <span className="grid size-8 place-items-center rounded-lg bg-primary/20 text-primary">
                          <IndianRupee className="size-4 animate-coin-spin" />
                        </span>
                        <div>
                          <p className="text-[11px] font-semibold text-muted-foreground">
                            Live Calculated Balance
                          </p>
                          <p className="text-sm font-black text-foreground">
                            {formatAmount(toAmount(ledgerNet))}
                          </p>
                        </div>
                      </div>
                      <span className="inline-flex items-center gap-1 rounded-full bg-income/15 px-2.5 py-0.5 text-xs font-bold text-income">
                        <CheckCircle2 className="size-3.5" /> Auto-balanced
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Side: Interactive Live Ledger Paper */}
                <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
                  <div>
                    <div className="flex items-center justify-between border-b border-border/70 pb-3">
                      <div className="flex items-center gap-2">
                        <BookOpen className="size-4 text-primary" />
                        <h4 className="font-bold text-foreground text-sm uppercase tracking-wider">
                          Interactive Khata Page
                        </h4>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        Click a quick pen to write
                      </span>
                    </div>

                    {/* Quick 1-tap buttons to write entries */}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleAddEntry(
                            "Freelance Bonus",
                            "Freelance",
                            12500,
                            "credit",
                          )
                        }
                        disabled={isWriting}
                        className="h-8 border-income/30 bg-income/5 text-xs font-semibold text-income hover:bg-income/10 hover:text-income"
                      >
                        <PenTool className="mr-1 size-3" /> +₹12,500 Freelance
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleAddEntry(
                            "Swiggy Biryani Order",
                            "Dining",
                            620,
                            "debit",
                          )
                        }
                        disabled={isWriting}
                        className="h-8 border-expense/30 bg-expense/5 text-xs font-semibold text-expense hover:bg-expense/10 hover:text-expense"
                      >
                        <PenTool className="mr-1 size-3" /> −₹620 Swiggy
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleAddEntry(
                            "Airtel Broadband Wi-Fi",
                            "Bills",
                            1099,
                            "debit",
                          )
                        }
                        disabled={isWriting}
                        className="h-8 border-expense/30 bg-expense/5 text-xs font-semibold text-expense hover:bg-expense/10 hover:text-expense"
                      >
                        <PenTool className="mr-1 size-3" /> −₹1,099 Wi-Fi
                      </Button>
                    </div>

                    {/* Pen writing status feedback */}
                    <AnimatePresence>
                      {isWriting && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-3 flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-primary"
                        >
                          <PenTool className="size-3.5 animate-pen-write text-primary" />
                          <span>
                            Penning &quot;{lastWrittenItem}&quot; into your
                            ledger...
                          </span>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Lined Notebook Page Entries */}
                    <div className="mt-4 rounded-xl border border-primary/20 bg-muted/30 p-3.5 bg-notebook-lines">
                      <div className="space-y-2">
                        {ledgerEntries.map((entry) => (
                          <motion.div
                            key={entry.id}
                            layout
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center justify-between rounded-lg border border-border/40 bg-card/90 p-2.5 shadow-xs backdrop-blur-xs transition-colors hover:bg-card"
                          >
                            <div className="flex items-center gap-2.5">
                              <span
                                className={`grid size-7 place-items-center rounded-md text-xs font-bold ${
                                  entry.type === "credit"
                                    ? "bg-income/15 text-income"
                                    : "bg-expense/15 text-expense"
                                }`}
                              >
                                {entry.type === "credit" ? "+" : "−"}
                              </span>
                              <div>
                                <p className="text-xs font-bold text-foreground">
                                  {entry.title}
                                </p>
                                <p className="text-[10px] text-muted-foreground">
                                  {entry.category} · {entry.time}
                                </p>
                              </div>
                            </div>
                            <span
                              className={`text-xs font-black ${
                                entry.type === "credit"
                                  ? "text-income"
                                  : "text-expense"
                              }`}
                            >
                              {entry.type === "credit" ? "+" : "−"}₹
                              {formatAmount(toAmount(entry.amount))}
                            </span>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Bottom summary bar */}
                  <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-3 text-xs">
                    <span className="text-muted-foreground">
                      Total debits:{" "}
                      <b className="text-expense">
                        {formatAmount(toAmount(totalDebits))}
                      </b>
                    </span>
                    <span className="text-muted-foreground">
                      Total credits:{" "}
                      <b className="text-income">
                        {formatAmount(toAmount(totalCredits))}
                      </b>
                    </span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* -------------------------------------------------------------- */}
            {/*                   TAB 2: SMART WALLET                          */}
            {/* -------------------------------------------------------------- */}
            {activeTab === "wallet" && (
              <motion.div
                key="thematic-wallet"
                initial={{ opacity: 0, scale: 0.98, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: -12 }}
                transition={{ duration: 0.35 }}
                className="grid gap-8 rounded-3xl border border-border/80 bg-card/90 p-6 shadow-2xl backdrop-blur-xl lg:grid-cols-[1.1fr_1fr] lg:p-8"
              >
                {/* Left Side: 3D Art & Metaphor */}
                <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card/70 to-accent/20 p-6">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-500 dark:text-amber-400">
                        <Wallet className="size-3.5" /> Cash in Pocket + UPI
                        Cards
                      </span>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        Zero Double Counting
                      </span>
                    </div>

                    <h3 className="mt-4 text-2xl font-black text-foreground sm:text-3xl">
                      The Leather Wallet in Your Pocket.
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      In India, cash is still king for sabzi mandis,
                      auto-rickshaws, and neighborhood tea stalls. When you
                      withdraw ₹5,000 from an ATM, other apps count it as an
                      &quot;Expense&quot; immediately. Finance Tracker transfers
                      it into your &quot;Physical Cash Wallet&quot; without
                      messing up your budget.
                    </p>
                  </div>

                  <div className="relative mt-6 overflow-hidden rounded-2xl border border-border/80 shadow-lg">
                    <img
                      src="/images/smart-wallet.jpg"
                      alt="3D Smart Leather Wallet with Indian Currency Notes"
                      className="h-64 sm:h-80 w-full object-cover transition-transform duration-700 hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />

                    <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-xl border border-border/80 bg-card/85 p-3 backdrop-blur-md">
                      <div className="flex items-center gap-2.5">
                        <span className="grid size-8 place-items-center rounded-lg bg-amber-500/20 text-amber-500">
                          <Wallet className="size-4" />
                        </span>
                        <div>
                          <p className="text-[11px] font-semibold text-muted-foreground">
                            Physical Cash in Hand
                          </p>
                          <p className="text-sm font-black text-foreground">
                            {formatAmount(toAmount(cashBalance))}
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-bold text-amber-500">
                        ₹500 & ₹200 Notes
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Side: Interactive Wallet & ATM Transfer Simulator */}
                <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
                  <div>
                    <div className="flex items-center justify-between border-b border-border/70 pb-3">
                      <div className="flex items-center gap-2">
                        <CreditCard className="size-4 text-primary" />
                        <h4 className="font-bold text-foreground text-sm uppercase tracking-wider">
                          Live Wallet Reconciliation
                        </h4>
                      </div>
                      <span className="text-xs text-primary font-semibold">
                        Interactive
                      </span>
                    </div>

                    {/* Dual Accounts balance display */}
                    <div className="mt-5 grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-border/80 bg-muted/40 p-4">
                        <p className="text-[11px] font-medium text-muted-foreground">
                          Bank Account Balance
                        </p>
                        <p className="mt-1 text-xl font-black text-foreground">
                          {formatAmount(toAmount(bankBalance))}
                        </p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          HDFC Bank (Primary)
                        </p>
                      </div>

                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 dark:bg-amber-500/10">
                        <p className="text-[11px] font-medium text-muted-foreground">
                          Cash in Wallet
                        </p>
                        <p className="mt-1 text-xl font-black text-amber-500 dark:text-amber-400">
                          {formatAmount(toAmount(cashBalance))}
                        </p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Pocket Currency
                        </p>
                      </div>
                    </div>

                    {/* Transfer Simulation Action */}
                    <div className="mt-6 rounded-xl border border-border/80 bg-muted/20 p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">
                          Simulate ATM Cash Withdrawal
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Zero double-count
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Tap below to pull cash from bank into your wallet. Watch
                        both balances reconcile in real time!
                      </p>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {[1000, 2000, 5000].map((amt) => (
                          <Button
                            key={amt}
                            size="sm"
                            variant="outline"
                            onClick={() => handleAtmWithdrawal(amt)}
                            className="h-8 border-border/80 hover:border-primary hover:text-primary"
                          >
                            <RefreshCw className="mr-1 size-3" /> Withdraw ₹
                            {formatAmount(toAmount(amt))}
                          </Button>
                        ))}
                      </div>

                      <AnimatePresence>
                        {atmTransferSuccess && (
                          <motion.div
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="mt-3 flex items-center gap-2 rounded-lg bg-income/15 px-3 py-2 text-xs font-semibold text-income"
                          >
                            <CheckCircle2 className="size-4" />
                            <span>
                              Successfully transferred from Bank to Physical
                              Cash Wallet!
                            </span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Tag highlights */}
                    <div className="mt-5 space-y-2">
                      <p className="text-xs font-bold text-foreground">
                        Add your own payment methods:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {[
                          "PhonePe UPI",
                          "Google Pay QR",
                          "CRED Card",
                          "Physical Cash",
                          "Netbanking IMPS",
                        ].map((tag, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"
                          >
                            <SmartphoneNfc className="size-3 text-primary" />{" "}
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 border-t border-border/70 pt-3 text-xs text-muted-foreground">
                    💡 Spend from Cash or Bank independently. Everything
                    balances automatically.
                  </div>
                </div>
              </motion.div>
            )}

            {/* -------------------------------------------------------------- */}
            {/*                   TAB 3: BANK VAULT                            */}
            {/* -------------------------------------------------------------- */}
            {activeTab === "bank" && (
              <motion.div
                key="thematic-bank"
                initial={{ opacity: 0, scale: 0.98, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: -12 }}
                transition={{ duration: 0.35 }}
                className="grid gap-8 rounded-3xl border border-border/80 bg-card/90 p-6 shadow-2xl backdrop-blur-xl lg:grid-cols-[1.1fr_1fr] lg:p-8"
              >
                {/* Left Side: 3D Art & Metaphor */}
                <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card/70 to-accent/20 p-6">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-500">
                        <ShieldCheck className="size-3.5" /> High Security Vault
                      </span>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        Zero SMS Harvester
                      </span>
                    </div>

                    <h3 className="mt-4 text-2xl font-black text-foreground sm:text-3xl">
                      The Fortified Digital Bank Vault.
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      Fintech startups demand full access to read all your
                      private SMS texts and bank OTPs, then spam you with
                      pre-approved loan calls. Finance Tracker was engineered as
                      an impenetrable vault: we never touch your SMS, never
                      store bank netbanking passwords, and never sell your
                      financial footprint.
                    </p>
                  </div>

                  <div className="relative mt-6 overflow-hidden rounded-2xl border border-border/80 shadow-lg">
                    <img
                      src="/images/bank-vault.jpg"
                      alt="3D Digital Bank Vault with Glowing Security Shield"
                      className="h-64 sm:h-80 w-full object-cover transition-transform duration-700 hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />

                    <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-xl border border-border/80 bg-card/85 p-3 backdrop-blur-md">
                      <div className="flex items-center gap-2.5">
                        <span className="grid size-8 place-items-center rounded-lg bg-emerald-500/20 text-emerald-500">
                          <Lock className="size-4" />
                        </span>
                        <div>
                          <p className="text-[11px] font-semibold text-muted-foreground">
                            Vault Protection Level
                          </p>
                          <p className="text-sm font-black text-emerald-500">
                            Bank-Grade Argon2 & OTP
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-500">
                        100% Sealed
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Side: Interactive Security Scanner & Accounts */}
                <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
                  <div>
                    <div className="flex items-center justify-between border-b border-border/70 pb-3">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="size-4 text-emerald-500" />
                        <h4 className="font-bold text-foreground text-sm uppercase tracking-wider">
                          Privacy & Security Audit
                        </h4>
                      </div>
                      <span className="text-xs text-emerald-500 font-semibold">
                        Active Shield
                      </span>
                    </div>

                    <div className="mt-5 space-y-3">
                      {[
                        {
                          title: "SMS Scraping Access",
                          status: "BLOCKED",
                          desc: "Zero read permissions requested or needed.",
                          ok: true,
                        },
                        {
                          title: "Netbanking Credentials",
                          status: "NOT STORED",
                          desc: "You never hand over your banking passwords or debit PINs.",
                          ok: true,
                        },
                        {
                          title: "Ad Network Trackers",
                          status: "0 FOUND",
                          desc: "Google Ads, Meta Pixel & loan syndicates are blocked.",
                          ok: true,
                        },
                        {
                          title: "Data Sovereignty",
                          status: "1-CLICK EXPORT",
                          desc: "Export full ledger to standard CSV anytime for your CA.",
                          ok: true,
                        },
                      ].map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/20 p-3"
                        >
                          <div>
                            <p className="text-xs font-bold text-foreground">
                              {item.title}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {item.desc}
                            </p>
                          </div>
                          <span className="rounded-md bg-income/15 px-2 py-0.5 text-[10px] font-extrabold text-income">
                            {item.status}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-4 dark:bg-primary/10">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-foreground">
                          Interactive Vault Audit
                        </span>
                        <Button
                          size="sm"
                          onClick={handleRunSecurityAudit}
                          disabled={isScanning}
                          className="h-8 bg-primary text-xs font-bold text-primary-foreground"
                        >
                          {isScanning
                            ? "Auditing Vault..."
                            : "Run Security Scan"}
                        </Button>
                      </div>
                      {isScanning && (
                        <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-primary">
                          <RefreshCw className="size-3.5 animate-spin" />
                          <span>
                            Verifying zero SMS leaks and Argon2 cipher
                            integrity...
                          </span>
                        </div>
                      )}
                      {!isScanning && vaultStatus === "secure" && (
                        <p className="mt-2 text-[11px] text-income font-medium">
                          ✓ All systems locked. Your financial records are 100%
                          private to you.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 border-t border-border/70 pt-3 text-xs text-muted-foreground">
                    🔒 Built on strict database row-level scoping: you are the
                    sole owner of your financial data.
                  </div>
                </div>
              </motion.div>
            )}

            {/* -------------------------------------------------------------- */}
            {/*                   TAB 4: PIGGY BANK / GOALS                    */}
            {/* -------------------------------------------------------------- */}
            {activeTab === "piggy" && (
              <motion.div
                key="thematic-piggy"
                initial={{ opacity: 0, scale: 0.98, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98, y: -12 }}
                transition={{ duration: 0.35 }}
                className="grid gap-8 rounded-3xl border border-border/80 bg-card/90 p-6 shadow-2xl backdrop-blur-xl lg:grid-cols-[1.1fr_1fr] lg:p-8"
              >
                {/* Left Side: 3D Art & Metaphor */}
                <div className="relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card/70 to-accent/20 p-6">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-bold text-cyan-500">
                        <PiggyBank className="size-3.5" /> Savings Milestones
                      </span>
                      <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                        Goal Rings
                      </span>
                    </div>

                    <h3 className="mt-4 text-2xl font-black text-foreground sm:text-3xl">
                      The Golden Growth Piggy Bank.
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                      Every goal begins with regular discipline: dropping coins
                      into the piggy bank until it overflows. Whether saving for
                      a Royal Enfield bike, a trip to Leh Ladakh, or a 6-month
                      safety net, watch your milestone rings fill dynamically as
                      your wealth compounds.
                    </p>
                  </div>

                  <div className="relative mt-6 overflow-hidden rounded-2xl border border-border/80 shadow-lg">
                    <img
                      src="/images/piggy-bank.jpg"
                      alt="3D Golden Emerald Piggy Bank with Floating Rupee Coins"
                      className="h-64 sm:h-80 w-full object-cover transition-transform duration-700 hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />

                    <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-xl border border-border/80 bg-card/85 p-3 backdrop-blur-md">
                      <div className="flex items-center gap-2.5">
                        <span className="grid size-8 place-items-center rounded-lg bg-cyan-500/20 text-cyan-500">
                          <Coins className="size-4 animate-coin-spin" />
                        </span>
                        <div>
                          <p className="text-[11px] font-semibold text-muted-foreground">
                            Active Savings Accumulated
                          </p>
                          <p className="text-sm font-black text-foreground">
                            {formatAmount(toAmount(piggySavings))} /{" "}
                            {formatAmount(toAmount(targetGoal))}
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full bg-cyan-500/15 px-2.5 py-0.5 text-xs font-bold text-cyan-500">
                        {piggyPct}% reached
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Side: Interactive Coin Drop Simulator */}
                <div className="flex flex-col justify-between rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
                  <div>
                    <div className="flex items-center justify-between border-b border-border/70 pb-3">
                      <div className="flex items-center gap-2">
                        <Coins className="size-4 text-cyan-500" />
                        <h4 className="font-bold text-foreground text-sm uppercase tracking-wider">
                          Drop A Coin Into The Goal
                        </h4>
                      </div>
                      <span className="text-xs text-cyan-500 font-semibold">
                        Interactive
                      </span>
                    </div>

                    {/* Goal Progress Ring card */}
                    <div className="mt-5 rounded-2xl border border-border/80 bg-muted/30 p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <h5 className="font-extrabold text-foreground text-base">
                            Royal Enfield Hunter 350
                          </h5>
                          <p className="text-xs text-muted-foreground">
                            Target Date: Diwali 2026
                          </p>
                        </div>
                        <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-black text-primary">
                          {piggyPct}%
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-4 h-3.5 w-full overflow-hidden rounded-full bg-muted">
                        <motion.div
                          className="h-full bg-gradient-to-r from-primary via-cyan-400 to-income transition-all duration-500"
                          style={{ width: `${piggyPct}%` }}
                        />
                      </div>

                      <div className="mt-3 flex justify-between text-xs font-semibold">
                        <span className="text-foreground">
                          {formatAmount(toAmount(piggySavings))} Saved
                        </span>
                        <span className="text-muted-foreground">
                          Goal: {formatAmount(toAmount(targetGoal))}
                        </span>
                      </div>
                    </div>

                    {/* Interactive Coin Drop Buttons */}
                    <div className="mt-6 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4 dark:bg-cyan-500/10">
                      <span className="text-xs font-bold text-foreground">
                        Tap to deposit coins:
                      </span>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Simulate depositing bonus income into your target piggy
                        bank.
                      </p>

                      <div className="mt-4 flex flex-wrap gap-2.5">
                        {[1000, 2500, 5000].map((amt) => (
                          <Button
                            key={amt}
                            size="sm"
                            onClick={() => handleDropCoin(amt)}
                            disabled={
                              coinAnimating || piggySavings >= targetGoal
                            }
                            className="h-9 bg-primary px-3 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/95"
                          >
                            <Coins className="mr-1.5 size-3.5 animate-bounce" />{" "}
                            +{formatAmount(toAmount(amt))} Drop Coin
                          </Button>
                        ))}
                      </div>

                      <AnimatePresence>
                        {coinAnimating && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className="mt-3 flex items-center gap-2 text-xs font-bold text-cyan-500"
                          >
                            <Coins className="size-4 animate-spin" />
                            <span>
                              *Clink!* Golden coin dropped into your piggy bank!
                            </span>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Milestone badges */}
                    <div className="mt-5 grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-lg border border-border/80 bg-muted/30 p-2">
                        <p className="font-bold text-foreground">₹45,000</p>
                        <p className="text-[10px] text-muted-foreground">
                          Remaining
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/80 bg-muted/30 p-2">
                        <p className="font-bold text-income">11% CAGR</p>
                        <p className="text-[10px] text-muted-foreground">
                          Compounding
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/80 bg-muted/30 p-2">
                        <p className="font-bold text-primary">₹3,750 / mo</p>
                        <p className="text-[10px] text-muted-foreground">
                          SIP Needed
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 border-t border-border/70 pt-3 text-xs text-muted-foreground">
                    🎯 Create unlimited savings goals with custom target dates
                    and milestone rings.
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
