# Letter sounds

The kindergarten activities say each letter's sound. The app plays the file here
for a letter instead of its speech voice, which can only approximate a pure sound.

`a.mp3` to `z.mp3` are made by `scripts/phonics/build_phonics_sprite.py` with Google
Cloud Text-to-Speech: each pure sound is cut out of a real word that starts with it
(m from "map", a from "at"), so there is no letter name and no "uh" after it. Short
o is the British /ɒ/ ("ox"). To make them again (needs `GOOGLE_TTS_API_KEY`):

```
pip install pydub audioop-lts numpy google-cloud-texttospeech   # and ffmpeg
python3 scripts/phonics/build_phonics_sprite.py
```

A grown-up's own recording (Practice → Kindergarten → Record the sounds) is played
instead of these files. You can also replace a file with your own recording, named by
the letter, in `.mp3` format. Tips for recording (your own voice is best):

- Say the SOUND, not the letter name: `m` is "mmm", not "em".
- Hold sounds you can hold (m, s, f, n, l, r, v, z) for about half a second.
- Keep quick sounds (b, d, g, k, p, t, c, j, h, w, y) very short, with no "uh" after them: "b", not "buh".
- Short vowels: a as in apple, e as in egg, i as in ink, o as in octopus, u as in umbrella.
- Record in a quiet room, trim the silence, keep each file under 100 KB.

Never put recordings of other people's voices here unless you have the right to use them.
