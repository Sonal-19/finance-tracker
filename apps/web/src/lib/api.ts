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
  ) {
    super(message);
  }
}

type Envelope<T> = T extends { data: infer D } ? D : never;

/**
 * Unwraps an Eden call: throws ApiError on non-2xx (with the server's
 * message) and returns the `data` field of the `{ success, message, data }`
 * envelope.
 */
export async function call<R extends { data: unknown; error: unknown }>(
  p: Promise<R>,
): Promise<Envelope<NonNullable<R["data"]>>> {
  const res = (await p) as unknown as {
    data: { data: unknown } | null;
    error: { status: number; value: unknown } | null;
    status: number;
  };
  if (res.error) {
    const v = res.error.value as
      | { message?: string; summary?: string }
      | string;
    const message =
      typeof v === "string"
        ? v
        : (v?.message ?? v?.summary ?? `Request failed (${res.error.status})`);
    throw new ApiError(message, res.error.status);
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
