import { and, desc, eq, ilike, isNull } from "drizzle-orm";
import { db } from "$/db";
import {
  accountsTable,
  categoriesTable,
  type SelectAccount,
  type SelectCategory,
  transactionsTable,
} from "$/db/schema";
import { today } from "$/lib/utils/period";
import {
  normalizeWord,
  type ReceiptFields,
  readReceipt,
  receiptNote,
} from "$/lib/utils/receipt";
import { documentAiService } from "./document-ai-service";

/** What kind of spend the receipt's words point to, and how to recognise
 * the user's category for it by name (they may have renamed the defaults). */
const INTENTS: { name: RegExp; words: RegExp }[] = [
  {
    name: /food|dining|restaurant|eat|meal|cafe/i,
    words:
      /\b(?:biryani|paneer|thali|pizza|burger|restaurant|dhaba|caf[eé]|coffee|chai|tea|sweets?|dosa|idli|naan|roti|dal|curry|masala|tikka|garlic\s*bread|sandwich|momos?|noodles|kitchen|bakery|cake|zomato|swiggy|dine|dining|kfc|mcdonald'?s?|domino'?s|starbucks|subway|meal|combo|beverages?|juice|shake|ice\s*cream|lassi|paratha|chicken|mutton|veg|tandoor|bistro|eatery|food|kulcha|chole|samosa|pastry|menu|reorder|serves\s*\d)\b/gi,
  },
  {
    name: /grocer|kirana|supermarket|provision/i,
    words:
      /\b(?:grocery|groceries|kirana|supermarket|hypermarket|mart|bigbasket|blinkit|zepto|instamart|dmart|jiomart|vegetables?|fruits?|milk|atta|flour|ghee|oil|sugar|salt|eggs?|bread|curd|dairy|provision|general\s*store)\b/gi,
  },
  {
    name: /fuel|petrol|diesel|cng/i,
    words:
      /\b(?:petrol|diesel|fuel|cng|hpcl|iocl|indian\s*oil|bharat\s*petroleum|bpcl|hp\s*petrol|shell|nozzle|pump|filling\s*station)\b/gi,
  },
  {
    name: /medic|health|pharma|doctor|hospital/i,
    words:
      /\b(?:pharmacy|chemist|medical|medicines?|hospital|clinic|apollo|medplus|1mg|pharmeasy|netmeds|tablets?|tab|cap|syrup|doctor|dr|diagnostics?|lab|pathology|consultation|opd)\b/gi,
  },
  {
    name: /travel|transport|commute|cab|taxi|trip/i,
    words:
      /\b(?:uber|ola|rapido|irctc|railways?|train|flight|airlines?|indigo|air\s*india|vistara|makemytrip|goibibo|ixigo|bus|redbus|metro|taxi|cab|toll|fastag|parking|hotel|boarding|pnr|trip|ride)\b/gi,
  },
  {
    name: /shop/i,
    words:
      /\b(?:amazon|flipkart|myntra|ajio|meesho|nykaa|mall|fashion|apparel|shirt|t-shirt|jeans|shoes|footwear|electronics|croma|reliance\s*digital|decathlon|ikea|lifestyle|westside|pantaloons|zudio|max)\b/gi,
  },
  {
    name: /bill|utilit|recharge/i,
    words:
      /\b(?:electricity|recharge|broadband|wifi|wi-fi|airtel|jio|vodafone|bsnl|dth|tata\s*play|gas\s*cylinder|lpg|water\s*bill|postpaid|prepaid|bill\s*payment|kwh|units\s*consumed)\b/gi,
  },
  {
    name: /entertain|movie|fun|leisure/i,
    words:
      /\b(?:movie|cinema|pvr|inox|cinepolis|bookmyshow|netflix|spotify|hotstar|prime\s*video|concert|show|tickets?|game|gaming|amusement|bowling)\b/gi,
  },
  {
    name: /educat|study|school|course|tuition/i,
    words:
      /\b(?:school|college|university|tuition|course|fees|udemy|coursera|stationery|books?|notebook|exam)\b/gi,
  },
  {
    name: /personal|care|salon|groom|beauty/i,
    words:
      /\b(?:salon|spa|parlour|parlor|haircut|barber|grooming|cosmetics|beauty|facial|manicure|pedicure)\b/gi,
  },
  { name: /insur/i, words: /\b(?:insurance|premium|policy|lic)\b/gi },
  {
    name: /rent|housing/i,
    words: /\b(?:rent|landlord|lease|pg\s*charges)\b/gi,
  },
];

