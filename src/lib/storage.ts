import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl as presign } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 is S3-compatible, so the AWS SDK talks to it directly — only the
// endpoint differs. This is the one file that knows about R2; every caller in the
// app just imports uploadSourceFile/downloadFile/getSignedUrl below.
// Chosen over Supabase Storage because every uploaded scanned page's image is now
// kept (see chunks.image_path) and re-served on every generation that cites it —
// R2's free tier (10GB) comfortably covers that, and it charges no egress fees for
// those re-serves, unlike S3-style storage.

const BUCKET = process.env.R2_BUCKET_NAME ?? "syllabi";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour
// A stalled storage call must fail in seconds, not hang until the server function is cut off.
const REQUEST_TIMEOUT_MS = 30_000;
const timeout = () => ({ abortSignal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

function client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY must be configured");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

/** Returns a time-limited signed download URL for a stored object. */
export async function getSignedUrl(path: string): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: path });
  return presign(client(), command, { expiresIn: SIGNED_URL_TTL_SECONDS });
}

/** Uploads a raw source page (ingestion) and returns its storage path (object key). */
export async function uploadSourceFile(path: string, buffer: Buffer, contentType: string): Promise<string> {
  await client().send(new PutObjectCommand({ Bucket: BUCKET, Key: path, Body: buffer, ContentType: contentType }), timeout());
  return path;
}

/**
 * Downloads a stored object's raw bytes — used to hand a source page's image back
 * to the LLM as multimodal input (diagrams/maps carry meaning text can't capture).
 */
export async function downloadFile(path: string): Promise<{ data: Buffer; contentType: string }> {
  const response = await client().send(new GetObjectCommand({ Bucket: BUCKET, Key: path }), timeout());
  if (!response.Body) throw new Error(`Download failed: empty object body for ${path}`);
  const bytes = await response.Body.transformToByteArray();
  return { data: Buffer.from(bytes), contentType: response.ContentType || "application/octet-stream" };
}

/** Deletes every stored object whose key starts with `prefix` (e.g. all page images of one book). */
export async function deletePrefix(prefix: string): Promise<void> {
  const r2 = client();
  let continuationToken: string | undefined;
  do {
    const listed = await r2.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: continuationToken }),
      timeout()
    );
    const keys = (listed.Contents ?? []).map((o) => o.Key).filter((k): k is string => Boolean(k));
    if (keys.length > 0) {
      const deleted = await r2.send(
        new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } }),
        timeout()
      );
      // The call succeeds even when some files couldn't be removed; report those.
      if (deleted.Errors?.length) throw new Error(`${deleted.Errors.length} stored file(s) couldn't be deleted (first: ${deleted.Errors[0].Key}: ${deleted.Errors[0].Message})`);
    }
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
}

/** The keys of every stored object that starts with `prefix` (small sets only, such as one person's recordings). */
export async function listKeys(prefix: string): Promise<string[]> {
  const r2 = client();
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const listed = await r2.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: continuationToken }), timeout());
    keys.push(...(listed.Contents ?? []).map((o) => o.Key).filter((k): k is string => Boolean(k)));
    continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (continuationToken);
  return keys;
}
