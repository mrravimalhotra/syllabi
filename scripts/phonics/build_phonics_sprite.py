#!/usr/bin/env python3
"""Builds the CVC phonics audio sprite with Google Cloud Text-to-Speech.

Children must hear pure sounds: /m/ held as a hum, /p/ as a lip pop with no
"uh" after it, short vowels with no glide. Google says letter names ("em",
"ess ess ess") or adds a vowel for any isolated spelling, whatever the SSML,
so every letter sound is cut out of a real carrier word instead, where the
voice says it naturally. Words for held sounds are said at half speed, so the
sound lasts longer; words for stops are not, because a slowed stop gets a long
silent closure before its burst. The carrier word starts with the sound (m from "map",
a from "at"), and the cut ends where the next sound begins:

  hiss         s, f, h       from the first sound up to the vowel's voicing
  hum          m, n, l, r, v up to the vowel: vowel-like energy, or a jump in
                             loudness, less a margin for the glide into it
  buzz         z             Google says z as a plain hiss, voiced only at its
                             edges, so it sounds like s anywhere in a word.
                             A z is a hiss and the voice's low buzz together,
                             so the hiss from between the vowels of "busy" is
                             mixed with the low part of the same voice's /m/
                             hum, at the balance a person's z has
  stop         c, k, p, t    the burst and its breath, up to the vowel
  head         b             the first 120 ms of "bat" (made at 48 kHz) after a
                             -45 dBFS silence gate: the voicing and the lip pop,
                             strictly 110-130 ms (shorter is a click, longer
                             adds "uh"); then an 80 Hz high-pass, a presence
                             lift at 2 kHz and loudness of -16 LUFS with a
                             -1 dBFS true-peak ceiling, so the short pop is not
                             heard as quiet next to vowels and words
  prevoiced    (none now)    the voicing before the burst plus the burst, from
                             a half-speed carrier, strictly 110-130 ms
  voiced stop  d, g, j       a short window from the release burst (the
                             biggest jump in loudness), with a little of the
                             voicing after it: without it b is only a click
  glide        w, y          a short window from the first sound
  vowel        a, e, i,      the voiced part, up to the closure of the
               o, u          consonant after it
  pair         x, q          two cut sounds joined: k+s (a short s), k+w

Hisses, hums and vowels are then slowed to a set length without changing
their pitch. Every clip is fetched as LINEAR16 (WAV), cut and faded, then set
to the loudness a person gives it next to a vowel: f is about 16 dB softer, m
about the same. Raising soft sounds to vowel loudness also raises the faint
noise in Google's audio, so they are not.

Each letter's clip is written to public/sounds/<letter>.mp3, which the app
plays instead of its speech voice (a grown-up's own recording still wins).
All clips, with the test blends and words, are also joined into one MP3 for
listening, with a Howler-style JSON map of [start_ms, duration_ms].

Short o is the British /ɒ/ ("ox"), as Indian schools teach it.

Usage (the key is read from GOOGLE_TTS_API_KEY):
  pip install pydub audioop-lts numpy google-cloud-texttospeech   # and ffmpeg
  python3 scripts/phonics/build_phonics_sprite.py                 # letters and sprite
  python3 scripts/phonics/build_phonics_sprite.py --only m,s --wav-dir /tmp/clips
"""

from __future__ import annotations

import argparse
import io
import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from scipy.signal import butter, lfilter, resample_poly, sosfilt
from google.api_core.client_options import ClientOptions
from google.cloud import texttospeech
from pydub import AudioSegment

VOICE = "en-US-Neural2-F"  # Journey voices reject SSML, so they cannot take <phoneme>.
SPEAKING_RATE = 0.80
PITCH = 0.5  # semitones: slightly warm for children
RATE = 24000
GAP_MS = 300  # silence between clips in the sprite, so neighbours never bleed
ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "assets" / "audio"
LETTERS_DIR = ROOT / "public" / "sounds"  # the app plays /sounds/<letter>.mp3

FRAME_MS = 10
# A frame this far under the loudest one is silence (-50 dB). Not higher: the
# hiss of /f/ sits about 40 dB under the vowel. Google's silence is digital.
SILENT = 0.003
VOICED_ZCR = 2800  # zero crossings per second: below this a loud frame is voiced
HISS_ZCR = 3500  # above this, with little low-frequency energy, a frame is a hiss
VOWEL_DBFS, PEAK_CAP = -20.0, 0.95  # vowels' average level; every clip's peak limit

