# Draft Kombat

Turn your fantasy league's draft order into an arcade fighting tournament.
Enter your league and team names, hit start, and watch fighters battle it
out — first one eliminated gets the *last* pick, the last one standing
gets the *first* pick.

Live: `https://sbukhari17.github.io/DraftKombat/`

## What it does

1. You enter a league name and 4–16 team names.
2. The draft order is shuffled randomly, client-side, the moment you hit
   **Start Draft Kombat** — and never shown to you directly.
3. A ~2–3 minute arcade fight plays on a `<canvas>`. A running champion
   holds the pit. Challengers walk in one by one.
4. Each round opens with a **one-second intro** (`NAME vs NAME`) then a
   big **FIGHT** slam. Combat is punches and kicks only — no guns.
5. Sixteen original kombatants (idle / punch / kick) are reused across
   every draft, plus an original industrial theme and announcer clips
   (Fight, Finish him, Fatality, Wins).
6. Each elimination is a **FINISH HIM** into **FATALITY**, revealing the
   next draft pick, worst to first.
7. The last fighter standing is awarded the 1st overall pick.
8. Replay, download video, or download the order as a PNG.
9. Nothing is saved anywhere. Refresh the page and it's gone.

## Deploying to GitHub Pages

Static site — no build step.

1. Push `main` with `index.html`, `style.css`, `app.js`, `favicon.svg`,
   `arena.jpg`, plus the `fighters/`, `audio/`, and `fx/` folders.
2. GitHub **Settings → Pages** → Deploy from branch `main` / root.
3. Published at `https://<user>.github.io/DraftKombat/`.

## Browser notes

- **Video format.** `MediaRecorder` gives MP4 on Safari and WebM on most
  Chrome/Firefox builds. Convert with `ffmpeg -i input.webm output.mp4`
  if you need that container.
- **Spoken announcer.** Web Speech API plays live in the tab but is not
  captured in the downloaded video. Recordings still get the on-screen
  FIGHT / FINISH HIM / FATALITY text plus original announcer clips and
  the impact stinger (those *are* in the Web Audio graph).
- **Runtime.** Small leagues get slower, more dramatic exchanges; big
  leagues get a snappier highlight-reel pace. Roughly 2–3 minutes.
- **Fighters** are original designs — not likenesses of any existing
  fighting-game characters.
- Audio unlocks on **Start Draft Kombat**.

## Privacy

Everything lives in memory in your browser tab. Nothing is written to
`localStorage`, cookies, or a server. Closing or refreshing erases it.

## File structure

```
index.html          page structure (setup / simulation / results)
style.css           arcade styling
app.js              simulation, canvas, audio, recording, export
favicon.svg
arena.jpg           pit background
fighters/           16 original kombatants × idle/punch/kick
audio/              theme + fight/finish-him/fatality/wins clips
fx/                 impact bursts
```
