import type { Server } from "@api";
import { treaty } from "@elysiajs/eden";

/** Same-origin in dev (Vite proxy) and prod (nginx), cookie-based auth. */
const origin =
  typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:3300";

export const client = treaty<Server>(origin, {
  fetch: { credentials: "include" },
  // Keep "2026-09-27" date-only values as strings (no UTC Date shifting).
  parseDate: false,
});

export const api = client.api;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** The envelope's `data` on an error (e.g. the saved row on a 409). */
    readonly data: unknown = null,
  ) {
    super(message);
  }
  /** No usable answer (offline, server down or erroring, proxy timeout):
   * worth trying again later rather than treating as a refusal. */
  get isNetwork() {
    return this.status === 0 || this.status >= 500;
  }
}

const OFFLINE_MESSAGE = "You're offline. This needs a connection.";

type Envelope<T> = T extends { data: infer D } ? D : never;

/**
 * Unwraps an Eden call: throws ApiError on non-2xx (with the server's
 * message) and returns the `data` field of the `{ success, message, data }`
 * envelope.
 */
export async function call<R extends { data: unknown; error: unknown }>(
  p: Promise<R>,
): Promise<Envelope<NonNullable<R["data"]>>> {
  let res: {
    data: { data: unknown } | null;
    error: { status: number; value: unknown } | null;
    status: number;
  };
  try {
    res = (await p) as unknown as typeof res;
  } catch {
    // fetch itself threw: no network at all.
    throw new ApiError(OFFLINE_MESSAGE, 0);
  }
  if (res.error) {
    const v = res.error.value as
      | { message?: string; summary?: string; data?: unknown }
      | string;
    const status = res.error.status ?? 0;
    const message =
      typeof v === "string"
        ? v
        : (v?.message ?? v?.summary ?? `Request failed (${status})`);
    throw new ApiError(
      status === 0
        ? OFFLINE_MESSAGE
        : status >= 502 && typeof v !== "object"
          ? "Can't reach the server right now. Try again in a moment."
          : message,
      status,
      typeof v === "object" ? v?.data : null,
    );
  }
  return (res.data?.data ?? null) as Envelope<NonNullable<R["data"]>>;
}

/** Same as call() but also returns the server's success message (for toasts). */
export async function callMsg<R extends { data: unknown; error: unknown }>(
  p: Promise<R>,
): Promise<{ data: Envelope<NonNullable<R["data"]>>; message: string }> {
  const res = (await p) as unknown as {
    data: { data: unknown; message: string } | null;
  };
  const data = await call(Promise.resolve(res as unknown as R));
  return { data, message: res.data?.message ?? "Done" };
}
