import { describe, expect, test } from "bun:test";
import {
  normalizeWord,
  type OcrPage,
  type OcrWord,
  readReceipt,
  receiptNote,
  tidyCase,
} from "./receipt";

const TODAY = "2026-11-27";

/**
 * A fake OCR page: each entry is one printed row; `|` splits it into a left
 * part and a right-aligned part (separate OCR lines on the same band, as
 * Document AI returns "Sub Total" and "₹718.00"). `size` scales the type.
 */
function page(rows: (string | { text: string; size: number })[]): OcrPage {
  const words: OcrWord[] = [];
  let line = 0;
  let y = 0.02;
  for (const r of rows) {
    const { text, size } = typeof r === "string" ? { text: r, size: 1 } : r;
    const h = 0.025 * size;
    const [left, right] = text.split("|");
    const put = (part: string, x0: number, alignRight: boolean) => {
      const toks = part.trim().split(/\s+/).filter(Boolean);
      const w = 0.012 * size;
      const width = toks.join(" ").length * w;
      let x = alignRight ? 0.95 - width : x0;
      for (const t of toks) {
        words.push({ text: t, box: [x, y, x + t.length * w, y + h], line });
        x += (t.length + 1) * w;
      }
      line++;
    };
    put(left ?? "", 0.05, false);
    if (right !== undefined) put(right, 0, true);
    y += h * 1.6;
  }
  return { width: 1000, height: 1600, words };
}

describe("normalizeWord", () => {
  test("maps Greek and Cyrillic capitals back to Latin", () => {
    expect(normalizeWord("ΡΑΝΕΕR")).toBe("PANEER");
    expect(normalizeWord("ТОТАL")).toBe("TOTAL");
    expect(normalizeWord("ΚΑΤΑΝΙ")).toBe("KATANI");
  });
  test("fixes letters inside numbers but leaves words alone", () => {
    expect(normalizeWord("1O0.00")).toBe("100.00");
    expect(normalizeWord("l25")).toBe("125");
    expect(normalizeWord("Oil")).toBe("Oil");
  });
  test("folds full-width digits", () => {
    expect(normalizeWord("１２３")).toBe("123");
  });
  test("tidyCase title-cases shouting only", () => {
    expect(tidyCase("HALDIRAM'S SWEETS")).toBe("Haldiram's Sweets");
    expect(tidyCase("McDonald's")).toBe("McDonald's");
  });
});

describe("readReceipt", () => {
  test("printed restaurant bill with GST and a Greek-looking header", () => {
    const r = readReceipt(
      page([
        { text: "ΗΑLDΙRΑΜ'S RESTAURANT", size: 1.6 },
        "SCO 12, Sector 17, Chandigarh",
        "GSTIN: 04ABCDE1234F1Z5",
        "Bill No: 4521 | Date: 03/11/2026",
        "2 x Chole Bhature | 380.00",
        "1 x Sweet Lassi | 90.00",
        "Sub Total | 470.00",
        "CGST 2.5% | 11.75",
        "SGST 2.5% | 11.75",
        "Round Off | 0.50",
        { text: "TOTAL | ₹494.00", size: 1.3 },
        "Paid via UPI",
        "Thank you! Visit again",
      ]),
      TODAY,
    );
    expect(r.amount?.value).toBe(49400);
    expect(r.date?.value).toBe("2026-11-03");
    expect(r.merchant?.value).toBe("Haldiram's Restaurant");
    expect(r.items.map((i) => i.name)).toEqual([
      "Chole Bhature",
      "Sweet Lassi",
    ]);
    expect(r.items[0]?.qty).toBe(2);
    expect(r.candidates[1]?.amount).toBe(47000);
    expect(r.paymentText).toContain("UPI");
    expect(receiptNote(r)).toBe(
      "Haldiram's Restaurant · 2× Chole Bhature, Sweet Lassi",
    );
  });

  test("a ₹ read as 7 is corrected when the sum only adds up without it", () => {
    const r = readReceipt(
      page([
        "Sub Total | 718.00",
        "Discount | 90.00",
        "Taxes & Charges | 760.80",
        "Grand Total | 688.80",
      ]),
      TODAY,
    );
    expect(r.amount?.value).toBe(68880);
    expect(r.corrections).toEqual([{ from: 76080, to: 6080 }]);
  });

  test("items alone reconcile a 7-prefixed total", () => {
    const r = readReceipt(
      page([
        "1 x Masala Dosa | 120.00",
        "1 x Filter Coffee | 40.00",
        "Total | 7160.00",
      ]),
      TODAY,
    );
    expect(r.amount?.value).toBe(16000);
  });

  test("without labels the largest marked amount wins; savings are ignored", () => {
    const r = readReceipt(
      page([
        { text: "Fresh Mart", size: 1.5 },
        "You saved ₹45.00",
        "Tomato 1kg | 40.00",
        "Onion 2kg | 70.00",
        "| ₹110.00",
      ]),
      TODAY,
    );
    expect(r.amount?.value).toBe(11000);
    expect(r.merchant?.value).toBe("Fresh Mart");
  });

  test("dates: no year means the latest past one; expiry dates lose", () => {
    const a = readReceipt(
      page(["Order placed on 15 Dec, 3:21PM", "| ₹99.00"]),
      TODAY,
    );
    expect(a.date?.value).toBe("2025-12-15");
    const b = readReceipt(
      page(["Valid till 31/12/2027", "Date: 2026-11-20", "Total | 50.00"]),
      TODAY,
    );
    expect(b.date?.value).toBe("2026-11-20");
  });

  test("refunds come back as credits", () => {
    const r = readReceipt(
      page(["Refund processed", "Amount | ₹250.00"]),
      TODAY,
    );
    expect(r.type).toBe("credit");
  });

  test("dollar receipts are USD", () => {
    const r = readReceipt(
      page(["Subtotal | $18.00", "Tax | $1.62", "Total | $19.62"]),
      TODAY,
    );
    expect(r.currency).toBe("USD");
    expect(r.amount?.value).toBe(1962);
  });
});

