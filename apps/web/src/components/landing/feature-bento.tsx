import {
  AlertTriangle,
  ArrowUpRight,
  CalendarRange,
  Check,
  CheckCircle2,
  Clock,
  IndianRupee,
  Repeat,
  SmartphoneNfc,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { formatAmount, toAmount } from "@/lib/format";

type RailId = "gpay" | "phonepe" | "paytm" | "cred" | "cash";
type Period = "Day" | "Week" | "Month" | "Year";

interface RailData {
  id: RailId;
  name: string;
  badge: string;
  color: string;
  activeColor: string;
  bgGlow: string;
  merchant: string;
  amount: string;
  category: string;
  timing: string;
  autoTag: string;
}

const RAILS: RailData[] = [
  {
    id: "gpay",
    name: "Google Pay",
    badge: "UPI QR",
    color: "text-blue-500 border-blue-500/30 bg-blue-500/10",
    activeColor:
      "border-blue-500 bg-blue-500 text-white shadow-md shadow-blue-500/25",
    bgGlow: "from-blue-500/10 to-transparent",
    merchant: "Nature Basket Provisions",
    amount: "₹1,450",
    category: "Groceries",
    timing: "Today, 10:45 AM",
    autoTag: "Google Pay UPI · QR Verified",
  },
  {
    id: "phonepe",
    name: "PhonePe",
    badge: "Auto-VPA",
    color: "text-purple-500 border-purple-500/30 bg-purple-500/10",
    activeColor:
      "border-purple-500 bg-purple-500 text-white shadow-md shadow-purple-500/25",
    bgGlow: "from-purple-500/10 to-transparent",
    merchant: "Swiggy Gourmet Feast",
    amount: "₹680",
    category: "Dining Out",
    timing: "Today, 01:15 PM",
    autoTag: "PhonePe UPI · Instant Auto-Tag",
  },
  {
    id: "paytm",
    name: "Paytm",
    badge: "Transit",
    color: "text-sky-500 border-sky-500/30 bg-sky-500/10",
    activeColor:
      "border-sky-500 bg-sky-500 text-white shadow-md shadow-sky-500/25",
    bgGlow: "from-sky-500/10 to-transparent",
    merchant: "Metro Transit Recharge",
    amount: "₹300",
    category: "Commute",
    timing: "Yesterday, 06:30 PM",
    autoTag: "Paytm Wallet · Fastag Linked",
  },
  {
    id: "cred",
    name: "CRED Pay",
    badge: "Rewards",
    color: "text-amber-500 border-amber-500/30 bg-amber-500/10",
    activeColor:
      "border-amber-500 bg-amber-500 text-white shadow-md shadow-amber-500/25",
    bgGlow: "from-amber-500/10 to-transparent",
    merchant: "Blue Tokai Coffee Reserve",
    amount: "₹360",
    category: "Work Cafe",
    timing: "Yesterday, 03:20 PM",
    autoTag: "CRED Pay · Cash-back Tracked",
  },
  {
    id: "cash",
    name: "Physical Cash",
    badge: "ATM Sync",
    color: "text-emerald-500 border-emerald-500/30 bg-emerald-500/10",
    activeColor:
      "border-emerald-500 bg-emerald-500 text-white shadow-md shadow-emerald-500/25",
    bgGlow: "from-emerald-500/10 to-transparent",
    merchant: "Local Kirana & Fruits",
    amount: "₹120",
    category: "Pocket Cash",
    timing: "Today, 08:30 AM",
    autoTag: "Bank ➔ Pocket Balance Offset",
  },
];

const PERIOD_DATA: Record<
  Period,
  { delta: string; desc: string; bars: number[] }
> = {
  Day: {
    delta: "+₹420",
    desc: "Under daily spend target",
    bars: [35, 45, 20, 60, 25, 40, 30],
  },
  Week: {
    delta: "+12.4%",
    desc: "Surplus saved vs last week",
    bars: [50, 65, 40, 75, 45, 80, 55],
  },
  Month: {
    delta: "+18.6%",
    desc: "Retained vs previous month",
    bars: [60, 40, 85, 70, 95, 60, 80],
  },
  Year: {
    delta: "+₹1.65L",
    desc: "Cumulative net capital gain",
    bars: [40, 55, 70, 65, 85, 90, 100],
  },
};

export function FeatureBento() {
  // Mobile active tab index
  const [mobileTab, setMobileTab] = useState<number>(0);

  // Card 1: Selected Rail
  const [selectedRail, setSelectedRail] = useState<RailId>("gpay");
  const activeRailData: RailData =
    RAILS.find((r) => r.id === selectedRail) ?? RAILS[0]!;

  // Card 2: Pacing Radar Spend Simulator
  const [budgetSpend, setBudgetSpend] = useState<number>(6800);
  const budgetLimit = 8000;
  const budgetPct = Math.round((budgetSpend / budgetLimit) * 100);

  // Card 3: Split Trip
  const [isSettled, setIsSettled] = useState<boolean>(false);

  // Card 4: Recurring Autopilot Switch
  const [isAutopilotOn, setIsAutopilotOn] = useState<boolean>(true);

  // Card 5: Period Switcher
  const [activePeriod, setActivePeriod] = useState<Period>("Month");

  // Mobile Tabs definition
  const mobileTabs = [
    { label: "UPI & Cash", icon: SmartphoneNfc },
    { label: "Pacing Radar", icon: AlertTriangle },
    { label: "Trip Split", icon: Users },
    { label: "Autopilot", icon: Repeat },
    { label: "Net Delta", icon: TrendingUp },
  ];

  /* -------------------------------------------------------------------------- */
  /*                          CARD COMPONENT: UPI RAILS                         */
  /* -------------------------------------------------------------------------- */
  const renderUpiCard = () => (
    <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-[28px] border border-border/70 bg-card p-6 sm:p-8 shadow-sm transition-all duration-300 hover:border-primary/40 hover:shadow-xl dark:border-border/50">
      <div
        className={`pointer-events-none absolute -right-20 -top-20 size-72 rounded-full bg-gradient-to-br ${activeRailData.bgGlow} blur-3xl`}
      />

      <div>
        {/* Header Badges */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-xl bg-primary/10 text-primary">
              <SmartphoneNfc className="size-4" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-primary">
              Unified Payment Rails
            </span>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
            <Check className="size-3" /> Zero Double-Count
          </span>
        </div>

        {/* Highlight Headline */}
        <h3 className="mt-4 text-xl sm:text-2xl font-black tracking-tight text-foreground">
          Instant UPI Tags & Real Pocket Cash.
        </h3>

        {/* Quick Highlights Bar */}
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
          <span className="rounded-lg bg-muted/80 px-2.5 py-1 text-muted-foreground">
            ⚡ 0.2s Auto-Detect
          </span>
          <span className="rounded-lg bg-muted/80 px-2.5 py-1 text-muted-foreground">
            🏦 Bank ➔ Wallet Auto-Offset
          </span>
          <span className="rounded-lg bg-muted/80 px-2.5 py-1 text-muted-foreground">
            🔒 Zero SMS Scraping
          </span>
        </div>

        {/* Native Rails Pill Switcher */}
        <div className="mt-6 flex flex-wrap gap-1.5 sm:gap-2">
          {RAILS.map((rail) => {
            const isSelected = selectedRail === rail.id;
            return (
              <button
                key={rail.id}
                type="button"
                onClick={() => setSelectedRail(rail.id)}
                className={`relative flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all cursor-pointer ${
                  isSelected
                    ? rail.activeColor
                    : "border border-border/80 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span>{rail.name}</span>
                <span
                  className={`text-[10px] font-medium opacity-80 ${isSelected ? "text-white" : ""}`}
                >
                  ({rail.badge})
                </span>
              </button>
            );
          })}
        </div>

        {/* Live Tactile Transaction Pill */}
        <div className="mt-5 rounded-2xl border border-border/80 bg-muted/40 p-4 transition-all duration-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-card border border-border/80 shadow-xs">
                <IndianRupee className="size-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-foreground">
                  {activeRailData.merchant}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>{activeRailData.timing}</span>
                  <span>·</span>
                  <span className="font-semibold text-primary">
                    {activeRailData.autoTag}
                  </span>
                </p>
              </div>
            </div>
            <span className="shrink-0 text-base font-black text-rose-600 dark:text-rose-400">
              −{activeRailData.amount}
            </span>
          </div>
        </div>
      </div>

      {/* Tactile Native App Footer */}
      <div className="mt-6 flex items-center justify-between border-t border-border/70 pt-4 text-xs font-bold text-muted-foreground">
        <span className="flex items-center gap-1 text-primary">
          <Zap className="size-3.5 fill-primary" /> Indian QR & UPI Optimized
        </span>
        <span className="text-[11px] text-muted-foreground">
          Tap any rail to preview
        </span>
      </div>
    </div>
  );

  /* -------------------------------------------------------------------------- */
  /*                       CARD COMPONENT: PACING RADAR                         */
  /* -------------------------------------------------------------------------- */
  const renderRadarCard = () => {
    const isCritical = budgetPct >= 100;
    const isWarning = budgetPct >= 80 && budgetPct < 100;

    return (
      <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-[28px] border border-border/70 bg-card p-6 sm:p-8 shadow-sm transition-all duration-300 hover:border-primary/40 hover:shadow-xl dark:border-border/50">
        <div
          className={`pointer-events-none absolute -right-20 -bottom-20 size-64 rounded-full blur-3xl transition-all duration-500 ${
            isCritical
              ? "bg-rose-500/15"
              : isWarning
                ? "bg-amber-500/15"
                : "bg-emerald-500/15"
          }`}
        />

        <div>
          {/* Header */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="size-4" />
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Pacing Radar
              </span>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-mono font-bold text-foreground">
              {budgetPct}% Limit
            </span>
          </div>

          {/* Highlight Headline */}
          <h3 className="mt-4 text-xl sm:text-2xl font-black tracking-tight text-foreground">
            80% & 100% Pre-Emptive Shield.
          </h3>

          {/* Quick Highlights Bar */}
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
            <span className="rounded-lg bg-muted/80 px-2.5 py-1 text-muted-foreground">
              🛡️ No Month-End Shock
            </span>
            <span className="rounded-lg bg-muted/80 px-2.5 py-1 text-muted-foreground">
              🔔 Instant Category Pacing
            </span>
          </div>

          {/* Interactive Native Spend Gauge Box */}
          <div className="mt-5 rounded-2xl border border-border/80 bg-muted/40 p-4">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-foreground">Simulate Spend</span>
              <span
                className={`font-mono text-sm ${
                  isCritical
                    ? "text-rose-600 dark:text-rose-400 font-black"
                    : isWarning
                      ? "text-amber-600 dark:text-amber-400 font-black"
                      : "text-emerald-600 dark:text-emerald-400 font-extrabold"
                }`}
              >
                {formatAmount(toAmount(budgetSpend))} /{" "}
                {formatAmount(toAmount(8000))}
              </span>
            </div>

            {/* Slider */}
            <input
              type="range"
              min={3000}
              max={9500}
              step={250}
              value={budgetSpend}
              onChange={(e) => setBudgetSpend(Number(e.target.value))}
              className="mt-3.5 w-full accent-primary cursor-pointer h-2 rounded-lg bg-muted"
            />

            {/* Segmented Visual Fuel Meter */}
            <div className="mt-3 relative h-3 w-full overflow-hidden rounded-full bg-muted/80 border border-border/60">
              <div
                className={`h-full transition-all duration-200 ${
                  isCritical
                    ? "bg-rose-500 shadow-sm shadow-rose-500/50"
                    : isWarning
                      ? "bg-amber-500 shadow-sm shadow-amber-500/50"
                      : "bg-emerald-500 shadow-sm shadow-emerald-500/50"
                }`}
                style={{ width: `${Math.min(budgetPct, 100)}%` }}
              />
              {/* Markers for 80% and 100% */}
              <div className="absolute top-0 bottom-0 left-[80%] w-0.5 bg-foreground/20" />
            </div>

            {/* Live Status Badge */}
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-medium text-[11px]">
                Threshold Status:
              </span>
              {isCritical ? (
                <span className="inline-flex items-center gap-1 font-black text-rose-600 dark:text-rose-400">
                  <span className="size-2 rounded-full bg-rose-500 animate-pulse" />
                  100%+ Hard Cap Exceeded
                </span>
              ) : isWarning ? (
                <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400">
                  <span className="size-2 rounded-full bg-amber-500" />
                  80% Caution Alert Triggered
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  Healthy Pacing (Safe)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between border-t border-border/70 pt-4 text-xs font-bold text-muted-foreground">
          <span className="text-foreground">Category Autoguard</span>
          <span className="text-[11px] text-muted-foreground">
            Drag slider to test
          </span>
        </div>
      </div>
    );
  };

  /* -------------------------------------------------------------------------- */
  /*                       CARD COMPONENT: TRIP SPLIT                           */
  /* -------------------------------------------------------------------------- */
  const renderTripSplitCard = () => (
    <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-[28px] border border-border/70 bg-card p-6 shadow-sm transition-all duration-300 hover:border-primary/40 hover:shadow-xl dark:border-border/50">
      <div>
        <div className="flex items-center justify-between">
          <span className="grid size-9 place-items-center rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <Users className="size-4" />
          </span>
          <span className="rounded-full bg-purple-500/15 px-2.5 py-0.5 text-[10px] font-bold text-purple-600 dark:text-purple-400">
            Zero IOU Tension
          </span>
        </div>

        <h3 className="mt-4 text-lg font-black tracking-tight text-foreground">
          Event & Trip Bill Splitting
        </h3>

        <div className="mt-2 flex gap-1.5 text-[11px] font-semibold text-muted-foreground">
          <span className="rounded-md bg-muted/80 px-2 py-0.5">
            👥 4 Friends
          </span>
          <span className="rounded-md bg-muted/80 px-2 py-0.5">
            🌴 Goa Vacation
          </span>
        </div>

        {/* Settlement Interactive Box */}
        <div className="mt-4 rounded-2xl border border-border/80 bg-muted/30 p-3.5">
          <div className="flex items-center justify-between text-xs font-extrabold text-foreground">
            <span>Beach Villa Airbnb</span>
            <span className={isSettled ? "text-emerald-500" : "text-primary"}>
              {isSettled ? "✓ ₹0 Settled" : "+₹3,500 Owed"}
            </span>
          </div>

          <div className="mt-2.5 flex items-center justify-between">
            <div className="flex -space-x-1.5 overflow-hidden">
              {["R", "P", "T", "You"].map((initial, i) => (
                <div
                  key={i}
                  className="grid size-6 place-items-center rounded-full border border-card bg-primary/20 text-[10px] font-bold text-primary"
                >
                  {initial}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setIsSettled(!isSettled)}
              className={`rounded-xl px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                isSettled
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 active:scale-95"
              }`}
            >
              {isSettled ? "Settled" : "Tap to Settle"}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 border-t border-border/70 pt-3 text-[11px] font-bold text-primary flex items-center justify-between">
        <span>Automatic Net Debt Math</span>
        <CheckCircle2 className="size-3.5" />
      </div>
    </div>
  );

  /* -------------------------------------------------------------------------- */
  /*                     CARD COMPONENT: RECURRING AUTOPILOT                    */
  /* -------------------------------------------------------------------------- */
  const renderAutopilotCard = () => (
    <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-[28px] border border-border/70 bg-card p-6 shadow-sm transition-all duration-300 hover:border-primary/40 hover:shadow-xl dark:border-border/50">
      <div>
        <div className="flex items-center justify-between">
          <span className="grid size-9 place-items-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
            <Repeat className="size-4" />
          </span>
          <span className="rounded-full bg-teal-500/15 px-2.5 py-0.5 text-[10px] font-bold text-teal-600 dark:text-teal-400">
            Background Crons
          </span>
        </div>

        <h3 className="mt-4 text-lg font-black tracking-tight text-foreground">
          Recurring Autopilot Rules
        </h3>

        <div className="mt-2 flex gap-1.5 text-[11px] font-semibold text-muted-foreground">
          <span className="rounded-md bg-muted/80 px-2 py-0.5">Rent</span>
          <span className="rounded-md bg-muted/80 px-2 py-0.5">SIPs</span>
          <span className="rounded-md bg-muted/80 px-2 py-0.5">WiFi</span>
          <span className="rounded-md bg-muted/80 px-2 py-0.5">Salary</span>
        </div>

        {/* Live Rule with iOS-Style Toggle Switch */}
        <div className="mt-4 rounded-2xl border border-border/80 bg-muted/30 p-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`size-2 rounded-full ${isAutopilotOn ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`}
              />
              <span className="text-xs font-bold text-foreground">
                House Rent Auto-Post
              </span>
            </div>
            <span className="text-xs font-black text-rose-500">−₹18,000</span>
          </div>

          <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-border/50 text-[11px]">
            <span className="text-muted-foreground">
              {isAutopilotOn ? "Triggers 1st of month" : "Rule Paused"}
            </span>
            <button
              type="button"
              onClick={() => setIsAutopilotOn(!isAutopilotOn)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                isAutopilotOn ? "bg-primary" : "bg-muted-foreground/30"
              }`}
            >
              <span
                className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                  isAutopilotOn ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 border-t border-border/70 pt-3 text-[11px] font-bold text-primary flex items-center justify-between">
        <span>Zero Manual Entry Required</span>
        <Clock className="size-3.5" />
      </div>
    </div>
  );

  /* -------------------------------------------------------------------------- */
  /*                      CARD COMPONENT: PERIOD DELTA                          */
  /* -------------------------------------------------------------------------- */
  const renderDeltaCard = () => {
    const current = PERIOD_DATA[activePeriod];

    return (
      <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-[28px] border border-border/70 bg-card p-6 shadow-sm transition-all duration-300 hover:border-primary/40 hover:shadow-xl dark:border-border/50">
        <div>
          <div className="flex items-center justify-between">
            <span className="grid size-9 place-items-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <CalendarRange className="size-4" />
            </span>
            <span className="rounded-full bg-blue-500/15 px-2.5 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-400">
              Delta Velocity
            </span>
          </div>

          <h3 className="mt-4 text-lg font-black tracking-tight text-foreground">
            Multi-Period Delta Intelligence
          </h3>

          {/* Segmented Native Period Control */}
          <div className="mt-3 flex rounded-xl border border-border/80 bg-muted/60 p-1">
            {(["Day", "Week", "Month", "Year"] as Period[]).map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => setActivePeriod(period)}
                className={`flex-1 rounded-lg py-1 text-xs font-bold transition-all cursor-pointer ${
                  activePeriod === period
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {period}
              </button>
            ))}
          </div>

          {/* Micro Velocity Visual Bar */}
          <div className="mt-4 rounded-2xl border border-border/80 bg-muted/30 p-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground font-medium">
                {current.desc}
              </span>
              <span className="font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                <TrendingUp className="size-3.5" /> {current.delta}
              </span>
            </div>

            {/* Spark bars */}
            <div className="mt-3 flex items-end gap-1.5 h-7">
              {current.bars.map((bar, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm bg-primary/25 transition-all duration-300 hover:bg-primary"
                  style={{ height: `${bar}%` }}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 border-t border-border/70 pt-3 text-[11px] font-bold text-primary flex items-center justify-between">
          <span>Real-Time Net Worth Velocity</span>
          <ArrowUpRight className="size-3.5" />
        </div>
      </div>
    );
  };

  return (
    <div className="w-full">
      {/* -------------------------------------------------------------------- */}
      {/*         MOBILE EXPERIENCE: NATIVE APP SEGMENTED CONTROLLER           */}
      {/* -------------------------------------------------------------------- */}
      <div className="block md:hidden">
        {/* Segmented Pill Selector for mobile screens */}
        <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto rounded-2xl border border-border/80 bg-card/80 p-1.5 backdrop-blur-md shadow-xs mb-4">
          {mobileTabs.map((tab, idx) => {
            const Icon = tab.icon;
            const isTabActive = mobileTab === idx;
            return (
              <button
                key={tab.label}
                type="button"
                onClick={() => setMobileTab(idx)}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all cursor-pointer ${
                  isTabActive
                    ? "bg-primary text-primary-foreground shadow-sm scale-[1.02]"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <Icon className="size-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Active Native Card on Mobile with smooth Animated Transition */}
        <AnimatePresence mode="wait">
          <motion.div
            key={mobileTab}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.2 }}
          >
            {mobileTab === 0 && renderUpiCard()}
            {mobileTab === 1 && renderRadarCard()}
            {mobileTab === 2 && renderTripSplitCard()}
            {mobileTab === 3 && renderAutopilotCard()}
            {mobileTab === 4 && renderDeltaCard()}
          </motion.div>
        </AnimatePresence>

        {/* Mobile Swipe / Quick Switch hint */}
        <div className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] font-medium text-muted-foreground">
          <span>Tap tabs above to test every feature simulator</span>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/*       DESKTOP & TABLET EXPERIENCE: ASYMMETRIC BENTO GRID             */}
      {/* -------------------------------------------------------------------- */}
      <div className="hidden md:flex flex-col gap-6">
        {/* TOP ROW: Hero UPI Card (7 cols) + Pacing Radar Card (5 cols) */}
        <div className="grid gap-6 md:grid-cols-12 items-stretch">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="md:col-span-7"
          >
            {renderUpiCard()}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="md:col-span-5"
          >
            {renderRadarCard()}
          </motion.div>
        </div>

        {/* BOTTOM ROW: 3 Modular Cards (4 cols each) */}
        <div className="grid gap-6 md:grid-cols-3 items-stretch">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.15 }}
          >
            {renderTripSplitCard()}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            {renderAutopilotCard()}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.25 }}
          >
            {renderDeltaCard()}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
