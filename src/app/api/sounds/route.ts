import { NextResponse } from "next/server";
import { authenticate, errorResponse } from "@/lib/api";
import { listKeys } from "@/lib/storage";
import { soundKey } from "@/lib/kindergarten/recordings";

/** Which letters the caller has recorded their own sound for. */
export async function GET() {
  const auth = await authenticate();
  if ("response" in auth) return auth.response;
  try {
    const prefix = soundKey(auth.account.id, "");
    const letters = (await listKeys(prefix)).map((k) => k.slice(prefix.length)).filter((l) => /^[a-z]$/.test(l));
    return NextResponse.json({ letters });
  } catch (err) {
    return errorResponse(err, "sounds GET", "Couldn't load your recorded sounds. The built-in voice will be used.");
  }
}
