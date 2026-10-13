import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface AuthRequest extends Request {
  telegramUser?: { id: number; first_name: string; last_name?: string; username?: string; };
}

export function validateTelegramAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const initData = req.headers['x-telegram-init-data'] as string;
  if (!initData) { res.status(401).json({ error: 'No auth data' }); return; }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');
    const dataCheckString = Array.from(params.entries()).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN!).digest();
    const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (expectedHash !== hash) { res.status(401).json({ error: 'Invalid auth' }); return; }
    const userData = params.get('user');
    if (userData) req.telegramUser = JSON.parse(decodeURIComponent(userData));
    next();
  } catch { res.status(401).json({ error: 'Auth failed' }); }
}
