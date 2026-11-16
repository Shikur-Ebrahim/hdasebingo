import { Router } from 'express';
import { AuthRequest, validateTelegramAuth } from '../middleware/auth';
import { getPresignedUploadUrl, uploadToR2 } from '../services/r2';
import crypto from 'crypto';

const router = Router();

/**
 * POST /api/upload
 * POST /api/upload/direct
 * Direct base64 image/file upload to R2 (bulletproof fallback when presign/CORS is blocked)
 * Body: { filename: "receipt.jpg", contentType: "image/jpeg", fileBase64: "..." }
 */
const handleDirectUpload = async (req: AuthRequest, res: any) => {
  try {
    const { filename, contentType, fileBase64, data, image } = req.body;
    const rawData = fileBase64 || data || image;

    if (!rawData) {
      return res.status(400).json({ error: 'fileBase64 or data is required for direct upload' });
    }

    const cleanContentType = contentType || 'image/jpeg';
    const base64Content = rawData.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(base64Content, 'base64');

    const telegramId = req.telegramUser?.id?.toString() || 'anonymous';
    const ext = (filename || 'screenshot.jpg').split('.').pop() || 'jpg';
    const uniqueId = crypto.randomBytes(8).toString('hex');
    const key = `users/${telegramId}/${uniqueId}.${ext}`;

    const publicUrl = await uploadToR2(key, buffer, cleanContentType);

    return res.json({
      success: true,
      url: publicUrl,
      publicUrl,
      key,
    });
  } catch (err: any) {
    console.error('[Upload Direct] Error:', err);
    return res.status(500).json({ error: err.message || 'Direct upload failed' });
  }
};

router.post('/', validateTelegramAuth, handleDirectUpload);
router.post('/direct', validateTelegramAuth, handleDirectUpload);

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
