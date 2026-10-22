// Helpers shared by the two JSONB configs (`system_config` and
// `user_config`): code defaults merged with whatever row is stored.

export type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Recursively merges `override` onto `base`, keyed on `base`'s shape, so a
 * persisted row that predates a newly added nested key doesn't wipe it out
 * (a shallow spread would replace the whole nested object with the stale
 * copy). Keys the code no longer knows about are dropped. An empty object in
 * `base` is a free-form map (e.g. a user's shortcut changes): the stored one
 * is taken as it is. */
export function deepMerge<T>(base: T, override: unknown): T {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    if (override === undefined) return base;
    // A stored value of the wrong kind (old shape, hand edit) loses to the default.
    if (isPlainObject(base) !== isPlainObject(override)) return base;
    return override as T;
  }
  if (!Object.keys(base).length) return { ...override } as T;
  const result: Record<string, unknown> = { ...base };
  for (const key of Object.keys(base)) {
    result[key] = deepMerge(base[key], override[key]);
  }
  return result as T;
}

/** A saved config with `patch` applied: each key of a patched group is
 * replaced as a whole (so a map like a palette can lose entries), and a
 * group that is itself a free-form map (`{}` in the defaults) is replaced
 * outright. The result is fitted back onto the code defaults. */
export function applyPatch<T>(defaults: T, current: T, patch: unknown): T {
  const next: Record<string, unknown> = { ...(current as object) };
  const base = defaults as Record<string, unknown>;
  if (isPlainObject(patch))
    for (const [group, value] of Object.entries(patch)) {
      const before = next[group];
      const isMap =
        isPlainObject(base[group]) && !Object.keys(base[group]).length;
      next[group] =
        !isMap && isPlainObject(before) && isPlainObject(value)
          ? { ...before, ...value }
          : value;
    }
  return deepMerge(defaults, next);
}
