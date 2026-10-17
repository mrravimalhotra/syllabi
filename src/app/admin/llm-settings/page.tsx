"use client";

import { useEffect, useState } from "react";
import { Alert, PageHeader, PageSkeleton, card, cx } from "@/components/ui";
import type { LlmSetting, Provider } from "@/types/database";

const PROVIDERS: Provider[] = ["google", "anthropic", "openai", "groq", "openrouter", "mistral"];

const TASK_TYPE_LABELS: Record<string, string> = {
  ocr_extraction: "Page text extraction (ingestion, vision)",
  embedding: "Embeddings (RAG indexing & retrieval)",
  solution: "Step-by-step solutions",
  notes: "Revision notes",
  sample_paper: "Sample papers",
  ad_hoc: "Ad-hoc prompts",
  coverage_check: "RAG coverage / search-grounding check",
  study_pack: "Chapter study packs",
};

export default function LlmSettingsPage() {
  const [settings, setSettings] = useState<LlmSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingTaskType, setSavingTaskType] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/llm-settings")
      .then((r) => r.json())
      .then((data) => setSettings(data.settings ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function save(taskType: string, provider: Provider, model: string) {
    setSavingTaskType(taskType);
    setError(null);
    const res = await fetch("/api/admin/llm-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskType, provider, model }),
    });
    const data = await res.json();
    setSavingTaskType(null);
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setSettings((prev) => prev.map((s) => (s.task_type === taskType ? data.setting : s)));
  }

  if (loading) return <PageSkeleton rows={2} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="AI models"
        description="Route each task to a provider and model. Changes apply immediately, no redeploy needed."
      />
      {error && <Alert tone="error">{error}</Alert>}

      <div className={cx(card, "overflow-x-auto")}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/80 text-xs tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-2 font-medium">Task</th>
              <th className="px-4 py-2 font-medium">Provider</th>
              <th className="px-4 py-2 font-medium">Model</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {settings.map((s) => (
              <SettingRow key={s.task_type} setting={s} saving={savingTaskType === s.task_type} onSave={save} />
            ))}
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
      <td className="px-4 py-3 text-slate-700">{TASK_TYPE_LABELS[setting.task_type] ?? setting.task_type}</td>
      <td className="px-4 py-3">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as Provider)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
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
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className="w-56 rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
        />
      </td>
      <td className="px-4 py-3">
        <button
          disabled={saving}
          onClick={() => onSave(setting.task_type, provider, model)}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </td>
    </tr>
  );
}
