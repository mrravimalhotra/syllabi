export async function getLlmSetting() {
  return { provider: "google", model: "test-model" };
}
export function invalidateLlmSettingsCache() {}
