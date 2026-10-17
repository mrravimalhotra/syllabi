import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { deletePrefix } from "@/lib/storage";
import { userMessage } from "@/lib/errors";

/** Deletes one of the caller's books: its page images, its search index (chunks cascade), and the record. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentStudent();
  if (!user || !user.active) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from("documents")
    .select("id")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await deletePrefix(`sources/${id}/`);
  } catch (err) {
    return NextResponse.json(
      { error: userMessage(err, "library DELETE images", "Couldn't delete this book's pages. Please try again.") },
      { status: 500 }
    );
  }

  const { error } = await admin.from("documents").delete().eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: userMessage(error, "library DELETE row", "Couldn't delete this book. Please try again.") },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}
