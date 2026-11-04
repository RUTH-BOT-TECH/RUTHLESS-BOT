<div align="center">

<img src="assets/menu/ruthless-neon.jpg" width="100%" alt="Ruthless MD banner" />

# ⚡ RUTHLESS MD
**Your WhatsApp. Your bot. Your rules.**

[![Node](https://img.shields.io/badge/Node.js-20.19%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Multi--Device-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://www.whatsapp.com/)
[![Status](https://img.shields.io/badge/Status-Work%20in%20Progress-9b6dff?style=for-the-badge)](docs/setup-and-privacy.md)

[![Stars](https://img.shields.io/github/stars/RUTH-BOT-TECH/RUTHLESS-BOT?style=flat-square&color=9b6dff)](https://github.com/RUTH-BOT-TECH/RUTHLESS-BOT/stargazers)
[![Forks](https://img.shields.io/github/forks/RUTH-BOT-TECH/RUTHLESS-BOT?style=flat-square&color=9b6dff)](https://github.com/RUTH-BOT-TECH/RUTHLESS-BOT/forks)

</div>

## 🔑 1. Get your session ID

Choose **Pairing code** or **Scan QR** on the pairing site. Your ID is sent privately to your WhatsApp—not shown on the site.

> The pairing site is built but **not publicly hosted yet**. [Pairing-site setup](docs/setup-and-privacy.md#pairing-service-operator-setup)

## 🚀 2. Deploy your bot

[![Deploy on Render](https://img.shields.io/badge/DEPLOY%20ON-RENDER-46E3B7?style=for-the-badge&logo=render&logoColor=black)](https://dashboard.render.com/blueprint/new?repo=https%3A%2F%2Fgithub.com%2FRUTH-BOT-TECH%2FRUTHLESS-BOT)
[![Deploy on Heroku](https://img.shields.io/badge/DEPLOY%20ON-HEROKU-79589F?style=for-the-badge&logo=heroku&logoColor=white)](https://heroku.com/deploy?template=https://github.com/RUTH-BOT-TECH/RUTHLESS-BOT)
[![Deploy on Railway](https://img.shields.io/badge/DEPLOY%20ON-RAILWAY-0B0D0E?style=for-the-badge&logo=railway&logoColor=white)](https://railway.com/new)

On Render, enter **`SESSION_ID`** and **`OWNER_NUMBER`** (international digits, no `+`). A newly issued ID includes the pairing-service address. Railway requires importing the repository manually.

## 🛡️ Keep it safe

- Your session ID controls your linked account. **Never share it**; delete the WhatsApp message after deploying.
- Use an ID only from a pairing site you trust. **Never run the same ID on two hosts**: WhatsApp may disconnect both.
- Experimental project: real WhatsApp pairing and delivery are not yet verified. Free hosts may sleep or lose local data.
- Pairing-site operators: [setup, privacy, backup & test guide](docs/setup-and-privacy.md).

## 💻 Run locally

```bash
npm install
npm start
```

Node.js 20.19+ is required. Set your environment variables first; see [`.env.example`](.env.example).

---
<div align="center">Built with Baileys · Creator credit: <b>2348021016309</b></div>
