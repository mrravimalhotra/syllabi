#!/usr/bin/env python3
"""Builds the CVC phonics audio sprite with Google Cloud Text-to-Speech.

Children must hear pure sounds: /m/ held as a hum, /p/ as a lip pop with no
"uh" after it, short vowels with no glide. A speech voice says letter names or
adds a schwa when given a letter, so every clip is asked for in IPA:

  - continuous consonants: a prolonged spelling ("mmm"). Google still opens it
    with a vowel ("em-mm", whatever the markup), so the vowel is cut off and
    only the held sound after it is kept;
  - short vowels: the vowel alone between two short breaks;
  - stop consonants: the release burst sliced from the end of a carrier word
    ("map" gives /p/), or for /b/ and /g/ the isolated stop with its vowel
    tail cut off.

Each clip is fetched as LINEAR16 (WAV), normalised, trimmed of leading and
trailing silence, given a 10 ms fade-in and 15 ms fade-out, then joined into
one MP3 with a Howler-style JSON map of [start_ms, duration_ms].

Usage (the key is read from GOOGLE_TTS_API_KEY):
  pip install pydub audioop-lts numpy google-cloud-texttospeech   # and ffmpeg
  python3 scripts/phonics/build_phonics_sprite.py            # test batch only
  python3 scripts/phonics/build_phonics_sprite.py --all      # every clip
  python3 scripts/phonics/build_phonics_sprite.py --only m --wav-dir /tmp/clips
"""

from __future__ import annotations

import argparse
import io
import json
import os
import sys
from pathlib import Path

import numpy as np
from google.api_core.client_options import ClientOptions
from google.cloud import texttospeech
from pydub import AudioSegment
from pydub.effects import normalize
from pydub.silence import detect_leading_silence

VOICE = "en-US-Neural2-F"  # Journey voices reject SSML, so they cannot take <phoneme>.
SPEAKING_RATE = 0.80
PITCH = 0.5  # semitones: slightly warm for children
# dBFS, for trimming leading and trailing silence after normalising. Not -42:
# a word-final stop burst sits near -43 and "map" would lose its /p/. Google's
# silence is digital (about -81), so -55 keeps every burst and still trims.
SILENCE_THRESH = -55.0
FADE_IN_MS, FADE_OUT_MS = 10, 15
GAP_MS = 300  # silence between clips in the sprite, so neighbours never bleed
STOP_CUTOFF_MS = 90  # isolated /b/ and /g/: keep the burst, drop the vowel tail
# A 10 ms frame is "vowel" when this share of its energy is in 500-2500 Hz
# (vowel formants). A hum keeps almost all of it under 400 Hz, a hiss above 3 kHz.
VOWEL_SHARE = 0.25
# A held sound outside these bounds after the vowel is cut is a failure. Too long
# means Google read the letter names ("vee vee vee"), whose "ee" sits outside the
# vowel band and is not detected.
MIN_HELD_MS, MAX_HELD_MS = 120, 700

OUT_DIR = Path(__file__).resolve().parents[2] / "assets" / "audio"


def ipa(ph: str, text: str) -> str:
    return f'<speak><phoneme alphabet="ipa" ph="{ph}">{text}</phoneme></speak>'


def prolong(text: str) -> str:
    return f'<speak><prosody rate="80%">{text}</prosody></speak>'


def vowel(ph: str, text: str) -> str:
    return f'<speak><break time="100ms"/><phoneme alphabet="ipa" ph="{ph}">{text}</phoneme><break time="100ms"/></speak>'


