export async function createClient() {
  return { auth: { signOut: async () => ({ error: null }) } };
}
