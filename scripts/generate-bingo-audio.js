/**
 * Hdasebingo — Professional Audio Generator
 * Uses Azure Cognitive Services with am-ET-AmehaNeural (genuine male neural voice)
 *
 * SETUP:
 *   1. Get a FREE Azure account at https://azure.microsoft.com/free
 *   2. Create a "Speech" resource (Free tier = 500,000 chars/month)
 *   3. Copy your KEY and REGION below
 *   4. Run: node scripts/generate-bingo-audio.js
 *
 * OUTPUT: miniapp/public/audio/bingo/B01.mp3 ... O75.mp3 + special sounds
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const AZURE_KEY    = process.env.AZURE_SPEECH_KEY    || 'YOUR_AZURE_KEY_HERE';
const AZURE_REGION = process.env.AZURE_SPEECH_REGION || 'eastus';
const VOICE        = 'am-ET-AmehaNeural'; // Genuine deep male Amharic neural voice
const OUT_DIR      = path.join(__dirname, '../miniapp/public/audio/bingo');
// ─────────────────────────────────────────────────────────────────────────────

fs.mkdirSync(OUT_DIR, { recursive: true });

// Full Amharic number words
const AMHARIC = {
  1:'አንድ', 2:'ሁለት', 3:'ሶስት', 4:'አራት', 5:'አምስት',
  6:'ስድስት', 7:'ሰባት', 8:'ስምንት', 9:'ዘጠኝ', 10:'አስር',
  11:'አስራ አንድ', 12:'አስራ ሁለት', 13:'አስራ ሶስት', 14:'አስራ አራት', 15:'አስራ አምስት',
  16:'አስራ ስድስት', 17:'አስራ ሰባት', 18:'አስራ ስምንት', 19:'አስራ ዘጠኝ', 20:'ሃያ',
  21:'ሃያ አንድ', 22:'ሃያ ሁለት', 23:'ሃያ ሶስት', 24:'ሃያ አራት', 25:'ሃያ አምስት',
  26:'ሃያ ስድስት', 27:'ሃያ ሰባት', 28:'ሃያ ስምንት', 29:'ሃያ ዘጠኝ', 30:'ሠላሳ',
  31:'ሠላሳ አንድ', 32:'ሠላሳ ሁለት', 33:'ሠላሳ ሶስት', 34:'ሠላሳ አራት', 35:'ሠላሳ አምስት',
  36:'ሠላሳ ስድስት', 37:'ሠላሳ ሰባት', 38:'ሠላሳ ስምንት', 39:'ሠላሳ ዘጠኝ', 40:'አርባ',
  41:'አርባ አንድ', 42:'አርባ ሁለት', 43:'አርባ ሶስት', 44:'አርባ አራት', 45:'አርባ አምስት',
  46:'አርባ ስድስት', 47:'አርባ ሰባት', 48:'አርባ ስምንት', 49:'አርባ ዘጠኝ', 50:'ሃምሳ',
  51:'ሃምሳ አንድ', 52:'ሃምሳ ሁለት', 53:'ሃምሳ ሶስት', 54:'ሃምሳ አራት', 55:'ሃምሳ አምስት',
  56:'ሃምሳ ስድስት', 57:'ሃምሳ ሰባት', 58:'ሃምሳ ስምንት', 59:'ሃምሳ ዘጠኝ', 60:'ስልሳ',
  61:'ስልሳ አንድ', 62:'ስልሳ ሁለት', 63:'ስልሳ ሶስት', 64:'ስልሳ አራት', 65:'ስልሳ አምስት',
  66:'ስልሳ ስድስት', 67:'ስልሳ ሰባት', 68:'ስልሳ ስምንት', 69:'ስልሳ ዘጠኝ', 70:'ሰባ',
  71:'ሰባ አንድ', 72:'ሰባ ሁለት', 73:'ሰባ ሶስት', 74:'ሰባ አራት', 75:'ሰባ አምስት',
};

const RANGES = { B:[1,15], I:[16,30], N:[31,45], G:[46,60], O:[61,75] };

function getLetter(num) {
  for (const [l, [lo, hi]] of Object.entries(RANGES)) {
    if (num >= lo && num <= hi) return l;
  }
  return 'B';
}

// SSML for a bingo call — English letter + dramatic pause + Amharic number
function callSSML(letter, num) {
  const amNum = AMHARIC[num];
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="am-ET">
  <voice name="${VOICE}">
    <prosody rate="0.9" pitch="0%">
      <lang xml:lang="en-US">${letter}!</lang>
      <break time="400ms"/>
      ${amNum}!
    </prosody>
  </voice>
</speak>`;
}

// SSML for special sounds
const SPECIAL_SSML = {
  'bingo_win': `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="am-ET">
  <voice name="${VOICE}">
    <prosody rate="1.0" pitch="5%">
      ቢንጎ! <break time="200ms"/> ቢንጎ! <break time="200ms"/> እንኳን ደስ አለዎ!
    </prosody>
  </voice>
</speak>`,
  'game_start': `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="am-ET">
  <voice name="${VOICE}">
    <prosody rate="0.9" pitch="0%">
      ጨዋታ ጀምሯል! <break time="300ms"/> ቁጥሮቹን ተዘጋጁ!
    </prosody>
  </voice>
</speak>`,
  'good_luck': `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="am-ET">
  <voice name="${VOICE}">
    <prosody rate="0.9" pitch="0%">
      መልካም ዕድል!
    </prosody>
  </voice>
</speak>`,
};

function fetchAzureTTS(ssml) {
  return new Promise((resolve, reject) => {
    const body = Buffer.from(ssml, 'utf8');
    const req = https.request({
      hostname: `${AZURE_REGION}.tts.speech.microsoft.com`,
      path: '/cognitiveservices/v1',
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_KEY,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
        'User-Agent': 'Hdasebingo',
        'Content-Length': body.length,
      },
    }, (res) => {
      if (res.statusCode !== 200) {
        let err = '';
        res.on('data', d => err += d);
        res.on('end', () => reject(new Error(`Azure TTS error ${res.statusCode}: ${err}`)));
        return;
      }
      const chunks = [];
      res.on('data', d => chunks.push(d));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function generate() {
  if (AZURE_KEY === 'YOUR_AZURE_KEY_HERE') {
    console.error('\n❌ ERROR: Please set AZURE_SPEECH_KEY environment variable or edit this file.\n');
    console.log('Get your free Azure key at https://azure.microsoft.com/free');
    console.log('Then run: AZURE_SPEECH_KEY=your_key node scripts/generate-bingo-audio.js\n');
    process.exit(1);
  }

  console.log('🎙️  Generating professional Amharic bingo caller audio...\n');

  // Generate all 75 bingo call files
  for (const [letter, [lo, hi]] of Object.entries(RANGES)) {
    for (let num = lo; num <= hi; num++) {
      const fname = `${letter}${String(num).padStart(2,'0')}.mp3`;
      const outPath = path.join(OUT_DIR, fname);
      if (fs.existsSync(outPath)) {
        console.log(`  ⏭️  Skip  ${fname} (already exists)`);
        continue;
      }
      try {
        const ssml = callSSML(letter, num);
        const buf = await fetchAzureTTS(ssml);
        fs.writeFileSync(outPath, buf);
        console.log(`  ✅  ${fname}  "${letter}... ${AMHARIC[num]}"`);
      } catch(e) {
        console.error(`  ❌  ${fname}  ERROR: ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 120)); // Avoid rate limit
    }
  }

  // Generate special sounds
  for (const [name, ssml] of Object.entries(SPECIAL_SSML)) {
    const outPath = path.join(OUT_DIR, `${name}.mp3`);
    if (fs.existsSync(outPath)) {
      console.log(`  ⏭️  Skip  ${name}.mp3 (already exists)`);
      continue;
    }
    try {
      const buf = await fetchAzureTTS(ssml);
      fs.writeFileSync(outPath, buf);
      console.log(`  ✅  ${name}.mp3`);
    } catch(e) {
      console.error(`  ❌  ${name}.mp3  ERROR: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 120));
  }

  console.log('\n🎉 Done! All audio files saved to miniapp/public/audio/bingo/');
  console.log('Now run: git add . && git commit -m "add professional bingo audio" && git push origin main');
}

generate();
