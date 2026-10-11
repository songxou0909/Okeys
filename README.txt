OKEYS — CHORD STUDIO

START
Double-click "Launch OKeys.vbs" for a standalone Edge/Chrome window, requesting fullscreen.
Use the Fullscreen button next to Shortcuts to enter/exit browser fullscreen.
For launcher/native fullscreen, F11 exits. Browser tabs cannot enter fullscreen
automatically on page load: browser security requires a user gesture.
The desktop layout fits the available window height, including the keyboard
and shortcut footer; narrow phone layouts scroll vertically.
The launcher uses the Python 3 already installed on this computer, with no
additional packages. Its tiny local server listens only on 127.0.0.1 and exits
about two minutes after the last app tab stops sending its heartbeat.

Alternatively, open index.html in Chrome or Edge for the chord explorer.
For the most reliable MIDI access, use the launcher (a localhost secure context).
Manual launch: python serve.py --open
Development: python serve.py --keep-alive

INSTRUMENT MODES
Choose Piano, Guitar, or Saxophone beside the OKeys logo.
Piano keeps the 88-key keyboard and opt-in MIDI input.
Guitar keeps the chord wheel, removes the bottom keyboard, and expands both
panels. The left panel shows a standard E A D G B E fretboard with black finger
dots, finger numbers, open/muted strings, fret position, and barres. Guitar
playback strums the displayed frets using a locally synthesized plucked string.
Each chord shows up to three selectable grids. Familiar open chords and conventional
E/A movable grips come before searched alternatives. Clicking a grid plays that
voicing; the note readout follows it. Shifted grids number their actual frets on
the left. Extended jazz grips may omit nonessential tones; each grid lists them.
The guitar panel includes Auto Sustain, Volume and Stop. Its volume slider stays synchronized
with the keyboard toolbar. Guitar chord levels are matched to the corresponding
piano chord using the first second of their audio, including bass and string count.
The open-chord teaching reference is JustinGuitar's beginner set:
https://www.justinguitar.com/classes/beginner-guitar-course-classic
Saxophone replaces the wheel with the supplied SVG fingering diagram. Its 42
keys run from C3 through F6, in the reference chart's order. Click/touch and hold
a key, or focus it and hold Space/Enter, to highlight the corresponding sax keys.
The fingering stays visible after release so you can inspect it. Playing multiple
keys or a sheet chord clears it until a new single note is pressed. D-sharp 4 is the reference's all-open
fingering. Primary fingerings are used; the four alternate diagrams are excluded.
On desktop, the saxophone panel is about half its previous width, leaving the
remaining space for the sheet-music viewer.
The synthesized sax tone sustains with gentle vibrato. With auto sustain off,
release fades over 120 ms; with auto sustain on, it fades over 1.5 seconds.
All three modes have a synchronized Auto Sustain control. Guitar and sax sounds
work offline.
MIDI disconnects in Guitar/Saxophone modes and reconnects on return to Piano.
Changing modes stops held notes, pending strums, and chord playback.

SHEET MUSIC
Open a PDF, TXT or image (PNG, JPG, WebP, GIF, BMP, AVIF) in the right panel,
or drop a file anywhere in OKeys. The close button unloads the current sheet.
Chrome/Edge exit fullscreen when opening the native file picker as a browser
security rule. OKeys does not request this exit. Use Fullscreen again afterward,
or drag and drop a file to load it without opening that picker.
Files are processed in your browser and are never uploaded. PDF, TXT, image
viewing and chord OCR work both through the launcher and when opening index.html
directly. Direct-file mode loads self-contained local worker bundles, including
PDF fonts and the OCR model, without requiring a server or browser permission changes.

