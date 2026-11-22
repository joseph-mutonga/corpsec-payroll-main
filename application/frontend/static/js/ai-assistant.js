/**
 * ==============================================================================
 * CorpSec System AI Assistant (Google Gemini Performance & Telemetry Analyst)
 * Embedded in System Admin Dashboard for Data-Grounded Natural Language Insights.
 * ==============================================================================
 */

(function () {
  'use strict';

  function isSystemAdminUser() {
    try {
      const stored = localStorage.getItem('corpsec_user');
      if (stored) {
        const u = JSON.parse(stored);
        return Boolean(u && (u.role === 'ADMIN' || u.role === 'Admin' || u.role === 'System Admin'));
      }
    } catch (e) {}
    return false;
  }

  window.SystemAIAssistant = {
    history: [],
    isLoading: false,
    isOpen: true,

    init() {
      if (!isSystemAdminUser()) {
        const floating = document.getElementById('ai-floating-widget-container');
        if (floating) floating.style.display = 'none';
        const banner = document.getElementById('dash-ai-quick-banner') || document.querySelector('.dash-ai-quick-banner');
        if (banner) banner.style.display = 'none';
        const nav = document.getElementById('nav-item-ai-assistant');
        if (nav) nav.style.display = 'none';
        return;
      }
      console.log('[SystemAIAssistant] Initializing AI Assistant for System Admin...');
      this.attachEventListeners();
      this.renderQuickStarterChips();
      if (typeof initDraggableAIWidget === 'function') {
        initDraggableAIWidget();
      }
      this.loadTelemetryCharts();
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

    createStreamingMessage() {
      const messagesContainer = document.getElementById('ai-assistant-messages');
      if (!messagesContainer) return null;

      const welcomePlaceholder = document.getElementById('ai-assistant-welcome');
      if (welcomePlaceholder) welcomePlaceholder.style.display = 'none';

      const msgDiv = document.createElement('div');
      msgDiv.className = 'ai-message ai-message-model';
      const id = `stream-msg-${Date.now()}`;
      msgDiv.id = id;

      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      msgDiv.innerHTML = `
        <div class="ai-avatar ai-avatar-model" title="Gemini System Analyst">🤖</div>
        <div class="ai-message-bubble">
          <div class="ai-message-header">
            <span class="ai-message-author">Gemini Performance Analyst</span>
            <div style="display:flex; align-items:center; gap:6px;">
              <span class="ai-stream-meta-pill" style="font-size:10px; background:#EFF6FF; color:#2563EB; padding:2px 6px; border-radius:4px; font-weight:700; border:1px solid #BFDBFE;">Streaming...</span>
              <span class="ai-message-time">${timeStr}</span>
            </div>
          </div>
          <div class="ai-message-content markdown-body" id="${id}-body">
            <span class="ai-typing-indicator" style="display:inline-flex; align-items:center; gap:6px; color:#64748B; font-size:12.5px;">
              <span class="ai-spinner" style="width:14px; height:14px; border-width:2px; display:inline-block;"></span>
              <span>Analyzing live database telemetry...</span>
            </span>
          </div>
        </div>
      `;
      messagesContainer.appendChild(msgDiv);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
      return {
        container: msgDiv,
        bodyEl: document.getElementById(`${id}-body`),
        metaEl: msgDiv.querySelector('.ai-stream-meta-pill')
      };
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

      const payload = {
        prompt: promptText,
        history: this.history,
        include_telemetry: true
      };

      try {
        // High-Speed Server-Sent Events (SSE) Streaming
        const streamRes = await fetch('/api/v1/admin/ai-insights/stream', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });

        if (streamRes.status === 401 || streamRes.status === 403) {
          throw new Error('Access denied. Strictly restricted to System Administrators.');
        }

        if (!streamRes.ok || !streamRes.body) {
          throw new Error(`Streaming endpoint returned HTTP ${streamRes.status}`);
        }

        this.renderLoadingIndicator(false);
        const streamUI = this.createStreamingMessage();
        const reader = streamRes.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let accumulatedText = '';
        let streamDonePayload = null;
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop(); // Retain partial trailing chunk

          for (const part of parts) {
            const trimmed = part.trim();
            if (!trimmed.startsWith('data:')) continue;
            try {
              const data = JSON.parse(trimmed.replace(/^data:\s*/, ''));
              if (data.status === 'generating' && data.token) {
                accumulatedText += data.token;
                if (streamUI && streamUI.bodyEl) {
                  streamUI.bodyEl.innerHTML = this.renderMarkdown(accumulatedText) + '<span class="ai-stream-pulse" style="display:inline-block; color:#2563EB; font-weight:800; margin-left:2px;">▌</span>';
                  const messagesContainer = document.getElementById('ai-assistant-messages');
                  if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
                }
              } else if (data.status === 'done') {
                streamDonePayload = data;
              }
            } catch (jsonErr) {
              // Ignore partial JSON chunks
            }
          }
        }

        const finalAnswer = (streamDonePayload && streamDonePayload.full_answer) ? streamDonePayload.full_answer : accumulatedText;
        if (streamUI && streamUI.bodyEl) {
          streamUI.bodyEl.innerHTML = this.renderMarkdown(finalAnswer);
          if (streamDonePayload && streamUI.metaEl) {
            const dbMs = streamDonePayload.db_query_time_ms ? `${streamDonePayload.db_query_time_ms}ms` : '';
            const aiSec = streamDonePayload.gemini_latency_ms ? `${(streamDonePayload.gemini_latency_ms / 1000).toFixed(2)}s` : '';
            const cat = streamDonePayload.category || 'INSIGHTS';
            const model = streamDonePayload.model_used || 'gemini-3.5-flash-lite';
            streamUI.metaEl.innerHTML = `⚡ ${cat} &bull; DB: ${dbMs} &bull; AI: ${aiSec} &bull; ${model}`;
            streamUI.metaEl.style.background = '#F0FDF4';
            streamUI.metaEl.style.color = '#15803D';
            streamUI.metaEl.style.borderColor = '#BBF7D0';

            const badge = document.getElementById('ai-model-badge');
            if (badge) badge.innerHTML = `<span>✨</span> ${model}`;
          }
        }

        // Update history
        this.history.push({ role: 'user', content: promptText });
        this.history.push({ role: 'model', content: finalAnswer });
        if (this.history.length > 8) {
          this.history = this.history.slice(-8);
        }

      } catch (streamErr) {
        console.warn('[SystemAIAssistant] Streaming attempt encountered notice, trying non-streaming fallback:', streamErr);
        // Robust fallback to non-streaming endpoint
        try {
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

          this.history.push({ role: 'user', content: promptText });
          this.history.push({ role: 'model', content: modelAnswer });
          if (this.history.length > 8) {
            this.history = this.history.slice(-8);
          }

        } catch (fallbackErr) {
          console.error('[SystemAIAssistant] Fallback error:', fallbackErr);
          this.appendMessage('model', `> [!WARNING]\n> **AI Insights Request Notice:** ${fallbackErr.message}`);
        }
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

    async loadTelemetryCharts(forceRefresh = false) {
      if (!isSystemAdminUser()) return;
      const refreshIcon = document.getElementById('ai-telemetry-refresh-icon');
      if (refreshIcon) {
        refreshIcon.style.display = 'inline-block';
        refreshIcon.style.animation = 'spin 0.8s linear infinite';
      }

      const token = window.authToken || localStorage.getItem('corpsec_token') || localStorage.getItem('token') || sessionStorage.getItem('token');
      if (!token) {
        if (refreshIcon) refreshIcon.style.animation = 'none';
        return;
      }

      try {
        const response = await fetch('/api/v1/admin/ai-insights/telemetry', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (!response.ok) {
          console.warn('[SystemAIAssistant] Failed to load telemetry:', response.status);
          return;
        }

        const data = await response.json();
        const host = data.host_telemetry || {};
        const db = data.database_telemetry || {};
        const errors = data.error_rates || {};

        // 1. Host CPU
        const cpuPercent = Number(host.cpu_percent) || 0;
        const cpuValEl = document.getElementById('ai-chart-cpu-val');
        const cpuBarEl = document.getElementById('ai-chart-cpu-bar');
        const cpuTagEl = document.getElementById('ai-chart-cpu-tag');
        const cpuCoresEl = document.getElementById('ai-chart-cpu-cores');
        const cpuOsEl = document.getElementById('ai-chart-cpu-os');

        if (cpuValEl) cpuValEl.innerText = `${cpuPercent.toFixed(1)}%`;
        if (cpuBarEl) cpuBarEl.style.width = `${Math.min(100, Math.max(0, cpuPercent))}%`;
        if (cpuTagEl) {
          if (cpuPercent > 85) {
            cpuTagEl.className = 'ai-chart-tag danger';
            cpuTagEl.innerText = 'High Load';
          } else if (cpuPercent > 65) {
            cpuTagEl.className = 'ai-chart-tag warn';
            cpuTagEl.innerText = 'Elevated';
          } else {
            cpuTagEl.className = 'ai-chart-tag ok';
            cpuTagEl.innerText = 'Healthy';
          }
        }
        if (cpuCoresEl) cpuCoresEl.innerText = `${host.cpu_cores_logical || 0} Logical Cores (${host.cpu_cores_physical || 0} Physical)`;
        if (cpuOsEl) cpuOsEl.innerText = `${host.os || 'Host'} ${host.os_release || ''}`;

        // 2. RAM Memory
        const memPercent = Number(host.memory_percent) || 0;
        const ramValEl = document.getElementById('ai-chart-ram-val');
        const ramBarEl = document.getElementById('ai-chart-ram-bar');
        const ramTagEl = document.getElementById('ai-chart-ram-tag');
        const ramUsageEl = document.getElementById('ai-chart-ram-usage');
        const ramAvailEl = document.getElementById('ai-chart-ram-avail');

        if (ramValEl) ramValEl.innerText = `${memPercent.toFixed(1)}%`;
        if (ramBarEl) ramBarEl.style.width = `${Math.min(100, Math.max(0, memPercent))}%`;
        if (ramTagEl) {
          if (memPercent > 90) {
            ramTagEl.className = 'ai-chart-tag danger';
            ramTagEl.innerText = 'Critical';
          } else if (memPercent > 75) {
            ramTagEl.className = 'ai-chart-tag warn';
            ramTagEl.innerText = 'High';
          } else {
            ramTagEl.className = 'ai-chart-tag ok';
            ramTagEl.innerText = 'Optimal';
          }
        }
        if (ramUsageEl) {
          const usedGb = ((host.memory_used_mb || 0) / 1024).toFixed(2);
          const totalGb = ((host.memory_total_mb || 0) / 1024).toFixed(2);
          ramUsageEl.innerText = `${usedGb} GB / ${totalGb} GB`;
        }
        if (ramAvailEl) {
          const availGb = ((host.memory_available_mb || 0) / 1024).toFixed(2);
          ramAvailEl.innerText = `${availGb} GB Available`;
        }

        // 3. MySQL Database Health & Latency
        const latencyMs = Number(db.latency_ms) || 0;
        const dbValEl = document.getElementById('ai-chart-db-val');
        const dbBarEl = document.getElementById('ai-chart-db-bar');
        const dbTagEl = document.getElementById('ai-chart-db-tag');
        const dbThreadsEl = document.getElementById('ai-chart-db-threads');

        if (dbValEl) dbValEl.innerText = `${latencyMs.toFixed(1)} ms`;
        if (dbBarEl) {
          const barWidth = Math.min(100, Math.max(8, (latencyMs / 120) * 100));
          dbBarEl.style.width = `${barWidth}%`;
        }
        if (dbTagEl) {
          if (latencyMs > 150) {
            dbTagEl.className = 'ai-chart-tag danger';
            dbTagEl.innerText = 'Slow';
          } else if (latencyMs > 60) {
            dbTagEl.className = 'ai-chart-tag warn';
            dbTagEl.innerText = 'Moderate';
          } else {
            dbTagEl.className = 'ai-chart-tag ok';
            dbTagEl.innerText = 'Fast';
          }
        }
        if (dbThreadsEl) {
          const threads = (db.status_vars && db.status_vars.Threads_connected) || 0;
          dbThreadsEl.innerText = `${threads} Connected Client Threads`;
        }

        // 4. Critical Bottlenecks & Operational Alerts
        const pErrors = Number(errors.unresolved_payroll_errors_total) || 0;
        const incidents = Number(errors.open_security_incidents_total) || 0;
        const missedCalls = Number(errors.missed_call_center_calls_today) || 0;
        const totalAlerts = pErrors + incidents + missedCalls;

        const alertsValEl = document.getElementById('ai-chart-alerts-val');
        const alertsTagEl = document.getElementById('ai-chart-alerts-tag');
        const pErrorsEl = document.getElementById('ai-chart-payroll-errors');
        const incEl = document.getElementById('ai-chart-incidents');
        const missedEl = document.getElementById('ai-chart-missed-calls');

        if (alertsValEl) alertsValEl.innerText = `${totalAlerts} Total Alerts`;
        if (alertsTagEl) {
          if (totalAlerts > 10) {
            alertsTagEl.className = 'ai-chart-tag danger';
            alertsTagEl.innerText = 'Attention';
          } else if (totalAlerts > 0) {
            alertsTagEl.className = 'ai-chart-tag warn';
            alertsTagEl.innerText = 'Active Issues';
          } else {
            alertsTagEl.className = 'ai-chart-tag ok';
            alertsTagEl.innerText = 'Clear';
          }
        }
        if (pErrorsEl) pErrorsEl.innerText = `${pErrors} Errors`;
        if (incEl) incEl.innerText = `${incidents} Total (${errors.critical_or_high_severity_incidents || 0} Critical)`;
        if (missedEl) missedEl.innerText = `${missedCalls} Today`;

        if (forceRefresh && typeof showToast === 'function') {
          showToast('Live system telemetry & performance metrics updated', 'info');
        }
      } catch (err) {
        console.error('[SystemAIAssistant] Error loading telemetry charts:', err);
      } finally {
        if (refreshIcon) refreshIcon.style.animation = 'none';
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

  // ==============================================================================
  // Draggable Floating AI Widget (Launcher for Google Gemini AI Assistant)
  // ==============================================================================
  function initDraggableAIWidget() {
    const container = document.getElementById('ai-floating-widget-container');
    const widgetBtn = document.getElementById('ai-floating-widget');
    if (!container || !widgetBtn) return;
    if (!isSystemAdminUser()) {
      container.style.display = 'none';
      return;
    }
    if (container.dataset.dragInitialized === 'true') return;
    container.dataset.dragInitialized = 'true';

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    let hasMoved = false;
    const DRAG_THRESHOLD = 6;

    function clampPosition(left, top, elWidth, elHeight) {
      const padding = 12;
      const width = elWidth || container.offsetWidth || 210;
      const height = elHeight || container.offsetHeight || 48;
      const maxLeft = Math.max(padding, window.innerWidth - width - padding);
      const maxTop = Math.max(padding, window.innerHeight - height - padding);

      const clampedLeft = Math.max(padding, Math.min(maxLeft, left));
      const clampedTop = Math.max(padding, Math.min(maxTop, top));
      return { left: clampedLeft, top: clampedTop };
    }

    function setPosition(left, top) {
      container.style.bottom = 'auto';
      container.style.right = 'auto';
      container.style.left = `${Math.round(left)}px`;
      container.style.top = `${Math.round(top)}px`;
    }

    function savePosition(left, top) {
      try {
        localStorage.setItem('corpsec_ai_widget_pos', JSON.stringify({ left: Math.round(left), top: Math.round(top) }));
      } catch (e) {}
    }

    function restoreSavedPosition() {
      try {
        let saved = localStorage.getItem('corpsec_ai_widget_pos');
        // If AI position not set yet, check if there was a saved softphone pos from the screenshot
        if (!saved) {
          saved = localStorage.getItem('corpsec_softphone_pos');
        }
        if (saved) {
          const pos = JSON.parse(saved);
          if (typeof pos.left === 'number' && typeof pos.top === 'number') {
            const rect = container.getBoundingClientRect();
            const clamped = clampPosition(pos.left, pos.top, rect.width || 210, rect.height || 48);
            setPosition(clamped.left, clamped.top);
          }
        }
      } catch (e) {}
    }

    restoreSavedPosition();

    window.addEventListener('resize', () => {
      const rect = container.getBoundingClientRect();
      const clamped = clampPosition(rect.left, rect.top, rect.width, rect.height);
      setPosition(clamped.left, clamped.top);
    });

    let activeDragEl = null;

    function onPointerDown(e) {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest('button')) return;

      isDragging = true;
      hasMoved = false;
      activeDragEl = e.currentTarget;
      startX = e.clientX;
      startY = e.clientY;

      const rect = container.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      container.classList.add('is-dragging');

      try {
        if (activeDragEl && activeDragEl.setPointerCapture && e.pointerId !== undefined) {
          activeDragEl.setPointerCapture(e.pointerId);
        }
      } catch (err) {}

      document.addEventListener('pointermove', onPointerMove, { passive: false });
      document.addEventListener('pointerup', onPointerUp);
      document.addEventListener('pointercancel', onPointerUp);
    }

    function onPointerMove(e) {
      if (!isDragging) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (!hasMoved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        hasMoved = true;
      }

      if (hasMoved) {
        if (e.cancelable) e.preventDefault();
        const rect = container.getBoundingClientRect();
        const rawLeft = initialLeft + dx;
        const rawTop = initialTop + dy;
        const clamped = clampPosition(rawLeft, rawTop, rect.width, rect.height);
        setPosition(clamped.left, clamped.top);
      }
    }

    function onPointerUp(e) {
      if (!isDragging) return;
      isDragging = false;
      container.classList.remove('is-dragging');

      try {
        if (activeDragEl && activeDragEl.releasePointerCapture && e && e.pointerId !== undefined) {
          activeDragEl.releasePointerCapture(e.pointerId);
        }
      } catch (err) {}
      activeDragEl = null;

      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);

      if (hasMoved) {
        window.__aiWidgetJustDragged = true;
        setTimeout(() => {
          window.__aiWidgetJustDragged = false;
        }, 180);

        const rect = container.getBoundingClientRect();
        savePosition(rect.left, rect.top);
      } else {
        window.activateAIAssistantWidget();
      }
    }

    widgetBtn.addEventListener('pointerdown', onPointerDown);
  }

  window.initDraggableAIWidget = initDraggableAIWidget;

  window.activateAIAssistantWidget = function () {
    if (window.__aiWidgetJustDragged || !isSystemAdminUser()) return;

    // Switch to dedicated AI Assistant & Telemetry Charts page
    if (typeof switchTab === 'function') {
      switchTab('ai-assistant');
    }

    setTimeout(() => {
      const panel = document.getElementById('ai-assistant-panel');
      const input = document.getElementById('ai-assistant-input');

      if (panel) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
        panel.classList.remove('ai-panel-highlight');
        void panel.offsetWidth; // trigger reflow
        panel.classList.add('ai-panel-highlight');
        setTimeout(() => panel.classList.remove('ai-panel-highlight'), 2600);
      }

      if (input) {
        input.focus();
        input.classList.add('ai-input-focus-pulse');
        setTimeout(() => input.classList.remove('ai-input-focus-pulse'), 2000);
      }
    }, 120);
  };

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.SystemAIAssistant.init();
      initDraggableAIWidget();
    });
  } else {
    window.SystemAIAssistant.init();
    initDraggableAIWidget();
  }

})();
