import { registerSW } from "virtual:pwa-register";
import { toast } from "sonner";
import { create } from "zustand";

/** Chromium's install offer (`beforeinstallprompt`); not in TS's DOM lib. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

interface PwaState {
  /** Set while the browser is willing to install the app in one click. */
  installEvent: InstallPromptEvent | null;
  /** A new build is downloaded and waits for a reload. */
  needRefresh: boolean;
  update: () => void;
}

export const usePwa = create<PwaState>(() => ({
  installEvent: null,
  needRefresh: false,
  update: () => window.location.reload(),
}));

export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as { standalone?: boolean }).standalone === true;

/** iPhone/iPad Safari: no install API, only Share → Add to Home Screen. */
export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** Can we offer an install at all on this browser? */
export const canOfferInstall = (s: PwaState) =>
  !isStandalone() && (!!s.installEvent || isIOS());

/** Shows the browser's own install dialog. */
export async function installApp() {
  const e = usePwa.getState().installEvent;
  if (!e) return "unavailable" as const;
  await e.prompt();
  const { outcome } = await e.userChoice;
  // The event can only be used once.
  usePwa.setState({ installEvent: null });
  return outcome;
}

let listening = false;

/** Call once at startup: the install offer fires early and only once. */
export function listenForInstall() {
  if (listening) return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    usePwa.setState({ installEvent: e as InstallPromptEvent });
  });
  window.addEventListener("appinstalled", () => {
    usePwa.setState({ installEvent: null });
    toast.success(
      "Installed. Open Finance Tracker from your home screen or dock.",
    );
  });

  const updateSW = registerSW({
    onNeedRefresh() {
      usePwa.setState({ needRefresh: true, update: () => void updateSW(true) });
      toast("A new version is ready", {
        description: "Reload to get the latest. Unsynced changes are kept.",
        duration: Number.POSITIVE_INFINITY,
        action: { label: "Reload", onClick: () => void updateSW(true) },
      });
    },
    onOfflineReady() {
      toast.success("Ready to work offline");
    },
    onRegisteredSW(_url, registration) {
      // Long-lived tabs and installed apps check for a new build hourly.
      if (registration)
        setInterval(() => void registration.update(), 60 * 60_000);
    },
  });
}
