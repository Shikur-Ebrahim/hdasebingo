const fs = require('fs');
let code = fs.readFileSync('src/services/BingoEngine.ts', 'utf8');

code = code.replace(/win_type:\s*winType,/g, '');

fs.writeFileSync('src/services/BingoEngine.ts', code);
console.log('Removed win_type');
