// The quality test set's model choice: from the environment, not the database.
export async function getLlmSetting(): Promise<{ provider: "google"; model: string }> {
  return { provider: "google", model: process.env.QUALITY_MODEL || "gemini-flash-latest" };
}
export function invalidateLlmSettingsCache() {}