# Lengths in ms. Held sounds are slowed to these (never sped up).
HOLD_MS = {"hiss": 580, "hum": 580, "buzz": 580, "vowel": 260}
BREATH_HOLD_MS = 250  # /h/ is a breath, not a sound you can hold
STOP_MAX_MS, STOP_MIN_MS = 120, 30
VOWEL_MIN_MS = 40
HUM_MARGIN_MS = 30  # dropped before the vowel, so the glide into it is not heard
HUM_VOWEL_SHARE, HUM_JUMP_DB = 0.6, 8.0
RELEASE_SEARCH_MS = 150
# Prevoiced stops: total length kept within these bounds, ending this long after the burst.
PREVOICED_MIN_MS, PREVOICED_MAX_MS, PREVOICED_BURST_MS = 110, 130, 20
HEAD_MS = 120  # head: how much of the carrier to keep after its leading silence
HEAD_RATE = 48000  # head sounds are made and processed at this rate, then join the sprite at RATE
HEAD_GATE_DBFS = -45.0  # leading silence: everything before the first millisecond louder than this
HEAD_FADE_IN_MS, HEAD_FADE_OUT_MS = 5, 15  # linear in, cosine out
HPF_HZ = 80  # removes low thumps from the voicing (2nd order: 12 dB per octave)
PRESENCE_HZ, PRESENCE_DB, PRESENCE_Q = 2000, 2.75, 1.2  # lifts the lip-parting transient
LUFS_TARGET, TRUE_PEAK_DBFS = -16.0, -1.0
RAW_DIR = ROOT / "temp_raw_audio"  # the processed 48 kHz WAVs, for checking
BETWEEN_MARGIN_MS = 20
BUZZ_CUTOFF_HZ = 500  # the voice's buzz: only the part of the hum under this
BUZZ_SHARE = 0.65  # share of a z's energy in the buzz, as measured in a person's z
FADES = {"hiss": (10, 25), "hum": (10, 25), "stop": (2, 10), "voiced": (2, 30), "prevoiced": (5, 10), "buzz": (10, 25), "glide": (5, 20), "vowel": (10, 30), "whole": (5, 25)}


@dataclass
class Sound:
    kind: str  # hiss | hum | buzz | stop | head | prevoiced | voiced | glide | vowel | whole | pair
    word: str = ""  # carrier word as written
    ipa: str = ""  # how the carrier word is said
    rate: int = 50  # carrier speed in percent (100: as normal); slower makes its first sound last longer
    window_ms: int = 0  # voiced stops: how much to keep from the release; glides: from the start
    parts: tuple[tuple[str, int], ...] = ()  # pairs: (sound, most ms to keep, 0 for all)
    hold_ms: int = 0  # overrides HOLD_MS for this sound
    buzz_from: str = ""  # buzz: the hum whose low part is mixed in
    level_db: float = 0.0  # loudness next to a vowel, as measured in a person's phonics sounds


