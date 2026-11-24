import { AtSign, UserCheck } from "lucide-react";
import { useState } from "react";
import { SectionCard } from "@/components/app/section-card";
import { confirm } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTagPerson, useUntagPerson } from "@/hooks/use-splits";

/**
 * Tag a person added before they joined (or untag them). Tagging shares every
 * split they're on so far, so nobody has to be deleted and re-added.
 */
export function PersonTag({
  personId,
  name,
  username,
}: {
  personId: number;
  name: string;
  username: string | null;
}) {
  const tag = useTagPerson();
  const untag = useUntagPerson();
  const [value, setValue] = useState("");
  const first = name.split(" ")[0];

  if (username)
    return (
      <SectionCard>
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
            <UserCheck className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">On the app as @{username}</p>
            <p className="text-xs text-muted-foreground">
              {first} sees your splits with them under “Shared with me”.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={untag.isPending}
            onClick={async () => {
              if (
                await confirm({
                  title: `Untag @${username}?`,
                  description: `${first} stops seeing your splits, and any copies in their own books are removed. Your splits and balance stay as they are.`,
                  confirmText: "Untag",
                  destructive: true,
                })
              )
                untag.mutate(personId);
            }}
          >
            Untag
          </Button>
        </div>
      </SectionCard>
    );

  return (
    <SectionCard title={`Is ${first} on the app now?`}>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          tag.mutate(
            {
              id: personId,
              username: value.trim().replace(/^@/, "").toLowerCase(),
            },
            { onSuccess: () => setValue("") },
          );
        }}
      >
        <div className="flex gap-2">
          <div className="relative flex-1">
            <AtSign className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
            <Input
              aria-label={`${first}'s username`}
              autoCapitalize="none"
              spellCheck={false}
              maxLength={20}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="username"
              className="pl-9"
            />
          </div>
          <Button type="submit" disabled={!value.trim() || tag.isPending}>
            Tag
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Every split you've already added with {first} is shared with them too,
          so there's no need to remove and re-add them.
        </p>
      </form>
    </SectionCard>
  );
}
