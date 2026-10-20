import { NextResponse } from "next/server";

/** Which version of the app is live now. Open windows ask this to learn that a newer version is ready. */
export function GET() {
  return NextResponse.json({ build: process.env.NEXT_PUBLIC_BUILD_ID }, { headers: { "Cache-Control": "no-store" } });
}
