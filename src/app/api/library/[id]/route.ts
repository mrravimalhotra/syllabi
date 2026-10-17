import { NextResponse } from "next/server";
import { getCurrentStudent } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { deletePrefix } from "@/lib/storage";
import { userMessage } from "@/lib/errors";
import { cleanText, isUuid } from "@/lib/validate";

/** Renames one of the caller's books (title, subject, grade). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentStudent();
  if (!user || !user.active) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => null);

  const updates: { title?: string; subject?: string | null; grade?: string | null } = {};
  if (body?.title !== undefined) {
    const title = cleanText(body.title, 200);
    if (!title) return NextResponse.json({ error: "A title is required" }, { status: 400 });
    updates.title = title;
  }
  if (body?.subject !== undefined) updates.subject = cleanText(body.subject, 100);
  if (body?.grade !== undefined) updates.grade = cleanText(body.grade, 50);
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "Nothing to change" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("documents")
    .update(updates)
    .eq("id", id)
    .eq("owner_id", user.id)
    .select("id, title, subject, grade, source_type, status, created_at")
    .maybeSingle();
  if (error) return NextResponse.json({ error: userMessage(error, "library PATCH") }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ document: data });
}

/** Deletes one of the caller's books: its page images, its search index (chunks cascade), and the record. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentStudent();
  if (!user || !user.active) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });
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
