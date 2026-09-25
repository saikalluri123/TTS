// Content Script for TTS Review AI Auto-Validator & Emotion Tagger

(function () {
  console.log("[TTS AI Reviewer] Content script initializing...");

  // Allowed 19 Emotions
  const EMOTIONS = [
    "angry", "annoyed", "awe", "curious", "excited",
    "fearful", "flirty", "joyful", "loud", "menacing",
    "mischievously", "nervous", "sad", "sarcastic", "smug",
    "surprised", "tender", "thoughtful", "whispers"
  ];

  // Allowed Non-Speech Event Tags
  const EVENT_TAGS = [
    "<|laugh|>", "<|chuckle|>", "<|giggle|>", "<|sigh|>", "<|sniff|>",
    "<|cough|>", "<|throat_clear|>", "<|lip_smack|>", "<|gulp|>", "<|gasp|>",
    "<|yawn|>", "<|snort|>", "<|cry|>", "<|woo|>", "<|hum_tune|>",
    "<|tsk|>", "<|um|>", "<|uh|>", "<|inhale|>", "<|exhale|>"
  ];

  let currentAnalysis = null;
  let isProcessing = false;
  let lastClipIdentifier = "";

  // Wait for page elements to mount
  function init() {
    setupInPageWidget();
    injectInlineQuickAction();
    observeClipChanges();
    listenToBackgroundMessages();
  }

  // --- Element Resolvers ---
  function getAudioElement() {
    return document.querySelector("audio");
  }

  function getCorrectedTextarea() {
    // Check specific class on live portal
    const specific = document.querySelector("textarea.te-input");
    if (specific) return specific;

    // Look for textarea in "Your Review" section or any primary textarea on page
    const textareas = document.querySelectorAll("textarea");
    if (textareas.length === 1) return textareas[0];
    
    // If multiple, find one preceded by "Corrected Transcript"
    for (const ta of textareas) {
      const parent = ta.closest(".review-panel, .your-review, div, section");
      if (parent && /Corrected Transcript/i.test(parent.textContent)) {
        return ta;
      }
    }
    return textareas[0] || null;
  }

  function getOriginalTranscript() {
    // Strategy 1: Find element containing header "Original Transcript"
    const allEls = document.querySelectorAll("h1, h2, h3, h4, h5, h6, div, p, span, label");
    for (const el of allEls) {
      if (el.textContent.trim() === "Original Transcript") {
        // Next element or child of parent
        let container = el.nextElementSibling;
        if (!container && el.parentElement) {
          container = el.parentElement.querySelector("div:not(:first-child), p, span");
        }
        if (container) {
          const txt = container.textContent.trim();
          if (txt && txt !== "Original Transcript") return txt;
        }
      }
    }

    // Strategy 2: Look for elements with class or data-testid containing "original" or "transcript"
    const candidate = document.querySelector(".original-transcript, [data-testid='original-transcript'], #original-transcript");
    if (candidate) return candidate.textContent.trim();

    return "";
  }

  function getClipMetadata() {
    const audio = getAudioElement();
    const clipEl = Array.from(document.querySelectorAll("h1, h2, h3, h4, div, span"))
      .find(el => el.textContent.includes("Clip:"));
    const clipId = clipEl ? clipEl.textContent.trim() : (audio?.src || "unknown_clip");
    return { clipId, audioSrc: audio?.currentSrc || audio?.src || "" };
  }

  // --- React / Vue Safe Value Setter ---
  function updateTextareaValue(textarea, newValue) {
    if (!textarea) return;
    
    // Use native prototype descriptor to bypass React 16+ setter interception
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value"
    )?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(textarea, newValue);
    } else {
      textarea.value = newValue;
    }

    // Dispatch standard events so frameworks re-render / recognize change
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // Insert event tag or text at cursor
  function insertAtCursor(textarea, textToInsert) {
    if (!textarea) return;
    textarea.focus();

    const startPos = textarea.selectionStart ?? textarea.value.length;
    const endPos = textarea.selectionEnd ?? textarea.value.length;
    const currentVal = textarea.value;

    const newVal = currentVal.substring(0, startPos) + textToInsert + currentVal.substring(endPos);
    updateTextareaValue(textarea, newVal);

    // Reposition cursor
    const newCursor = startPos + textToInsert.length;
    textarea.setSelectionRange(newCursor, newCursor);
  }

  // --- Auto-Review Execution ---
  async function runAutoReview() {
    if (isProcessing) return;
    const textarea = getCorrectedTextarea();
    const audio = getAudioElement();
    const originalText = getOriginalTranscript() || textarea?.value || "";

    if (!audio && !originalText) {
      showStatus("⚠️ No audio element or transcript found on page.", "error");
      return;
    }

    isProcessing = true;
    updateRunButtonState(true);
    showStatus("Fetching audio & analyzing voice with AI...", "working");

    try {
      const audioSrc = audio?.currentSrc || audio?.src || "";
      let audioBase64 = null;
      let mimeType = "audio/mp3";

      // Attempt to read audio data directly if possible (same-origin or blob)
      if (audioSrc) {
        try {
          const resp = await fetch(audioSrc);
          if (resp.ok) {
            const blob = await resp.blob();
            mimeType = blob.type || "audio/mp3";
            audioBase64 = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result.split(",")[1]);
              reader.readAsDataURL(blob);
            });
          }
        } catch (fetchErr) {
          console.log("[TTS AI Reviewer] Will fetch via background worker:", fetchErr.message);
        }
      }

      // Send analysis request to background service worker
      chrome.runtime.sendMessage(
        {
          action: "ANALYZE_AUDIO",
          payload: {
            originalTranscript: originalText,
            audioSrc: audioSrc,
            audioBase64: audioBase64,
            mimeType: mimeType
          }
        },
        (response) => {
          isProcessing = false;
          updateRunButtonState(false);

          if (!response || !response.success) {
            const err = response?.error || "Unknown analysis error";
            showStatus(`Error: ${err}`, "error");
            return;
          }

          const result = response.data;
          currentAnalysis = result;

          // Inject into textarea
          const modeTagged = document.getElementById("tts-ai-pref-tagged")?.checked ?? true;
          const textToSet = modeTagged ? result.tagged_transcript : result.corrected_transcript_clean;
          
          if (textarea) {
            updateTextareaValue(textarea, textToSet);
          }

          // Update UI Card
          renderReviewNotes(result);
          showStatus(
            result.source === "gemini-ai" 
              ? `✓ Validated by Gemini AI (${result.emotion})` 
              : `✓ Rule-based cleaned (${result.emotion}) [Add API Key for Audio AI]`,
            "active"
          );

          // Check if auto-play is requested
          const autoPlayPref = document.getElementById("tts-ai-pref-autoplay")?.checked;
          if (autoPlayPref && audio && audio.paused) {
            audio.play().catch(() => {});
          }
        }
      );
    } catch (err) {
      isProcessing = false;
      updateRunButtonState(false);
      showStatus(`Unexpected error: ${err.message}`, "error");
    }
  }

  // Replace or Wrap emotion on existing text in textarea
  function setEmotionSpan(emotion) {
    const textarea = getCorrectedTextarea();
    if (!textarea) return;

    let text = textarea.value.trim();
    // Check if already has style open/close
    const match = text.match(/<\|style_open\|>[a-z_]+<\|style_body\|>([\s\S]*?)<\|style_close\|>/i);
    
    let innerContent = text;
    if (match) {
      innerContent = match[1];
    } else {
      // Strip any loose tags
      innerContent = text
        .replace(/<\|style_open\|>[a-z_]+/gi, "")
        .replace(/<\|style_body\|>/gi, "")
        .replace(/<\|style_close\|>/gi, "")
        .trim();
    }

    const wrapped = `<|style_open|>${emotion}<|style_body|>${innerContent}<|style_close|>`;
    updateTextareaValue(textarea, wrapped);

    // Update UI badge
    const badge = document.getElementById("tts-ai-active-emotion-badge");
    if (badge) {
      badge.textContent = `★ ${emotion}`;
    }
    showStatus(`Emotion updated to '${emotion}'`, "active");
  }

  // --- Inline Button Injection ---
  function injectInlineQuickAction() {
    const textarea = getCorrectedTextarea();
    if (!textarea || document.getElementById("tts-ai-inline-bar")) return;

    const parent = textarea.parentElement;
    if (!parent) return;

    const bar = document.createElement("div");
    bar.id = "tts-ai-inline-bar";
    bar.className = "tts-ai-page-quickbar";
    bar.innerHTML = `
      <button type="button" class="tts-ai-inline-btn" id="tts-ai-inline-run-btn" title="Run AI Auto-Review (Alt+A)">
        <span>✨</span> AI Auto-Validate (Alt+A)
      </button>
      <button type="button" class="tts-ai-pill-btn" id="tts-ai-inline-toggle-style" title="Switch between Style Span and Clean Text">
        Toggle Style Wrap
      </button>
      <span style="font-size: 11px; color: #94a3b8; margin-left: auto;">TTS AI Copilot Ready</span>
    `;

    parent.insertBefore(bar, textarea);

    bar.querySelector("#tts-ai-inline-run-btn").addEventListener("click", (e) => {
      e.preventDefault();
      runAutoReview();
    });

    bar.querySelector("#tts-ai-inline-toggle-style").addEventListener("click", (e) => {
      e.preventDefault();
      toggleStyleWrap();
    });
  }

  function toggleStyleWrap() {
    const textarea = getCorrectedTextarea();
    if (!textarea) return;
    const text = textarea.value.trim();
    const match = text.match(/<\|style_open\|>([a-z_]+)<\|style_body\|>([\s\S]*?)<\|style_close\|>/i);

    if (match) {
      // Un-wrap to clean
      updateTextareaValue(textarea, match[2].trim());
      showStatus("Unwrapped: Clean text mode", "active");
    } else {
      // Wrap with current emotion or default thoughtful
      const emotion = currentAnalysis?.emotion || "thoughtful";
      updateTextareaValue(textarea, `<|style_open|>${emotion}<|style_body|>${text}<|style_close|>`);
      showStatus(`Wrapped with '${emotion}' style`, "active");
    }
  }

  // --- Floating Copilot Dock UI ---
  function setupInPageWidget() {
    if (document.getElementById("tts-ai-copilot-panel")) return;

    const panel = document.createElement("div");
    panel.id = "tts-ai-copilot-panel";
    panel.innerHTML = `
      <div class="tts-ai-header" id="tts-ai-header-drag">
        <div class="tts-ai-logo-group">
          <div class="tts-ai-badge-icon">🎙️</div>
          <div class="tts-ai-title">
            TTS Review Copilot
            <span class="tts-ai-version">AI Pro</span>
          </div>
        </div>
        <div class="tts-ai-controls">
          <button class="tts-ai-icon-btn" id="tts-ai-btn-guide" title="19-Emotion Training Guide & Lookalikes Reference">📖</button>
          <button class="tts-ai-icon-btn" id="tts-ai-btn-settings" title="Settings / API Key">⚙️</button>
          <button class="tts-ai-icon-btn" id="tts-ai-btn-minimize" title="Minimize / Expand">—</button>
        </div>
      </div>

      <div class="tts-ai-body">
        <!-- Main Actions -->
        <div class="tts-ai-action-row">
          <button class="tts-ai-btn-primary" id="tts-ai-run-btn">
            <span id="tts-ai-run-icon">✨</span>
            <span id="tts-ai-run-text">AI Auto-Review & Tag</span>
            <span style="font-size: 10px; opacity: 0.8; background: rgba(0,0,0,0.25); padding: 1px 5px; border-radius: 4px;">Alt+A</span>
          </button>
          <button class="tts-ai-btn-secondary" id="tts-ai-play-btn" title="Toggle Audio Playback (Alt+P)">
            ▶ / ⏸
          </button>
        </div>

        <!-- Status Banner -->
        <div class="tts-ai-status-banner">
          <div class="tts-ai-status-dot" id="tts-ai-status-indicator"></div>
          <span id="tts-ai-status-msg" style="flex:1;">Ready to validate current clip.</span>
        </div>

        <!-- Review Notes / Details Card -->
        <div class="tts-ai-notes-card" id="tts-ai-notes-container">
          <div class="tts-ai-notes-header">
            <span class="tts-ai-notes-title">Validation Insights</span>
            <span class="tts-ai-emotion-pill" id="tts-ai-active-emotion-badge">★ thoughtful</span>
          </div>

          <div class="tts-ai-note-row">
            <span class="tts-ai-note-label">Vocal Cues & Sentiment:</span>
            <span class="tts-ai-note-val" id="tts-ai-notes-cues">Click Auto-Review to analyze vocal tone & acoustic characteristics.</span>
          </div>

          <div class="tts-ai-note-row">
            <span class="tts-ai-note-label">Contractions & Verbatim Fixes:</span>
            <span class="tts-ai-note-val" id="tts-ai-notes-fixes">No modifications yet.</span>
          </div>

          <div class="tts-ai-note-row">
            <span class="tts-ai-note-label">Output Preview:</span>
            <div class="tts-ai-preview-box" id="tts-ai-preview-text">Awaiting validation...</div>
          </div>
        </div>

        <!-- Quick 19 Emotion Picker -->
        <div>
          <div class="tts-ai-subhead">Quick Emotion Selector (19 Styles)</div>
          <div class="tts-ai-pills-wrap" id="tts-ai-emotions-list"></div>
        </div>

        <!-- Quick Event Tag Inserter -->
        <div>
          <div class="tts-ai-subhead">Insert Event at Cursor</div>
          <div class="tts-ai-pills-wrap" id="tts-ai-events-list"></div>
        </div>

        <!-- Preferences & Toggles -->
        <div class="tts-ai-footer-row">
          <label class="tts-ai-toggle-label" title="Wrap text with <|style_open|>emotion<|style_body|>...<|style_close|>">
            <input type="checkbox" id="tts-ai-pref-tagged" checked>
            Style Span Mode
          </label>
          <label class="tts-ai-toggle-label" title="Automatically trigger AI when moving to next clip">
            <input type="checkbox" id="tts-ai-pref-autorun">
            Auto-Run on Next
          </label>
          <label class="tts-ai-toggle-label" title="Auto play clip after AI review">
            <input type="checkbox" id="tts-ai-pref-autoplay">
            Auto-Play
          </label>
        </div>
      </div>
    `;

    document.body.appendChild(panel);

    // Populate Emotion Buttons
    const emotionsList = panel.querySelector("#tts-ai-emotions-list");
    EMOTIONS.forEach(emo => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tts-ai-pill-btn emotion-pill";
      btn.textContent = emo;
      btn.addEventListener("click", () => setEmotionSpan(emo));
      emotionsList.appendChild(btn);
    });

    // Populate Event Buttons
    const eventsList = panel.querySelector("#tts-ai-events-list");
    EVENT_TAGS.forEach(tag => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tts-ai-pill-btn";
      btn.textContent = tag.replace(/<\||\|>/g, "");
      btn.title = `Insert ${tag} at cursor`;
      btn.addEventListener("click", () => {
        const ta = getCorrectedTextarea();
        insertAtCursor(ta, tag);
      });
      eventsList.appendChild(btn);
    });

    // Wire Buttons
    panel.querySelector("#tts-ai-run-btn").addEventListener("click", runAutoReview);

    panel.querySelector("#tts-ai-play-btn").addEventListener("click", () => {
      const audio = getAudioElement();
      if (!audio) return;
      if (audio.paused) {
        audio.play().catch(() => {});
      } else {
        audio.pause();
      }
    });

    // Minimize / Expand
    const minBtn = panel.querySelector("#tts-ai-btn-minimize");
    minBtn.addEventListener("click", () => {
      panel.classList.toggle("minimized");
      minBtn.textContent = panel.classList.contains("minimized") ? "+" : "—";
    });

    // Settings & Guide Modals
    panel.querySelector("#tts-ai-btn-settings").addEventListener("click", openQuickSettingsModal);
    panel.querySelector("#tts-ai-btn-guide").addEventListener("click", openTaxonomyGuideModal);

    // --- Draggable panel: grab the header to reposition it anywhere on screen ---
    (function enableDrag() {
      const handle = panel.querySelector("#tts-ai-header-drag");
      const STORAGE_KEY = "ttsCopilotPos";
      let dragging = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;

      // Switch from the default bottom/right anchoring to explicit left/top,
      // clamped so the panel always stays fully within the viewport.
      function applyPosition(left, top) {
        const w = panel.offsetWidth, h = panel.offsetHeight;
        left = Math.max(0, Math.min(left, window.innerWidth - w));
        top = Math.max(0, Math.min(top, window.innerHeight - h));
        panel.style.left = left + "px";
        panel.style.top = top + "px";
        panel.style.right = "auto";
        panel.style.bottom = "auto";
      }

      // Restore a previously saved position across page loads.
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
        if (saved && Number.isFinite(saved.left) && Number.isFinite(saved.top)) {
          applyPosition(saved.left, saved.top);
        }
      } catch (_) {}

      function onMouseMove(e) {
        if (!dragging) return;
        applyPosition(startLeft + (e.clientX - startX), startTop + (e.clientY - startY));
      }

      function onMouseUp() {
        if (!dragging) return;
        dragging = false;
        panel.style.transition = "";
        document.body.style.userSelect = "";
        handle.classList.remove("tts-ai-dragging");
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify({
            left: parseInt(panel.style.left, 10) || 0,
            top: parseInt(panel.style.top, 10) || 0
          }));
        } catch (_) {}
      }

      handle.addEventListener("mousedown", (e) => {
        // Left-button only, and never start a drag from the header control buttons.
        if (e.button !== 0 || e.target.closest(".tts-ai-icon-btn")) return;
        dragging = true;
        const rect = panel.getBoundingClientRect();
        startX = e.clientX; startY = e.clientY;
        startLeft = rect.left; startTop = rect.top;
        panel.style.transition = "none"; // follow the cursor without easing lag
        document.body.style.userSelect = "none";
        handle.classList.add("tts-ai-dragging");
        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
        e.preventDefault();
      });

      // Keep it on-screen if the window is later resized smaller.
      window.addEventListener("resize", () => {
        if (panel.style.left) {
          applyPosition(parseInt(panel.style.left, 10) || 0, parseInt(panel.style.top, 10) || 0);
        }
      });
    })();

    // Load saved preferences
    chrome.storage.sync.get(["autoRunOnNext", "autoPlayAudio", "styleSpanPref"], (items) => {
      if (items.autoRunOnNext !== undefined) {
        const el = document.getElementById("tts-ai-pref-autorun");
        if (el) el.checked = items.autoRunOnNext;
      }
      if (items.autoPlayAudio !== undefined) {
        const el = document.getElementById("tts-ai-pref-autoplay");
        if (el) el.checked = items.autoPlayAudio;
      }
      if (items.styleSpanPref !== undefined) {
        const el = document.getElementById("tts-ai-pref-tagged");
        if (el) el.checked = items.styleSpanPref;
      }
    });

    // Save preferences on change
    panel.querySelector("#tts-ai-pref-autorun").addEventListener("change", (e) => {
      chrome.storage.sync.set({ autoRunOnNext: e.target.checked });
    });
    panel.querySelector("#tts-ai-pref-autoplay").addEventListener("change", (e) => {
      chrome.storage.sync.set({ autoPlayAudio: e.target.checked });
    });
    panel.querySelector("#tts-ai-pref-tagged").addEventListener("change", (e) => {
      chrome.storage.sync.set({ styleSpanPref: e.target.checked });
    });
  }

  // --- UI Helpers ---
  function showStatus(message, state = "normal") {
    const msgEl = document.getElementById("tts-ai-status-msg");
    const dot = document.getElementById("tts-ai-status-indicator");
    if (!msgEl || !dot) return;

    msgEl.textContent = message;
    dot.className = "tts-ai-status-dot";
    if (state === "active") dot.classList.add("active");
    if (state === "working") dot.classList.add("working");
    if (state === "error") dot.classList.add("error");
  }

  function updateRunButtonState(loading) {
    const btn = document.getElementById("tts-ai-run-btn");
    const icon = document.getElementById("tts-ai-run-icon");
    const txt = document.getElementById("tts-ai-run-text");
    if (!btn) return;

    if (loading) {
      btn.classList.add("loading");
      if (icon) icon.textContent = "⏳";
      if (txt) txt.textContent = "Analyzing Audio...";
    } else {
      btn.classList.remove("loading");
      if (icon) icon.textContent = "✨";
      if (txt) txt.textContent = "AI Auto-Review & Tag";
    }
  }

  function renderReviewNotes(result) {
    const badge = document.getElementById("tts-ai-active-emotion-badge");
    const cues = document.getElementById("tts-ai-notes-cues");
    const fixes = document.getElementById("tts-ai-notes-fixes");
    const preview = document.getElementById("tts-ai-preview-text");

    if (badge) badge.textContent = `★ ${result.emotion}`;
    if (cues) {
      const cueText = result.review_notes?.emotion_and_vocal_cues || `Emotion: ${result.emotion}`;
      cues.textContent = cueText;
    }
    if (fixes) {
      const fixesText = result.review_notes?.text_fixes || "Punctuation & casing standardized";
      const tagsText = (result.review_notes?.event_tags_inserted || []).join(", ");
      fixes.textContent = tagsText ? `${fixesText} | Tags: ${tagsText}` : fixesText;
    }
    if (preview) {
      preview.textContent = result.tagged_transcript || result.corrected_transcript_clean;
    }
  }

  // --- Quick Settings Modal ---
  function openQuickSettingsModal() {
    if (document.getElementById("tts-ai-settings-modal")) return;

    chrome.storage.sync.get(["geminiApiKey", "selectedModel"], (data) => {
      const modal = document.createElement("div");
      modal.id = "tts-ai-settings-modal";
      modal.className = "tts-ai-modal-overlay";
      modal.innerHTML = `
        <div class="tts-ai-modal">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <h3 style="margin:0; font-size:15px; color:#fff;">⚙️ Gemini AI Settings</h3>
            <button id="tts-modal-close" style="background:none; border:none; color:#94a3b8; font-size:18px; cursor:pointer;">&times;</button>
          </div>
          
          <label style="font-size:12px; color:#cbd5e1; font-weight:600;">Google Gemini API Key:</label>
          <input type="password" id="tts-modal-key" class="tts-ai-input" placeholder="AQ.Ab... or AIzaSy..." value="${data.geminiApiKey || ''}" />
          <p style="font-size:11px; color:#94a3b8; margin:-8px 0 12px 0;">
            A key from <a href="https://aistudio.google.com/" target="_blank" style="color:#60a5fa;">aistudio.google.com</a> is free and enables native audio emotion and speech analysis.
          </p>

          <label style="font-size:12px; color:#cbd5e1; font-weight:600;">AI Model:</label>
          <select id="tts-modal-model" class="tts-ai-input" style="cursor:pointer;">
            <option value="gemini-3.8-flash" ${data.selectedModel === 'gemini-3.8-flash' || !data.selectedModel ? 'selected' : ''}>Gemini 3.8 Flash (Recommended - Native Audio)</option>
            <option value="gemini-flash-latest" ${data.selectedModel === 'gemini-flash-latest' ? 'selected' : ''}>Gemini Flash (Latest - auto-updates)</option>
            <option value="gemini-3.5-flash" ${data.selectedModel === 'gemini-3.5-flash' ? 'selected' : ''}>Gemini 3.5 Flash</option>
          </select>

          <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:16px;">
            <button type="button" id="tts-modal-cancel" class="tts-ai-btn-secondary" style="padding:6px 12px;">Cancel</button>
            <button type="button" id="tts-modal-save" class="tts-ai-btn-primary" style="padding:6px 16px;">Save Settings</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      const closeModal = () => modal.remove();
      modal.querySelector("#tts-modal-close").addEventListener("click", closeModal);
      modal.querySelector("#tts-modal-cancel").addEventListener("click", closeModal);

      modal.querySelector("#tts-modal-save").addEventListener("click", () => {
        const apiKey = modal.querySelector("#tts-modal-key").value.trim();
        const selectedModel = modal.querySelector("#tts-modal-model").value;
        chrome.storage.sync.set({ geminiApiKey: apiKey, selectedModel: selectedModel }, () => {
          showStatus("API Settings saved successfully!", "active");
          closeModal();
        });
      });
    });
  }

  // --- 19 Emotion Reference Guide (from Official Training Guide) ---
  const TAXONOMY_REFERENCE = [
    {
      label: "angry",
      name: "Anger",
      def: "The speaker sounds very mad or upset. The voice may sound strong, sharp, or tense.",
      listenFor: "Forceful or tense voice; sharp stress; clipped phrasing; raised intensity.",
      notConfuse: "Annoyed (usually milder) · Loud (only volume) · Menacing (involves a threat)"
    },
    {
      label: "annoyed",
      name: "Annoyed",
      def: "The speaker sounds irritated or tired of something, but not strongly angry.",
      listenFor: "Exasperated or flat tone; drawn-out words; sighing quality; restrained sharpness.",
      notConfuse: "Anger (much stronger) · Sarcastic (may mean opposite of words) · Sad (unhappy, not irritated)"
    },
    {
      label: "awe",
      name: "Awe",
      def: "The speaker sounds amazed by something beautiful, impressive, or wonderful.",
      listenFor: "Breathy or open tone; slower pace; widened pitch range; reverent emphasis.",
      notConfuse: "Surprised (unexpected, but may not admire it) · Joyful (happy, but not necessarily amazed) · Excited (more energy/eagerness)"
    },
    {
      label: "curious",
      name: "Curious",
      def: "The speaker wants to know, learn, or understand something.",
      listenFor: "Questioning intonation; attentive energy; upward inflection; inviting pace.",
      notConfuse: "Thoughtful (thinking carefully, not looking for answer) · Surprised (unexpected reaction) · Nervous (worried, not interested)"
    },
    {
      label: "excited",
      name: "Excited",
      def: "The speaker sounds very eager, happy, and full of energy.",
      listenFor: "Faster pace; higher pitch; lively rhythm; strong positive emphasis.",
      notConfuse: "Joyful (happy, but may sound calmer) · Surprised (sudden reaction) · Loud (only about volume)"
    },
    {
      label: "fearful",
      name: "Fearful",
      def: "The speaker sounds afraid because something dangerous or bad may happen.",
      listenFor: "Shaky or breathy voice; urgency; higher pitch; pauses, gasps, or strained delivery.",
      notConfuse: "Nervous (worried, but no clear danger) · Surprised (unexpected, but not afraid) · Whisper (only quiet voice)"
    },
    {
      label: "flirty",
      name: "Flirty",
      def: "The speaker sounds playful and shows romantic interest in someone.",
      listenFor: "Teasing warmth; suggestive stress; playful rhythm; soft or inviting delivery.",
      notConfuse: "Tender (gentle/caring, not romantic) · Mischievous (playfully causing trouble) · Joyful (happy, not romantic)"
    },
    {
      label: "joyful",
      name: "Joyful",
      def: "The speaker sounds clearly happy, pleased, or delighted.",
      listenFor: "Smiling voice; bright resonance; buoyant rhythm; warm positive energy.",
      notConfuse: "Excited (more energy/eagerness) · Smug (pleased with self/superior) · Tender (soft and caring)"
    },
    {
      label: "loud",
      name: "Loud",
      def: "The speaker talks at a high volume or sounds like shouting. The emotion can be different.",
      listenFor: "Strong amplitude and projection; voice carries forcefully; may sound shouted.",
      notConfuse: "Anger (mad/upset) · Excited (strong positive energy) · Menacing (sounds threatening)"
    },
    {
      label: "menacing",
      name: "Menacing",
      def: "The speaker sounds threatening or dangerous, as if they may harm or scare someone.",
      listenFor: "Controlled low tone; deliberate pacing; ominous stress; cold or restrained intensity.",
      notConfuse: "Anger (mad, but not threatening) · Loud (only about volume) · Smug (superior, but not threatening)"
    },
    {
      label: "mischievously",
      name: "Mischievous",
      def: "The speaker sounds playful or cheeky and may be planning harmless trouble.",
      listenFor: "Conspiratorial or cheeky tone; playful stress; restrained amusement; knowing rhythm.",
      notConfuse: "Menacing (may cause harm/threat) · Flirty (romantic interest) · Sarcastic (mocking/means opposite)"
    },
    {
      label: "nervous",
      name: "Nervous",
      def: "The speaker sounds worried, unsure, or uncomfortable. The voice may shake or hesitate.",
      listenFor: "Hesitations; uneven rhythm; tight or shaky pitch; rushed words or fillers.",
      notConfuse: "Fearful (clear danger or strong fear) · Whisper (only a quiet voice)"
    },
    {
      label: "sad",
      name: "Sad",
      def: "The speaker sounds unhappy, hurt, disappointed, or low in energy.",
      listenFor: "Lower energy; slower pace; softer volume; falling pitch; heavy or tearful quality.",
      notConfuse: "Tender (gentle and caring) · Nervous (worried or unsure) · Whisper (only a quiet voice)"
    },
    {
      label: "sarcastic",
      name: "Sarcastic",
      def: "The speaker sounds mocking or means the opposite of the words they say.",
      listenFor: "Exaggerated stress; dry or flat tone; stretched words; noticeable mismatch with wording.",
      notConfuse: "Annoyed (directly shows irritation) · Smug (pleased with self/superior) · Mischievous (playful teasing)"
    },
    {
      label: "smug",
      name: "Smug",
      def: "The speaker sounds very pleased with themselves and may feel better than others.",
      listenFor: "Knowing tone; relaxed certainty; slight drawl; condescending or pleased emphasis.",
      notConfuse: "Joyful (simple happiness without superiority) · Sarcastic (mocking/opposite) · Menacing (threatening)"
    },
    {
      label: "surprised",
      name: "Surprised",
      def: "The speaker reacts to something they did not expect.",
      listenFor: "Sudden pitch jump; sharp onset; widened intensity; brief gasp or pause.",
      notConfuse: "Awe (surprise includes wonder/admiration) · Excited (positive energy lasts longer) · Fearful (afraid of danger)"
    },
    {
      label: "tender",
      name: "Tender",
      def: "The speaker sounds soft, gentle, caring, or loving.",
      listenFor: "Soft warm tone; smooth pace; delicate emphasis; calm, intimate delivery.",
      notConfuse: "Flirty (shows romantic interest) · Sad (feels sorrow/unhappiness) · Whisper (only a quiet voice)"
    },
    {
      label: "thoughtful",
      name: "Thoughtful",
      def: "The speaker sounds calm and is carefully thinking about something.",
      listenFor: "Measured pace; intentional pauses; calm control; emphasis on key ideas.",
      notConfuse: "Curious (wants answer/information) · Nervous (worried/unsure) · Sad (unhappy/low)"
    },
    {
      label: "whispers",
      name: "Whisper",
      def: "The speaker uses a very quiet, soft, and breathy voice.",
      listenFor: "Breathy phonation; minimal vocal projection; close, soft delivery; reduced voicing.",
      notConfuse: "Tender (gentle/caring emotion) · Fearful (afraid) · Nervous (worried/unsure)"
    }
  ];

  function openTaxonomyGuideModal() {
    if (document.getElementById("tts-ai-guide-modal")) return;

    const modal = document.createElement("div");
    modal.id = "tts-ai-guide-modal";
    modal.className = "tts-ai-modal-overlay";
    modal.innerHTML = `
      <div class="tts-ai-modal tts-ai-modal-large">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <div>
            <h3 style="margin:0; font-size:16px; color:#fff; display:flex; align-items:center; gap:8px;">
              <span>📖</span> 19-Emotion Training Guide & Reference
            </h3>
            <p style="margin:2px 0 0 0; font-size:11.5px; color:#94a3b8;">
              Definitions, acoustic cues to listen for, and lookalikes not to confuse.
            </p>
          </div>
          <button id="tts-guide-close" style="background:none; border:none; color:#94a3b8; font-size:22px; cursor:pointer;">&times;</button>
        </div>

        <input type="text" id="tts-guide-search" class="tts-ai-input" placeholder="Search emotions or cues (e.g. mad, threat, calm, happy)..." style="margin-bottom:12px;" />

        <div id="tts-guide-cards-container" style="max-height:60vh; overflow-y:auto; display:flex; flex-direction:column; gap:10px; padding-right:4px;">
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const container = modal.querySelector("#tts-guide-cards-container");
    const searchInput = modal.querySelector("#tts-guide-search");

    function renderCards(filter = "") {
      container.innerHTML = "";
      const query = filter.toLowerCase().trim();
      const filtered = TAXONOMY_REFERENCE.filter(item => 
        !query || 
        item.name.toLowerCase().includes(query) ||
        item.label.toLowerCase().includes(query) ||
        item.def.toLowerCase().includes(query) ||
        item.listenFor.toLowerCase().includes(query) ||
        item.notConfuse.toLowerCase().includes(query)
      );

      if (filtered.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#94a3b8; font-size:13px;">No matching emotions found.</div>';
        return;
      }

      filtered.forEach(item => {
        const card = document.createElement("div");
        card.className = "tts-ai-guide-card";
        card.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="tts-ai-emotion-pill" style="font-size:12px; padding:3px 10px;">★ ${item.label}</span>
              <strong style="font-size:13.5px; color:#f8fafc;">${item.name}</strong>
            </div>
            <button type="button" class="tts-ai-btn-secondary tts-guide-apply-btn" style="padding:3px 10px; font-size:11px;" data-emo="${item.label}">
              Apply This Style
            </button>
          </div>
          <div style="font-size:12px; color:#e2e8f0; margin-bottom:4px; line-height:1.4;">
            <strong>Definition:</strong> ${item.def}
          </div>
          <div style="font-size:12px; color:#93c5fd; margin-bottom:4px; line-height:1.4;">
            <strong>Listen For:</strong> ${item.listenFor}
          </div>
          <div style="font-size:11.5px; color:#fbbf24; line-height:1.4; background:rgba(245,158,11,0.08); padding:5px 8px; border-radius:5px; border-left:3px solid #f59e0b;">
            ⚠️ <strong>Do NOT confuse with:</strong> ${item.notConfuse}
          </div>
        `;

        card.querySelector(".tts-guide-apply-btn").addEventListener("click", () => {
          setEmotionSpan(item.label);
          modal.remove();
        });

        container.appendChild(card);
      });
    }

    renderCards();

    searchInput.addEventListener("input", (e) => {
      renderCards(e.target.value);
    });

    const closeModal = () => modal.remove();
    modal.querySelector("#tts-guide-close").addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
  }

  // --- Automatic Clip Change Observer ---
  function observeClipChanges() {
    const checkClip = () => {
      const meta = getClipMetadata();
      const currentId = meta.clipId + "::" + meta.audioSrc;
      if (lastClipIdentifier && currentId !== lastClipIdentifier) {
        lastClipIdentifier = currentId;
        console.log("[TTS AI Reviewer] New clip detected:", currentId);
        
        // Check if inline bar exists, re-inject if needed
        injectInlineQuickAction();

        // Check if auto-run on next is enabled
        const autoRunPref = document.getElementById("tts-ai-pref-autorun")?.checked;
        if (autoRunPref) {
          setTimeout(() => runAutoReview(), 500);
        }
      } else {
        lastClipIdentifier = currentId;
      }
    };

    setInterval(checkClip, 1200);
  }

  // --- Listen to Background Messages (Keyboard shortcuts) ---
  function listenToBackgroundMessages() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "TRIGGER_AUTO_REVIEW") {
        runAutoReview();
        sendResponse({ received: true });
      } else if (request.action === "TOGGLE_PLAYBACK") {
        const audio = getAudioElement();
        if (audio) {
          if (audio.paused) audio.play().catch(() => {});
          else audio.pause();
        }
        sendResponse({ received: true });
      }
    });
  }

  // Start initialization
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
