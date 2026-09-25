// Background Service Worker for TTS Review AI Extension

const DEFAULT_MODEL = "gemini-3.8-flash";

// Gemini models that Google has retired for new API keys (they now return 404).
// Any saved setting pointing at one of these is remapped to the current default so
// existing users aren't stuck on a dead model after Google's model sunset.
const RETIRED_GEMINI_MODELS = [
  "gemini-2.5-flash", "gemini-2.5-pro",
  "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"
];
function resolveGeminiModel(m) {
  return (!m || RETIRED_GEMINI_MODELS.includes(m)) ? DEFAULT_MODEL : m;
}

const SYSTEM_PROMPT = `# SYSTEM PROMPT: Automated TTS Audio-Transcript & Emotion Tagging Reviewer

## Role & System Purpose
You are an expert Speech Audio Validator and Annotation Specialist. Your task is to process an audio clip and its system-generated transcript, perform verbatim audio validation and transcript cleanup, insert exact point-in-time event tags, and wrap the dialogue in the correct 19-emotion style span syntax based strictly on the provided guidelines.

### Mandatory Rules & Pointers:

1. Only First Speaker (Primary Speaker Only):
- Only First Speaker transcript to be added.
- Ignore secondary speakers, background chatter, overlapping talkers, or interjections from other people.

2. Numbers in Digit Form:
- All numbers must be transcribed in digit form. Examples: 2, 9, 23, 98, 101, etc.
- Never write out numbers as words (e.g. write "10" instead of "ten", "20" instead of "twenty").

3. Ordinal Numbers:
- Transcribed using the original number followed by the appropriate ordinal form. Examples: 1st, 22nd, 34th, 98th, etc.

4. Breath Events (Strict Update):
- Do NOT add a <|breath|> event under any circumstance.
- If the speaker takes a short/normal breath (small inhale or exhale), do NOT add any event.
- ONLY if the speaker takes a long and clearly noticeable breath, add the correct <|inhale|> or <|exhale|> event.

5. Hum Tone:
- Use the <|hum_tune|> event when the speaker produces sounds such as "hmm" or "hmm-hmm".

6. Letter-by-Letter Pronunciation:
- Words pronounced letter by letter should be enriched exactly as spoken with space separation. Example: h e a t.

7. Acronyms and Abbreviations:
- Acronyms and abbreviations must always be kept in UPPERCASE. Examples: ATM, CIBIL, PAN, UFC, USA, UK, FBI, CIA, KYC, GST, etc.

8. Nouns and Proper Nouns:
- Nouns and proper nouns must be enriched using Title/Sentence Case. Examples: Montreal Protocol, Los Angeles, Richard, New York, Verizon, etc.

9. Repeated Words:
- All repeated words must be transcribed exactly as heard in the audio. Do NOT delete, remove, or assume anything. Example: I think I think.

10. Stutters:
- Stutters must also be enriched exactly as heard in the audio. Example: d de decide.

11. Audio True to Itself (Verbatim Preservation):
- Keep misspeak, stutters, ungrammatical phrasing, and non-standard words exactly as pronounced by the speaker. Do NOT "fix" grammar if the speaker actually spoke it that way.

12. Contraction Cleanup & Casing:
- Fix broken ASR contractions (e.g., doesn t -> doesn't, it s -> it's, i m -> I'm, that s -> that's, haven t -> haven't, they re -> they're, won t -> won't).
- Capitalize sentence starts and isolated "I".
- Insert appropriate punctuation to match natural speech cadence.

13. Emotion Tagging Syntax & Taxonomy (19 Styles):
Wrap the dialogue in the style span:
<|style_open|>emotion_label<|style_body|>[Transcribed text including event tags]<|style_close|>

### Comprehensive 19 Emotion Reference & Distinction Guide (From Official Training Guide):
1. angry (or anger):
   - Definition: Speaker sounds very mad or upset. Voice may sound strong, sharp, or tense.
   - Listen for: Forceful or tense voice; sharp stress; clipped phrasing; raised intensity.
   - Do NOT confuse with: Annoyed (usually milder), Loud (only volume), Menacing (usually involves a threat).
2. annoyed:
   - Definition: Irritated or tired of something, but not strongly angry.
   - Listen for: Exasperated or flat tone; drawn-out words; sighing quality; restrained sharpness.
   - Do NOT confuse with: Anger (much stronger), Sarcastic (may mean opposite of words), Sad (unhappy, not irritated).
3. awe:
   - Definition: Amazed by something beautiful, impressive, or wonderful.
   - Listen for: Breathy or open tone; slower pace; widened pitch range; reverent emphasis.
   - Do NOT confuse with: Surprised (unexpected, but may not admire it), Joyful (happy, but not necessarily amazed), Excited (more energy and eagerness).
4. curious:
   - Definition: Wants to know, learn, or understand something.
   - Listen for: Questioning intonation; attentive energy; upward inflection; inviting pace.
   - Do NOT confuse with: Thoughtful (thinking carefully, not looking for an answer), Surprised (reaction to unexpected), Nervous (worried, not interested).
5. excited:
   - Definition: Very eager, happy, and full of energy.
   - Listen for: Faster pace; higher pitch; lively rhythm; strong positive emphasis.
   - Do NOT confuse with: Joyful (happy, but may sound calmer), Surprised (sudden reaction), Loud (only about volume).
6. fearful:
   - Definition: Afraid because something dangerous or bad may happen.
   - Listen for: Shaky or breathy voice; urgency; higher pitch; pauses, gasps, or strained delivery.
   - Do NOT confuse with: Nervous (worried, but there may be no clear danger), Surprised (unexpected, but may not be afraid), Whisper (only a quiet voice).
7. flirty:
   - Definition: Playful and shows romantic interest in someone.
   - Listen for: Teasing warmth; suggestive stress; playful rhythm; soft or inviting delivery.
   - Do NOT confuse with: Tender (gentle and caring, but may not be romantic), Mischievous (playfully causing trouble), Joyful (happy, but not romantic).
8. joyful:
   - Definition: Clearly happy, pleased, or delighted.
   - Listen for: Smiling voice; bright resonance; buoyant rhythm; warm positive energy.
   - Do NOT confuse with: Excited (more energy or eagerness), Smug (pleased with self/superior), Tender (soft and caring).
9. loud:
   - Definition: Talks at a high volume or sounds like shouting. (Emotion can be different).
   - Listen for: Strong amplitude and projection; voice carries forcefully; may sound shouted.
   - Do NOT confuse with: Anger (mad/upset), Excited (strong positive energy), Menacing (threatening).
10. menacing:
   - Definition: Threatening or dangerous, as if they may harm or scare someone.
   - Listen for: Controlled low tone; deliberate pacing; ominous stress; cold or restrained intensity.
   - Do NOT confuse with: Anger (mad, but may not be threatening), Loud (only volume), Smug (superior, but not threatening).
11. mischievously (or mischievous):
   - Definition: Playful or cheeky and may be planning harmless trouble.
   - Listen for: Conspiratorial or cheeky tone; playful stress; restrained amusement; knowing rhythm.
   - Do NOT confuse with: Menacing (may cause harm/threat), Flirty (shows romantic interest), Sarcastic (mocking/means opposite).
12. nervous:
   - Definition: Worried, unsure, or uncomfortable. Voice may shake or hesitate.
   - Listen for: Hesitations; uneven rhythm; tight or shaky pitch; rushed words or fillers.
   - Do NOT confuse with: Fearful (clear danger or strong fear), Whisper (only quiet voice).
13. sad:
   - Definition: Unhappy, hurt, disappointed, or low in energy.
   - Listen for: Lower energy; slower pace; softer volume; falling pitch; heavy or tearful quality.
   - Do NOT confuse with: Tender (gentle/caring), Nervous (worried/unsure), Whisper (only quiet voice).
14. sarcastic:
   - Definition: Mocking or means the opposite of the words they say.
   - Listen for: Exaggerated stress; dry or flat tone; stretched words; noticeable mismatch with wording.
   - Do NOT confuse with: Annoyed (directly shows irritation), Smug (pleased with self/superior), Mischievous (playful teasing, not necessarily mocking).
15. smug:
   - Definition: Very pleased with themselves and may feel better than others.
   - Listen for: Knowing tone; relaxed certainty; slight drawl; condescending or pleased emphasis.
   - Do NOT confuse with: Joyful (simple happiness without superiority), Sarcastic (mocking/opposite), Menacing (threatening).
16. surprised:
   - Definition: Reacts to something they did not expect.
   - Listen for: Sudden pitch jump; sharp onset; widened intensity; brief gasp or pause.
   - Do NOT confuse with: Awe (includes wonder/admiration), Excited (positive energy lasts longer), Fearful (afraid of danger).
17. tender:
   - Definition: Soft, gentle, caring, or loving.
   - Listen for: Soft warm tone; smooth pace; delicate emphasis; calm, intimate delivery.
   - Do NOT confuse with: Flirty (shows romantic interest), Sad (feels sorrow/unhappiness), Whisper (only quiet voice).
18. thoughtful:
   - Definition: Calm and is carefully thinking about something.
   - Listen for: Measured pace; intentional pauses; calm control; emphasis on key ideas.
   - Do NOT confuse with: Curious (wants an answer/information), Nervous (worried/unsure), Sad (unhappy/low).
19. whispers (or whisper):
   - Definition: Uses a very quiet, soft, and breathy voice.
   - Listen for: Breathy phonation; minimal vocal projection; close, soft delivery; reduced voicing.
   - Do NOT confuse with: Tender (gentle/caring emotion), Fearful (afraid), Nervous (worried/unsure).

Output Requirements:
Return a JSON object with EXACTLY the following keys:
{
  "corrected_transcript_clean": "Clean text with correct casing, digits, punctuation, and embedded event tags only",
  "emotion": "One of the exact 19 emotion labels",
  "tagged_transcript": "<|style_open|>emotion_label<|style_body|>[Complete transcript text with event tags]<|style_close|>",
  "review_notes": {
    "text_fixes": "Brief list of casing, contraction, number, or missing word fixes",
    "event_tags_inserted": ["list of tags inserted with timing/location"],
    "emotion_and_vocal_cues": "State chosen emotion tag, acoustic cues, and why close lookalikes were ruled out"
  }
}`;

