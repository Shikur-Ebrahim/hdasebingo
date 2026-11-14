import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { supabase } from '../services/supabase';

export interface AuthRequest extends Request {
  telegramUser?: { id: number | string; first_name: string; last_name?: string; username?: string; };
  pwaUser?: any;
}

// ── Password Hashing Utilities ──────────────────────────────────────────────
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) return false;
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

// ── PWA Signed Auth Token ───────────────────────────────────────────────────
function getAuthSecret(): string {
  return process.env.JWT_SECRET || process.env.BOT_TOKEN || 'hdase-bingo-pwa-secret-fallback-key-2026';
}

export function generatePwaToken(payload: { telegram_id: string; id?: string; exp?: number }): string {
  const secret = getAuthSecret();
  const tokenPayload = {
    ...payload,
    exp: payload.exp || (Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  };
  const data = Buffer.from(JSON.stringify(tokenPayload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

export function verifyPwaToken(token: string): { telegram_id: string; id?: string; exp?: number } | null {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [data, signature] = parts;
    const secret = getAuthSecret();
    const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

// ── Authentication Middleware ───────────────────────────────────────────────
export async function validateTelegramAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const initData = req.headers['x-telegram-init-data'] as string;

  // 1. Try Telegram WebApp auth first if initData is supplied
  if (initData && initData.trim() !== '') {
    try {
      const params = new URLSearchParams(initData);
      const hash = params.get('hash');
      params.delete('hash');
      const dataCheckString = Array.from(params.entries())
        .sort(([a],[b]) => a.localeCompare(b))
        .map(([k,v]) => `${k}=${v}`)
        .join('\n');
      const secretKey = crypto.createHmac('sha256', 'WebAppData').update(process.env.BOT_TOKEN!).digest();
      const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

      if (expectedHash === hash) {
        const userData = params.get('user');
        if (userData) {
          req.telegramUser = JSON.parse(decodeURIComponent(userData));
          next();
          return;
        }
      }
    } catch {
      // Telegram validation failed or threw; fall through to PWA token check
    }
  }

  // 2. Try PWA token auth (header 'x-pwa-auth' or 'Authorization: Bearer <token>')
  let pwaToken = req.headers['x-pwa-auth'] as string;
  if (!pwaToken && req.headers['authorization']) {
    const authHeader = req.headers['authorization'] as string;
    if (authHeader.startsWith('Bearer ')) {
      pwaToken = authHeader.slice(7).trim();
    }
  }

  if (pwaToken) {
    const payload = verifyPwaToken(pwaToken);
    if (!payload || !payload.telegram_id) {
      res.status(401).json({ error: 'Invalid or expired auth session' });
      return;
    }

    try {
      const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', payload.telegram_id.toString())
        .maybeSingle();

      if (error || !user) {
        res.status(401).json({ error: 'User not found or session expired' });
        return;
      }

      if (user.status === 'inactive') {
        res.status(403).json({ error: 'Your account has been deactivated.' });
        return;
      }

      req.telegramUser = {
        id: user.telegram_id,
        first_name: user.first_name || 'Player',
        username: user.username || user.first_name,
      };
      req.pwaUser = user;
      next();
      return;
    } catch (err: any) {
      res.status(500).json({ error: 'Internal auth error' });
      return;
    }
  }

  // 3. Neither Telegram initData nor PWA token provided
  res.status(401).json({ error: 'No auth data' });
}
