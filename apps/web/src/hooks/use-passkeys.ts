import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, call, callMsg } from "@/lib/api";

/** Loaded on demand so the WebAuthn code stays out of the main bundle. */
const webauthn = () => import("@passwordless-id/webauthn");

export const isPasskeySupported = () =>
  typeof window !== "undefined" && !!window.PublicKeyCredential;

/** A dismissed or timed-out native prompt throws; that isn't a failure. */
function passkeyErrorMessage(e: unknown) {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "AbortError")
    return "Passkey prompt was cancelled";
  if (name === "InvalidStateError")
    return "This device already has a passkey for your account";
  return (e as Error)?.message || "Passkey isn't available on this device";
}

/** Public slice of the system config (sign-ups open, passkey login, notice). */
export const usePublicConfig = () =>
  useQuery({
    queryKey: ["auth", "config"],
    queryFn: () => call(api.auth.config.get()),
    staleTime: 5 * 60 * 1000,
  });

/** Runs the passkey login ceremony; resolves like the password login call. */
export function usePasskeyLogin() {
  return useMutation({
    mutationFn: async () => {
      const options = await call(api.auth.passkey.login.options.post());
      const { client } = await webauthn();
      // No allowCredentials: the browser shows every passkey for this site.
      const credential = await client.authenticate({
        challenge: options.challenge,
        userVerification: "required",
      });
      return callMsg(
        api.auth.passkey.login.verify.post({
          challengeId: options.challengeId,
          credential,
        }),
      );
    },
    onError: (e) => toast.error(passkeyErrorMessage(e)),
  });
}

export const usePasskeys = () =>
  useQuery({
    queryKey: ["passkeys"],
    queryFn: () => call(api.passkeys.get()),
  });
export type Passkey = NonNullable<
  ReturnType<typeof usePasskeys>["data"]
>["passkeys"][number];

export function useAddPasskey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (title: string) => {
      const options = await call(api.passkeys.register.options.post());
      const { client, utils } = await webauthn();
      const credential = await client.register({
        user: options.user,
        challenge: options.challenge,
        userVerification: "required",
        // Discoverable, so login needs no email first.
        discoverable: "required",
        attestation: false,
        customProperties: {
          rp: { id: window.location.hostname, name: "Finance Tracker" },
          excludeCredentials: options.excludeCredentialIds.map((id) => ({
            id: utils.parseBase64url(id),
            type: "public-key",
          })),
        },
      });
      return callMsg(
        api.passkeys.register.verify.post({
          challengeId: options.challengeId,
          credential,
          title: title.trim() || undefined,
        }),
      );
    },
    onSuccess: ({ message }) => {
      toast.success(message);
      qc.invalidateQueries({ queryKey: ["passkeys"] });
    },
    onError: (e) => toast.error(passkeyErrorMessage(e)),
  });
}

export function useRemovePasskey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => callMsg(api.passkeys({ id }).delete()),
    onSuccess: ({ message }) => {
      toast.success(message);
      qc.invalidateQueries({ queryKey: ["passkeys"] });
    },
    onError: (e) => toast.error(e.message),
  });
}

/* ---------- admin: system config ---------- */

export const useSystemConfig = () =>
  useQuery({
    queryKey: ["admin", "system-config"],
    queryFn: () => call(api.admin["system-config"].get()),
  });
export type SystemConfigData = NonNullable<
  ReturnType<typeof useSystemConfig>["data"]
>;

export function useSaveSystemConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: SystemConfigData) =>
      callMsg(api.admin["system-config"].patch(config)),
    onSuccess: ({ data, message }) => {
      toast.success(message);
      qc.setQueryData(["admin", "system-config"], data);
      qc.invalidateQueries({ queryKey: ["auth", "config"] });
      qc.invalidateQueries({ queryKey: ["passkeys"] });
    },
    onError: (e) => toast.error(e.message),
  });
}
