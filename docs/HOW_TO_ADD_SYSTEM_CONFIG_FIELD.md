# How to add a new `SYSTEM_CONFIG` field

`SYSTEM_CONFIG` is the app's single runtime-editable config object: feature
toggles and limits an admin can change without a deploy. It's defined once in
code as the default, persisted as a JSONB blob in the `system_config` table
(row `id = 1`), loaded into memory at boot by `systemConfigService` (next to
the token cache in `src/index.ts`), and patched from the admin-only
**System config** page.

A field lives in four places:

```
apps/api/src/db/schema/system/system-config.sql.ts      (1) default value
apps/api/src/…/wherever-you-read-it.ts                  (2) read it
apps/api/src/controllers/system-config-controller.ts    (3) PATCH validation
apps/web/src/routes/_app/system-config.tsx              (4) form field
```

Steps 3–4 are only needed if an admin should be able to edit the field.

## 1. Add the default value

In `system-config.sql.ts`, add the key to the matching group (`AUTH`, `FX`,
`NOTICE`, or a new group) with a doc comment that states the unit.

```ts
AUTH: {
  ...
  /** passkeys one user may register; 0 = unlimited */
  MAX_PASSKEYS_PER_USER: 0,
},
```

This is the only place the default lives. A database whose row predates the
key falls back to it through `deepMerge` in `system-config-service.ts`, so the
config row needs no migration or backfill.

## 2. Read it

```ts
import { systemConfigService } from "$/lib/services/system-config-service";

const { MAX_PASSKEYS_PER_USER } = systemConfigService.SYSTEM_CONFIG.AUTH;
```

Always read through the service, at the moment you need the value. The raw
`SYSTEM_CONFIG` export is only the default, and a value copied into a
module-level constant never sees later edits.

## 3. Backend PATCH validation

Add the key to the matching group in `UpdateSystemConfigSchema`
(`system-config-controller.ts`). A key missing from the schema is stripped
from incoming patches, so admins can't change it.

```ts
AUTH: t.Optional(
  t.Object({
    ...
    MAX_PASSKEYS_PER_USER: t.Integer({ minimum: 0, maximum: 1000 }),
  }),
),
```

Each group is optional, but every key inside a group is required: the page
always sends whole groups.

## 4. Form field

In `apps/web/src/routes/_app/system-config.tsx`, add a control to the right
`SectionCard`: a `ToggleRow` for booleans, an `Input` for numbers (keep the
text in its own `useState`, validate it, and fold the parsed number into
`payload`, as `MAX_PASSKEYS_PER_USER` does). The form's type comes from the
API response through Eden, so there is no separate frontend type to update.

## 5. Does a logged-out page need it?

`GET /api/admin/system-config` is admin-only. Anything the login page or the
app shell needs (is passkey login on, the notice text) is exposed through
`GET /api/auth/config` in `auth-controller.ts`; add the value there and read
it with `usePublicConfig()`. Only expose what a stranger may see.

## Checklist

- [ ] Default and doc comment in `system-config.sql.ts`
- [ ] Read through `systemConfigService.SYSTEM_CONFIG`
- [ ] Validation in `UpdateSystemConfigSchema` (skip if not admin-editable)
- [ ] Form field in `system-config.tsx` (skip if not admin-editable)
- [ ] `bun run typecheck` and `bun run lint` clean

## Good to know

- **Who is an admin:** `users.role = 'admin'`. Promote someone with
  `bun run --cwd apps/api db:make-admin <email>` (add `user` to demote).
  On production use `bun run deploy:make-admin <email>`, which runs the same
  script through the SSH tunnel.
- **Every save is audited** in `system_config_history` with the full before
  and after config and who made the change.
- **The API is single-process**, so the in-memory copy is always current
  after a save. Running more than one instance would need a reload signal.
- **Removing a key:** delete it from the default; `deepMerge` drops keys the
  code no longer knows about the next time the config is loaded or saved.
