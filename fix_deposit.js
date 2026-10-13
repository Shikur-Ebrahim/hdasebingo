const fs = require('fs');
let code = fs.readFileSync('miniapp/src/pages/Deposit.tsx', 'utf8');

const replacements = [
  ['>Deposit</h1>', '>{t[language].deposit.title}</h1>'],
  ['>Choose a payment method</p>', '>{t[language].deposit.selectMethod}</p>'],
  ['>AVAILABLE METHODS</p>', '>{t[language].deposit.availableMethods}</p>'],
  ['>Deposit via {typeLabels[selected.type]}</h1>', '>{t[language].deposit.depositVia} {typeLabels[selected.type]}</h1>'],
  ['>Min Deposit</span>', '>{t[language].deposit.minDepositText}</span>'],
  ['>HOW TO DEPOSIT</p>', '>{t[language].deposit.howToDeposit}</p>'],
  ['>AMOUNT YOU SENT (ETB)</label>', '>{t[language].deposit.amountSent}</label>'],
  ['>PAYMENT SCREENSHOT</label>', '>{t[language].deposit.paymentScreenshot}</label>'],
  ['>Tap to upload screenshot</p>', '>{t[language].deposit.tapToUpload}</p>'],
  ['>JPG, PNG supported</p>', '>{t[language].deposit.jpgPng}</p>'],
  ["{submitting ? 'Submitting...' : 'o. {t[language].deposit.submitBtn}'}", "{submitting ? t[language].deposit.submitting : t[language].deposit.submitBtn}"],
];

replacements.forEach(([from, to]) => {
  code = code.split(from).join(to);
});

fs.writeFileSync('miniapp/src/pages/Deposit.tsx', code);
