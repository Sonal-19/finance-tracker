import type {
  AuthenticationJSON,
  RegistrationJSON,
} from "@passwordless-id/webauthn";
import { server } from "@passwordless-id/webauthn";
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "$/db";
import { passkeysTable } from "$/db/schema";
import { RP_ALLOWED_ORIGINS, RP_ID } from "$/env";
import { systemConfigService } from "./system-config-service";

type ChallengeEntry = {
  challenge: string;
  purpose: "register" | "login";
  /** set for "register" only; a login challenge has no user until the
   * credential arrives */
  userId?: number;
  expiresAt: number;
};

const CHALLENGE_TTL_MS = 2 * 60 * 1000;

/** Thrown for failures the user can act on; the message is safe to show. */
export class PasskeyError extends Error {}

const checkOrigin = (origin: string) =>
  RP_ALLOWED_ORIGINS
    ? RP_ALLOWED_ORIGINS.includes(origin)
    : origin.startsWith("http://localhost");

/**
 * WebAuthn ceremonies. Challenges live a couple of minutes, so they sit in
 * memory (single-process deployment, same as the token cache) and are
 * deleted on first use.
 */
class PasskeyService {
  #challenges = new Map<string, ChallengeEntry>();

  get #config() {
    return systemConfigService.SYSTEM_CONFIG.AUTH;
  }

  #assertEnabled() {
    if (!this.#config.PASSKEY_LOGIN_ENABLED)
      throw new PasskeyError("Passkeys are turned off right now");
  }

  #issueChallenge(purpose: ChallengeEntry["purpose"], userId?: number) {
    const now = Date.now();
    for (const [id, e] of this.#challenges)
      if (e.expiresAt < now) this.#challenges.delete(id);
    const challengeId = crypto.randomUUID();
    const challenge = server.randomChallenge();
    this.#challenges.set(challengeId, {
      challenge,
      purpose,
      userId,
      expiresAt: now + CHALLENGE_TTL_MS,
    });
    return { challengeId, challenge };
  }

  #consumeChallenge(
    challengeId: string,
    purpose: ChallengeEntry["purpose"],
    userId?: number,
  ) {
    const entry = this.#challenges.get(challengeId);
    this.#challenges.delete(challengeId);
    if (
      !entry ||
      entry.purpose !== purpose ||
      entry.expiresAt < Date.now() ||
      entry.userId !== userId
    )
      throw new PasskeyError("This request expired, please try again");
    return entry.challenge;
  }

  async #assertBelowCap(userId: number) {
    const max = this.#config.MAX_PASSKEYS_PER_USER;
    if (max <= 0) return;
    const [row] = await db
      .select({ n: count() })
      .from(passkeysTable)
      .where(eq(passkeysTable.userId, userId));
    if ((row?.n ?? 0) >= max)
      throw new PasskeyError(
        `You can have at most ${max} passkey${max === 1 ? "" : "s"}`,
      );
  }

  listForUser(userId: number) {
    return db
      .select({
        id: passkeysTable.id,
        title: passkeysTable.title,
        createdAt: passkeysTable.createdAt,
        lastUsedAt: passkeysTable.lastUsedAt,
      })
      .from(passkeysTable)
      .where(eq(passkeysTable.userId, userId))
      .orderBy(desc(passkeysTable.createdAt));
  }

  async beginRegistration(userId: number) {
    this.#assertEnabled();
    await this.#assertBelowCap(userId);
    const existing = await db
      .select({ credentialId: passkeysTable.credentialId })
      .from(passkeysTable)
      .where(eq(passkeysTable.userId, userId));
    return {
      ...this.#issueChallenge("register", userId),
      /** stops one authenticator being enrolled twice for the same user */
      excludeCredentialIds: existing.map((p) => p.credentialId),
    };
  }

  async completeRegistration(
    userId: number,
    challengeId: string,
    credential: unknown,
    title: string | undefined,
  ) {
    this.#assertEnabled();
    const challenge = this.#consumeChallenge(challengeId, "register", userId);
    let info: Awaited<ReturnType<typeof server.verifyRegistration>>;
    try {
      info = await server.verifyRegistration(credential as RegistrationJSON, {
        challenge,
        origin: checkOrigin,
        userVerified: true,
        domain: RP_ID,
      });
    } catch (err) {
      console.warn("[passkey] registration rejected:", (err as Error)?.message);
      throw new PasskeyError("Could not verify this passkey");
    }
    // Re-check: another registration may have raced in since `begin`.
    await this.#assertBelowCap(userId);
    const [row] = await db
      .insert(passkeysTable)
      .values({
        userId,
        credentialId: info.credential.id,
        publicKey: info.credential.publicKey,
        algorithm: info.credential.algorithm,
        transports: info.credential.transports ?? [],
        counter: info.authenticator.counter ?? 0,
        title: title?.trim() || info.authenticator.name || "Passkey",
      })
      .onConflictDoNothing({ target: passkeysTable.credentialId })
      .returning({ id: passkeysTable.id });
    if (!row) throw new PasskeyError("This passkey is already registered");
    return row;
  }

  beginLogin() {
    this.#assertEnabled();
    return this.#issueChallenge("login");
  }

  /** Resolves the owning user id; the caller issues the session. */
  async completeLogin(challengeId: string, credential: unknown) {
    this.#assertEnabled();
    const challenge = this.#consumeChallenge(challengeId, "login");
    const assertion = credential as AuthenticationJSON;
    const failed = new PasskeyError("This passkey isn't recognised");
    if (typeof assertion?.id !== "string") throw failed;
    const [passkey] = await db
      .select()
      .from(passkeysTable)
      .where(eq(passkeysTable.credentialId, assertion.id))
      .limit(1);
    if (!passkey) throw failed;
    try {
      const info = await server.verifyAuthentication(
        assertion,
        {
          id: passkey.credentialId,
          publicKey: passkey.publicKey,
          algorithm: passkey.algorithm as "ES256" | "RS256" | "EdDSA",
          transports: passkey.transports as AuthenticatorTransport[],
        },
        {
          challenge,
          origin: checkOrigin,
          userVerified: true,
          counter: passkey.counter,
          domain: RP_ID,
        },
      );
      await db
        .update(passkeysTable)
        .set({ counter: info.counter, lastUsedAt: new Date() })
        .where(eq(passkeysTable.id, passkey.id));
    } catch (err) {
      console.warn("[passkey] login rejected:", (err as Error)?.message);
      throw failed;
    }
    return passkey.userId;
  }

  /** Returns false when the passkey doesn't exist or isn't the caller's. */
  async remove(userId: number, passkeyId: number) {
    const rows = await db
      .delete(passkeysTable)
      .where(
        and(eq(passkeysTable.id, passkeyId), eq(passkeysTable.userId, userId)),
      )
      .returning({ id: passkeysTable.id });
    return rows.length > 0;
  }
}

export const passkeyService = new PasskeyService();
