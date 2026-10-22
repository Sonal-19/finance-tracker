import { toast } from "sonner";
import type { TransferInput } from "@/hooks/use-accounts";
import type { Category, Txn, TxnInput } from "@/hooks/use-finance";
import type { SettlementInput, Split, SplitInput } from "@/hooks/use-splits";
import { queryClient as qc } from "@/integrations/tanstack-query/root-provider";
import { ApiError, api, call, callMsg } from "@/lib/api";
import { formatAmount } from "@/lib/format";
import { useBookStore } from "@/stores/book-store";
import { useDraftStore } from "@/stores/draft-store";
import { clearOfflineStore } from "./idb";
import {
  applyChange,
  buildSplit,
  buildTransfer,
  buildTxn,
  changeOf,
  findSplit,
  findTransfer,
  findTxn,
  overlayPending,
} from "./optimistic";
import {
  newTempId,
  type Op,
  type OpData,
  opTargetId,
  realId,
  useOutbox,
} from "./outbox";

/** Everything a synced change can move. */
const MONEY_KEYS = [
  "transactions",
  "reports",
  "budgets",
  "accounts",
  "events",
  "books",
  "splits",
  "people",
  "split-groups",
  "categories",
  "recurring",
];

const outbox = () => useOutbox.getState();
const uuid = () => crypto.randomUUID();

/* ============================== enqueue ============================== */

function push(data: OpData, label: string): Op {
  const op = {
    ...data,
    opId: uuid(),
    at: new Date().toISOString(),
    label,
    status: "pending",
  } as Op;
  outbox().update((ops) => [...ops, op]);
  scheduleFlush(0);
  return op;
}

/** A queued op on `id` that hasn't started sending, and can still be changed. */
function editable<K extends Op["kind"]>(kind: K, id: number) {
  const { ops, inFlight } = outbox();
  return ops.find(
    (o) =>
      o.kind === kind &&
      opTargetId(o) === id &&
      o.opId !== inFlight &&
      o.status === "pending",
  ) as Extract<Op, { kind: K }> | undefined;
}

/** The create of a row that only exists here (queued or refused, not being
 * sent right now): edits fold into it and a delete just drops it. */
function unsentCreate<K extends Op["kind"]>(kind: K, id: number) {
  if (id > 0) return undefined;
  const { ops, inFlight } = outbox();
  return ops.find(
    (o) => o.kind === kind && opTargetId(o) === id && o.opId !== inFlight,
  ) as Extract<Op, { kind: K }> | undefined;
}

function replaceOp(opId: string, patch: Partial<Op>) {
  outbox().update((ops) =>
    ops.map((o) => (o.opId === opId ? ({ ...o, ...patch } as Op) : o)),
  );
  scheduleFlush(0);
}

/** Drops every queued op about one local-only row (it never reached the server). */
function dropLocal(id: number) {
  outbox().update((ops) => ops.filter((o) => opTargetId(o) !== id));
}

const catName = (id: number | null | undefined) =>
  qc.getQueryData<Category[]>(["categories"])?.find((c) => c.id === id)?.name;

function txnLabel(b: TxnInput) {
  const amount =
    b.currency === "USD"
      ? `$${(b.amount / 100).toLocaleString("en-IN")}`
      : formatAmount(b.amount);
  const cat = catName(b.categoryId);
  return `${b.type === "credit" ? "Income" : "Expense"} ${amount}${cat ? ` · ${cat}` : ""}`;
}

/* ---- transactions ---- */