# kind: "plain" (use the clip as synthesised), "held" (cut off the vowel Google
# puts before a held consonant, keep the hum or hiss), "carrier" (slice the final stop
# burst out of the word), "cutoff" (isolated stop, keep only its first burst).
# A carrier entry's "fallback" is the aspirated IPA tried if no burst is found.
MANIFEST: dict[str, dict] = {
    # Continuous consonants
    "m": {"kind": "held", "ssml": prolong("mmm")},
    "s": {"kind": "held", "ssml": prolong("sss")},
    "f": {"kind": "held", "ssml": prolong("fff")},
    "n": {"kind": "held", "ssml": prolong("nnn")},
    "l": {"kind": "held", "ssml": prolong("lll")},
    "r": {"kind": "held", "ssml": prolong("rrr")},
    "z": {"kind": "held", "ssml": prolong("zzz")},
    "v": {"kind": "held", "ssml": prolong("vvv")},
    # Short vowels
    "a": {"kind": "plain", "ssml": vowel("æ", "a")},
    "e": {"kind": "plain", "ssml": vowel("ɛ", "e")},
    "i": {"kind": "plain", "ssml": vowel("ɪ", "i")},
    "o": {"kind": "plain", "ssml": vowel("ɑ", "o")},
    "u": {"kind": "plain", "ssml": vowel("ʌ", "u")},
    # Stop consonants
    "p": {"kind": "carrier", "ssml": ipa("mæp", "map"), "fallback": ipa("pʰ", "p")},
    "t": {"kind": "carrier", "ssml": ipa("kæt", "cat"), "fallback": ipa("tʰ", "t")},
    "k": {"kind": "carrier", "ssml": ipa("pæk", "pack"), "fallback": ipa("kʰ", "c")},
    "d": {"kind": "carrier", "ssml": ipa("bɛd", "bed"), "fallback": ipa("d", "d")},
    "b": {"kind": "cutoff", "ssml": ipa("b", "b")},
    "g": {"kind": "cutoff", "ssml": ipa("ɡ", "g")},
    # Blends (onset + vowel) and whole words
    "blend-ma": {"kind": "plain", "ssml": ipa("mæ", "ma")},
    "blend-ca": {"kind": "plain", "ssml": ipa("kæ", "ca")},
    "word-map": {"kind": "plain", "ssml": ipa("mæp", "map")},
    "word-cat": {"kind": "plain", "ssml": ipa("kæt", "cat")},
}

TEST_BATCH = ["m", "p", "t", "a", "i", "blend-ma", "blend-ca", "word-map", "word-cat"]


def client() -> texttospeech.TextToSpeechClient:
    key = os.environ.get("GOOGLE_TTS_API_KEY")
    if not key:
        sys.exit("GOOGLE_TTS_API_KEY is not set.")
    return texttospeech.TextToSpeechClient(client_options=ClientOptions(api_key=key), transport="rest")


def synthesize(tts: texttospeech.TextToSpeechClient, ssml: str) -> AudioSegment:
    res = tts.synthesize_speech(
        input=texttospeech.SynthesisInput(ssml=ssml),
        voice=texttospeech.VoiceSelectionParams(language_code=VOICE[:5], name=VOICE),
        audio_config=texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.LINEAR16,
            speaking_rate=SPEAKING_RATE,
            pitch=PITCH,
        ),
    )
    return AudioSegment.from_file(io.BytesIO(res.audio_content), format="wav")


def trim(clip: AudioSegment, thresh: float = SILENCE_THRESH) -> AudioSegment:
    """Removes leading and trailing silence only; silence inside the clip stays."""
    start = detect_leading_silence(clip, silence_threshold=thresh)
    end = len(clip) - detect_leading_silence(clip.reverse(), silence_threshold=thresh)
    return clip[start:end] if end > start else clip


def final_burst(word: AudioSegment) -> AudioSegment | None:
    """The release burst of a word-final stop: whatever follows the last closure
    (at least 20 ms quieter than 48 dB below the word's peak) in the last 350 ms.
    Bursts are faint (about 45 dB under the vowel), so levels are relative to the
    word's peak, never the fixed trim threshold, which would delete them."""
    peak = word.max_dBFS
    word = trim(word, peak - 60)
    frame, quiet = 5, peak - 48
    tail_start = max(0, len(word) - 350)
    levels = [word[t : t + frame].dBFS for t in range(tail_start, len(word) - frame, frame)]
    run, closure_end = 0, None
    for idx, level in enumerate(levels):
        if level < quiet:
            run += 1
        else:
            if run * frame >= 20:
                closure_end = tail_start + idx * frame
            run = 0
    if closure_end is None:
        return None
    burst = word[closure_end:]
    return burst if 10 <= len(burst) <= 250 else None


