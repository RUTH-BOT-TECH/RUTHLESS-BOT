# Priority command batch — local implementation notes

All examples assume `.` is your prefix. Command availability here describes this working tree, not a deployed release. Input and responses sent in a group are visible to that group. On ephemeral hosting, configure the existing pairing-service encrypted backups or another durable, trusted store; a local file by itself is not durable. Backup upload is asynchronous, so abrupt loss before a backup completes can lose recent changes.

## Miscellaneous

- `.afk [reason]` sets your status; mentions/replies show the reason. Your next message clears it. `.unafk` clears it explicitly.
- `.remind 10m drink water` saves a reminder to the current chat; `.reminders` lists yours in UTC and `.delreminder 1` deletes one. Use `s`, `m`, `h`, or `d` (10 seconds–365 days). While the bot is offline, delivery is delayed until it reconnects; failed sends are retried. If a send succeeds but saving its removal fails, a duplicate is possible. Scheduling is not a guarantee of delivery.
- `.addnote remember milk` / `.notes` / `.delnote 1` and `.addtodo finish task` / `.todo` / `.donetodo 1` / `.deltodo 1` operate on entries scoped to the sender. Numbering can change after deletion. List commands post the contents in the current chat; use a private chat for private entries. Limits: 50 entries per kind, 500 characters each.
- `.readmore visible text | hidden text` inserts invisible separator characters; collapse behavior varies by WhatsApp client.
- `.viewonce` / `.vv` reply to a view-once image, video or audio; `.vv2` sends it to the configured owner. Obtain permission. WhatsApp may prevent access; actual linked-account behavior remains unverified.

## Reactions, screenshots and utilities

- `.highfive @person` uses Gifukai. `.hug`, `.kiss`, `.pat`, `.slap`, `.punch`, `.bite`, `.cuddle`, `.poke`, `.wave`, `.dance`, `.cry` and `.laugh` use OtakuGIFs. Results are converted to MP4 locally; providers can fail or rate-limit.
- `.ss https://example.com` sends the public URL to Thum.io. Do not submit secret or private links; the provider may cache screenshots.
- `.calc (2+3)*4` supports `+ - * / % ^` and parentheses without evaluating JavaScript.
- `.qr <text>` generates a QR locally; `.qrread` reads a replied-to image locally. Treat decoded links as untrusted.
- `.password 20` works only in a private chat, using cryptographic randomness. The password is visible to the bot operator and included in the chat; use a trusted password manager for sensitive credentials.

## Virtual economy

`.balance` / `.bank`, `.daily`, `.weekly`, `.work`, `.deposit`, `.withdraw`, `.transfer @person 100`, `.rob @person`, `.shop`, `.buy`, `.inventory`, `.fish`, `.mine`, `.sell fish all`, `.gamble 50`, `.leaderboard`, `.rank` and `.level` use virtual coins only. `.transfer` and `.rob` require a verified fellow group member. A successful robbery takes 10% of the target's wallet; a failed one pays 10% of the attacker's wallet to the target. Robbery has a one-hour cooldown and a 50/50 outcome. `.gamble` wins or loses the stake with a 50/50 outcome. Bank funds cannot be robbed. Leaderboards show only current group members.

One serialized ledger write updates both sides of a transfer while a single bot process is active. Its lock is in-process, not a distributed transaction: do not run two independent bot instances against the same session or data. Session leasing reduces overlap but cannot guarantee it under network partitions. Values are not money and have no real-world value.

## Converters and search

- `.convert 100 USD NGN`: indicative exchange rate from ExchangeRate-API; `.unit 100 km mi` converts common physical units locally.
- `.crypto ethereum usd` / `.bitcoin usd`: indicative spot prices from CoinGecko. Prices and external services can change or be rate-limited.
- `.base64enc hello` / `.base64dec aGVsbG8=` use UTF-8; `.timezone Africa/Lagos` shows the current local and UTC times.
- `.wiki Lagos`, `.dictionary hello`, `.forecast Lagos`, `.map Lagos`: Wikipedia, Free Dictionary API, Open-Meteo, and OpenStreetMap respectively. Search terms or locations are sent to the named provider (for `.map`, when the link is opened). Weather forecasts can change.
- `.anime Naruto` / `.animesearch Naruto` / `.manga Naruto` search AniList, excluding results marked adult. Classification depends on the provider.

## Audio

