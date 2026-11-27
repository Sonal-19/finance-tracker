import { useMutation, useQuery } from "@tanstack/react-query";
import { api, call } from "@/lib/api";

/** Whether this user gets "Scan receipt" (admin switch + server set up).
 * Cached like everything else, so the button doesn't flicker on reload. */
export const useScanAvailable = () =>
  useQuery({
    queryKey: ["receipts", "config"],
    queryFn: () => call(api.receipts.config.get()),
    staleTime: 10 * 60 * 1000,
    select: (d) => d.available,
  });

export const scanReceipt = (file: File) =>
  call(api.receipts.scan.post({ file }));

export type ReceiptScan = Awaited<ReturnType<typeof scanReceipt>>;
export type ScanWord = ReceiptScan["words"][number];

export const useScanReceipt = () => useMutation({ mutationFn: scanReceipt });
