/** What a sign-in came from, worked out from its User-Agent. Good enough to
 * tell someone's phone from their laptop; not a fingerprint. */
export type DeviceKind = "desktop" | "mobile" | "tablet" | "unknown";
export type DeviceInfo = {
  /** e.g. "Chrome on macOS", "Safari on iPhone" */
  name: string;
  browser: string;
  os: string;
  kind: DeviceKind;
};

// Order matters: Edge and Opera also say "Chrome", Chrome also says "Safari".
const BROWSERS: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\bOPR\/|\bOpera\b/, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\bCriOS\/|\bChrome\//, "Chrome"],
  [/\bVersion\/[\d.]+.*Safari\//, "Safari"],
  [/\bcurl\//, "curl"],
];

export function describeDevice(ua: string | null | undefined): DeviceInfo {
  if (!ua)
    return { name: "Unknown device", browser: "", os: "", kind: "unknown" };

  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1] ?? "";
  let os = "";
  let kind: DeviceKind = "desktop";
  if (/\biPad\b/.test(ua)) {
    os = "iPad";
    kind = "tablet";
  } else if (/\biPhone\b|\biPod\b/.test(ua)) {
    os = "iPhone";
    kind = "mobile";
  } else if (/\bAndroid\b/.test(ua)) {
    os = "Android";
    // Android tablets leave "Mobile" out of the UA.
    kind = /\bMobile\b/.test(ua) ? "mobile" : "tablet";
  } else if (/\bWindows\b/.test(ua)) os = "Windows";
  else if (/\bCrOS\b/.test(ua)) os = "ChromeOS";
  else if (/\bMac OS X\b|\bMacintosh\b/.test(ua)) os = "macOS";
  else if (/\bLinux\b/.test(ua)) os = "Linux";
  else kind = "unknown";

  const name =
    browser && os ? `${browser} on ${os}` : browser || os || "Unknown device";
  return { name, browser, os, kind };
}
