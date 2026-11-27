// Receipt reading: turns OCR words (text + where they sit on the image) into
// the fields of a transaction. Pure (no DB, no env) so it can be tested on
// saved OCR output; the guesses that need the user's data (category from
// their history, account) live in receipt-service.ts.

/** Normalised box on the image: [left, top, right, bottom], each 0–1. */
export type Box = [number, number, number, number];

/** One OCR word. `line` groups words the OCR read as one line. */
export type OcrWord = { text: string; box: Box; line: number };

export type OcrPage = { width: number; height: number; words: OcrWord[] };

/** A value read off the receipt and the words it came from (for the
 * animation and so the user can see where it was found). */
type Found<T> = { value: T; words: number[] };

export type AmountCandidate = {
  /** smallest INR unit (or cents for USD) */
  amount: number;
  /** "Grand total", "Sub total"… or null when it had no label */
  label: string | null;
  words: number[];
};

export type ReceiptItem = {
  name: string;
  qty: number | null;
  amount: number | null;
};

export type ReceiptFields = {
  type: "debit" | "credit";
  currency: "INR" | "USD";
  amount: Found<number> | null;
  /** Other totals the user might mean, best first (includes `amount`). */
  candidates: AmountCandidate[];
  date: Found<string> | null;
  merchant: Found<string> | null;
  items: ReceiptItem[];
  /** Words of the found item names. */
  itemWords: number[];
  /** Raw text of payment lines ("Payment Mode: Gift Cards"). */
  paymentText: string | null;
  /** Readings the parser corrected, e.g. a ₹ read as a 7. */
  corrections: { from: number; to: number }[];
};

// ---------------------------------------------------------------------------
// Text normalisation

/** Greek and Cyrillic letters the OCR returns for Latin ones that look the
 * same (an all-caps "PANEER" comes back as Greek "ΡΑΝΕΕR"). Indian receipts
 * are never in Greek or Cyrillic, so these are always mapped back. */
const LOOKALIKES: Record<string, string> = {
  // Greek capitals
  Α: "A",
  Β: "B",
  Ε: "E",
  Ζ: "Z",
  Η: "H",
  Ι: "I",
  Κ: "K",
  Μ: "M",
  Ν: "N",
  Ο: "O",
  Ρ: "P",
  Τ: "T",
  Υ: "Y",
  Χ: "X",
  Ϲ: "C",
  Ϳ: "J",
  Ѕ: "S",
  // Greek small
  α: "a",
  β: "b",
  ε: "e",
  ι: "i",
  κ: "k",
  ν: "v",
  ο: "o",
  ρ: "p",
  τ: "t",
  υ: "u",
  χ: "x",
  γ: "y",
  η: "n",
  ω: "w",
  ϲ: "c",
  ς: "s",
  // Cyrillic capitals
  А: "A",
  В: "B",
  Е: "E",
  К: "K",
  М: "M",
  Н: "H",
  О: "O",
  Р: "P",
  С: "C",
  Т: "T",
  Х: "X",
  У: "Y",
  І: "I",
  Ј: "J",
  Ү: "Y",
  Ԛ: "Q",
  Ԝ: "W",
  // Cyrillic small
  а: "a",
  в: "b",
  е: "e",
  к: "k",
  м: "m",
  н: "h",
  о: "o",
  р: "p",
  с: "c",
  т: "t",
  х: "x",
  у: "y",
  і: "i",
  ј: "j",
  ѕ: "s",
  ԛ: "q",
  ԝ: "w",
  ү: "y",
};
const LOOKALIKE_RE = new RegExp(`[${Object.keys(LOOKALIKES).join("")}]`, "g");

/**
 * Cleans one OCR word: Unicode compatibility forms folded (full-width digits,
 * ligatures), invisible characters dropped, Greek/Cyrillic look-alikes turned
 * back into Latin, and O/l read inside a number turned into 0/1.
 */
