"use client";

import { useEffect, useState } from "react";
import { Alert, PageHeader, PageSkeleton, button, card, cx, input } from "@/components/ui";
import { OFFLINE_MESSAGE, failedRequestMessage } from "@/lib/http-errors";
import type { LlmSetting, Provider } from "@/types/database";

const PROVIDERS: Provider[] = ["google", "anthropic", "openai", "groq", "openrouter", "mistral"];

// What each task is, in words an admin can act on.
const TASK_TYPE_LABELS: Record<string, string> = {
  ocr_extraction: "Reading book pages (scans and photos)",
  embedding: "Searching your books (must stay on Google)",
  solution: "Step-by-step solutions",
  notes: "Revision notes",
  sample_paper: "Sample papers",
  ad_hoc: "Ask (quick answers)",
  study_pack: "Chapter study packs",
};
const labelFor = (taskType: string) =>
  TASK_TYPE_LABELS[taskType] ?? taskType.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export default function LlmSettingsPage() {
  const [settings, setSettings] = useState<LlmSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingTaskType, setSavingTaskType] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/llm-settings")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? failedRequestMessage(res.status, "load the AI model settings"));
        setSettings(data.settings ?? []);
      })
      .catch((err) => setError(err instanceof TypeError ? OFFLINE_MESSAGE : err instanceof Error ? err.message : "Couldn't load the AI model settings. Reload the page."))
      .finally(() => setLoading(false));
  }, []);

  async function save(taskType: string, provider: Provider, model: string) {
    setSavingTaskType(taskType);
    setError(null);
    setSaved(null);
    try {
      const res = await fetch("/api/admin/llm-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskType, provider, model }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? failedRequestMessage(res.status, `save the model for ${labelFor(taskType).toLowerCase()}`));
        return;
      }
      setSettings((prev) => prev.map((s) => (s.task_type === taskType ? data.setting : s)));
      setSaved(`${labelFor(taskType)}: now uses ${provider} / ${model}. Applies to the next request.`);
    } catch (err) {
      setError(err instanceof TypeError ? OFFLINE_MESSAGE : "Couldn't save that setting. Try again.");
    } finally {
      setSavingTaskType(null);
    }
  }

  if (loading) return <PageSkeleton rows={2} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="AI models"
        description="Choose which AI service and model does each job. Changes apply to the next request; no redeploy needed. Use the exact model name from the provider (for example gemini-flash-latest). Check Admin → Health after a change."
      />
      {error && <Alert tone="error">{error}</Alert>}
      {saved && <Alert tone="success">{saved}</Alert>}

      <div className={cx(card, "overflow-x-auto")}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/80 text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Job</th>
              <th scope="col" className="px-4 py-2 font-medium">AI service</th>
              <th scope="col" className="px-4 py-2 font-medium">Model name</th>
              <th scope="col" className="px-4 py-2 font-medium">
                <span className="sr-only">Save</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {settings.map((s) => (
              <SettingRow key={s.task_type} setting={s} saving={savingTaskType === s.task_type} onSave={save} />
            ))}
            {settings.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                  {error ? "The settings couldn't be loaded." : "No jobs are configured."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SettingRow({
  setting,
  saving,
  onSave,
}: {
  setting: LlmSetting;
  saving: boolean;
  onSave: (taskType: string, provider: Provider, model: string) => void;
}) {
  const [provider, setProvider] = useState<Provider>(setting.provider);
  const [model, setModel] = useState(setting.model);

  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="px-4 py-3 text-slate-700">{labelFor(setting.task_type)}</td>
      <td className="px-4 py-3">
        <select
          aria-label={`AI service for ${labelFor(setting.task_type)}`}
          value={provider}
          onChange={(e) => setProvider(e.target.value as Provider)}
          className={cx(input, "w-auto py-1.5 text-xs")}
        >
          {PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </td>
      <td className="px-4 py-3">
        <input
          aria-label={`Model name for ${labelFor(setting.task_type)}`}
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className={cx(input, "w-56 py-1.5 text-xs")}
        />
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          disabled={saving || !model.trim() || (provider === setting.provider && model.trim() === setting.model)}
          onClick={() => onSave(setting.task_type, provider, model.trim())}
          className={button.smallPrimary}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </td>
    </tr>
  );
}
