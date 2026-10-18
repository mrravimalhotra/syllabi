# Recorded letter sounds (optional)

The kindergarten activities say each letter's sound. A speech voice can only
approximate a pure sound, so if a file exists here the app plays it instead.

Add one audio file per letter, named by the letter, in `.mp3` format:

```
m.mp3   a.mp3   s.mp3   t.mp3   p.mp3   i.mp3   n.mp3 ...  (a to z)
```

Tips for recording (your own voice is best):

- Say the SOUND, not the letter name: `m` is "mmm", not "em".
- Hold sounds you can hold (m, s, f, n, l, r, v, z) for about a second.
- Keep quick sounds (b, d, g, k, p, t, c, j, h, w, y) very short, with no "uh" after them: "b", not "buh".
- Short vowels: a as in apple, e as in egg, i as in ink, o as in octopus, u as in umbrella.
- Record in a quiet room, trim the silence, keep each file under 100 KB.

The app checks for `/sounds/<letter>.mp3` and falls back to its speech voice for
any letter without a file. Never put recordings of other people's voices here
unless you have the right to use them.
