/**
 * AI Chatbot Widget — Frontend JavaScript
 *
 * Loaded with `defer`. Expects `aicb_ajax` from wp_localize_script:
 *   - aicb_ajax.rest_url  (string) REST endpoint URL
 *   - aicb_ajax.nonce     (string) WP nonce for X-WP-Nonce header
 *
 * All DOM IDs and classes are prefixed with `aicb-` to avoid collisions.
 */

document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // 1. Load Google Font — Inter
  // ---------------------------------------------------------------------------
  const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';
  document.head.appendChild(fontLink);

  // ---------------------------------------------------------------------------
  // 2. SVG Icons
  // ---------------------------------------------------------------------------
  const ICON_CHAT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
    <path d="M7 9h10v2H7zm0-3h10v2H7zm0 6h7v2H7z"/>
  </svg>`;

  const ICON_CLOSE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>`;

  const ICON_SEND = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
  </svg>`;

  // ---------------------------------------------------------------------------
  // 3. Inject Chat Widget HTML
  // ---------------------------------------------------------------------------
  const widgetHTML = `
    <div class="aicb-chat-bubble" id="aicb-bubble" role="button" aria-label="Open chat" tabindex="0">
      ${ICON_CHAT}
    </div>
    <div class="aicb-chat-window" id="aicb-window" role="dialog" aria-label="Chat window">
      <div class="aicb-chat-header">
        <div class="aicb-header-info">
          <span class="aicb-status-dot" aria-hidden="true"></span>
          <span class="aicb-bot-name">AI Assistant</span>
          <span class="aicb-status-text">Online</span>
        </div>
        <button class="aicb-close-btn" id="aicb-close" aria-label="Close chat">
          ${ICON_CLOSE}
        </button>
      </div>
      <div class="aicb-chat-messages" id="aicb-messages"></div>
      <div class="aicb-chat-input-area">
        <input
          class="aicb-chat-input"
          id="aicb-input"
          type="text"
          placeholder="Type your message..."
          maxlength="500"
          autocomplete="off"
        />
        <button class="aicb-send-btn" id="aicb-send" aria-label="Send message">
          ${ICON_SEND}
        </button>
      </div>
    </div>`;

  const container = document.createElement('div');
  container.id = 'aicb-widget';
  container.innerHTML = widgetHTML;
  document.body.appendChild(container);

  // ---------------------------------------------------------------------------
  // 4. Cache DOM References
  // ---------------------------------------------------------------------------
  const bubble   = document.getElementById('aicb-bubble');
  const chatWin  = document.getElementById('aicb-window');
  const closeBtn = document.getElementById('aicb-close');
  const messages = document.getElementById('aicb-messages');
  const input    = document.getElementById('aicb-input');
  const sendBtn  = document.getElementById('aicb-send');

  // ---------------------------------------------------------------------------
  // 5. State
  // ---------------------------------------------------------------------------
  let isFirstOpen    = true;
  let isSending      = false;
  let lastMessageTs  = 0;
  const RATE_LIMIT_MS = 2000; // 2 seconds between messages
  const WELCOME_MSG  = "Hello! 👋 I'm your AI assistant. How can I help you today?";

  // ---------------------------------------------------------------------------
  // 6. Session Management
  // ---------------------------------------------------------------------------
  function generateUUID() {
    // RFC 4122 version 4 UUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function getSessionId() {
    let id = localStorage.getItem('aicb_session_id');
    if (!id) {
      id = generateUUID();
      localStorage.setItem('aicb_session_id', id);
    }
    return id;
  }

  // Initialize session on load
  getSessionId();

  // ---------------------------------------------------------------------------
  // 7. Toggle Chat Window
  // ---------------------------------------------------------------------------
  function openChat() {
    chatWin.style.display = 'flex';
    // Force reflow so the CSS transition triggers
    void chatWin.offsetHeight;
    chatWin.classList.add('active');
    bubble.classList.add('aicb-hidden');
    input.focus();

    if (isFirstOpen) {
      isFirstOpen = false;
      createMessage('assistant', WELCOME_MSG);
    }
  }

  function closeChat() {
    chatWin.classList.remove('active');
    bubble.classList.remove('aicb-hidden');

    // Wait for the CSS transition to finish before hiding
    setTimeout(function () {
      if (!chatWin.classList.contains('active')) {
        chatWin.style.display = 'none';
      }
    }, 350);
  }

  // ---------------------------------------------------------------------------
  // 8. Message Creation
  // ---------------------------------------------------------------------------
  /**
   * Creates a message bubble and appends it to the messages container.
   * @param {'user'|'assistant'} role
   * @param {string} text
   * @returns {HTMLElement} The created message div
   */
  function createMessage(role, text) {
    var div = document.createElement('div');
    div.className = 'aicb-message ' + role;
    div.textContent = text;
    messages.appendChild(div);
    scrollToBottom();
    return div;
  }

  // ---------------------------------------------------------------------------
  // 9. Scroll Helper
  // ---------------------------------------------------------------------------
  function scrollToBottom() {
    requestAnimationFrame(function () {
      messages.scrollTo({
        top: messages.scrollHeight,
        behavior: 'smooth'
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 10. Typing Indicator
  // ---------------------------------------------------------------------------
  function showTypingIndicator() {
    var indicator = document.createElement('div');
    indicator.className = 'aicb-typing-indicator';
    indicator.id = 'aicb-typing';
    indicator.innerHTML =
      '<span class="aicb-typing-dot"></span>' +
      '<span class="aicb-typing-dot"></span>' +
      '<span class="aicb-typing-dot"></span>';
    messages.appendChild(indicator);
    scrollToBottom();
  }

  function removeTypingIndicator() {
    var el = document.getElementById('aicb-typing');
    if (el) el.remove();
  }

  // ---------------------------------------------------------------------------
  // 11. Input Enable / Disable
  // ---------------------------------------------------------------------------
  function disableInput() {
    isSending = true;
    input.disabled = true;
    sendBtn.disabled = true;
  }

  function enableInput() {
    isSending = false;
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }

  // ---------------------------------------------------------------------------
  // 12. Rate-Limit Tooltip
  // ---------------------------------------------------------------------------
  function showRateTooltip() {
    var inputArea = document.querySelector('.aicb-chat-input-area');
    // Prevent stacking
    var existing = inputArea.querySelector('.aicb-rate-tooltip');
    if (existing) return;

    var tip = document.createElement('div');
    tip.className = 'aicb-rate-tooltip';
    tip.textContent = 'Please wait a moment...';
    inputArea.style.position = 'relative';
    inputArea.appendChild(tip);

    setTimeout(function () {
      tip.remove();
    }, 1500);
  }

  // ---------------------------------------------------------------------------
  // 13. Send Message
  // ---------------------------------------------------------------------------
  function sendMessage() {
    var text = input.value.trim();
    if (!text || isSending) return;

    // Client-side rate limiting
    var now = Date.now();
    if (now - lastMessageTs < RATE_LIMIT_MS) {
      showRateTooltip();
      return;
    }
    lastMessageTs = now;

    input.value = '';
    disableInput();

    // Add user message to chat
    createMessage('user', text);

    // Show typing indicator
    showTypingIndicator();

    // Call the API
    sendToAPI(text);
  }

  // ---------------------------------------------------------------------------
  // 14. Streaming API Call
  // ---------------------------------------------------------------------------
  async function sendToAPI(message) {
    // Create an empty assistant message container for streaming
    var assistantDiv = createMessage('assistant', '');

    try {
      var response = await fetch(aicb_ajax.rest_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WP-Nonce': aicb_ajax.nonce
        },
        body: JSON.stringify({
          message: message,
          session_id: getSessionId()
        })
      });

      if (!response.ok) {
        var errorData;
        try {
          errorData = await response.json();
        } catch (_) {
          errorData = {};
        }
        throw new Error(errorData.message || 'Something went wrong');
      }

      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var fullText = '';

      while (true) {
        var result = await reader.read();
        if (result.done) break;

        var chunk = decoder.decode(result.value, { stream: true });
        var lines = chunk.split('\n');

        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          if (line.startsWith('data: ')) {
            var data = line.slice(6);
            if (data === '[DONE]') break;

            try {
              var parsed = JSON.parse(data);
              if (parsed.content) {
                fullText += parsed.content;
                assistantDiv.textContent = fullText;
                scrollToBottom();
              }
            } catch (e) {
              // Skip malformed SSE chunks
            }
          }
        }
      }

      // If the stream completed but we got no text, show a fallback
      if (!fullText) {
        assistantDiv.textContent = "I'm sorry, I didn't get a response. Please try again.";
      }
    } catch (error) {
      console.error('[AICB] API error:', error);
      assistantDiv.textContent = 'Sorry, something went wrong. Please try again.';
    } finally {
      removeTypingIndicator();
      enableInput();
    }
  }

  // ---------------------------------------------------------------------------
  // 15. Event Listeners
  // ---------------------------------------------------------------------------

  // Bubble click → open
  bubble.addEventListener('click', openChat);
  bubble.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openChat();
    }
  });

  // Close button → close
  closeBtn.addEventListener('click', closeChat);

  // Send button → send
  sendBtn.addEventListener('click', sendMessage);

  // Enter key → send (Shift+Enter does nothing special for single-line input)
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
});
