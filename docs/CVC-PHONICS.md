# CVC phonics module: what comes from the roadmap, and what does not

Source: "CVC Phonics Engine: Architecture & Technical Implementation Roadmap" (owner's document, 2026-10-24).

## Adopted

| Roadmap | In Syllabi |
|---|---|
| 120 essential CVC words by vowel and word family (section 4) | `CVC_WORDS` in `src/lib/kindergarten/words.ts` now holds 141 words: the roadmap's words plus the school's own list (pod, keg, sin...). "gun" and "rob" were left out for young children. Each word has a picture only when one picture shows it clearly; no two words share a picture. |
| Word families (-at, -ap, -et, -in, -op, -ug...; phase 4) | `familiesOf` / `rimeOf`; Practice → Kindergarten → Spell the word has a **Word family** choice that narrows Spell the word, Listen and blend and Word explorer to one rhyming set. |
| Segment mode: tap a letter tile to hear its pure sound with a pop animation (section 7) | **Word explorer**: tiles with the sound written in IPA under each letter; the tapped tile pops and says its sound. |
| Blend mode: slide across the tiles, "ma..." then the whole word (section 7) | **Slide to blend** slider in Word explorer: step 1 joins the first two sounds, step 2 says the word. |
| No schwa: never "puh", "tuh", "muh"; continuous sounds held, stop sounds clipped (sections 1, 2.1) | Already how `phonics.ts` works (kinds `continuous` / `stop` / `vowel`, "quick: p, not puh"); unchanged. |
| Short vowel IPA (section 3.1) | `IPA` in `phonics.ts`: æ ɛ ɪ ʌ as in the roadmap. |
| Pre-rendered pure sounds made once with Google Cloud TTS (sections 1, 2, 5, 6) | `public/sounds/a.mp3` to `z.mp3`, made by `scripts/phonics/build_phonics_sprite.py`. Google says letter names or adds "uh" for any isolated spelling, so each sound is cut out of a real word that starts with it (m from "map", t from "tap", a from "at"), held sounds are slowed to about half a second, and each is set to the loudness a person gives it next to a vowel. z is Google's hiss mixed with the voice's low buzz, as Google says z unvoiced. The app plays these files; a grown-up's own recording still wins. |

## Not adopted, and why

- **Short o as /ɑ/** (American). Syllabi keeps **/ɒ/** (British: "octopus", "dog"), which is what Indian schools teach. Change `IPA.o` in `phonics.ts` if the school teaches the American sound.
- **Howler.js and one audio sprite.** The app plays one file per letter through its existing player; `assets/audio/phonics_sprite.mp3` (all clips in one file) is kept only for listening to the whole set.
- **Native (Expo / AVPlayer) playback.** Syllabi is a web app.
- **Onset-blend clips for 35 onsets.** The app makes the joined sound ("ma…") from the first two letters' sounds (`blendStart`).
