require('dotenv').config();
const env = process.env;
module.exports = {
  botName: env.BOT_NAME || 'Ruthless', tagline: env.BOT_TAGLINE || env.BOT_NAME || 'Ruthless', prefix: env.PREFIX || '.',
  ownerNumber: (env.OWNER_NUMBER || '').replace(/\D/g, ''),
  pairingNumber: (env.PAIRING_NUMBER || '').replace(/\D/g, ''),
  mode: env.MODE === 'self' ? 'self' : 'public',
  databaseUrl: env.DATABASE_URL || '', sessionId: env.SESSION_ID || '',
  pairingApiUrl: env.PAIRING_API_URL || '', pairingSiteUrl: env.PAIRING_SITE_URL || '', heartbeat: env.HEARTBEAT === 'on',
  dataServiceUrl: env.DATA_SERVICE_URL || '', dataServiceToken: env.DATA_SERVICE_TOKEN || '', allowDirectMongo: env.ALLOW_LEGACY_DIRECT_MONGO === 'true',
  deployHook: env.DEPLOY_HOOK || '', repoUrl: env.REPO_URL || 'https://github.com/RUTH-BOT-TECH/RUTHLESS-BOT', donateUrl: env.DONATE_URL || '',
  timezone: env.DEFAULT_TIMEZONE || 'Africa/Lagos', port: Number(env.PORT || 3000),
  creator: '2348021016309',
  stickerPack: env.STICKER_PACK || 'Ruthless', stickerAuthor: env.STICKER_AUTHOR || 'Ruthless MD',
  texts: {
    rules: env.RULES_TEXT || 'Be respectful and follow group rules.',
    faq: env.FAQ_TEXT || 'Use .menu to see available commands.',
    support: env.SUPPORT_TEXT || 'Contact the bot owner for support.',
    tos: env.TOS_TEXT || 'Use this bot responsibly.',
    privacy: env.PRIVACY_TEXT || 'This bot stores settings and account data configured by its owner.'
  }
};
