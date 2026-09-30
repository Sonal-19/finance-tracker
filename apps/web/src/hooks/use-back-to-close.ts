import { useEffect, useRef } from "react";
import { pushBackHandler } from "@/lib/back-stack";

/** While `open`, the device/browser back button calls `onClose` instead of leaving the page. */
export function useBackToClose(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    return pushBackHandler(() => onCloseRef.current());
  }, [open]);
}
