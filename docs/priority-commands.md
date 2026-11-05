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

## More personal data and conversion tools (added after the priority push)

- `.bookmark https://example.com label`, `.bookmarks [page]`, `.delbookmark 1` save and manage personal URL entries. The bot stores these entries and may include them in encrypted backups. Credentials embedded in URL user-info are rejected; other sensitive URL components can still be saved, so avoid sharing secrets.
- Reply to ordinary message text or a caption with `.savemsg` or `.star`; use `.savedmsgs [page]`, `.delsaved 1`, `.starred [page]` and `.unstar 1` to manage them. These save **text only** in bot storage, not media; `.star` is not WhatsApp's native starred-message feature. View-once messages are rejected. Obtain permission before saving another person's content. List output is visible in the current chat; use a private chat for privacy.
- `.copy <text>` or reply with `.copy`, then `.paste`, uses bot storage, not the device clipboard. It may be backed up; don't put secrets in an untrusted bot.
- `.timer 10m tea` and `.alarm 2027-01-15T09:30Z call` use the existing persistent reminder queue. Alarms use UTC; they deliver only while connected and may be delayed or duplicated after failures. List/delete with `.reminders` / `.delreminder`. `.stopwatch start`, `.stopwatch stop` and `.stopwatch reset` measure elapsed time.
- `.text2binary`, `.binary2text`, `.text2hex`, `.hex2text` operate on UTF-8 text. `.bin2dec`, `.dec2bin`, `.hex2dec`, `.dec2hex`, `.octal` and `.decimal` convert integers. `.num2roman`, `.roman2num`, `.number2words` validate their supported ranges.
- `.md5`, `.sha1`, `.sha256`, `.sha512`, and `.hash` compute digests locally. MD5 and SHA-1 are weak; none of these commands is suitable for password storage. `.rot13`, `.caesar`, `.atbash` and `.vigenere` are educational substitutions, **not secure encryption**. `.uuid`, `.random-string` and `.lorem` are generated locally; do not share passwords in a chat or with an untrusted bot.
- `.dns example.com A` uses Google Public DNS, which receives the queried domain; supported record types are A, AAAA, MX, TXT, NS and CNAME. Public results can be stale or incomplete.

## Command acknowledgement reactions (local change after the last push)

The bot sends 🤖 as a best-effort acknowledgement for a recognized, permitted command after its cooldown check, in DMs and groups, including commands sent from the linked account. A reaction means the command was accepted, **not** that it succeeded. Unknown commands, unauthorized commands and reaction events do not receive this acknowledgement. A failed reaction does not stop the command reply. The owner can use `.commandreact off` or `.commandreact on`; it is on by default. Existing `.autoreact on` is a separate owner-only setting that reacts to ordinary messages too; when both settings are on, recognized commands receive only one reaction. Real WhatsApp behavior and client permissions still require a linked-account test.

New word tools: `.synonym happy`, `.antonym happy`, `.rhyme light` and `.thesaurus happy` use Datamuse, so suggestions depend on context. `.phonetic hello` uses Free Dictionary API. `.pronounce hello` sends the word to the unofficial Google Translate speech endpoint and returns synthesized speech; it is not a recording of a native speaker.

Additional local audio effects: `.treble`, `.chipmunk`, `.vibrato`, `.tremolo`, `.reverb`, `.chorus`, `.flanger`, `.phaser`, `.distortion`, `.normalize`, `.volume-up`, `.volume-down`, `.mono-audio` and `.stereo`. Stereo conversion duplicates a mono source, not true spatial stereo. `.trim 0 10` trims a replied-to audio/video soundtrack between those times, subject to the 60-second/10-MB input limit. Lower playback volume before using loud effects.

## Environment and public-profile lookups (local changes)

