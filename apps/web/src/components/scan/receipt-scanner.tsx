// The receipt scanner overlay. Loaded on demand (React.lazy in the app
// shell), so none of this — or the canvas effects — is in the main bundle.

import {
  Camera,
  ChevronDown,
  ImagePlus,
  ListChecks,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  WifiOff,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccountPicker } from "@/components/app/pickers";
import { CategoryIcon } from "@/components/common/category-icon";
import { DateInput } from "@/components/common/date-input";
import { Segmented } from "@/components/common/segmented";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveAccounts, useActiveEvent } from "@/hooks/use-accounts";
import { useActiveBooks, useBookScope } from "@/hooks/use-books";
import {
  type Currency,
  type TxnType,
  useCategories,
  useSaveTransaction,
} from "@/hooks/use-finance";
import { type ReceiptScan, scanReceipt } from "@/hooks/use-receipt-scan";
import { ApiError } from "@/lib/api";
import { pushBackHandler } from "@/lib/back-stack";
import { formatAmount, fromAmount, toAmount, todayStr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useScanStore } from "@/stores/scan-store";
import { useTxnSheet } from "@/stores/txn-sheet-store";
import { type FxTarget, prefersReducedMotion, ScanFx } from "./scan-fx";

type Step = "pick" | "reading" | "reveal" | "review" | "error";

type Form = {
  type: TxnType;
  currency: Currency;
  amount: string;
  date: string;
  note: string;
  categoryId: number | null;
  accountId: number | null;
};

const SYMBOL: Record<Currency, string> = { INR: "₹", USD: "$" };
const MAX_SIDE = 2000;
const HINTS = [
  "Reading your receipt…",
  "Finding the total…",
  "Looking for the date…",
  "Working out what it was for…",
];

/** Upright, at most 2000px, as JPEG: what is sent, shown and attached (so
 * the boxes Google returns line up with what is on screen). */
