# Free Fire profile info and likes

## `.ffinfo` — read-only account report

`.ffinfo <region> <UID>` shows an expanded profile overview. Optional sections are:

- `.ffinfo <region> <UID> profile` — the default overview.
- `.ffinfo <region> <UID> stats` — BR Solo/Duo/Squad and Clash Squad career stats, historic rank-badge seasons and occupation-record count.
- `.ffinfo <region> <UID> gear` — equipped outfit, skills, pet, Booyah Pass history, Spark fields, wishlist and Weapon Glory summaries.
- `.ffinfo <region> <UID> all` — overview, stats and gear as three replies.

`full`, `career`, `inventory` and `overview` are accepted aliases for `all`, `stats`, `gear` and `profile`. For example, `.ffinfo ME 123456789 stats` uses ME as an example only: enter the game server where the UID belongs.

The overview uses the unofficial third-party endpoint `wzapi.vercel.app/get`; stats and gear use `wzapi.vercel.app/get_all`. The legacy fallback `free-fire-info-ob55.vercel.app/player-info` is still used for the overview when the primary provider and its token fallback both fail. The UID and region are shared only with the providers contacted. Responses must contain the exact requested UID; the `get_all` envelope UID is checked as well. Only selected, sanitized fields are shown. Rank, item and season values are raw provider IDs, not official translated labels.

Live lookups including an owner-provided ME UID and a published BR sample worked on 2026-11-05. On 2026-11-06 the ME upstream began returning `Missing token or server_url in API response data` for both `/get` and `/get_all`; availability, accuracy, region coverage and commercial-use terms are not guaranteed. A read-only control showed that BR still worked and that BD/EU/EUROPE tokens returned the same ME account with exact UID, likes 2,933 and OB55. The provider still lists ME as supported and documents a `/refresh` endpoint for JWT tokens; the bot does **not** call that third-party maintenance endpoint.

### Scoped ME → BD token fallback

When a **ME** request reports the missing-token/server-URL condition, the bot retries that same UID through a **BD** token on the same `wzapi` endpoints. This applies to both `/get` and `/get_all`. It is deliberately scoped:

- only region `ME` has this fallback;
- only the `Missing token or server_url` provider condition triggers it;
- ordinary network errors, bad JSON, wrong-UID responses and other provider errors are **not** silently remapped;
- the fallback source is labelled, and replies include `Provider fallback: BD token was used because ME upstream was unavailable.`;
- the account's reported in-game region remains `ME`; BD is a provider token, not a claim that the account moved region.

If ME and the BD token both fail, the command says the unofficial provider's ME data source is temporarily unavailable instead of telling the user to check the UID or game server. While the outage lasts, the manual workaround is:

```text
.ffinfo BD 8636270783 stats
.ffinfo BD 8636270783 gear
.ffinfo BD 8636270783 all
.ffinfo BD 8636270783 profile
```

`EU` and `EUROPE` also worked in read-only checks, but BD is in the provider's published `supported_regions`, so BD is the documented temporary workaround. The fallback also means an ME `profile` lookup can use the BD token before the legacy fallback provider is tried.

Available overview fields include name, region, game version, level, EXP, likes, Prime level and membership flag, account creation date, last-login date, season, badges, credit score, Elite Pass flag, veteran field, BR/CS rank IDs and points, guild, social language/gender/signature, Dynamic Duo availability, pet, avatar, banner, title, equipped outfit IDs and weapon skin IDs. Career stats include games, wins, kills, headshot kills, headshots, damage, deaths, revives, top finishes, best kills, assists, MVP, streak and rating points. Gear includes clothes and skill IDs, pass history, Spark fields, wishlist item IDs and Weapon Glory records.

Dynamic Duo partner details are **not** supplied by these public UID/region endpoints. A service that advertises Dynamic Duo requires an account access token (or UID/password) for that section; the bot deliberately does not request, store or forward game passwords, OTPs, JWTs or access tokens. It reports Dynamic Duo as unavailable rather than guessing. Login history similarly requires account authentication and is not included.

## `.fflike` — unconfirmed third-party action

`.fflike <region> <UID>` prepares a two-minute preview; `.fflike confirm <code>` may send **one** request to an unofficial provider. Only request likes for an account whose owner has agreed. The bot sends UID and region, not a game password, OTP or session token. Regions without a verified provider mapping fail closed before a request is prepared.

The earlier provider, `free-fire-like-ten.vercel.app`, was **not correct for ME**. Its published source maps only IND to the India endpoint and BR/US/SAC/NA to the US endpoint; every other region, including ME, falls through to Bangladesh/default tokens and `clientbp.ppmainecoonghj.com`. The one authorized ME request against it returned HTTP 500. Its source also attempts up to 220 like requests, and an error may occur before or after some likes are sent. That result remains uncertain; it was not retried.

A **disabled** candidate adapter for `ff-api-like-phi.vercel.app/api/like` remains in the code; its live `/api/regions` response lists ME and `/api/health` responded on 2026-11-05, but it is not a confirmed delivery service. Its health reports OB54 while the profile data reports OB55. On 2026-11-05, one account-owner-authorized corrected request returned HTTP 500 with an internal provider error: `ffapis require failed: Required file not found: /var/task/node_modules/ffapis/config/settings.yaml`. The independent profile count was 2,933 before and 2,933 after two delayed checks, and a further read-only check also showed 2,933. The user confirmed their in-game count was 2,933. No like increase was observed; the provider was not retried. Because both tested providers failed, `LIKE_PROVIDER_VERIFIED` is `false`: `.fflike` now fails closed before preparing a request. A working provider must be verified and explicitly enabled in code before another live attempt.

The command no longer trusts a provider's self-reported before/after arithmetic as the only evidence. It reads the current likes through the independent info endpoint, sends one provider request, then reads likes again (with a second delayed read if no change is observed). It reports `observed +N` only when the independent profile count increased. A flat or unverifiable count is reported as no observed increase, with a warning to check the game before retrying. Provider HTTP errors do not prove that nothing was processed. The ME→BD info fallback can also serve those independent like-count reads, but likes remain disabled.

No fixed 100 or 220 likes are promised; the exact count, delay, region coverage, quota and account-safety consequences are not guaranteed. Do not charge or advertise this as a confirmed working likes service until an account owner explicitly authorizes a fresh test and the in-game count is checked. Unofficial game automation may carry account risk; Garena's policies prohibit certain unauthorized tools, but consequences for an individual receiving likes are not established here.

The command never retries the like provider automatically. An unclear result can still mean the provider processed it; check the game before trying again. Same-UID concurrent requests are blocked, there is an in-process one-minute safety interval after attempts, and up to three likes requests may run at once. These are local protections, not claims about Garena's limits. The interval resets on restart. Owner/sudo still bypass ordinary command cooldowns; they do not bypass these action-specific protections. `.selftest` excludes likes completely. No login credentials are requested or stored. No provider output is executed.

## Status

The earlier expanded Free Fire feature was pushed as `98caa0a`. This ME→BD token fallback and provider-outage message is a separate scoped Free Fire commit; unrelated local work remains unpushed. `.ffinfo` is read-only and works with the labelled BD fallback while the provider's ME upstream is broken. `.fflike` is **not confirmed**: both the original provider and the corrected ME-listed provider failed, and no like increase was observed. Do not push or advertise the likes feature as working. The separately authorized bulk-join and clone fixes were already pushed as `82cee93`. Preserve unrelated unpushed work. A GitHub token was previously exposed in chat and must remain revoked/rotated; it is not stored in the workspace.