/** "Like your last bill from X" when this shop was seen before, else the
 * category the receipt's words point to most. */
async function guessCategory(
  userId: number,
  f: ReceiptFields,
  text: string,
  categories: SelectCategory[],
): Promise<{ id: number; reason: string } | null> {
  const own = categories.filter((c) => c.type === f.type);
  if (f.merchant && f.merchant.value.length >= 3) {
    const like = `${f.merchant.value.slice(0, 40).replace(/[%_\\]/g, "\\$&")}%`;
    const [last] = await db
      .select({ categoryId: transactionsTable.categoryId })
      .from(transactionsTable)
      .where(
        and(
          eq(transactionsTable.userId, userId),
          eq(transactionsTable.type, f.type),
          ilike(transactionsTable.note, like),
          isNull(transactionsTable.splitId),
          isNull(transactionsTable.sharedSplitId),
        ),
      )
      .orderBy(desc(transactionsTable.date), desc(transactionsTable.id))
      .limit(1);
    if (last && own.some((c) => c.id === last.categoryId))
      return {
        id: last.categoryId,
        reason: `Same as your last bill from ${f.merchant.value}`,
      };
  }
  if (f.type === "credit") {
    const refund = own.find((c) => /refund/i.test(c.name));
    return refund ? { id: refund.id, reason: "Looks like a refund" } : null;
  }
  let best: { cat: SelectCategory; hits: number; word: string } | null = null;
  for (const intent of INTENTS) {
    const hits = text.match(intent.words);
    if (!hits?.length) continue;
    const cat = own.find((c) => intent.name.test(c.name));
    if (cat && (!best || hits.length > best.hits))
      best = { cat, hits: hits.length, word: hits[0]!.toLowerCase() };
  }
  return best ? { id: best.cat.id, reason: `Spotted “${best.word}”` } : null;
}

/** The payment method, only when the receipt names it plainly: the last
 * four card digits in an account's name, or cash / UPI / a wallet. */
function guessAccount(text: string, accounts: SelectAccount[]) {
  const active = accounts.filter((a) => a.status === "active");
  const last4 = text.match(
    /(?:x{2,}|\*{2,}|ending\s*(?:in|with)?\s*|card\s*no\.?\s*:?\s*\S*)(\d{4})\b/i,
  )?.[1];
  if (last4) {
    const hit = active.find((a) => a.name.includes(last4));
    if (hit) return { id: hit.id, reason: `Card ending ${last4}` };
  }
  const kinds: [RegExp, (a: SelectAccount) => boolean, string][] = [
    [
      /\b(?:upi|gpay|google\s*pay|phonepe|paytm|bhim)\b/i,
      (a) => /upi|gpay|google\s*pay|phonepe|paytm|bhim/i.test(a.name),
      "Paid by UPI",
    ],
    [
      /\bcash\b(?!\s*back)/i,
      (a) => a.type === "cash" || /cash/i.test(a.name),
      "Paid in cash",
    ],
  ];
  for (const [re, match, reason] of kinds) {
    if (!re.test(text)) continue;
    const hit = active.find(match);
    if (hit) return { id: hit.id, reason };
  }
  return null;
}

/** OCR + reading + the user's own guesses, ready for the review screen. */
export async function scanReceipt(
  userId: number,
  data: Uint8Array,
  mimeType: string,
) {
  const started = Date.now();
  const page = await documentAiService.read(data, mimeType);
  const fields = readReceipt(page, today());
  const words = page.words.map((w) => ({ t: normalizeWord(w.text), b: w.box }));
  const text = words.map((w) => w.t).join(" ");

  const [categories, accounts] = await Promise.all([
    db.select().from(categoriesTable).where(eq(categoriesTable.userId, userId)),
    db.select().from(accountsTable).where(eq(accountsTable.userId, userId)),
  ]);
  const [category, account] = await Promise.all([
    guessCategory(userId, fields, text, categories),
    guessAccount(text, accounts),
  ]);

  return {
    /** the image's pixel size as read */
    width: page.width,
    height: page.height,
    /** every word with its normalised box [left, top, right, bottom] */
    words,
    ...fields,
    note: receiptNote(fields),
    category,
    account,
    ms: Date.now() - started,
  };
}
export type ReceiptScan = Awaited<ReturnType<typeof scanReceipt>>;
