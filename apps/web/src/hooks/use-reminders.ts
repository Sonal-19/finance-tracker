import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { api, call, callMsg } from "@/lib/api";

// Reminders and the notification inbox need a connection (like accounts and
// budgets); the cached lists still show offline.

export const useReminders = () =>
  useQuery({
    queryKey: ["reminders"],
    queryFn: () => call(api.reminders.get()),
  });
export type Reminder = NonNullable<
  ReturnType<typeof useReminders>["data"]
>[number];
export type NewReminder = Parameters<typeof api.reminders.post>[0];

export const useUpcomingReminders = () =>
  useQuery({
    queryKey: ["reminders", "upcoming"],
    queryFn: () => call(api.reminders.upcoming.get()),
  });
export type UpcomingReminder = NonNullable<
  ReturnType<typeof useUpcomingReminders>["data"]
>[number];

function useReminderMutation<V>(fn: (v: V) => Promise<{ message: string }>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: ({ message }) => {
      toast.success(message);
      qc.invalidateQueries({ queryKey: ["reminders"] });
    },
    onError: (e) => toast.error(e.message),
  });
}

export const useCreateReminder = () =>
  useReminderMutation((body: NewReminder) => callMsg(api.reminders.post(body)));

export const useUpdateReminder = () =>
  useReminderMutation(
    ({
      id,
      ...body
    }: Partial<NewReminder> & {
      id: number;
      status?: "active" | "paused";
    }) => callMsg(api.reminders({ id }).patch(body)),
  );

export const useDeleteReminder = () =>
  useReminderMutation((id: number) => callMsg(api.reminders({ id }).delete()));

/* ---------- inbox ---------- */

const INBOX = ["notifications"] as const;

/** The inbox, refreshed every minute and whenever a push arrives. */
export function useNotifications() {
  const qc = useQueryClient();
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === "push-received")
        qc.invalidateQueries({ queryKey: INBOX });
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () =>
      navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [qc]);
  return useQuery({
    queryKey: INBOX,
    queryFn: () => call(api.notifications.get()),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}
export type AppNotification = NonNullable<
  ReturnType<typeof useNotifications>["data"]
>["items"][number];

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: number[]) => call(api.notifications.read.post({ ids })),
    onSuccess: () => qc.invalidateQueries({ queryKey: INBOX }),
  });
}

export function useClearNotifications() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => callMsg(api.notifications.delete()),
    onSuccess: ({ message }) => {
      toast.success(message);
      qc.invalidateQueries({ queryKey: INBOX });
    },
    onError: (e) => toast.error(e.message),
  });
}

export function useTestPush() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => callMsg(api.push.test.post()),
    onSuccess: ({ message }) => {
      toast.success(message);
      qc.invalidateQueries({ queryKey: INBOX });
    },
    onError: (e) => toast.error(e.message),
  });
}
