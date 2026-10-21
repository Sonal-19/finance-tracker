import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, call } from "@/lib/api";

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
/** What the file picker offers. Leaving HEIC out makes iPhones hand over a JPEG. */
export const ATTACHMENT_ACCEPT =
  "image/jpeg,image/png,image/webp,application/pdf";

export const attachmentUrl = (id: number) => `/api/attachments/${id}/file`;

export const useAttachments = (transactionId?: number) =>
  useQuery({
    queryKey: ["attachments", transactionId],
    queryFn: () =>
      call(
        api.attachments.get({
          query: { transactionId: transactionId as number },
        }),
      ),
    enabled: !!transactionId,
  });
export type Attachment = NonNullable<
  ReturnType<typeof useAttachments>["data"]
>[number];

/** Uploads one after another; resolves to the names that failed. */
export async function uploadAttachments(transactionId: number, files: File[]) {
  const failed: string[] = [];
  for (const file of files) {
    try {
      if (file.size > MAX_ATTACHMENT_BYTES)
        throw new Error("Files can be up to 10 MB");
      await call(api.attachments.post({ transactionId, file }));
    } catch (e) {
      failed.push(file.name);
      toast.error(`${file.name}: ${(e as Error).message}`);
    }
  }
  return failed;
}

function useInvalidateAttachments() {
  const qc = useQueryClient();
  return (transactionId: number) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["attachments", transactionId] }),
      // The list shows a paperclip for entries with files.
      qc.invalidateQueries({ queryKey: ["transactions"] }),
    ]);
}

export function useUploadAttachments(transactionId?: number) {
  const invalidate = useInvalidateAttachments();
  return useMutation({
    mutationFn: (files: File[]) =>
      uploadAttachments(transactionId as number, files),
    onSettled: () => transactionId && invalidate(transactionId),
  });
}

export function useDeleteAttachment(transactionId?: number) {
  const invalidate = useInvalidateAttachments();
  return useMutation({
    mutationFn: (id: number) => call(api.attachments({ id }).delete()),
    onSuccess: () => transactionId && invalidate(transactionId),
    onError: (e: Error) => toast.error(e.message),
  });
}
