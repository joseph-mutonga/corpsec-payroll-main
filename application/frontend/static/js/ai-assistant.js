/**
 * ==============================================================================
 * CorpSec System AI Assistant (Google Gemini Performance & Telemetry Analyst)
 * Embedded in System Admin Dashboard for Data-Grounded Natural Language Insights.
 * ==============================================================================
 */

(function () {
  'use strict';

  window.SystemAIAssistant = {
    history: [],
    isLoading: false,
    isOpen: true,

    init() {
      console.log('[SystemAIAssistant] Initializing AI Assistant...');
      this.attachEventListeners();
      this.renderQuickStarterChips();
    },

    attachEventListeners() {
      const input = document.getElementById('ai-assistant-input');
      if (input) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.sendUserPrompt();
          }
        });
      }
    },

    renderQuickStarterChips() {
      const container = document.getElementById('ai-assistant-starter-chips');
      if (!container) return;

      const starters = [
        { label: '📊 Overall System Health Today', prompt: 'Summarize overall system health today, including server load, database performance, and active operations.' },
        { label: '⚠️ Unusual Error Spikes?', prompt: 'Are there any unusual error spikes, payroll calculation errors, or system alerts detected?' },
        { label: '⚡ Top Resource Bottlenecks', prompt: 'Show top resource bottlenecks across server CPU, memory, database latency, and storage.' },
        { label: '💼 Operational & Financial Overview', prompt: 'Give me a summary of active guard deployments, client contracts, and monthly payroll disbursement status.' },
        { label: '🚨 Critical Security Incidents', prompt: 'Audit open security incidents, critical severity cases, and call center load.' }
      ];

      container.innerHTML = starters.map(s => `
        <button type="button" class="ai-chip-btn" onclick="SystemAIAssistant.selectStarterPrompt('${encodeURIComponent(s.prompt)}')">
          ${s.label}
        </button>
      `).join('');
    },

    selectStarterPrompt(encodedPrompt) {
      const prompt = decodeURIComponent(encodedPrompt);
      const input = document.getElementById('ai-assistant-input');
      if (input) {
        input.value = prompt;
        input.focus();
        this.sendUserPrompt();
      }
    },

    async sendUserPrompt() {
      const input = document.getElementById('ai-assistant-input');
      if (!input || this.isLoading) return;

      const promptText = (input.value || '').trim();
      if (!promptText) return;

      // Add user message to conversation UI
      this.appendMessage('user', promptText);
      input.value = '';
      this.isLoading = true;
      this.renderLoadingIndicator(true);

      const token = window.authToken || localStorage.getItem('corpsec_token') || localStorage.getItem('token') || sessionStorage.getItem('token');
      if (!token) {
        this.renderLoadingIndicator(false);
        this.appendMessage('model', '> [!WARNING]\n> **Authentication Required:** You must be signed in as a System Administrator to query AI insights.');
        this.isLoading = false;
        return;
      }

      try {
        const payload = {
          prompt: promptText,
          history: this.history,
          include_telemetry: true
        };

        const response = await fetch('/api/v1/admin/ai-insights', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });

        if (response.status === 401 || response.status === 403) {
          throw new Error('Access denied. Strictly restricted to System Administrators.');
        }

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.detail || `Server returned error ${response.status}`);
        }

        const data = await response.json();
        const modelAnswer = data.answer || 'No analysis generated.';

        // Append model response
        this.appendMessage('model', modelAnswer, {
          modelUsed: data.model_used,
          timestamp: data.timestamp,
          grounding: data.grounding_metrics_summary,
          hasApiKey: data.has_api_key
        });

        if (data.model_used) {
          const badge = document.getElementById('ai-model-badge');
          if (badge) badge.innerHTML = `<span>✨</span> ${data.model_used}`;
        }

        // Update history
        this.history.push({ role: 'user', content: promptText });
        this.history.push({ role: 'model', content: modelAnswer });
        if (this.history.length > 10) {
          this.history = this.history.slice(-10);
        }

      } catch (err) {
        console.error('[SystemAIAssistant] Query error:', err);
        this.appendMessage('model', `> [!WARNING]\n> **AI Insights Request Failed:** ${err.message}`);
      } finally {
        this.isLoading = false;
        this.renderLoadingIndicator(false);
      }
    },

    appendMessage(role, rawContent, meta = null) {
      const messagesContainer = document.getElementById('ai-assistant-messages');
      if (!messagesContainer) return;

      // Remove welcome hero placeholder if present
      const welcomePlaceholder = document.getElementById('ai-assistant-welcome');
      if (welcomePlaceholder) {
        welcomePlaceholder.style.display = 'none';
      }

      const msgDiv = document.createElement('div');
      msgDiv.className = `ai-message ai-message-${role}`;

      const avatar = role === 'user'
        ? `<div class="ai-avatar ai-avatar-user" title="Admin">👤</div>`
        : `<div class="ai-avatar ai-avatar-model" title="Gemini System Analyst">🤖</div>`;

      const authorName = role === 'user' ? 'System Administrator' : 'Gemini Performance Analyst';
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      let metaBadge = '';
      if (meta && meta.modelUsed) {
        const badgeColor = meta.hasApiKey ? '#2563EB' : '#D97706';
        metaBadge = `<span style="font-size:10px; background:${badgeColor}15; color:${badgeColor}; padding:2px 6px; border-radius:4px; font-weight:700; border:1px solid ${badgeColor}30;">${meta.modelUsed}</span>`;
      }

      const renderedBody = this.renderMarkdown(rawContent);

      msgDiv.innerHTML = `
        ${avatar}
        <div class="ai-message-bubble">
          <div class="ai-message-header">
            <span class="ai-message-author">${authorName}</span>
            <div style="display:flex; align-items:center; gap:6px;">
              ${metaBadge}
              <span class="ai-message-time">${timeStr}</span>
            </div>
          </div>
          <div class="ai-message-content markdown-body">
            ${renderedBody}
          </div>
        </div>
      `;

      messagesContainer.appendChild(msgDiv);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    },

    renderLoadingIndicator(show) {
      const loader = document.getElementById('ai-assistant-loader');
      if (!loader) return;
      loader.style.display = show ? 'flex' : 'none';
      if (show) {
        const messagesContainer = document.getElementById('ai-assistant-messages');
        if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }
    },

    clearConversation() {
      this.history = [];
      const messagesContainer = document.getElementById('ai-assistant-messages');
      if (messagesContainer) {
        messagesContainer.innerHTML = '';
      }
      const welcomePlaceholder = document.getElementById('ai-assistant-welcome');
      if (welcomePlaceholder) {
        welcomePlaceholder.style.display = 'block';
      }
      const input = document.getElementById('ai-assistant-input');
      if (input) input.value = '';
    },

    /**
     * Lightweight, self-contained Markdown renderer
     * Supports alerts, tables, headings, bold, code blocks, bullet lists.
     */
    renderMarkdown(text) {
      if (!text) return '';

      let md = text;

      // 1. Sanitize raw HTML tags to prevent XSS
      md = md.replace(/</g, '&lt;').replace(/>/g, '&gt;');

      // 2. Alert boxes: &gt; [!NOTE], &gt; [!WARNING], &gt; [!TIP]
      md = md.replace(/^&gt; \[!NOTE\]\s*\n((?:&gt; .*\n?)+)/gm, (match, body) => {
        const clean = body.replace(/^&gt; ?/gm, '');
        return `<div class="ai-alert ai-alert-note"><span class="ai-alert-icon">ℹ️</span><div>${clean}</div></div>`;
      });
      md = md.replace(/^&gt; \[!WARNING\]\s*\n((?:&gt; .*\n?)+)/gm, (match, body) => {
        const clean = body.replace(/^&gt; ?/gm, '');
        return `<div class="ai-alert ai-alert-warning"><span class="ai-alert-icon">⚠️</span><div>${clean}</div></div>`;
      });
      md = md.replace(/^&gt; \[!TIP\]\s*\n((?:&gt; .*\n?)+)/gm, (match, body) => {
        const clean = body.replace(/^&gt; ?/gm, '');
        return `<div class="ai-alert ai-alert-tip"><span class="ai-alert-icon">💡</span><div>${clean}</div></div>`;
      });

      // 3. Fenced Code Blocks (```lang ... ```)
      md = md.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
        return `<pre class="ai-code-block"><code>${code.trim()}</code></pre>`;
      });

      // 4. Inline code (`code`)
      md = md.replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');

      // 5. Headings: ####, ###, ##
      md = md.replace(/^#### (.*$)/gim, '<h5 class="ai-md-h5">$1</h5>');
      md = md.replace(/^### (.*$)/gim, '<h4 class="ai-md-h4">$1</h4>');
      md = md.replace(/^## (.*$)/gim, '<h3 class="ai-md-h3">$1</h3>');

      // 6. Bold & Italics
      md = md.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      md = md.replace(/\*([^*]+)\*/g, '<em>$1</em>');

      // 7. Markdown Tables
      md = md.replace(/((?:\|[^\n]+\|\r?\n)+)/g, (tableBlock) => {
        const lines = tableBlock.trim().split('\n').filter(l => l.trim().startsWith('|'));
        if (lines.length < 2) return tableBlock;

        const headers = lines[0].split('|').slice(1, -1).map(c => `<th>${c.trim()}</th>`).join('');
        const rows = lines.slice(2).map(row => {
          const cells = row.split('|').slice(1, -1).map(c => `<td>${c.trim()}</td>`).join('');
          return `<tr>${cells}</tr>`;
        }).join('');

        return `<div class="ai-table-wrap"><table class="ai-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
      });

      // 8. Bullet points & Lists
      md = md.replace(/^\s*[-*]\s+(.*)$/gim, '<li class="ai-bullet-item">$1</li>');
      md = md.replace(/((?:<li class="ai-bullet-item">.*<\/li>\s*)+)/g, '<ul class="ai-bullet-list">$1</ul>');

      // 9. Horizontal rules
      md = md.replace(/^---$/gm, '<hr class="ai-hr">');

      // 10. Paragraphs & Line breaks
      md = md.replace(/\n{2,}/g, '</p><p class="ai-p">');
      md = `<p class="ai-p">${md}</p>`;

      // Clean empty paragraph wrappers
      md = md.replace(/<p class="ai-p">\s*<\/p>/g, '');
      md = md.replace(/<p class="ai-p">\s*(<(?:h3|h4|h5|div|pre|table|ul|hr)[^>]*>)/g, '$1');
      md = md.replace(/(<\/(?:h3|h4|h5|div|pre|table|ul|hr)>)\s*<\/p>/g, '$1');

      return md;
    }
  };

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.SystemAIAssistant.init());
  } else {
    window.SystemAIAssistant.init();
  }

})();