// Listen for messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "ANALYZE_AUDIO") {
    handleAudioAnalysis(request.payload)
      .then(res => sendResponse({ success: true, data: res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep async channel open
  }

  if (request.action === "TEST_API_KEY") {
    testProviderConnection(request.provider, request.apiKey, request.model, request.customBaseUrl)
      .then(res => sendResponse({ success: true, data: res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.action === "FETCH_AUDIO_AS_BASE64") {
    fetchAudioAsBase64(request.url)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      if (command === "auto_review") {
        chrome.tabs.sendMessage(tabs[0].id, { action: "TRIGGER_AUTO_REVIEW" });
      } else if (command === "toggle_playback") {
        chrome.tabs.sendMessage(tabs[0].id, { action: "TOGGLE_PLAYBACK" });
      }
    }
  });
});

// Main router for analyzing audio + transcript across providers
async function handleAudioAnalysis(payload) {
  const { originalTranscript, audioSrc, audioBase64, mimeType } = payload;

  const storage = await chrome.storage.sync.get([
    "activeProvider",
    "geminiApiKey", "selectedModel",
    "openaiApiKey", "openaiModel",
    "groqApiKey", "groqModel",
    "openrouterApiKey", "openrouterModel",
    "customBaseUrl", "customApiKey", "customModel",
    "offlineMode"
  ]);

  const provider = storage.activeProvider || "gemini";

  if (storage.offlineMode) {
    return runOfflineHeuristic(originalTranscript);
  }

  // Preload audio base64 data if available
  let base64Data = audioBase64;
  let audioMime = mimeType || "audio/mp3";

  if (!base64Data && audioSrc) {
    try {
      const fetched = await fetchAudioAsBase64(audioSrc);
      base64Data = fetched.base64;
      audioMime = fetched.mimeType || "audio/mp3";
    } catch (e) {
      console.warn("Could not fetch audio binary via background:", e);
    }
  }

  const enrichedPayload = {
    ...payload,
    audioBase64: base64Data,
    mimeType: audioMime
  };

  switch (provider) {
    case "openai": {
      const key = storage.openaiApiKey?.trim();
      const model = storage.openaiModel || "gpt-4o-audio-preview";
      if (!key) return runOfflineHeuristic(originalTranscript);
      return handleOpenAIAnalysis(enrichedPayload, key, model);
    }
    case "groq": {
      const key = storage.groqApiKey?.trim();
      const model = storage.groqModel || "llama-3.3-70b-versatile";
      if (!key) return runOfflineHeuristic(originalTranscript);
      return handleGroqAnalysis(enrichedPayload, key, model);
    }
    case "openrouter": {
      const key = storage.openrouterApiKey?.trim();
      const model = storage.openrouterModel || "google/gemini-2.5-flash";
      if (!key) return runOfflineHeuristic(originalTranscript);
      return handleOpenRouterAnalysis(enrichedPayload, key, model);
    }
    case "custom": {
      const baseUrl = storage.customBaseUrl || "http://localhost:11434/v1";
      const key = storage.customApiKey || "";
      const model = storage.customModel || "llama3";
      return handleCustomAnalysis(enrichedPayload, baseUrl, key, model);
    }
    case "gemini":
    default: {
      const key = storage.geminiApiKey?.trim();
      const model = resolveGeminiModel(storage.selectedModel);
      if (!key) return runOfflineHeuristic(originalTranscript);
      return handleGeminiAnalysis(enrichedPayload, key, model);
    }
  }
}

// 1. Google Gemini Provider
async function handleGeminiAnalysis(payload, apiKey, model) {
  const { originalTranscript, audioBase64, mimeType } = payload;
  // Key is sent via the x-goog-api-key header (not the URL query string) so it works
  // with both legacy "AIzaSy..." keys and the new "AQ..." auth keys, and avoids leaking
  // the key through URL logs/scans per Google's API key best practices.
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const promptParts = [];

  if (audioBase64) {
    promptParts.push({
      inlineData: {
        mimeType: mimeType || "audio/mp3",
        data: audioBase64
      }
    });
  }

  promptParts.push({
    text: `${SYSTEM_PROMPT}

Original System Transcript:
"${originalTranscript || ""}"

Perform the full audio validation and transcript cleanup. Listen to the audio clip, enforce the exact rules (numbers in digits, ordinals, no breath tag, long breath only as inhale/exhale, uppercase acronyms, sentence case proper nouns, stutters/repeats preserved), select the best emotion from the 19 standard taxonomy, and output the required JSON.`
  });

  const requestBody = {
    contents: [{ parts: promptParts }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json"
    }
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let parsedErr = errorText;
    try {
      const jsonErr = JSON.parse(errorText);
      parsedErr = jsonErr.error?.message || errorText;
    } catch (_) {}
    throw new Error(`Gemini Error (${response.status}): ${parsedErr}`);
  }

  const jsonResult = await response.json();
  const rawContent = jsonResult.candidates?.[0]?.content?.parts?.[0]?.text;
  return parseAIOutput(rawContent, originalTranscript, `Gemini (${model})`);
}

// 2. OpenAI Provider (supports gpt-4o-audio-preview with audio input & standard GPT-4o)
async function handleOpenAIAnalysis(payload, apiKey, model) {
  const { originalTranscript, audioBase64, mimeType } = payload;
  const endpoint = "https://api.openai.com/v1/chat/completions";

  const isAudioModel = model.includes("audio");
  const messages = [
    { role: "system", content: SYSTEM_PROMPT }
  ];

  if (isAudioModel && audioBase64) {
    const audioFormat = (mimeType && mimeType.includes("wav")) ? "wav" : "mp3";
    messages.push({
      role: "user",
      content: [
        {
          type: "text",
          text: `Original System Transcript: "${originalTranscript || ""}". Perform full verbatim audio validation and 19-emotion style wrapping per guidelines. Output strict JSON.`
        },
        {
          type: "input_audio",
          input_audio: {
            data: audioBase64,
            format: audioFormat
          }
        }
      ]
    });
  } else {
    messages.push({
      role: "user",
      content: `Original System Transcript: "${originalTranscript || ""}". Enforce all transcription pointers (digits for numbers, ordinals, uppercase acronyms, sentence case proper nouns, stutters/repeats preserved) and wrap in 19-emotion style span. Output strict JSON.`
    });
  }

  const requestBody = {
    model: model,
    messages: messages,
    temperature: 0.1,
    response_format: { type: "json_object" }
  };

  if (isAudioModel && audioBase64) {
    requestBody.modalities = ["text"];
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    let msg = errorText;
    try {
      msg = JSON.parse(errorText).error?.message || errorText;
    } catch (_) {}
    throw new Error(`OpenAI Error (${response.status}): ${msg}`);
  }

  const jsonResult = await response.json();
  const rawContent = jsonResult.choices?.[0]?.message?.content;
  return parseAIOutput(rawContent, originalTranscript, `OpenAI (${model})`);
}

// 3. Groq Provider (Ultra-fast Whisper + Llama 3.3)
async function handleGroqAnalysis(payload, apiKey, model) {
  const { originalTranscript, audioBase64, mimeType } = payload;
  let audioTranscriptText = originalTranscript;

  // If audio is available, optionally transcribe with Groq Whisper Large v3
  if (audioBase64) {
    try {
      const binaryString = atob(audioBase64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const audioBlob = new Blob([bytes], { type: mimeType || "audio/mp3" });
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.mp3");
      formData.append("model", "whisper-large-v3");
      formData.append("response_format", "json");

      const whisperResp = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}` },
        body: formData
      });

      if (whisperResp.ok) {
        const whisperJson = await whisperResp.json();
        if (whisperJson.text) {
          audioTranscriptText = whisperJson.text;
        }
      }
    } catch (e) {
      console.warn("Groq Whisper transcription skipped:", e.message);
    }
  }

  // Format with Llama 3.3
  const endpoint = "https://api.groq.com/openai/v1/chat/completions";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Original ASR Transcript: "${originalTranscript || ""}".
Transcribed Audio: "${audioTranscriptText || ""}".
Apply verbatim validation, digit rules for numbers, proper nouns, contraction repairs, and wrap in 19-emotion style span. Output JSON.`
        }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    let msg = errorText;
    try {
      msg = JSON.parse(errorText).error?.message || errorText;
    } catch (_) {}
    throw new Error(`Groq Error (${response.status}): ${msg}`);
  }

  const jsonResult = await response.json();
  const rawContent = jsonResult.choices?.[0]?.message?.content;
  return parseAIOutput(rawContent, originalTranscript, `Groq (${model})`);
}

// 4. OpenRouter Provider
async function handleOpenRouterAnalysis(payload, apiKey, model) {
  const { originalTranscript } = payload;
  const endpoint = "https://openrouter.ai/api/v1/chat/completions";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://tts-review.sabi.com/",
      "X-Title": "TTS Review AI Copilot"
    },
    body: JSON.stringify({
      model: model || "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Original System Transcript: "${originalTranscript || ""}". Enforce all transcription pointers (digits for numbers, ordinals, uppercase acronyms, sentence case proper nouns) and wrap in 19-emotion style span. Output strict JSON.`
        }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    let msg = errorText;
    try {
      msg = JSON.parse(errorText).error?.message || errorText;
    } catch (_) {}
    throw new Error(`OpenRouter Error (${response.status}): ${msg}`);
  }

  const jsonResult = await response.json();
  const rawContent = jsonResult.choices?.[0]?.message?.content;
  return parseAIOutput(rawContent, originalTranscript, `OpenRouter (${model})`);
}

