import { t } from "elysia";

/**
 * String enum validator without Elysia's implicit default.
 * `t.UnionEnum` sets `default: values[0]`, which silently fills missing
 * optional query/body fields (e.g. a PATCH without `status` would reset it).
 */
export const tEnum = <const T extends readonly string[]>(values: T) =>
  t.UnionEnum([...values] as unknown as [T[number], ...T[number][]], {
    default: undefined,
  });
