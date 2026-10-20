#!/usr/bin/env python3
"""
showcase-audio.py - build the sound track for the showcase take.

The recorder wrote every key press, click and navigation into events.json with
a timestamp. This turns that log into a mix:

  - a keyboard click per character (membrane transient + damped body + a small
    release tick), randomised so a burst of typing never sounds mechanical
  - a mouse click (brighter, shorter) on every press
  - a short whoosh on every screen change
  - a very quiet ambient bed underneath, so the room is not silent

Levels follow the usual screen-demo convention: the interface sounds sit well
above the bed, the whole mix peaks below -1 dBFS, and the bed never competes.

Usage: python showcase-audio.py events.json out.wav
"""

import json
import sys
import wave

import numpy as np

SR = 48000


def fade(signal, ms=1.0):
    n = max(1, int(SR * ms / 1000.0))
    if n * 2 >= len(signal):
        return signal
    ramp = np.linspace(0.0, 1.0, n)
    out = signal.copy()
    out[:n] *= ramp
    out[-n:] *= ramp[::-1]
    return out


def key_click(rng):
    """One keystroke: a hard transient, a damped body, a faint release."""
    dur = 0.11
    n = int(SR * dur)
    t = np.arange(n) / SR
    out = np.zeros(n)

    # transient: a few ms of noise, bright
    noise = rng.standard_normal(n)
    out += noise * np.exp(-t / 0.0028) * 0.55

    # body: the key bottoming out
    f = rng.uniform(150.0, 260.0)
    out += np.sin(2 * np.pi * f * t) * np.exp(-t / 0.016) * 0.42

    # a second harmonic gives the click an edge
    out += np.sin(2 * np.pi * f * 3.1 * t) * np.exp(-t / 0.006) * 0.12

    # release tick a little later
    start = int(SR * rng.uniform(0.035, 0.055))
    if start < n:
        rel_t = t[start:]
        rel = rng.standard_normal(len(rel_t)) * np.exp(-rel_t / 0.004) * 0.16
        out[start:] += rel

    # a touch of highpassed noise sells the plastic
    hp = np.diff(np.concatenate([[0.0], noise]))
    out += hp * np.exp(-t / 0.0015) * 0.10

    return fade(out, 0.6) * rng.uniform(0.82, 1.0)


def mouse_click(rng):
    """A mouse press: brighter and shorter than a key."""
    dur = 0.07
    n = int(SR * dur)
    t = np.arange(n) / SR
    out = rng.standard_normal(n) * np.exp(-t / 0.0022) * 0.75
    f = rng.uniform(760.0, 980.0)
    out += np.sin(2 * np.pi * f * t) * np.exp(-t / 0.010) * 0.30
    out += np.sin(2 * np.pi * 145.0 * t) * np.exp(-t / 0.022) * 0.20
    return fade(out, 0.5) * rng.uniform(0.85, 1.0)


def whoosh(rng):
    """A soft transition sweep for a screen change."""
    dur = 0.34
    n = int(SR * dur)
    t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    # a crude swept bandpass: difference of two one-pole lowpasses
    def lowpass(x, cutoff):
        alpha = 1.0 - np.exp(-2.0 * np.pi * cutoff / SR)
        out = np.empty_like(x)
        acc = 0.0
        for i in range(len(x)):
            acc += alpha * (x[i] - acc)
            out[i] = acc
        return out

    lo = lowpass(noise, 500.0)
    hi = lowpass(noise, 2600.0)
    band = hi - lo
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.5
    return fade(band * env * 2.2, 8.0) * 0.5


def ambient_bed(duration, rng):
    """A very quiet drone: two beating voices plus a breath of filtered noise."""
    n = int(SR * duration)
    t = np.arange(n) / SR
    out = np.zeros(n)

    for freq, level, lfo in ((110.0, 0.055, 0.07), (110.45, 0.050, 0.05), (220.0, 0.018, 0.031)):
        phase = rng.uniform(0, 2 * np.pi)
        drift = 1.0 + 0.0015 * np.sin(2 * np.pi * 0.021 * t + phase)
        tone = np.sin(2 * np.pi * freq * drift * t + phase)
        out += tone * level * (0.65 + 0.35 * np.sin(2 * np.pi * lfo * t + phase))

    # a breath of air, band-limited
    noise = rng.standard_normal(n)
    smooth = np.convolve(noise, np.ones(24) / 24.0, mode="same")
    out += smooth * 0.010 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.045 * t))

    # open gently, close gently
    out *= np.minimum(1.0, np.clip(t / 3.0, 0, 1))
    tail = np.clip((duration - t) / 3.5, 0, 1)
    out *= tail
    return out


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    events_path, out_path = sys.argv[1], sys.argv[2]
    with open(events_path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    events = data.get("events", [])

    duration = 0.0
    for event in events:
        duration = max(duration, float(event.get("t", 0.0)))
    # the sound track has to outlast the picture: the closing hold has no
    # events in it, and a shorter track would cut the ending off
    for beat in data.get("timeline", []):
        duration = max(duration, float(beat.get("ended", 0.0)))
    duration = max(duration + 1.5, 12.0)

    rng = np.random.default_rng(20261020)
    n = int(SR * duration)
    ui = np.zeros(n)

    counts = {"key": 0, "click": 0, "nav": 0}
    for event in events:
        kind = event.get("kind")
        start = int(float(event.get("t", 0.0)) * SR)
        if start >= n:
            continue
        if kind == "key":
            sound = key_click(rng)
        elif kind == "click":
            sound = mouse_click(rng)
        elif kind == "nav":
            sound = whoosh(rng)
        else:
            continue
        counts[kind] = counts.get(kind, 0) + 1
        end = min(n, start + len(sound))
        ui[start:end] += sound[: end - start]

    # keep the loudest stack of simultaneous sounds from clipping
    peak = float(np.max(np.abs(ui))) if n else 0.0
    if peak > 0:
        ui *= 0.92 / peak

    bed = ambient_bed(duration, rng) * 2.1

    mix = ui + bed
    peak = float(np.max(np.abs(mix)))
    if peak > 0:
        mix *= (10 ** (-1.5 / 20.0)) / peak  # -1.5 dBFS ceiling

    rms = float(np.sqrt(np.mean(mix**2))) if n else 0.0
    print(
        f"  duration {duration:.1f}s  keys {counts.get('key', 0)}  "
        f"clicks {counts.get('click', 0)}  navs {counts.get('nav', 0)}"
    )
    print(
        f"  peak {20 * np.log10(max(peak, 1e-9)):.1f} dBFS   "
        f"rms {20 * np.log10(max(rms, 1e-9)):.1f} dBFS"
    )

    stereo = np.stack([mix, mix * 0.985], axis=1)
    pcm = (np.clip(stereo, -1.0, 1.0) * 32767.0).astype("<i2")
    with wave.open(out_path, "wb") as handle:
        handle.setnchannels(2)
        handle.setsampwidth(2)
        handle.setframerate(SR)
        handle.writeframes(pcm.tobytes())
    print(f"  wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