// 5. Custom / Local OpenAI-Compatible Provider (Ollama, LM Studio, vLLM)
async function handleCustomAnalysis(payload, baseUrl, apiKey, model) {
  const { originalTranscript } = payload;
  const cleanedUrl = baseUrl.replace(/\/+$/, "");
  const endpoint = cleanedUrl.endsWith("/chat/completions") ? cleanedUrl : `${cleanedUrl}/chat/completions`;

  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: headers,
    body: JSON.stringify({
      model: model || "llama3",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Original System Transcript: "${originalTranscript || ""}". Perform verbatim validation, convert numbers to digits, capitalize proper nouns/acronyms, and wrap in 19-emotion style span. Output JSON.`
        }
      ],
      temperature: 0.1,
      format: "json"
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Custom Endpoint Error (${response.status}): ${errorText}`);
  }

  const jsonResult = await response.json();
  const rawContent = jsonResult.choices?.[0]?.message?.content || jsonResult.message?.content;
  return parseAIOutput(rawContent, originalTranscript, `Custom (${model})`);
}

// General Parser for AI JSON output
function parseAIOutput(rawContent, originalTranscript, sourceName = "AI") {
  if (!rawContent) {
    throw new Error(`No content generated by ${sourceName}.`);
  }

  try {
    const parsedData = JSON.parse(rawContent);
    const emotion = parsedData.emotion?.toLowerCase() || "thoughtful";
    const cleanText = parsedData.corrected_transcript_clean || originalTranscript;
    const tagged = parsedData.tagged_transcript || `<|style_open|>${emotion}<|style_body|>${cleanText}<|style_close|>`;

    return {
      corrected_transcript_clean: cleanText,
      emotion: emotion,
      tagged_transcript: tagged,
      review_notes: parsedData.review_notes || {
        text_fixes: `Validated by ${sourceName}`,
        event_tags_inserted: [],
        emotion_and_vocal_cues: `Emotion: ${emotion}`
      },
      source: sourceName
    };
  } catch (err) {
    return parseUnstructuredOutput(rawContent, originalTranscript, sourceName);
  }
}



