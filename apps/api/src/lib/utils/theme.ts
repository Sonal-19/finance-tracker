// Colour themes: the editable tokens, the built-in palettes and presets, the
// colours derived from them, and the contrast checks. Pure TypeScript with no
// imports, so the web app imports this same file (`$/lib/utils/theme`) and
// both sides agree on what a usable theme is.
//
// Resolved as: code base palette for the mode → the admin's preset and
// colours (`SYSTEM_CONFIG.THEME`) → the user's preset and colours
// (`user_config.config.THEME`). Only the colours someone changed are stored.

export const THEME_MODES = ["light", "dark", "amoled"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

/** What a device shows: a mode, or follow the OS (light / one dark mode). */
export const THEME_CHOICES = ["system", ...THEME_MODES] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

/** Which dark mode "system" uses when the OS is dark. */
export const DARK_STYLES = ["dark", "amoled"] as const;
export type DarkStyle = (typeof DARK_STYLES)[number];

export const THEME_TOKENS = [
  { id: "primary", label: "Accent", hint: "Buttons, links, highlights" },
  { id: "background", label: "Page background", hint: "Behind everything" },
  { id: "card", label: "Cards", hint: "Panels, sheets and menus" },
  { id: "foreground", label: "Text", hint: "Body text and headings" },
  { id: "mutedText", label: "Secondary text", hint: "Hints, dates, labels" },
  { id: "border", label: "Borders", hint: "Card edges and dividers" },
  { id: "income", label: "Income text", hint: "+ amounts" },
  { id: "expense", label: "Expense text", hint: "− amounts" },
  { id: "chartIncome", label: "Income in charts", hint: "Bars and lines" },
  { id: "chartExpense", label: "Expense in charts", hint: "Bars and lines" },
  { id: "warning", label: "Warnings", hint: "Budget alerts" },
  { id: "destructive", label: "Danger", hint: "Delete buttons, errors" },
] as const;

export type ThemeToken = (typeof THEME_TOKENS)[number]["id"];
export type Palette = Record<ThemeToken, string>;
export type PaletteOverrides = Partial<Record<ThemeToken, string>>;

export const THEME_TOKEN_IDS = THEME_TOKENS.map((t) => t.id);

/** Teal on neutral greys, income teal and expense orange; every pair passes the checks in
 * `themeProblems` (text ≥ 4.5:1, chart colours apart for colour-blind eyes). */
export const BASE_PALETTES: Record<ThemeMode, Palette> = {
  light: {
    primary: "#0f766e",
    background: "#f5f7f9",
    card: "#ffffff",
    foreground: "#0f172a",
    mutedText: "#5b6676",
    border: "#e2e8f0",
    income: "#0f766e",
    expense: "#c2410c",
    chartIncome: "#0d9488",
    chartExpense: "#ea580c",
    warning: "#b45309",
    destructive: "#b91c1c",
  },
  dark: {
    primary: "#2dd4bf",
    background: "#0b1015",
    card: "#121a21",
    foreground: "#e6edf3",
    mutedText: "#8b98a5",
    border: "#22303b",
    income: "#5eead4",
    expense: "#fb923c",
    chartIncome: "#14b8a6",
    chartExpense: "#f97316",
    warning: "#fbbf24",
    destructive: "#f87171",
  },
  /** True black for OLED screens: unlit pixels, the highest contrast. */
  amoled: {
    primary: "#2dd4bf",
    background: "#000000",
    card: "#0a0a0a",
    foreground: "#f5f5f5",
    mutedText: "#a3a3a3",
    border: "#262626",
    income: "#5eead4",
    expense: "#fb923c",
    chartIncome: "#14b8a6",
    chartExpense: "#f97316",
    warning: "#fbbf24",
    destructive: "#f87171",
  },
};

export const THEME_PRESETS = [
  { id: "teal", label: "Teal", light: "#0f766e", dark: "#2dd4bf" },
  { id: "emerald", label: "Emerald", light: "#047857", dark: "#34d399" },
  { id: "blue", label: "Blue", light: "#1d4ed8", dark: "#60a5fa" },
  { id: "indigo", label: "Indigo", light: "#4338ca", dark: "#818cf8" },
  { id: "violet", label: "Violet", light: "#6d28d9", dark: "#a78bfa" },
  { id: "rose", label: "Rose", light: "#be123c", dark: "#fb7185" },
  { id: "amber", label: "Amber", light: "#b45309", dark: "#fbbf24" },
  { id: "slate", label: "Mono", light: "#334155", dark: "#cbd5e1" },
] as const;

export type ThemePresetId = (typeof THEME_PRESETS)[number]["id"];
export const DEFAULT_PRESET: ThemePresetId = "teal";

/** The colour part of a theme, as both configs store it. `PRESET` "" means
 * "whatever the level below picked". */
export type ThemeColors = {
  PRESET: string;
  LIGHT: PaletteOverrides;
  DARK: PaletteOverrides;
  AMOLED: PaletteOverrides;
};

const MODE_KEY = { light: "LIGHT", dark: "DARK", amoled: "AMOLED" } as const;

/* ============================ colour maths ============================ */

type Rgb = [number, number, number];

const HEX = /^#[0-9a-f]{6}$/;

export const isHex = (v: unknown): v is string =>
  typeof v === "string" && HEX.test(v.toLowerCase());

/** "#ABC" / "abcdef" / "#AbCdEf" → "#abcdef", or null. */
export function normalizeHex(v: string): string | null {
  let s = v.trim().toLowerCase();
  if (!s.startsWith("#")) s = `#${s}`;
  if (/^#[0-9a-f]{3}$/.test(s))
    s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return HEX.test(s) ? s : null;
}

function rgb(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex([r, g, b]: Rgb) {
  const c = (x: number) =>
    Math.round(Math.min(255, Math.max(0, x)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** `a` with `t` (0–1) of `b` mixed in. */
export function mix(a: string, b: string, t: number) {
  const x = rgb(a);
  const y = rgb(b);
  return hex([0, 1, 2].map((i) => x[i]! + (y[i]! - x[i]!) * t) as Rgb);
}

const toLinear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c: number) =>
  255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

/** WCAG 2 relative luminance, 0 (black) to 1 (white). */
export function luminance(color: string) {
  const [r, g, b] = rgb(color).map(toLinear) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio, 1 to 21. */
export function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

/** `fg` pushed towards black or white (whichever gains contrast) until it
 * reaches `min` against `bg`. Keeps the hue as long as it can. */
export function ensureContrast(fg: string, bg: string, min: number) {
  if (contrast(fg, bg) >= min) return fg;
  const target =
    contrast("#000000", bg) > contrast("#ffffff", bg) ? "#000000" : "#ffffff";
  for (let t = 0.05; t < 1; t += 0.05) {
    const next = mix(fg, target, t);
    if (contrast(next, bg) >= min) return next;
  }
  return target;
}

/** Near-white or near-black text for a filled `bg`, whichever reads better. */
export function onColor(bg: string) {
  const light = "#ffffff";
  const dark = mix(bg, "#000000", 0.85);
  return contrast(light, bg) >= contrast(dark, bg) ? light : dark;
}

function oklab(color: string): Rgb {
  const [r, g, b] = rgb(color).map(toLinear) as Rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Perceptual distance (ΔE in OKLab ×100): under ~10 looks alike at a
 * glance, under ~4 is hard to tell apart side by side. */
export function colorDistance(a: string, b: string) {
  const [l1, a1, b1] = oklab(a);
  const [l2, a2, b2] = oklab(b);
  return 100 * Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

/** Machado et al. (2009) full-severity matrices, applied in linear RGB. */
const CVD = {
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
} as const;

export type Vision = keyof typeof CVD;

/** How `color` looks to someone with that colour-vision deficiency. */
export function simulateCvd(color: string, vision: Vision) {
  const lin = rgb(color).map(toLinear);
  const m = CVD[vision];
  return hex(
    m.map((row) =>
      fromLinear(
        Math.min(
          1,
          Math.max(0, row[0] * lin[0]! + row[1] * lin[1]! + row[2] * lin[2]!),
        ),
      ),
    ) as Rgb,
  );
}

/** The smallest distance between two colours across normal and
 * colour-blind vision, and which vision it is (normal when they're already
 * closer than `under` to everyone). */
export function separation(a: string, b: string, under = 12) {
  const normal = colorDistance(a, b);
  // Alike for everyone: say so rather than naming one kind of vision.
  if (normal < under) return { distance: normal, vision: "normal" };
  let worst = { distance: normal, vision: "normal" as string };
  for (const v of Object.keys(CVD) as Vision[]) {
    const d = colorDistance(simulateCvd(a, v), simulateCvd(b, v));
    if (d < worst.distance) worst = { distance: d, vision: v };
  }
  return worst;
}

/* ============================== resolving ============================== */

/** Keeps only known tokens with valid colours, lower-cased. */
export function cleanPalette(input: unknown): PaletteOverrides {
  const out: PaletteOverrides = {};
  if (typeof input !== "object" || input === null) return out;
  const src = input as Record<string, unknown>;
  for (const id of THEME_TOKEN_IDS) {
    const v = src[id];
    if (typeof v === "string") {
      const h = normalizeHex(v);
      if (h) out[id] = h;
    }
  }
  return out;
}

const presetOf = (id: string | undefined) =>
  THEME_PRESETS.find((p) => p.id === id);

function presetColors(id: string | undefined, mode: ThemeMode) {
  const p = presetOf(id);
  if (!p) return {};
  return { primary: mode === "light" ? p.light : p.dark };
}

/** The full palette for a mode: code base → admin → user. */
export function resolvePalette(
  mode: ThemeMode,
  admin: Partial<ThemeColors> | null | undefined,
  user?: Partial<ThemeColors> | null,
): Palette {
  const key = MODE_KEY[mode];
  return {
    ...BASE_PALETTES[mode],
    ...presetColors(admin?.PRESET || DEFAULT_PRESET, mode),
    ...cleanPalette(admin?.[key]),
    ...(user?.PRESET ? presetColors(user.PRESET, mode) : {}),
    ...cleanPalette(user?.[key]),
  };
}

/** Every CSS variable the stylesheet reads, from a full palette. The ones
 * that aren't editable are mixed from the editable ones. */
export function themeCss(p: Palette, mode: ThemeMode): Record<string, string> {
  const dark = mode !== "light";
  const surface = dark
    ? mix(p.card, p.foreground, 0.07)
    : mix(p.background, p.foreground, 0.04);
  const accent = mix(p.card, p.primary, dark ? 0.16 : 0.1);
  // A filled hero card behind white text (the dashboard summary).
  const hero = ensureContrast(
    dark ? mix(p.primary, "#000000", 0.35) : p.primary,
    "#ffffff",
    4.5,
  );
  return {
    "--background": p.background,
    "--foreground": p.foreground,
    "--card": p.card,
    "--card-foreground": p.foreground,
    "--popover": dark ? mix(p.card, p.foreground, 0.03) : p.card,
    "--popover-foreground": p.foreground,
    "--primary": p.primary,
    "--primary-foreground": onColor(p.primary),
    "--secondary": surface,
    "--secondary-foreground": p.foreground,
    "--muted": surface,
    "--muted-foreground": p.mutedText,
    "--accent": accent,
    "--accent-foreground": ensureContrast(p.primary, accent, 4.5),
    "--destructive": p.destructive,
    "--destructive-foreground": onColor(p.destructive),
    "--border": p.border,
    "--input": mix(p.border, p.foreground, dark ? 0.08 : 0.06),
    "--ring": p.primary,
    "--income": p.income,
    "--expense": p.expense,
    "--warning": p.warning,
    "--chart-grid": p.border,
    "--chart-income": p.chartIncome,
    "--chart-expense": p.chartExpense,
    "--hero": hero,
    "--hero-end": mix(hero, "#000000", 0.3),
  };
}

/* =============================== checks =============================== */

export type ThemeProblem = {
  token: ThemeToken;
  /** "error" is unreadable and can't be saved; "warn" is allowed but poor. */
  level: "error" | "warn";
  message: string;
};

const ratio = (r: number) => `${r.toFixed(1)}:1`;

/**
 * What's hard to read in a palette, per token. Text needs WCAG AA (4.5:1)
 * on cards and the page, chart colours and borders need to stand out from
 * cards (WCAG 1.4.11: 3:1 for graphics), and the income/expense colours must
 * stay apart for colour-blind eyes. Below the `floor` it's an error.
 */
export function themeProblems(p: Palette, mode: ThemeMode): ThemeProblem[] {
  const out: ThemeProblem[] = [];
  const text = (
    token: ThemeToken,
    what: string,
    min = 4.5,
    floor = 3,
  ): void => {
    const worst = Math.min(
      contrast(p[token], p.card),
      contrast(p[token], p.background),
    );
    if (worst < floor)
      out.push({
        token,
        level: "error",
        message: `${what}: unreadable on the background (${ratio(worst)}, needs ${ratio(min)})`,
      });
    else if (worst < min)
      out.push({
        token,
        level: "warn",
        message: `${what}: hard to read (${ratio(worst)}; ${ratio(min)} or more is recommended)`,
      });
  };
  text("foreground", "Text", 4.5, 4.5);
  text("mutedText", "Secondary text");
  text("primary", "Accent links");
  text("income", "Income amounts");
  text("expense", "Expense amounts");
  text("warning", "Warnings");
  text("destructive", "Error text");

  for (const token of ["chartIncome", "chartExpense"] as const) {
    const c = contrast(p[token], p.card);
    if (c < 1.5)
      out.push({
        token,
        level: "error",
        message: `Chart colour vanishes into the card (${ratio(c)})`,
      });
    else if (c < 3)
      out.push({
        token,
        level: "warn",
        message: `Chart colour is faint on cards (${ratio(c)}; 3:1 recommended)`,
      });
  }

  const charts = separation(p.chartIncome, p.chartExpense);
  if (charts.distance < 12)
    out.push({
      token: "chartExpense",
      level: charts.distance < 5 ? "error" : "warn",
      message:
        charts.vision === "normal"
          ? "Income and expense chart colours look almost the same"
          : `Income and expense chart colours look alike with ${charts.vision}`,
    });
  const amounts = separation(p.income, p.expense, 5);
  if (amounts.distance < 5)
    out.push({
      token: "expense",
      level: "warn",
      message:
        amounts.vision === "normal"
          ? "Income and expense text look the same (the +/− signs still tell them apart)"
          : `Income and expense text look alike with ${amounts.vision} (the +/− signs still tell them apart)`,
    });

  const edge = contrast(p.border, p.card);
  if (edge < 1.12)
    out.push({
      token: "border",
      level: "warn",
      message: `Borders barely show on cards (${ratio(edge)})`,
    });

  const dark = mode !== "light";
  if (dark !== luminance(p.background) < 0.18)
    out.push({
      token: "background",
      level: "warn",
      message: dark
        ? "A light page background in a dark theme"
        : "A dark page background in the light theme",
    });
  if (mode === "amoled" && luminance(p.background) > 0.001)
    out.push({
      token: "background",
      level: "warn",
      message: "Not true black, so OLED pixels stay lit",
    });
  return out;
}

/** Problems with someone's overrides, checked as they'd be shown. Only
 * tokens that come out unreadable block a save. */
export function themeErrors(
  admin: Partial<ThemeColors> | null | undefined,
  user?: Partial<ThemeColors> | null,
) {
  const errors: string[] = [];
  for (const mode of THEME_MODES) {
    const p = resolvePalette(mode, admin, user);
    for (const problem of themeProblems(p, mode))
      if (problem.level === "error")
        errors.push(`${MODE_LABEL[mode]}: ${problem.message}`);
  }
  return errors;
}

export const MODE_LABEL: Record<ThemeMode, string> = {
  light: "Light",
  dark: "Dark",
  amoled: "AMOLED",
};

/** Normalises a stored colour config: known preset, clean palettes. */
export function cleanThemeColors(input: Partial<ThemeColors>): ThemeColors {
  return {
    PRESET: presetOf(input.PRESET) ? (input.PRESET as string) : "",
    LIGHT: cleanPalette(input.LIGHT),
    DARK: cleanPalette(input.DARK),
    AMOLED: cleanPalette(input.AMOLED),
  };
}