- `.aqi Lagos` / `.pollution Lagos`, `.uv Lagos`, `.sunrise Lagos`, `.sunset Lagos` and `.weather5 Lagos` use Open-Meteo geocoding and modeled forecasts, not measurements from the user's device or a local sensor. Place names may be ambiguous; the matched location is displayed. Air quality is not medical guidance. Forecasts can change.
- **Open-Meteo's free API is for non-commercial use only**; commercial usage requires a paid plan. Open-Meteo data is attributed under CC BY 4.0. API limits apply; shared hosting may exhaust them: https://open-meteo.com/en/terms. This also applies to the existing `.forecast` command.
- `.earthquake [2.5|4.5]` shows recent events from USGS's preliminary past-day feeds; do not rely on it for alerts or safety decisions. `.moonphase` / `.moon` uses an approximate average lunar cycle, not precise astronomical event times.
- `.distance 6.5244,3.3792 | 9.0765,7.3986` gives straight-line distance, not a road route. `.route Lagos | Abuja` produces a Google Maps directions **link only**, not route results; Google receives the endpoints when opened.
- `.mcuser Notch` (`.minecraft`) queries Mojang's public Minecraft Java profile; `.mcskin Notch` uses Mojang and Crafatar, which may return a cached or default skin. Crafatar attribution: https://crafatar.com/.
- `.mcserver play.cubecraft.net` asks mcsrvstat.us to check a public Java server and reports its cached status; offline can also mean unreachable. The bot accepts public IPv4 addresses or public domain names only, and no user-specified port. DNS validation is performed locally, but the external provider resolves the domain separately: it cannot guarantee the same destination or prevent DNS rebinding. Only query servers you have permission to check; names are sent to the provider.
- `.ghstalk octocat` reads a public GitHub profile; shared unauthenticated API limits can cause failures. `.npmstalk sindresorhus` searches public npm packages maintained by that name; zero matches do not establish whether an account exists. Inputs are sent to GitHub and npm, respectively; providers may rate-limit or return stale/incomplete data.

### Backup reliability (local change)

Failed settings backups retry approximately every minute. If the first remote check fails and settings change before it succeeds, the bot pauses backup rather than overwriting either version during that run; preserve local data before restarting and investigate the conflict. The guard does not survive a restart. `.restore confirm` intentionally replaces local settings and must not be used casually. Automatic retries, local WebSocket tests and lease handling do not make ephemeral local storage durable or prove real deployment behavior.

## More conversions, news and economy (local changes)

- `.length`, `.weight`, `.temperature`, `.volume`, `.speed-convert`, `.area` and `.time-convert` accept `<amount> <from> <to>` and calculate locally. Examples: `.length 1 km mi`, `.speed-convert 36 km/h m/s`, `.area 1 acre m2`. Units appear on invalid input; gallons are US liquid gallons. `.celsius 32 f`, `.fahrenheit 0 c`, `.kelvin 0 c`, `.liters 1 gal` and `.gallons 1 l` convert to the named target. Temperatures below absolute zero are rejected.
- `.km2miles`, `.miles2km`, `.kg2lbs`, `.lbs2kg`, `.cm2inch` and `.inch2cm` accept one amount. `.usd2inr`, `.usd2eur`, `.eur2usd` and `.forex` use ExchangeRate-API. `.btc2usd [amount]`, `.ethereum [currency]` and `.dogecoin [currency]` use CoinGecko. Rates are indicative, may be delayed and are not financial advice; queries go to the named providers.
- `.breaking`, `.tech-news`, `.sports-news`, `.business-news`, `.science-news`, `.health-news`, `.ent-news` and `.crypto-news` show up to five Google News RSS headlines for NG (default), US or GB. Search results depend on Google and publishers; they can be stale or incomplete, and `.breaking` is **not** an emergency alert. Health and financial headlines are not advice.
- `.hourly`, `.monthly` (30-day cooldown), `.beg`, `.dig`, `.dig-gold` and `.chop` extend the virtual economy. `.give` / `.donate-coins` alias transfers; `.steal` aliases robbery; `.bet` aliases the existing 50/50 gamble. `.jobs`, `.apply farmer`, `.job`, `.resign` / `.quit` control a virtual job; any listed job adds 20 coins per `.work` shift. Buy seeds with `.buy seed 3`, `.plant 3`, wait five minutes, `.harvest`, then `.sell corn all`; `.farm` / `.crops` shows the crop. All items and coins are virtual, not money. This still relies on a single-process lock, not a distributed transaction; do not run multiple bot instances against one ledger.

`.guessflag`, `.guesscapital`, `.guesscountry`, `.guessword` and `.guessemoji` / `.emojiquiz` are local quizzes using small built-in question sets. Start with the command, answer with the same command plus your answer, or use `giveup`. Three attempts; state is scoped to the sender and chat and expires after ten minutes. Answers posted in a group are visible to the group. Geography/emoji prompts are a limited selection, not a comprehensive database.

