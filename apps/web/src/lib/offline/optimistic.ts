import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type {
  Account,
  AppEvent,
  Transfer,
  TransferInput,
} from "@/hooks/use-accounts";
import type { Book } from "@/hooks/use-books";
import type { Category, Txn, TxnInput, TxnSummary } from "@/hooks/use-finance";
import type { Person, Split, SplitGroup, SplitInput } from "@/hooks/use-splits";
import { previewShares } from "@/lib/split";
import type { Op, SyncMark } from "./outbox";

// Pure functions that put a local change into the cached server responses,
// so lists, totals and balances update the moment the user saves. The same
// functions replay still-pending changes on top of fresh server data
// (`overlayPending`), so a refetch never hides work that hasn't synced yet.

type AccountsData = {
  accounts: Account[];
  total: number;
  assets: number;
  liabilities: number;
};
type TxnPage = {
  items: Txn[];
  hasMore: boolean;
  totals: { count: number; income: number; expense: number };
  dayTotals: Record<string, { income: number; expense: number }>;
};
type Infinite<T> = { pages: T[]; pageParams: unknown[] };
type Filters = Record<string, unknown> | undefined;

const nowIso = () => new Date().toISOString();

/* ------------------------------ builders ------------------------------ */

/** A transaction row as the server would return it, from cached lookups. */
export function buildTxn(
  qc: QueryClient,
  id: number,
  body: TxnInput,
  base?: Txn | null,
  clientId?: string,
): Txn & SyncMark {
  const categories = qc.getQueryData<Category[]>(["categories"]) ?? [];
  const accounts = qc.getQueryData<AccountsData>(["accounts"])?.accounts ?? [];
  const books = qc.getQueryData<Book[]>(["books"]) ?? [];
  const events = qc.getQueryData<AppEvent[]>(["events"]) ?? [];

  const cat = categories.find((c) => c.id === body.categoryId);
  const activeAccounts = accounts.filter((a) => a.status === "active");
  const account =
    accounts.find((a) => a.id === body.accountId) ??
    (body.accountId === undefined
      ? (activeAccounts.find((a) => a.defaultSince) ?? activeAccounts[0])
      : undefined);
  const activeBooks = books.filter((b) => b.status === "active");
  const book =
    books.find((b) => b.id === body.bookId) ??
    (body.bookId === undefined
      ? (activeBooks.find((b) => b.defaultSince) ?? activeBooks[0])
      : undefined);
  const event = body.eventId
    ? events.find((e) => e.id === body.eventId)
    : undefined;

  const foreign = body.currency && body.currency !== "INR";
  const rate = foreign
    ? (body.fxRate ?? cachedFxRate(qc, body.date) ?? base?.fxRate ?? 0)
    : null;

  return {
    id,
    type: body.type,
    amount: foreign ? Math.round(body.amount * (rate ?? 0)) : body.amount,
    date: body.date,
    note: body.note?.trim() || null,
    originalAmount: foreign ? body.amount : null,
    originalCurrency: foreign ? (body.currency ?? null) : null,
    fxRate: rate,
    recurringId: base?.recurringId ?? null,
    splitId: base?.splitId ?? null,
    sharedSplitId: base?.sharedSplitId ?? null,
    createdAt: base?.createdAt ?? nowIso(),
    // The server's version this edit started from, never this device's clock:
    // it's the base the next edit's conflict check is sent with.
    updatedAt: base?.updatedAt ?? nowIso(),
    clientId: base?.clientId ?? clientId ?? null,
    attachmentCount: base?.attachmentCount ?? 0,
    category: cat
      ? { id: cat.id, name: cat.name, icon: cat.icon, color: cat.color }
      : (base?.category ?? {
          id: body.categoryId,
          name: "…",
          icon: "circle",
          color: "#94a3b8",
        }),
    account: account
      ? {
          id: account.id,
          name: account.name,
          icon: account.icon,
          color: account.color,
        }
      : (base?.account ?? {
          id: body.accountId ?? 0,
          name: "…",
          icon: "wallet",
          color: "#94a3b8",
        }),
    book: book
      ? {
          id: book.id,
          name: book.name,
          icon: book.icon,
          color: book.color,
          totals: book.totals,
        }
      : (base?.book ?? {
          id: body.bookId ?? 0,
          name: "…",
          icon: "book",
          color: "#94a3b8",
          totals: "included",
        }),
    event: event
      ? { id: event.id, name: event.name, icon: event.icon, color: event.color }
      : null,
    _sync: "pending",
  } as unknown as Txn & SyncMark;
}

