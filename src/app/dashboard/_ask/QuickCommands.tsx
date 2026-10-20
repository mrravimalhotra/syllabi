"use client";

import { kindName, type QuickCommand } from "@/app/dashboard/_ask/commands";

/** Ready-made requests for the chosen kind of answer. One tap fills the question box, and picks the books it names (Exercise books, Test papers...). */
export function QuickCommands({ commands, onPick }: { commands: QuickCommand[]; onPick: (command: QuickCommand) => void }) {
  if (commands.length === 0) return null;
  return (
    <div className="px-4 pb-3 sm:px-5">
      <p className="mb-1.5 text-xs font-medium text-slate-500">Quick commands</p>
      <div className="flex flex-wrap gap-2">
        {commands.map((command) => (
          <button
            key={command.label}
            type="button"
            onClick={() => onPick(command)}
            title={command.prompt}
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 transition hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
          >
            {command.label}
            {command.books && <span className="ml-1.5 text-slate-400">· {command.books.map(kindName).join(", ")}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