### YouTube downloader repair (local changes)

`.play` / `.song` searches or accepts a YouTube URL; `.ytmp3`, `.ytmp4`, `.ytdoc` and `.ytshort` accept a public YouTube URL. Local yt-dlp plus FFmpeg is tried first; if it fails, the bot attempts `https://yt-downloader-cyan.vercel.app/api/download`, without cookies. That third-party fallback returned HTTP 500 in the live check, so it is not currently a verified working fallback. Results show their actual source, and failed downloads show a clean error. `.apicheck` is owner-only and private-chat-only. Optional `YT_COOKIES` is a secret; see `setup-and-privacy.md`. Search-page fallback and small MP3/MP4 downloads were live-tested locally; real WhatsApp delivery and Render/Docker deployment are unverified. YouTube restrictions and a 50 MiB limit still apply.

### Owner access, updates and changelog (local changes)

- `.private` / `.self` allows commands from the configured owner and the linked account; `.public` lets everyone use non-owner commands. Only `OWNER_NUMBER` can change the mode. The setting is saved in bot data and overrides the startup `MODE` environment value. This controls command access, AFK replies and auto-downloads; existing group moderation, automatic reactions and other enabled background features can still run in private mode. Backups remain asynchronous, and data on ephemeral storage can be lost.
- Owner commands are intentionally hidden from the public menu. Use `.ownermenu` to list them and `.help private` / `.help update` for owner-only help.
- `.changelog`, `.changelogs` and `.news` show the latest GitHub release; if the repo has no release, they explicitly show recent default-branch commits instead. `.update` (owner-only) compares the local package version and GitHub version, reports the latest default-branch commit, and shows release notes or recent commits. Equal version numbers do **not** prove the code is identical. GitHub may rate-limit or be unavailable.
- `.update now` requests a deployment **only** using an owner-configured Render deploy hook in the private `DEPLOY_HOOK` environment variable. It supports Render `api.render.com/deploy/srv-…?key=…` hooks; it never prints the hook, runs shell commands or performs git pull/npm install. An accepted request does not prove the deploy succeeded. Without a supported hook, update manually on the host. This does not implement automatic updates on Railway, Heroku, VPS or panels; no real deployment was triggered in tests.

### Owner account controls (local, not yet deployed)

- `.setbotname <name>`, `.setbotbio <text>` / `.setbotstatus <text>` and `.setbotpp` (reply to an image) update the linked WhatsApp account's profile; `.delbotpp confirm` removes its picture. Bio/status changes WhatsApp About text, not a status story. Profile name is separate from the bot's displayed menu title.
- `.block` and `.unblock` accept an international phone number, mention, or replied message only if a phone identity can be resolved. They operate on the WhatsApp account's blocklist; owner and linked-account numbers are protected. `.blocklist` only shows the list in an owner private chat. If the linked account's phone identity is unavailable, blocking fails closed.
- `.join <WhatsApp invite link>` works only in a private owner chat. `.leave confirm` leaves the current group; no success message is guaranteed after departure. Test group membership changes with a disposable group.
- `.banuser` / `.unbanuser` restrict or restore a resolved phone number's access to commands, chatbot, AFK replies and autodownload. `.banchat` / `.unbanchat` do the same for non-owners in the current group; `.banlist` is private. Owner and linked-account actions are exempt so access can be recovered. Some group moderation, status and other automations can still run. An unmapped hidden LID cannot be matched to a phone-number ban, so this is not a complete identity-based security boundary. State persistence depends on storage/backup being healthy.
- `.backup` aliases the existing settings backup to the configured pairing service. It does not export or back up WhatsApp auth credentials and may be unavailable depending on storage setup.

All controls are owner-only and have mock tests. Actual profile, blocklist and membership changes require a real WhatsApp test. Remote code execution, filesystem access, broadcast and role delegation are covered by the subsequent sections below.

### Owner roles and opt-in broadcasts (local, not yet deployed)

