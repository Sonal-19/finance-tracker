// Keyboard shortcuts: the action list, default bindings and validation.
// Pure TypeScript with no imports, so the web app imports this same file
// (`$/lib/utils/shortcuts`) and both sides agree on what a valid binding is.
//
// Binding syntax: keys joined by "+", steps of a sequence separated by a
// space. `mod` is ⌘ on macOS and Ctrl elsewhere.
//   "n"           press n
//   "shift+n"     press Shift+N
//   "g d"         press g, then d (within a second)
//   "mod+enter"   ⌘/Ctrl+Enter
// "" means the action has no shortcut. Symbols are written as typed ("?",
// not "shift+/"), so Shift is only spelled out for letters, digits and named
// keys.

export const SHORTCUT_GROUPS = ["Create", "Go to", "App"] as const;
export type ShortcutGroup = (typeof SHORTCUT_GROUPS)[number];

export const SHORTCUT_ACTIONS = [
  { id: "addExpense", label: "Add expense", group: "Create", key: "n" },
  { id: "addIncome", label: "Add income", group: "Create", key: "i" },
  { id: "addSplit", label: "Split a bill", group: "Create", key: "s" },
  { id: "goDashboard", label: "Dashboard", group: "Go to", key: "g d" },
  { id: "goTransactions", label: "Transactions", group: "Go to", key: "g t" },
  { id: "goReports", label: "Reports", group: "Go to", key: "g r" },
  { id: "goAccounts", label: "Payment methods", group: "Go to", key: "g p" },
  { id: "goBooks", label: "Books", group: "Go to", key: "g b" },
  { id: "goEvents", label: "Events", group: "Go to", key: "g e" },
  { id: "goSplit", label: "Split & share", group: "Go to", key: "g s" },
  { id: "goBudgets", label: "Budgets", group: "Go to", key: "g u" },
  { id: "goGoals", label: "Savings goals", group: "Go to", key: "g o" },
  { id: "goRecurring", label: "Recurring", group: "Go to", key: "g l" },
  { id: "goCategories", label: "Categories", group: "Go to", key: "g c" },
  { id: "goSettings", label: "Settings", group: "Go to", key: "g ," },
  { id: "search", label: "Search transactions", group: "App", key: "/" },
  { id: "toggleSidebar", label: "Collapse sidebar", group: "App", key: "[" },
  { id: "syncNow", label: "Sync now", group: "App", key: "shift+r" },
  { id: "showShortcuts", label: "Show shortcuts", group: "App", key: "?" },
  {
    id: "submitForm",
    label: "Save the open form",
    group: "App",
    key: "mod+enter",
  },
] as const satisfies readonly {
  id: string;
  label: string;
  group: ShortcutGroup;
  key: string;
}[];

export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number]["id"];
export type ShortcutMap = Record<ShortcutAction, string>;

export const SHORTCUT_IDS = SHORTCUT_ACTIONS.map((a) => a.id);

export const DEFAULT_SHORTCUTS = Object.fromEntries(
  SHORTCUT_ACTIONS.map((a) => [a.id, a.key]),
) as ShortcutMap;

const MODIFIERS = ["mod", "shift", "alt"] as const;
const NAMED = [
  "enter",
  "escape",
  "space",
  "tab",
  "backspace",
  "delete",
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
] as const;

/** Keys the browser or OS already uses on their own (scrolling, focus, closing
 * dialogs), so they can't be a shortcut without a modifier. */
const BARE_RESERVED = new Set<string>([
  "enter",
  "escape",
  "space",
  "tab",
  "backspace",
  "delete",
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
]);

/**
 * ⌘/Ctrl combos the app may use. Almost every other ⌘/Ctrl+key is taken by
 * the OS or browser (copy, paste, new tab, close, print, find, reload,
 * address bar, bookmarks, zoom…), and Alt combos type accented letters on
 * macOS and open menus on Windows, so those are refused outright.
 */
const ALLOWED_MOD = new Set([
  "mod+enter",
  "mod+shift+enter",
  "mod+k",
  "mod+/",
  "mod+.",
  "mod+;",
  "mod+'",
  "mod+\\",
  "mod+shift+k",
]);