SOUNDS: dict[str, Sound] = {
    "a": Sound("vowel", "at", "æt", rate=100),
    "b": Sound("head", "bat", "bæt", rate=100, level_db=-2),
    "c": Sound("stop", "cat", "kæt", rate=100, level_db=-6),
    "d": Sound("voiced", "dog", "dɒɡ", rate=100, window_ms=80, level_db=-2),
    "e": Sound("vowel", "egg", "ɛɡ", rate=100),
    "f": Sound("hiss", "fan", "fæn", rate=35, level_db=-14),
    "g": Sound("voiced", "gap", "ɡæp", rate=100, window_ms=80, level_db=-3),
    "h": Sound("hiss", "hat", "hæt", hold_ms=BREATH_HOLD_MS, level_db=-12),
    "i": Sound("vowel", "it", "ɪt", rate=100),
    "j": Sound("voiced", "jam", "dʒæm", rate=100, window_ms=120, level_db=-6),
    "k": Sound("stop", "kit", "kɪt", rate=100, level_db=-6),
    "l": Sound("hum", "log", "lɒɡ", level_db=-5),  # a back vowel after it keeps the l dark, as teachers say it
    "m": Sound("hum", "map", "mæp"),
    "n": Sound("hum", "nap", "næp"),
    "o": Sound("vowel", "ox", "ɒks", rate=100),
    "p": Sound("stop", "pan", "pæn", rate=100, level_db=-12),
    "q": Sound("pair", parts=(("k", 0), ("w", 0))),
    "r": Sound("hum", "rat", "ɹæt", level_db=-6),
    "s": Sound("hiss", "sun", "sʌn", level_db=-2),
    "t": Sound("stop", "tap", "tæp", rate=100, level_db=-10),
    "u": Sound("vowel", "up", "ʌp", rate=100),
    "v": Sound("hum", "van", "væn", rate=35, level_db=-8),
    "w": Sound("glide", "wet", "wɛt", window_ms=110, level_db=-4),
    "x": Sound("pair", parts=(("k", 0), ("s", 150))),
    "y": Sound("glide", "yes", "jɛs", window_ms=100, level_db=-6),
    "z": Sound("buzz", "busy", "bɪzːi", buzz_from="m", level_db=-7),
    # Blends and whole words, said as they are
    "blend-ma": Sound("whole", "ma", "mæ", rate=100),
    "blend-ca": Sound("whole", "ca", "kæ", rate=100),
    "word-map": Sound("whole", "map", "mæp", rate=100),
    "word-cat": Sound("whole", "cat", "kæt", rate=100),
}


def ssml_for(sound: Sound) -> str:
    word = f'<phoneme alphabet="ipa" ph="{sound.ipa}">{sound.word}</phoneme>'
    return f'<speak><prosody rate="{sound.rate}%">{word}</prosody></speak>' if sound.rate != 100 else f"<speak>{word}</speak>"


def client() -> texttospeech.TextToSpeechClient:
    key = os.environ.get("GOOGLE_TTS_API_KEY")
    if not key:
        sys.exit("GOOGLE_TTS_API_KEY is not set.")
    return texttospeech.TextToSpeechClient(client_options=ClientOptions(api_key=key), transport="rest")


def synthesize(tts: texttospeech.TextToSpeechClient, ssml: str, sample_rate: int = RATE) -> AudioSegment:
    res = tts.synthesize_speech(
        input=texttospeech.SynthesisInput(ssml=ssml),
        voice=texttospeech.VoiceSelectionParams(language_code=VOICE[:5], name=VOICE),
        audio_config=texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.LINEAR16,
            speaking_rate=SPEAKING_RATE,
            pitch=PITCH,
            sample_rate_hertz=sample_rate,
        ),
    )
    return AudioSegment.from_file(io.BytesIO(res.audio_content), format="wav").set_channels(1)


# ---------- analysis ----------


@dataclass
class Frames:
    rms: np.ndarray  # linear level per frame
    low: np.ndarray  # share of energy under 400 Hz
    mid: np.ndarray  # share of energy in 500-2500 Hz (vowel formants)
    zcr: np.ndarray  # zero crossings per second

    @property
    def peak(self) -> float:
        return float(self.rms.max())

    def silent(self, i: int) -> bool:
        return self.rms[i] < self.peak * SILENT

    def voiced(self, i: int, level: float = 0.3) -> bool:
        return self.rms[i] > self.peak * level and self.zcr[i] < VOICED_ZCR

    def hiss(self, i: int) -> bool:
        return not self.silent(i) and self.zcr[i] > HISS_ZCR and self.low[i] < 0.2

    def onset(self) -> int:
        return next(i for i in range(len(self.rms)) if not self.silent(i))

    def last_sound(self) -> int:
        return max(i for i in range(len(self.rms)) if not self.silent(i))


def samples(clip: AudioSegment) -> np.ndarray:
    return np.array(clip.get_array_of_samples(), dtype=float) / (1 << (8 * clip.sample_width - 1))


