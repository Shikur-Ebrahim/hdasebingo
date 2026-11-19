// Deterministic 32-bit PRNG (Mulberry32)
function mulberry32(a: number) {
  return function() {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 32-bit integer hash to ensure high entropy across all cartela numbers
function getCartelaSeed(num: number): number {
  let h = (Math.floor(num) * 2654435761) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  h = Math.imul(h, 2246822507) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return h || 1;
}

/**
 * Standard fixed 300-cartela Bingo matrix generator.
 * For any given cartela number (1..300), returns the exact same fixed 5x5 card every time.
 * - Column 0 (B): 5 unique numbers from range 1-15
 * - Column 1 (I): 5 unique numbers from range 16-30
 * - Column 2 (N): 4 unique numbers from range 31-45, with center [2][2] = 0 (Free Space)
 * - Column 3 (G): 5 unique numbers from range 46-60
 * - Column 4 (O): 5 unique numbers from range 61-75
 */
export function getFixedCartelaMatrix(cartelaNumber: number): number[][] {
  const safeNum = Math.max(1, Math.floor(Number(cartelaNumber) || 1));
  const seed = getCartelaSeed(safeNum);
  const rng = mulberry32(seed);
  const zones: [number, number][] = [
    [1, 15],
    [16, 30],
    [31, 45],
    [46, 60],
    [61, 75],
  ];
  const card: number[][] = Array.from({ length: 5 }, () => Array(5).fill(0));

  for (let col = 0; col < 5; col++) {
    const [lo, hi] = zones[col];
    const available: number[] = [];
    for (let n = lo; n <= hi; n++) available.push(n);

    // Deterministic Fisher-Yates shuffle for first 5 rows
    for (let r = 0; r < 5; r++) {
      const idx = r + Math.floor(rng() * (available.length - r));
      const temp = available[r];
      available[r] = available[idx];
      available[idx] = temp;
      card[r][col] = available[r];
    }
  }

  card[2][2] = 0; // Standard center FREE space
  return card;
}