/** Best known USD→INR rate for a date while offline. */
function cachedFxRate(qc: QueryClient, date: string): number | null {
  const exact = qc.getQueryData<{ rate: number }>(["fx", "USD", date]);
  if (exact) return exact.rate;
  const any = qc
    .getQueriesData<{ rate: number }>({ queryKey: ["fx", "USD"] })
    .find(([, d]) => d?.rate)?.[1];
  return any?.rate ?? null;
}

export function buildTransfer(
  qc: QueryClient,
  id: number,
  body: TransferInput,
): Transfer & SyncMark {
  const accounts = qc.getQueryData<AccountsData>(["accounts"])?.accounts ?? [];
  const pick = (aid: number) => {
    const a = accounts.find((x) => x.id === aid);
    return a
      ? { id: a.id, name: a.name, icon: a.icon, color: a.color }
      : { id: aid, name: "…", icon: "wallet", color: "#94a3b8" };
  };
  return {
    id,
    amount: body.amount,
    date:
      body.date ??
      new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
    note: body.note?.trim() || null,
    from: pick(body.fromAccountId),
    to: pick(body.toAccountId),
    _sync: "pending",
  } as Transfer & SyncMark;
}

export function buildSplit(
  qc: QueryClient,
  id: number,
  body: SplitInput,
  base?: Split | null,
): Split & SyncMark {
  const categories = qc.getQueryData<Category[]>(["categories"]) ?? [];
  const groups = qc.getQueryData<SplitGroup[]>(["split-groups"]) ?? [];
  const people = qc.getQueryData<Person[]>(["people"]) ?? [];
  const cat = categories.find((c) => c.id === body.categoryId);
  const group = groups.find((g) => g.id === body.groupId);
  const payer = people.find((p) => p.id === body.paidByPersonId);
  const keyOf = (pid: number | null) => (pid === null ? "me" : String(pid));
  const { amounts } = previewShares(
    body.total,
    body.method,
    body.participants.map((p) => ({
      key: keyOf(p.personId),
      value: p.value ?? 0,
    })),
  );
  const myShare = amounts.me ?? 0;
  return {
    id,
    description: body.description.trim(),
    date: body.date,
    total: body.total,
    method: body.method,
    note: body.note?.trim() || null,
    ownShare: body.ownShare,
    accountId: body.accountId ?? null,
    eventId: body.eventId ?? null,
    bookId: body.bookId ?? null,
    clientId: base?.clientId ?? null,
    updatedAt: base?.updatedAt ?? nowIso(),
    category: cat
      ? { id: cat.id, name: cat.name, icon: cat.icon, color: cat.color }
      : null,
    group: group
      ? { id: group.id, name: group.name, icon: group.icon, color: group.color }
      : null,
    paidBy: payer ? { id: payer.id, name: payer.name } : null,
    myShare,
    myEffect: payer ? -myShare : body.total - myShare,
    shares: body.participants.map((p) => ({
      personId: p.personId,
      name:
        p.personId === null
          ? "You"
          : (people.find((x) => x.id === p.personId)?.name ?? "?"),
      amount: amounts[keyOf(p.personId)] ?? 0,
      value: p.value ?? null,
    })),
    _sync: "pending",
  } as unknown as Split & SyncMark;
}

/* --------------------------- transactions --------------------------- */

/** Client copy of the server's `txnWhere` for one row. */
function matches(t: Txn, f: Filters) {
  if (!f) return true;
  if (f.type && t.type !== f.type) return false;
  if (f.categoryIds) {
    const ids = String(f.categoryIds).split(",").map(Number);
    if (!ids.includes(t.category.id)) return false;
  }
  if (f.accountId && t.account.id !== Number(f.accountId)) return false;
  if (f.bookId && t.book.id !== Number(f.bookId)) return false;
  if (f.eventId !== undefined && f.eventId !== null) {
    const e = Number(f.eventId);
    if (e === 0 ? t.event !== null : t.event?.id !== e) return false;
  }
  const day = String(t.date).slice(0, 10);
  if (f.from && day < String(f.from)) return false;
  if (f.to && day > String(f.to)) return false;
  if (f.minAmount !== undefined && t.amount < Number(f.minAmount)) return false;
  if (f.maxAmount !== undefined && t.amount > Number(f.maxAmount)) return false;
  if (typeof f.q === "string" && f.q.trim()) {
    const q = f.q.trim().toLowerCase();
    if (
      !(t.note ?? "").toLowerCase().includes(q) &&
      !t.category.name.toLowerCase().includes(q)
    )
      return false;
  }
  return true;
}

