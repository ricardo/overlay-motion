# SFX Library

A curated library of sound effects for edit specs, on top of the core 20-cue
palette in `public/sfx/` (which is synthesized in-house and license-free).
Every sound here was checked for free commercial use. Credits below name the
author and source of each file; keep this page updated when adding sounds.

## How to use

Sound cues in an edit spec resolve to built-in names, arbitrary audio paths,
or URLs (see [Edit Spec v1](edit-spec.md), section Sound). Use library files
by path:

```json
{
  "sound": {
    "sounds": {
      "click": "/sfx/library/kenney-click-001.ogg",
      "impact": "/sfx/library/freesound-deep-cinematic-impact.mp3"
    }
  }
}
```

### Library cues

Four library files are wired as NAMED cues, because a template ships them as
the default of a sound prop and a default has to be a name, not a path
(`LIBRARY_CUES` in `src/sound/config.ts`):

| Cue | File | Used by |
|---|---|---|
| `quote-word` | `kenney-tick-001.ogg` | quote-card, once per revealed word |
| `word-settle` | `kenney-tick-001.ogg` | blur-focus-text, as each word focuses |
| `chat-typing` | `kenney-uiaudio-rollover2.ogg` | chat-bubbles, under the typing dots |
| `list-step` | `kenney-tick-001.ogg` | numbered and bullet step lists |

They behave like any other cue: swap one on a single overlay with the
template's prop (`"wordSfx": "ding"`), or remap it everywhere in scope with
`sounds: { "quote-word": "..." }`.

## Licenses at a glance

| License | Commercial use | Attribution | Bundled in this repo |
|---|---|---|---|
| CC0 1.0 Universal | Yes | Not required (we credit anyway) | Yes, in `public/sfx/library/` |
| Mixkit Sound Effects Free License | Yes | Not required | No. Forbids redistribution as part of a tool or template, so download from the linked page into your own project |
| Pixabay Content License | Yes | Not required | No, same reason: no standalone redistribution. Download from the linked page |

Rows marked CC0 ship in `public/sfx/library/` (see
[SOURCES.md](../public/sfx/library/SOURCES.md) for the per-file credit list).
Mixkit rows link straight to the official Mixkit CDN file: agents may fetch
those URLs programmatically at build time (do not mirror them). Pixabay rows
only link to the source page; Pixabay blocks non-browser clients, so a human
must download the file there before an agent can use it.

## Transitions and whooshes

