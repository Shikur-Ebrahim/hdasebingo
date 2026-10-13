const fs = require('fs');
let content = fs.readFileSync('./miniapp/src/lib/translations.ts', 'utf8');

const enAdditions = `
    invite: {
      title: 'Invite Friends',
      subtitle: 'Earn bonus ETB',
      heroTitle: 'Earn 10% Bonus',
      heroDesc: 'Get 10% of your friends\\' first deposit straight into your Bonus Balance!',
      linkTitle: 'Your Invite Link',
      shareBtn: 'Share Link',
      howItWorks: 'How it works',
      step1Title: 'Share your link',
      step1Desc: 'Send your invite link to friends.',
      step2Title: 'Friend joins & deposits',
      step2Desc: 'They start the bot and make their 1st deposit.',
      step3Title: 'You get rewarded!',
      step3Desc: 'You instantly receive 10% in your Bonus Balance.',
    },
`;

const amAdditions = `
    invite: {
      title: 'ጓደኞችን ይጋብዙ',
      subtitle: 'ቦነስ ያግኙ',
      heroTitle: '10% ቦነስ ያግኙ',
      heroDesc: 'ጓደኛዎ ለመጀመሪያ ጊዜ ከሚያስገባው ገንዘብ 10% በቀጥታ ወደ ቦነስ ሂሳብዎ ይገባል!',
      linkTitle: 'የእርስዎ መጋበዣ ሊንክ',
      shareBtn: 'ሊንኩን አጋራ',
      howItWorks: 'እንዴት እንደሚሰራ',
      step1Title: 'ሊንክዎን ያጋሩ',
      step1Desc: 'የመጋበዣ ሊንክዎን ለጓደኞችዎ ይላኩ።',
      step2Title: 'ጓደኛዎ ሲቀላቀል እና ሲያስገባ',
      step2Desc: 'ቦቱን አስጀምረው የመጀመሪያ ዴፖዚት ሲያደርጉ።',
      step3Title: 'እርስዎ ይሸለማሉ!',
      step3Desc: '10% ወዲያውኑ ወደ ቦነስ ሂሳብዎ ይገባል።',
    },
`;

// Remove the old invite block from translations.js if it exists, but actually it was added in the previous script.
// Let's just do a string replace in the file content.
content = content.replace(/invite:\s*\{[\s\S]*?\},/g, ''); // strip out previous invite blocks

// Insert after transfer: { ... },
content = content.replace(/(transfer:\s*\{[\s\S]*?\},)/, '$1\n' + enAdditions);

let amReplaced = false;
content = content.replace(/(transfer:\s*\{[\s\S]*?\},)/g, (match) => {
  if (match && !amReplaced) {
    amReplaced = true;
    return match; // skip English
  } else {
    return match + '\n' + amAdditions; // add to Amharic
  }
});

fs.writeFileSync('./miniapp/src/lib/translations.ts', content);
