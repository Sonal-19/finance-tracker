import {
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Play,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

interface AnimatedHeroProps {
  onStartFree: () => void;
  onExploreDemo: () => void;
}

const HERO_SLIDES = [
  {
    id: "piggy",
    image: "/images/piggy-bank.jpg",
    alt: "Golden Savings Piggy Bank with Milestone Coins",
    tag: "Visual Goal Milestones",
    sub: "Watch incremental rupee deposits compound to 100%",
  },
  {
    id: "notebook",
    image: "/images/hero-notebook-pen.jpg",
    alt: "Tactile Khata Notebook with Golden Pen and Rupee Journal",
    tag: "Tactile Khata Ledger",
    sub: "The tactile speed of pen & paper with cloud intelligence",
  },
  {
    id: "wallet",
    image: "/images/smart-wallet.jpg",
    alt: "Leather Pocket Wallet with Indian Rupee Notes and Rohit Singh Card",
    tag: "Pocket Cash & Visa Cards",
    sub: "Physical cash in wallet tracked alongside plastic cards",
  },
  {
    id: "vault",
    image: "/images/bank-vault.jpg",
    alt: "Heavy Fortified Bank Vault Safe with Golden Bars",
    tag: "Bank-Grade Ironclad Privacy",
    sub: "Zero SMS inbox reading, Argon2id security & instant OTP",
  },
  {
    id: "team",
    image: "/images/hero-team-lifestyle.jpg",
    alt: "Young Indian professionals tracking finances together",
    tag: "Financial Clarity in Action",
    sub: "Everyday Indian spenders curbing leaks & building wealth",
  },
];

export function AnimatedHero({
  onStartFree,
  onExploreDemo,
}: AnimatedHeroProps) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const activeSlide = HERO_SLIDES[currentSlideIndex] ?? HERO_SLIDES[0]!;

  // Automatic slider transition every 4 seconds (within user's requested 3-5s range)
  useEffect(() => {
    if (isPaused) return;

    const timer = setInterval(() => {
      setCurrentSlideIndex((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 4000);

    return () => clearInterval(timer);
  }, [isPaused]);

  const handlePrev = () => {
    setCurrentSlideIndex((prev) =>
      prev === 0 ? HERO_SLIDES.length - 1 : prev - 1,
    );
  };

  const handleNext = () => {
    setCurrentSlideIndex((prev) => (prev + 1) % HERO_SLIDES.length);
  };

  return (
    <section className="relative overflow-hidden bg-[#143d28] text-white">
      {/* -------------------------------------------------------------------- */}
      {/*              BACKGROUND GEOMETRIC WATERMARK ACCENTS (REFERENCE 2)    */}
      {/* -------------------------------------------------------------------- */}
      {/* Subtle concentric circles watermark on left */}
      <div className="pointer-events-none absolute -top-24 -left-24 size-[520px] rounded-full border border-emerald-400/10 opacity-70 z-0" />
      <div className="pointer-events-none absolute -top-4 -left-4 size-[380px] rounded-full border border-emerald-400/10 opacity-60 z-0" />
      <div className="pointer-events-none absolute top-16 left-16 size-[240px] rounded-full border border-emerald-400/10 opacity-50 z-0" />

      {/* -------------------------------------------------------------------- */}
      {/*                   TWO-COLUMN SPLIT HERO LAYOUT                       */}
      {/* -------------------------------------------------------------------- */}
      <div className="relative z-10 w-full">
        <div className="grid lg:grid-cols-12 min-h-[580px] lg:min-h-[640px]">
          {/* ================================================================= */}
          {/*          LEFT COLUMN: DEEP FOREST GREEN + BOLD TYPOGRAPHY         */}
          {/* ================================================================= */}
          <div className="lg:col-span-6 flex flex-col justify-center px-4 sm:px-10 md:px-14 lg:pl-16 lg:pr-10 py-12 sm:py-20 lg:py-24 z-10 max-w-full">
            {/* Headline: Clean White + Vibrant Lime Accent (Exact Match to Reference) */}
            <motion.h1
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.1 }}
              className="text-3xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-white leading-[1.15] sm:leading-[1.12] break-words"
            >
              Track Every Rupee with
              <span className="block mt-1 text-[#22c55e] font-black">
                Pure Clarity.
              </span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.18 }}
              className="mt-6 text-base sm:text-lg text-emerald-100/85 leading-relaxed max-w-xl font-normal"
            >
              The tactile ease of a notebook ledger, modern wallet cash, and
              bank-grade privacy. Keep your financial data completely on your
              terms—zero SMS scraping, zero ads.
            </motion.p>

            {/* CTA Pill Buttons (Exact Match to Reference Style) */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.25 }}
              className="mt-8 flex flex-wrap items-center gap-4"
            >
              {/* Primary Vibrant Green Pill Button with Angled Arrow */}
              <button
                type="button"
                onClick={onStartFree}
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-[#22c55e] hover:bg-[#1bb852] px-8 py-4 text-base font-bold text-white shadow-xl shadow-emerald-950/40 transition-all duration-300 hover:scale-[1.03] active:scale-[0.98] cursor-pointer"
              >
                <span>Start Tracking Free</span>
                <ArrowUpRight className="size-5 stroke-[2.8] transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </button>

              {/* Secondary Clean White Pill Button */}
              <button
                type="button"
                onClick={onExploreDemo}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white hover:bg-slate-100 px-7 py-4 text-base font-bold text-slate-900 shadow-lg shadow-black/10 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                <Play className="size-4 fill-emerald-600 text-emerald-600" />
                <span>Interactive Demo</span>
              </button>
            </motion.div>

            {/* Trust Proof Badges */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.32 }}
              className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold text-emerald-200/80"
            >
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-[#22c55e]" />
                No Credit Card Required
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-[#22c55e]" />
                Instant Email OTP
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-[#22c55e]" />
                Zero Bank SMS Reading
              </span>
            </motion.div>
          </div>

          {/* ================================================================= */}
          {/*   RIGHT COLUMN: AUTOMATIC SLIDER STAGE (3-5 SEC AUTO TRANSITION)  */}
          {/* ================================================================= */}
          <div
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
            className="lg:col-span-6 relative flex items-center justify-center min-h-[440px] sm:min-h-[520px] lg:min-h-full overflow-hidden group select-none"
          >
            {/* The Animated Image Slider Window */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSlide.id}
                initial={{ opacity: 0, scale: 1.04 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.55, ease: "easeInOut" }}
                className="absolute inset-0 size-full"
              >
                <img
                  src={activeSlide.image}
                  alt={activeSlide.alt}
                  className="size-full object-cover object-center"
                />

                {/* Subtle Gradient Overlays for High-End Cinematic Integration */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20 pointer-events-none" />
                <div className="hidden lg:block absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#143d28] to-transparent pointer-events-none" />
              </motion.div>
            </AnimatePresence>

            {/* Left & Right Interactive Navigation Chevrons */}
            <button
              type="button"
              onClick={handlePrev}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-30 size-10 rounded-full border border-white/20 bg-black/40 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer shadow-lg"
              aria-label="Previous slide"
            >
              <ChevronLeft className="size-5" />
            </button>

            <button
              type="button"
              onClick={handleNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-30 size-10 rounded-full border border-white/20 bg-black/40 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-md opacity-0 group-hover:opacity-100 transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer shadow-lg"
              aria-label="Next slide"
            >
              <ChevronRight className="size-5" />
            </button>

            {/* Dynamic Slide Info & Pagination HUD at Bottom of Image */}
            <div className="absolute bottom-6 sm:bottom-8  z-30 flex flex-col sm:flex-row sm:items-end pointer-events-none">
              {/* Slider Dots / Progress Indicator */}
              <div className="flex items-center gap-1.5 self-center sm:self-auto rounded-full border border-white/20 bg-black/50 px-3 py-1.5 backdrop-blur-md pointer-events-auto">
                {HERO_SLIDES.map((slide, idx) => (
                  <button
                    key={slide.id}
                    type="button"
                    onClick={() => setCurrentSlideIndex(idx)}
                    className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                      idx === currentSlideIndex
                        ? "w-7 bg-[#22c55e] shadow-xs"
                        : "w-2 bg-white/40 hover:bg-white/70"
                    }`}
                    aria-label={`Go to slide ${idx + 1}: ${slide.tag}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/*              SMOOTH WAVE DIVIDER (Exact Match to Reference)          */}
      {/* ==================================================================== */}
      <div className="pointer-events-none absolute -bottom-px left-0 right-0 w-full overflow-hidden leading-none z-20">
        <svg
          className="w-full h-3 sm:h-3.5 block"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern
              id="hero-wave-divider"
              x="0"
              y="0"
              width="32"
              height="16"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 0,0 C 5.8,0 10.2,6 16,6 C 21.8,6 26.2,0 32,0 L 32,16 L 0,16 Z"
                className="fill-background"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hero-wave-divider)" />
        </svg>
      </div>
    </section>
  );
}