// Fallback rule-based heuristic when offline or no API key provided
function runOfflineHeuristic(originalText) {
  if (!originalText) {
    return {
      corrected_transcript_clean: "",
      emotion: "thoughtful",
      tagged_transcript: "<|style_open|>thoughtful<|style_body|><|style_close|>",
      review_notes: {
        text_fixes: "Empty input",
        event_tags_inserted: [],
        emotion_and_vocal_cues: "Default thoughtful (Heuristic Mode - Add Gemini API Key for audio listening)"
      },
      source: "heuristic"
    };
  }

  let text = originalText.trim();
  const fixes = [];

  // Fix broken contractions
  const contractionMap = [
    [/\bdoesn\s*t\b/gi, "doesn't"],
    [/\bit\s*s\b/gi, "it's"],
    [/\bi\s*m\b/gi, "I'm"],
    [/\bthat\s*s\b/gi, "that's"],
    [/\bhaven\s*t\b/gi, "haven't"],
    [/\bthey\s*re\b/gi, "they're"],
    [/\bwon\s*t\b/gi, "won't"],
    [/\bcan\s*t\b/gi, "can't"],
    [/\bdidn\s*t\b/gi, "didn't"],
    [/\bcouldn\s*t\b/gi, "couldn't"],
    [/\bwouldn\s*t\b/gi, "wouldn't"],
    [/\bisn\s*t\b/gi, "isn't"],
    [/\baren\s*t\b/gi, "aren't"],
    [/\bwe\s*re\b/gi, "we're"],
    [/\byou\s*re\b/gi, "you're"],
    [/\bwhat\s*s\b/gi, "what's"],
    [/\bthere\s*s\b/gi, "there's"],
    [/\bwho\s*s\b/gi, "who's"],
    [/\blet\s*s\b/gi, "let's"]
  ];

  for (const [pattern, replacement] of contractionMap) {
    if (pattern.test(text)) {
      text = text.replace(pattern, replacement);
      fixes.push(`Repaired contraction: ${replacement}`);
    }
  }

  // Capitalize isolated "i"
  if (/\bi\b/g.test(text)) {
    text = text.replace(/\bi\b/g, "I");
    fixes.push("Capitalized 'I'");
  }

  // Convert numbers to digits (Rule: All numbers must be transcribed in digit form)
  const numberWordMap = [
    [/\bzero\b/gi, "0"],
    [/\bone\b/gi, "1"],
    [/\btwo\b/gi, "2"],
    [/\bthree\b/gi, "3"],
    [/\bfour\b/gi, "4"],
    [/\bfive\b/gi, "5"],
    [/\bsix\b/gi, "6"],
    [/\bseven\b/gi, "7"],
    [/\beight\b/gi, "8"],
    [/\bnine\b/gi, "9"],
    [/\bten\b/gi, "10"],
    [/\beleven\b/gi, "11"],
    [/\btwelve\b/gi, "12"],
    [/\bthirteen\b/gi, "13"],
    [/\bfourteen\b/gi, "14"],
    [/\bfifteen\b/gi, "15"],
    [/\bsixteen\b/gi, "16"],
    [/\bseventeen\b/gi, "17"],
    [/\beighteen\b/gi, "18"],
    [/\bnineteen\b/gi, "19"],
    [/\btwenty\b/gi, "20"],
    [/\bthirty\b/gi, "30"],
    [/\bforty\b/gi, "40"],
    [/\bfifty\b/gi, "50"],
    [/\bsixty\b/gi, "60"],
    [/\bseventy\b/gi, "70"],
    [/\beighty\b/gi, "80"],
    [/\bninety\b/gi, "90"],
    [/\bhundred\b/gi, "100"]
  ];

  for (const [pattern, digit] of numberWordMap) {
    if (pattern.test(text)) {
      text = text.replace(pattern, digit);
      fixes.push(`Converted number to digit: ${digit}`);
    }
  }

  // Convert ordinals (Rule: Ordinal numbers must be transcribed using original number followed by ordinal form)
  const ordinalMap = [
    [/\bfirst\b/gi, "1st"],
    [/\bsecond\b/gi, "2nd"],
    [/\bthird\b/gi, "3rd"],
    [/\bfourth\b/gi, "4th"],
    [/\bfifth\b/gi, "5th"],
    [/\bsixth\b/gi, "6th"],
    [/\bseventh\b/gi, "7th"],
    [/\beighth\b/gi, "8th"],
    [/\bninth\b/gi, "9th"],
    [/\btenth\b/gi, "10th"],
    [/\btwentieth\b/gi, "20th"],
    [/\bthirtieth\b/gi, "30th"],
    [/\bhundredth\b/gi, "100th"]
  ];

  for (const [pattern, ord] of ordinalMap) {
    if (pattern.test(text)) {
      text = text.replace(pattern, ord);
      fixes.push(`Converted ordinal: ${ord}`);
    }
  }

  // Acronyms and Abbreviations (Rule: Always keep in UPPERCASE)
  const acronyms = [
    [/\batm\b/gi, "ATM"],
    [/\bcibil\b/gi, "CIBIL"],
    [/\bpan\b/gi, "PAN"],
    [/\bufc\b/gi, "UFC"],
    [/\busa\b/gi, "USA"],
    [/\buk\b/gi, "UK"],
    [/\bfbi\b/gi, "FBI"],
    [/\bcia\b/gi, "CIA"],
    [/\bkyc\b/gi, "KYC"],
    [/\bgst\b/gi, "GST"],
    [/\basr\b/gi, "ASR"],
    [/\btts\b/gi, "TTS"],
    [/\bai\b/gi, "AI"]
  ];

  for (const [pattern, acro] of acronyms) {
    if (pattern.test(text)) {
      text = text.replace(pattern, acro);
      fixes.push(`Capitalized acronym: ${acro}`);
    }
  }

  // Nouns and Proper Nouns (Rule: Must be enriched using Sentence/Title Case)
  const properNouns = [
    [/\bmontreal protocol\b/gi, "Montreal Protocol"],
    [/\blos angeles\b/gi, "Los Angeles"],
    [/\brichard\b/gi, "Richard"],
    [/\bnew york\b/gi, "New York"],
    [/\bverizon\b/gi, "Verizon"],
    [/\bkyiv independent\b/gi, "Kyiv Independent"],
    [/\bgoogle\b/gi, "Google"],
    [/\byoutube\b/gi, "YouTube"],
    [/\bapple\b/gi, "Apple"],
    [/\bfacebook\b/gi, "Facebook"],
    [/\bmeta\b/gi, "Meta"],
    [/\btwitter\b/gi, "Twitter"],
    [/\binstagram\b/gi, "Instagram"],
    [/\btiktok\b/gi, "TikTok"],
    [/\bnetflix\b/gi, "Netflix"],
    [/\bamazon\b/gi, "Amazon"],
    [/\bmicrosoft\b/gi, "Microsoft"],
    [/\bunited states\b/gi, "United States"]
  ];

  for (const [pattern, proper] of properNouns) {
    if (pattern.test(text)) {
      text = text.replace(pattern, proper);
      fixes.push(`Capitalized proper noun: ${proper}`);
    }
  }

  // Enforce rule: Do not add breath event (clean any rogue <|breath|>)
  if (/<\|breath\|>/gi.test(text)) {
    text = text.replace(/<\|breath\|>/gi, "");
    fixes.push("Removed disallowed breath tag");
  }

  // Standard sentence case start
  if (text.length > 0) {
    const firstChar = text.charAt(0);
    if (firstChar !== firstChar.toUpperCase()) {
      text = firstChar.toUpperCase() + text.slice(1);
      fixes.push("Capitalized first letter of sentence");
    }
  }

  // Ensure trailing punctuation if absent
  if (text.length > 0 && !/[.!?]$/.test(text)) {
    text = text + ".";
    fixes.push("Added ending period");
  }

  const emotion = "thoughtful";
  const taggedTranscript = `<|style_open|>${emotion}<|style_body|>${text}<|style_close|>`;

  return {
    corrected_transcript_clean: text,
    emotion: emotion,
    tagged_transcript: taggedTranscript,
    review_notes: {
      text_fixes: fixes.length ? fixes.join(", ") : "Standardized casing & punctuation",
      event_tags_inserted: [],
      emotion_and_vocal_cues: "Heuristic Mode: Thoughtful default. Add Gemini API key for true audio acoustic analysis."
    },
    source: "heuristic"
  };
}

