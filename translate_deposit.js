const fs = require('fs');
let code = fs.readFileSync('miniapp/src/pages/Deposit.tsx', 'utf8');

const replacements = [
  ['>Deposit Funds</h1>', '>{t[language].deposit.title}</h1>'],
  ['>Select a Deposit Method</p>', '>{t[language].deposit.selectMethod}</p>'],
  ['>Submitted!</h2>', '>{t[language].deposit.submitted}</h2>'],
  ['Your deposit request of <span', '{t[language].deposit.pendingReview.split(\'{amount}\')[0]}<span'],
  ['</span> is now <span className="text-yellow-600 font-black">pending review</span>.', '</span>{t[language].deposit.pendingReview.split(\'{amount}\')[1]}'],
  ['>Your balance will be credited once an admin approves your payment. This usually takes a few minutes.</p>', '>{t[language].deposit.willBeCredited}</p>'],
  ['Back to Home', '{t[language].deposit.backHome}'],
  ['Contact Support', '{t[language].deposit.contactSupport}'],
  ['>Pending Review</h2>', '>{t[language].deposit.alreadyPendingTitle}</h2>'],
  ['You already have a deposit of <span', '{t[language].deposit.alreadyPendingDesc.split(\'{amount}\')[0]}<span'],
  ['ETB</span> waiting for approval.', 'ETB</span> {t[language].deposit.alreadyPendingDesc.split(\'{amount}\')[1]}'],
  ['>Please wait for an admin to process your current request before making a new one.</p>', '>{t[language].deposit.waitAdmin}</p>'],
  ['>SEND MONEY TO</p>', '>{t[language].deposit.sendMoneyTo}</p>'],
  ['>ENTER DEPOSIT AMOUNT</label>', '>{t[language].deposit.amountTitle}</label>'],
  ['>Min: 100 ETB</span>', '>{t[language].deposit.minAmount.replace(\'{min}\', \'100\')}</span>'],
  ['Submit Deposit Request', '{t[language].deposit.submitBtn}'],
  ['>Copied!</span>', '>{t[language].deposit.copySuccess}</span>'],
  ['>Copy</span>', '>{t[language].deposit.copy}</span>'],
];

replacements.forEach(([from, to]) => {
  code = code.split(from).join(to);
});

fs.writeFileSync('miniapp/src/pages/Deposit.tsx', code);
