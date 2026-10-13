import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';
dotenv.config();

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || 'https://a58ed9ccf9f9786d955bd8be887bf1b3.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '8b64b2cc9ebf08a789bd5a94504aa58d',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '39a51d2f69621bdaf55b3781306d46453f952ac6cc68330be983a8a54adb00e1',
  },
});

const BUCKET = process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || 'hdasebingo';
const PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-44e6a703661947efa8e5748167d79a4d.r2.dev';

/**
 * Upload a file buffer directly to R2
 */
export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return `${PUBLIC_URL}/${key}`;
}

/**
 * Delete a file from R2 by key
 */
export async function deleteFromR2(key: string): Promise<void> {
  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );
}

/**
 * Generate a pre-signed URL so the Mini App can upload directly (bypassing API size limits)
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 300 // 5 minutes
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(r2Client, command, { expiresIn });
}