def analyse(clip: AudioSegment) -> Frames:
    x = samples(clip)
    n = clip.frame_rate * FRAME_MS // 1000
    freqs = np.fft.rfftfreq(n, 1 / clip.frame_rate)
    rms, low, mid, zcr = [], [], [], []
    for i in range(0, len(x) - n + 1, n):
        f = x[i : i + n]
        power = np.abs(np.fft.rfft(f * np.hanning(n))) ** 2
        total = power.sum() + 1e-12
        rms.append(np.sqrt(np.mean(f**2)))
        low.append(power[freqs < 400].sum() / total)
        mid.append(power[(freqs >= 500) & (freqs <= 2500)].sum() / total)
        zcr.append(np.count_nonzero(np.diff(np.signbit(f))) * 1000 / FRAME_MS)
    return Frames(*(np.array(a) for a in (rms, low, mid, zcr)))


# ---------- cutting: each returns (start, end) in frames ----------


def cut_hiss(fr: Frames) -> tuple[int, int]:
    """From the first sound to the frame before the vowel's voicing."""
    start = fr.onset()
    end = next((i for i in range(start, len(fr.rms)) if fr.voiced(i)), len(fr.rms))
    return start, end - 1


def cut_hum(fr: Frames) -> tuple[int, int]:
    """Up to the vowel: the first frame that is vowel-like or clearly louder than
    the hum before it. The first frame is the soft attack, so it is not compared."""
    start = fr.onset()
    db = 20 * np.log10(fr.rms + 1e-12)
    end = len(fr.rms)
    for i in range(start + 2, len(fr.rms)):
        before = float(np.median(db[start + 1 : i]))
        if fr.mid[i] >= HUM_VOWEL_SHARE or db[i] >= before + HUM_JUMP_DB:
            end = i
            break
    return start, end - HUM_MARGIN_MS // FRAME_MS