export function normalizeWord(raw: string) {
  let s = raw
    .normalize("NFKC")
    .replace(/[​-‏⁠﻿]/g, "")
    .replace(LOOKALIKE_RE, (c) => LOOKALIKES[c] ?? c)
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-");
  // "1O0.00" / "l25" — letters inside what is otherwise a number.
  if (/\d/.test(s) && /^[₹$]?[\dOoIl.,]+$/.test(s) && /\d.*\d/.test(s))
    s = s.replace(/[Oo]/g, "0").replace(/[Il]/g, "1");
  return s;
}

/** "KATANI DHABA" → "Katani Dhaba"; mixed case is left alone. */
export function tidyCase(s: string) {
  const letters = s.replace(/[^A-Za-z]/g, "");
  if (letters.length < 4 || letters !== letters.toUpperCase()) return s;
  return s
    .toLowerCase()
    .replace(/(^|[\s(/&-])([a-z])/g, (_, p, c) => p + c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Rows: words that sit on the same horizontal band, left to right. The OCR's
// own lines often split "Sub Total ........ ₹718.00" in two, so rows are
// rebuilt from the line boxes.

type Row = {
  words: number[];
  text: string;
  /** text offset where each word starts */
  starts: number[];
  top: number;
  bottom: number;
  height: number;
};

/**
 * Straightens a tilted photo: the slope of each OCR line (its words'
 * centres, left to right) gives the tilt, and every box is sheared back by
 * the median of those. Only the positions used for grouping change.
 */
export function deskew(words: OcrWord[], aspect = 1): OcrWord[] {
  const byLine = new Map<number, OcrWord[]>();
  for (const w of words) byLine.set(w.line, [...(byLine.get(w.line) ?? []), w]);
  const slopes: number[] = [];
  for (const ws of byLine.values()) {
    if (ws.length < 2) continue;
    const pts = ws.map(
      (w) => [(w.box[0] + w.box[2]) / 2, (w.box[1] + w.box[3]) / 2] as const,
    );
    const xs = pts.map((p) => p[0]);
    if (Math.max(...xs) - Math.min(...xs) < 0.15) continue;
    const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    let num = 0;
    let den = 0;
    for (const [x, y] of pts) {
      num += (x - mx) * (y - my);
      den += (x - mx) ** 2;
    }
    if (den > 0) slopes.push(num / den);
  }
  if (slopes.length < 2) return words;
  slopes.sort((a, b) => a - b);
  const slope = slopes[Math.floor(slopes.length / 2)]!;
  // Under ~0.3° nothing moves enough to matter; over ~20° it isn't a tilt.
  if (Math.abs(slope * aspect) < 0.005 || Math.abs(slope * aspect) > 0.35)
    return words;
  return words.map((w) => {
    const dy = -slope * ((w.box[0] + w.box[2]) / 2 - 0.5);
    return { ...w, box: [w.box[0], w.box[1] + dy, w.box[2], w.box[3] + dy] };
  });
}

function buildRows(words: OcrWord[]): Row[] {
  const lines = new Map<number, number[]>();
  words.forEach((w, i) => {
    const l = lines.get(w.line) ?? [];
    l.push(i);
    lines.set(w.line, l);
  });
  type Band = { idx: number[]; top: number; bottom: number };
  const bands: Band[] = [...lines.values()].map((idx) => ({
    idx,
    top: Math.min(...idx.map((i) => words[i]!.box[1])),
    bottom: Math.max(...idx.map((i) => words[i]!.box[3])),
  }));
  bands.sort((a, b) => a.top + a.bottom - (b.top + b.bottom));

  const rows: Band[] = [];
  for (const b of bands) {
    const c = (b.top + b.bottom) / 2;
    const h = b.bottom - b.top;
    const row = rows.find((r) => {
      const rc = (r.top + r.bottom) / 2;
      const rh = r.bottom - r.top;
      return Math.abs(rc - c) < Math.min(h, rh) * 0.5;
    });
    if (row) {
      row.idx.push(...b.idx);
      row.top = Math.min(row.top, b.top);
      row.bottom = Math.max(row.bottom, b.bottom);
    } else rows.push({ ...b, idx: [...b.idx] });
  }

  return rows.map((r) => {
    const idx = r.idx.sort((a, b) => words[a]!.box[0] - words[b]!.box[0]);
    let text = "";
    const starts: number[] = [];
    for (const i of idx) {
      const t = words[i]!.text.trim();
      if (!t) {
        starts.push(text.length);
        continue;
      }
      if (text && !/^[.,:;)%/-]/.test(t) && !/[(₹$#/-]$/.test(text))
        text += " ";
      starts.push(text.length);
      text += t;
    }
    return {
      words: idx,
      text,
      starts,
      top: r.top,
      bottom: r.bottom,
      height: r.bottom - r.top,
    };
  });
}

/** Indexes of the row's words that overlap text[from, to). */
function wordsIn(row: Row, from: number, to: number) {
  const out: number[] = [];
  row.words.forEach((w, k) => {
    const s = row.starts[k]!;
    const e = k + 1 < row.starts.length ? row.starts[k + 1]! : row.text.length;
    if (s < to && e > from) out.push(w);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Money

type Money = {
  value: number;
  /** what was read, e.g. "760.80" */
  raw: string;
  currency: "INR" | "USD" | null;
  start: number;
  end: number;
  row: number;
  words: number[];
};

/** Bits of a row that look like numbers but aren't amounts: dates, times,
 * order/bill numbers, phone numbers, percentages, quantities, GST ids. */
const NOT_MONEY = [
  /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g,
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?/gi,
  /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,?(?:\s+'?\d{2,4})?/gi,
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?(?:\s+\d{4})?/gi,
  /#\s*[\w-]+/g,
  /\b(?:no|num|number|id|inv|invoice|bill|order|txn|ref|table|token|kot|gstin|fssai|pan|cin|ph|phone|mob|mobile|tel|pin)\.?\s*[:#-]?\s*[\w/-]*\d[\w/-]*/gi,
  /\+?\b\d{10,}\b/g,
  /\b\d+(?:\.\d+)?\s*%/g,
  /\b\d+\s*(?:items?|nos?|pcs?|qty|kg|gm?s?|ml|ltrs?|l|serves?)\b/gi,
  /\(serves\s+\d+\)/gi,
  /^\s*(?:[^\p{L}\d\s]+\s*|[OoQ0]\s+)?\d{1,3}\s*[x×*]\s/giu,
  /\b\d{1,3}\s*[x×]\s/gi,
  /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{3}\b/g,
];

const MONEY_RE =
  /(₹|rs\.?|inr|\$|usd)?\s*(-?(?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d{1,2})?)(\s*\/-)?/gi;

function maskNonMoney(text: string) {
  let t = text;
  for (const re of NOT_MONEY) t = t.replace(re, (m) => " ".repeat(m.length));
  return t;
}

function readMoney(rows: Row[]): Money[] {
  const out: Money[] = [];
  rows.forEach((row, r) => {
    const masked = maskNonMoney(row.text);
    for (const m of masked.matchAll(MONEY_RE)) {
      const [, mark, num, suffix] = m;
      const digits = num!.replace(/,/g, "");
      const hasDecimals = digits.includes(".");
      const marked = !!mark || !!suffix;
      // A bare whole number is only money when it has a ₹ or "/-" with it
      // or sits at the far right of a priced row (checked by the caller).
      const value = Math.round(Number(digits) * 100);
      if (!Number.isFinite(value) || value <= 0 || value > 1e12) continue;
      // Years and short codes standing alone.
      if (!marked && !hasDecimals && digits.length > 7) continue;
      const start = m.index! + m[0].indexOf(num!);
      const end = start + num!.length;
      const lower = (mark ?? "").toLowerCase();
      out.push({
        value,
        raw: digits,
        currency: !mark
          ? null
          : lower === "$" || lower === "usd"
            ? "USD"
            : "INR",
        start,
        end,
        row: r,
        words: wordsIn(
          row,
          mark ? m.index! + m[0].indexOf(mark) : start,
          end + (suffix?.length ?? 0),
        ),
      });
    }
  });
  return out;
}

/** Is this amount at the right-hand end of its row (where prices go)? */
const atRowEnd = (row: Row, m: Money) =>
  maskNonMoney(row.text)
    .slice(m.end)
    .replace(/[\s>›»)\]|/-]/g, "") === "";

// ---------------------------------------------------------------------------
// Labels

type Kind =
  | "total"
  | "subtotal"
  | "discount"
  | "charge"
  | "round"
  | "saved"
  | "paid";

const LABELS: { kind: Kind; re: RegExp; score: number; name: string }[] = [
  {
    kind: "saved",
    re: /\b(?:you(?:'ve)?\s+saved|saved|savings?|you\s+save)\b/i,
    score: 0,
    name: "Saved",
  },
  { kind: "total", re: /\bgrand\s*total\b/i, score: 100, name: "Grand total" },
  {
    kind: "total",
    re: /\b(?:total|net|amount)\s*(?:payable|due|to\s*pay)\b|\bto\s*pay\b|\bpayable\b/i,
    score: 95,
    name: "To pay",
  },
  {
    kind: "total",
    re: /\b(?:amount|total)\s*paid\b|\bpaid\s*amount\b|\byou\s*paid\b|\bpaid\s+(?:via|by|using|with)\b/i,
    score: 92,
    name: "Paid",
  },
  {
    kind: "total",
    re: /\b(?:bill|order|invoice|net|final)\s*(?:total|amount|amt)\b|\btotal\s*(?:amount|amt|bill)\b/i,
    score: 90,
    name: "Total",
  },
  {
    kind: "subtotal",
    re: /\bsub\s*-?\s*total\b|\bitem\s*total\b|\bitems?\s*value\b|\bgross\b|\bbasic\s*amount\b|\btaxable\b/i,
    score: 30,
    name: "Sub total",
  },
  {
    kind: "discount",
    re: /\bdiscount|\bcoupon\b|\bpromo|\boffer\b|\bcashback\b|\bless\b|\bvoucher\b/i,
    score: 0,
    name: "Discount",
  },
  {
    kind: "round",
    re: /\bround(?:ed)?\s*(?:off|ing)?\b/i,
    score: 0,
    name: "Round off",
  },
  {
    kind: "charge",
    re: /\b(?:c|s|i|u)?gst\b|\btax(?:es)?\b|\bvat\b|\bcess\b|\bcharges?\b|\bfees?\b|\bdelivery\b|\bpackag|\bservice\b|\btip\b|\bconvenience\b|\bplatform\b|\bhandling\b|\bsurcharge\b/i,
    score: 0,
    name: "Charges",
  },
  { kind: "total", re: /\btotal\b/i, score: 75, name: "Total" },
  {
    kind: "paid",
    re: /\b(?:cash|card|upi|change|tendered|received|balance|visa|mastercard|master\s*card|rupay|amex|maestro)\b/i,
    score: 0,
    name: "Payment",
  },
];

function labelOf(text: string) {
  const words = maskNonMoney(text).replace(MONEY_RE, " ");
  for (const l of LABELS) if (l.re.test(words)) return l;
  return null;
}

// ---------------------------------------------------------------------------
// Dates

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

const pad = (n: number) => String(n).padStart(2, "0");

function validDate(y: number, m: number, d: number) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** A receipt date is never far in the future (that's an expiry or a
 * delivery slot) nor years old. A date without a year is the most recent
 * one that isn't in the future. */
function fitDate(year: number | null, m: number, d: number, today: string) {
  const ty = Number(today.slice(0, 4));
  const y = year !== null && year < 100 ? year + 2000 : year;
  const s = validDate(y ?? ty, m, d);
  if (!s) return null;
  if (y === null && s > today) return validDate(ty - 1, m, d);
  const max = `${ty}-${today.slice(5)}`;
  if (s > max && s.slice(0, 7) > today.slice(0, 7)) return null;
  if (Number(s.slice(0, 4)) < ty - 3) return null;
  return s;
}

const DATE_PATTERNS: {
  re: RegExp;
  get: (m: RegExpMatchArray) => [number | null, number, number];
  /** day and month could be either way round (23/10 vs 10/23) */
  numeric?: true;
}[] = [
  // 2026-10-23
  {
    re: /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/,
    get: (m) => [+m[1]!, +m[2]!, +m[3]!],
  },
  // 23/10/2026, 23-10-26 (Indian order: day first)
  {
    re: /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/,
    get: (m) => [+m[3]!, +m[2]!, +m[1]!],
    numeric: true,
  },
  // 23 Oct 2026, 15 Nov, 3rd March '26
  {
    re: /\b(\d{1,2})(?:st|nd|rd|th)?[\s-]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?(?:[\s-]*'?(\d{4}|\d{2})\b(?!:))?/i,
    get: (m) => [
      m[3] ? +m[3] : null,
      MONTHS.indexOf(m[2]!.toLowerCase().slice(0, 3)) + 1,
      +m[1]!,
    ],
  },
  // Oct 23, 2026
  {
    re: /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?(?:\s+(\d{4}))?\b/i,
    get: (m) => [
      m[3] ? +m[3] : null,
      MONTHS.indexOf(m[1]!.toLowerCase().slice(0, 3)) + 1,
      +m[2]!,
    ],
  },
];

/**
 * The bill's date. Numeric dates are read day-first (India) unless the
 * receipt is in dollars (month-first), and the other way round when the
 * first reading isn't a real date (11/25/2026).
 */
function findDate(
  rows: Row[],
  today: string,
  monthFirst = false,
): Found<string> | null {
  let best: (Found<string> & { score: number }) | null = null;
  rows.forEach((row, r) => {
    for (const p of DATE_PATTERNS) {
      const m = row.text.match(p.re);
      if (!m) continue;
      const [y, mo, d] = p.get(m);
      const orders: [number, number][] = p.numeric
        ? monthFirst
          ? [
              [d, mo],
              [mo, d],
            ]
          : [
              [mo, d],
              [d, mo],
            ]
        : [[mo, d]];
      let value: string | null = null;
      for (const [mm, dd] of orders) {
        value = fitDate(y, mm, dd, today);
        if (value) break;
      }
      if (!value) continue;
      // A "Date:" / "placed on" label wins; otherwise the first one.
      const score =
        (/\b(?:date|dated|dt|placed|ordered|paid|bill)\b/i.test(row.text)
          ? 10
          : 0) +
        (y !== null ? 2 : 0) -
        r * 0.01 -
        (/\b(?:exp|expiry|valid|due|delivery\s+by|best\s+before)\b/i.test(
          row.text,
        )
          ? 20
          : 0);
      const len = m[0].replace(/[\s,.-]+$/, "").length;
      if (!best || score > best.score)
        best = { value, words: wordsIn(row, m.index!, m.index! + len), score };
      break;
    }
  });
  if (!best) return null;
  const { value, words } = best;
  return { value, words };
}

// ---------------------------------------------------------------------------
// Merchant & items

const NOT_MERCHANT =
  /^(?:tax\s*invoice|invoice|retail\s*invoice|receipt|bill(?:\s*of\s*supply)?|cash\s*memo|estimate|order\b|welcome|thank|gstin|fssai|date|time|ph\b|phone|tel|mob|you(?:'ve)?\s*saved|saved|view\s*menu|delivered|order\s*placed|payment|paid|qty|item|s\.?\s*no|total|table|token|kot|customer|cashier|copy|duplicate|original|rate\b|reorder|help|support|download|share|details|summary|bill\s*details)/i;

/** The shop's name: among the top rows, the most prominent one (largest
 * type) that reads as a name rather than a heading, a date or an address. */
function findMerchant(rows: Row[], words: OcrWord[]): Found<string> | null {
  let best: { row: number; score: number; text: string } | null = null;
  rows.forEach((row, r) => {
    if (row.top > 0.4) return;
    const text = row.text
      .replace(/(?:\.{2,}|…)\s*$/, "")
      .replace(/^[^\p{L}\d]+|[^\p{L}\d)]+$/gu, "")
      .trim();
    const letters = text.replace(/[^\p{L}]/gu, "").length;
    if (letters < 3 || letters / Math.max(text.length, 1) < 0.55) return;
    if (NOT_MERCHANT.test(text)) return;
    if (labelOf(text) && /\d/.test(text)) return;
    if (/^\d+\s*[x×*]\s/.test(text)) return;
    if (DATE_PATTERNS.some((p) => p.re.test(text))) return;
    // Addresses: road/sector/street, pin codes.
    if (
      /\b(?:road|rd|street|st|nagar|sector|phase|lane|marg|chowk|near|opp|floor|plot|shop\s*no|\d{6})\b/i.test(
        text,
      ) &&
      r > 0
    )
      return;
    const score = row.height * 10 - row.top * 0.5 - r * 0.02;
    if (!best || score > best.score) best = { row: r, score, text };
  });
  if (!best) return null;
  const { row, text } = best as { row: number; text: string };
  return {
    value: tidyCase(text).slice(0, 80),
    words: rows[row]!.words.filter((i) => words[i]!.text.trim()),
  };
}

/** "1 x Paneer Tikka"; a veg/non-veg mark in front is often read as "O". */
const ITEM_QTY =
  /^\s*(?:[^\p{L}\d\s]+\s*|[OoQ0]\s+)?(\d{1,3})\s*[x×*]\s+(.+)$/iu;

function findItems(rows: Row[], money: Money[], merchantRow: number | null) {
  const items: (ReceiptItem & { words: number[] })[] = [];
  rows.forEach((row, r) => {
    if (r === merchantRow) return;
    const rowMoney = money.filter((m) => m.row === r);
    const priceText = rowMoney.length
      ? row.text.slice(0, rowMoney[0]!.start)
      : row.text;
    const name0 = priceText.replace(/[₹$]|rs\.?\s*$/gi, "").trim();
    const qtyMatch = name0.match(ITEM_QTY);
    if (!qtyMatch && !rowMoney.length) return;
    const name = (qtyMatch ? qtyMatch[2]! : name0)
      .replace(/^[^\p{L}\d]+|[\s:|-]+$/gu, "")
      .trim();
    const letters = name.replace(/[^\p{L}]/gu, "").length;
    if (letters < 3 || labelOf(name) || NOT_MERCHANT.test(name)) return;
    if (!qtyMatch && !atRowEnd(row, rowMoney[rowMoney.length - 1]!)) return;
    const price = rowMoney.length ? rowMoney[rowMoney.length - 1]! : null;
    items.push({
      name: tidyCase(name).slice(0, 80),
      qty: qtyMatch ? Number(qtyMatch[1]) : null,
      amount: price?.value ?? null,
      words: wordsIn(
        row,
        priceText.indexOf(name),
        priceText.indexOf(name) + name.length,
      ),
    });
  });
  return items.slice(0, 30);
}

// ---------------------------------------------------------------------------
// Totals

type Tagged = Money & {
  kind: Kind | null;
  label: string | null;
  score: number;
  alts: number[];
};

/** "₹60.80" is sometimes read as "760.80": the ₹ became a 7. */
const rupeeAsSeven = (m: Money) =>
  !m.currency &&
  /^7\d+(\.\d{1,2})?$/.test(m.raw) &&
  m.raw.replace(/\.\d+$/, "").length >= 2
    ? [Math.round(Number(m.raw.slice(1)) * 100)]
    : [];

function tagMoney(rows: Row[], money: Money[]): Tagged[] {
  return money.map((m) => {
    const row = rows[m.row]!;
    let label = labelOf(row.text.slice(0, m.start));
    // "Sub Total" on one OCR line and "₹718.00" on the next: the label is
    // the row above when this row is nothing but the amount.
    if (
      !label &&
      maskNonMoney(row.text).replace(MONEY_RE, "").trim().length <= 2 &&
      m.row > 0
    ) {
      const above = rows[m.row - 1]!;
      const gap = row.top - above.bottom;
      if (
        gap < Math.max(row.height, above.height) * 1.6 &&
        !money.some((o) => o.row === m.row - 1)
      )
        label = labelOf(above.text);
    }
    return {
      ...m,
      kind: label?.kind ?? null,
      label: label?.name ?? null,
      score: label?.score ?? 0,
      alts: [m.value, ...rupeeAsSeven(m)],
    };
  });
}

/**
 * Checks the totals add up (items or sub total − discounts + charges ±
 * round-off = total) and, when they only do with a ₹ that was read as a 7
 * dropped, takes that reading. Returns the corrected values by index.
 */
function reconcile(tagged: Tagged[], items: ReceiptItem[]) {
  const totals = tagged.filter((t) => t.kind === "total");
  const parts = tagged.filter(
    (t) =>
      t.kind && ["subtotal", "discount", "charge", "round"].includes(t.kind),
  );
  const fixed = new Map<Tagged, number>();
  if (!totals.length) return fixed;
  const itemSum = items.reduce((s, i) => s + (i.amount ?? 0), 0);
  const choices = [...parts, ...totals].filter((t) => t.alts.length > 1);
  if (choices.length > 10) return fixed;

  const sign = (t: Tagged) => (t.kind === "discount" ? -1 : 1);
  let bestCount = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 1 << choices.length; mask++) {
    const pick = (t: Tagged) => {
      const k = choices.indexOf(t);
      return k >= 0 && mask & (1 << k) ? t.alts[1]! : t.value;
    };
    const sub = parts.find((p) => p.kind === "subtotal");
    const base = sub ? pick(sub) : itemSum;
    if (!base) continue;
    const others = parts.filter((p) => p.kind !== "subtotal");
    const off = others
      .filter((p) => p.kind === "discount")
      .reduce((s, p) => s + pick(p), 0);
    // Discounts can't be more than what was bought.
    if (off > base) continue;
    const rest = others.reduce((s, p) => s + sign(p) * pick(p), 0);
    // A sub total that disagrees with the items it sums is the wrong reading.
    const subOff =
      sub && itemSum && Math.abs(pick(sub) - itemSum) > 100 ? 2 : 0;
    for (const total of totals) {
      const want = pick(total);
      // A rupee of slack for rounding.
      if (Math.abs(base + rest - want) > 100) continue;
      const count = choices.filter((_, k) => mask & (1 << k)).length + subOff;
      if (count < bestCount) {
        bestCount = count;
        fixed.clear();
        choices.forEach((t, k) => {
          if (mask & (1 << k)) fixed.set(t, t.alts[1]!);
        });
      }
    }
  }
  return fixed;
}

// ---------------------------------------------------------------------------

export function readReceipt(page: OcrPage, today: string): ReceiptFields {
  const words = deskew(
    page.words.map((w) => ({ ...w, text: normalizeWord(w.text) })),
    page.height / Math.max(page.width, 1),
  );
  const rows = buildRows(words);
  const money = readMoney(rows);
  const merchant = findMerchant(rows, words);
  const merchantRow = merchant
    ? rows.findIndex((r) => r.words.includes(merchant.words[0]!))
    : null;
  const items = findItems(rows, money, merchantRow);
  const tagged = tagMoney(rows, money);

  // Use corrected readings everywhere (a corrected item price, too).
  const corrections: { from: number; to: number }[] = [];
  for (const [t, v] of reconcile(tagged, items)) {
    corrections.push({ from: t.value, to: v });
    t.value = v;
  }
  // No sum to check against: a 7-prefixed amount whose rest appears
  // elsewhere on the receipt as its own amount is the same amount.
  for (const t of tagged)
    if (
      t.alts.length > 1 &&
      t.value === t.alts[0] &&
      tagged.some((o) => o !== t && o.value === t.alts[1])
    ) {
      corrections.push({ from: t.value, to: t.alts[1]! });
      t.value = t.alts[1]!;
    }

  // Ranked candidates for the amount.
  const ranked: (AmountCandidate & { score: number })[] = [];
  for (const t of tagged) {
    if (t.kind === "saved" || t.kind === "paid") continue;
    const row = rows[t.row]!;
    const rightish = atRowEnd(row, t);
    const decimals = t.raw.includes(".");
    if (!t.kind && !t.currency && !decimals && !rightish) continue;
    let score = t.score;
    if (t.kind === "discount" || t.kind === "charge" || t.kind === "round")
      score = -50;
    if (!t.kind) score = 10 + (t.currency ? 15 : 0) + (decimals ? 5 : 0);
    // Bigger type and lower on the page both lean towards "the total".
    score += row.height * 40 + row.top * 4;
    ranked.push({ amount: t.value, label: t.label, words: t.words, score });
  }
  // The largest unlabelled amount is the best guess when nothing is labelled.
  if (!ranked.some((c) => c.label && c.score >= 70)) {
    const plain = ranked.filter((c) => !c.label);
    const max = Math.max(0, ...plain.map((c) => c.amount));
    for (const c of plain) if (c.amount === max) c.score += 30;
  }
  ranked.sort((a, b) => b.score - a.score);
  const candidates: AmountCandidate[] = [];
  for (const c of ranked) {
    if (c.score < 0 && candidates.length) continue;
    if (candidates.some((o) => o.amount === c.amount)) continue;
    candidates.push({ amount: c.amount, label: c.label, words: c.words });
    if (candidates.length === 5) break;
  }

  const allText = rows.map((r) => r.text).join("\n");
  const usd = money.filter((m) => m.currency === "USD").length;
  const inr = money.filter((m) => m.currency === "INR").length;
  const paymentRow = rows.find((r) =>
    /\b(?:payment\s*(?:mode|method)?|paid\s+(?:via|by|using|with))\b/i.test(
      r.text,
    ),
  );

  const top = candidates[0];
  return {
    type: /\b(?:refund(?:ed)?|credited|amount\s+received|money\s+received|reversal)\b/i.test(
      allText,
    )
      ? "credit"
      : "debit",
    currency: usd > inr ? "USD" : "INR",
    amount: top ? { value: top.amount, words: top.words } : null,
    candidates,
    date: findDate(rows, today, usd > inr),
    merchant,
    items: items.map(({ words: _, ...i }) => i),
    itemWords: items.flatMap((i) => i.words),
    paymentText: paymentRow?.text.slice(0, 120) ?? null,
    corrections,
  };
}

/** A short note for the transaction: the shop, then what was bought. */
export function receiptNote(f: Pick<ReceiptFields, "merchant" | "items">) {
  const names = f.items.map((i) =>
    i.qty && i.qty > 1 ? `${i.qty}× ${i.name}` : i.name,
  );
  let list = "";
  for (const n of names) {
    const next = list ? `${list}, ${n}` : n;
    if (next.length > 90) {
      list += `, +${names.length - names.indexOf(n)} more`;
      break;
    }
    list = next;
  }
  if (f.merchant && list) return `${f.merchant.value} · ${list}`;
  return f.merchant?.value ?? list;
}