export function queueSaveTxn(
  input: TxnInput & { id?: number },
  files: File[] = [],
): Txn {
  const { id, ...body } = input;
  const label = txnLabel(body);
  if (id === undefined) {
    const op = push(
      { kind: "txn.create", tempId: newTempId(), body, files },
      `Add ${label.toLowerCase()}`,
    );
    const c = changeOf(qc, op)!;
    applyChange(qc, c);
    return c.next as Txn;
  }
  const shown = findTxn(qc, id);
  const pendingCreate = unsentCreate("txn.create", id);
  if (pendingCreate) {
    // Still only on this device: fold the edit into the create (and send a
    // refused one again with the fix).
    replaceOp(pendingCreate.opId, {
      body,
      files: [...(pendingCreate.files ?? []), ...files],
      label: `Add ${label.toLowerCase()}`,
      status: "pending",
      error: undefined,
    } as Partial<Op>);
    const next = buildTxn(qc, id, body, shown, pendingCreate.opId);
    applyChange(qc, { entity: "txn", prev: shown, next });
    return next;
  }
  const pendingEdit = editable("txn.update", id);
  const prev = pendingEdit?.prev ?? shown;
  if (!prev) throw new Error("This entry isn't loaded. Refresh and try again.");
  const next = buildTxn(qc, id, body, prev);
  if (pendingEdit)
    replaceOp(pendingEdit.opId, {
      body,
      files: [...(pendingEdit.files ?? []), ...files],
      at: new Date().toISOString(),
      label: `Edit ${label.toLowerCase()}`,
    } as Partial<Op>);
  else
    push(
      { kind: "txn.update", id, body, prev, files },
      `Edit ${label.toLowerCase()}`,
    );
  applyChange(qc, { entity: "txn", prev: shown ?? prev, next });
  return next;
}

export function queueDeleteTxn(id: number): Txn | null {
  const shown = findTxn(qc, id);
  const pendingEdit = editable("txn.update", id);
  if (unsentCreate("txn.create", id)) dropLocal(id);
  else {
    if (pendingEdit)
      outbox().update((ops) => ops.filter((o) => o.opId !== pendingEdit.opId));
    const prev = pendingEdit?.prev ?? shown;
    push(
      { kind: "txn.delete", id, prev },
      `Delete ${prev ? txnLabel(txnInputOf(prev)).toLowerCase() : "transaction"}`,
    );
  }
  if (shown) applyChange(qc, { entity: "txn", prev: shown, next: null });
  return shown;
}

/** A saved row back as the body that would recreate it (undo, "restore theirs"). */
export function txnInputOf(t: Txn): TxnInput {
  return {
    type: t.type,
    ...(t.originalCurrency === "USD" && t.originalAmount !== null
      ? {
          amount: t.originalAmount,
          currency: "USD" as const,
          fxRate: t.fxRate ?? undefined,
        }
      : { amount: t.amount }),
    categoryId: t.category.id,
    date: String(t.date).slice(0, 10),
    accountId: t.account.id,
    bookId: t.book.id,
    eventId: t.event?.id ?? null,
    note: t.note,
  };
}

/* ---- transfers ---- */

export function queueAddTransfer(body: TransferInput) {
  const tempId = newTempId();
  const next = buildTransfer(qc, tempId, body);
  push(
    { kind: "transfer.create", tempId, body },
    `Move ${formatAmount(body.amount)} from ${next.from.name} to ${next.to.name}`,
  );
  applyChange(qc, { entity: "transfer", prev: null, next });
  return next;
}

export function queueDeleteTransfer(id: number) {
  const prev = findTransfer(qc, id);
  if (unsentCreate("transfer.create", id)) dropLocal(id);
  else
    push(
      { kind: "transfer.delete", id, prev },
      `Delete transfer${prev ? ` of ${formatAmount(prev.amount)}` : ""}`,
    );
  if (prev) applyChange(qc, { entity: "transfer", prev, next: null });
}

/* ---- splits ---- */

