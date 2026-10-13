const fs = require('fs');
let code = fs.readFileSync('src/services/BingoEngine.ts', 'utf8');

// 1. Remove the standalone atomic claim
const claimRegex = /\/\/ -- ATOMIC CLAIM:[\s\S]*?return;\s*\}/;
code = code.replace(claimRegex, '');

// 2. Add atomic claim to Single winner update
code = code.replace(
  /await supabase\.from\('bingo_games'\)\.update\(\{\s*status:\s*'finished',\s*winner_telegram_id: w\.telegram_id,[\s\S]*?\}\)\.eq\('id', gameId\);/,
  `const { data: claim, error: claimErr } = await supabase.from('bingo_games').update({
        status:             'finished',
        winner_telegram_id: w.telegram_id,
        winner_first_name:  isEarlyCall ? \`?? EARLY BINGO: \${w.first_name}\` : w.first_name,
        winner_cartela:     w.cartela_number,
        winner_prize:       finalPrize,
        win_type:           winType,
        finished_at:        new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      }).eq('id', gameId).eq('status', 'calling').select('id');
      if (claimErr || !claim || claim.length === 0) return;`
);

// 3. Add atomic claim to 2-way tie update
code = code.replace(
  /await supabase\.from\('bingo_games'\)\.update\(\{\s*status:\s*'finished',\s*winner_telegram_id: w1\.telegram_id,[\s\S]*?\}\)\.eq\('id', gameId\);/,
  `const { data: claim, error: claimErr } = await supabase.from('bingo_games').update({
        status:             'finished',
        winner_telegram_id: w1.telegram_id,
        winner_first_name:  \`\${w1.first_name} & \${w2.first_name}\`,
        winner_cartela:     w1.cartela_number,
        winner_prize:       splitPrize,
        tie_count:          2,
        finished_at:        new Date().toISOString(),
        updated_at:         new Date().toISOString(),
      }).eq('id', gameId).eq('status', 'calling').select('id');
      if (claimErr || !claim || claim.length === 0) return;`
);

// 4. Add atomic claim to REMATCH update
code = code.replace(
  /await supabase\.from\('bingo_games'\)\.update\(\{\s*status:\s*'finished',\s*winner_first_name:\s*'REMATCH',[\s\S]*?\}\)\.eq\('id', gameId\);/,
  `const { data: claim, error: claimErr } = await supabase.from('bingo_games').update({
        status:            'finished',
        winner_first_name: 'REMATCH',
        winner_prize:      0,
        winner_cartela:    null,
        finished_at:       new Date().toISOString(),
        updated_at:        new Date().toISOString(),
      }).eq('id', gameId).eq('status', 'calling').select('id');
      if (claimErr || !claim || claim.length === 0) return;`
);

fs.writeFileSync('src/services/BingoEngine.ts', code);
console.log('Done replacement');
