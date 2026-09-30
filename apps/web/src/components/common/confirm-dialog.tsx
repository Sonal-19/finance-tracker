import { create } from "zustand";
import { Button } from "@/components/ui/button";
import { ResponsiveSheet } from "./responsive-sheet";

type ConfirmOpts = {
  title: string;
  description?: string;
  confirmText?: string;
  destructive?: boolean;
};

type State = ConfirmOpts & {
  open: boolean;
  resolve?: (ok: boolean) => void;
};

const useConfirmStore = create<State>(() => ({ open: false, title: "" }));

/** `if (await confirm({ title: "Delete?" })) …` — rendered once in the root. */
export function confirm(opts: ConfirmOpts) {
  return new Promise<boolean>((resolve) => {
    useConfirmStore.setState({ ...opts, open: true, resolve });
  });
}

export function ConfirmHost() {
  const s = useConfirmStore();
  const close = (ok: boolean) => {
    s.resolve?.(ok);
    useConfirmStore.setState({ open: false, resolve: undefined });
  };
  return (
    <ResponsiveSheet
      open={s.open}
      onOpenChange={(o) => !o && close(false)}
      title={s.title}
      description={s.description}
    >
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={() => close(false)}>
          Cancel
        </Button>
        <Button
          variant={s.destructive ? "destructive" : "default"}
          onClick={() => close(true)}
        >
          {s.confirmText ?? "Confirm"}
        </Button>
      </div>
    </ResponsiveSheet>
  );
}
