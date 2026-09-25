# TTS Review AI Auto-Validator & Emotion Tagger (Chrome Extension)

An enterprise-grade Google Chrome Extension designed specifically for **https://tts-review.sabi.com/** to automate verbatim audio validation, transcript cleanup, non-speech event tag insertion, and 19-emotion style wrapping.

---

## 🌟 Key Features

1. **Direct Portal Integration (`tts-review.sabi.com`)**:
   - Injects an **"✨ AI Auto-Validate (Alt+A)"** button right above the **Corrected Transcript** textarea.
   - Adds a floating **TTS Review Copilot** panel with real-time vocal cue insights, review notes, emotion pills, and event tag quick-buttons.
   - **React/Vue-Compatible**: Uses native property setters and dispatches `input` / `change` events so your changes are immediately registered by the portal's state management.

2. **Multimodal Audio AI (Google Gemini 2.5 / 2.0 / 1.5 Flash)**:
   - Fetches the audio clip from the page and passes it directly to Gemini's native audio model.
   - Listens to the speaker's vocal tone, pitch, pace, pauses, and acoustics to accurately select from the **19 standard emotions**.
   - Accurately identifies point-in-time non-speech events (`<|laugh|>`, `<|chuckle|>`, `<|sigh|>`, `<|throat_clear|>`, `<|lip_smack|>`, `<|um|>`, `<|uh|>`, `<|inhale|>`, `<|exhale|>`).
   - Adheres strictly to the **Breathing Rule**: normal background breaths are ignored; only heavy/noticeable breaths are tagged.

3. **Verbatim Preservation & Formatting Cleanups**:
   - Preserves speaker misspeaks, stutters, and ungrammatical phrasing (audio true to itself).
   - Automatically fixes broken ASR contractions (`doesn t` &rarr; `doesn't`, `it s` &rarr; `it's`, `i m` &rarr; `I'm`, `that s` &rarr; `that's`, `haven t` &rarr; `haven't`, `they re` &rarr; `they're`, `won t` &rarr; `won't`).
   - Capitalizes "I", sentence starts, and proper nouns/acronyms (`Verizon`, `Kyiv Independent`, `UFC`, `Google`, etc.).

4. **Strict Transcription Pointers Enforced**:
   - **Numbers in Digits**: Always numeric digits (e.g. `2`, `9`, `10`, `23`, `101`, `10 dollar` instead of `ten dollar`).
   - **Ordinal Numbers**: Original number + ordinal suffix (e.g. `1st`, `2nd`, `22nd`, `34th`, `98th`).
   - **Breath Events**: Do NOT add a `<|breath|>` event. Only add `<|inhale|>` and `<|exhale|>` when clearly audible.
   - **Hum Tone**: Tag sounds like "hmm" or "hmm-hmm" with `<|hum_tune|>`.
   - **Letter-by-Letter**: Kept space-separated (e.g. `h e a t`).
   - **Acronyms & Abbreviations**: Always UPPERCASE (e.g. `ATM`, `CIBIL`, `PAN`, `UFC`, `USA`).
   - **Proper Nouns**: Title/Sentence Case (e.g. `Montreal Protocol`, `Los Angeles`, `Verizon`).
   - **Verbatim Stutters & Repeats**: Kept exactly as heard (e.g. `I think I think`, `d de decide`).
   - **Primary Speaker Only**: Only first speaker transcript is processed.

5. **Offline / Heuristic Mode**:
   - If no Gemini API key is configured, the extension automatically runs a local heuristic engine to clean contractions, casing, numbers to digits, and punctuation offline.

6. **19 Emotion Quick-Switch & Event Tags**:
   - Click any emotion button to instantly update the outer `<|style_open|>emotion<|style_body|>...<|style_close|>` tag.
   - Click any event tag to insert it directly at your current cursor position in the textarea.

---

## 📥 How to Install in Google Chrome

1. Open Google Chrome.
2. In the URL address bar, navigate to:
   ```text
   chrome://extensions
   ```
3. In the top-right corner, turn **ON** the **Developer mode** toggle switch.
4. In the top-left corner, click the **Load unpacked** button.
5. In the folder picker dialog, select the folder:
   ```text
   C:\Users\Vineela\Downloads\TTS
   ```
6. The extension **"TTS Review AI Auto-Validator & Emotion Tagger"** is now installed and active! Pin it to your Chrome toolbar for quick access.

---

## ⚙️ Configuration (Gemini API Key)

To enable native audio listening and vocal emotion detection:
1. Click the extension icon 🎙️ in the Chrome toolbar (or click the ⚙️ gear icon on the in-page Copilot widget).
2. Get a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
3. Paste your key into the **Gemini API Key** field.
4. Click **Test Connection** &rarr; you should see `✓ Connected!`.
5. Click **Save Settings**.

---

## 🚀 How to Use on `https://tts-review.sabi.com/`

1. Log into **https://tts-review.sabi.com/** and go to the **Review** tab.
2. When the review screen loads with an audio clip:
   - Click the **"✨ AI Auto-Validate"** button above the textarea (or press **`Alt + A`**).
   - The AI will fetch the audio, listen to the speaker, fix contractions/casing, insert event tags, and wrap the output with the detected emotion:
     ```text
     <|style_open|>thoughtful<|style_body|>For a ten-dollar pass, Verizon will pick this up here.<|style_close|>
     ```
3. Review the result in the **TTS Copilot** panel:
   - **Validation Insights**: shows why the emotion was chosen and what fixes were made.
   - **Quick Emotion Selector**: click any other emotion if you'd like to override the style tag.
   - **Insert Event**: click buttons like `laugh`, `inhale`, `um` to insert tags at your cursor.
4. Save/Submit your review on the portal!

---

## 🧪 Local Test Simulator Included

To test the extension offline without logging in:
1. Open your browser and navigate to:
   ```text
   http://localhost:8080/
   ```
   *(Or double-click `test-portal/index.html`)*
2. The simulator reproduces the exact layout, audio player, clip metadata, original transcript, and event/emotion buttons from `tts-review.sabi.com`.
3. Try clicking **"✨ AI Auto-Validate"** or pressing **`Alt + A`** to see it work live!

---

## ⌨️ Keyboard Shortcuts Reference

| Shortcut | Action |
| :--- | :--- |
| **`Alt + A`** | Run AI Auto-Review & Tag on current clip |
| **`Alt + P`** | Play / Pause audio playback |
