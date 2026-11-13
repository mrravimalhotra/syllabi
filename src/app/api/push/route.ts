import { NextResponse } from "next/server";
import { apiError, authenticate, errorResponse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushPublicKey } from "@/lib/push";

/** The key a phone needs to sign up for notifications (null when notifications aren't set up). */
export async function GET() {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  return NextResponse.json({ publicKey: pushPublicKey() });
}

interface Subscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function subscriptionFrom(body: unknown): Subscription | null {
  const s = (body as { subscription?: Partial<Subscription> } | null)?.subscription;
  const ok =
    typeof s?.endpoint === "string" &&
    /^https:\/\//.test(s.endpoint) &&
    s.endpoint.length < 1000 &&
    typeof s.keys?.p256dh === "string" &&
    typeof s.keys?.auth === "string" &&
    s.keys.p256dh.length < 200 &&
    s.keys.auth.length < 100;
  return ok ? (s as Subscription) : null;
}

/** Signs this phone up for "Your paper is marked". */
export async function POST(request: Request) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const sub = subscriptionFrom(await request.json().catch(() => null));
  if (!sub) return apiError(400, "This phone's notification details couldn't be read. Try again.");
  const { error } = await createAdminClient()
    .from("push_subscriptions")
    .upsert({ endpoint: sub.endpoint, owner_id: auth.account.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth }, { onConflict: "endpoint" });
  if (error) return errorResponse(error, "push subscribe", "Couldn't turn notifications on. Try again.");
  return NextResponse.json({ ok: true });
}

/** Stops notifications to this phone. */
export async function DELETE(request: Request) {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  const endpoint = ((await request.json().catch(() => null)) as { endpoint?: unknown } | null)?.endpoint;
  if (typeof endpoint !== "string") return apiError(400, "Which phone to stop wasn't given.");
  const { error } = await createAdminClient().from("push_subscriptions").delete().eq("endpoint", endpoint).eq("owner_id", auth.account.id);
  if (error) return errorResponse(error, "push unsubscribe", "Couldn't turn notifications off. Try again.");
  return NextResponse.json({ ok: true });
}
