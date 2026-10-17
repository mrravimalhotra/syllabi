// Downloads every object in the R2 bucket into a folder (used by backup.sh).
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

const out = process.argv[2];
const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
const bucket = process.env.R2_BUCKET_NAME ?? "syllabi";
if (!out || !R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.error("Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY, and give an output folder.");
  process.exit(1);
}

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

let token;
let count = 0;
do {
  const page = await r2.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token }));
  for (const { Key } of page.Contents ?? []) {
    if (!Key || Key.endsWith("/")) continue;
    // Never write outside the backup folder, whatever a key looks like.
    const target = path.resolve(out, Key);
    if (!target.startsWith(path.resolve(out) + path.sep)) continue;
    const object = await r2.send(new GetObjectCommand({ Bucket: bucket, Key }));
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(await object.Body.transformToByteArray()));
    count++;
  }
  token = page.IsTruncated ? page.NextContinuationToken : undefined;
} while (token);
console.log(`Saved ${count} file(s).`);