/** Lower-cases a binding and puts modifiers in a fixed order. */
export function normalizeBinding(binding: string) {
  return binding
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((step) => {
      // "+" itself is a key: "shift++" is Shift and "+".
      const parts = step === "+" ? ["+"] : step.split(/\+(?!$)/);
      const key = parts.pop() ?? "";
      const mods = MODIFIERS.filter((m) => parts.includes(m));
      return [...mods, key].join("+");
    })
    .join(" ");
}

/** Why a single binding can't be used, or null when it's fine. */
export function bindingProblem(binding: string): string | null {
  const b = normalizeBinding(binding);
  if (!b) return null;
  const steps = b.split(" ");
  if (steps.length > 2) return "Use at most two keys in a row";
  for (const step of steps) {
    const parts = step === "+" ? ["+"] : step.split(/\+(?!$)/);
    const key = parts.at(-1) ?? "";
    const mods = parts.slice(0, -1);
    if (mods.some((m) => !(MODIFIERS as readonly string[]).includes(m)))
      return `Unknown modifier in "${step}"`;
    if (
      !(key.length === 1 || (NAMED as readonly string[]).includes(key)) ||
      key === " "
    )
      return `Unknown key "${key}"`;
    if (mods.includes("alt"))
      return "Alt/Option combos type characters or open menus; pick another key";
    if (mods.includes("mod")) {
      if (steps.length > 1)
        return "⌘/Ctrl shortcuts can't be part of a sequence";
      if (!ALLOWED_MOD.has(step))
        return `${step.replace("mod", "⌘/Ctrl")} is used by the browser or OS`;
      continue;
    }
    if (BARE_RESERVED.has(key))
      return `${key} is used for scrolling, focus or closing dialogs`;
  }
  return null;
}

/** Every problem in a full map, keyed by action id. Covers bad bindings, two
 * actions on the same keys, and a single key that starts another action's
 * sequence (it would fire before the sequence could finish). */
export function shortcutProblems(map: Partial<Record<string, string>>) {
  const problems: Partial<Record<ShortcutAction, string>> = {};
  const entries = SHORTCUT_IDS.map(
    (id) => [id, normalizeBinding(map[id] ?? "")] as const,
  ).filter(([, b]) => b);
  const label = (id: string) =>
    SHORTCUT_ACTIONS.find((a) => a.id === id)?.label ?? id;
  for (const [id, b] of entries) {
    const bad = bindingProblem(b);
    if (bad) {
      problems[id] = bad;
      continue;
    }
    for (const [other, ob] of entries) {
      if (other === id) continue;
      if (ob === b) problems[id] = `Same keys as "${label(other)}"`;
      else if (ob.startsWith(`${b} `))
        problems[id] = `Blocks "${label(other)}" (${ob}), which starts with it`;
      else if (b.startsWith(`${ob} `))
        problems[id] = `"${label(other)}" (${ob}) fires before this can finish`;
    }
  }
  return problems;
}

/** Keeps only known actions with normalised bindings. */
export function cleanShortcuts(map: Partial<Record<string, string>>) {
  const out: Partial<ShortcutMap> = {};
  for (const id of SHORTCUT_IDS)
    if (typeof map[id] === "string") out[id] = normalizeBinding(map[id]);
  return out;
}

/** Code defaults, then the admin's defaults, then the user's own changes. */
export function resolveShortcuts(
  admin: Partial<Record<string, string>> | null | undefined,
  user: Partial<Record<string, string>> | null | undefined,
): ShortcutMap {
  const own = cleanShortcuts(user ?? {});
  const merged: ShortcutMap = {
    ...DEFAULT_SHORTCUTS,
    ...cleanShortcuts(admin ?? {}),
    ...own,
  };
  // The admin may later give a default the keys a user already picked for
  // something else: the user's choice wins and that default is switched off.
  const mine = Object.values(own).filter(Boolean) as string[];
  for (const id of SHORTCUT_IDS) {
    if (id in own) continue;
    const b = merged[id];
    if (
      b &&
      mine.some(
        (m) => m === b || m.startsWith(`${b} `) || b.startsWith(`${m} `),
      )
    )
      merged[id] = "";
  }
  return merged;
}
