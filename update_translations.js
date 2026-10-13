const fs = require('fs');
const path = './miniapp/src/lib/translations.ts';

let content = fs.readFileSync(path, 'utf8');

// The file has export const t = { en: { ... }, am: { ... } };
// We need to parse it or just use regex to insert the new blocks.

const enAdditions = `
    deposit: {
      title: 'Deposit Funds',
      selectMethod: 'Select a Deposit Method',
      submitted: 'Submitted!',
      pendingReview: 'Your deposit request of {amount} ETB is now pending review.',
      willBeCredited: 'Your balance will be credited once an admin approves your payment. This usually takes a few minutes.',
      backHome: 'Back to Home',
      contactSupport: 'Contact Support',
      alreadyPendingTitle: 'Pending Review',
      alreadyPendingDesc: 'You already have a deposit of {amount} ETB waiting for approval.',
      waitAdmin: 'Please wait for an admin to process your current request before making a new one.',
      sendMoneyTo: 'SEND MONEY TO',
      amountTitle: 'ENTER DEPOSIT AMOUNT',
      minAmount: 'Min: {min} ETB',
      submitBtn: 'Submit Deposit Request',
      copySuccess: 'Copied!',
      copy: 'Copy',
    },
    withdraw: {
      title: 'Withdraw Funds',
      balance: 'Available Balance',
      amountTitle: 'WITHDRAWAL AMOUNT',
      minAmount: 'Min: {min} ETB',
      methodTitle: 'SELECT WITHDRAWAL METHOD',
      accountInfoTitle: 'ACCOUNT INFORMATION',
      accNameLabel: 'Account Holder Name',
      accNamePlaceholder: 'E.g., Abebe Kebede',
      accNumLabel: 'Account Number / Phone',
      accNumPlaceholder: 'E.g., 1000123456789',
      submitBtn: 'Submit Withdrawal Request',
      submitted: 'Submitted!',
      pendingReview: 'Your withdrawal request for {amount} ETB is now pending review.',
      willBeProcessed: 'Your funds will be transferred to your account once an admin approves your request.',
      alreadyPendingTitle: 'Pending Review',
      alreadyPendingDesc: 'You already have a withdrawal of {amount} ETB waiting for approval.',
      waitAdmin: 'Please wait for an admin to process your current request before making a new one.',
      insufficientBalance: 'Insufficient Balance',
      insufficientDesc: 'You do not have enough funds to withdraw this amount.',
    },
    transfer: {
      title: 'Transfer Funds',
      balance: 'Available Balance',
      amountTitle: 'TRANSFER AMOUNT',
      minAmount: 'Min: {min} ETB',
      recipientTitle: 'RECIPIENT',
      recipientLabel: 'Recipient Telegram ID',
      recipientPlaceholder: 'Enter Telegram ID',
      submitBtn: 'Transfer Funds',
      successTitle: 'Transfer Successful!',
      successDesc: 'You have successfully transferred {amount} ETB to {recipient}.',
      backHome: 'Back to Home',
      insufficientBalance: 'Insufficient Balance',
      insufficientDesc: 'You do not have enough funds to transfer this amount.',
      invalidRecipient: 'Invalid Recipient',
      invalidRecipientDesc: 'The recipient Telegram ID is invalid or does not exist.',
      cannotTransferSelf: 'You cannot transfer funds to yourself.',
    },
    invite: {
      title: 'Invite Friends',
      inviteLinkTitle: 'YOUR INVITE LINK',
      copyLinkBtn: 'Copy Link',
      shareBtn: 'Share Link',
      statsTitle: 'YOUR INVITE STATS',
      totalInvited: 'Total Invited',
      earnedFromInvites: 'Total Earned',
      howItWorksTitle: 'HOW IT WORKS',
      step1Title: 'Share your link',
      step1Desc: 'Send your invite link to friends.',
      step2Title: 'Friends join',
      step2Desc: 'They click the link and start playing.',
      step3Title: 'You earn',
      step3Desc: 'You get a bonus when they make their first deposit.',
    },
`;

