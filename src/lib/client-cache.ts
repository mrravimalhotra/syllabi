// The last data each screen showed, kept in memory while the app stays open.
// Moving back to a screen shows that data at once while a fresh copy loads, so
// switching between Generate, My books and Documents never starts from a blank
// skeleton. Lost on reload; never holds anything the person couldn't see already.

const store = new Map<string, unknown>();

export function peek<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function keep<T>(key: string, value: T): T {
  store.set(key, value);
  return value;
}

/** Forgets everything (on sign-out), so the next person to use this browser sees nothing of the last one. */
export function forgetAll() {
  store.clear();
}
