import type * as React from "react";
import { Drawer } from "vaul";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBackToClose } from "@/hooks/use-back-to-close";
import { useIsMobile } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

/** Bottom sheet on phones (native feel, swipe to dismiss), dialog on larger screens. */
export function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const isMobile = useIsMobile();
  // Phone/browser back closes the sheet, like a native app.
  useBackToClose(open, () => onOpenChange(false));

  if (isMobile) {
    return (
      <Drawer.Root
        open={open}
        onOpenChange={onOpenChange}
        repositionInputs={false}
      >
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/50" />
          <Drawer.Content
            className={cn(
              "fixed inset-x-0 bottom-0 z-50 flex max-h-[94dvh] flex-col rounded-t-3xl border-t bg-card outline-none",
            )}
          >
            <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-muted-foreground/30" />
            <div className="px-5 pt-3 pb-2">
              <Drawer.Title className="text-lg font-semibold">
                {title}
              </Drawer.Title>
              {description ? (
                <Drawer.Description className="text-sm text-muted-foreground">
                  {description}
                </Drawer.Description>
              ) : (
                <Drawer.Description className="sr-only">
                  {title}
                </Drawer.Description>
              )}
            </div>
            <div
              className={cn(
                "overflow-x-hidden overflow-y-auto px-5 pb-safe",
                className,
              )}
            >
              <div className="pb-5">{children}</div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "max-h-[90vh] overflow-x-hidden overflow-y-auto sm:max-w-lg [&>*]:min-w-0",
          className,
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className={description ? undefined : "sr-only"}>
            {description ?? title}
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