- In a private owner chat, use `.addowner <international-number> confirm`, `.delowner`, and `.listowner`; equivalent `add`/`del`/`list` commands exist for `sudo`, `mod`, and `prem` (for example `.addprem 2348012345678 confirm`). The configured primary `OWNER_NUMBER` cannot be removed through these commands. Added owners and sudo users have **full owner access**, including role management and any sensitive or host-level features that may be enabled. Anyone with this access can delegate it further. Grant it only to people you trust. Unknown or unmapped hidden LIDs fail closed. Role changes persist with the configured bot settings store and its backup limitations.
- Moderators can run bot group-admin commands globally in groups where they can send messages, but do not get owner commands or WhatsApp admin rights. Actions requiring the bot to be a WhatsApp admin still require that permission, and moderators cannot target protected owners, bot accounts or group admins. Private mode can still restrict moderators who aren't owners.
- Premium bypasses the standard handler's per-command cooldown, not permissions, provider limits, specialized command-specific throttles, unknown-command cooldowns or concurrency controls. Revoking premium restores normal cooldown behavior.
- `.broadcastopt in|out` is available to users in their private chat and to a group's administrators/owner (or a bot moderator) in that group. Only opted-in chats are eligible. `.broadcast`/`.bc`, `.bcgroup`, `.bcpm`, `.bcimage`, `.bcvideo`, `.bcaudio`, `.bcpoll` prepare a private owner preview; a one-use confirmation code expires after two minutes. Group targets must still be joined, opt-outs are rechecked before each send, and one operation supports at most 50 chats with 1.5-second spacing. Drafts live in memory and disappear on restart; network interruption can cause a partial broadcast. WhatsApp rate limits and delivery restrictions apply. Media is at most 10 MB. Don't use these for unsolicited messaging.
- These are tested with mock WhatsApp sockets, not a live WhatsApp account. Host commands below are available to all full owners and sudo users.

### Host, maintenance and destructive owner controls (local, not yet deployed)

**Host access is enabled by default at the user's explicit request. It is not sandboxed.** `.shell`, `.exec`, `.terminal`, `.eval`, `.ls`, `.cat`, `.rm`, `.mv` and `.cp` can read credentials, change or delete files, or take over the host. Full owners and sudo users have this access. Only use a private verified owner chat, and give full access only to completely trusted people. `HOST_COMMANDS=off` disables these features; `.env.example` sets it off when copied as a deliberate safer example, while an unset variable leaves them enabled. Each action has a one-use two-minute confirmation. Output is sent into the owner's WhatsApp chat and can contain secrets; no safety sandbox is provided. Output is capped and commands are timed out after 15 seconds, but spawned or detached processes are not guaranteed to stop. File commands require paths without spaces and do not accept options. The timeout and confirmation do not make untrusted shell input safe.

`.shutdown confirm` and `.reboot confirm` request the same graceful process stop: they attempt settings and session flushes, but cannot guarantee either or guarantee that the hosting provider restarts the process. Render may restart a stopped service even for `.shutdown`. Restart/session recovery with real WhatsApp is still unverified. `.clearcache confirm` clears the in-memory anti-delete cache only. `.cleartmp confirm` removes only recognized bot temporary directories older than 24 hours. `.logs` and `.errorlogs` show sanitized, bounded, in-memory event codes, **not** Render logs; `.clearlogs confirm` clears that in-memory list only.

`.clearsession erase-remote-session-and-backup` deletes the authenticated pairing-service record, including the encrypted remote session, settings backup and support record, then stops the bot. **This requires pairing again and destroys the remote backup.** Local files remain and WhatsApp linked devices are not automatically logged out. It is unsupported without the pairing service. Do not use it merely to restart the bot. A network failure after the server deletes data can make the result uncertain.

`.clearchat-all` does **not** have access to all account chats. It records minimal metadata for up to 100 incoming chats observed since this process started, and previews a maximum of 50 eligible chats, excluding the current owner chat and known private owner chats. If explicitly confirmed, it asks WhatsApp to clear each observed chat through its last observed incoming message. This may remove message history, potentially irreversibly, and may not cover every chat or every message. It doesn't delete messages for other participants. Actual WhatsApp behavior and delivery have not been tested; inspect the linked account after use. This command and session deletion use mocks in tests and must be treated as experimental.

### Additional textmaker and anime commands (local, not yet deployed)

