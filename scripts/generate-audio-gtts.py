"""
ADWA Bingo — Pre-generate all 75 audio files using gTTS (Google TTS)
No account or API key needed!

Install first:
  pip install gtts pydub

Then run:
  python scripts/generate-audio-gtts.py

Output: miniapp/public/audio/bingo/B01.mp3 ... O75.mp3
"""

import os
import time
from pathlib import Path

try:
    from gtts import gTTS
except ImportError:
    print("Please run: pip install gtts")
    exit(1)

OUT_DIR = Path(__file__).parent.parent / "miniapp" / "public" / "audio" / "bingo"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Amharic number words
AMHARIC = {
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
}

RANGES = {'B': range(1,16), 'I': range(16,31), 'N': range(31,46), 'G': range(46,61), 'O': range(61,76)}

SPECIAL = {
    'bingo_win':  'ቢንጎ! ቢንጎ! እንኳን ደስ አለዎ!',
    'game_start': 'ጨዋታ ጀምሯል! ቁጥሮቹን ተዘጋጁ!',
    'good_luck':  'መልካም ዕድል!',
}

def make(text, path):
    if path.exists():
        print(f"  ⏭  Skip  {path.name} (exists)")
        return
    try:
        tts = gTTS(text=text, lang='am', slow=False)
        tts.save(str(path))
        print(f"  ✅  {path.name}  → {text}")
    except Exception as e:
        print(f"  ❌  {path.name}  ERROR: {e}")
    time.sleep(0.3)  # Avoid Google rate limiting

print("🎙  Generating Amharic Bingo audio with Google TTS...\n")

# 75 bingo calls
for letter, nums in RANGES.items():
    for num in nums:
        fname = f"{letter}{str(num).zfill(2)}.mp3"
        # Format: "B... አንድ" — letter in English, number in Amharic
        text = f"{letter}. {AMHARIC[num]}"
        make(text, OUT_DIR / fname)

# Special sounds
for name, text in SPECIAL.items():
    make(text, OUT_DIR / f"{name}.mp3")

print(f"\n🎉 Done! Files saved to: {OUT_DIR}")
print("\nNext steps:")
print("  git add miniapp/public/audio/")
print('  git commit -m "add pre-generated bingo audio"')
print("  git push origin main")
