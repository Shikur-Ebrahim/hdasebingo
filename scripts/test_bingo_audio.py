import asyncio
import edge_tts
import os
import sys

VOICE = "am-ET-AmehaNeural"
OUTPUT_DIR = os.path.join("miniapp", "public", "audio", "bingo_samples")

AMHARIC_NUMS = {
    1: 'አንድ',
    23: 'ሃያ ሶስት',
    47: 'አርባ ሰባት',
    75: 'ሰባ አምስት'
}

async def generate_file(text, filename):
    file_path = os.path.join(OUTPUT_DIR, filename)
    print(f"Generating {filename} -> '{text}'")
    try:
        communicate = edge_tts.Communicate(text, VOICE)
        await communicate.save(file_path)
    except Exception as e:
        print(f"Error generating {filename}: {e}")

async def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    print(f"Using Voice: {VOICE}")
    print(f"Output Directory: {OUTPUT_DIR}\n")
    
    samples = [1, 23, 47, 75]
    for num in samples:
        amharic = AMHARIC_NUMS[num]
        text = f"የቢንጎ ቁጥር {amharic}"
        filename = f"bingo_{num:02d}.mp3"
        await generate_file(text, filename)

    print("\nSample generation complete! Go to miniapp/public/audio/bingo_samples to listen.")

if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
