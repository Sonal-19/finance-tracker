import { today } from "$/lib/utils/period";
import { systemConfigService } from "./system-config-service";

export const foreignCurrencies = ["USD"] as const;
export type ForeignCurrency = (typeof foreignCurrencies)[number];

export type FxQuote = {
  currency: ForeignCurrency;
  rate: number;
  /** Date the rate applies to (may be the latest business day before it). */
  date: string;
  source: "live" | "historical" | "fallback";
};

const LATEST_TTL_MS = 6 * 60 * 60 * 1000;

async function getJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json() as Promise<Record<string, unknown>>;
}

/** Foreign currency → INR rates. Latest rate cached for 6h, historical rates cached forever. */
class FxService {
  #latest = new Map<ForeignCurrency, { quote: FxQuote; at: number }>();
  #historical = new Map<string, FxQuote>();

  async latest(currency: ForeignCurrency): Promise<FxQuote> {
    const hit = this.#latest.get(currency);
    if (hit && Date.now() - hit.at < LATEST_TTL_MS) return hit.quote;
    try {
      const d = await getJson(`https://open.er-api.com/v6/latest/${currency}`);
      const rate = (d.rates as Record<string, number> | undefined)?.INR;
      if (!rate) throw new Error("INR rate missing");
      const quote: FxQuote = { currency, rate, date: today(), source: "live" };
      this.#latest.set(currency, { quote, at: Date.now() });
      return quote;
    } catch (error) {
      console.warn("[fx] latest rate failed, trying frankfurter", error);
      try {
        const quote = await this.#frankfurter(currency, "latest");
        this.#latest.set(currency, {
          quote: { ...quote, source: "live" },
          at: Date.now(),
        });
        return { ...quote, source: "live" };
      } catch (err) {
        console.error("[fx] all rate sources failed, using fallback", err);
        return (
          hit?.quote ?? {
            currency,
            rate: systemConfigService.SYSTEM_CONFIG.FX.FALLBACK_USD_INR,
            date: today(),
            source: "fallback",
          }
        );
      }
    }
  }

  /** Rate for a transaction date: today → latest, past dates → that day's reference rate. */
  async forDate(currency: ForeignCurrency, date: string): Promise<FxQuote> {
    if (date >= today()) return this.latest(currency);
    const key = `${currency}:${date}`;
    const hit = this.#historical.get(key);
    if (hit) return hit;
    try {
      const quote = await this.#frankfurter(currency, date);
      this.#historical.set(key, quote);
      return quote;
    } catch (error) {
      console.warn(
        `[fx] historical rate for ${date} failed, using latest`,
        error,
      );
      return this.latest(currency);
    }
  }

  async #frankfurter(
    currency: ForeignCurrency,
    date: string,
  ): Promise<FxQuote> {
    const d = await getJson(
      `https://api.frankfurter.dev/v1/${date}?base=${currency}&symbols=INR`,
    );
    const rate = (d.rates as Record<string, number> | undefined)?.INR;
    if (!rate) throw new Error("INR rate missing");
    return { currency, rate, date: String(d.date), source: "historical" };
  }
}

export const fxService = new FxService();
