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

RECORD YOUR PLAYING
Click Record in the header, play your MIDI keyboard, then click Stop recording.
An elapsed timer shows when recording is active. Listen to the finished take,
then click Download WAV to save it. Last take reopens the preview/download.
The recording includes the final OKeys sound: MIDI velocity, sustain, instrument,
volume, and any audible on-screen or sheet chords. Mute app sound if you want
only MIDI. This records no microphone or external keyboard audio.
Wait for the last note to decay before stopping if you want its complete tail.

Export is uncompressed stereo 24-bit PCM WAV at the audio engine's actual sample
rate (usually 44.1 or 48 kHz). There is no additional lossy encoding or upsampling
for export. The bundled piano sources are 44.1 kHz stereo variable-bitrate MP3s;
24-bit WAV preserves the processed mix but cannot restore missing source detail.
Higher bitrate does not itself add saturation or improve the piano samples.
Recording runs on a separate audio branch without buffering live playback.

Takes stop automatically at 15 minutes or 256 MiB of PCM, whichever comes first.
Download each take before making another or closing/reloading the app; recordings
are held in this tab, not automatically saved to disk. Audio interruption ends
the take and preserves the captured portion. No upload or microphone permission
is needed. Use a recent Chrome/Edge, with the launcher or index.html directly.
Restart an already-running launcher server after this update for recording and
preview to use its updated local content policy.
