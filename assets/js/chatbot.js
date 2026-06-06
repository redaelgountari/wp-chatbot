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
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,600;0,700;1,600&display=swap';
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
  // 2b. Dynamic Configuration & State
  // ---------------------------------------------------------------------------
  const BOT_NAME      = (typeof aicb_ajax !== 'undefined' && aicb_ajax.bot_name) ? aicb_ajax.bot_name : 'AI Assistant';
  const WELCOME_MSG   = (typeof aicb_ajax !== 'undefined' && aicb_ajax.welcome_message) ? aicb_ajax.welcome_message : "Bonjour ! 👋 Comment puis-je vous aider aujourd'hui ?";
  
  let isFirstOpen    = true;
  let isSending      = false;
  let lastMessageTs  = 0;
  const RATE_LIMIT_MS = 2000; // 2 seconds between messages

  // ---------------------------------------------------------------------------
  // 3. Inject Chat Widget HTML
  // ---------------------------------------------------------------------------
  const widgetHTML = `
    <div class="aicb-chat-bubble" id="aicb-bubble" role="button" aria-label="Open chat" tabindex="0">
      <div class="aicb-bubble-icon">${ICON_CHAT}</div>
    </div>
    <div class="aicb-chat-window" id="aicb-window" role="dialog" aria-label="Chat window">
      <div class="aicb-chat-header">
        <div class="aicb-header-info">
          <div class="aicb-avatar">
            G
          </div>
          <div class="aicb-header-text">
            <span class="aicb-bot-name">${BOT_NAME}</span>
            <span class="aicb-status-text">Glorious Groupe</span>
          </div>
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
    chatWin.classList.add('active');
    bubble.classList.add('aicb-hidden');
    setTimeout(function() {
      input.focus();
    }, 150);

    if (isFirstOpen) {
      isFirstOpen = false;
      createMessage('assistant', WELCOME_MSG);
      createSuggestionChips([
        'Quels sont vos projets ?',
        'Quels services proposez-vous ?',
        'Comment puis-je vous contacter ?'
      ]);
    }
  }

  // ---------------------------------------------------------------------------
  // 7b. Suggestion Chips
  // ---------------------------------------------------------------------------
  function removeSuggestionChips() {
    var existing = document.querySelectorAll('.aicb-suggestions');
    existing.forEach(function(el) { el.remove(); });
  }

  function createSuggestionChips(suggestions) {
    if (!suggestions || suggestions.length === 0) return;
    removeSuggestionChips();

    var container = document.createElement('div');
    container.className = 'aicb-suggestions';

    suggestions.forEach(function(text) {
      var chip = document.createElement('button');
      chip.className = 'aicb-suggestion-chip';
      chip.textContent = text;
      chip.addEventListener('click', function() {
        removeSuggestionChips();
        input.value = text;
        sendMessage();
      });
      container.appendChild(chip);
    });

    messages.appendChild(container);
    scrollToBottom();
  }

  function parseSuggestions(text) {
    if (!text) return { cleanText: '', suggestions: [] };
    var regex = /(?:[\s\[\*\-\•\d\.]*SUGGESTS?[\s\*\]]*:[\s\*]*)([^\]\r\n]+)/i;
    var match = text.match(regex);
    if (!match) return { cleanText: text, suggestions: [] };
    var rawSuggestions = match[1] || '';
    rawSuggestions = rawSuggestions.replace(/[\]\*]+$/, '').trim();
    var cleanText = text.replace(match[0], '').trim();
    cleanText = cleanText.replace(/\[\s*\**\s*$/, '').replace(/\**\s*$/, '').trim();
    var suggestions = rawSuggestions.split('|').map(function(s) {
      return s.trim().replace(/^\**|\**$/g, '').trim();
    }).filter(function(s) {
      return s.length > 0;
    });
    return { cleanText: cleanText, suggestions: suggestions };
  }

  function closeChat() {
    chatWin.classList.remove('active');
    bubble.classList.remove('aicb-hidden');
    bubble.focus(); // Return focus to FAB for accessibility
  }

  // ---------------------------------------------------------------------------
  // 8. Markdown Renderer
  // ---------------------------------------------------------------------------
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function renderMarkdown(text) {
    if (!text) return '';
    // Strip any SUGGEST tag and everything after it to prevent leaks during streaming
    var cleaned = text.replace(/(?:[\s\[\*\-\•\d\.]*SUGGESTS?[\s\*\]]*:[\s\*]*)([\s\S]*)/i, '').trim();
    // Clean trailing unfinished formatting characters that might be left right before the tag
    cleaned = cleaned.replace(/\[\s*\**\s*$/, '').replace(/\**\s*$/, '').trim();
    if (!cleaned) return '';

    // Escape HTML first to prevent XSS
    var html = escapeHtml(cleaned);

    // Bold: **text** → <strong>text</strong>
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Auto-link URLs (must come before line splitting)
    html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

    // Auto-link email addresses
    html = html.replace(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g, '<a href="mailto:$1">$1</a>');

    // Auto-link phone numbers (+212… or 05/06/07… patterns)
    html = html.replace(/((?:\+\d{1,3}[\s\-]?)?(?:\(\d+\)|\d)[\d\s\-\.]{6,}\d)/g, function(match) {
      var digits = match.replace(/[^\d+]/g, '');
      return '<a href="tel:' + digits + '">' + match + '</a>';
    });

    // Split into lines for list detection
    var lines = html.split('\n');
    var result = [];
    var inList = false;
    var listType = '';

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      var numberedMatch = line.match(/^(\d+)\.\s+(.+)/);
      var bulletMatch = line.match(/^[-\u2022*]\s+(.+)/);

      if (numberedMatch) {
        if (!inList || listType !== 'ol') {
          if (inList) result.push(listType === 'ol' ? '</ol>' : '</ul>');
          result.push('<ol>');
          inList = true;
          listType = 'ol';
        }
        result.push('<li>' + numberedMatch[2] + '</li>');
      } else if (bulletMatch) {
        if (!inList || listType !== 'ul') {
          if (inList) result.push(listType === 'ol' ? '</ol>' : '</ul>');
          result.push('<ul>');
          inList = true;
          listType = 'ul';
        }
        result.push('<li>' + bulletMatch[1] + '</li>');
      } else {
        if (inList) {
          result.push(listType === 'ol' ? '</ol>' : '</ul>');
          inList = false;
          listType = '';
        }
        if (line === '') {
          result.push('<br>');
        } else {
          result.push('<p>' + line + '</p>');
        }
      }
    }
    if (inList) result.push(listType === 'ol' ? '</ol>' : '</ul>');

    return result.join('');
  }

  // ---------------------------------------------------------------------------
  // 9. Message Creation
  // ---------------------------------------------------------------------------
  function createMessage(role, text) {
    var div = document.createElement('div');
    div.className = 'aicb-message ' + role;
    if (role === 'assistant') {
      div.innerHTML = renderMarkdown(text);
    } else {
      div.textContent = text;
    }
    messages.appendChild(div);
    scrollToBottom();
    return div;
  }

  // ---------------------------------------------------------------------------
  // 9. Scroll Helper
  // ---------------------------------------------------------------------------
  function scrollToBottom() {
    requestAnimationFrame(function () {
      // Double-raf to ensure DOM has painted the new content
      requestAnimationFrame(function () {
        messages.scrollTo({
          top: messages.scrollHeight,
          behavior: 'smooth'
        });
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
    inputArea.appendChild(tip);

    setTimeout(function () {
      if (tip.parentNode) tip.remove();
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

    // Remove any existing suggestion chips
    removeSuggestionChips();

    // Show typing indicator
    showTypingIndicator();

    // Call the API
    sendToAPI(text);
  }

  // ---------------------------------------------------------------------------
  // 14. Streaming API Call
  // ---------------------------------------------------------------------------
  async function sendToAPI(message) {
    // Remove typing indicator early — we'll re-show it only on initial send
    // (typing indicator is already shown before this call)
    
    // Create an empty assistant message container for streaming
    var assistantDiv = document.createElement('div');
    assistantDiv.className = 'aicb-message assistant';
    // Don't append yet — append only once we receive first content
    var hasAppended = false;

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
      var buffer = '';

      while (true) {
        var result = await reader.read();
        if (result.done) break;

        var chunk = decoder.decode(result.value, { stream: true });
        buffer += chunk;
        var lines = buffer.split('\n');
        buffer = lines.pop();

        for (var i = 0; i < lines.length; i++) {
          var line = lines[i];
          if (line.startsWith('data: ')) {
            var data = line.slice(6);
            if (data === '[DONE]') break;

            try {
              var parsed = JSON.parse(data);
              
              // Try to find the content in various possible formats
              var deltaContent = parsed.content; // Custom simplified format
              
              if (!deltaContent && parsed.choices && parsed.choices[0] && parsed.choices[0].delta) {
                deltaContent = parsed.choices[0].delta.content; // Raw OpenAI/Groq format
              }
              
              if (!deltaContent && parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content && parsed.candidates[0].content.parts) {
                deltaContent = parsed.candidates[0].content.parts[0].text; // Raw Gemini format
              }

              if (deltaContent) {
                // On first content chunk, remove typing indicator and append message div
                if (!hasAppended) {
                  removeTypingIndicator();
                  messages.appendChild(assistantDiv);
                  hasAppended = true;
                }
                fullText += deltaContent;
                assistantDiv.innerHTML = renderMarkdown(fullText);
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
        removeTypingIndicator();
        if (!hasAppended) {
          messages.appendChild(assistantDiv);
          hasAppended = true;
        }
        assistantDiv.innerHTML = renderMarkdown("I'm sorry, I didn't get a response. Please try again.");
      } else {
        // Parse and display suggestion chips if present
        var parsedSuggestions = parseSuggestions(fullText);
        assistantDiv.innerHTML = renderMarkdown(parsedSuggestions.cleanText);
        if (parsedSuggestions.suggestions.length > 0) {
          createSuggestionChips(parsedSuggestions.suggestions);
        }
      }
    } catch (error) {
      console.error('[AICB] API error:', error);
      removeTypingIndicator();
      if (!hasAppended) {
        messages.appendChild(assistantDiv);
        hasAppended = true;
      }
      assistantDiv.innerHTML = renderMarkdown('Sorry, something went wrong. Please try again.');
    } finally {
      removeTypingIndicator(); // Safety net — remove if still showing
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

  // Escape key → close
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && chatWin.classList.contains('active')) {
      closeChat();
    }
  });

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
