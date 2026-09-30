export function ok<T>(data: T, message = "OK") {
  return { success: true as const, message, data };
}

export function fail(message: string) {
  return { success: false as const, message, data: null };
}

export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
