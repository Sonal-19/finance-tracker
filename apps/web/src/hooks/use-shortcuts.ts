import { useEffect, useEffectEvent, useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { usePublicConfig } from "@/hooks/use-passkeys";
import {
  resolveShortcuts,
  type ShortcutAction,
  type ShortcutMap,
} from "$/lib/utils/shortcuts";

export const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/** The keys in effect: code defaults → admin defaults → the user's own. */
export function useShortcutMap(): ShortcutMap {
  const admin = usePublicConfig().data?.shortcuts;
  const own = useAuth().user?.shortcuts;
  return useMemo(() => resolveShortcuts(admin, own), [admin, own]);
}

/** The admin's map alone (what "Reset" goes back to in Settings). */
export function useAdminShortcuts(): ShortcutMap {
  const admin = usePublicConfig().data?.shortcuts;
  return useMemo(() => resolveShortcuts(admin, null), [admin]);
}

const NAMED: Record<string, string> = {
  Enter: "enter",
  Escape: "escape",
  " ": "space",
  Tab: "tab",
  Backspace: "backspace",
  Delete: "delete",
  ArrowUp: "arrowup",
  ArrowDown: "arrowdown",
  ArrowLeft: "arrowleft",
  ArrowRight: "arrowright",
};

/** One key press in binding syntax ("shift+n", "mod+enter", "?"), or null
 * for a lone modifier or a combo bindings can't express. */
export function stepOf(e: KeyboardEvent): string | null {
  if (["Shift", "Control", "Alt", "Meta", "CapsLock", "Dead"].includes(e.key))
    return null;
  // The non-"mod" one of Ctrl/⌘ (Ctrl on a Mac) is never ours.
  if (isMac ? e.ctrlKey : e.metaKey) return null;
  const named = NAMED[e.key];
  let key: string;
  if (named) key = named;
  else if (e.key.length === 1) key = e.key.toLowerCase();
  else return null;
  // Shift is part of the key for symbols ("?" is Shift+/), so only letters,
  // digits and named keys spell it out.
  const shiftCounts = !!named || /^[a-z0-9]$/.test(key);
  const mods = [
    (isMac ? e.metaKey : e.ctrlKey) && "mod",
    e.shiftKey && shiftCounts && "shift",
    e.altKey && "alt",
  ].filter(Boolean);
  return [...mods, key].join("+");
}

const LABEL: Record<string, string> = {
  mod: isMac ? "⌘" : "Ctrl",
  shift: isMac ? "⇧" : "Shift",
  alt: isMac ? "⌥" : "Alt",
  enter: "Enter",
  escape: "Esc",
  space: "Space",
  tab: "Tab",
  backspace: "⌫",
  delete: "Del",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
};

/** "g d" → [["G"], ["D"]], "mod+enter" → [["⌘", "Enter"]]. */
export function bindingKeys(binding: string): string[][] {
  if (!binding) return [];
  return binding
    .split(" ")
    .map((step) =>
      (step === "+" ? ["+"] : step.split(/\+(?!$)/)).map(
        (k) => LABEL[k] ?? k.toUpperCase(),
      ),
    );
}

const isTyping = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  if (!t?.tagName) return false;
  return (
    t.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) ||
    t.getAttribute("role") === "combobox"
  );
};

const dialogOpen = () =>
  !!document.querySelector(
    '[role="dialog"][data-state="open"], [data-vaul-drawer][data-state="open"]',
  );

/**
 * Listens on the window and runs the handler for a matching binding. Plain
 * keys are ignored while typing or with a dialog open, so they never eat
 * text; ⌘/Ctrl combos work everywhere. Sequences ("g d") wait 1s for the
 * second key.
 */
export function useGlobalShortcuts(
  map: ShortcutMap,
  handlers: Partial<Record<ShortcutAction, () => void>>,
) {
  const run = useEffectEvent((action: ShortcutAction) => handlers[action]?.());
  const byBinding = useMemo(() => {
    const out = new Map<string, ShortcutAction>();
    for (const [action, b] of Object.entries(map) as [ShortcutAction, string][])
      if (b) out.set(b, action);
    return out;
  }, [map]);
  const prefixes = useMemo(
    () =>
      new Set(
        [...byBinding.keys()]
          .filter((b) => b.includes(" "))
          .map((b) => b.split(" ")[0]),
      ),
    [byBinding],
  );

  useEffect(() => {
    let first: string | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const reset = () => {
      first = null;
      clearTimeout(timer);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.repeat) return;
      const step = stepOf(e);
      if (!step) return;
      const withMod = step.startsWith("mod+");
      if (!withMod && (isTyping(e.target) || dialogOpen())) return reset();

      const tryFire = (binding: string) => {
        const action = byBinding.get(binding);
        if (!action) return false;
        e.preventDefault();
        reset();
        run(action);
        return true;
      };
      if (first) {
        const seq = `${first} ${step}`;
        reset();
        if (tryFire(seq)) return;
      }
      if (tryFire(step)) return;
      if (prefixes.has(step)) {
        e.preventDefault();
        first = step;
        timer = setTimeout(reset, 1000);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      reset();
    };
  }, [byBinding, prefixes]);
}
