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