export function queueSaveSplit(input: SplitInput & { id?: number }): Split {
  const { id, ...body } = input;
  const label = `${body.description.trim()} (${formatAmount(body.total)})`;
  if (id === undefined) {
    const tempId = newTempId();
    const next = buildSplit(qc, tempId, body);
    push({ kind: "split.create", tempId, body }, `Split ${label}`);
    applyChange(qc, { entity: "split", prev: null, next });
    return next;
  }
  const shown = findSplit(qc, id);
  const next = buildSplit(qc, id, body, shown);
  const pendingCreate = unsentCreate("split.create", id);
  const pendingEdit = editable("split.update", id);
  if (pendingCreate)
    replaceOp(pendingCreate.opId, {
      body,
      label: `Split ${label}`,
      status: "pending",
      error: undefined,
    } as Partial<Op>);
  else if (pendingEdit)
    replaceOp(pendingEdit.opId, {
      body,
      at: new Date().toISOString(),
      label: `Edit split ${label}`,
    } as Partial<Op>);
  else
    push(
      { kind: "split.update", id, body, prev: shown },
      `Edit split ${label}`,
    );
  applyChange(qc, { entity: "split", prev: shown, next });
  return next;
}

export function queueDeleteSplit(id: number) {
  const shown = findSplit(qc, id);
  const pendingEdit = editable("split.update", id);
  if (unsentCreate("split.create", id)) dropLocal(id);
  else {
    if (pendingEdit)
      outbox().update((ops) => ops.filter((o) => o.opId !== pendingEdit.opId));
    push(
      { kind: "split.delete", id, prev: pendingEdit?.prev ?? shown },
      `Delete split${shown ? ` ${shown.description}` : ""}`,
    );
  }
  if (shown) applyChange(qc, { entity: "split", prev: shown, next: null });
}

/* ---- settlements ---- */

export function queueAddSettlement(body: SettlementInput, personName?: string) {
  push(
    { kind: "settlement.create", tempId: newTempId(), body },
    body.direction === "received"
      ? `${formatAmount(body.amount)} received${personName ? ` from ${personName}` : ""}`
      : `${formatAmount(body.amount)} paid${personName ? ` to ${personName}` : ""}`,
  );
}

export function queueDeleteSettlement(id: number) {
  if (unsentCreate("settlement.create", id)) dropLocal(id);
  else push({ kind: "settlement.delete", id }, "Remove a recorded payment");
}

/* ============================== sending ============================== */

/** Thrown when an op's target was made offline and its create hasn't synced. */
class Blocked extends Error {}

function target(id: number) {
  const real = realId(id);
  if (real === null)
    throw new Blocked("Waiting for the entry it changes to be saved first");
  return real;
}

/** Conflict check for an edit: the version it started from is the newer of
 * the row it was made on and this device's own last confirmed write (a
 * second edit made before the first one's refetch landed is still ours). */
function editMeta(op: Op, entity: "txn" | "split", id: number, seen?: string) {
  const own = outbox().confirmed[`${entity}:${id}`];
  const base =
    own && (!seen || new Date(own).getTime() > new Date(seen).getTime())
      ? own
      : seen;
  return op.force || !base ? {} : { baseUpdatedAt: base, editedAt: op.at };
}

/** Remembers the version the server gave a write this device made. */
function rememberVersion(
  entity: "txn" | "split",
  id: number,
  updatedAt: unknown,
) {
  if (!updatedAt) return;
  useOutbox.setState((s) => ({
    confirmed: { ...s.confirmed, [`${entity}:${id}`]: String(updatedAt) },
  }));
}

