# Draft Kombat

Turn your fantasy league's draft order into an arcade fighting tournament.
Enter your league and team names, hit start, and watch fighters battle it
out — first one eliminated gets the *last* pick, the last one standing
gets the *first* pick.

Live: `https://sbukhari17.github.io/DraftKombat/`

## What it does

1. You enter a league name and 4–16 team names (odd or even — a 13-team
   league works). If a fighter is leftover in a round, they sit as a bye.
2. Two remaining fighters are drawn at random each round. Either side can
   win — the leftover “champion on the left” gauntlet is gone.
3. An arcade fight plays on a `<canvas>`. Each bout is about 5 seconds,
   at most 3 hits per fighter.
4. Each round opens with a short visual intro (`NAME vs NAME`) then a
   big **FIGHT** slam. Combat is punches and kicks only — no guns.
5. Sixteen original kombatants (idle / punch / kick / win / tourney) are
   reused across every draft, plus an original industrial theme and
   announcer clips (Fight, Finish him, Fatality, Wins).
6. The loser of each match is a **FINISH HIM** into **FATALITY**, filling
   the next draft slot, last pick first.
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
- **Announcer.** FIGHT / FINISH HIM / FATALITY / WINS play from MP3s in
  `audio/` through the Web Audio graph (so they are captured in recordings).
  There is no browser text-to-speech.
- **Runtime.** Each bout is capped at about 5 seconds (intro, a few
  punches and kicks, then FINISH HIM / FATALITY).
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
