<div align="center">

<img src="assets/menu/ruthless-neon.jpg" width="100%" alt="Ruthless MD banner" />

# ⚡ RUTHLESS MD
**Your WhatsApp. Your bot. Your rules.**

[![Node](https://img.shields.io/badge/Node.js-22-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Multi--Device-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://www.whatsapp.com/)
[![Status](https://img.shields.io/badge/Status-Work%20in%20Progress-9b6dff?style=for-the-badge)](docs/setup-and-privacy.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-9b6dff?style=for-the-badge)](LICENSE)

[![Stars](https://img.shields.io/github/stars/RUTH-BOT-TECH/RUTHLESS-BOT?style=flat-square&color=9b6dff)](https://github.com/RUTH-BOT-TECH/RUTHLESS-BOT/stargazers)
[![Forks](https://img.shields.io/github/forks/RUTH-BOT-TECH/RUTHLESS-BOT?style=flat-square&color=9b6dff)](https://github.com/RUTH-BOT-TECH/RUTHLESS-BOT/forks)

[![Get your session](https://img.shields.io/badge/GET%20YOUR%20SESSION-PAIR%20NOW-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://venom-bot-rqpa.onrender.com/)

</div>

## 🔑 1. Get your session ID

Tap the session badge above, then choose **Pairing code** or **Scan QR**. Your ID is sent privately to your WhatsApp—not shown on the site.

> Experimental: the site is online, but live WhatsApp pairing and private delivery have not yet been verified.

## 🚀 2. Deploy your bot

[![Deploy on Render](https://img.shields.io/badge/DEPLOY%20ON-RENDER-46E3B7?style=for-the-badge&logo=render&logoColor=black)](https://dashboard.render.com/blueprint/new?repo=https%3A%2F%2Fgithub.com%2FRUTH-BOT-TECH%2FRUTHLESS-BOT)
[![Deploy on Heroku](https://img.shields.io/badge/DEPLOY%20ON-HEROKU-79589F?style=for-the-badge&logo=heroku&logoColor=white)](https://heroku.com/deploy?template=https://github.com/RUTH-BOT-TECH/RUTHLESS-BOT)
[![Deploy on Railway](https://img.shields.io/badge/DEPLOY%20ON-RAILWAY-0B0D0E?style=for-the-badge&logo=railway&logoColor=white)](https://railway.com/new)

On Render, enter **`SESSION_ID`** and **`OWNER_NUMBER`** (international digits, no `+`). A newly issued ID includes the pairing-service address. Railway requires importing the repository manually. The Node build automatically attempts to install its downloader dependencies; no separate downloader build command or `PYTHON_BIN` setting is normally required. A compatible Python/pip, network access, and writable storage are still needed; see the setup guide if the owner receives a warning.

## 🛡️ Keep it safe

- Your session ID controls your linked account. **Never share it**; delete the WhatsApp message after deploying.
- Use an ID only from a pairing site you trust. **Never run the same ID on two hosts**: WhatsApp may disconnect both.
- Experimental project: real WhatsApp pairing and delivery are not yet verified. Free hosts may sleep or lose local data.

[![Setup, privacy and backups](https://img.shields.io/badge/SETUP-PRIVACY%20%26%20BACKUPS-9b6dff?style=for-the-badge)](docs/setup-and-privacy.md)

## 🧩 Opt-in sticker collection

The owner can enable `.stickercollect on` in a group with members' permission. The bot announces collection, then sends batches of ten newly posted stickers as **individual stickers** to its linked account's own chat, with `Ruth` / `If you can steal it 😹` metadata. `.stickercollect status` checks the group; `.stickercollect off` stops collection and removes that group's unsent items. It is not an anti-copy feature or automatic favourites, and live WhatsApp delivery is unverified. Pending stickers are stored locally and may be lost on ephemeral hosting; see the [privacy details](docs/setup-and-privacy.md#opt-in-sticker-collection-experimental).

## 👁️ Private view-once copying (opt-in, experimental)

With all participants' permission, the owner can use `.antiviewonce on` separately in a particular group or private chat. A notice is sent to that chat before enabling. Newly received view-once images, videos or audio may be copied as ordinary media to `OWNER_NUMBER` privately, not reposted to the source chat. Use `.antiviewonce status` or `.antiviewonce off` in that chat. Old group settings do **not** enable this new behavior automatically; re-enable only after consent. This does not retrieve old messages and has not been tested on live WhatsApp. See the [privacy details](docs/setup-and-privacy.md#private-view-once-copying-experimental).

## 💻 Run locally

```bash
npm install
npm start
```

Node.js 22.13 or newer within the Node 22 series is required for the bot. Set your environment variables first.

Project code is MIT licensed; third-party components have their own terms, including AGPL-3.0 for IMG.LY background removal.

[![Environment configuration](https://img.shields.io/badge/ENVIRONMENT-EXAMPLE-9b6dff?style=for-the-badge)](.env.example)

---
<div align="center">Built with Baileys · Creator credit: <b>2348021016309</b></div>