const sides = (t: Txn | null, sign: number) =>
  t
    ? {
        income: t.type === "credit" ? sign * t.amount : 0,
        expense: t.type === "debit" ? sign * t.amount : 0,
      }
    : { income: 0, expense: 0 };

/** Newest first; rows made offline (negative ids) lead their day. */
function before(a: Txn, b: Txn) {
  const da = String(a.date).slice(0, 10);
  const db = String(b.date).slice(0, 10);
  if (da !== db) return da > db;
  const ia = a.id < 0 ? Number.MAX_SAFE_INTEGER - a.id : a.id;
  const ib = b.id < 0 ? Number.MAX_SAFE_INTEGER - b.id : b.id;
  return ia > ib;
}

function addDay(
  days: Record<string, { income: number; expense: number }>,
  t: Txn | null,
  sign: number,
  onlyExisting: boolean,
) {
  if (!t) return days;
  const day = String(t.date).slice(0, 10);
  if (onlyExisting && !days[day]) return days;
  const d = days[day] ?? { income: 0, expense: 0 };
  const s = sides(t, sign);
  return {
    ...days,
    [day]: { income: d.income + s.income, expense: d.expense + s.expense },
  };
}

/** Moves one row from `prev` to `next` inside one page of a list (either
 * may be null for a create or delete). `first` = it's the list's first page,
 * `last` = nothing is loaded after it. */
function patchPage(
  page: TxnPage,
  f: Filters,
  prev: Txn | null,
  next: Txn | null,
  where: { first: boolean; last: boolean },
): TxnPage {
  const was = prev && matches(prev, f) ? prev : null;
  const now = next && matches(next, f) ? next : null;
  const id = prev?.id ?? next?.id;
  let items = page.items.filter((i) => i.id !== id);
  const removed = items.length !== page.items.length;
  let dayTotals = page.dayTotals;
  if (removed && was) dayTotals = addDay(dayTotals, was, -1, true);
  if (now) {
    const lastItem = items.at(-1);
    // Only place it when it belongs inside the loaded range of this page.
    const fits =
      (where.first || removed) &&
      (where.last || !page.hasMore || !lastItem || before(now, lastItem));
    if (fits) {
      const i = items.findIndex((x) => before(now, x));
      items =
        i === -1
          ? [...items, now]
          : [...items.slice(0, i), now, ...items.slice(i)];
      dayTotals = addDay(dayTotals, now, 1, false);
    }
  }
  const a = sides(was, -1);
  const b = sides(now, 1);
  return {
    ...page,
    items,
    dayTotals,
    totals: {
      count: page.totals.count - (was ? 1 : 0) + (now ? 1 : 0),
      income: page.totals.income + a.income + b.income,
      expense: page.totals.expense + a.expense + b.expense,
    },
  };
}

function patchSummary(
  s: TxnSummary,
  f: Filters,
  prev: Txn | null,
  next: Txn | null,
): TxnSummary {
  let out = s;
  for (const [t, sign] of [
    [prev && matches(prev, f) ? prev : null, -1],
    [next && matches(next, f) ? next : null, 1],
  ] as const) {
    if (!t) continue;
    const v = sides(t, sign);
    const day = String(t.date).slice(0, 10);
    const days = out.days.some((d) => d.date === day)
      ? out.days.map((d) =>
          d.date === day
            ? {
                ...d,
                income: d.income + v.income,
                expense: d.expense + v.expense,
              }
            : d,
        )
      : [...out.days, { date: day, income: v.income, expense: v.expense }].sort(
          (x, y) => x.date.localeCompare(y.date),
        );
    const has = out.categories.some(
      (c) => c.id === t.category.id && c.type === t.type,
    );
    const categories = (
      has
        ? out.categories.map((c) =>
            c.id === t.category.id && c.type === t.type
              ? {
                  ...c,
                  total: c.total + sign * t.amount,
                  count: c.count + sign,
                }
              : c,
          )
        : [
            ...out.categories,
            { ...t.category, type: t.type, total: t.amount, count: 1 },
          ]
    )
      .filter((c) => c.count > 0)
      .sort((x, y) => y.total - x.total);
    out = {
      ...out,
      totals: {
        count: out.totals.count + sign,
        income: out.totals.income + v.income,
        expense: out.totals.expense + v.expense,
      },
      days,
      categories,
    };
  }
  return out;
}