- The remaining textmaker names in the 1,000-command PDF now render local 1200×480 PNG graphics. Themes are **style-inspired palette and typography designs**, not photorealistic water, wood, diamond, graffiti, brand, or material simulation. The 3D names use simple text extrusion; the rainbow style uses a multicolour gradient. Aliases produce their shared primary style. Text is limited to 80 characters; processing is local and the bot sends no text to a third party.
- `.start` aliases the menu. `.animeinfo` aliases `.anime`; `.mangasearch` and `.mangainfo` alias `.manga`. `.anilist [--manga] <title>` searches AniList, and `.manhwa` / `.manhua` constrain manga results to Korean / Chinese origin as listed by AniList (this is an origin filter, not an independent genre or translation verification). `.animechar` and `.animevoice` search AniList characters; voice listings are Japanese voice actors from up to the first ten anime entries, filtered using AniList's non-adult flag. Content filters are not foolproof. Searches are sent to AniList, can be rate-limited and may return the wrong match. On 2026-11-05, live queries returned Solo Leveling for KR, The King's Avatar for CN and Japanese voice actors for Naruto Uzumaki; actual WhatsApp delivery was not tested.

### Additional tools and games (local, not yet deployed)

- `.barcode` / `.barcodegen` render printable ASCII text as a local Code 128 PNG using bwip-js (MIT); scan before relying on it. Maximum 80 characters.
- `.encrypt`, `.decrypt`, and `.cipher` implement local AES-256-GCM with a random salt/nonce and scrypt-derived key in verified private chats. The token format is `rmd1` and can only be recovered with the same passphrase. `.passcheck` / `.passstrength` are crude sample heuristics, not breach, reuse, or strength guarantees. `.bcrypt hash <sample>` and `.bcrypt verify <sample> <hash>` use bcryptjs (BSD-3-Clause), cost 10 for new hashes; input is limited to 72 UTF-8 bytes and verification cost at most 12. These operations run locally, but **the WhatsApp messages and outputs remain visible in the chat and to the bot operator**. Never use real passwords, private keys, or confidential data with a bot; use a trusted password manager and local cryptographic tools instead.
- `.translate-text` aliases `.translate`. `.translate-reply <language>` sends replied non-view-once text to Mistral Nemo via LLM7; `.tts-reply` sends replied non-view-once text to the unofficial Google Translate speech endpoint. They disclose the third-party transfer. `.quote-msg` makes a visible text quotation, not a native forwarded message. `.spoiler` uses a read-more break that varies by client and does not provide privacy.
- `.typerace` runs a real group race with exact matching, per-player timing and a leaderboard; network delay affects times and the starter must finish before the two-minute expiry. `.tarot` and `.palm` produce explicitly fictional random entertainment, not readings or predictions. `.match`, `.friendship` and `.crush` alias the fictional two-name compatibility score.
- These commands have local and mocked-WhatsApp tests; actual message and image delivery remains unverified. AI and speech providers can be unavailable or rate-limited.

### Experimental WhatsApp Group Status

- `.groupstatus <text>` (aliases `.gstatus`, `.gpost`, `.grouppost`) requests a WhatsApp Group Status in the current group. It supports text, or a replied photo or video with an optional caption (up to 16 MB each; videos at most 30 seconds). View-once media is rejected. It is intended to appear to that group's members for 24 hours, not in a personal status broadcast. Use is limited to group admins, delegated moderators and owners; bot membership must be verified. It does not mention all members or guarantee everyone sees a notification. Music/audio and cross-group posting are not supported.
- Baileys 7.0.0-rc14 does not have a native group-status send helper. This experimental implementation sends the V2 protobuf envelope to the group JID with group-status metadata. Photo/video are uploaded to WhatsApp and wrapped only at the encryption hook, so the media type stays visible to the relay code. It intentionally refuses to fall back to `status@broadcast` or an ordinary chat message. Because rc14 drops the stanza metadata on retries, Group Status envelopes and marked media are excluded from its recent-message retry cache; normal messages retain their existing retry behavior. A recipient with a decryption failure may therefore miss the status.
- A relay request is **not proof of server acceptance, display, audience isolation or delivery**. Test first with non-sensitive text in a small group, checking both a group member's phone and an account outside the group. WhatsApp versions, rollouts and unofficial protocol support may vary. If sending fails, the outcome can still be uncertain; check before retrying. This feature has not been tested against a real WhatsApp device.
- Background: WhatsApp's Group Status is distinct from older status mentions. Implementation research: https://github.com/delltrak/wamcp/pull/175 and https://github.com/delltrak/wamcp/pull/177 .
