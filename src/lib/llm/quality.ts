import type { TaskType } from "@/types/database";

/**
 * Jobs whose output is an answer a parent or student relies on: written only by the configured main model (Gemini
 * Flash, free key first, then the paid key), never by a lighter stand-in or a backup service, even when that means
 * the request fails with a clear message (owner, 13 Nov: "we should not compromise on answer quality"). Other jobs
 * (reading book pages, search words) may still use backups.
 */
const ANSWER_TASKS = new Set<TaskType>(["solution", "notes", "sample_paper", "paper_check", "ad_hoc", "study_pack"]);

export const answerQualityFirst = (taskType: TaskType) => ANSWER_TASKS.has(taskType);
