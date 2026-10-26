import { AlertTriangle, Check, CircleX, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Segmented } from "@/components/common/segmented";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  contrast,
  MODE_LABEL,
  normalizeHex,
  type Palette,
  resolvePalette,
  simulateCvd,
  THEME_MODES,
  THEME_PRESETS,
  THEME_TOKENS,
  type ThemeColors,
  type ThemeMode,
  type ThemeProblem,
  type ThemeToken,
  themeCss,
  themeProblems,
  type Vision,
} from "$/lib/utils/theme";

const MODE_KEY = { light: "LIGHT", dark: "DARK", amoled: "AMOLED" } as const;

export const EMPTY_THEME: ThemeColors = {
  PRESET: "",
  LIGHT: {},
  DARK: {},
  AMOLED: {},
};

/** Every problem per mode for colours at one level (`below` = the admin's
 * colours when editing a user's, null when editing the admin's). */
export function themeReport(
  value: ThemeColors,
  below: Partial<ThemeColors> | null,
) {
  return Object.fromEntries(
    THEME_MODES.map((m) => {
      const p = below
        ? resolvePalette(m, below, value)
        : resolvePalette(m, value);
      return [m, themeProblems(p, m)];
    }),
  ) as Record<ThemeMode, ThemeProblem[]>;
}

export const hasErrors = (report: Record<ThemeMode, ThemeProblem[]>) =>
  THEME_MODES.some((m) => report[m].some((p) => p.level === "error"));

/**
 * Picks a preset and changes single colours per mode, with the contrast of
 * each one worked out as you go and a live preview. Used for the admin's
 * defaults (`below` null) and for a user's own colours on top of them.
 */