function patchAccountBalances(
  data: AccountsData,
  deltas: Map<number, number>,
): AccountsData {
  if (![...deltas.values()].some(Boolean)) return data;
  const accounts = data.accounts.map((a) =>
    deltas.get(a.id)
      ? { ...a, balance: a.balance + (deltas.get(a.id) ?? 0) }
      : a,
  );
  const active = accounts.filter((a) => a.status === "active");
  return {
    ...data,
    accounts,
    total: active.reduce((s, a) => s + a.balance, 0),
    assets: active
      .filter((a) => a.balance > 0)
      .reduce((s, a) => s + a.balance, 0),
    liabilities: -active
      .filter((a) => a.balance < 0)
      .reduce((s, a) => s + a.balance, 0),
  };
}

function txnBalanceDeltas(prev: Txn | null, next: Txn | null) {
  const d = new Map<number, number>();
  const add = (t: Txn | null, sign: number) => {
    if (!t) return;
    const v = t.type === "credit" ? t.amount : -t.amount;
    d.set(t.account.id, (d.get(t.account.id) ?? 0) + sign * v);
  };
  add(prev, -1);
  add(next, 1);
  return d;
}

function transferBalanceDeltas(prev: Transfer | null, next: Transfer | null) {
  const d = new Map<number, number>();
  const add = (t: Transfer | null, sign: number) => {
    if (!t) return;
    d.set(t.from.id, (d.get(t.from.id) ?? 0) - sign * t.amount);
    d.set(t.to.id, (d.get(t.to.id) ?? 0) + sign * t.amount);
  };
  add(prev, -1);
  add(next, 1);
  return d;
}

function patchBalancesQuery(
  key: QueryKey,
  data: unknown,
  deltas: Map<number, number>,
) {
  if (key[0] !== "accounts") return data;
  if (key.length === 1)
    return patchAccountBalances(data as AccountsData, deltas);
  // One account's page: ["accounts", id]
  if (typeof key[1] === "number") {
    const a = data as Account;
    const d = deltas.get(a.id);
    return d ? { ...a, balance: a.balance + d } : data;
  }
  return data;
}

/** One cached query's data after a transaction goes from `prev` to `next`. */
export function patchTxnQuery(
  key: QueryKey,
  data: unknown,
  prev: Txn | null,
  next: Txn | null,
): unknown {
  if (data === undefined) return data;
  if (key[0] === "accounts")
    return patchBalancesQuery(key, data, txnBalanceDeltas(prev, next));
  if (key[0] !== "transactions") return data;
  if (key[1] === "summary")
    return patchSummary(data as TxnSummary, key[2] as Filters, prev, next);
  if (key[1] === "page") {
    const page = data as TxnPage;
    return patchPage(page, key[2] as Filters, prev, next, {
      first: key[3] === 1,
      last: !page.hasMore,
    });
  }
  const inf = data as Infinite<TxnPage>;
  if (!inf.pages) return data;
  const f = key[1] as Filters;
  // Totals are filter-wide, so every page carries the same ones.
  return {
    ...inf,
    pages: inf.pages.map((p, i) => {
      const patched = patchPage(p, f, prev, next, {
        first: i === 0,
        last: i === inf.pages.length - 1,
      });
      // Keep the row on only one page.
      if (
        i > 0 &&
        next &&
        inf.pages.slice(0, i).some((q) => q.items.some((x) => x.id === next.id))
      )
        return {
          ...patched,
          items: patched.items.filter((x) => x.id !== next.id),
        };
      return patched;
    }),
  };
}

const time = (d: unknown) => new Date(String(d)).getTime() || 0;

/** The freshest cached copy of a transaction, to find what an edit or delete
 * replaces. Lists that aren't on screen aren't refetched after a sync, so
 * they can hold an older copy: the newest `updatedAt` wins. */
export function findTxn(qc: QueryClient, id: number): Txn | null {
  let best: Txn | null = null;
  for (const [, data] of qc.getQueriesData<unknown>({
    queryKey: ["transactions"],
  })) {
    const pages =
      (data as Infinite<TxnPage>)?.pages ??
      ((data as TxnPage)?.items ? [data as TxnPage] : []);
    for (const p of pages) {
      const hit = p.items.find((t) => t.id === id);
      if (hit && (!best || time(hit.updatedAt) > time(best.updatedAt)))
        best = hit;
    }
  }
  return best;
}

/* ----------------------------- transfers ----------------------------- */

export function patchTransferQuery(
  key: QueryKey,
  data: unknown,
  prev: Transfer | null,
  next: Transfer | null,
) {
  if (data === undefined || key[0] !== "accounts") return data;
  if (key[1] !== "transfers")
    return patchBalancesQuery(key, data, transferBalanceDeltas(prev, next));
  const list = data as Transfer[];
  const id = prev?.id ?? next?.id;
  const rest = list.filter((t) => t.id !== id);
  const scope = key[2];
  if (
    next &&
    (scope === "all" || next.from.id === scope || next.to.id === scope)
  )
    return [next, ...rest];
  return rest;
}