/** Sends one op. Returns follow-up ops to run next (e.g. file uploads). */
async function send(op: Op): Promise<OpData | null> {
  switch (op.kind) {
    case "txn.create": {
      const { data } = await callMsg(
        api.transactions.post({ ...op.body, clientId: op.opId }),
      );
      mapId(op.tempId, data!.id);
      rememberVersion("txn", data!.id, data!.updatedAt);
      return op.files?.length
        ? { kind: "txn.files", id: data!.id, files: op.files }
        : null;
    }
    case "txn.update": {
      const id = target(op.id);
      const { data } = await callMsg(
        api.transactions({ id }).patch({
          ...op.body,
          ...editMeta(op, "txn", id, String(op.prev.updatedAt)),
        }),
      );
      rememberVersion("txn", id, data?.updatedAt);
      if (data?.replaced) conflictReplaced(op, data.replaced as Txn);
      return op.files?.length
        ? { kind: "txn.files", id, files: op.files }
        : null;
    }
    case "txn.delete":
      await ignore404(() =>
        call(api.transactions({ id: target(op.id) }).delete()),
      );
      return null;
    case "txn.files": {
      const id = target(op.id);
      const left = [...op.files];
      while (left.length) {
        try {
          await call(
            api.attachments.post({ transactionId: id, file: left[0]! }),
          );
        } catch (e) {
          if (e instanceof ApiError && e.isNetwork) {
            replaceOp(op.opId, { files: left } as Partial<Op>);
            throw e;
          }
          toast.error(`${left[0]!.name}: ${(e as Error).message}`);
        }
        left.shift();
      }
      return null;
    }
    case "transfer.create": {
      const data = await call(
        api.transfers.post({ ...op.body, clientId: op.opId }),
      );
      if (data?.id) mapId(op.tempId, data.id);
      return null;
    }
    case "transfer.delete":
      await ignore404(() =>
        call(api.transfers({ id: target(op.id) }).delete()),
      );
      return null;
    case "split.create": {
      const { fromTransactionId, ...body } = op.body;
      const data = await call(
        api.splits.post({
          ...body,
          ...(fromTransactionId && {
            fromTransactionId: target(fromTransactionId),
          }),
          clientId: op.opId,
        }),
      );
      if (data?.id) {
        mapId(op.tempId, data.id);
        rememberVersion("split", data.id, data.updatedAt);
      }
      return null;
    }
    case "split.update": {
      const id = target(op.id);
      const { fromTransactionId: _f, ...body } = op.body;
      const data = await call(
        api.splits({ id }).put({
          ...body,
          ...editMeta(
            op,
            "split",
            id,
            op.prev ? String(op.prev.updatedAt) : undefined,
          ),
        }),
      );
      rememberVersion("split", id, data?.updatedAt);
      if (data?.replaced)
        toast.info("Your edit replaced a change made on another device", {
          description: op.label,
        });
      return null;
    }
    case "split.delete":
      await ignore404(() => call(api.splits({ id: target(op.id) }).delete()));
      return null;
    case "settlement.create": {
      const data = await call(
        api.settlements.post({ ...op.body, clientId: op.opId }),
      );
      if (data?.id) mapId(op.tempId, data.id);
      return null;
    }
    case "settlement.delete":
      await ignore404(() =>
        call(api.settlements({ id: target(op.id) }).delete()),
      );
      return null;
  }
}

function mapId(tempId: number, id: number) {
  useOutbox.setState((s) => ({ idMap: { ...s.idMap, [tempId]: id } }));
}

/** Already gone on the server is what a delete wanted anyway. */
async function ignore404(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 404)) throw e;
  }
}

/** This edit won (it was made later), but say what it replaced. */
function conflictReplaced(
  op: Extract<Op, { kind: "txn.update" }>,
  theirs: Txn,
) {
  toast.info("Your edit replaced a newer change from another device", {
    description: op.label,
    duration: 12_000,
    action: {
      label: "Restore theirs",
      onClick: () => {
        const restore = queueSaveTxn({ ...txnInputOf(theirs), id: theirs.id });
        outbox().update((ops) =>
          ops.map((o) =>
            o.kind === "txn.update" && o.id === restore.id
              ? { ...o, force: true }
              : o,
          ),
        );
      },
    },
  });
}

/** A newer change from elsewhere was kept; offer to apply this one anyway. */
function conflictStale(op: Op) {
  toast.warning("Kept a newer change made on another device", {
    description: op.label,
    duration: 12_000,
    action: {
      label: "Use mine",
      onClick: () => {
        outbox().update((ops) => [
          ...ops,
          {
            ...op,
            opId: uuid(),
            force: true,
            status: "pending",
            error: undefined,
          },
        ]);
        scheduleFlush(0);
      },
    },
  });
}

/* =============================== engine =============================== */

let running = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let backoff = 2_000;

