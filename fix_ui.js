const fs = require('fs');

let wCode = fs.readFileSync('miniapp/src/pages/Withdraw.tsx', 'utf8');

const wReplacements = [
  ['>Withdraw</h1>', '>{t[language].withdraw.title}</h1>'],
  ['>Choose a withdrawal method</p>', '>{t[language].withdraw.chooseWithdrawMethod}</p>'],
  ['>AVAILABLE METHODS</p>', '>{t[language].withdraw.availableMethods}</p>'],
  ['>Withdraw via {typeLabels[selected.type]}</h1>', '>{t[language].withdraw.withdrawVia} {typeLabels[selected.type]}</h1>'],
  ['>Min withdrawal: {selected.min_withdrawal.toLocaleString(\\'en-US\\')} ETB</p>', '>{t[language].withdraw.minWithdrawal} {selected.min_withdrawal.toLocaleString(\\'en-US\\')} ETB</p>'],
  ['>Amount (ETB)</label>', '>{t[language].withdraw.amountLabel}</label>'],
  ['>Full Name</label>', '>{t[language].withdraw.fullNameLabel}</label>'],
  ['placeholder="Your full name on the account"', 'placeholder={t[language].withdraw.fullNamePlaceholder}'],
  ["selected.type === 'telebirr' || selected.type === 'mpesa' ? 'Phone Number' : 'Account Number'", "selected.type === 'telebirr' || selected.type === 'mpesa' ? t[language].withdraw.phoneLabel : t[language].withdraw.accNumberLabel"],
  ['Your main balance will be immediately debited. Funds will be transferred to your account within a few minutes.', '{t[language].withdraw.infoBox}'],
  ["{submitting ? 'Submitting...' : 'o. {t[language].withdraw.submitBtn}'}", "{submitting ? t[language].withdraw.submitting : t[language].withdraw.submitBtn}"],
];

wReplacements.forEach(([from, to]) => {
  wCode = wCode.split(from).join(to);
});

// Fix the button text
wCode = wCode.replace(/>\s*\{submitting\s*\?\s*'Submitting\.\.\.'\s*:\s*`o. Submit`\s*\}\s*<\/button>/g, '>{submitting ? t[language].withdraw.submitting : t[language].withdraw.submitBtn}</button>');

fs.writeFileSync('miniapp/src/pages/Withdraw.tsx', wCode);


let tCode = fs.readFileSync('miniapp/src/pages/Transfer.tsx', 'utf8');

const tReplacements = [
  ['>Transfer</h1>', '>{t[language].transfer.transferTitle}</h1>'],
  ['>Send ETB to another player</p>', '>{t[language].transfer.transferSubtitle}</p>'],
  ['>Your Main Balance</p>', '>{t[language].transfer.yourMainBalance}</p>'],
  ['>User ID</label>', '>{t[language].transfer.userIdLabel}</label>'],
  ['placeholder="e.g. 7898071735"', 'placeholder={t[language].transfer.userIdPlaceholder}'],
  ['>Amount (ETB)</label>', '>{t[language].transfer.amountLabel}</label>'],
  ['>Min transfer is 10 ETB</p>', '>{t[language].transfer.minTransfer.replace(\\'{min}\\', \\'10\\')}</p>'],
  ["{loading ? 'Transferring...' : 'o. Transfer ETB'}", "{loading ? t[language].transfer.transferring : t[language].transfer.transferBtn}"],
  ['>Transfer Successful!</h2>', '>{t[language].transfer.successTitle}</h2>'],
];

tReplacements.forEach(([from, to]) => {
  tCode = tCode.split(from).join(to);
});

tCode = tCode.replace(/>\s*\{loading\s*\?\s*'Transferring\.\.\.'\s*:\s*'o. Transfer ETB'\}\s*<\/button>/g, '>{loading ? t[language].transfer.transferring : t[language].transfer.transferBtn}</button>');

fs.writeFileSync('miniapp/src/pages/Transfer.tsx', tCode);
console.log("Fixed Withdraw and Transfer UI files");
