import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "$/db";
import { emailOtpsTable, type OtpPurpose } from "$/db/schema";
import { DEV_OTP, IS_PROD } from "$/env";
import { mailService } from "./mail-service";

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

const SUBJECTS: Record<OtpPurpose, string> = {
  register: "Verify your email",
  reset_password: "Reset your password",
};

type SendResult =
  | { ok: true }
  | { ok: false; reason: "cooldown"; retryInSec: number }
  | { ok: false; reason: "mail_failed" };

class OtpService {
  async send(email: string, purpose: OtpPurpose): Promise<SendResult> {
    const [last] = await db
      .select()
      .from(emailOtpsTable)
      .where(
        and(
          eq(emailOtpsTable.email, email),
          eq(emailOtpsTable.purpose, purpose),
        ),
      )
      .orderBy(desc(emailOtpsTable.createdAt))
      .limit(1);
    if (last) {
      const elapsed = Date.now() - last.createdAt.getTime();
      if (elapsed < RESEND_COOLDOWN_MS) {
        return {
          ok: false,
          reason: "cooldown",
          retryInSec: Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000),
        };
      }
    }

    const code = String(
      crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000,
    ).padStart(6, "0");
    await db.insert(emailOtpsTable).values({
      email,
      purpose,
      codeHash: await Bun.password.hash(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });

    const text = `Your Finance Tracker verification code is ${code}.\nIt expires in 10 minutes. If you didn't request this, ignore this email.`;
    const html = `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px">
      <h2 style="margin:0 0 8px">${SUBJECTS[purpose]}</h2>
      <p style="color:#555">Use this code to continue. It expires in 10 minutes.</p>
      <p style="font-size:32px;letter-spacing:8px;font-weight:700;margin:24px 0">${code}</p>
      <p style="color:#888;font-size:12px">If you didn't request this, you can ignore this email.</p></div>`;
    const sent = await mailService.send(email, SUBJECTS[purpose], text, html);
    if (!IS_PROD)
      console.info(`[otp:dev] ${purpose} ${email} → ${code} (or ${DEV_OTP})`);
    return sent ? { ok: true } : { ok: false, reason: "mail_failed" };
  }

  /** Verifies and consumes the latest OTP. In dev, DEV_OTP always passes. */
  async verify(email: string, purpose: OtpPurpose, code: string) {
    const [otp] = await db
      .select()
      .from(emailOtpsTable)
      .where(
        and(
          eq(emailOtpsTable.email, email),
          eq(emailOtpsTable.purpose, purpose),
          isNull(emailOtpsTable.consumedAt),
        ),
      )
      .orderBy(desc(emailOtpsTable.createdAt))
      .limit(1);

    const devPass = !IS_PROD && code === DEV_OTP;
    if (!otp)
      return devPass ? { ok: true as const } : this.#bad("Request a new code");
    if (!devPass) {
      if (otp.expiresAt < new Date())
        return this.#bad("Code expired, request a new one");
      if (otp.attempts >= MAX_ATTEMPTS)
        return this.#bad("Too many wrong attempts, request a new code");
      const valid = await Bun.password.verify(code, otp.codeHash);
      if (!valid) {
        await db
          .update(emailOtpsTable)
          .set({ attempts: otp.attempts + 1 })
          .where(eq(emailOtpsTable.id, otp.id));
        return this.#bad("Incorrect code");
      }
    }
    await db
      .update(emailOtpsTable)
      .set({ consumedAt: new Date() })
      .where(eq(emailOtpsTable.id, otp.id));
    return { ok: true as const };
  }

  #bad(message: string) {
    return { ok: false as const, message };
  }
}

export const otpService = new OtpService();
