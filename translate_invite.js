const fs = require('fs');
let code = fs.readFileSync('miniapp/src/pages/Invite.tsx', 'utf8');

const replacements = [
  ['>Invite Friends</h1>', '>{t[language].invite.title}</h1>'],
  ['>Earn bonus ETB</p>', '>{t[language].invite.subtitle}</p>'],
  ['>Earn 10% Bonus</h2>', '>{t[language].invite.heroTitle}</h2>'],
  ["Get 10% of your friends' first deposit straight into your Bonus Balance!", '{t[language].invite.heroDesc}'],
  ['>Your Invite Link</label>', '>{t[language].invite.linkTitle}</label>'],
  ['>Share Link</span>', '>{t[language].invite.shareBtn}</span>'],
  ['>How it works</h3>', '>{t[language].invite.howItWorks}</h3>'],
  ['>Share your link</p>', '>{t[language].invite.step1Title}</p>'],
  ['>Send your invite link to friends.</p>', '>{t[language].invite.step1Desc}</p>'],
  ['>Friend joins &amp; deposits</p>', '>{t[language].invite.step2Title}</p>'],
  ['>They start the bot and make their 1st deposit.</p>', '>{t[language].invite.step2Desc}</p>'],
  ['>You get rewarded!</p>', '>{t[language].invite.step3Title}</p>'],
  ['>You instantly receive 10% in your Bonus Balance.</p>', '>{t[language].invite.step3Desc}</p>'],
];

replacements.forEach(([from, to]) => {
  code = code.split(from).join(to);
});

// also fix the Friend joins & deposits which might be encoded or not
code = code.replace(/>Friend joins & deposits<\/p>/g, '>{t[language].invite.step2Title}</p>');

fs.writeFileSync('miniapp/src/pages/Invite.tsx', code);