def cut_stop(fr: Frames) -> tuple[int, int]:
    """The burst and the breath after it, up to the vowel's voicing."""
    start = fr.onset()
    limit = min(len(fr.rms), start + STOP_MAX_MS // FRAME_MS)
    end = next((i for i in range(start, limit) if fr.voiced(i)), limit)
    return start, max(end, start + STOP_MIN_MS // FRAME_MS)


def cut_voiced(fr: Frames, window_ms: int) -> tuple[int, int]:
    """A short window from the release burst, the biggest jump in loudness near
    the start (a voiced stop can hum quietly before it). It keeps a little of the
    voicing after the burst, as a teacher's b does; the fade-out stops it there."""
    start = fr.onset()
    db = 20 * np.log10(fr.rms + 1e-12)
    search = range(start + 1, min(len(db), start + RELEASE_SEARCH_MS // FRAME_MS))
    release = max(search, key=lambda i: db[i] - db[i - 1])
    begin = release - 1
    return begin, min(len(db), begin + window_ms // FRAME_MS)


def cut_prevoiced(fr: Frames) -> tuple[int, int]:
    """The voicing before a stop's burst, then the burst itself (PREVOICED_BURST_MS of it),
    kept within PREVOICED_MIN_MS to PREVOICED_MAX_MS so it neither clicks nor opens into the vowel."""
    start = fr.onset()
    db = 20 * np.log10(fr.rms + 1e-12)
    search = range(start + 1, min(len(db), start + 2 * RELEASE_SEARCH_MS // FRAME_MS))
    release = max(search, key=lambda i: db[i] - db[i - 1])
    end = release + PREVOICED_BURST_MS // FRAME_MS
    start = max(start, end - PREVOICED_MAX_MS // FRAME_MS)
    return start, max(end, start + PREVOICED_MIN_MS // FRAME_MS)


def cut_between(fr: Frames) -> tuple[int, int]:
    """The consonant between the carrier's two vowels: the longest stretch
    without loud voiced frames, less a margin on each side."""
    vowel = np.flatnonzero([fr.voiced(i) for i in range(len(fr.rms))])
    gap = int(np.argmax(np.diff(vowel)))
    margin = BETWEEN_MARGIN_MS // FRAME_MS
    return vowel[gap] + 1 + margin, vowel[gap + 1] - margin


def add_buzz(hiss: AudioSegment, hum: AudioSegment) -> AudioSegment:
    """Mixes the low part of a hum under a hiss, so BUZZ_SHARE of the energy is buzz."""
    buzz = hum.low_pass_filter(BUZZ_CUTOFF_HZ).low_pass_filter(BUZZ_CUTOFF_HZ)
    buzz = (buzz * (len(hiss) // len(buzz) + 1))[: len(hiss)].fade_in(10).fade_out(25)
    energy = lambda seg: float(np.sum(samples(seg) ** 2)) + 1e-12
    gain = 10 * np.log10(BUZZ_SHARE / (1 - BUZZ_SHARE) * energy(hiss) / energy(buzz))
    return hiss.overlay(buzz.apply_gain(gain))


def cut_glide(fr: Frames, window_ms: int) -> tuple[int, int]:
    """A glide or affricate cannot be held or cut cleanly: keep its first moment."""
    start = fr.onset()
    return start, start + window_ms // FRAME_MS


def cut_vowel(fr: Frames) -> tuple[int, int]:
    """The voiced part, from the first loud voiced frame to where the consonant
    after it closes (the level falls away)."""
    start = next(i for i in range(len(fr.rms)) if fr.voiced(i, 0.2) and not fr.hiss(i))
    end = start + VOWEL_MIN_MS // FRAME_MS
    while end < len(fr.rms) and not fr.silent(end) and not fr.hiss(end) and fr.rms[end] > fr.peak * 0.25:
        end += 1
    return start, end


CUTS = {"prevoiced": cut_prevoiced, "hiss": cut_hiss, "hum": cut_hum, "buzz": cut_between, "stop": cut_stop, "vowel": cut_vowel}


# ---------- shaping ----------


# ---------- mastering for short stops (head) ----------


def _biquad(kind: str, f0: float, fs: int, q: float, gain_db: float = 0.0) -> tuple[np.ndarray, np.ndarray]:
    """Audio EQ cookbook (R. Bristow-Johnson) biquad coefficients: peaking, highshelf or highpass."""
    a_gain = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f0 / fs
    cos, alpha = np.cos(w0), np.sin(w0) / (2 * q)
    if kind == "peaking":
        b = [1 + alpha * a_gain, -2 * cos, 1 - alpha * a_gain]
        a = [1 + alpha / a_gain, -2 * cos, 1 - alpha / a_gain]
    elif kind == "highshelf":
        sq = 2 * np.sqrt(a_gain) * alpha
        b = [a_gain * ((a_gain + 1) + (a_gain - 1) * cos + sq), -2 * a_gain * ((a_gain - 1) + (a_gain + 1) * cos), a_gain * ((a_gain + 1) + (a_gain - 1) * cos - sq)]
        a = [(a_gain + 1) - (a_gain - 1) * cos + sq, 2 * ((a_gain - 1) - (a_gain + 1) * cos), (a_gain + 1) - (a_gain - 1) * cos - sq]
    else:  # highpass
        b = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2]
        a = [1 + alpha, -2 * cos, 1 - alpha]
    return np.array(b) / a[0], np.array(a) / a[0]


def loudness_lufs(x: np.ndarray, fs: int) -> float:
    """ITU-R BS.1770 loudness: K-weighting (a +4 dB shelf from 1.5 kHz and a 38 Hz high-pass), then the
    mean square. The standard's gate works on 400 ms blocks, longer than a 120 ms stop, so the whole
    clip is measured as one ungated block."""
    y = lfilter(*_biquad("highshelf", 1500, fs, 1 / np.sqrt(2), 4.0), x)
    y = lfilter(*_biquad("highpass", 38, fs, 0.5), y)
    return float(-0.691 + 10 * np.log10(np.mean(y**2) + 1e-12))


def true_peak_dbfs(x: np.ndarray) -> float:
    """The peak after 4x oversampling, which catches peaks between samples that MP3 conversion can clip."""
    return float(20 * np.log10(np.max(np.abs(resample_poly(x, 4, 1))) + 1e-12))


def master_head(tts: texttospeech.TextToSpeechClient, sound: Sound, clip_id: str) -> tuple[AudioSegment, str]:
    """A short stop at full clarity: the first HEAD_MS of the carrier after its leading silence, faded,
    filtered, lifted and set to LUFS_TARGET under a TRUE_PEAK_DBFS ceiling. Prints what it measured."""
    ssml = ssml_for(sound)
    word = synthesize(tts, ssml, HEAD_RATE)
    x, fs = samples(word), word.frame_rate
    ms = fs // 1000
    level = 20 * np.log10(np.array([np.sqrt(np.mean(x[i : i + ms] ** 2)) for i in range(0, len(x) - ms, ms)]) + 1e-12)
    start = int(np.argmax(level > HEAD_GATE_DBFS)) * ms
    y = x[start : start + HEAD_MS * ms].copy()
    length_ms = len(y) / ms
    if not PREVOICED_MIN_MS <= length_ms <= PREVOICED_MAX_MS:
        raise RuntimeError(f"{clip_id} came out {length_ms:.0f} ms, outside {PREVOICED_MIN_MS}-{PREVOICED_MAX_MS} ms")
    y = sosfilt(butter(2, HPF_HZ, "highpass", fs=fs, output="sos"), y)
    y = lfilter(*_biquad("peaking", PRESENCE_HZ, fs, PRESENCE_Q, PRESENCE_DB), y)
    y[: HEAD_FADE_IN_MS * ms] *= np.linspace(0, 1, HEAD_FADE_IN_MS * ms)
    y[-HEAD_FADE_OUT_MS * ms :] *= np.cos(np.linspace(0, np.pi / 2, HEAD_FADE_OUT_MS * ms))
    gain = LUFS_TARGET - loudness_lufs(y, fs)
    gain = min(gain, TRUE_PEAK_DBFS - true_peak_dbfs(y))  # the ceiling wins over the loudness target
    y *= 10 ** (gain / 20)
    out = AudioSegment((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes(), frame_rate=fs, sample_width=2, channels=1)
    RAW_DIR.mkdir(exist_ok=True)
    out.export(RAW_DIR / f"p_{clip_id}.wav", format="wav")
    rms = 20 * np.log10(np.sqrt(np.mean(y**2)) + 1e-12)
    print(
        f"  {clip_id}: {length_ms:.0f} ms at {fs} Hz | {loudness_lufs(y, fs):.1f} LUFS (ungated, target {LUFS_TARGET}), "
        f"true peak {true_peak_dbfs(y):.1f} dBFS (ceiling {TRUE_PEAK_DBFS}), RMS {rms:.1f} dBFS | "
        f"high-pass {HPF_HZ} Hz 12 dB/oct, +{PRESENCE_DB} dB at {PRESENCE_HZ} Hz Q {PRESENCE_Q} | {RAW_DIR / f'p_{clip_id}.wav'}"
    )
    return out.set_frame_rate(RATE), ssml


def stretch(clip: AudioSegment, target_ms: int) -> AudioSegment:
    """Slows a clip to target_ms without changing its pitch (ffmpeg atempo,
    chained because one atempo filter goes no slower than 0.5)."""
    if len(clip) >= target_ms:
        return clip
    factor, chain = len(clip) / target_ms, []
    while factor < 0.5:
        chain.append("atempo=0.5")
        factor /= 0.5
    chain.append(f"atempo={factor:.4f}")
    wav = io.BytesIO()
    clip.export(wav, format="wav")
    out = subprocess.run(
        ["ffmpeg", "-v", "error", "-f", "wav", "-i", "pipe:0", "-af", ",".join(chain), "-f", "wav", "pipe:1"],
        input=wav.getvalue(),
        capture_output=True,
        check=True,
    ).stdout
    return AudioSegment.from_file(io.BytesIO(out), format="wav")


def match_loudness(clip: AudioSegment, level_db: float = 0.0) -> AudioSegment:
    """Average level of the sounding frames to VOWEL_DBFS + level_db, without clipping."""
    fr = analyse(clip)
    sounding = fr.rms[fr.rms >= fr.peak * SILENT]
    level = 20 * np.log10(np.sqrt(np.mean(sounding**2)) + 1e-12)
    peak = np.abs(samples(clip)).max()
    gain = min(VOWEL_DBFS + level_db - level, 20 * np.log10(PEAK_CAP / (peak + 1e-12)))
    return clip.apply_gain(gain)


def cut(tts: texttospeech.TextToSpeechClient, sound: Sound) -> tuple[AudioSegment, str]:
    """The sound, cut, faded and slowed (not yet loudness-matched), and its SSML."""
    ssml = ssml_for(sound)
    word = synthesize(tts, ssml)
    fr = analyse(word)
    if sound.kind == "whole":
        start, end = fr.onset(), fr.last_sound() + 1
    elif sound.kind == "voiced":
        start, end = cut_voiced(fr, sound.window_ms)
    elif sound.kind == "glide":
        start, end = cut_glide(fr, sound.window_ms)
    else:
        start, end = CUTS[sound.kind](fr)
    if end <= start:
        raise RuntimeError(f"nothing to cut from {ssml}")
    fade_in, fade_out = FADES[sound.kind]
    clip = word[start * FRAME_MS : end * FRAME_MS].fade_in(fade_in).fade_out(fade_out)
    if sound.kind in HOLD_MS:
        clip = stretch(clip, sound.hold_ms or HOLD_MS[sound.kind])
    return clip, ssml


def build(tts: texttospeech.TextToSpeechClient, clip_id: str, done: dict[str, AudioSegment]) -> tuple[AudioSegment, str]:
    """A loudness-matched clip; a pair joins clips already built (or builds them)."""
    sound = SOUNDS[clip_id]
    if sound.kind == "pair":
        joined = AudioSegment.empty()
        for part, most_ms in sound.parts:
            if part not in done:
                done[part] = build(tts, part, done)[0]
            joined += done[part][:most_ms].fade_out(25) if most_ms else done[part]
        return joined, " + ".join(f"{p} ({ms} ms)" if ms else p for p, ms in sound.parts)
    if sound.kind == "head":
        return master_head(tts, sound, clip_id)
    clip, ssml = cut(tts, sound)
    if sound.kind == "buzz":
        if sound.buzz_from not in done:
            done[sound.buzz_from] = build(tts, sound.buzz_from, done)[0]
        clip = add_buzz(clip, done[sound.buzz_from])
        ssml += f" + low part of {sound.buzz_from}"
    return match_loudness(clip, sound.level_db), ssml


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--only", help="comma-separated clip ids; writes WAVs only, leaves the sprite alone")
    parser.add_argument("--wav-dir", type=Path, help="also save each clip here as WAV")
    args = parser.parse_args()
    if args.only and not args.wav_dir:
        parser.error("--only needs --wav-dir")

    ids = args.only.split(",") if args.only else list(SOUNDS)
    tts = client()
    done: dict[str, AudioSegment] = {}
    gap = AudioSegment.silent(duration=GAP_MS, frame_rate=RATE)
    sprite = AudioSegment.silent(duration=0, frame_rate=RATE)
    sprite_map, meta = {}, {}

    print(f"Voice {VOICE}, rate {SPEAKING_RATE}, pitch {PITCH:+}st\n")
    for clip_id in ids:
        clip, ssml = build(tts, clip_id, done)
        done[clip_id] = clip
        clip = clip.set_frame_rate(RATE).set_channels(1)
        sound = SOUNDS[clip_id]
        sprite_map[clip_id] = [len(sprite), len(clip)]
        meta[clip_id] = {"kind": sound.kind, "carrier": sound.word or None, "ssml": ssml}
        sprite += clip + gap
        if args.wav_dir:
            args.wav_dir.mkdir(parents=True, exist_ok=True)
            clip.export(args.wav_dir / f"{clip_id}.wav", format="wav")
        print(f"{clip_id:9} {len(clip):5} ms  {sound.kind:7} {ssml}")

    heads = [k for k in done if SOUNDS[k].kind == "head"]
    if heads:
        print("\nLoudness next to the words (ungated BS.1770):")
        for k in heads + [w for w in ("word-map", "word-cat") if w in done]:
            seg = done[k]
            print(f"  {k:9} {loudness_lufs(samples(seg), seg.frame_rate):6.1f} LUFS")
    if args.only:
        return
    for letter in (k for k in done if len(k) == 1):
        done[letter].set_frame_rate(RATE).set_channels(1).export(LETTERS_DIR / f"{letter}.mp3", format="mp3", bitrate="96k")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sprite.export(OUT_DIR / "phonics_sprite.mp3", format="mp3", bitrate="96k")
    manifest = {
        "src": ["phonics_sprite.mp3"],
        "voice": VOICE,
        "speakingRate": SPEAKING_RATE,
        "pitch": PITCH,
        "sprite": sprite_map,
        "meta": meta,
    }
    (OUT_DIR / "phonics_sprite.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(f"\nWrote {LETTERS_DIR}/<letter>.mp3, {OUT_DIR / 'phonics_sprite.mp3'} ({len(sprite)} ms) and phonics_sprite.json")


if __name__ == "__main__":
    main()
