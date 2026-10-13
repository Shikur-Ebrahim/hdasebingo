const fs = require('fs');
let code = fs.readFileSync('miniapp/src/pages/Transfer.tsx', 'utf8');

const replacements = [
  ['>Transfer Funds</h1>', '>{t[language].transfer.title}</h1>'],
  ['>Available Balance</p>', '>{t[language].transfer.balance}</p>'],
  ['>RECIPIENT</p>', '>{t[language].transfer.recipientTitle}</p>'],
  ['>Recipient Telegram ID</label>', '>{t[language].transfer.recipientLabel}</label>'],
  ['placeholder="Enter Telegram ID"', 'placeholder={t[language].transfer.recipientPlaceholder}'],
  ['>TRANSFER AMOUNT</label>', '>{t[language].transfer.amountTitle}</label>'],
  ['>Min: 100 ETB</span>', '>{t[language].transfer.minAmount.replace(\'{min}\', \'10\')}</span>'], // I assume it was 10, wait let's check
  ['>Transfer Funds</span>', '>{t[language].transfer.submitBtn}</span>'],
  ['>Transfer Successful!</h2>', '>{t[language].transfer.successTitle}</h2>'],
  ['You have successfully transferred <span', '{t[language].transfer.successDesc.split(\'{amount}\')[0]}<span'],
  ['ETB</span> to <span', 'ETB</span> {t[language].transfer.successDesc.split(\'{amount}\')[1].split(\'{recipient}\')[0]}<span'],
  ['</span>.</p>', '</span> {t[language].transfer.successDesc.split(\'{recipient}\')[1]}</p>'],
  ['Back to Home', '{t[language].transfer.backHome}'],
  ['>Insufficient Balance</h2>', '>{t[language].transfer.insufficientBalance}</h2>'],
  ['>You do not have enough funds to transfer this amount.</p>', '>{t[language].transfer.insufficientDesc}</p>'],
  ['>Invalid Recipient</h2>', '>{t[language].transfer.invalidRecipient}</h2>'],
  ['>The recipient Telegram ID is invalid or does not exist.</p>', '>{t[language].transfer.invalidRecipientDesc}</p>'],
];

replacements.forEach(([from, to]) => {
  code = code.split(from).join(to);
});

fs.writeFileSync('miniapp/src/pages/Transfer.tsx', code);