export function findTransfer(qc: QueryClient, id: number): Transfer | null {
  for (const [, data] of qc.getQueriesData<Transfer[]>({
    queryKey: ["accounts", "transfers"],
  })) {
    const hit = data?.find((t) => t.id === id);
    if (hit) return hit;
  }
  return null;
}

/* ------------------------------- splits ------------------------------- */

export function patchSplitQuery(
  key: QueryKey,
  data: unknown,
  prev: Split | null,
  next: Split | null,
) {
  if (data === undefined || key[0] !== "splits") return data;
  const id = prev?.id ?? next?.id;
  if (key[1] === "list") {
    const list = data as Split[];
    const i = list.findIndex((s) => s.id === id);
    if (!next) return list.filter((s) => s.id !== id);
    if (i >= 0) return list.map((s) => (s.id === id ? next : s));
    return [next, ...list];
  }
  if (key[1] === id && next) return next;
  return data;
}

export function findSplit(qc: QueryClient, id: number): Split | null {
  const detail = qc.getQueryData<Split>(["splits", id]);
  const listed =
    qc.getQueryData<Split[]>(["splits", "list"])?.find((s) => s.id === id) ??
    null;
  if (!detail || !listed) return detail ?? listed;
  return time(listed.updatedAt) > time(detail.updatedAt) ? listed : detail;
}

/* ------------------------------ applying ------------------------------ */

type Change =
  | { entity: "txn"; prev: Txn | null; next: Txn | null }
  | { entity: "transfer"; prev: Transfer | null; next: Transfer | null }
  | { entity: "split"; prev: Split | null; next: Split | null };

const PREFIX = {
  txn: ["transactions", "accounts"],
  transfer: ["accounts"],
  split: ["splits"],
};

function patchQuery(key: QueryKey, data: unknown, c: Change) {
  if (c.entity === "txn") return patchTxnQuery(key, data, c.prev, c.next);
  if (c.entity === "transfer")
    return patchTransferQuery(key, data, c.prev, c.next);
  return patchSplitQuery(key, data, c.prev, c.next);
}

/** Applies a change to every cached query it touches. */
export function applyChange(qc: QueryClient, c: Change) {
  for (const root of PREFIX[c.entity])
    for (const [key, data] of qc.getQueriesData<unknown>({
      queryKey: [root],
    })) {
      const next = patchQuery(key, data, c);
      if (next !== data) qc.setQueryData(key, next);
    }
}

/** The change an op makes relative to the server's state (its `prev`). */
export function changeOf(qc: QueryClient, op: Op): Change | null {
  switch (op.kind) {
    case "txn.create":
      return {
        entity: "txn",
        prev: null,
        next: buildTxn(qc, op.tempId, op.body, null, op.opId),
      };
    case "txn.update":
      return {
        entity: "txn",
        prev: op.prev,
        next: buildTxn(qc, op.id, op.body, op.prev),
      };
    case "txn.delete":
      return op.prev ? { entity: "txn", prev: op.prev, next: null } : null;
    case "transfer.create":
      return {
        entity: "transfer",
        prev: null,
        next: buildTransfer(qc, op.tempId, op.body),
      };
    case "transfer.delete":
      return op.prev ? { entity: "transfer", prev: op.prev, next: null } : null;
    case "split.create":
      return {
        entity: "split",
        prev: null,
        next: buildSplit(qc, op.tempId, op.body),
      };
    case "split.update":
      return {
        entity: "split",
        prev: op.prev,
        next: buildSplit(qc, op.id, op.body, op.prev),
      };
    case "split.delete":
      return op.prev ? { entity: "split", prev: op.prev, next: null } : null;
    default:
      return null;
  }
}

/** Fresh server data for one query with still-pending ops replayed on top.
 * A create the server already has (same clientId in the data) is skipped. */
export function overlayPending(
  qc: QueryClient,
  key: QueryKey,
  data: unknown,
  ops: Op[],
) {
  const root = String(key[0]);
  let out = data;
  for (const op of ops) {
    if (op.kind === "txn.create" && hasClientId(out, op.opId)) continue;
    const c = changeOf(qc, op);
    if (!c || !PREFIX[c.entity].includes(root)) continue;
    out = patchQuery(key, out, c);
  }
  return out;
}

function hasClientId(data: unknown, clientId: string) {
  const pages =
    (data as Infinite<TxnPage>)?.pages ??
    ((data as TxnPage)?.items ? [data as TxnPage] : []);
  return pages.some((p) => p.items.some((t) => t.clientId === clientId));
}
