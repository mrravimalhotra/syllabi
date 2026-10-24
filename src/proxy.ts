import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // sounds/: the public letter sounds, played without a session check.
    "/((?!_next/static|_next/image|favicon.ico|sounds/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mjs|js|css|map|json|txt|xml|woff|woff2|ttf|pdf)$).*)",
  ],
};