Fit automatically adapts to the panel width, including when resizing the window.
Use - / + to zoom manually; click Fit to resume automatic fitting.
Tap Space to advance; double-tap within 260 ms to go back. Holding Space for
300 ms scrolls at the selected speed. Long pages advance one screenful with a
little overlap. Auto scroll uses the speed slider; holding Space
temporarily triples its speed. The slider ranges from 0 to 60 px/s in steps of 1,
defaulting to 5 px/s. Zero pauses movement. Fractional-pixel rendering keeps slow
scrolling continuous rather than stepping one pixel at a time. Scrolling stops at the bottom, on window blur,
when switching tabs, opening Shortcuts, or closing/replacing the file.
Space always controls the loaded sheet, including after clicking a chord or mode.

Detected chord labels use #98c379. Click a label to select its current root and
quality on the wheel and play it using the current instrument. Mute app sound
keeps this visual only. Slash bass notes are included in all three modes. Guitar
searches all 12 bass notes for every supported chord type and finds up to three
grips on demand: black positions form the base chord; green
(#98c379) positions add the requested lower bass. For A/E, black alone forms A;
adding the green low E forms A/E. Existing E notes in A stay black. Any slash
bass is supported by the search. For extended chords it can use compact voicings
that omit the natural fifth or lower extensions while retaining defining tones;
each grid lists its omissions. Search uses standard tuning, frets 0-15, up to
four fretting fingers, and at most a five-fret window. All 3,888 supported
root/type/bass combinations are regression-checked. These are generated grips;
comfort still depends on hand size and technique. Saxophone stays in Saxophone mode and plays sheet chords
with its selected sound, highlighting their notes on the keyboard. The left panel
does not switch fingerings during chord playback. One manually pressed keyboard
note selects its fingering; multiple keys do not replace it. Its highlight follows
that manual note, fading on release with or without auto sustain.
With auto sustain OFF, sheet notes/chords start on press, stay held until release,
then fade smoothly over 120 ms. With auto sustain ON, release the click to play
the existing 180 ms tap, followed by the instrument decay. Keyboard activation
uses Enter with the same behavior. Space stays assigned to scrolling. The wheel highlight fades with the
sound. Guitar grids remain available afterward to practice the selected shape.
Types outside the wheel's catalog select the root and show an explanatory message.
Key - / + transposes sheet labels by one semitone,
up to two octaves each way; Original resets them. Slash-chord bass notes also
transpose. Lyrics, notation, key/capo headings and source files stay unchanged.
TXT preserves chord spacing and accepts UTF-8, BOM-marked UTF-16, and a Big5
fallback for older Chinese charts. Chord-only rows and [Chord] lyric markup are
recognized; isolated letters in ordinary prose are left alone.
PDFs use embedded text where available. Images and textless PDF pages use local
English OCR for Latin chord names. OCR can miss or misread symbols: check the
green labels before transposing. Detached slash fragments no longer suppress other chords on the row.

Recognition is chord-only. Staff notes, numbered notation (jianpu), and octave
dots remain ordinary page content; there is no note-recognition toolbar.
Detached /F or /D labels play independent F or D major chords; the slash stays
printed outside the clickable note name. They never inherit a preceding chord.
Attached forms such as C#/F and G/D remain playable slash chords. Rhythm dashes,
including -C#/F, no longer cause an otherwise valid chord row to be skipped.

Password-protected PDFs need an unlocked copy. Files are limited to 100 MB;
large image/PDF rasters are bounded to keep browser memory use manageable.

PDF.js, Tesseract.js and the OCR model are bundled under app/vendor. No install
or internet connection is needed to use them. Third-party notices are in SHEET-LICENSES.txt and vendor
license files. Restart the Python server after updating serve.py so its PDF/OCR
content types and local worker policy take effect.

PLAY CHORDS
Drag any root note into a wheel sector and release to play. Releasing outside
the wheel cancels the gesture. You can also click a root, then a sector.
The inner ring contains 13 essentials; the outer ring has 13 extended/altered
chords. Major 13th is available with shortcut 5 (listed in Shortcuts).
Chords play for 2.5 seconds, or decay naturally with auto sustain on. Click/touch and hold the bottom piano for individual
notes. The 88 keys span A0 to C8; active keys use exactly #98c379.
Green dots above the piano keys identify the chord currently displayed in the
left panel, independently of the sounding keys. They follow previews, octave
changes, sheet slash basses and MIDI voicings, and clear when the label is empty.
Audio is prepared on the first interaction and resumed when returning to the
app. A silent analyser branch keeps Chrome/Edge's interactive output active
during idle periods without adding sound. Browser autoplay rules still require
an initial user gesture; device and operating-system wake-up times can vary.

COMPUTER KEYBOARD
Press A–G to select a natural root; press the same letter to clear it.
Shift toggles sharp. Tap Ctrl to toggle flat. The opposite accidental replaces the
current one; pressing the same accidental again restores the natural note.
Changing or clearing the root clears the accidental. There is no accidental
without a root. Shortcuts use physical QWERTY key positions (event.code).
Tab plays the next playable sheet chord, continuing after the last clicked chord.
Backtick (`) plays the previous playable sheet chord, including across pages.
At the first chord, or before selecting a chord, backtick does nothing.
Caps Lock replays the current sheet chord. The green frame marks that chord only.
At the end, or with no playable chords, Tab does nothing. Left/right arrows do
not change the last clicked mode or slider. Labels cannot be selected as text.
Ctrl combinations such as Ctrl+C do not alter the selected accidental.
Up/down arrows change octave (1–5, so all extensions fit on the 88-key piano).
Escape stops all sound and clears the root. Auto-repeat does not retrigger.

J major         K minor          L diminished       ; augmented
U sus2          I sus4           O 7sus4
6 sixth         H minor sixth
7 seventh       M minor seventh  P major seventh    Q diminished seventh
W half diminished  R 7-flat-5     T 7-sharp-5
9 ninth         N minor ninth    V major ninth      Y add9
[ 7-flat-9      ] 7-sharp-9
1 eleventh      2 minor eleventh
3 thirteenth    4 minor thirteenth
5 major thirteenth
The Shortcuts button shows this mapping inside the app.

MIDI + SUSTAIN
Plug in your MIDI keyboard, click Connect MIDI, and allow the browser's MIDI
permission. Choose the input device if you have more than one. Hot-plugging is
supported after permission is granted. No SysEx permission is requested.
Note-on, note-off, velocity, and sustain pedal CC64 (64+ = down) are supported.
Click Sustain to toggle auto sustain (on by default). Off follows CC64 as usual.
On lets released notes decay naturally, including individual on-screen keys.
When the incoming note completes a recognized chord among finger-held notes,
old released tails are damped before that note starts; held keys are preserved.
MIDI arrives one note at a time, so the first notes sound immediately and the
old tails clear as soon as the chord is recognizable. No input delay is added.
Single notes and non-chords do not clear the tails. MIDI devices/channels stay
independent. Wheel/shortcut chords clear previous app tails before starting.
Pedal changes are tracked during auto mode but do not override it. Turning auto
off returns to the current pedal state. Stop/Escape clears all notes while
leaving the selected sustain mode in place.
Pedals that send a different controller, or reverse their polarity, must be
configured on the hardware. All-notes-off / all-sound-off messages clear notes.
Changing or disconnecting the input clears its voices. Escape is also a panic
button. Pedal-held key highlights follow the sound envelope and disappear when
the note finishes; physically held keys remain solid green. MIDI keeps playing when you switch to another app while OKeys is open.

MUTE
"Mute app sound" changes to "MIDI sound only" when enabled. Chords and
on-screen piano touches still highlight the keys but make no sound. Existing
app voices are silenced immediately. MIDI sound and pedal continue normally.
Volume controls all audible output, including MIDI. The maximum output gain is
twice the previous maximum (five times the first version). Volume zero is
completely silent. A memoryless soft peak guard protects output from clipping
on loud chords; perceived loudness is not linear with gain. Muting is not saved
between sessions so each launch has a predictable starting state.

LATENCY AND SOUND
Grand piano is the default: 30 local Salamander recordings of a Yamaha C5 by
Alexander Holm, CC BY 3.0. See PIANO-LICENSE.txt for source and attribution.
The separate MIDI input menu (e.g. "Digital Piano") names your physical device;
the Piano sound menu selects Grand piano or the original Soft synth.
Samples are bundled as JavaScript data so direct file:// use also works offline.
They decode once at startup. While loading, Soft synth is immediately available;
the app switches to Grand piano when all samples are decoded. Playback uses
predecoded AudioBuffers, with at most two semitones of sample transposition.
Digital silence before the hammer transient is removed during startup analysis.
MIDI note-on starts the source immediately, before the next UI frame. No MIDI
buffer, timer, network download, look-ahead compressor, or convolution is in
the playback path. AudioContext requests interactive latency. The soft peak
guard has no look-ahead or oversampling. Sustain highlights follow the recording's
20 ms RMS envelope; held keys remain solid even after the recording ends.

REGISTER BALANCE
Recordings normalize their strongest 20 ms RMS window in the first 0.5 seconds
to 0.12, capped at 8x gain, while preserving MIDI velocity dynamics. Then each
note receives a partial inverse A-weighting correction relative to C4:
  f(n) = 440 * 2^((n-69)/12)
  R(f) = 12200^2*f^4 / ((f^2+20.6^2)*(f^2+12200^2)
                        *sqrt((f^2+107.7^2)*(f^2+737.9^2)))
  A(f) = 2 + 20*log10(R(f))
  correction_dB = clamp(0.55*(A(261.625565)-A(f(n))), -8, +12)
  gain = 10^(correction_dB/20)
This boosts bass and reduces treble, with bounded gain to avoid extreme boosts.
It is a practical mathematical balance, not a calibrated equal-loudness model:
piano harmonics, playback level, hearing and speaker bass response all matter.
A-weighting formula: https://www.cross-spectrum.com/audio/weighting.html

MIDI CHORD RECOGNITION
Only physically held MIDI notes drive recognition; pedal tails do not accumulate
into the next chord. Octave doubling and inversions are allowed. Pitch classes
must exactly match a catalog chord: no missing tones or added non-chord tones.
Ambiguous sets prefer a matching bass root, then catalog order. For example,
C-E-G-A can mean C6 or Am7; with C in the bass this app shows C6. No match leaves
the wheel unmarked. Detection never plays extra notes or changes your selected
computer-keyboard root. Releasing all MIDI keys restores the manual display.

Drivers, MIDI transport and audio hardware can add delay beyond the browser's
audio pipeline. Use wired speakers/headphones; Bluetooth audio is not
suitable for the lowest latency. Physical MIDI latency still needs verification
with your own keyboard and audio device.

REFERENCE
The 26 chord types and pitch content follow:
https://www.onlinepianist.com/piano-chords (checked 2026-10-10)
Full 13ths include the 11th, as on that reference. The retained maj13 extra uses
the original Okeys.html voicing without an 11th. Note names use theoretical
spelling (for example Cdim7 contains B-double-flat, sounding as A). The reference
occasionally mislabels interval degrees: sus4 is 1–4–5 and a natural 13th is 13,
not sharp 13. Pitch content is preserved while those degree labels are corrected.
The site is a catalog of 26 common types, not every possible chord.

Browser documentation:
https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API
https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/baseLatency
https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/outputLatency

DISTRIBUTION
Upload everything beside this README except the _local-only folder.
Keep the complete app folder, launcher, serve.py, and license notices together.
Node.js, npm, and a build step are not required to run this distribution.
The optional Windows launcher requires Python 3 and Chrome or Edge.
