export const DATABASE_URL =
  process.env.DATABASE_URL || "postgres://localhost/finance_tracker";

/** Postgres connections kept by the API process. */
export const DB_POOL_MAX = Number(process.env.DB_POOL_MAX ?? 10);

export const IS_PROD = process.env.NODE_ENV === "production";

export const PORT = Number(process.env.PORT ?? 4300);

/** Rolling session length for opaque auth tokens (auths table + in-memory cache). */
export const SESSION_DAYS = Number(process.env.SESSION_DAYS ?? 30);

export const ALLOWED_ORIGIN_HOSTS = (
  process.env.ALLOWED_ORIGINS || "http://localhost:3300"
).split(",");

export const SMTP = {
  host: process.env.SMTP_HOST || "",
  port: Number(process.env.SMTP_PORT ?? 587),
  user: process.env.SMTP_USER || "",
  pass: process.env.SMTP_PASS || "",
  from: process.env.SMTP_FROM || process.env.SMTP_USER || "",
};

/** OTP accepted for every flow outside production. */
export const DEV_OTP = "123456";

/** All dates are bucketed in this timezone. */
export const APP_TZ = "Asia/Kolkata";

/** USD→INR used only if every exchange-rate source is unreachable. */
export const FX_FALLBACK_USD_INR = Number(
  process.env.FX_FALLBACK_USD_INR ?? 95,
);

/** WebAuthn relying party. `RP_ID` must equal the browser's hostname exactly
 * (no scheme/port); a passkey registered for one RP_ID is useless on another. */
export const RP_ID =
  process.env.RP_ID || (IS_PROD ? "tracker.com.u4.lol" : "localhost");

/** Exact origins a passkey ceremony may come from. `null` (dev only) means
 * any `http://localhost:*` origin. */
export const RP_ALLOWED_ORIGINS: string[] | null = process.env.RP_ORIGINS
  ? process.env.RP_ORIGINS.split(",")
  : IS_PROD
    ? ["https://tracker.com.u4.lol"]
    : null;