def vowel_share(clip: AudioSegment, frame_ms: int = 10) -> list[tuple[float, float]]:
    """(share of energy in 500-2500 Hz, level in dBFS) for each frame."""
    x = np.array(clip.get_array_of_samples(), dtype=float)
    n = int(clip.frame_rate * frame_ms / 1000)
    freqs = np.fft.rfftfreq(n, 1 / clip.frame_rate)
    band = (freqs >= 500) & (freqs <= 2500)
    out = []
    for i in range(0, len(x) - n + 1, n):
        power = np.abs(np.fft.rfft(x[i : i + n] * np.hanning(n))) ** 2
        out.append((power[band].sum() / (power.sum() + 1e-9), clip[i * 1000 // clip.frame_rate :][:frame_ms].dBFS))
    return out


def held_part(clip: AudioSegment, frame_ms: int = 10) -> AudioSegment | None:
    """The held consonant after the vowel Google opens it with: everything after
    the last loud vowel-like frame, plus one frame for the transition."""
    clip = trim(normalize(clip))
    frames = vowel_share(clip, frame_ms)
    loud = clip.max_dBFS - 30
    vowel_frames = [i for i, (share, level) in enumerate(frames) if share >= VOWEL_SHARE and level > loud]
    start = (vowel_frames[-1] + 2) * frame_ms if vowel_frames else 0
    held = clip[start:]
    return held if MIN_HELD_MS <= len(held) <= MAX_HELD_MS else None


def build_clip(tts: texttospeech.TextToSpeechClient, entry: dict) -> tuple[AudioSegment, str, str]:
    """Returns (processed clip, SSML used, method)."""
    kind, ssml = entry["kind"], entry["ssml"]
    raw = synthesize(tts, ssml)
    method = kind
    if kind == "carrier":
        burst = final_burst(raw)
        if burst is not None:
            raw = burst
        else:
            ssml, method = entry["fallback"], "aspirated fallback"
            raw = synthesize(tts, ssml)
    elif kind == "held":
        held = held_part(raw)
        if held is None:
            raise RuntimeError(f"no held sound found after the vowel in {ssml}")
        raw = held
    elif kind == "cutoff":
        raw = trim(raw)[:STOP_CUTOFF_MS]
    # Normalise first, so the -42 dBFS trim measures every clip on the same scale
    # (a sliced burst arrives at about -49 dBFS).
    clip = trim(normalize(raw)).fade_in(FADE_IN_MS).fade_out(FADE_OUT_MS)
    return clip, ssml, method


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--all", action="store_true", help="build every clip, not just the test batch")
    parser.add_argument("--only", help="comma-separated clip ids; writes WAVs only, leaves the sprite alone")
    parser.add_argument("--wav-dir", type=Path, help="also save each processed clip here as WAV")
    args = parser.parse_args()

    ids = args.only.split(",") if args.only else list(MANIFEST) if args.all else TEST_BATCH
    if args.only and not args.wav_dir:
        parser.error("--only needs --wav-dir")
    tts = client()
    gap = AudioSegment.silent(duration=GAP_MS, frame_rate=24000)
    sprite = AudioSegment.silent(duration=0, frame_rate=24000)
    sprite_map, meta = {}, {}

    print(f"Voice {VOICE}, rate {SPEAKING_RATE}, pitch {PITCH:+}st\n")
    for clip_id in ids:
        clip, ssml, method = build_clip(tts, MANIFEST[clip_id])
        sprite_map[clip_id] = [len(sprite), len(clip)]
        meta[clip_id] = {"ssml": ssml, "method": method}
        sprite += clip.set_frame_rate(24000).set_channels(1) + gap
        if args.wav_dir:
            args.wav_dir.mkdir(parents=True, exist_ok=True)
            clip.export(args.wav_dir / f"{clip_id}.wav", format="wav")
        print(f"{clip_id:9} {len(clip):5} ms  {method:18} {ssml}")

    if args.only:
        return
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sprite.export(OUT_DIR / "phonics_sprite.mp3", format="mp3", bitrate="64k")
    manifest = {
        "src": ["phonics_sprite.mp3"],
        "voice": VOICE,
        "speakingRate": SPEAKING_RATE,
        "pitch": PITCH,
        "sprite": sprite_map,
        "meta": meta,
    }
    (OUT_DIR / "phonics_sprite.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"\nWrote {OUT_DIR / 'phonics_sprite.mp3'} ({len(sprite)} ms) and phonics_sprite.json")


if __name__ == "__main__":
    main()
