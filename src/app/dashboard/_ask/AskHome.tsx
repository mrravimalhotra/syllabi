"use client";

import { TABS } from "@/app/dashboard/_ask/constants";
import { ActivityTile, LinkTile, MenuGroup } from "@/components/menu/Tiles";
import type { GenerationTaskType } from "@/types/database";

const GROUPS: { id: (typeof TABS)[number]["group"]; title: string; tone: "sky" | "amber" }[] = [
  { id: "homework", title: "Homework help", tone: "sky" },
  { id: "revision", title: "Revision and tests", tone: "amber" },
];

/**
 * The Ask Syllabi home, laid out like Practice: a tile for each kind of thing to make, grouped by what it is
 * for, then the books and saved answers. A tile opens that kind's own screen. `lastAnswer` brings back an
 * answer still being made, or just made, after going back to the tiles.
 */
export function AskHome({
  onOpen,
  lastAnswer,
}: {
  onOpen: (task: GenerationTaskType) => void;
  lastAnswer: { task: GenerationTaskType; loading: boolean } | null;
}) {
  const last = lastAnswer && TABS.find((t) => t.value === lastAnswer.task);
  return (
    <div className="animate-fade-in space-y-7">
      {last && (
        <MenuGroup title={lastAnswer.loading ? "Being made now" : "Your last answer"}>
          <ActivityTile
            emoji={lastAnswer.loading ? "⏳" : last.emoji}
            tone="violet"
            title={last.tileTitle}
            hint={lastAnswer.loading ? "Still being made: open it to watch" : "Open it again, or ask a follow-up"}
            onOpen={() => onOpen(last.value)}
          />
        </MenuGroup>
      )}
      {GROUPS.map((g) => (
        <MenuGroup key={g.id} title={g.title}>
          {TABS.filter((t) => t.group === g.id).map((t) => (
            <ActivityTile key={t.value} emoji={t.emoji} tone={g.tone} title={t.tileTitle} hint={t.hint} onOpen={() => onOpen(t.value)} />
          ))}
        </MenuGroup>
      ))}
      <MenuGroup title="Your library">
        <LinkTile href="/dashboard/library" emoji="📖" tone="slate" title="My books" hint="The books answers come from" />
        <LinkTile href="/dashboard/documents" emoji="🗂️" tone="slate" title="My Documents" hint="Every answer you've saved" />
      </MenuGroup>
    </div>
  );
}
