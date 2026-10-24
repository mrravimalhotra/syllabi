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

## Not adopted, and why

- **Short o as /ɑ/** (American). Syllabi keeps **/ɒ/** (British: "octopus", "dog"), which is what Indian schools teach. Change `IPA.o` in `phonics.ts` if the school teaches the American sound.
- **Pre-rendered audio sprite with Howler.js, built with Google Cloud TTS and FFmpeg** (sections 1, 2, 5, 6). Syllabi already keeps each spoken clip in R2 after the first time it is made (so repeats are instant), and a grown-up can record the letter sounds in their own voice (Practice → Kindergarten → Record the sounds), which is played instead of the speech voice. A bundled sprite would add a build step, a Google Cloud account and a second voice; it would also not be offline-first unless the service worker cached it. It stays an option: if the speech voice's sounds are not clean enough, generate the roadmap's clips once and ship them under `public/sounds/`.
- **Native (Expo / AVPlayer) playback.** Syllabi is a web app.
- **Onset-blend clips for 35 onsets.** The app makes the joined sound ("ma…") from the first two letters' sounds (`blendStart`).
