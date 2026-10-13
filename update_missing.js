const fs = require('fs');

const path = 'miniapp/src/lib/translations.ts';
let content = fs.readFileSync(path, 'utf8');

const enAddWithdraw = `
      minWithdrawal: 'Min withdrawal:',
      amountLabel: 'Amount (ETB)',
      fullNameLabel: 'Full Name',
      fullNamePlaceholder: 'Your full name on the account',
      phoneLabel: 'Phone Number',
      accNumberLabel: 'Account Number',
      infoBox: 'Your main balance will be immediately debited. Funds will be transferred to your account within a few minutes.',
      withdrawVia: 'Withdraw via',
      chooseWithdrawMethod: 'Choose a withdrawal method',
      availableMethods: 'AVAILABLE METHODS',
      submitting: 'Submitting...',
`;

const amAddWithdraw = `
      minWithdrawal: 'ዝቅተኛ ማውጫ:',
      amountLabel: 'መጠን (ETB)',
      fullNameLabel: 'ሙሉ ስም',
      fullNamePlaceholder: 'በአካውንቱ ላይ ያለዎት ሙሉ ስም',
      phoneLabel: 'ስልክ ቁጥር',
      accNumberLabel: 'የአካውንት ቁጥር',
      infoBox: 'ዋናው ሂሳብዎ ወዲያውኑ ይቀነሳል። ገንዘቡ በደቂቃዎች ውስጥ ወደ አካውንትዎ ይተላለፋል።',
      withdrawVia: 'በዚህ ያውጡ:',
      chooseWithdrawMethod: 'የገንዘብ ማውጫ መንገድ ይምረጡ',
      availableMethods: 'ያሉ መንገዶች',
      submitting: 'እየተላከ ነው...',
`;

let c2 = 0;
content = content.replace(/withdraw:\s*\{/g, (match) => {
  c2++;
  if (c2 === 1) return match + '\n' + enAddWithdraw;
  if (c2 === 2) return match + '\n' + amAddWithdraw;
  return match;
});

const enAddTransfer = `
      transferTitle: 'Transfer',
      transferSubtitle: 'Send ETB to another player',
      yourMainBalance: 'Your Main Balance',
      userIdLabel: 'User ID',
      userIdPlaceholder: 'e.g. 7898071735',
      amountLabel: 'Amount (ETB)',
      minTransfer: 'Min transfer is {min} ETB',
      transferBtn: 'Transfer ETB',
      transferring: 'Transferring...',
`;

const amAddTransfer = `
      transferTitle: 'ማስተላለፊያ',
      transferSubtitle: 'ለሌላ ተጫዋች ETB ይላኩ',
      yourMainBalance: 'ዋና ሂሳብዎ',
      userIdLabel: 'የተጠቃሚ ID',
      userIdPlaceholder: 'ምሳሌ: 7898071735',
      amountLabel: 'መጠን (ETB)',
      minTransfer: 'ዝቅተኛ ማስተላለፊያ {min} ETB ነው',
      transferBtn: 'ETB አስተላልፍ',
      transferring: 'እየተላለፈ ነው...',
`;

let c3 = 0;
content = content.replace(/transfer:\s*\{/g, (match) => {
  c3++;
  if (c3 === 1) return match + '\n' + enAddTransfer;
  if (c3 === 2) return match + '\n' + amAddTransfer;
  return match;
});

fs.writeFileSync(path, content);
console.log("Updated translations.ts");