const amAdditions = `
    deposit: {
      title: 'ገንዘብ ማስገቢያ',
      selectMethod: 'የገንዘብ ማስገቢያ መንገድ ይምረጡ',
      submitted: 'ተልኳል!',
      pendingReview: 'የ {amount} ETB ማስገቢያ ጥያቄዎ እየታየ ነው።',
      willBeCredited: 'ክፍያዎ በአድሚን እንደተረጋገጠ ሂሳብዎ ገቢ ይደረጋል። ጥቂት ደቂቃዎችን ሊወስድ ይችላል።',
      backHome: 'ወደ ዋናው ገጽ ይመለሱ',
      contactSupport: 'ድጋፍ ሰጪ ያግኙ',
      alreadyPendingTitle: 'በሂደት ላይ ያለ',
      alreadyPendingDesc: 'እስካሁን ያልፀደቀ የ {amount} ETB ማስገቢያ ጥያቄ አሎት።',
      waitAdmin: 'እባክዎ አዲስ ጥያቄ ከማቅረብዎ በፊት ያቀረቡት ጥያቄ እስኪስተናገድ ይጠብቁ።',
      sendMoneyTo: 'ገንዘብ የሚላክበት አድራሻ',
      amountTitle: 'የገንዘብ መጠን ያስገቡ',
      minAmount: 'ዝቅተኛ: {min} ETB',
      submitBtn: 'ማስገቢያ ጥያቄውን ላክ',
      copySuccess: 'ተቀድቷል!',
      copy: 'ቅዳ',
    },
    withdraw: {
      title: 'ገንዘብ ማውጫ',
      balance: 'ያሎት ሂሳብ',
      amountTitle: 'የሚያወጡት መጠን',
      minAmount: 'ዝቅተኛ: {min} ETB',
      methodTitle: 'የማውጫ መንገድ ይምረጡ',
      accountInfoTitle: 'የአካውንት መረጃ',
      accNameLabel: 'የአካውንቱ ባለቤት ስም',
      accNamePlaceholder: 'ምሳሌ: አበበ ከበደ',
      accNumLabel: 'የአካውንት ቁጥር / ስልክ',
      accNumPlaceholder: 'ምሳሌ: 1000123456789',
      submitBtn: 'ማውጫ ጥያቄውን ላክ',
      submitted: 'ተልኳል!',
      pendingReview: 'የ {amount} ETB ማውጫ ጥያቄዎ እየታየ ነው።',
      willBeProcessed: 'ጥያቄዎ በአድሚን እንደተረጋገጠ ገንዘቡ ወደ አካውንትዎ ይላካል።',
      alreadyPendingTitle: 'በሂደት ላይ ያለ',
      alreadyPendingDesc: 'እስካሁን ያልፀደቀ የ {amount} ETB ማውጫ ጥያቄ አሎት።',
      waitAdmin: 'እባክዎ አዲስ ጥያቄ ከማቅረብዎ በፊት ያቀረቡት ጥያቄ እስኪስተናገድ ይጠብቁ።',
      insufficientBalance: 'በቂ ሂሳብ የሎትም',
      insufficientDesc: 'ይህን ያህል መጠን ለማውጣት በቂ ሂሳብ የሎትም።',
    },
    transfer: {
      title: 'ገንዘብ ማስተላለፊያ',
      balance: 'ያሎት ሂሳብ',
      amountTitle: 'የሚያስተላልፉት መጠን',
      minAmount: 'ዝቅተኛ: {min} ETB',
      recipientTitle: 'ተቀባይ',
      recipientLabel: 'የተቀባይ ቴሌግራም ID',
      recipientPlaceholder: 'ቴሌግራም ID ያስገቡ',
      submitBtn: 'ገንዘብ አስተላልፍ',
      successTitle: 'በተሳካ ሁኔታ ተላልፏል!',
      successDesc: '{amount} ETB ለ {recipient} አስተላልፈዋል።',
      backHome: 'ወደ ዋናው ገጽ ይመለሱ',
      insufficientBalance: 'በቂ ሂሳብ የሎትም',
      insufficientDesc: 'ይህን ያህል መጠን ለማስተላለፍ በቂ ሂሳብ የሎትም።',
      invalidRecipient: 'ትክክለኛ ያልሆነ ተቀባይ',
      invalidRecipientDesc: 'ያስገቡት የቴሌግራም ID ትክክል አይደለም ወይም የለም።',
      cannotTransferSelf: 'ለራስዎ ገንዘብ ማስተላለፍ አይችሉም።',
    },
    invite: {
      title: 'ጓደኞችን ይጋብዙ',
      inviteLinkTitle: 'የእርስዎ መጋበዣ ሊንክ',
      copyLinkBtn: 'ሊንኩን ቅዳ',
      shareBtn: 'ሊንኩን አጋራ',
      statsTitle: 'የመጋበዣ ስታትስቲክስ',
      totalInvited: 'የተጋበዙ ሰዎች',
      earnedFromInvites: 'ያገኙት ቦነስ',
      howItWorksTitle: 'እንዴት እንደሚሰራ',
      step1Title: 'ሊንክዎን ያጋሩ',
      step1Desc: 'የመጋበዣ ሊንክዎን ለጓደኞችዎ ይላኩ።',
      step2Title: 'ጓደኞችዎ ሲቀላቀሉ',
      step2Desc: 'በሊንክዎ ገብተው መጫወት ሲጀምሩ።',
      step3Title: 'ቦነስ ያገኛሉ',
      step3Desc: 'የመጀመሪያ ጊዜ ገንዘብ ሲያስገቡ እርስዎ ቦነስ ያገኛሉ።',
    },
`;

content = content.replace(/profile:\s*\{[\s\S]*?\},/, (match) => {
  return match + enAdditions;
});

// the second match will be in 'am' object
let replacedCount = 0;
content = content.replace(/profile:\s*\{[\s\S]*?\},/g, (match) => {
  replacedCount++;
  if (replacedCount === 2) {
    return match + amAdditions;
  }
  return match;
});

fs.writeFileSync(path, content);
console.log('Translations updated successfully.');
