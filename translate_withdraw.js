const fs = require('fs');
let code = fs.readFileSync('miniapp/src/pages/Withdraw.tsx', 'utf8');

const replacements = [
  ['>Withdraw Funds</h1>', '>{t[language].withdraw.title}</h1>'],
  ['>Available Balance</p>', '>{t[language].withdraw.balance}</p>'],
  ['>WITHDRAWAL AMOUNT</label>', '>{t[language].withdraw.amountTitle}</label>'],
  ['>Min: 100 ETB</span>', '>{t[language].withdraw.minAmount.replace(\'{min}\', \'100\')}</span>'],
  ['>SELECT WITHDRAWAL METHOD</p>', '>{t[language].withdraw.methodTitle}</p>'],
  ['>ACCOUNT INFORMATION</p>', '>{t[language].withdraw.accountInfoTitle}</p>'],
  ['>Account Holder Name</label>', '>{t[language].withdraw.accNameLabel}</label>'],
  ['placeholder="E.g., Abebe Kebede"', 'placeholder={t[language].withdraw.accNamePlaceholder}'],
  ['>Account Number / Phone</label>', '>{t[language].withdraw.accNumLabel}</label>'],
  ['placeholder="E.g., 1000123456789"', 'placeholder={t[language].withdraw.accNumPlaceholder}'],
  ['>Submit Withdrawal Request</span>', '>{t[language].withdraw.submitBtn}</span>'],
  ['>Submitted!</h2>', '>{t[language].withdraw.submitted}</h2>'],
  ['Your withdrawal request for <span', '{t[language].withdraw.pendingReview.split(\'{amount}\')[0]}<span'],
  ['</span> is now <span className="text-yellow-600 font-black">pending review</span>.', '</span>{t[language].withdraw.pendingReview.split(\'{amount}\')[1]}'],
  ['>Your funds will be transferred to your account once an admin approves your request.</p>', '>{t[language].withdraw.willBeProcessed}</p>'],
  ['Back to Home', '{t[language].withdraw.backHome}'],
  ['Contact Support', '{t[language].withdraw.contactSupport}'],
  ['>Pending Review</h2>', '>{t[language].withdraw.alreadyPendingTitle}</h2>'],
  ['You already have a withdrawal of <span', '{t[language].withdraw.alreadyPendingDesc.split(\'{amount}\')[0]}<span'],
  ['ETB</span> waiting for approval.', 'ETB</span> {t[language].withdraw.alreadyPendingDesc.split(\'{amount}\')[1]}'],
  ['>Please wait for an admin to process your current request before making a new one.</p>', '>{t[language].withdraw.waitAdmin}</p>'],
  ['>Insufficient Balance</h2>', '>{t[language].withdraw.insufficientBalance}</h2>'],
  ['>You do not have enough funds to withdraw this amount.</p>', '>{t[language].withdraw.insufficientDesc}</p>'],
];

replacements.forEach(([from, to]) => {
  code = code.split(from).join(to);
});

fs.writeFileSync('miniapp/src/pages/Withdraw.tsx', code);