| Sound | File | Duration | Source | Author | License |
|---|---|---|---|---|---|
| Air woosh | [`1489.wav`](https://assets.mixkit.co/active_storage/sfx/1489/1489.wav) | 2.3s | [Mixkit](https://mixkit.co/free-sound-effects/whoosh/) | Mixkit | Mixkit Free License |
| Simple Whoosh | [download](https://pixabay.com/sound-effects/film-special-effects-simple-whoosh-382724/) | 1s | [Pixabay](https://pixabay.com/sound-effects/film-special-effects-simple-whoosh-382724/) | DRAGON-STUDIO | Pixabay Content License |
| Whoosh Cinematic | [download](https://pixabay.com/sound-effects/film-special-effects-whoosh-cinematic-376875/) | 2s | [Pixabay](https://pixabay.com/sound-effects/film-special-effects-whoosh-cinematic-376875/) | DRAGON-STUDIO | Pixabay Content License |

## Risers and build-ups

| Sound | File | Duration | Source | Author | License |
|---|---|---|---|---|---|
| Cinematic trailer riser | [`790.wav`](https://assets.mixkit.co/active_storage/sfx/790/790.wav) | 2.6s | [Mixkit](https://mixkit.co/free-sound-effects/riser/) | Mixkit | Mixkit Free License |
| Cinematic Riser 03 | [download](https://pixabay.com/sound-effects/film-special-effects-cinematic-riser-03-414575/) | 4s | [Pixabay](https://pixabay.com/sound-effects/film-special-effects-cinematic-riser-03-414575/) | DRAGON-STUDIO | Pixabay Content License |
| Reverse Cymbal Swell 3 | [download](https://pixabay.com/sound-effects/film-special-effects-reverse-cymbal-swell-3-185073/) | 6s | [Pixabay](https://pixabay.com/sound-effects/film-special-effects-reverse-cymbal-swell-3-185073/) | floraphonic | Pixabay Content License |

## UI: clicks, switches, hover

| Sound | File | Duration | Source | Author | License |
|---|---|---|---|---|---|
| Click 001 | [`kenney-click-001.ogg`](../public/sfx/library/kenney-click-001.ogg) | 0.1s | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney | CC0 1.0 |
| Click 002 | [`kenney-click-002.ogg`](../public/sfx/library/kenney-click-002.ogg) | <0.1s | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney | CC0 1.0 |
| Switch 004 | [`kenney-switch-004.ogg`](../public/sfx/library/kenney-switch-004.ogg) | 0.5s | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney | CC0 1.0 |
| Tick 001 | [`kenney-tick-001.ogg`](../public/sfx/library/kenney-tick-001.ogg) | <0.1s | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney | CC0 1.0 |
| Drop 002 | [`kenney-drop-002.ogg`](../public/sfx/library/kenney-drop-002.ogg) | 0.2s | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney | CC0 1.0 |
| Pluck 001 | [`kenney-pluck-001.ogg`](../public/sfx/library/kenney-pluck-001.ogg) | 0.1s | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney | CC0 1.0 |
| Bong 001 | [`kenney-bong-001.ogg`](../public/sfx/library/kenney-bong-001.ogg) | 0.1s | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney | CC0 1.0 |
| Click 1 (UI Audio) | [`kenney-uiaudio-click1.ogg`](../public/sfx/library/kenney-uiaudio-click1.ogg) | 0.1s | [Kenney UI Audio](https://kenney.nl/assets/ui-audio) | Kenney | CC0 1.0 |
| Rollover 2 (hover) | [`kenney-uiaudio-rollover2.ogg`](../public/sfx/library/kenney-uiaudio-rollover2.ogg) | 0.1s | [Kenney UI Audio](https://kenney.nl/assets/ui-audio) | Kenney | CC0 1.0 |
| Switch 2 | [`kenney-uiaudio-switch2.ogg`](../public/sfx/library/kenney-uiaudio-switch2.ogg) | 0.3s | [Kenney UI Audio](https://kenney.nl/assets/ui-audio) | Kenney | CC0 1.0 |
| UI click | [`freesound-ui-click.mp3`](../public/sfx/library/freesound-ui-click.mp3) | 0.6s | [Freesound](https://freesound.org/people/Ranner/sounds/488534/) | Ranner | CC0 1.0 |
| Select click | [`1109.wav`](https://assets.mixkit.co/active_storage/sfx/1109/1109.wav) | 1.1s | [Mixkit](https://mixkit.co/free-sound-effects/click/) | Mixkit | Mixkit Free License |
| Interface Click | [download](https://pixabay.com/sound-effects/film-special-effects-interface-click-124476/) | 2s | [Pixabay](https://pixabay.com/sound-effects/film-special-effects-interface-click-124476/) | Universfield | Pixabay Content License |

## Pops

| Sound | File | Duration | Source | Author | License |
|---|---|---|---|---|---|
| Long pop | [`2358.wav`](https://assets.mixkit.co/active_storage/sfx/2358/2358.wav) | 0.5s | [Mixkit](https://mixkit.co/free-sound-effects/pop/) | Mixkit | Mixkit Free License |
| Bubble Pop 06 | [download](https://pixabay.com/sound-effects/film-special-effects-bubble-pop-06-351337/) | 1s | [Pixabay](https://pixabay.com/sound-effects/film-special-effects-bubble-pop-06-351337/) | Universfield | Pixabay Content License |

## Notifications, success, error

| Sound | File | Duration | Source | Author | License |
|---|---|---|---|---|---|
| Confirmation 001 (success) | [`kenney-confirmation-001.ogg`](../public/sfx/library/kenney-confirmation-001.ogg) | 0.3s | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney | CC0 1.0 |
| Confirmation 002 (success) | [`kenney-confirmation-002.ogg`](../public/sfx/library/kenney-confirmation-002.ogg) | 0.5s | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney | CC0 1.0 |
| Error 001 | [`kenney-error-001.ogg`](../public/sfx/library/kenney-error-001.ogg) | 0.2s | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney | CC0 1.0 |
| Error 004 | [`kenney-error-004.ogg`](../public/sfx/library/kenney-error-004.ogg) | 0.1s | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney | CC0 1.0 |
| Question 001 | [`kenney-question-001.ogg`](../public/sfx/library/kenney-question-001.ogg) | 0.5s | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney | CC0 1.0 |
| Message pop alert | [`2354.mp3`](https://assets.mixkit.co/active_storage/sfx/2354/2354.mp3) | 1.1s | [Mixkit](https://mixkit.co/free-sound-effects/message/) | Mixkit | Mixkit Free License |
| Fairy message notification | [`861.wav`](https://assets.mixkit.co/active_storage/sfx/861/861.wav) | 2.3s | [Mixkit](https://mixkit.co/free-sound-effects/message/) | Mixkit | Mixkit Free License |
| Achievement bell | [`600.wav`](https://assets.mixkit.co/active_storage/sfx/600/600.wav) | 2.4s | [Mixkit](https://mixkit.co/free-sound-effects/achievement/) | Mixkit | Mixkit Free License |
| Game level completed | [`2059.wav`](https://assets.mixkit.co/active_storage/sfx/2059/2059.wav) | 3.5s | [Mixkit](https://mixkit.co/free-sound-effects/game/) | Mixkit | Mixkit Free License |
| Wrong answer bass buzzer | [`948.wav`](https://assets.mixkit.co/active_storage/sfx/948/948.wav) | 2.5s | [Mixkit](https://mixkit.co/free-sound-effects/error/) | Mixkit | Mixkit Free License |
| Chime notification | [`freesound-chime-notification.mp3`](../public/sfx/library/freesound-chime-notification.mp3) | 0.3s | [Freesound](https://freesound.org/people/Jofae/sounds/380482/) | Jofae | CC0 1.0 |
| New Notification 07 | [download](https://pixabay.com/sound-effects/film-special-effects-new-notification-07-210334/) | 2s | [Pixabay](https://pixabay.com/sound-effects/film-special-effects-new-notification-07-210334/) | Universfield | Pixabay Content License |
| Success Notification | [download](https://pixabay.com/sound-effects/film-special-effects-success-notification-132473/) | 2s | [Pixabay](https://pixabay.com/sound-effects/film-special-effects-success-notification-132473/) | Universfield | Pixabay Content License |
| Error Notification | [download](https://pixabay.com/sound-effects/film-special-effects-error-notification-352286/) | 1s | [Pixabay](https://pixabay.com/sound-effects/film-special-effects-error-notification-352286/) | Universfield | Pixabay Content License |

## Impacts, booms, braams

| Sound | File | Duration | Source | Author | License |
|---|---|---|---|---|---|
| Impact metal medium | [`kenney-impact-metal.ogg`](../public/sfx/library/kenney-impact-metal.ogg) | 0.3s | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | Kenney | CC0 1.0 |
| Impact wood medium | [`kenney-impact-wood.ogg`](../public/sfx/library/kenney-impact-wood.ogg) | 0.3s | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | Kenney | CC0 1.0 |
| Impact glass medium | [`kenney-impact-glass.ogg`](../public/sfx/library/kenney-impact-glass.ogg) | 0.5s | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | Kenney | CC0 1.0 |
| Impact punch heavy | [`kenney-impact-punch.ogg`](../public/sfx/library/kenney-impact-punch.ogg) | 0.6s | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | Kenney | CC0 1.0 |
| Impact bell heavy | [`kenney-impact-bell.ogg`](../public/sfx/library/kenney-impact-bell.ogg) | 1.5s | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | Kenney | CC0 1.0 |
| Impact soft heavy (thud) | [`kenney-impact-soft.ogg`](../public/sfx/library/kenney-impact-soft.ogg) | 0.5s | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | Kenney | CC0 1.0 |
| Impact plate medium | [`kenney-impact-plate.ogg`](../public/sfx/library/kenney-impact-plate.ogg) | 0.6s | [Kenney Impact Sounds](https://kenney.nl/assets/impact-sounds) | Kenney | CC0 1.0 |
| Big cinematic impact | [`788.mp3`](https://assets.mixkit.co/active_storage/sfx/788/788.mp3) | 7.9s | [Mixkit](https://mixkit.co/free-sound-effects/impact/) | Mixkit | Mixkit Free License |
| Movie trailer epic impact | [`2908.wav`](https://assets.mixkit.co/active_storage/sfx/2908/2908.wav) | 4.9s | [Mixkit](https://mixkit.co/free-sound-effects/impact/) | Mixkit | Mixkit Free License |
| Futuristic bass hit (drop) | [`2303.wav`](https://assets.mixkit.co/active_storage/sfx/2303/2303.wav) | 2.8s | [Mixkit](https://mixkit.co/free-sound-effects/bass/) | Mixkit | Mixkit Free License |
| Deep cinematic impact | [`freesound-deep-cinematic-impact.mp3`](../public/sfx/library/freesound-deep-cinematic-impact.mp3) | 6.8s | [Freesound](https://freesound.org/people/zazz.sound.design/sounds/754424/) | zazz.sound.design | CC0 1.0 |
| Braam | [`freesound-braam.mp3`](../public/sfx/library/freesound-braam.mp3) | 10s | [Freesound](https://freesound.org/people/unfa/sounds/647712/) | unfa | CC0 1.0 |
| Cinematic Impact Boom 05 | [download](https://pixabay.com/sound-effects/film-special-effects-cinematic-impact-boom-05-352465/) | 2s | [Pixabay](https://pixabay.com/sound-effects/film-special-effects-cinematic-impact-boom-05-352465/) | Universfield | Pixabay Content License |
| Bass Drop | [download](https://pixabay.com/sound-effects/musical-bass-drop-390291/) | 1s | [Pixabay](https://pixabay.com/sound-effects/musical-bass-drop-390291/) | DRAGON-STUDIO | Pixabay Content License |

## Tech: beeps, glitch, power

| Sound | File | Duration | Source | Author | License |
|---|---|---|---|---|---|
| Glitch 001 | [`kenney-glitch-001.ogg`](../public/sfx/library/kenney-glitch-001.ogg) | <0.1s | [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) | Kenney | CC0 1.0 |
| Phaser up 1 | [`kenney-phaserup1.ogg`](../public/sfx/library/kenney-phaserup1.ogg) | 0.5s | [Kenney Digital Audio](https://kenney.nl/assets/digital-audio) | Kenney | CC0 1.0 |
| Low down (power off) | [`kenney-lowdown.ogg`](../public/sfx/library/kenney-lowdown.ogg) | 0.8s | [Kenney Digital Audio](https://kenney.nl/assets/digital-audio) | Kenney | CC0 1.0 |
| Glitch static | [`1457.wav`](https://assets.mixkit.co/active_storage/sfx/1457/1457.wav) | 1.4s | [Mixkit](https://mixkit.co/free-sound-effects/glitch/) | Mixkit | Mixkit Free License |
| Positive interface beep | [`221.wav`](https://assets.mixkit.co/active_storage/sfx/221/221.wav) | 0.6s | [Mixkit](https://mixkit.co/free-sound-effects/beep/) | Mixkit | Mixkit Free License |
| Glitch sfx | [download](https://pixabay.com/sound-effects/film-special-effects-glitch-sfx-312910/) | 2s | [Pixabay](https://pixabay.com/sound-effects/film-special-effects-glitch-sfx-312910/) | Kave_msri | Pixabay Content License |

## Money and games

| Sound | File | Duration | Source | Author | License |
|---|---|---|---|---|---|
| Chips collide 1 | [`kenney-chips-collide.ogg`](../public/sfx/library/kenney-chips-collide.ogg) | 0.3s | [Kenney Casino Audio](https://kenney.nl/assets/casino-audio) | Kenney | CC0 1.0 |
| Chips stack 1 | [`kenney-chips-stack.ogg`](../public/sfx/library/kenney-chips-stack.ogg) | 0.3s | [Kenney Casino Audio](https://kenney.nl/assets/casino-audio) | Kenney | CC0 1.0 |
| Chip lay 1 | [`kenney-chip-lay.ogg`](../public/sfx/library/kenney-chip-lay.ogg) | 0.2s | [Kenney Casino Audio](https://kenney.nl/assets/casino-audio) | Kenney | CC0 1.0 |
| Card slide 1 | [`kenney-card-slide.ogg`](../public/sfx/library/kenney-card-slide.ogg) | 0.6s | [Kenney Casino Audio](https://kenney.nl/assets/casino-audio) | Kenney | CC0 1.0 |
| Dice throw 1 | [`kenney-dice-throw.ogg`](../public/sfx/library/kenney-dice-throw.ogg) | 0.6s | [Kenney Casino Audio](https://kenney.nl/assets/casino-audio) | Kenney | CC0 1.0 |
| Clinking coins | [`1993.wav`](https://assets.mixkit.co/active_storage/sfx/1993/1993.wav) | 1s | [Mixkit](https://mixkit.co/free-sound-effects/coin/) | Mixkit | Mixkit Free License |
| Cash Register (Kaching) | [download](https://pixabay.com/sound-effects/film-special-effects-cash-register-kaching-sound-effect-125042/) | 3s | [Pixabay](https://pixabay.com/sound-effects/film-special-effects-cash-register-kaching-sound-effect-125042/) | Modestas123123 | Pixabay Content License |

## People: applause, snaps

| Sound | File | Duration | Source | Author | License |
|---|---|---|---|---|---|
| Applause (large hall) | [`oga-applause-church.wav`](../public/sfx/library/oga-applause-church.wav) | 39.1s | [OpenGameArt](https://opengameart.org/content/applause-in-a-large-hall-or-church) | eXpl0it3r | CC0 1.0 |
| Small group cheer and applause | [`518.wav`](https://assets.mixkit.co/active_storage/sfx/518/518.wav) | 10.6s | [Mixkit](https://mixkit.co/free-sound-effects/applause/) | Mixkit | Mixkit Free License |
| Concert applause | [`freesound-applause-concert.mp3`](../public/sfx/library/freesound-applause-concert.mp3) | 32.1s | [Freesound](https://freesound.org/people/thaighaudio/sounds/478415/) | thaighaudio | CC0 1.0 |
| Applause | [download](https://pixabay.com/sound-effects/people-applause-236785/) | 8s | [Pixabay](https://pixabay.com/sound-effects/people-applause-236785/) | Driken5482 | Pixabay Content License |
| Finger Snap | [download](https://pixabay.com/sound-effects/film-special-effects-finger-snap-sound-423220/) | 1s | [Pixabay](https://pixabay.com/sound-effects/film-special-effects-finger-snap-sound-423220/) | SoundReality | Pixabay Content License |

## Ambience loops

| Sound | File | Duration | Source | Author | License |
|---|---|---|---|---|---|
| Rain on window (loop) | [`oga-rain-window.wav`](../public/sfx/library/oga-rain-window.wav) | 10.9s | [OpenGameArt](https://opengameart.org/content/rain-on-window-loop) | alxl | CC0 1.0 |
| Forest ambience (loop) | [`oga-forest.mp3`](../public/sfx/library/oga-forest.mp3) | 44.7s | [OpenGameArt](https://opengameart.org/content/forest-ambience) | TinyWorlds | CC0 1.0 |
| Sci-fi city (loop) | [`oga-scifi-city.mp3`](../public/sfx/library/oga-scifi-city.mp3) | 29.4s | [OpenGameArt](https://opengameart.org/content/scifi-city-ambient-loop) | TinyWorlds | CC0 1.0 |
| Ambient loop 01 (rubberduck) | [`oga-loop-ambient1.ogg`](../public/sfx/library/oga-loop-ambient1.ogg) | 8.2s | [OpenGameArt](https://opengameart.org/content/30-cc0-sfx-loops) | rubberduck | CC0 1.0 |
| Office ambience | [`447.wav`](https://assets.mixkit.co/active_storage/sfx/447/447.wav) | 42.1s | [Mixkit](https://mixkit.co/free-sound-effects/office/) | Mixkit | Mixkit Free License |
| City traffic ambience | [`2930.wav`](https://assets.mixkit.co/active_storage/sfx/2930/2930.wav) | 1m 7s | [Mixkit](https://mixkit.co/free-sound-effects/city/) | Mixkit | Mixkit Free License |
| Light rain loop | [`2393.wav`](https://assets.mixkit.co/active_storage/sfx/2393/2393.wav) | 15s | [Mixkit](https://mixkit.co/free-sound-effects/rain/) | Mixkit | Mixkit Free License |
| Morning birds | [`2472.wav`](https://assets.mixkit.co/active_storage/sfx/2472/2472.wav) | 3m 30s | [Mixkit](https://mixkit.co/free-sound-effects/nature/) | Mixkit | Mixkit Free License |
| Cafe ambience | [`freesound-ambience-cafe.mp3`](../public/sfx/library/freesound-ambience-cafe.mp3) | 6m 20s | [Freesound](https://freesound.org/people/samyi/sounds/382314/) | samyi | CC0 1.0 |
| Forest bird | [`freesound-forest-bird.mp3`](../public/sfx/library/freesound-forest-bird.mp3) | 34.6s | [Freesound](https://freesound.org/people/sama66/sounds/462137/) | sama66 | CC0 1.0 |
| Birds Forest Nature | [download](https://pixabay.com/sound-effects/nature-birds-forest-nature-445379/) | 1m 49s | [Pixabay](https://pixabay.com/sound-effects/nature-birds-forest-nature-445379/) | SoundReality | Pixabay Content License |

## Cartoon and magic

| Sound | File | Duration | Source | Author | License |
|---|---|---|---|---|---|
| Fairy magic sparkle | [`871.wav`](https://assets.mixkit.co/active_storage/sfx/871/871.wav) | 1.3s | [Mixkit](https://mixkit.co/free-sound-effects/magic/) | Mixkit | Mixkit Free License |

## Paper and pages

| Sound | File | Duration | Source | Author | License |
|---|---|---|---|---|---|
| Book page flip 2 | [`oga-book-flip.ogg`](../public/sfx/library/oga-book-flip.ogg) | 1.1s | [OpenGameArt](https://opengameart.org/content/10-book-page-flips) | StarNinjas | CC0 1.0 |
| Book page flip 5 | [`oga-book-flip5.ogg`](../public/sfx/library/oga-book-flip5.ogg) | 0.9s | [OpenGameArt](https://opengameart.org/content/10-book-page-flips) | StarNinjas | CC0 1.0 |
| Page turn single | [`1104.wav`](https://assets.mixkit.co/active_storage/sfx/1104/1104.wav) | 0.5s | [Mixkit](https://mixkit.co/free-sound-effects/page-turn/) | Mixkit | Mixkit Free License |

## Camera

| Sound | File | Duration | Source | Author | License |
|---|---|---|---|---|---|
| Camera shutter click | [`1133.wav`](https://assets.mixkit.co/active_storage/sfx/1133/1133.wav) | 0.4s | [Mixkit](https://mixkit.co/free-sound-effects/camera/) | Mixkit | Mixkit Free License |

## Keyboard

| Sound | File | Duration | Source | Author | License |
|---|---|---|---|---|---|
| Keyboard typing | [`1386.wav`](https://assets.mixkit.co/active_storage/sfx/1386/1386.wav) | 26.3s | [Mixkit](https://mixkit.co/free-sound-effects/keyboard/) | Mixkit | Mixkit Free License |

## Stings and jingles

| Sound | File | Duration | Source | Author | License |
|---|---|---|---|---|---|
| Jingle Pizzicato 00 | [`kenney-jingle-pizzi00.ogg`](../public/sfx/library/kenney-jingle-pizzi00.ogg) | 0.5s | [Kenney Music Jingles](https://kenney.nl/assets/music-jingles) | Kenney | CC0 1.0 |
| Jingle Pizzicato 07 | [`kenney-jingle-pizzi07.ogg`](../public/sfx/library/kenney-jingle-pizzi07.ogg) | 1.3s | [Kenney Music Jingles](https://kenney.nl/assets/music-jingles) | Kenney | CC0 1.0 |
| Jingle Steel 00 | [`kenney-jingle-steel00.ogg`](../public/sfx/library/kenney-jingle-steel00.ogg) | 0.9s | [Kenney Music Jingles](https://kenney.nl/assets/music-jingles) | Kenney | CC0 1.0 |
| Jingle Steel 07 | [`kenney-jingle-steel07.ogg`](../public/sfx/library/kenney-jingle-steel07.ogg) | 1.6s | [Kenney Music Jingles](https://kenney.nl/assets/music-jingles) | Kenney | CC0 1.0 |
| Jingle Sax 00 | [`kenney-jingle-sax00.ogg`](../public/sfx/library/kenney-jingle-sax00.ogg) | 0.4s | [Kenney Music Jingles](https://kenney.nl/assets/music-jingles) | Kenney | CC0 1.0 |
| Movie logo intro impact | [`2900.wav`](https://assets.mixkit.co/active_storage/sfx/2900/2900.wav) | 9s | [Mixkit](https://mixkit.co/free-sound-effects/logo/) | Mixkit | Mixkit Free License |
| Transition (hit + whoosh) | [`freesound-transition-hit.mp3`](../public/sfx/library/freesound-transition-hit.mp3) | 4s | [Freesound](https://freesound.org/people/xkeril/sounds/736852/) | xkeril | CC0 1.0 |
| Logo Reveal | [download](https://pixabay.com/sound-effects/film-special-effects-logo-reveal-199582/) | 3s | [Pixabay](https://pixabay.com/sound-effects/film-special-effects-logo-reveal-199582/) | Universfield | Pixabay Content License |
