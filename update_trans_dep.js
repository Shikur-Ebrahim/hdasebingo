const fs = require('fs');
let content = fs.readFileSync('miniapp/src/lib/translations.ts', 'utf8');

const enAdd = `
      availableMethods: 'AVAILABLE METHODS',
      depositVia: 'Deposit via',
      minDepositText: 'Min Deposit',
      howToDeposit: 'HOW TO DEPOSIT',
      amountSent: 'AMOUNT YOU SENT (ETB)',
      paymentScreenshot: 'PAYMENT SCREENSHOT',
      tapToUpload: 'Tap to upload screenshot',
      jpgPng: 'JPG, PNG supported',
      submitting: 'Submitting...',
`;

const amAdd = `
      availableMethods: 'ያሉ መንገዶች',
      depositVia: 'በዚህ ያስገቡ:',
      minDepositText: 'ዝቅተኛ ማስገቢያ',
      howToDeposit: 'እንዴት እንደሚያስገቡ',
      amountSent: 'የላኩት መጠን (ETB)',
      paymentScreenshot: 'የክፍያ ማረጋገጫ (Screenshot)',
      tapToUpload: 'ማረጋገጫ ለማስገባት ይንኩ',
      jpgPng: 'JPG, PNG ይቻላል',
      submitting: 'እየተላከ ነው...',
`;

let c1 = 0;
content = content.replace(/deposit:\s*\{/g, (match) => {
  c1++;
  if (c1 === 1) return match + '\n' + enAdd;
  if (c1 === 2) return match + '\n' + amAdd;
  return match;
});
fs.writeFileSync('miniapp/src/lib/translations.ts', content);
