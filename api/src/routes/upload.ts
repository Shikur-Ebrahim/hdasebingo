import { Router } from 'express';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { getPresignedUploadUrl } from '../services/r2';
import crypto from 'crypto';

const router = Router();

/**
 * POST /api/upload/presign
 * Returns a pre-signed R2 URL so the Mini App can upload images or videos directly.
 * Body: { filename: "photo.jpg", contentType: "image/jpeg" }
 * Video types are also accepted for the support-videos admin feature.
 */
router.post('/presign', validateTelegramAuth, async (req: AuthRequest, res) => {
  const { filename, contentType } = req.body;

  if (!filename || !contentType) {
    res.status(400).json({ error: 'filename and contentType are required' });
    return;
  }

  const imageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const videoTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];
  const allowedTypes = [...imageTypes, ...videoTypes];

  if (!allowedTypes.includes(contentType)) {
    res.status(400).json({ error: 'Only image or video files are allowed' });
    return;
  }

  const telegramId = req.telegramUser!.id.toString();
  const ext = filename.split('.').pop() || 'bin';
  const uniqueId = crypto.randomBytes(8).toString('hex');

  // Videos go into a separate prefix for easier management
  const isVideo = videoTypes.includes(contentType);
  const key = isVideo
    ? `videos/${uniqueId}.${ext}`
    : `users/${telegramId}/${uniqueId}.${ext}`;

  try {
    const uploadUrl = await getPresignedUploadUrl(key, contentType);
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

    res.json({ uploadUrl, publicUrl, key });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