export function ThemeEditor({
  value,
  onChange,
  below,
  initialMode = "light",
}: {
  value: ThemeColors;
  onChange: (next: ThemeColors) => void;
  below: Partial<ThemeColors> | null;
  initialMode?: ThemeMode;
}) {
  const [mode, setMode] = useState<ThemeMode>(initialMode);
  const resolve = (m: ThemeMode, v: Partial<ThemeColors>) =>
    below ? resolvePalette(m, below, v) : resolvePalette(m, v);
  const palette = resolve(mode, value);
  // What "reset" goes back to: the preset alone, without single changes.
  const base = resolve(mode, { PRESET: value.PRESET });
  const report = themeReport(value, below);
  const problems = report[mode];
  const own = value[MODE_KEY[mode]];

  const setToken = (token: ThemeToken, color: string | null) => {
    const key = MODE_KEY[mode];
    const { [token]: _old, ...rest } = value[key];
    onChange({
      ...value,
      [key]:
        color && color !== base[token] ? { ...rest, [token]: color } : rest,
    });
  };

  const inheritedPreset = below?.PRESET || "teal";

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-sm font-medium">Accent</p>
        <div className="flex flex-wrap gap-2">
          {below && (
            <PresetSwatch
              label="Default"
              color={resolvePalette(mode, below).primary}
              active={!value.PRESET}
              onClick={() => onChange({ ...value, PRESET: "" })}
            />
          )}
          {THEME_PRESETS.map((p) => (
            <PresetSwatch
              key={p.id}
              label={p.label}
              color={mode === "light" ? p.light : p.dark}
              active={
                value.PRESET === p.id ||
                (!below && !value.PRESET && p.id === inheritedPreset)
              }
              onClick={() => onChange({ ...value, PRESET: p.id })}
            />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">Colours for</p>
          <Segmented
            size="sm"
            value={mode}
            onChange={setMode}
            options={THEME_MODES.map((m) => {
              const errors = report[m].filter(
                (p) => p.level === "error",
              ).length;
              return {
                value: m,
                label: (
                  <span className="flex items-center gap-1.5">
                    {MODE_LABEL[m]}
                    {errors > 0 && (
                      <span className="size-1.5 rounded-full bg-destructive" />
                    )}
                  </span>
                ),
              };
            })}
          />
        </div>

        <ThemePreview palette={palette} mode={mode} />

        <div className="grid gap-2">
          {THEME_TOKENS.map((t) => (
            <TokenRow
              key={t.id}
              token={t.id}
              label={t.label}
              hint={t.hint}
              color={palette[t.id]}
              palette={palette}
              problems={problems.filter((p) => p.token === t.id)}
              changed={t.id in own}
              onChange={(c) => setToken(t.id, c)}
            />
          ))}
        </div>

        {problems.length > 0 ? (
          <ul className="space-y-1.5 rounded-xl border p-3 text-sm">
            {problems.map((p) => (
              <li key={p.message} className="flex items-start gap-2">
                {p.level === "error" ? (
                  <CircleX className="mt-0.5 size-4 shrink-0 text-destructive" />
                ) : (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
                )}
                <span>
                  {p.message}
                  {p.level === "error" && (
                    <span className="text-muted-foreground">
                      {" "}
                      · must be fixed to save
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="flex items-center gap-2 text-sm text-income">
            <Check className="size-4" /> Everything in {MODE_LABEL[mode]} is
            easy to read, and the income and expense colours stay apart for
            colour-blind eyes.
          </p>
        )}
      </div>
    </div>
  );
}

function PresetSwatch({
  label,
  color,
  active,
  onClick,
}: {
  label: string;
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-accent text-accent-foreground"
          : "hover:bg-muted",
      )}
    >
      <span
        className="grid size-6 place-items-center rounded-full"
        style={{ backgroundColor: color }}
      >
        {active && (
          <Check
            className="size-3.5"
            style={{
              color: contrast(color, "#ffffff") >= 3 ? "#ffffff" : "#000000",
            }}
          />
        )}
      </span>
      {label}
    </button>
  );
}

/** The number shown beside a colour: its contrast where it's used. */
function measure(token: ThemeToken, p: Palette) {
  switch (token) {
    case "background":
    case "card":
      return contrast(p.foreground, p[token]);
    case "border":
    case "chartIncome":
    case "chartExpense":
      return contrast(p[token], p.card);
    default:
      return Math.min(
        contrast(p[token], p.card),
        contrast(p[token], p.background),
      );
  }
}

function TokenRow({
  token,
  label,
  hint,
  color,
  palette,
  problems,
  changed,
  onChange,
}: {
  token: ThemeToken;
  label: string;
  hint: string;
  color: string;
  palette: Palette;
  problems: ThemeProblem[];
  changed: boolean;
  onChange: (color: string | null) => void;
}) {
  const [text, setText] = useState(color);
  useEffect(() => setText(color), [color]);
  const level = problems.some((p) => p.level === "error")
    ? "error"
    : problems.length
      ? "warn"
      : "ok";
  const ratio = measure(token, palette);
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-xl border p-2",
        level === "error" && "border-destructive/50",
      )}
      title={problems.map((p) => p.message).join("\n") || undefined}
    >
      <label
        className="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-lg border"
        style={{ backgroundColor: color }}
      >
        <span className="sr-only">Pick {label}</span>
        <input
          type="color"
          value={color}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{hint}</p>
      </div>
      <Input
        aria-label={`${label} hex`}
        value={text}
        maxLength={7}
        spellCheck={false}
        className="h-8 w-22 shrink-0 px-2 font-mono text-xs md:h-8"
        aria-invalid={!normalizeHex(text)}
        onChange={(e) => {
          setText(e.target.value);
          const hex = normalizeHex(e.target.value);
          if (hex && e.target.value.replace("#", "").length === 6)
            onChange(hex);
        }}
        onBlur={() => {
          const hex = normalizeHex(text);
          if (hex) onChange(hex);
          else setText(color);
        }}
      />
      <span
        className={cn(
          "tabular w-12 shrink-0 text-right text-xs font-semibold",
          level === "ok" && "text-income",
          level === "warn" && "text-warning",
          level === "error" && "text-destructive",
        )}
      >
        {ratio.toFixed(1)}:1
      </span>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={cn("size-7 shrink-0", !changed && "invisible")}
        aria-label={`Reset ${label}`}
        onClick={() => onChange(null)}
      >
        <RotateCcw className="size-3.5" />
      </Button>
    </div>
  );
}

const VISIONS: { id: Vision | "normal"; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "protanopia", label: "Protan" },
  { id: "deuteranopia", label: "Deutan" },
  { id: "tritanopia", label: "Tritan" },
];

/** A small piece of the app drawn in the colours being edited. */
export function ThemePreview({
  palette,
  mode,
}: {
  palette: Palette;
  mode: ThemeMode;
}) {
  const vars = themeCss(palette, mode) as React.CSSProperties;
  return (
    <div
      style={vars}
      className={cn(
        "space-y-3 rounded-2xl border bg-background p-3 text-foreground",
        mode !== "light" && "dark",
      )}
    >
      <div className="rounded-xl bg-linear-to-br from-hero to-hero-end p-3 text-white">
        <p className="text-xs text-white/80">Spent this month</p>
        <p className="tabular text-xl font-bold">₹24,580.00</p>
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Groceries</p>
            <p className="truncate text-xs text-muted-foreground">
              Today · UPI · <span className="text-primary">Edit</span>
            </p>
          </div>
          <div className="text-right text-sm font-semibold">
            <p className="tabular text-expense">−₹1,240.00</p>
            <p className="tabular text-income">+₹52,000.00</p>
          </div>
        </div>
        <p className="text-xs text-warning">Food budget: 86% used</p>
        <div className="space-y-1.5">
          {VISIONS.map((v) => {
            const inc =
              v.id === "normal"
                ? palette.chartIncome
                : simulateCvd(palette.chartIncome, v.id);
            const exp =
              v.id === "normal"
                ? palette.chartExpense
                : simulateCvd(palette.chartExpense, v.id);
            return (
              <div key={v.id} className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-[11px] text-muted-foreground">
                  {v.label}
                </span>
                <span
                  className="h-2.5 w-[55%] rounded-full"
                  style={{ backgroundColor: inc }}
                />
                <span
                  className="h-2.5 w-[35%] rounded-full"
                  style={{ backgroundColor: exp }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">
            Save
          </span>
          <span className="rounded-md border bg-secondary px-3 py-1.5 text-xs font-medium">
            Cancel
          </span>
          <span className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground">
            Selected
          </span>
          <span className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground">
            Delete
          </span>
        </div>
      </div>
    </div>
  );
}