export function scheduleFlush(delay = backoff) {
  clearTimeout(timer);
  timer = setTimeout(() => void flush(), delay);
}

/** Sends queued ops one by one, in order, until the queue is empty or the
 * network drops. Order matters: an edit can depend on an earlier create. */
export async function flush() {
  const s = outbox();
  if (running || !s.hydrated) return;
  if (!navigator.onLine) {
    s.set({ online: false });
    return;
  }
  running = true;
  s.set({ syncing: true });
  let sent = 0;
  try {
    for (;;) {
      const op = outbox().ops.find((o) => o.status === "pending");
      if (!op) break;
      outbox().set({ inFlight: op.opId });
      try {
        const follow = await send(op);
        sent++;
        outbox().set({ online: true });
        outbox().update((ops) =>
          follow
            ? ops.map((o) =>
                o.opId === op.opId
                  ? ({
                      ...follow,
                      opId: uuid(),
                      at: op.at,
                      label: `Attach files to: ${op.label}`,
                      status: "pending",
                    } as Op)
                  : o,
              )
            : ops.filter((o) => o.opId !== op.opId),
        );
        backoff = 2_000;
      } catch (e) {
        const err = e as ApiError | Error;
        if (err instanceof ApiError && err.isNetwork) {
          // Offline or the server is down: keep everything, try again later.
          outbox().set({ online: false });
          backoff = Math.min(backoff * 2, 60_000);
          scheduleFlush();
          return;
        }
        if (err instanceof ApiError && err.status === 409) {
          outbox().update((ops) => ops.filter((o) => o.opId !== op.opId));
          conflictStale(op);
          sent++;
          continue;
        }
        // The server refused it (validation, deleted category…): park it for
        // the user to retry or discard, and carry on with the rest.
        outbox().update((ops) =>
          ops.map((o) =>
            o.opId === op.opId
              ? { ...o, status: "failed", error: err.message }
              : o,
          ),
        );
        if (!(err instanceof Blocked))
          toast.error(`Couldn't save: ${op.label}`, {
            description: err.message,
            duration: 10_000,
          });
      }
    }
  } finally {
    running = false;
    outbox().set({ syncing: false, inFlight: null, confirmed: stillNeeded() });
  }
  if (sent || !outbox().lastSyncedAt) await refresh();
}

/** Confirmed versions are only needed while the cache may still show an
 * older copy: keep the latest few hundred. */
function stillNeeded() {
  const entries = Object.entries(outbox().confirmed);
  return entries.length > 300
    ? Object.fromEntries(
        entries.sort(([, a], [, b]) => b.localeCompare(a)).slice(0, 300),
      )
    : outbox().confirmed;
}

/** Pulls fresh data for everything on screen (after pushing changes). */
export async function refresh() {
  await Promise.all([
    ...MONEY_KEYS.map((k) => qc.invalidateQueries({ queryKey: [k] })),
    // App-wide settings (shortcut defaults, notice) the admin may have changed,
    // and the user's own (theme, shortcuts) from their other devices.
    qc.invalidateQueries({ queryKey: ["auth", "config"] }),
    qc.invalidateQueries({ queryKey: ["profile", "config"] }),
  ]);
  if (!outbox().ops.some((o) => o.status === "pending"))
    outbox().set({ lastSyncedAt: Date.now() });
}

/** Push then pull: the "Sync now" button. */
export async function syncNow() {
  await flush();
  if (navigator.onLine) await refresh();
}

export function retryOp(opId: string) {
  replaceOp(opId, { status: "pending", error: undefined });
  // Ops parked only because they waited on this one go again too.
  outbox().update((ops) =>
    ops.map((o) =>
      o.status === "failed" && o.error?.startsWith("Waiting")
        ? { ...o, status: "pending", error: undefined }
        : o,
    ),
  );
  void flush();
}

