# Batch 4 implemented command specs

Each line: input → processing/source → output; a provider failure returns a fallback.

- **gitclone:** gitclone <GitHub repository URL> → Download a public GitHub repository as a ZIP (max 50 MB). Source: GitHub. → result or fallback.
- **ytmp4:** ytmp4 <youtube URL> → Download supported public youtube content using yt-dlp. → result or fallback.
- **ytmp3:** ytmp3 <youtube URL> → Download supported public youtube content using yt-dlp. → result or fallback.
- **ytdoc:** ytdoc <youtube URL> → Download supported public youtube content using yt-dlp. → result or fallback.
- **ytshort:** ytshort <youtube URL> → Download supported public youtube content using yt-dlp. → result or fallback.
- **tiktok/tiktoknowm:** tiktok <tiktok URL> → Download supported public tiktok content using yt-dlp. → result or fallback.
- **tiktokmp3:** tiktokmp3 <tiktok URL> → Download supported public tiktok content using yt-dlp. → result or fallback.
- **instagram/igdl/igreel/igtv:** instagram <instagram URL> → Download supported public instagram content using yt-dlp. → result or fallback.
- **facebook/fbdl/fbreel:** facebook <facebook URL> → Download supported public facebook content using yt-dlp. → result or fallback.
- **twitter/twdl:** twitter <twitter URL> → Download supported public twitter content using yt-dlp. → result or fallback.
- **pinterest/pindl:** pinterest <pinterest URL> → Download supported public pinterest content using yt-dlp. → result or fallback.
- **soundcloud/scdl:** soundcloud <soundcloud URL> → Download supported public soundcloud content using yt-dlp. → result or fallback.
- **reddit:** reddit <reddit URL> → Download supported public reddit content using yt-dlp. → result or fallback.
- **vimeo:** vimeo <vimeo URL> → Download supported public vimeo content using yt-dlp. → result or fallback.
- **dailymotion:** dailymotion <dailymotion URL> → Download supported public dailymotion content using yt-dlp. → result or fallback.
- **twitch:** twitch <twitch URL> → Download supported public twitch content using yt-dlp. → result or fallback.
- **bilibili:** bilibili <bilibili URL> → Download supported public bilibili content using yt-dlp. → result or fallback.
- **odysee:** odysee <odysee URL> → Download supported public odysee content using yt-dlp. → result or fallback.
- **tumblr:** tumblr <tumblr URL> → Download supported public tumblr content using yt-dlp. → result or fallback.
- **linkedin:** linkedin <linkedin URL> → Download supported public linkedin content using yt-dlp. → result or fallback.
- **vk:** vk <vk URL> → Download supported public vk content using yt-dlp. → result or fallback.
- **ok-ru:** ok-ru <okru URL> → Download supported public okru content using yt-dlp. → result or fallback.
- **rumble:** rumble <rumble URL> → Download supported public rumble content using yt-dlp. → result or fallback.
- **bandcamp:** bandcamp <bandcamp URL> → Download supported public bandcamp content using yt-dlp. → result or fallback.
- **mixcloud:** mixcloud <mixcloud URL> → Download supported public mixcloud content using yt-dlp. → result or fallback.
- **snapchat:** snapchat <snapchat URL> → Download supported public snapchat content using yt-dlp. → result or fallback.
- **likee:** likee <likee URL> → Download supported public likee content using yt-dlp. → result or fallback.
- **telegramdl:** telegramdl <telegram URL> → Download supported public telegram content using yt-dlp. → result or fallback.
- **ytplay/play/song:** ytplay <search terms> → Search YouTube and download the first result using yt-dlp. → result or fallback.
- **video:** video <search terms> → Search YouTube and download the first result using yt-dlp. → result or fallback.
- **yts/ytsearch:** yts <search terms> → Search YouTube for up to five results using yt-dlp. → result or fallback.
- **spotify/spotifydl:** spotify <Spotify track URL> → Find a matching track using Spotify metadata, iTunes and YouTube. → result or fallback.
- **deezer:** deezer <Deezer track URL> → Find a matching track using Deezer metadata, iTunes and YouTube. → result or fallback.
- **applemusic:** applemusic <Apple Music track URL> → Find a matching track using Apple Music, iTunes and YouTube. → result or fallback.
- **tidal:** tidal <TIDAL track URL> → Find a matching track using TIDAL metadata, iTunes and YouTube. → result or fallback.
- **spotifysearch:** spotifysearch <track or artist> → Search the iTunes music catalog for songs. → result or fallback.
- **github:** github <GitHub repository URL> → Look up a public GitHub repository. → result or fallback.

The README lists missing commands, external providers, live-test status and setup.

## Continued file-host commands

- **mediafire:** public MediaFire single-file URL → retrieve MediaFire's direct file → send a document up to 50 MB, or a fallback.
- **gdrive:** public Google Drive single-file URL → fetch from Google Drive → send a document up to 50 MB, or a fallback.
- **mega:** public MEGA single-file URL including decryption key → fetch and decrypt with MEGAJS → send a document up to 50 MB, or a fallback.
- **apk/apkdl:** app name or Android package ID → query official F-Droid search or package API → show F-Droid listing and, for a package ID, the suggested APK link; otherwise a fallback.

## Continued social and title commands

- **tiktokslide:** public TikTok photo-post URL → extract still images with gallery-dl and download them via a public-IP proxy → send up to 20 images totaling 50 MB, or a fallback; animated slides and sound are not preserved.
- **capcut:** CapCut template-detail URL → read matching template metadata and download its MP4 preview → send preview up to 50 MB, or a fallback (not the editable project).
- **imdbdl:** film/show title, IMDb ID or IMDb title URL → IMDb public suggestions plus YouTube trailer search → title information and a possible trailer link; no full movie downloaded.

## Further continuation: Meta and app listings

- **igphoto:** Instagram photo-only post URL → match the public Instagram embed's shortcode and photo media → send up to 20 photos / 50 MB total, or fallback; video-only and mixed albums are rejected.
- **threads:** Threads public post URL → match the post shortcode in public Threads page data → send up to 20 actual images/videos / 50 MB total, or fallback; never substitute a video thumbnail.
- **happymod:** app name → search the third-party site happymod.cloud → return up to five listing links with an APK safety warning; site official status is unverified.
- **igstory:** Instagram username → query StoryLurk's third-party public story service → send current images and videos (up to 20 / 50 MB total), or a fallback; private stories unsupported.
