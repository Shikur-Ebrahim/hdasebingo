"""
ADWA Bingo Audio Generator
- Letter: English male voice (en-US-GuyNeural) saying "B", "I", "N", "G", "O"
- Number: Amharic male voice (am-ET-AmehaNeural) saying the Amharic number
- Combined into one MP3 per number using raw byte concatenation
"""

import asyncio
import edge_tts
import os
import sys

VOICE_EN  = "en-US-GuyNeural"     # English male voice for letters
VOICE_AM  = "am-ET-AmehaNeural"   # Amharic male voice for numbers
OUTPUT_DIR = os.path.join("miniapp", "public", "audio", "bingo")
TMP_DIR    = os.path.join(OUTPUT_DIR, "_tmp")

AMHARIC_NUMS = {
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

RANGES = {
    'B': range(1, 16),
    'I': range(16, 31),
    'N': range(31, 46),
    'G': range(46, 61),
    'O': range(61, 76),
}

SPECIAL = {
    'bingo_win':  ('Bingo!', VOICE_EN),
    'game_start': ('ጨዋታ ጀምሯል! ቁጥሮቹን ተዘጋጁ!',   VOICE_AM),
    'good_luck':  ('መልካም ዕድል!',                    VOICE_AM),
}

async def tts_bytes(text, voice):
    """Generate TTS and return raw MP3 bytes."""
    tmp_path = os.path.join(TMP_DIR, f"_tts_{hash(text + voice) & 0xFFFFFF}.mp3")
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(tmp_path)
    with open(tmp_path, 'rb') as f:
        return f.read()

async def generate_call(letter, num):
    """Generate letter (English) + number (Amharic) combined MP3."""
    out_path = os.path.join(OUTPUT_DIR, f"bingo_{num:02d}.mp3")
    print(f"Generating bingo_{num:02d}.mp3  [{letter} #{num}]")
    try:
        # English letter with short dramatic pause built in
        letter_bytes  = await tts_bytes(f"{letter}!", VOICE_EN)
        # Small silence gap (800 bytes of null = ~50ms silence at MP3 layer)
        silence = b'\x00' * 800
        # Amharic number
        number_bytes  = await tts_bytes(AMHARIC_NUMS[num], VOICE_AM)
        # Concatenate: letter MP3 + silence + amharic MP3
        combined = letter_bytes + silence + number_bytes
        with open(out_path, 'wb') as f:
            f.write(combined)
    except Exception as e:
        print(f"  ERROR bingo_{num:02d}: {e}")

async def generate_special(name, text, voice):
    out_path = os.path.join(OUTPUT_DIR, f"{name}.mp3")
    print(f"Generating {name}.mp3...")
    try:
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(out_path)
    except Exception as e:
        print(f"  ERROR {name}: {e}")

async def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(TMP_DIR, exist_ok=True)

    print(f"Letter voice : {VOICE_EN}")
    print(f"Number voice : {VOICE_AM}")
    print(f"Output dir   : {OUTPUT_DIR}\n")

    # Generate all 75 bingo calls
    for letter, nums in RANGES.items():
        for num in nums:
            await generate_call(letter, num)

    # Special sounds
    for name, (text, voice) in SPECIAL.items():
        await generate_special(name, text, voice)

    # Cleanup tmp files
    import shutil
    shutil.rmtree(TMP_DIR, ignore_errors=True)

    print("\nDone! All files generated.")

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
