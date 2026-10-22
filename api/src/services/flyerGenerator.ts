/**
 * Server-side Flyer Generator
 * Generates deposit / withdrawal proof flyers as PNG buffers using SVG + @resvg/resvg-js
 * (pure WASM — no native dependencies, works in Alpine Docker)
 */

import { Resvg } from '@resvg/resvg-js';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface DepositRow {
  amount: number | string;
  users?: { first_name?: string; username?: string } | null;
  deposit_methods?: { name?: string; type?: string } | null;
}

export interface WithdrawalRow {
  amount: number | string;
  net_amount?: number | string;
  account_name?: string;
  users?: { first_name?: string; username?: string } | null;
  withdrawal_methods?: { type?: string } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getPlayerName(users?: { first_name?: string; username?: string } | null): string {
  if (!users) return 'ተጫዋች';
  const fn = (users.first_name || '').trim();
  const un = (users.username || '').trim();
  if (fn && fn.length > 1) return fn.substring(0, 16);
  if (un) return ('@' + un).substring(0, 16);
  return 'ተጫዋች';
}

function getWinnerName(row: WithdrawalRow): string {
  if (row.users) {
    const fn = (row.users.first_name || '').trim();
    const un = (row.users.username || '').trim();
    if (fn && fn.length > 1) return fn.substring(0, 16);
    if (un) return ('@' + un).substring(0, 16);
  }
  if (row.account_name) return row.account_name.substring(0, 16);
  return 'አሸናፊ';
}

function formatMethod(type?: string, name?: string): string {
  const t = (type || '').toLowerCase();
  if (t.includes('tele') || t.includes('birr')) return 'Telebirr';
  if (t.includes('cbe')) return 'CBE';
  if (t.includes('boa')) return 'BOA';
  if (t.includes('abyssinia')) return 'Abyssinia';
  if (name) return name.substring(0, 12);
  return type ? type.substring(0, 12) : 'Transfer';
}

// ─── SVG Building Blocks ─────────────────────────────────────────────────────
const W = 750;
const H = 1150;

/** Returns the table rows SVG fragment for deposit or withdrawal */
function buildRows(
  type: 'deposit' | 'withdrawal',
  items: (DepositRow | WithdrawalRow)[],
  tableX: number,
  tableY: number,
  tableW: number,
  headH: number,
  rowH: number
): string {
  let batchSum = 0;
  let rowsSvg = '';
  const accentColor = type === 'deposit' ? '#15803d' : '#dc2626';
  const pillBg = type === 'deposit' ? '#dcfce7' : '#fee2e2';
  const altRowBg = type === 'deposit' ? '#fdfbf7' : '#fff9f9';
  const separatorColor = type === 'deposit' ? '#f1e7d0' : '#fee2e2';
  const methodBorder = type === 'deposit' ? '#86efac' : '#f43f5e';
  const methodBg = type === 'deposit' ? '#f0fdf4' : '#fff1f2';

  for (let i = 0; i < 10; i++) {
    const source = items.length > 0 ? (items[i] || items[i % items.length]) : null;
    const rowY = tableY + headH + i * rowH;
    const midRowY = rowY + rowH / 2;

    // Alternating row background
    if (i % 2 === 1) {
      rowsSvg += `<rect x="${tableX + 1}" y="${rowY}" width="${tableW - 2}" height="${rowH}" fill="${altRowBg}"/>`;
    }

    // Row separator
    if (i < 9) {
      rowsSvg += `<line x1="${tableX + 10}" y1="${rowY + rowH}" x2="${tableX + tableW - 10}" y2="${rowY + rowH}" stroke="${separatorColor}" stroke-width="1"/>`;
    }

    // Index pill
    rowsSvg += `<circle cx="${tableX + 24}" cy="${midRowY}" r="12" fill="${pillBg}"/>`;
    rowsSvg += `<text x="${tableX + 24}" y="${midRowY + 4.5}" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="12" fill="#000000">${i + 1}</text>`;

    if (source) {
      if (type === 'deposit') {
        const dep = source as DepositRow;
        const amt = Number(dep.amount || 0);
        batchSum += amt;
        const name = getPlayerName(dep.users);
        const method = formatMethod(dep.deposit_methods?.type, dep.deposit_methods?.name);

        // Check if it's a "special" method for badge color
        const mt = (dep.deposit_methods?.type || '').toLowerCase();
        const isTele = mt.includes('tele');
        const isCbe = mt.includes('cbe');
        const badgeBg2 = isTele ? '#fff7ed' : isCbe ? '#faf5ff' : methodBg;
        const badgeBorder2 = isTele ? '#fb923c' : isCbe ? '#c084fc' : methodBorder;

        rowsSvg += `<text x="${tableX + 46}" y="${midRowY + 5}" font-family="sans-serif" font-weight="900" font-size="14" fill="#000000">${esc(name)}</text>`;
        rowsSvg += `<rect x="${tableX + 225}" y="${midRowY - 12}" width="100" height="25" rx="6" fill="${badgeBg2}" stroke="${badgeBorder2}" stroke-width="1.2"/>`;
        rowsSvg += `<text x="${tableX + 275}" y="${midRowY + 4.5}" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="11.5" fill="#000000">${esc(method)}</text>`;
        rowsSvg += `<text x="${tableX + 480}" y="${midRowY + 5}" text-anchor="end" font-family="sans-serif" font-weight="900" font-size="15" fill="${accentColor}">+${amt.toLocaleString()} ETB</text>`;
        rowsSvg += `<text x="${tableX + tableW - 20}" y="${midRowY + 4.5}" text-anchor="end" font-family="sans-serif" font-weight="900" font-size="12" fill="${accentColor}">&#x2705; &#x1308;&#x1262; &#x1270;&#x12F0;&#x122D;&#x1701;&#x120D;</text>`;
      } else {
        const wd = source as WithdrawalRow;
        const net = Number(wd.net_amount || wd.amount || 0);
        batchSum += net;
        const name = getWinnerName(wd);
        const method = formatMethod((wd as any).withdrawal_methods?.type);

        rowsSvg += `<text x="${tableX + 46}" y="${midRowY + 5}" font-family="sans-serif" font-weight="900" font-size="14" fill="#000000">${esc(name)}</text>`;
        rowsSvg += `<rect x="${tableX + 225}" y="${midRowY - 12}" width="100" height="25" rx="6" fill="${methodBg}" stroke="${methodBorder}" stroke-width="1.2"/>`;
        rowsSvg += `<text x="${tableX + 275}" y="${midRowY + 4.5}" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="11.5" fill="#000000">${esc(method)}</text>`;
        rowsSvg += `<text x="${tableX + 480}" y="${midRowY + 5}" text-anchor="end" font-family="sans-serif" font-weight="900" font-size="15" fill="${accentColor}">+${net.toLocaleString()} ETB</text>`;
        rowsSvg += `<text x="${tableX + tableW - 20}" y="${midRowY + 4.5}" text-anchor="end" font-family="sans-serif" font-weight="900" font-size="12" fill="#15803d">&#x2705; &#x1270;&#x12A8;&#x1348;&#x1219;&#x120D;</text>`;
      }
    } else {
      // Placeholder row
      rowsSvg += `<text x="${tableX + 46}" y="${midRowY + 5}" font-family="sans-serif" font-weight="bold" font-size="13" fill="#000000">${type === 'deposit' ? '&#x1270;&#x1323;&#x12CB;&#x127D;' : '&#x12A0;&#x123D;&#x1293;&#x12ED;'}</text>`;
      rowsSvg += `<text x="${tableX + 480}" y="${midRowY + 5}" text-anchor="end" font-family="sans-serif" font-weight="900" font-size="14" fill="${accentColor}">${type === 'deposit' ? '+100 ETB' : '+500 ETB'}</text>`;
      rowsSvg += `<text x="${tableX + tableW - 20}" y="${midRowY + 4.5}" text-anchor="end" font-family="sans-serif" font-weight="900" font-size="12" fill="${accentColor}">&#x2705; ${type === 'deposit' ? '&#x1308;&#x1262; &#x1270;&#x12F0;&#x122D;&#x1701;&#x120D;' : '&#x1270;&#x12A8;&#x1348;&#x1219;&#x120D;'}</text>`;
    }
  }

  // Summary footer inside table
  const sumBoxY = tableY + 630 - 62;
  const sumBg1 = type === 'deposit' ? '#fef9c3' : '#fee2e2';
  const sumBg2 = type === 'deposit' ? '#fde68a' : '#fef9c3';
  const sumAmtColor = type === 'deposit' ? '#15803d' : '#dc2626';
  const displaySum = batchSum > 0 ? batchSum : (type === 'deposit' ? 1500 : 8636);
  const sumLabel = type === 'deposit'
    ? '&#x1363; &#x12A0;&#x1323;&#x1243;&#x120B;&#x12ED; &#x12E8;&#x1270;&#x1328;&#x1218;&#x1228; &#x12F2;&#x1354;&#x12DA;&#x1275; (TOTAL):'
    : '&#x1363; &#x12A0;&#x1323;&#x1243;&#x120B;&#x12ED; &#x12E8;&#x1270;&#x12A8;&#x1348;&#x1208; &#x123D;&#x120B;&#x121B;&#x1275; (TOTAL):';

  rowsSvg += `
    <defs>
      <linearGradient id="sumGrad_${type}" x1="${tableX}" y1="${sumBoxY}" x2="${tableX + tableW}" y2="${sumBoxY}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="${sumBg1}"/>
        <stop offset="100%" stop-color="${sumBg2}"/>
      </linearGradient>
    </defs>
    <rect x="${tableX + 12}" y="${sumBoxY}" width="${tableW - 24}" height="50" rx="12" fill="url(#sumGrad_${type})" stroke="${type === 'deposit' ? '#ca8a04' : '#f87171'}" stroke-width="1.2"/>
    <text x="${tableX + 28}" y="${sumBoxY + 30}" font-family="sans-serif" font-weight="900" font-size="14" fill="#000000">💰 ${sumLabel}</text>
    <text x="${tableX + tableW - 28}" y="${sumBoxY + 30}" text-anchor="end" font-family="sans-serif" font-weight="900" font-size="19" fill="${sumAmtColor}">${displaySum.toLocaleString()} ETB</text>
  `;

  return rowsSvg;
}

// ─── Main SVG Generator ───────────────────────────────────────────────────────
function buildSVG(
  type: 'deposit' | 'withdrawal',
  items: (DepositRow | WithdrawalRow)[],
  botUsername: string
): string {
  const isDeposit = type === 'deposit';
  const accentColor = isDeposit ? '#15803d' : '#dc2626';
  const medallionColor = isDeposit ? '#111827' : '#991b1b';

  const tableX = 40;
  const tableY = 216;
  const tableW = W - 80;
  const headH = 46;
  const rowH = 50;

  const headerText = isDeposit
    ? '✅ የተረጋገጡ ዲፖዚቶች • APPROVED DEPOSITS'
    : '🔴 የተረጋገጡ የሽልማት ክፍያዎች • CASHOUT PROOFS';
  const subText = isDeposit
    ? 'ፈጣን የሂሳብ መሙያ • 100% የታመነ እና የተረጋገጠ አሰራር'
    : 'የታመኑ አሸናፊዎች • ፈጣን የባንክ እና ቴሌብር ክፍያ';
  const col1Header = isDeposit ? 'ተጫዋች (PLAYER)' : 'አሸናፊ (WINNER)';
  const col3Header = isDeposit ? 'ዘዴ (METHOD)' : 'ዘዴ / ባንክ (METHOD)';
  const col4Header = isDeposit ? 'መጠን (AMOUNT)' : 'የተከፈለ (NET PAYOUT)';
  const mottoText = isDeposit
    ? 'እውነተኛ ተጫዋቾች  •  ፈጣን ዲፖዚት  •  ትልቅ ሽልማት'
    : 'በእምነት ይጫወቱ  •  እውነተኛ ብር ያሸንፉ  •  ወዲያውኑ ያውጡ';
  const ctaText = isDeposit
    ? `🎮 አሁኑኑ ይጫወቱ: @${botUsername}`
    : `🎮 ይጫወቱ እና ያውጡ: @${botUsername}`;
  const badge1 = isDeposit ? ['⚡', 'ፈጣን ገቢ'] : ['⚡', 'ፈጣን ክፍያ'];
  const badge2 = isDeposit ? ['🛡️', '100% አስተማማኝ'] : ['🏆', 'እውነተኛ አሸናፊዎች'];
  const badge3 = isDeposit ? ['🎱', '75 ቢንጎ'] : ['🛡️', '100% አስተማማኝ'];
  const badge4 = ['💎', 'ህዳሴ ቢንጎ'];
  const ctaBg1 = isDeposit ? '#15803d' : '#dc2626';
  const ctaBg2 = isDeposit ? '#166534' : '#991b1b';

  const rowsSvg = buildRows(type, items, tableX, tableY, tableW, headH, rowH);

  const colW = (W - 100) / 4;
  const badgeY = 878;
  const allBadges = [badge1, badge2, badge3, badge4];
  let badgesSvg = '';
  allBadges.forEach(([icon, label], idx) => {
    const colX = 50 + idx * colW + colW / 2;
    badgesSvg += `<text x="${colX}" y="${badgeY}" text-anchor="middle" font-size="22">${esc(icon)}</text>`;
    badgesSvg += `<text x="${colX}" y="${badgeY + 22}" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="11" fill="#000000">${esc(label)}</text>`;
    if (idx < 3) {
      const divX = 50 + (idx + 1) * colW;
      badgesSvg += `<line x1="${divX}" y1="${badgeY - 12}" x2="${divX}" y2="${badgeY + 22}" stroke="${isDeposit ? '#d4af37' : '#fca5a5'}" stroke-width="1"/>`;
    }
  });

  const botBoxW = 440;
  const botBoxH = 46;
  const botBoxX = (W - botBoxW) / 2;
  const botBoxY = 975;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <!-- Background gradient -->
    <linearGradient id="bgGrad" x1="0" y1="0" x2="0" y2="${H}" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="20%" stop-color="#fdfbf7"/>
      <stop offset="60%" stop-color="#faf4e6"/>
      <stop offset="100%" stop-color="#f3ebd6"/>
    </linearGradient>
    <!-- Table shadow filter -->
    <filter id="tableShadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="rgba(120,80,20,0.12)"/>
    </filter>
    <!-- CTA gradient -->
    <linearGradient id="ctaGrad" x1="${botBoxX}" y1="${botBoxY}" x2="${botBoxX + botBoxW}" y2="${botBoxY}" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="${ctaBg1}"/>
      <stop offset="100%" stop-color="${ctaBg2}"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="url(#bgGrad)"/>

  <!-- Double gold border frame -->
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" fill="none" stroke="#c59b27" stroke-width="2.5"/>
  <rect x="26" y="26" width="${W - 52}" height="${H - 52}" fill="none" stroke="#e6c86e" stroke-width="1"/>

  <!-- Corner diamonds -->
  <polygon points="26,21.5 30.5,26 26,30.5 21.5,26" fill="#b8860b"/>
  <polygon points="${W - 26},21.5 ${W - 21.5},26 ${W - 26},30.5 ${W - 30.5},26" fill="#b8860b"/>
  <polygon points="26,${H - 30.5} 30.5,${H - 26} 26,${H - 21.5} 21.5,${H - 26}" fill="#b8860b"/>
  <polygon points="${W - 26},${H - 30.5} ${W - 21.5},${H - 26} ${W - 26},${H - 21.5} ${W - 30.5},${H - 26}" fill="#b8860b"/>

  <!-- Crown emblem -->
  <!-- Crown base -->
  <rect x="${W / 2 - 22}" y="42" width="44" height="7" rx="2" fill="#d4af37"/>
  <!-- Crown spikes -->
  <polygon points="${W / 2 - 22},42 ${W / 2 - 25},24 ${W / 2 - 12},36 ${W / 2},20 ${W / 2 + 12},36 ${W / 2 + 25},24 ${W / 2 + 22},42" fill="#d4af37"/>
  <!-- Pearls -->
  <circle cx="${W / 2 - 25}" cy="23" r="2.5" fill="#fef08a"/>
  <circle cx="${W / 2 - 12}" cy="35" r="2.5" fill="#fef08a"/>
  <circle cx="${W / 2}" cy="19" r="2.5" fill="#fef08a"/>
  <circle cx="${W / 2 + 12}" cy="35" r="2.5" fill="#fef08a"/>
  <circle cx="${W / 2 + 25}" cy="23" r="2.5" fill="#fef08a"/>
  <!-- Medallion -->
  <circle cx="${W / 2}" cy="66" r="23" fill="${medallionColor}" stroke="#d4af37" stroke-width="3"/>
  <text x="${W / 2}" y="72" text-anchor="middle" font-family="'Times New Roman',Georgia,serif" font-weight="900" font-size="17" fill="#fef08a">HB</text>

  <!-- Title -->
  <text x="${W / 2}" y="134" text-anchor="middle" font-family="'Times New Roman',Georgia,serif" font-weight="900" font-size="38" fill="#0f172a">HDASE BINGO</text>

  <!-- Header -->
  <text x="${W / 2}" y="168" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="19" fill="${accentColor}">${esc(headerText)}</text>
  <text x="${W / 2}" y="188" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="13" fill="${isDeposit ? '#166534' : '#991b1b'}">${esc(subText)}</text>

  <!-- Divider -->
  <line x1="${W / 2 - 170}" y1="198" x2="${W / 2 + 170}" y2="198" stroke="${accentColor}" stroke-width="${isDeposit ? '1.6' : '1.8'}"/>
  <polygon points="${W / 2},${198 - 4.5} ${W / 2 + 4.5},198 ${W / 2},${198 + 4.5} ${W / 2 - 4.5},198" fill="${accentColor}"/>

  <!-- Main table card -->
  <rect x="${tableX}" y="${tableY}" width="${tableW}" height="630" rx="20" fill="#ffffff" stroke="#c59b27" stroke-width="2.5" filter="url(#tableShadow)"/>

  <!-- Table header -->
  <rect x="${tableX}" y="${tableY}" width="${tableW}" height="${headH}" rx="20" fill="#1e293b"/>
  <rect x="${tableX}" y="${tableY + headH / 2}" width="${tableW}" height="${headH / 2}" fill="#1e293b"/>

  <!-- Table column headers -->
  <text x="${tableX + 16}" y="${tableY + headH / 2 + 4.5}" font-family="sans-serif" font-weight="900" font-size="12" fill="#fef08a">#</text>
  <text x="${tableX + 46}" y="${tableY + headH / 2 + 4.5}" font-family="sans-serif" font-weight="900" font-size="12" fill="#fef08a">${esc(col1Header)}</text>
  <text x="${tableX + 225}" y="${tableY + headH / 2 + 4.5}" font-family="sans-serif" font-weight="900" font-size="12" fill="#fef08a">${esc(col3Header)}</text>
  <text x="${tableX + 480}" y="${tableY + headH / 2 + 4.5}" text-anchor="end" font-family="sans-serif" font-weight="900" font-size="12" fill="#fef08a">${esc(col4Header)}</text>
  <text x="${tableX + tableW - 20}" y="${tableY + headH / 2 + 4.5}" text-anchor="end" font-family="sans-serif" font-weight="900" font-size="12" fill="#fef08a">ሁኔታ (STATUS)</text>

  <!-- Table rows -->
  ${rowsSvg}

  <!-- Trust badges -->
  ${badgesSvg}

  <!-- Motto -->
  <text x="${W / 2}" y="946" text-anchor="middle" font-family="'Times New Roman',Georgia,serif" font-weight="bold" font-size="20" fill="${isDeposit ? '#0f172a' : '#7f1d1d'}">${esc(mottoText)}</text>

  <!-- CTA button -->
  <rect x="${botBoxX}" y="${botBoxY}" width="${botBoxW}" height="${botBoxH}" rx="23" fill="url(#ctaGrad)" stroke="#fbbf24" stroke-width="2"/>
  <text x="${W / 2}" y="${botBoxY + botBoxH / 2 + 6}" text-anchor="middle" font-family="sans-serif" font-weight="900" font-size="16" fill="#ffffff">${esc(ctaText)}</text>

  <!-- Footer -->
  <text x="${W / 2}" y="1056" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="12" fill="#64748b">ህዳሴ ቢንጎ • Official Partner Network • Powered by HDASE BINGO</text>
</svg>`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a deposit or withdrawal proof flyer PNG buffer (server-side).
 */
export async function generateFlyerPng(
  type: 'deposit' | 'withdrawal',
  items: (DepositRow | WithdrawalRow)[],
  botUsername: string
): Promise<Buffer> {
  const svg = buildSVG(type, items, botUsername);
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    font: { loadSystemFonts: false },
  });
  const pngData = resvg.render();
  return Buffer.from(pngData.asPng());
}
