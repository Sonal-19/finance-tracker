import { Link } from "@tanstack/react-router";
import { Keyboard, RotateCcw, X } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { ResponsiveSheet } from "@/components/common/responsive-sheet";
import { Button } from "@/components/ui/button";
import { bindingKeys, stepOf, useShortcutMap } from "@/hooks/use-shortcuts";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import {
  bindingProblem,
  normalizeBinding,
  SHORTCUT_ACTIONS,
  SHORTCUT_GROUPS,
  type ShortcutAction,
  type ShortcutMap,
  shortcutProblems,
} from "$/lib/utils/shortcuts";

export function Kbd({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={cn(
        "inline-grid h-6 min-w-6 place-items-center rounded-md border border-b-2 bg-muted px-1.5 font-sans text-[11px] font-semibold text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** A binding drawn as keycaps: "g d" → G then D. `compact` draws smaller
 * keys without the "then", for menus. */
export function ShortcutKeys({
  binding,
  className,
  compact,
}: {
  binding: string;
  className?: string;
  compact?: boolean;
}) {
  const steps = bindingKeys(binding);
  if (!steps.length)
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        None
      </span>
    );
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        compact &&
          "gap-0.5 [&_kbd]:h-4.5 [&_kbd]:min-w-4.5 [&_kbd]:rounded [&_kbd]:px-1 [&_kbd]:text-[10px]",
        className,
      )}
    >
      {steps.map((keys, i) => (
        <Fragment key={i}>
          {i > 0 && !compact && (
            <span className="text-[11px] text-muted-foreground">then</span>
          )}
          {keys.map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </Fragment>
      ))}
    </span>
  );
}

/** Cheat sheet opened with "?" (or from Settings). */
export function ShortcutsDialog() {
  const open = useUiStore((s) => s.shortcutsOpen);
  const setOpen = useUiStore((s) => s.setShortcutsOpen);
  const map = useShortcutMap();
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={setOpen}
      title="Keyboard shortcuts"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {SHORTCUT_GROUPS.map((group) => (
          <div key={group}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group}
            </p>
            <ul className="space-y-1.5">
              {SHORTCUT_ACTIONS.filter(
                (a) => a.group === group && map[a.id],
              ).map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="min-w-0 truncate">{a.label}</span>
                  <ShortcutKeys binding={map[a.id]} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-5 text-xs text-muted-foreground">
        Letter shortcuts are paused while you type in a field.{" "}
        <Link
          to="/settings"
          hash="shortcuts"
          className="font-medium text-primary"
          onClick={() => setOpen(false)}
        >
          Change shortcuts
        </Link>
      </p>
    </ResponsiveSheet>
  );
}

/** Records the next key press (or two, for a sequence) as a binding. */
function useRecorder(
  onDone: (binding: string | null) => void,
  active: boolean,
) {
  const [steps, setSteps] = useState<string[]>([]);
  useEffect(() => {
    if (!active) return;
    setSteps([]);
    let got: string[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (b: string | null) => {
      clearTimeout(timer);
      onDone(b);
    };
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape" && !got.length) return finish(null);
      const step = stepOf(e);
      if (!step) return;
      got = [...got, step];
      setSteps(got);
      // ⌘/Ctrl combos and a second key end it; otherwise wait briefly for one.
      if (got.length === 2 || step.startsWith("mod+"))
        return finish(got.join(" "));
      timer = setTimeout(() => finish(got.join(" ")), 900);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", onKey, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  return steps;
}

/**
 * Edits a full shortcut map. `base` is what "Reset" returns each action to
 * (the admin's defaults for a user, the built-in ones for the admin).
 * Bindings the OS or browser already use, and clashes, are flagged inline.
 */
export function ShortcutEditor({
  value,
  base,
  onChange,
}: {
  value: ShortcutMap;
  base: ShortcutMap;
  onChange: (next: ShortcutMap) => void;
}) {
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [error, setError] = useState<{
    id: ShortcutAction;
    message: string;
  } | null>(null);
  const problems = shortcutProblems(value);
  const steps = useRecorder((b) => {
    const id = recording;
    setRecording(null);
    if (!id || b === null) return;
    const bad = bindingProblem(b);
    if (bad) return setError({ id, message: bad });
    setError(null);
    onChange({ ...value, [id]: normalizeBinding(b) });
  }, recording !== null);

  return (
    <div className="space-y-5">
      {SHORTCUT_GROUPS.map((group) => (
        <div key={group}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {group}
          </p>
          <ul className="divide-y">
            {SHORTCUT_ACTIONS.filter((a) => a.group === group).map((a) => {
              const isRec = recording === a.id;
              const changed = value[a.id] !== base[a.id];
              const problem =
                (error?.id === a.id && error.message) || problems[a.id];
              return (
                <li key={a.id} className="py-2">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {a.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setRecording(isRec ? null : a.id);
                      }}
                      className={cn(
                        "min-w-28 rounded-lg border px-2 py-1 text-right transition-colors hover:bg-muted",
                        isRec && "border-primary ring-2 ring-primary/30",
                        problem && !isRec && "border-destructive",
                      )}
                      aria-label={`Change shortcut for ${a.label}`}
                    >
                      {isRec ? (
                        steps.length ? (
                          <ShortcutKeys binding={steps.join(" ")} />
                        ) : (
                          <span className="text-xs text-primary">
                            Press keys…
                          </span>
                        )
                      ) : (
                        <ShortcutKeys binding={value[a.id]} />
                      )}
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={!value[a.id]}
                      aria-label={`Turn off the shortcut for ${a.label}`}
                      title="No shortcut"
                      onClick={() => onChange({ ...value, [a.id]: "" })}
                    >
                      <X className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      disabled={!changed}
                      aria-label={`Reset the shortcut for ${a.label}`}
                      title="Reset"
                      onClick={() => {
                        setError(null);
                        onChange({ ...value, [a.id]: base[a.id] });
                      }}
                    >
                      <RotateCcw className="size-4" />
                    </Button>
                  </div>
                  {problem && (
                    <p className="mt-1 text-xs text-destructive">{problem}</p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Keyboard className="mt-0.5 size-4 shrink-0" />
        Click a shortcut and press the new keys. Use a single key, Shift + a
        key, or two keys in a row (like G then D). ⌘/Ctrl is only allowed with
        keys the browser doesn't use, such as Enter, K or /. Esc cancels.
      </p>
    </div>
  );
}