// Helper to fetch audio as Base64 from background
async function fetchAudioAsBase64(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio: ${response.statusText}`);
  }
  const blob = await response.blob();
  const mimeType = blob.type || "audio/mp3";

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Data = reader.result.split(",")[1];
      resolve({ base64: base64Data, mimeType: mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Test connection for any provider
async function testProviderConnection(provider, apiKey, model, customBaseUrl) {
  switch (provider || "gemini") {
    case "gemini": {
      const m = resolveGeminiModel(model);
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`;
      const resp = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Respond with JSON: {"status": "OK"}' }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });
      if (!resp.ok) throw new Error(`Gemini: ${resp.status} ${await resp.text()}`);
      return true;
    }
    case "openai": {
      const resp = await fetch("https://api.openai.com/v1/models", {
        headers: { "Authorization": `Bearer ${apiKey}` }
      });
      if (!resp.ok) throw new Error(`OpenAI: ${resp.status} ${await resp.text()}`);
      return true;
    }
    case "groq": {
      const resp = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { "Authorization": `Bearer ${apiKey}` }
      });
      if (!resp.ok) throw new Error(`Groq: ${resp.status} ${await resp.text()}`);
      return true;
    }
    case "openrouter": {
      const resp = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { "Authorization": `Bearer ${apiKey}` }
      });
      if (!resp.ok) throw new Error(`OpenRouter: ${resp.status} ${await resp.text()}`);
      return true;
    }
    case "custom": {
      const base = (customBaseUrl || "http://localhost:11434/v1").replace(/\/+$/, "");
      const endpoint = base.endsWith("/models") ? base : `${base}/models`;
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
      const resp = await fetch(endpoint, { headers });
      if (!resp.ok) throw new Error(`Custom: ${resp.status} ${await resp.text()}`);
      return true;
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// Fallback regex parser if AI produces non-JSON text
function parseUnstructuredOutput(rawText, originalTranscript, sourceName = "AI") {
  let emotion = "thoughtful";
  let taggedTranscript = "";
  let cleanTranscript = "";

  const styleMatch = rawText.match(/<\|style_open\|>([a-z_]+)<\|style_body\|>([\s\S]*?)<\|style_close\|>/i);
  if (styleMatch) {
    emotion = styleMatch[1].toLowerCase();
    taggedTranscript = styleMatch[0];
    cleanTranscript = styleMatch[2];
  } else {
    cleanTranscript = rawText.trim();
    taggedTranscript = `<|style_open|>${emotion}<|style_body|>${cleanTranscript}<|style_close|>`;
  }

  return {
    corrected_transcript_clean: cleanTranscript || originalTranscript,
    emotion: emotion,
    tagged_transcript: taggedTranscript,
    review_notes: {
      text_fixes: "Parsed from unstructured response",
      event_tags_inserted: [],
      emotion_and_vocal_cues: `Emotion: ${emotion}`
    },
    source: sourceName
  };
}