async function prepareImage(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const k = Math.min(
      1,
      MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const w = Math.round(img.naturalWidth * k);
    const h = Math.round(img.naturalHeight * k);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, "image/jpeg", 0.88),
    );
    if (!blob) throw new Error("encode");
    const stamp = todayStr().replaceAll("-", "");
    return {
      file: new File([blob], `receipt-${stamp}.jpg`, { type: "image/jpeg" }),
      ratio: w / h,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The first image among pasted/dropped things. */
function pickImage(list: FileList | DataTransferItemList | null | undefined) {
  if (!list) return null;
  for (let k = 0; k < list.length; k++) {
    const item = list[k]!;
    const f =
      item instanceof File
        ? item
        : item.kind === "file"
          ? item.getAsFile()
          : null;
    if (f?.type.startsWith("image/")) return f;
  }
  return null;
}

export default function ReceiptScanner() {
  const { open, session, file: handed, close } = useScanStore();
  const openNew = useTxnSheet((s) => s.openNew);
  const { data: categories = [] } = useCategories();
  const { defaultAccount } = useActiveAccounts();
  const activeEvent = useActiveEvent();
  const { defaultBook } = useActiveBooks();
  const scope = useBookScope();
  const save = useSaveTransaction();

  const [step, setStep] = useState<Step>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [ratio, setRatio] = useState(0.75);
  const [photo, setPhoto] = useState<string | null>(null);
  const [imgReady, setImgReady] = useState(false);
  const [scan, setScan] = useState<ReceiptScan | null>(null);
  const [error, setError] = useState<{
    message: string;
    offline: boolean;
  } | null>(null);
  const [landed, setLanded] = useState<Set<string>>(new Set());
  const [hint, setHint] = useState(0);
  const [showItems, setShowItems] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [form, setForm] = useState<Form | null>(null);

  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fxRef = useRef<ScanFx | null>(null);
  const runRef = useRef(0);
  const refs = {
    amount: useRef<HTMLInputElement>(null),
    note: useRef<HTMLInputElement>(null),
    date: useRef<HTMLDivElement>(null),
    category: useRef<HTMLButtonElement>(null),
    account: useRef<HTMLDivElement>(null),
  };

  const reset = useCallback(() => {
    runRef.current++;
    fxRef.current?.destroy();
    fxRef.current = null;
    setStep("pick");
    setFile(null);
    setPhoto((p) => {
      if (p) URL.revokeObjectURL(p);
      return null;
    });
    setImgReady(false);
    setScan(null);
    setError(null);
    setLanded(new Set());
    setForm(null);
    setShowItems(false);
  }, []);

  const start = useCallback(
    async (raw: File) => {
      reset();
      const run = ++runRef.current;
      let prepared: File;
      try {
        const p = await prepareImage(raw);
        prepared = p.file;
        setRatio(p.ratio);
      } catch {
        setError({
          message: "Couldn't open that photo. Try a JPG or PNG.",
          offline: false,
        });
        setStep("error");
        return;
      }
      if (run !== runRef.current) return;
      setFile(prepared);
      setPhoto(URL.createObjectURL(prepared));
      setStep("reading");
      if (!navigator.onLine) {
        setError({ message: "Scanning needs a connection.", offline: true });
        setStep("error");
        return;
      }
      try {
        const result = await scanReceipt(prepared);
        if (run !== runRef.current) return;
        setScan(result);
        setStep("reveal");
      } catch (e) {
        if (run !== runRef.current) return;
        const offline = e instanceof ApiError && e.status === 0;
        setError({ message: (e as Error).message, offline });
        setStep("error");
      }
    },
    [reset],
  );

  // Every open starts fresh; a handed-over file (paste/drop) goes straight in.
  useEffect(() => {
    if (!open) return;
    if (handed) void start(handed);
    else reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, session]);

  // Back button / Esc close the overlay.
  useEffect(() => {
    if (!open) return;
    const release = pushBackHandler(close);
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        !document.querySelector("[data-radix-popper-content-wrapper]")
      )
        close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      release();
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  // Paste a screenshot anywhere while the overlay is open.
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const f = pickImage(e.clipboardData?.items);
      if (f) {
        e.preventDefault();
        void start(f);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open, start]);

  useEffect(() => () => fxRef.current?.destroy(), []);
  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  // Rotating hints while Google reads it.
  useEffect(() => {
    if (step !== "reading") return;
    setHint(0);
    const t = setInterval(() => setHint((h) => (h + 1) % HINTS.length), 1400);
    return () => clearInterval(t);
  }, [step]);

  // The sweep starts as soon as the photo is on screen.
  useEffect(() => {
    if (!imgReady || !canvasRef.current || !imgRef.current || fxRef.current)
      return;
    fxRef.current = new ScanFx(canvasRef.current, imgRef.current);
    if (step === "reading") fxRef.current.scan();
  }, [imgReady, step]);

  // The words are back: fill the form (ghosted) and fly the words into it.
  useEffect(() => {
    if (step !== "reveal" || !scan || !imgReady) return;
    const fallbackAccount = defaultAccount?.id ?? null;
    setForm({
      type: scan.type,
      currency: scan.currency,
      amount: scan.amount ? String(fromAmount(scan.amount.value)) : "",
      date: scan.date?.value ?? todayStr(),
      note: scan.note,
      categoryId: scan.category?.id ?? null,
      accountId: scan.account?.id ?? fallbackAccount,
    });
    const words = scan.words;
    const find = (re: RegExp) =>
      words.flatMap((w, i) => (re.test(w.t) ? [i] : []));
    const spotted = scan.category?.reason.match(/“(.+)”/)?.[1];
    const targets: FxTarget[] = [
      {
        key: "amount",
        words: scan.amount?.words ?? [],
        el: () => refs.amount.current,
      },
      {
        key: "date",
        words: scan.date?.words ?? [],
        el: () => refs.date.current,
      },
      {
        key: "note",
        words: [...(scan.merchant?.words ?? []), ...scan.itemWords],
        el: () => refs.note.current,
      },
      {
        key: "category",
        words: spotted
          ? find(
              new RegExp(
                `^\\W*${spotted.split(/\s+/)[0]!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
                "i",
              ),
            ).slice(0, 2)
          : [],
        el: () => refs.category.current,
      },
      {
        key: "account",
        words: scan.account
          ? find(
              /^(?:cash|upi|paytm|gpay|phonepe|bhim|x+\d{4}|\*+\d{4})$/i,
            ).slice(0, 2)
          : [],
        el: () => refs.account.current,
      },
    ];
    let cancelled = false;
    // One frame so the card is laid out before measuring where words go.
    const raf = requestAnimationFrame(() => {
      const fx = fxRef.current;
      const land = (key: string) =>
        !cancelled && setLanded((s) => new Set(s).add(key));
      const finish = () => !cancelled && setStep("review");
      if (!fx) {
        for (const t of targets) land(t.key);
        finish();
        return;
      }
      fx.reveal(words, targets, land).then(finish);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, scan, imgReady]);

  const cats = useMemo(
    () => categories.filter((c) => c.type === form?.type),
    [categories, form?.type],
  );
  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));
  const amount = toAmount(Number(form?.amount ?? 0));
  const valid = !!form && amount > 0 && form.categoryId !== null && !!form.date;
  const shown = (key: string) => step === "review" || landed.has(key);

  const saveNow = () => {
    if (!form || !valid || form.categoryId === null || !file) return;
    save.mutate(
      {
        files: [file],
        type: form.type,
        amount,
        currency: form.currency,
        categoryId: form.categoryId,
        date: form.date,
        ...(form.accountId && { accountId: form.accountId }),
        ...((scope.bookId ?? defaultBook?.id) && {
          bookId: (scope.bookId ?? defaultBook?.id)!,
        }),
        eventId: activeEvent?.id ?? null,
        note: form.note.trim() || null,
      },
      { onSuccess: close },
    );
  };

  /** Everything into the full form (more fields, or no category yet). */
  const moreOptions = () => {
    const f = form;
    close();
    openNew(f?.type ?? "debit", {
      ...(f && amount > 0 && { amount }),
      ...(f?.currency && { currency: f.currency }),
      ...(f?.note && { note: f.note }),
      ...(f?.categoryId && { categoryId: f.categoryId }),
      ...(f?.date && { date: f.date }),
      ...(f?.accountId && { accountId: f.accountId }),
      ...(file && { files: [file] }),
    });
  };

  if (!open) return null;

  const reading = step === "reading";
  const review = step === "reveal" || step === "review";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan receipt"
      className="fixed inset-0 z-[60] flex flex-col bg-neutral-950/95 text-white backdrop-blur-xl"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = pickImage(e.dataTransfer.files);
        if (f) void start(f);
      }}
      onPointerDown={() => step === "reveal" && fxRef.current?.skip()}
    >
      <header className="pt-safe flex items-center gap-2 px-4 py-3">
        <span className="scan-orb grid size-8 place-items-center rounded-full">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold leading-tight">Scan receipt</p>
          <p className="truncate text-xs text-white/60" aria-live="polite">
            {step === "pick"
              ? "Take a photo or pick one. You can check everything before saving."
              : reading
                ? HINTS[hint]
                : step === "reveal"
                  ? "Tap to skip"
                  : step === "review" && scan
                    ? `Read ${scan.words.length} words in ${(scan.ms / 1000).toFixed(1)}s`
                    : ""}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10 hover:text-white"
          onClick={close}
          aria-label="Close scanner"
        >
          <X />
        </Button>
      </header>

      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void start(f);
        }}
      />
      <input
        ref={galleryInput}
        type="file"
        // Leaving HEIC out makes iPhones hand over a JPEG.
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void start(f);
        }}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-4 md:flex-row md:px-6 md:pb-6">
        {/* The photo (or the picker) */}
        <div
          className={cn(
            "relative grid min-h-0 place-items-center",
            review ? "h-[34vh] shrink-0 md:h-auto md:flex-1" : "flex-1",
          )}
          // The photo's frame is sized from this box (container units).
          style={{ containerType: "size" }}
        >
          {step === "pick" || (step === "error" && !photo) ? (
            <Picker
              dragging={dragging}
              onCamera={() => cameraInput.current?.click()}
              onGallery={() => galleryInput.current?.click()}
              error={step === "error" ? error?.message : undefined}
            />
          ) : (
            photo && (
              <div
                className={cn(
                  "relative rounded-2xl p-[3px] transition-[filter,opacity] duration-700",
                  reading && "scan-ring",
                  step === "review" && "opacity-80",
                )}
                style={{
                  width: `min(100cqw, calc(100cqh * ${ratio}))`,
                  aspectRatio: String(ratio),
                }}
              >
                <img
                  ref={imgRef}
                  src={photo}
                  alt="Your receipt"
                  onLoad={() => setImgReady(true)}
                  className="block size-full rounded-[13px] object-contain"
                />
              </div>
            )
          )}
        </div>

        {/* The card: what was read, editable */}
        {(review || (step === "error" && photo)) && (
          <section
            className={cn(
              "scan-card min-h-0 flex-1 overflow-y-auto rounded-3xl bg-card p-4 text-card-foreground shadow-2xl md:w-[26rem] md:flex-none md:p-5",
            )}
          >
            {step === "error" ? (
              <ErrorCard
                error={error}
                onRetry={() => file && void start(file)}
                onOther={reset}
                onManual={moreOptions}
              />
            ) : (
              form && (
                <div className="space-y-4">
                  <Segmented
                    className="w-full"
                    size="sm"
                    value={form.type}
                    onChange={(t) =>
                      setForm((f) =>
                        f ? { ...f, type: t, categoryId: null } : f,
                      )
                    }
                    options={[
                      { value: "debit", label: "Expense" },
                      { value: "credit", label: "Income" },
                    ]}
                  />

                  <div
                    className={cn(
                      "scan-field space-y-2",
                      shown("amount") && "scan-landed",
                    )}
                  >
                    <div
                      className={cn(
                        "flex items-center gap-2 rounded-2xl border-2 px-4 py-1.5 focus-within:border-ring",
                        form.type === "credit"
                          ? "border-income/30"
                          : "border-expense/30",
                      )}
                    >
                      <span
                        className={cn(
                          "text-3xl font-bold",
                          form.type === "credit"
                            ? "text-income"
                            : "text-expense",
                        )}
                      >
                        {SYMBOL[form.currency]}
                      </span>
                      <input
                        ref={refs.amount}
                        aria-label={`Amount in ${form.currency}`}
                        inputMode="decimal"
                        placeholder="0"
                        className="tabular min-w-0 flex-1 bg-transparent py-1 text-4xl font-bold outline-none placeholder:text-muted-foreground/40"
                        value={form.amount}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^\d.]/g, "");
                          if (/^\d{0,10}(\.\d{0,2})?$/.test(v))
                            set("amount", v);
                        }}
                      />
                      {form.currency === "USD" && (
                        <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold">
                          USD
                        </span>
                      )}
                    </div>
                    {scan && scan.candidates.length > 1 && (
                      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
                        {scan.candidates.map((c) => {
                          const active =
                            toAmount(Number(form.amount)) === c.amount;
                          return (
                            <button
                              key={`${c.amount}-${c.label}`}
                              type="button"
                              onClick={() =>
                                set("amount", String(fromAmount(c.amount)))
                              }
                              className={cn(
                                "shrink-0 rounded-full border px-3 py-1 text-xs transition-colors",
                                active
                                  ? "border-primary bg-accent font-semibold"
                                  : "hover:bg-muted",
                              )}
                            >
                              {c.label ? `${c.label} · ` : ""}
                              <span className="tabular">
                                {form.currency === "USD"
                                  ? `$${(c.amount / 100).toFixed(2)}`
                                  : formatAmount(c.amount)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {!scan?.amount && (
                      <p className="text-xs text-muted-foreground">
                        Couldn't spot the total. Type it in.
                      </p>
                    )}
                  </div>

                  <div
                    className={cn(
                      "scan-field space-y-2",
                      shown("note") && "scan-landed",
                    )}
                  >
                    <Label htmlFor="scan-note">Note</Label>
                    <Input
                      ref={refs.note}
                      id="scan-note"
                      maxLength={500}
                      value={form.note}
                      placeholder="What was it?"
                      onChange={(e) => set("note", e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-1">
                    <div
                      className={cn(
                        "scan-field space-y-2",
                        shown("date") && "scan-landed",
                      )}
                    >
                      <Label htmlFor="scan-date">Date</Label>
                      <div ref={refs.date}>
                        <DateInput
                          id="scan-date"
                          max="2100-12-31"
                          value={form.date}
                          onChange={(v) => set("date", v)}
                        />
                      </div>
                      {!scan?.date && (
                        <p className="text-xs text-muted-foreground">
                          No date found, so it's today.
                        </p>
                      )}
                    </div>

                    <div
                      className={cn(
                        "scan-field space-y-2",
                        shown("category") && "scan-landed",
                      )}
                    >
                      <Label>Category</Label>
                      <Select
                        value={form.categoryId ? String(form.categoryId) : ""}
                        onValueChange={(v) => set("categoryId", Number(v))}
                      >
                        <SelectTrigger
                          ref={refs.category}
                          className="w-full"
                          aria-label="Category"
                        >
                          <SelectValue placeholder="Pick a category" />
                        </SelectTrigger>
                        <SelectContent className="z-[70]">
                          {cats.map((c) => (
                            <SelectItem key={c.id} value={String(c.id)}>
                              <CategoryIcon
                                icon={c.icon}
                                color={c.color}
                                size="sm"
                                className="size-6 [&_svg]:size-3.5"
                              />
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {scan?.category &&
                        form.categoryId === scan.category.id && (
                          <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Sparkles className="size-3 text-primary" />
                            {scan.category.reason}
                          </p>
                        )}
                    </div>
                  </div>

                  <div
                    ref={refs.account}
                    className={cn(
                      "scan-field",
                      shown("account") && "scan-landed",
                    )}
                  >
                    <AccountPicker
                      label={
                        form.type === "credit" ? "Received in" : "Paid via"
                      }
                      value={form.accountId}
                      onChange={(id) => set("accountId", id)}
                    />
                    {scan?.account && form.accountId === scan.account.id && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <Sparkles className="size-3 text-primary" />
                        {scan.account.reason}
                      </p>
                    )}
                  </div>

                  {scan && scan.items.length > 0 && (
                    <div className="rounded-xl border">
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm"
                        onClick={() => setShowItems((s) => !s)}
                        aria-expanded={showItems}
                      >
                        <ListChecks className="size-4 text-primary" />
                        <span className="flex-1 font-medium">
                          {scan.items.length} item
                          {scan.items.length === 1 ? "" : "s"} on the bill
                        </span>
                        <ChevronDown
                          className={cn(
                            "size-4 transition-transform",
                            showItems && "rotate-180",
                          )}
                        />
                      </button>
                      {showItems && (
                        <ul className="space-y-1 border-t px-3 py-2 text-sm">
                          {scan.items.map((it, k) => (
                            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list read off the bill
                            <li key={k} className="flex gap-2">
                              <span className="min-w-0 flex-1 truncate">
                                {it.qty && it.qty > 1 ? `${it.qty} × ` : ""}
                                {it.name}
                              </span>
                              {it.amount !== null && (
                                <span className="tabular text-muted-foreground">
                                  {form.currency === "USD"
                                    ? `$${(it.amount / 100).toFixed(2)}`
                                    : formatAmount(it.amount)}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ImagePlus className="size-3.5" /> The photo is attached to
                    the entry.
                  </p>

                  <div className="flex flex-col gap-2 pt-1">
                    <Button
                      size="lg"
                      disabled={!valid || save.isPending}
                      onClick={saveNow}
                    >
                      {save.isPending
                        ? "Saving…"
                        : `Add ${form.type === "credit" ? "income" : "expense"}${
                            amount > 0
                              ? ` · ${form.currency === "USD" ? `$${form.amount}` : formatAmount(amount)}`
                              : ""
                          }`}
                    </Button>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={moreOptions}
                      >
                        <SlidersHorizontal /> More options
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={reset}
                      >
                        <RotateCcw /> Scan another
                      </Button>
                    </div>
                  </div>
                </div>
              )
            )}
          </section>
        )}
      </div>

      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none fixed inset-0 z-[65] size-full"
      />
      {prefersReducedMotion() && reading && (
        <p className="sr-only" aria-live="polite">
          Reading your receipt
        </p>
      )}
    </div>
  );
}

function Picker({
  dragging,
  onCamera,
  onGallery,
  error,
}: {
  dragging: boolean;
  onCamera: () => void;
  onGallery: () => void;
  error?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full max-w-md flex-col items-center gap-6 rounded-3xl border border-dashed border-white/15 px-6 py-10 text-center transition-colors",
        dragging && "border-white/60 bg-white/5",
      )}
    >
      <button
        type="button"
        onClick={onCamera}
        aria-label="Take a photo of the receipt"
        className="scan-orb scan-orb-lg grid size-28 place-items-center rounded-full transition-transform active:scale-95"
      >
        <Camera className="size-11" />
      </button>
      <div className="space-y-1">
        <p className="text-lg font-semibold">Point at the bill and snap</p>
        <p className="text-sm text-white/60">
          Flat, well lit, the whole receipt in view. Screenshots of food or
          shopping apps work too.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2 sm:flex-row">
        <Button className="flex-1" size="lg" onClick={onCamera}>
          <Camera /> Take photo
        </Button>
        <Button
          className="flex-1 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
          variant="outline"
          size="lg"
          onClick={onGallery}
        >
          <ImagePlus /> From gallery
        </Button>
      </div>
      <p className="hidden text-xs text-white/40 md:block">
        …or drop an image here, or paste one with ⌘V / Ctrl+V
      </p>
      {error && <p className="text-sm text-red-300">{error}</p>}
    </div>
  );
}

function ErrorCard({
  error,
  onRetry,
  onOther,
  onManual,
}: {
  error: { message: string; offline: boolean } | null;
  onRetry: () => void;
  onOther: () => void;
  onManual: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      {error?.offline && <WifiOff className="size-8 text-muted-foreground" />}
      <p className="font-semibold">
        {error?.offline ? "You're offline" : "Couldn't read that one"}
      </p>
      <p className="text-sm text-muted-foreground">
        {error?.offline
          ? "Scanning needs a connection. You can still add it by hand, photo included."
          : error?.message}
      </p>
      <div className="flex w-full flex-col gap-2 pt-2">
        {!error?.offline && <Button onClick={onRetry}>Try again</Button>}
        <Button variant="outline" onClick={onManual}>
          Add it by hand
        </Button>
        <Button variant="ghost" onClick={onOther}>
          Use another photo
        </Button>
      </div>
    </div>
  );
}
