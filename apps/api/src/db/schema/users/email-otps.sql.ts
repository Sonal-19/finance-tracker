import { index, pgEnum, pgTable } from "drizzle-orm/pg-core";

export const otpPurposes = ["register", "reset_password"] as const;
export type OtpPurpose = (typeof otpPurposes)[number];
export const otpPurposeEnum = pgEnum("otp_purpose", otpPurposes);

export const emailOtpsTable = pgTable(
  "email_otps",
  (pg) => ({
    id: pg.serial().primaryKey(),
    email: pg.text().notNull(),
    purpose: otpPurposeEnum("purpose").notNull(),
    codeHash: pg.text("code_hash").notNull(),
    attempts: pg.integer().notNull().default(0),
    expiresAt: pg.timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: pg.timestamp("consumed_at", { withTimezone: true }),
    createdAt: pg
      .timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  }),
  (t) => [index("email_otps_email_purpose_idx").on(t.email, t.purpose)],
);

export type SelectEmailOtp = typeof emailOtpsTable.$inferSelect;
