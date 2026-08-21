# Voice cleanup and background-noise removal

Read this when the request names noise, hum, room tone, echo, or asks to "clean
up the audio."

Treat noise removal as restoration, not mastering. The goal is to reduce
non-speech sound while preserving the speaker's tone, timing, breaths, consonants
and perceived volume. A cleaner signal must not become louder merely because its
noise floor fell.

## The local, open-source workflow

1. Preserve the original audio unchanged. Lock the source cuts, then export the
   exact cut-only audio as uncompressed PCM. Avoid unnecessary resampling;
   DeepFilterNet3 expects 48kHz.

   ```bash
   ffmpeg -i final-cut.mp4 -vn -ac 2 -ar 48000 -c:a pcm_s24le voice-source.wav
   ```

2. Select and record representative noise-only and speech windows before
   processing. Measure their mean or RMS level and peak level so the result can be
   compared against the same windows later.

3. Run a local open-source speech enhancer. DeepFilterNet3 is the proven default:

   ```bash
   deepFilter --pf --atten-lim 30 --output-dir enhanced voice-source.wav
   ```

   Record the package version, model or checkpoint, license, attenuation limit and
   post-filter setting. Treat 30dB as a tested upper bound, not a universal value;
   reduce it if speech becomes metallic, watery, phasey or over-processed.

4. Listen to the complete enhanced track before EQ or mastering. Reject clipped
   consonants, missing word tails, pumping, metallic or watery tone, exaggerated
   sibilance, damaged plosives, or speech removed during pauses. Do not use a hard
   noise gate by default.

5. Apply only conservative corrective filtering when needed. These frequencies are
   starting points, not mandatory values:

   ```bash
   ffmpeg -i enhanced/voice-source_DeepFilterNet3_pf.wav \
     -af 'highpass=f=70:p=2,lowpass=f=15500:p=2' \
     -ar 48000 -c:a pcm_s24le voice-clean.wav
   ```

6. Master loudness as a separate step. Measure first:

   ```bash
   ffmpeg -i voice-clean.wav -af 'ebur128=peak=true' -f null -
   ```

   Never apply a large fixed gain merely because denoising made the waveform
   quieter. A modest lift is allowed when it materially improves intelligibility;
   normally start between +1 and +3 LU relative to the source and confirm it by
   A/B listening. Unless the user or delivery platform specifies a target, use
   about -18 LUFS integrated as a conservative starting point for close-mic speech
   and prefer clear over loud or fatiguing. Keep final true peak at or below
   -1.5dBTP. Compression is optional; if needed, use a low ratio and level-match
   the before/after comparison so louder does not masquerade as cleaner.

7. Mux the exact processed voice master into the delivery. Do not add music,
   ambience or decorative sound unless requested.

8. Verify synchronization after processing and final encoding. Enhancement, delay
   compensation, AAC priming and container timing can introduce offsets. Correlate
   the decoded delivery audio against the voice master and target an absolute
   offset of 20ms or less. If timing changed, realign captions to the delivered
   audio.

## Required QA

- Keep the original audio immutable.
- Use only locally runnable open-source components when the user prohibits paid or
  closed tools.
- Record component, model, checkpoint and license provenance.
- Compare the same noise-only and speech windows before and after cleanup.
- A/B at matched perceived volume; judge cleanup independently from loudness.
- Report integrated loudness, loudness range, true peak and the gain change from
  the cleaned signal.
- Listen for artifacts across the full track, including pauses and word
  boundaries.
- Confirm that silence remains natural and no gate clips consonants or breaths.
- Decode the complete final stream and verify audio/video duration and sync.
- Disclose any unavoidable residual noise or processing artifact.

Field note: one edit reached approximately -16.1 LUFS integrated and -1.3dBFS
encoded peak. It was technically clean but the speaker judged the voice too loud.
Therefore -16 LUFS is not a safe universal default; use only a modest lift when it
improves clarity, and evaluate denoising success separately from delivery
loudness.