Reply to audio or caption/reply to a video with `.bass`, `.nightcore`, `.earrape`, `.slow`, `.fast`, `.reverse-audio`, `.deep`, `.robot`, or `.echo`. Processing uses local FFmpeg and returns MP3 audio; maximum input is 10 MB and 60 seconds. `.earrape` is deliberately loud: lower playback volume first. Timing and pitch depend on the selected effect.

## Important existing aliases

The registered `.gemini`, `.gpt`, and `.ask` aliases currently use the same Mistral Nemo via LLM7 as `.ai`—they do **not** select the named proprietary model. Other existing names/aliases may depend on external providers or WhatsApp account permissions and need real-account verification.

## Verification checklist

- Run `npm test`; local tests include an actual local WebSocket transport connected to simulated WhatsApp handlers, not a real WhatsApp account.
- Verify the revised commands, media handling, AFK, reminders and group permissions on a linked account after deployment. Test reminder restart/retry against the configured durable store.
- Verify the Render lease handover on the actual deployment and configure its health path separately as described in `setup-and-privacy.md`.
- Do not push or deploy the working tree without explicit authorization. Other priority categories and the original full scope remain incomplete.

## Additional local games and text art

- `.wordle` starts a private-to-the-sender game in the current chat; `.wordle APPLE` submits a five-letter guess and `.wordle giveup` ends it. The chat can see messages. Six guesses, ten-minute inactivity expiry, and duplicate-letter-aware scoring.
- `.blackjack` starts a free-play hand; `.blackjack hit` or `.blackjack stand` plays it. The dealer stands on all 17s. `.slots` and `.roulette red` / `.roulette 17` are also free play: **no virtual coins or money are bet or paid out**.
- `.riddle`, `.riddle <answer>`, `.speedtype`, `.speedtype <phrase>` are local games. `.fact` selects from a small built-in list. `.lovecalc Ada | Sam`, `.ship Ada | Sam`, `.zodiac 04-20`, and `.horoscope Taurus` are entertainment, not genuine compatibility, predictions, or advice.
- `.neon`, `.glitchtext`, `.firetext`, `.gold`, `.3dtext`, `.logo`, `.blackpink`, `.hacker`, and `.matrix` create local PNG text art. Give each command text up to 80 characters. These are local styles, not official brand assets or external text-effect APIs.

## Additional network and social commands

- `.ip 8.8.8.8` sends a public IP to ipwho.is and returns an approximate location; private addresses are rejected. `.whois example.com` uses the IANA RDAP bootstrap and the relevant domain registry. Some domain registries may not provide a usable HTTPS RDAP service; public data can be incomplete.
- `.shorturl https://example.com` sends the entire submitted URL to TinyURL, which may retain it. Do not use secret links.
- `.urban <term>` returns community-submitted Urban Dictionary content that may be inaccurate or offensive. `.headlines NG` (also `US` or `GB`) reads Google News RSS; headlines and publishers can change.
- `.getpp` and `.getbio` accept a mention, reply or number and only retrieve WhatsApp profile data visible to the bot. They do not bypass privacy settings. Actual linked-account behavior is unverified.
- `.neko` and `.waifu` retrieve safe-rated illustrations from Nekosia (provider ratings can be imperfect). Artist attribution and available original links are included. Nekosia requires prior written permission for commercial use, and artist copyright/permission still applies: https://nekosia.cat/documentation?page=tos. `.waifu` uses its `cute` category, not a separate waifu category.
- The public Nominatim search API was **not** integrated: its usage policy restricts automatic generic place-search tools built by LLM platforms, and its application-wide limits are incompatible with uncoordinated self-hosted deployments. See https://operations.osmfoundation.org/policies/nominatim/ before choosing an alternative.
- `.google <query>` and `.nearby pharmacy | Lagos` create Google Search and Google Maps links respectively. These are **link-only**: the bot does not fetch results, establish that a place is nearby, or calculate distances. Google receives the search when the link is opened.
- `.flights Lagos | Abuja | 2027-01-15` constructs a Google Flights search link. The bot does not fetch schedules, availability or fares; confirm route and date in the browser. Google may interpret the natural-language query differently, and this deep link has not been verified in a real user's browser.
- `.igstalk username`, `.tiktokstalk username`, and `.stalk instagram username` provide public profile links only. The bot does not verify whether the account exists, retrieve profile details, or bypass privacy settings. A claimed keyless TikTok provider returned 404 and a purported keyless Instagram provider required a token during testing, so they are not used.
