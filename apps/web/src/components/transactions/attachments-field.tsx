import { FileText, Paperclip, X } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/common/states";
import { Label } from "@/components/ui/label";
import {
  ATTACHMENT_ACCEPT,
  attachmentUrl,
  MAX_ATTACHMENTS,
  useAttachments,
  useDeleteAttachment,
  useUploadAttachments,
} from "@/hooks/use-attachments";

const tile =
  "relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl border bg-muted/40";

function Tile({
  href,
  name,
  isPdf,
  src,
  onRemove,
}: {
  href?: string;
  name: string;
  isPdf: boolean;
  src?: string;
  onRemove: () => void;
}) {
  const body = isPdf ? (
    <span className="flex flex-col items-center gap-1 px-1 text-muted-foreground">
      <FileText className="size-6" />
      <span className="w-full truncate text-center text-[10px]">{name}</span>
    </span>
  ) : (
    <img src={src} alt={name} className="size-full object-cover" />
  );
  return (
    <div className={tile}>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          title={name}
          className="grid size-full place-items-center"
        >
          {body}
        </a>
      ) : (
        body
      )}
      <button
        type="button"
        aria-label={`Remove ${name}`}
        onClick={onRemove}
        className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-black/60 text-white"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

/**
 * Bills and receipts for a transaction. With a `transactionId` files upload
 * and delete straight away; without one (a new entry) they wait in `pending`
 * and the form uploads them once the transaction exists.
 */
export function AttachmentsField({
  transactionId,
  pending,
  onPendingChange,
}: {
  transactionId?: number;
  pending: File[];
  onPendingChange: (files: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { data: saved = [] } = useAttachments(transactionId);
  const upload = useUploadAttachments(transactionId);
  const del = useDeleteAttachment(transactionId);

  const previews = useMemo(
    () =>
      pending.map((f) =>
        f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
      ),
    [pending],
  );
  useEffect(
    () => () => {
      for (const p of previews) if (p) URL.revokeObjectURL(p);
    },
    [previews],
  );

  const count = saved.length + pending.length;
  const room = MAX_ATTACHMENTS - count;

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!picked.length) return;
    if (picked.length > room)
      toast.error(`Up to ${MAX_ATTACHMENTS} files per transaction`);
    const files = picked.slice(0, room);
    if (!files.length) return;
    if (transactionId) upload.mutate(files);
    else onPendingChange([...pending, ...files]);
  };

  return (
    <div className="space-y-2">
      <Label>Bills &amp; receipts (optional)</Label>
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5">
        {saved.map((a) => (
          <Tile
            key={a.id}
            href={attachmentUrl(a.id)}
            src={attachmentUrl(a.id)}
            name={a.fileName}
            isPdf={a.contentType === "application/pdf"}
            onRemove={() => del.mutate(a.id)}
          />
        ))}
        {pending.map((f, i) => (
          <Tile
            key={`${f.name}-${f.lastModified}-${i}`}
            src={previews[i]}
            name={f.name}
            isPdf={!f.type.startsWith("image/")}
            onRemove={() => onPendingChange(pending.filter((_, j) => j !== i))}
          />
        ))}
        {upload.isPending && (
          <div className={tile}>
            <Spinner />
          </div>
        )}
        {room > 0 && !upload.isPending && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className={`${tile} border-dashed text-muted-foreground transition-colors hover:bg-muted`}
          >
            <span className="flex flex-col items-center gap-1 text-[11px]">
              <Paperclip className="size-5" />
              Add file
            </span>
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Photos or PDFs, up to {MAX_ATTACHMENTS} files of 10 MB each.
      </p>
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept={ATTACHMENT_ACCEPT}
        onChange={onPick}
      />
    </div>
  );
}
