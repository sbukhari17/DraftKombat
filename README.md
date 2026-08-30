# Draft Kombat 🥋

Turn your fantasy league's draft order into an arcade fighting tournament.
Enter your league and team names, hit start, and watch fighters battle it
out — first one eliminated gets the *last* pick, the last one standing
gets the *first* pick.

Live demo (after you deploy it): `https://<your-username>.github.io/<repo-name>/`

## What it does

1. You enter a league name and 4–16 team names.
2. The draft order is shuffled randomly, client-side, the moment you hit
   **Start Draft Kombat** — and never shown to you directly.
3. A ~2–3 minute arcade fight plays out on a `<canvas>`: your teams face
   off one at a time, with a running champion who survives bout after
   bout. Every elimination reveals the next draft pick, worst to first.
4. Music and every hit/impact sound are synthesized live in the browser
   with the Web Audio API — no audio files, nothing copyrighted.
5. Each elimination is punctuated with an on-screen "FATALITY" and a
   spoken callout via your browser's built-in text-to-speech.
6. The last fighter standing is declared the winner and awarded the
   1st overall pick.
7. The final screen shows the whole draft order, with buttons to replay
   the exact same simulation, download the video, download the order as
   a PNG, or start a brand new draft.
8. Nothing is saved anywhere. Refresh the page and it's gone — see
   **Privacy** below.

## Deploying to GitHub Pages

This is a static site (`index.html` + `style.css` + `app.js`), so GitHub
Pages can host it directly with no build step.

1. Create a new repository on GitHub (public repos get free Pages
   hosting; private repos need GitHub Pro/Team/Enterprise).
2. Add these three files (`index.html`, `style.css`, `app.js`) to the
   root of the repo — or to a `/docs` folder if you'd rather keep the
   repo root for other things.
3. Commit and push:
   ```bash
   git init
   git add index.html style.css app.js README.md
   git commit -m "Draft Kombat"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
4. On GitHub, go to **Settings → Pages**.
5. Under **Build and deployment → Source**, choose **Deploy from a
   branch**.
6. Under **Branch**, choose `main` and the folder you used (`/root` or
   `/docs`), then **Save**.
7. GitHub will publish it at `https://<your-username>.github.io/<repo-name>/`
   within a minute or two — refresh the Pages settings page to get the
   exact link.

That's it — no build tools, no dependencies, no server.

## Browser notes and honest limitations

A few things are worth knowing about, since they come from real
constraints in what browsers allow a page to do:

- **Video format.** The app records the fight with the browser's
  `MediaRecorder` API. Where a browser supports recording straight to
  MP4 (Safari, generally), you'll get an `.mp4` file. Where it doesn't
  (most Chrome/Firefox versions at the time of writing), you'll get a
  `.webm` file instead — it plays natively in any browser and in most
  media players, and converts to MP4 in one command with
  [ffmpeg](https://ffmpeg.org/) (`ffmpeg -i input.webm output.mp4`) if
  you specifically need that container. The app tells you which one you
  got on the results screen.
- **The spoken "FATALITY" callout.** That's generated live with the
  Web Speech API (your browser/OS's built-in text-to-speech), which
  plays great for whoever's watching in the browser — but that audio is
  generated outside the page's audio graph, so it technically can't be
  captured by any in-browser recording tool. Downloaded videos carry a
  synthesized "impact" stinger plus the on-screen "FATALITY" text at
  the same moment instead, so the beat is still there, just without the
  literal voice.
- **Runtime varies by league size.** A 4-team league has 3 fights to
  show; a 16-team league has 15. To keep both in a similar ballpark,
  small leagues get slower, more dramatic exchanges and big leagues get
  a snappier highlight-reel pace. Expect roughly 2–3 minutes either way,
  with some natural variance at the extremes.
- **Fighters are original designs.** They're procedurally drawn arcade
  silhouettes with randomized colors and archetypes (ninja, warrior,
  mage, and so on) — intentionally not likenesses of any existing
  fighting game's characters.
- **Autoplay.** Browsers generally require a user gesture before
  playing audio — clicking "Start Draft Kombat" counts, so this
  shouldn't be an issue in normal use.

## Privacy

Everything — the team list, the shuffle, the fight simulation, the
recorded video — lives in memory in your browser tab for the duration
of that visit. Nothing is written to `localStorage`, cookies, or any
server; there's no backend at all. Closing or refreshing the tab erases
it completely, and every new draft starts from a clean slate.

## File structure

```
index.html   — page structure and screens (setup / simulation / results)
style.css    — arcade visual styling
app.js       — simulation logic, canvas rendering, audio synthesis,
               recording, and PNG/video export
```