describe("dates", () => {
  const dateOf = (rows: string[]) => readReceipt(page(rows), TODAY).date?.value;
  test("formats", () => {
    expect(dateOf(["Date: 05.11.2026", "Total | 10.00"])).toBe("2026-11-05");
    expect(dateOf(["Dt: 12-11-26", "Total | 10.00"])).toBe("2026-11-12");
    expect(dateOf(["Trip on 22 November 2026", "| ₹186.50"])).toBe(
      "2026-11-22",
    );
    expect(dateOf(["Sat, 15 Nov 2026 7:30 PM", "| ₹640.00"])).toBe(
      "2026-11-15",
    );
    expect(dateOf(["Nov 18, 2026 10:02", "| ₹99.00"])).toBe("2026-11-18");
    expect(dateOf(["3rd Nov '26", "| ₹99.00"])).toBe("2026-11-03");
  });
  test("day/month order", () => {
    // Dollars: month first.
    expect(dateOf(["11/02/2026", "Total | $7.45"])).toBe("2026-11-02");
    // Rupees: day first, unless that isn't a date.
    expect(dateOf(["11/02/2026", "Total | ₹7.45"])).toBe("2026-02-11");
    expect(dateOf(["11/25/2026", "Total | ₹7.45"])).toBe("2026-11-25");
  });
  test("bill date beats the due date", () => {
    expect(
      dateOf([
        "Due Date: 25.11.2026",
        "Bill Date: 05.11.2026",
        "Amount Payable | Rs. 1,234.00",
      ]),
    ).toBe("2026-11-05");
  });
});

/**
 * Real Document AI output for generated receipts (thermal and tilted,
 * pharmacy invoice, petrol slip, long grocery bill, food-app and cab
 * screens, movie ticket, electricity bill, US coffee shop). Regenerate with
 * a real scan when the parser's input format changes.
 */
describe("generated receipts (saved OCR)", () => {
  const dir = `${import.meta.dir}/receipt-fixtures`;
  const expected = require(`${dir}/expected.json`) as Record<
    string,
    {
      amount: number;
      date: string;
      merchant?: string;
      currency?: string;
      items?: number;
    }
  >;
  for (const [id, e] of Object.entries(expected))
    test(id, async () => {
      const page = (await Bun.file(`${dir}/${id}.ocr.json`).json()) as OcrPage;
      const r = readReceipt(page, TODAY);
      expect(r.amount?.value).toBe(e.amount);
      expect(r.date?.value).toBe(e.date);
      expect(r.currency).toBe((e.currency ?? "INR") as "INR" | "USD");
      if (e.merchant) expect(r.merchant?.value).toBe(e.merchant);
      if (e.items) expect(r.items).toHaveLength(e.items);
    });
});
