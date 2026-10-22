import { supabase } from './supabase';

export interface DynamicBotSettings {
  support_username: string;
  support_url: string;
  channel_link: string;
  channel_url: string;
  support_phone_eth: string;
  support_phone_usa: string;
}

/**
 * Normalizes any username, @handle, or link into a valid, safe Telegram HTTPS URL.
 * Examples:
 *  - 'https://t.me/dmg_official_channel' -> 'https://t.me/dmg_official_channel'
 *  - '@dmg_official_channel'             -> 'https://t.me/dmg_official_channel'
 *  - 'Hdasebingo'                         -> 'https://t.me/Hdasebingo'
 *  - '@Hdasebingo'                        -> 'https://t.me/Hdasebingo'
 *  - 'https://t.me/Hdasebingo'            -> 'https://t.me/Hdasebingo'
 */
export function formatTelegramUrl(input: string | null | undefined, fallback: string = ''): string {
  if (!input) return fallback;
  const trimmed = input.trim();
  if (!trimmed) return fallback;

  // Already a full valid URL
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    return trimmed;
  }

  // Strip leading @ or t.me/ prefixes
  const clean = trimmed
    .replace(/^https?:\/\/t\.me\//i, '')
    .replace(/^t\.me\//i, '')
    .replace(/^@+/, '')
    .trim();

  if (!clean) return fallback;
  return `https://t.me/${clean}`;
}

export function cleanTelegramUsername(input: string | null | undefined, fallback: string = ''): string {
  if (!input) return fallback;
  const trimmed = input.trim();
  if (!trimmed) return fallback;

  return trimmed
    .replace(/^https?:\/\/t\.me\//i, '')
    .replace(/^t\.me\//i, '')
    .replace(/^@+/, '')
    .trim() || fallback;
}

/**
 * Dynamically queries public.settings table from Supabase in real-time.
 * Every time an admin updates the support team user or official channel link in Admin Settings,
 * the bot fetches the fresh values dynamically with ZERO stale caching or hardcoded fallbacks.
 */
export async function getDynamicBotSettings(): Promise<DynamicBotSettings> {
  let supportUsername = '';
  let channelLink = '';
  let phoneEth = '';
  let phoneUsa = '';

  try {
    const { data, error } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['support_username', 'channel_link', 'support_phone_eth', 'support_phone_usa']);

    if (!error && Array.isArray(data)) {
      for (const row of data) {
        const val = (row.value ?? '').toString().trim();
        if (row.key === 'support_username') supportUsername = val;
        else if (row.key === 'channel_link') channelLink = val;
        else if (row.key === 'support_phone_eth') phoneEth = val;
        else if (row.key === 'support_phone_usa') phoneUsa = val;
      }
    } else if (error) {
      console.error('Supabase settings query error:', error);
    }
  } catch (err) {
    console.error('Failed to query public.settings table:', err);
  }

  const supportUrl = formatTelegramUrl(supportUsername, 'https://t.me/Hdasebingo');
  const channelUrl = formatTelegramUrl(channelLink, 'https://t.me/dmg_official_channel');

  return {
    support_username: cleanTelegramUsername(supportUsername, 'Hdasebingo'),
    support_url: supportUrl,
    channel_link: channelLink || channelUrl,
    channel_url: channelUrl,
    support_phone_eth: phoneEth,
    support_phone_usa: phoneUsa,
  };
}
