// Phone notifications (Web Push): "Your paper is marked". A phone signs up once (the button on Paper check); the
// server then sends to every phone the account signed up, when a paper's marking is saved. A phone that has gone
// (the app removed, notifications turned off) is forgotten. Needs VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY; without
// them nothing is sent and the button is not shown.

import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

export const pushPublicKey = () => process.env.VAPID_PUBLIC_KEY?.trim() || null;

function configured(): boolean {
  const publicKey = pushPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return false;
  // The contact Google and Apple can use about these notifications: the app's own address, never a person's.
  webpush.setVapidDetails("https://syllabi-study.vercel.app", publicKey, privateKey);
  return true;
}

export interface Notification {
  title: string;
  body: string;
  /** The page tapping it opens. */
  url: string;
  /** A newer notification with the same tag replaces the older one. */
  tag?: string;
}

/** Sends a notification to every phone the account signed up; never throws (a notification is a bonus). */
export async function notifyOwner(ownerId: string, notification: Notification): Promise<number> {
  if (!configured()) return 0;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("owner_id", ownerId);
    if (error) throw error;
    let sent = 0;
    await Promise.all(
      (data ?? []).map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(notification), { TTL: 60 * 60, urgency: "high" });
          sent++;
        } catch (err) {
          const status = (err as { statusCode?: number }).statusCode;
          // Gone: the phone unsubscribed or the app was removed.
          if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          else console.error("[push] send", status, err instanceof Error ? err.message : err);
        }
      })
    );
    return sent;
  } catch (err) {
    console.error("[push]", err instanceof Error ? err.message : err);
    return 0;
  }
}
