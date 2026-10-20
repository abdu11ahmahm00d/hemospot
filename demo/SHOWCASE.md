# The product showcase take

`video/product-showcase.mp4` is one continuous take of somebody using Hemospot:
they sign in, work through a case, open an analysis, read the custody chain,
search, and pull the report. There are no title cards, no captions and no
narration - the app is the whole video.

    1920x1080, 30 fps, ~2:20, H.264 + AAC, ~6 MB

## How it was made

Not a mock-up and not a slideshow: Chromium drives the real React build against
the live database, and every frame is the browser's own compositor output.

| piece | what it does |
| --- | --- |
| `record-showcase.mjs` | the driver: signs in as a real persona, walks the workflow, captures the compositor frame by frame, and timestamps every key press, click and navigation |
| `showcase-overlay.js` | injected before the app's own scripts: the drawn cursor, the click ripple, and the route crossfade |
| `showcase-audio.py` | turns the event log into a sound track - a keyboard click per character, a mouse click per press, a whoosh per screen change, and a quiet ambient bed underneath |
| `build-showcase.ps1` | starts the app and the sidecar, records, builds the sound, encodes, muxes |

Three decisions did most of the work:

**The cursor is drawn, not captured.** A browser screencast does not include the
OS pointer, so the overlay draws an arrow and eases it toward the commanded
point with a spring, plus a couple of pixels of tremor and a ripple on press.
The real pointer still moves along the same path so hover states stay in step.

**Typing is typed.** Characters go in one at a time with a 90-165 ms delay
(135-215 ms for the password), with a longer pause after a space. The password
field is masked, so the viewer sees dots appear at reading speed.

**Screen changes dissolve.** The overlay patches `history.pushState`, so a route
change fades the content out, lets React swap it, and fades it back in - a
dissolve instead of a cut. Scrolling is eased in the page rather than jumped.

## Re-recording it

    powershell -NoProfile -ExecutionPolicy Bypass -File demo\build-showcase.ps1 -OutDir D:\showcase-out

The app and the sidecar have to run on the same machine as the recording, and
the dev server must live in the same session as the recorder (a server started
from another shell dies with it). The script handles both, but it also starts
the sidecar: without it the dashboard shows a "sidecar unreachable" banner.

The password comes from `sidecar/.env` (`WORKER_PASSWORD`) and is never written
to a file, a log or a commit.

## Two things worth knowing if you re-record

- **Encode after, not during.** The first version piped frames straight into
  ffmpeg while recording; at 1080p the encoder could not keep up with the
  browser, so the picture drifted later and later behind the sound (nine
  seconds of drift by the end). The frames now go to disk and are encoded
  afterwards - the capture stays locked to real time.
- **Check the pace on the machine you record on.** The take here is 2:20
  because something else was saturating the CPU. On a quiet machine the same
  shot list runs in about 1:35.