/** Throws a queued change away and puts the screens back to server data. */
export function discardOp(opId: string) {
  const op = outbox().ops.find((o) => o.opId === opId);
  if (!op) return;
  const id = opTargetId(op);
  outbox().update((ops) =>
    ops.filter(
      (o) =>
        o.opId !== opId &&
        !(id !== null && id < 0 && "tempId" in op && opTargetId(o) === id),
    ),
  );
  void refresh();
}

let started = false;

/** Starts the engine once: sync on load, when the connection returns, when
 * the tab comes back, and every 30s while anything is waiting. */
export function startSync() {
  if (started) return;
  started = true;

  // Fresh server data has pending local changes replayed on top of it.
  qc.getQueryCache().subscribe((event) => {
    if (event.type !== "updated") return;
    // "Online" means the server answers, not just that there's a network.
    const { action } = event;
    if (action.type === "error") {
      if (
        action.error instanceof ApiError &&
        action.error.isNetwork &&
        outbox().online
      ) {
        outbox().set({ online: false });
        scheduleFlush();
      }
      return;
    }
    if (action.type !== "success" || action.manual) return;
    if (!outbox().online) outbox().set({ online: true });
    const { ops, inFlight } = outbox();
    const pending = ops.filter((o) => o.opId !== inFlight);
    if (pending.length) {
      const q = event.query;
      const next = overlayPending(qc, q.queryKey, q.state.data, pending);
      if (next !== q.state.data) qc.setQueryData(q.queryKey, next);
    } else if (!outbox().syncing) outbox().set({ lastSyncedAt: Date.now() });
  });

  const online = () => {
    outbox().set({ online: true });
    backoff = 2_000;
    void syncNow();
  };
  window.addEventListener("online", online);
  window.addEventListener("offline", () => outbox().set({ online: false }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && outbox().ops.length)
      void flush();
  });
  setInterval(() => {
    if (outbox().ops.some((o) => o.status === "pending")) void flush();
  }, 30_000);

  const go = () => void flush();
  if (outbox().hydrated) go();
  else {
    const unsub = useOutbox.subscribe((s) => {
      if (s.hydrated) {
        unsub();
        go();
      }
    });
  }
}

/** Unsynced changes, for the logout warning. */
export const pendingCount = () => outbox().ops.length;

/* ============================ device data ============================ */

/** Everything kept on this device that belongs to whoever is signed in:
 * half-filled forms and the picked book. */
function resetPerUserStores(ownerId: number | null) {
  useDraftStore.setState({ drafts: {}, ownerId });
  useBookStore.setState({ bookId: null });
}

/** Resolves once the stores kept in IndexedDB have loaded, so the owner
 * check below compares against the saved owner, not the empty default. */
const hydrated = () =>
  Promise.all(
    [useOutbox, useDraftStore].map(
      (store) =>
        new Promise<void>((resolve) => {
          if (store.persist.hasHydrated()) resolve();
          else {
            const unsub = store.persist.onFinishHydration(() => {
              unsub();
              resolve();
            });
          }
        }),
    ),
  );

/** Called with the logged-in user: data kept for someone else is dropped. */
export async function claimDevice(userId: number) {
  await hydrated();
  const { ownerId } = outbox();
  const draftOwner = useDraftStore.getState().ownerId;
  if (draftOwner !== userId) {
    // Drafts saved before they had an owner belong to this device's user.
    if (draftOwner === null && ownerId === userId)
      useDraftStore.setState({ ownerId: userId });
    else resetPerUserStores(userId);
  }
  if (ownerId === userId) return;
  if (ownerId !== null) {
    useOutbox.setState({
      ops: [],
      idMap: {},
      confirmed: {},
      lastSyncedAt: null,
    });
    qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth" });
  }
  useOutbox.setState({ ownerId: userId });
}

/** Logout: nothing about this account stays on the device. */
export async function forgetDevice() {
  useOutbox.setState({
    ops: [],
    idMap: {},
    confirmed: {},
    ownerId: null,
    lastSyncedAt: null,
  });
  resetPerUserStores(null);
  qc.clear();
  await clearOfflineStore();
}
