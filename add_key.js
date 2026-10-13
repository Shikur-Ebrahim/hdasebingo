const fs = require('fs');
let lines = fs.readFileSync('miniapp/src/lib/translations.ts', 'utf8').split('\n');
// Find the second occurrence of "contactSupport" (Amharic one) and add after it
let count = 0;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("contactSupport:")) {
    count++;
    if (count === 2) {
      // Insert after this line
      lines.splice(i + 1, 0, "      onlyMainBalance: '\u12CB\u1293\u12CD \u1215\u1�\u1385 \u1265\u127B \u120A\u12C8\u1323 \u12ED\u127D\u1209',");
      break;
    }
  }
}
fs.writeFileSync('miniapp/src/lib/translations.ts', lines.join('\n'));
console.log("Added onlyMainBalance");
