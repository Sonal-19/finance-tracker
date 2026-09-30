/**
 * Native-app style "back closes the sheet".
 *
 * Every open sheet/dialog adds one history entry (same URL, marked with
 * `__sheet`). Pressing the phone/browser back button pops that entry and
 * closes the top-most sheet instead of leaving the page. When a sheet is
 * closed any other way (✕, swipe, save), its entry is removed again so
 * back keeps working normally.
 */

type Entry = { id: number; close: () => void };

const stack: Entry[] = [];
/** Our history entries currently on top of the history (open + already-closed). */
let depth = 0;
/** popstate events we caused ourselves and must ignore. */
let ignorePops = 0;
let nextId = 1;
let trimTimer: ReturnType<typeof setTimeout> | null = null;

const isOurs = () =>
  !!(window.history.state as { __sheet?: boolean } | null)?.__sheet;

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    if (ignorePops > 0) {
      ignorePops--;
      return;
    }
    depth = Math.max(0, depth - 1);
    stack.pop()?.close();
  });
}

/**
 * Drops history entries left by sheets that closed without the back button.
 * Deferred so a sheet that opens right after another closes (e.g. "Open
 * split" from a transaction) reuses the entry instead of racing history.back().
 */
function scheduleTrim() {
  if (trimTimer) clearTimeout(trimTimer);
  trimTimer = setTimeout(() => {
    trimTimer = null;
    const extra = depth - stack.length;
    if (extra <= 0) return;
    if (!isOurs()) {
      // The app navigated to another page meanwhile: our entries are buried, forget them.
      depth = stack.length;
      return;
    }
    ignorePops++;
    depth -= extra;
    window.history.go(-extra);
  }, 30);
}

/** Registers an open sheet. Returns a release function to call when it closes. */
export function pushBackHandler(close: () => void) {
  const entry: Entry = { id: nextId++, close };
  if (depth > stack.length && isOurs()) {
    // Reuse the entry of a sheet that just closed.
  } else {
    window.history.pushState({ ...window.history.state, __sheet: true }, "");
    depth++;
  }
  stack.push(entry);

  return () => {
    const i = stack.findIndex((e) => e.id === entry.id);
    if (i === -1) return; // already closed via the back button
    stack.splice(i, 1);
    scheduleTrim();
  };
}
