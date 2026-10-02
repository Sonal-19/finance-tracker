import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { SectionCard } from "@/components/app/section-card";
import { Field } from "@/components/common/field";
import { PageHeader } from "@/components/common/page-header";
import { ErrorState, PageLoader } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import {
  type SystemConfigData,
  useSaveSystemConfig,
  useSystemConfig,
} from "@/hooks/use-passkeys";

export const Route = createFileRoute("/_app/system-config")({
  component: SystemConfigPage,
});

// NOTE TO FUTURE EDITORS: every admin-editable SYSTEM_CONFIG key needs a
// field here, in lockstep with the defaults and UpdateSystemConfigSchema in
// apps/api - see docs/HOW_TO_ADD_SYSTEM_CONFIG_FIELD.md. The form state is
// typed off the API response, so a key added on the server and not handled
// here still round-trips untouched.

function SystemConfigPage() {
  const { user } = useAuth();
  const { data, isLoading, error } = useSystemConfig();

  if (user && user.role !== "admin")
    return <Navigate to="/dashboard" replace />;

  return (
    <div className="max-w-2xl space-y-5">
      <PageHeader
        title="System config"
        description="App-wide switches and limits. Changes apply to everyone immediately."
      />
      {isLoading ? (
        <PageLoader />
      ) : error || !data ? (
        <ErrorState error={error} />
      ) : (
        // Re-seed the form whenever the saved config changes.
        <SystemConfigForm key={JSON.stringify(data)} config={data} />
      )}
    </div>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </label>
      <Switch
        id={id}
        className="mt-0.5"
        checked={checked}
        onCheckedChange={onChange}
      />
    </div>
  );
}

function SystemConfigForm({ config }: { config: SystemConfigData }) {
  const [form, setForm] = useState(config);
  // Numbers are edited as text so the field can be cleared while typing.
  const [maxPasskeys, setMaxPasskeys] = useState(
    String(config.AUTH.MAX_PASSKEYS_PER_USER),
  );
  const [fxFallback, setFxFallback] = useState(
    String(config.FX.FALLBACK_USD_INR),
  );
  const save = useSaveSystemConfig();

  const setAuth = (patch: Partial<SystemConfigData["AUTH"]>) =>
    setForm((f) => ({ ...f, AUTH: { ...f.AUTH, ...patch } }));
  const setNotice = (patch: Partial<SystemConfigData["NOTICE"]>) =>
    setForm((f) => ({ ...f, NOTICE: { ...f.NOTICE, ...patch } }));

  const maxPasskeysNum = Number(maxPasskeys);
  const fxFallbackNum = Number(fxFallback);
  const maxPasskeysOk =
    maxPasskeys.trim() !== "" &&
    Number.isInteger(maxPasskeysNum) &&
    maxPasskeysNum >= 0 &&
    maxPasskeysNum <= 1000;
  const fxFallbackOk = fxFallbackNum >= 1 && fxFallbackNum <= 10_000;

  const payload: SystemConfigData = {
    ...form,
    AUTH: { ...form.AUTH, MAX_PASSKEYS_PER_USER: maxPasskeysNum },
    FX: { ...form.FX, FALLBACK_USD_INR: fxFallbackNum },
  };
  const dirty = JSON.stringify(payload) !== JSON.stringify(config);

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(payload);
      }}
    >
      <SectionCard title="Sign-in">
        <div className="space-y-4">
          <ToggleRow
            id="cfg-registration"
            label="Allow new sign-ups"
            hint="When off, nobody can create an account. Existing users can still log in."
            checked={form.AUTH.REGISTRATION_ENABLED}
            onChange={(v) => setAuth({ REGISTRATION_ENABLED: v })}
          />
          <ToggleRow
            id="cfg-passkey-login"
            label="Sign in with passkey"
            hint="When off, the passkey button is hidden and no new passkeys can be added. Saved passkeys are kept."
            checked={form.AUTH.PASSKEY_LOGIN_ENABLED}
            onChange={(v) => setAuth({ PASSKEY_LOGIN_ENABLED: v })}
          />
          <Field
            label="Passkeys per user"
            htmlFor="cfg-max-passkeys"
            hint="0 means unlimited. Lowering it doesn't remove passkeys people already have."
          >
            <Input
              id="cfg-max-passkeys"
              inputMode="numeric"
              className="max-w-32"
              aria-invalid={!maxPasskeysOk}
              value={maxPasskeys}
              onChange={(e) => setMaxPasskeys(e.target.value)}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Notice banner">
        <div className="space-y-4">
          <ToggleRow
            id="cfg-notice"
            label="Show a notice"
            hint="Appears at the top of the app for every logged-in user."
            checked={form.NOTICE.ENABLED}
            onChange={(v) => setNotice({ ENABLED: v })}
          />
          <Field label="Message" htmlFor="cfg-notice-message">
            <Textarea
              id="cfg-notice-message"
              rows={3}
              maxLength={500}
              value={form.NOTICE.MESSAGE}
              onChange={(e) => setNotice({ MESSAGE: e.target.value })}
              placeholder="e.g. Scheduled maintenance tonight at 11 pm."
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Currency">
        <Field
          label="Fallback USD → INR rate"
          htmlFor="cfg-fx-fallback"
          hint="Rupees per dollar, used only when no live exchange rate can be fetched."
        >
          <Input
            id="cfg-fx-fallback"
            inputMode="decimal"
            className="max-w-32"
            aria-invalid={!fxFallbackOk}
            value={fxFallback}
            onChange={(e) => setFxFallback(e.target.value)}
          />
        </Field>
      </SectionCard>

      <Button
        type="submit"
        disabled={!dirty || !maxPasskeysOk || !fxFallbackOk || save.isPending}
      >
        {save.isPending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
