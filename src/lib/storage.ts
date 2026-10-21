import { randomUUID } from "node:crypto";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const allowedExtensions: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
};

let client: S3Client | undefined;

export function storageConfigured() {
  return Boolean(
    process.env.S3_BUCKET_NAME &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY,
  );
}

function getClient() {
  if (!storageConfigured()) throw new Error("File storage is not configured.");
  if (!client) {
    client = new S3Client({
      region: process.env.S3_REGION || "us-east-1",
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(process.env.S3_ENDPOINT),
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    });
  }
  return client;
}

export function createStorageKey(userId: string, fileName: string, mimeType: string) {
  const extension = allowedExtensions[mimeType];
  if (!extension) throw new Error("Unsupported file type.");
  const safeName = fileName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(-100);
  return `${userId}/${randomUUID()}-${safeName || `upload${extension}`}`;
}

export async function createUploadUrl(storageKey: string, mimeType: string, size: number) {
  return getSignedUrl(
    getClient(),
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: storageKey,
      ContentType: mimeType,
      ContentLength: size,
    }),
    { expiresIn: 600 },
  );
}

export async function createDownloadUrl(storageKey: string) {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET_NAME, Key: storageKey }),
    { expiresIn: 300 },
  );
}

export async function verifyUploadedObject(storageKey: string, mimeType: string, size: number) {
  const object = await getClient().send(
    new HeadObjectCommand({ Bucket: process.env.S3_BUCKET_NAME, Key: storageKey }),
  );
  return object.ContentType === mimeType && object.ContentLength === size;
}
