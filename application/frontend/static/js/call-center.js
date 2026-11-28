/**
 * CorpSec Call Centre System - Frontend Controller & Softphone Engine
 * - Web Audio API DTMF Synthesizer & Tone Generator
 * - WebSocket Client for live queue & call events
 * - Persistent Floating / Docked Softphone Dialer Widget
 * - ACD Queues, Virtual Numbers, CRM Contacts, Recordings & KPIs
 */

(function () {
  'use strict';

  // Global Call Center State
  window.CallCenter = {
    ws: null,
    audioCtx: null,
    ringOscillators: null,
    holdMusicInterval: null,
    currentCall: null,
    callTimerInterval: null,
    callDurationSeconds: 0,
    agentStatus: 'AVAILABLE',
    activeSubTab: 'phone',
    isSoftphoneOpen: false,
    isMuted: false,
    isOnHold: false,
    overviewData: null,
    lookupDebounceTimer: null,
    sms: {
      mode: 'ALL',
      allGuards: [],
      selectedGuardIds: new Set(),
      siteId: null,
      history: []
    }
  };

  /* ==========================================================================
     RBAC & Authentication Helpers (Restricts Call Recordings to Admin Only)
     ========================================================================== */
  function getAuthToken() {
    return localStorage.getItem('corpsec_token') ||
           localStorage.getItem('token') ||
           (typeof authToken !== 'undefined' ? authToken : '');
  }

  function isCurrentUserAdmin() {
    const user = (typeof window.getLoggedInUser === 'function') ? window.getLoggedInUser() : null;
    const role = (user && user.role) ? String(user.role).trim().toUpperCase() : (localStorage.getItem('user_role') || '').trim().toUpperCase();
    return role === 'ADMIN' || role === 'SYSTEM ADMIN';
  }

  function getAuthenticatedAudioUrl(url) {
    if (!url) return '';
    const token = getAuthToken();
    if (!token) return url;
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}token=${encodeURIComponent(token)}`;
  }

  /* ==========================================================================
     API Helper: Auto-resolves tokens and unwraps JSON responses
     ========================================================================== */
  async function callCenterFetch(endpoint, options = {}) {
    options = options || {};
    options.headers = options.headers || {};

    const token = localStorage.getItem('corpsec_token') ||
                  (typeof authToken !== 'undefined' ? authToken : '');

    if (!token && !endpoint.includes('/auth/')) {
      throw new Error('Not authenticated');
    }

    if (token && !options.headers['Authorization']) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const apiBase = typeof API_BASE !== 'undefined' ? API_BASE : '/api/v1';
    let cleanEndpoint = endpoint;
    if (apiBase && cleanEndpoint.startsWith(apiBase)) {
      cleanEndpoint = cleanEndpoint.substring(apiBase.length);
    }
    if (!cleanEndpoint.startsWith('/')) {
      cleanEndpoint = '/' + cleanEndpoint;
    }
    const fullUrl = endpoint.startsWith('http') ? endpoint : `${apiBase}${cleanEndpoint}`;

    const res = await fetch(fullUrl, options);

    if (res.status === 401) {
      if (typeof logout === 'function') logout();
      throw new Error('Unauthorized');
    }

    if (!res.ok) {
      let detail = `Request failed with status ${res.status}`;
      try {
        const errJson = await res.json();
        detail = errJson.detail || errJson.message || detail;
      } catch (e) {}
      throw new Error(detail);
    }

    // Return parsed JSON (or empty object if empty body)
    try {
      return await res.json();
    } catch (e) {
      return {};
    }
  }

  // Export so inline scripts in index.html can reuse it
  window.callCenterFetch = callCenterFetch;

  /* ==========================================================================
     1. Web Audio API Synthesizer (DTMF Keypad, Ringtone, Hold Music)
     ========================================================================== */
  function getAudioContext() {
    if (!window.CallCenter.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        window.CallCenter.audioCtx = new AudioCtx();
      }
    }
    if (window.CallCenter.audioCtx && window.CallCenter.audioCtx.state === 'suspended') {
      window.CallCenter.audioCtx.resume();
    }
    return window.CallCenter.audioCtx;
  }

  // Standard DTMF Frequencies (Row x Column)
  const DTMF_FREQS = {
    '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
    '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
    '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
    '*': [941, 1209], '0': [941, 1336], '#': [941, 1477]
  };

  window.playDTMFTone = function (digit) {
    const ctx = getAudioContext();
    if (!ctx || !DTMF_FREQS[digit]) return;

    try {
      const freqs = DTMF_FREQS[digit];
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.value = freqs[0];
      osc2.frequency.value = freqs[1];

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(ctx.currentTime + 0.16);
      osc2.stop(ctx.currentTime + 0.16);
    } catch (e) {
      console.warn('Audio tone error', e);
    }
  };

  function startRingingAudio() {
    stopRingingAudio();
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.value = 440; // US ring cadence standard
      osc2.frequency.value = 480;

      gain.gain.setValueAtTime(0.06, ctx.currentTime);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start();
      osc2.start();
      window.CallCenter.ringOscillators = { osc1, osc2, gain };
    } catch (e) {
      console.warn('Ringtone error', e);
    }
  }

  function stopRingingAudio() {
    if (window.CallCenter.ringOscillators) {
      try {
        window.CallCenter.ringOscillators.osc1.stop();
        window.CallCenter.ringOscillators.osc2.stop();
        window.CallCenter.ringOscillators.gain.disconnect();
      } catch (e) {}
      window.CallCenter.ringOscillators = null;
    }
  }

  function startHoldMusic() {
    stopHoldMusic();
    const ctx = getAudioContext();
    if (!ctx) return;

    const notes = [261.63, 329.63, 392.00, 523.25, 392.00, 329.63]; // C-E-G-C harmonic progression
    let noteIdx = 0;

    window.CallCenter.holdMusicInterval = setInterval(() => {
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = notes[noteIdx % notes.length];
        gain.gain.setValueAtTime(0.03, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
        noteIdx++;
      } catch (e) {}
    }, 600);
  }

  function stopHoldMusic() {
    if (window.CallCenter.holdMusicInterval) {
      clearInterval(window.CallCenter.holdMusicInterval);
      window.CallCenter.holdMusicInterval = null;
    }
  }

  /* ==========================================================================
     2. WebSocket Connection for Real-Time ACD Events
     ========================================================================== */
  function initCallCenterWebSocket() {
    if (window.CallCenter.ws && (window.CallCenter.ws.readyState === WebSocket.OPEN || window.CallCenter.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const token = localStorage.getItem('corpsec_token') ||
                  (typeof authToken !== 'undefined' ? authToken : '');

    if (!token || token === 'null' || token === 'undefined' || token.trim() === '' || (typeof isAuthSessionVerified !== 'undefined' && !isAuthSessionVerified)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/v1/call-center/ws?token=${encodeURIComponent(token)}`;

    try {
      const ws = new WebSocket(wsUrl);
      window.CallCenter.ws = ws;

      ws.onopen = () => {
        console.log('Call Center WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (e) {
          console.error('WS Parse error', e);
        }
      };

      ws.onclose = () => {
        window.CallCenter.ws = null;
        if (localStorage.getItem('corpsec_token') && (typeof isAuthSessionVerified === 'undefined' || isAuthSessionVerified)) {
          setTimeout(initCallCenterWebSocket, 5000);
        }
      };
    } catch (e) {
      console.warn('WebSocket init exception', e);
    }
  }
  window.initCallCenterWebSocketIfReady = function () {
    initCallCenterWebSocket();
    fetchCurrentAgentStatus();
  };

  function handleWebSocketMessage(msg) {
    if (!msg || !msg.event) return;

    if (msg.event === 'call:incoming') {
      onIncomingCallReceived(msg.data);
    } else if (msg.event === 'call:answered') {
      if (window.CallCenter.currentCall && (
        !msg.data.call_id ||
        window.CallCenter.currentCall.id === msg.data.call_id ||
        window.CallCenter.currentCall.call_sid === msg.data.call_sid
      )) {
        onCallConnected(msg.data);
      }
    } else if (msg.event === 'call:ended') {
      if (window.CallCenter.currentCall && (
        !msg.data.call_id ||
        window.CallCenter.currentCall.id === msg.data.call_id ||
        window.CallCenter.currentCall.call_sid === msg.data.call_sid
      )) {
        onCallTerminated(msg.data);
      }
      refreshActiveViews();
    } else if (msg.event === 'agent:status_updated') {
      updateAgentStatusUI(msg.data.status);
    } else if (msg.event === 'queue:call_waiting') {
      if (typeof showToast === 'function') {
        showToast(`Caller waiting in queue: ${msg.data.queue_name || 'General'} (${msg.data.caller_number})`, 'info');
      }
      refreshActiveViews();
    } else if (msg.event === 'recording:ready') {
      if (typeof showToast === 'function') {
        showToast('⏺️ Call audio recording saved & ready for playback', 'success');
      }
      if (window.CallCenter.activeSubTab === 'recordings') loadCallRecordings();
      if (window.CallCenter.activeSubTab === 'history') loadCallHistory();
    }
  }

  /* ==========================================================================
     3. Agent Status Management
     ========================================================================== */
  window.toggleAgentStatusDropdown = function (event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('dropdown-agent-status');
    if (dropdown) {
      const isVisible = dropdown.style.display === 'block';
      dropdown.style.display = isVisible ? 'none' : 'block';
    }
  };

  window.setCallCenterAgentStatus = async function (status) {
    const dropdown = document.getElementById('dropdown-agent-status');
    if (dropdown) dropdown.style.display = 'none';

    try {
      const res = await callCenterFetch('/call-center/agent-status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: status })
      });

      const updatedStatus = res.agent_status || res.status || status;
      updateAgentStatusUI(updatedStatus);
      if (typeof showToast === 'function') {
        showToast(`Agent status updated: ${updatedStatus}`, 'success');
      }
    } catch (e) {
      console.error('Failed to update agent status', e);
      if (typeof showToast === 'function') {
        showToast('Error updating status: ' + (e.message || ''), 'danger');
      }
    }
  };

  function updateAgentStatusUI(rawStatus) {
    const status = (typeof rawStatus === 'string') ? rawStatus.toUpperCase().trim() : 'AVAILABLE';
    window.CallCenter.agentStatus = status;

    const pill = document.getElementById('agent-status-pill');
    const label = document.getElementById('agent-status-label');
    const ccHeaderPill = document.getElementById('cc-workspace-agent-pill');

    const statusMap = {
      'AVAILABLE': { text: 'Online / Available', cls: 'status-available' },
      'ON_CALL': { text: 'On Call', cls: 'status-on_call' },
      'BREAK': { text: 'On Break', cls: 'status-break' },
      'OFFLINE': { text: 'Offline', cls: 'status-offline' }
    };

    const cfg = statusMap[status] || statusMap['OFFLINE'];

    if (pill) {
      pill.className = `agent-status-pill ${cfg.cls}`;
    }
    if (label) {
      label.innerText = cfg.text;
    }
    if (ccHeaderPill) {
      ccHeaderPill.className = `agent-status-pill ${cfg.cls}`;
      ccHeaderPill.innerHTML = `<span class="status-indicator-dot"></span> <span>${cfg.text}</span>`;
    }
  }

  async function fetchCurrentAgentStatus() {
    const token = localStorage.getItem('corpsec_token') || (typeof authToken !== 'undefined' ? authToken : '');
    if (!token || token === 'null' || token === 'undefined' || (typeof isAuthSessionVerified !== 'undefined' && !isAuthSessionVerified)) {
      return;
    }
    try {
      const res = await callCenterFetch('/call-center/agent-status');
      if (res && res.status) {
        updateAgentStatusUI(res.status);
      }
    } catch (e) {
      console.warn('Could not fetch agent status', e);
    }
  }

  /* ==========================================================================
     4. Persistent Softphone Widget Controls & Draggable Engine
     ========================================================================== */
  function ensureSoftphoneInViewport(container, targetEl) {
    if (!container) return;
    const padding = 12;
    const isExpanded = targetEl && targetEl.id === 'softphone-expanded';
    const minW = isExpanded ? 340 : 180;
    const minH = isExpanded ? 500 : 48;
    const rect = container.getBoundingClientRect();
    const w = Math.max(rect.width || 0, minW);
    const h = Math.max(rect.height || 0, minH);

    // If container already has explicit left/top coordinates
    if (container.style.left || container.style.top) {
      let curLeft = parseFloat(container.style.left) || rect.left;
      let curTop = parseFloat(container.style.top) || rect.top;

      const maxLeft = Math.max(padding, window.innerWidth - w - padding);
      const maxTop = Math.max(padding, window.innerHeight - h - padding);

      const clampedLeft = Math.max(padding, Math.min(maxLeft, curLeft));
      const clampedTop = Math.max(padding, Math.min(maxTop, curTop));

      container.style.left = `${Math.round(clampedLeft)}px`;
      container.style.top = `${Math.round(clampedTop)}px`;
      container.style.bottom = 'auto';
      container.style.right = 'auto';
    } else {
      // Default: bottom-right anchored. Ensure top doesn't overflow above screen
      if (rect.top < padding) {
        container.style.bottom = 'auto';
        container.style.top = `${padding}px`;
      }
    }
  }

  function initDraggableSoftphone() {
    const container = document.getElementById('softphone-widget-container');
    const minimized = document.getElementById('softphone-minimized');
    const header = document.querySelector('.softphone-top-header');

    if (!container || !minimized) return;
    if (container.dataset.dragInitialized === 'true') return;
    container.dataset.dragInitialized = 'true';

    // The unattached softphone dialer starts closed unless an active call is ongoing
    const isCallActive = !!(window.CallCenter && (window.CallCenter.currentCall || window.CallCenter.callTimerInterval));
    if (!isCallActive) {
      container.style.display = 'none';
      minimized.style.display = 'none';
    }

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;
    let hasMoved = false;
    const DRAG_THRESHOLD = 6;

    function clampPosition(left, top, elWidth, elHeight) {
      const padding = 12;
      const width = elWidth || (container.offsetWidth > 0 ? container.offsetWidth : 340);
      const height = elHeight || (container.offsetHeight > 0 ? container.offsetHeight : 480);
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
        localStorage.setItem('corpsec_softphone_pos', JSON.stringify({ left: Math.round(left), top: Math.round(top) }));
      } catch (e) {}
    }

    function restoreSavedPosition() {
      try {
        const saved = localStorage.getItem('corpsec_softphone_pos');
        if (saved) {
          const pos = JSON.parse(saved);
          if (typeof pos.left === 'number' && typeof pos.top === 'number') {
            const rect = container.getBoundingClientRect();
            const clamped = clampPosition(pos.left, pos.top, rect.width || 340, rect.height || 480);
            setPosition(clamped.left, clamped.top);
          }
        }
      } catch (e) {}
    }

    // Restore saved position on load
    restoreSavedPosition();

    // Keep widget on screen when viewport is resized
    window.addEventListener('resize', () => {
      ensureSoftphoneInViewport(container, document.getElementById('softphone-expanded'));
    });

    let activeDragEl = null;

    function onPointerDown(e) {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest('button') || e.target.closest('input') || e.target.closest('select')) return;

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
        window.__softphoneJustDragged = true;
        setTimeout(() => {
          window.__softphoneJustDragged = false;
        }, 180);

        const rect = container.getBoundingClientRect();
        savePosition(rect.left, rect.top);
      } else {
        // Direct tap on minimized pill: immediately open unattached softphone!
        if (minimized.contains(e.target) || e.currentTarget === minimized) {
          window.toggleSoftphone(true, true);
        }
      }
    }

    minimized.addEventListener('pointerdown', onPointerDown);
    if (header) {
      header.addEventListener('pointerdown', onPointerDown);
    }
  }

  window.initDraggableSoftphone = initDraggableSoftphone;

  window.toggleSoftphone = function (forceState, ignoreDragCheck = false) {
    if (!ignoreDragCheck && window.__softphoneJustDragged) return;

    const widget = document.getElementById('softphone-widget-container');
    const expanded = document.getElementById('softphone-expanded');
    const minimized = document.getElementById('softphone-minimized');

    if (!widget || !expanded || !minimized) {
      console.warn('Softphone elements not found in DOM');
      return;
    }

    const isCurrentlyExpanded = expanded.style.display === 'flex' || (!expanded.style.display && window.getComputedStyle(expanded).display === 'flex');
    const shouldOpen = (typeof forceState === 'boolean') ? forceState : !isCurrentlyExpanded;

    window.CallCenter.isSoftphoneOpen = shouldOpen;

    if (shouldOpen) {
      widget.style.display = 'block';
      expanded.style.display = 'flex';
      minimized.style.display = 'none';
      try { getAudioContext(); } catch (err) {} // user gesture unlocks audio

      requestAnimationFrame(() => {
        ensureSoftphoneInViewport(widget, expanded);
        const input = document.getElementById('softphone-number-input');
        if (input) input.focus();
      });
    } else {
      // Unattached softphone closing logic:
      const isCallActive = !!(window.CallCenter && (window.CallCenter.currentCall || window.CallCenter.callTimerInterval));
      const isRinging = minimized.classList.contains('ringing');

      if (isCallActive || isRinging) {
        // While an active telecom call is in progress or ringing, minimize to the active call pill
        expanded.style.display = 'none';
        minimized.style.display = 'flex';
        widget.style.display = 'block';
        requestAnimationFrame(() => {
          ensureSoftphoneInViewport(widget, minimized);
        });
      } else {
        // No active call: completely close the unattached softphone! No idle pill left on dashboard!
        expanded.style.display = 'none';
        minimized.style.display = 'none';
        widget.style.display = 'none';
      }
    }
  };

  window.softphoneKeyPress = function (digit) {
    playDTMFTone(digit);
    const input = document.getElementById('softphone-number-input');
    if (!input) return;
    input.value += digit;
    onSoftphoneNumberChange(input.value);
  };

  window.softphoneBackspace = function () {
    const input = document.getElementById('softphone-number-input');
    if (!input) return;
    input.value = input.value.slice(0, -1);
    onSoftphoneNumberChange(input.value);
  };

  window.softphoneClear = function () {
    const input = document.getElementById('softphone-number-input');
    if (input) input.value = '';
    onSoftphoneNumberChange('');
  };

  function onSoftphoneNumberChange(number) {
    clearTimeout(window.CallCenter.lookupDebounceTimer);
    const preview = document.getElementById('softphone-contact-preview');
    if (!preview) return;

    const trimmed = (number || '').trim();
    if (trimmed.length < 3) {
      preview.innerText = '';
      return;
    }

    window.CallCenter.lookupDebounceTimer = setTimeout(async () => {
      try {
        const contact = await callCenterFetch(`/call-center/contacts/lookup?phone=${encodeURIComponent(trimmed)}`);
        if (contact && contact.found && contact.full_name) {
          const org = contact.company_or_site || 'Client Contact';
          preview.innerHTML = `👤 <strong>${contact.full_name}</strong> (${org})`;
        } else {
          preview.innerText = 'Unsaved Contact';
        }
      } catch (e) {
        preview.innerText = '';
      }
    }, 300);
  }

  // Helper to format Kenyan phone numbers to E.164 (+254...)
  function formatPhoneNumberE164(phone) {
    if (!phone) return '';
    const clean = String(phone).replace(/[^\d+]/g, '').trim();
    if (clean.startsWith('+')) return clean;
    if (clean.startsWith('254')) return '+' + clean;
    if (clean.startsWith('0') && clean.length >= 10) return '+254' + clean.slice(1);
    return '+254' + clean;
  }

  // Dial Outbound Call
  window.softphoneDialCall = async function (overrideNumber) {
    const input = document.getElementById('softphone-number-input');
    const rawDestination = overrideNumber || (input ? input.value.trim() : '');

    if (!rawDestination) {
      if (typeof showToast === 'function') showToast('Please enter a phone number to dial', 'warning');
      return;
    }

    const destination = formatPhoneNumberE164(rawDestination);
    if (destination.length < 10) {
      if (typeof showToast === 'function') showToast(`Invalid phone number: ${rawDestination}. Please enter a valid 10-digit number.`, 'warning');
      return;
    }

    window.toggleSoftphone(true);
    startRingingAudio();

    try {
      const res = await callCenterFetch('/call-center/calls/dial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination_number: destination,
          caller_id_number: '+254 711 082 143'
        })
      });

      if (res && res.call_id) {
        window.CallCenter.currentCall = {
          id: res.call_id,
          call_sid: res.call_sid,
          caller_name: res.recipient_name || destination,
          caller_number: destination,
          agent_phone: res.agent_phone,
          status: 'DIALING'
        };
        showActiveCallScreen(window.CallCenter.currentCall);
        setCallCenterAgentStatus('ON_CALL');

        if (typeof showToast === 'function') {
          showToast(res.message || `Outbound bridge active: calling your phone (${res.agent_phone}) to connect to ${destination}.`, 'info');
        }
      } else {
        stopRingingAudio();
        if (typeof showToast === 'function') showToast('Failed to initiate outbound call: empty response from server', 'danger');
      }
    } catch (e) {
      stopRingingAudio();
      console.error('Call dial error', e);
      const errMsg = e.message || 'Error connecting call';
      if (typeof showToast === 'function') showToast(errMsg, 'danger');
    }
  };

  // Incoming Call Handler
  function onIncomingCallReceived(callData) {
    window.CallCenter.currentCall = callData;
    window.toggleSoftphone(true);
    startRingingAudio();

    const banner = document.getElementById('softphone-incoming-banner');
    const incName = document.getElementById('incoming-caller-name');
    const incNum = document.getElementById('incoming-caller-number');
    const incQueue = document.getElementById('incoming-caller-queue');

    if (banner) banner.style.display = 'block';
    if (incName) incName.innerText = callData.caller_name || 'Incoming Caller';
    if (incNum) incNum.innerText = callData.caller_number || 'Unknown';
    if (incQueue) incQueue.innerText = `Queue: ${callData.queue_name || 'General'}`;

    const minBtn = document.getElementById('softphone-minimized');
    if (minBtn) minBtn.classList.add('ringing');
  }

  // Answer Call
  window.softphoneAnswerCall = async function () {
    stopRingingAudio();
    const banner = document.getElementById('softphone-incoming-banner');
    if (banner) banner.style.display = 'none';

    const minBtn = document.getElementById('softphone-minimized');
    if (minBtn) minBtn.classList.remove('ringing');

    if (!window.CallCenter.currentCall) return;

    try {
      const res = await callCenterFetch(`/call-center/calls/${window.CallCenter.currentCall.id || window.CallCenter.currentCall.call_id}/answer`, {
        method: 'POST'
      });

      if (res) {
        showActiveCallScreen(window.CallCenter.currentCall);
        setCallCenterAgentStatus('ON_CALL');
      }
    } catch (e) {
      console.error('Error answering call', e);
    }
  };

  // Decline Call
  window.softphoneDeclineCall = async function () {
    stopRingingAudio();
    const banner = document.getElementById('softphone-incoming-banner');
    if (banner) banner.style.display = 'none';

    const minBtn = document.getElementById('softphone-minimized');
    if (minBtn) minBtn.classList.remove('ringing');

    const widget = document.getElementById('softphone-widget-container');
    const expanded = document.getElementById('softphone-expanded');
    if (widget && expanded && (expanded.style.display === 'none' || !window.CallCenter.isSoftphoneOpen)) {
      widget.style.display = 'none';
      if (minBtn) minBtn.style.display = 'none';
    }

    if (!window.CallCenter.currentCall) return;

    try {
      const callId = window.CallCenter.currentCall.id || window.CallCenter.currentCall.call_id;
      await callCenterFetch(`/call-center/calls/${callId}/hangup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ disposition: 'REJECTED', notes: 'Call declined by agent' })
      });
      window.CallCenter.currentCall = null;
      hideActiveCallScreen();
    } catch (e) {}
  };

  // Call Connected Screen
  function showActiveCallScreen(call) {
    stopRingingAudio();

    const keypadScreen = document.getElementById('softphone-keypad-view');
    const activeScreen = document.getElementById('softphone-active-call-view');

    if (keypadScreen) keypadScreen.style.display = 'none';
    if (activeScreen) activeScreen.style.display = 'block';

    const contactEl = document.getElementById('active-call-contact');
    const numberEl = document.getElementById('active-call-number');
    const avatarEl = document.getElementById('active-call-avatar');

    if (contactEl) contactEl.innerText = call.caller_name || 'Caller';
    if (numberEl) numberEl.innerText = call.caller_number || '';
    if (avatarEl) avatarEl.classList.add('connected');

    // Start timer
    window.CallCenter.callDurationSeconds = 0;
    clearInterval(window.CallCenter.callTimerInterval);
    updateCallTimerDisplay();
    window.CallCenter.callTimerInterval = setInterval(() => {
      window.CallCenter.callDurationSeconds++;
      updateCallTimerDisplay();
    }, 1000);

    const minBtn = document.getElementById('softphone-minimized');
    if (minBtn) {
      minBtn.classList.add('on-call');
      document.getElementById('minimized-call-status').innerText = `On Call (${call.caller_number})`;
    }
  }

  function updateCallTimerDisplay() {
    const timerEl = document.getElementById('active-call-timer');
    if (!timerEl) return;
    const s = window.CallCenter.callDurationSeconds;
    const mins = String(Math.floor(s / 60)).padStart(2, '0');
    const secs = String(s % 60).padStart(2, '0');
    timerEl.innerText = `${mins}:${secs}`;
  }

  function hideActiveCallScreen() {
    clearInterval(window.CallCenter.callTimerInterval);
    window.CallCenter.callTimerInterval = null;
    window.CallCenter.callDurationSeconds = 0;
    stopHoldMusic();
    stopRingingAudio();

    const keypadScreen = document.getElementById('softphone-keypad-view');
    const activeScreen = document.getElementById('softphone-active-call-view');

    if (keypadScreen) keypadScreen.style.display = 'block';
    if (activeScreen) activeScreen.style.display = 'none';

    const minBtn = document.getElementById('softphone-minimized');
    if (minBtn) {
      minBtn.classList.remove('on-call', 'ringing');
      minBtn.style.display = 'none';
    }

    // Hide unattached softphone completely if it is not currently expanded
    const expanded = document.getElementById('softphone-expanded');
    const widget = document.getElementById('softphone-widget-container');
    if (widget) {
      if (!window.CallCenter.isSoftphoneOpen || !expanded || expanded.style.display === 'none') {
        widget.style.display = 'none';
      }
    }
  }

  // Toggle Mute
  window.softphoneToggleMute = function () {
    window.CallCenter.isMuted = !window.CallCenter.isMuted;
    const btn = document.getElementById('btn-softphone-mute');
    if (btn) {
      if (window.CallCenter.isMuted) {
        btn.classList.add('muted');
        btn.querySelector('.label').innerText = 'Unmute';
      } else {
        btn.classList.remove('muted');
        btn.querySelector('.label').innerText = 'Mute';
      }
    }
  };

  // Toggle Hold
  window.softphoneToggleHold = async function () {
    if (!window.CallCenter.currentCall) return;
    const callId = window.CallCenter.currentCall.id || window.CallCenter.currentCall.call_id;

    window.CallCenter.isOnHold = !window.CallCenter.isOnHold;
    const btn = document.getElementById('btn-softphone-hold');

    try {
      await callCenterFetch(`/call-center/calls/${callId}/hold`, {
        method: 'POST'
      });

      if (window.CallCenter.isOnHold) {
        if (btn) {
          btn.classList.add('active');
          btn.querySelector('.label').innerText = 'Unhold';
        }
        startHoldMusic();
      } else {
        if (btn) {
          btn.classList.remove('active');
          btn.querySelector('.label').innerText = 'Hold';
        }
        stopHoldMusic();
      }
    } catch (e) {
      console.error('Hold error', e);
    }
  };

  // Open Transfer Modal
  window.softphoneOpenTransfer = function () {
    if (!window.CallCenter.currentCall) return;
    const modal = document.getElementById('modal-call-transfer');
    if (modal) modal.style.display = 'flex';
  };

  window.softphoneExecuteTransfer = async function () {
    const queueSelect = document.getElementById('transfer-queue-select');
    const targetQueueId = queueSelect ? parseInt(queueSelect.value) : null;

    if (!window.CallCenter.currentCall || !targetQueueId) return;
    const callId = window.CallCenter.currentCall.id || window.CallCenter.currentCall.call_id;

    try {
      await callCenterFetch(`/call-center/calls/${callId}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_type: 'QUEUE',
          target_id: targetQueueId,
          notes: 'Transfer from softphone'
        })
      });

      if (typeof showToast === 'function') showToast('Call successfully transferred to queue', 'success');
      document.getElementById('modal-call-transfer').style.display = 'none';
      softphoneHangup();
    } catch (e) {
      if (typeof showToast === 'function') showToast('Transfer failed: ' + (e.message || ''), 'danger');
    }
  };

  // Hangup Call
  window.softphoneHangup = async function () {
    if (!window.CallCenter.currentCall) {
      hideActiveCallScreen();
      return;
    }

    try {
      const callId = window.CallCenter.currentCall.id || window.CallCenter.currentCall.call_id;
      const notesEl = document.getElementById('active-call-quick-notes');
      const dispEl = document.getElementById('active-call-disposition');

      await callCenterFetch(`/call-center/calls/${callId}/hangup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          disposition: dispEl ? dispEl.value : 'RESOLVED',
          notes: notesEl ? notesEl.value : 'Call completed'
        })
      });

      if (typeof showToast === 'function') showToast('Call ended', 'info');
    } catch (e) {
      console.error('Hangup error', e);
    } finally {
      window.CallCenter.currentCall = null;
      hideActiveCallScreen();
      setCallCenterAgentStatus('AVAILABLE');
      refreshActiveViews();
    }
  };

  function onCallConnected(data) {
    stopRingingAudio();
    if (window.CallCenter.currentCall) {
      window.CallCenter.currentCall.status = 'IN_PROGRESS';
      const numberEl = document.getElementById('active-call-number');
      if (numberEl) {
        const destNum = (data && data.recipient_number) || window.CallCenter.currentCall.caller_number || '';
        numberEl.innerText = `${destNum} (Connected)`;
      }
    }
  }

  function onCallTerminated(data) {
    window.CallCenter.currentCall = null;
    hideActiveCallScreen();
    setCallCenterAgentStatus('AVAILABLE');
  }

  /* ==========================================================================
     5. Call Center Main Sub-Tab Switcher
     ========================================================================== */
  window.switchCallCenterSubTab = function (subTabId) {
    window.CallCenter.activeSubTab = subTabId;

    // Update active class on sub-sidebar items
    document.querySelectorAll('.cc-sub-nav-item').forEach(el => el.classList.remove('active'));
    const activeItem = document.querySelector(`.cc-sub-nav-item[data-subtab="${subTabId}"]`);
    if (activeItem) activeItem.classList.add('active');

    // Hide all sub-views and show active
    document.querySelectorAll('.cc-subview').forEach(v => v.style.display = 'none');
    const targetView = document.getElementById(`cc-view-${subTabId}`);
    if (targetView) targetView.style.display = 'block';

    // Refresh view content
    if (subTabId === 'phone') renderPhoneView();
    else if (subTabId === 'history') loadCallHistory();
    else if (subTabId === 'numbers') loadPhoneNumbers();
    else if (subTabId === 'queues') loadCallQueues();
    else if (subTabId === 'contacts') loadCallerContacts();
    else if (subTabId === 'ivr') renderIVRView();
    else if (subTabId === 'team') loadTeamPresence();
    else if (subTabId === 'reports') loadAnalyticsReports();
    else if (subTabId === 'recordings') loadCallRecordings();
    else if (subTabId === 'missed') loadMissedCalls();
    else if (subTabId === 'sms') loadGuardSMSView();
    else if (subTabId === 'settings') renderSettingsView();
  };

  function refreshActiveViews() {
    loadCallCenterOverview();
    if (window.CallCenter.activeSubTab === 'history') loadCallHistory();
    if (window.CallCenter.activeSubTab === 'queues') loadCallQueues();
    if (window.CallCenter.activeSubTab === 'team') loadTeamPresence();
    if (window.CallCenter.activeSubTab === 'missed') loadMissedCalls();
    if (window.CallCenter.activeSubTab === 'reports') loadAnalyticsReports();
    if (window.CallCenter.activeSubTab === 'recordings') loadCallRecordings();
    if (window.CallCenter.activeSubTab === 'sms') loadGuardSMSView();
  }

  /* ==========================================================================
     6. KPI Summary & Overview - Direct from Database
     ========================================================================== */
  window.loadCallCenterOverview = async function () {
    try {
      const data = await callCenterFetch('/call-center/overview');
      if (!data) return;
      window.CallCenter.overviewData = data;

      // Update KPI cards
      const totalCallsEl = document.getElementById('kpi-total-calls');
      const waitTimeEl = document.getElementById('kpi-avg-wait');
      const activeAgentsEl = document.getElementById('kpi-active-agents');
      const missedCallsEl = document.getElementById('kpi-missed-calls');

      const totalCalls = data.total_calls_today ?? 0;
      const waitTime = data.avg_wait_time_seconds ?? data.average_wait_time_seconds ?? 0;
      const activeAgents = data.active_agents_available ?? data.available_agents_count ?? data.active_agents_count ?? 0;
      const missedCalls = data.missed_today ?? data.missed_calls_today ?? 0;

      if (totalCallsEl) totalCallsEl.innerText = totalCalls;
      if (waitTimeEl) waitTimeEl.innerText = `${Math.round(waitTime)}s`;
      if (activeAgentsEl) activeAgentsEl.innerText = activeAgents;
      if (missedCallsEl) missedCallsEl.innerText = missedCalls;

      // Update badge counts in sub-sidebar
      const badgeNumbers = document.getElementById('badge-cc-numbers');
      const badgeQueues = document.getElementById('badge-cc-queues');
      const badgeTeam = document.getElementById('badge-cc-team');
      const badgeMissed = document.getElementById('badge-cc-missed');

      if (badgeNumbers) badgeNumbers.innerText = data.virtual_numbers_count ?? 0;
      if (badgeQueues) badgeQueues.innerText = data.active_queues_count ?? (data.active_queues ? data.active_queues.length : 0);
      if (badgeTeam) badgeTeam.innerText = activeAgents;
      if (badgeMissed) badgeMissed.innerText = missedCalls;
    } catch (e) {
      console.warn('Overview load error', e);
    }
  };

  /* ==========================================================================
     7. Sub-View: Phone & Live Dashboard
     ========================================================================== */
  function renderPhoneView() {
    loadCallCenterOverview();
    loadQueuesLiveWidget();
    loadRecentCallsMiniWidget();
  }

  async function loadQueuesLiveWidget() {
    const container = document.getElementById('cc-live-queues-list');
    if (!container) return;

    try {
      const queues = await callCenterFetch('/call-center/queues');
      if (!queues || !queues.length) {
        container.innerHTML = `<div style="padding:16px; color:#64748B; text-align:center;">No active queues configured</div>`;
        return;
      }

      container.innerHTML = queues.map(q => {
        const waitingCount = q.waiting_callers_count ?? q.waiting_callers ?? 0;
        const strategy = q.strategy || q.routing_strategy || 'ROUND_ROBIN';

        return `
          <div style="background:#FFFFFF; border:1px solid #E2E8F0; border-radius:12px; padding:14px 18px; margin-bottom:12px; display:flex; align-items:center; justify-content:space-between;">
            <div>
              <div style="font-weight:700; font-size:14px; color:#0F172A; display:flex; align-items:center; gap:8px;">
                <span>🎧 ${q.name}</span>
                <span class="cc-badge" style="background:#F1F5F9; color:#475569;">${strategy}</span>
              </div>
              <div style="font-size:12px; color:#64748B; margin-top:4px;">
                ${q.description || 'Priority Queue'} • Max Wait: ${q.max_wait_time_seconds}s
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:16px;">
              <div style="text-align:right;">
                <div style="font-size:18px; font-weight:800; color:${waitingCount > 0 ? '#EF4444' : '#10B981'};">
                  ${waitingCount}
                </div>
                <div style="font-size:11px; color:#64748B;">Waiting</div>
              </div>
              <button class="btn btn-secondary" onclick="simulateIncomingCallModal(${q.id}, '${q.name}')" style="font-size:11px; padding:6px 12px; background:#F0FDF4; border-color:#86EFAC; color:#15803D; font-weight:700;">
                ⚡ Test Call
              </button>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      container.innerHTML = `<div style="padding:14px; color:#EF4444;">Error loading queues from database</div>`;
    }
  }

  async function loadRecentCallsMiniWidget() {
    const list = document.getElementById('cc-quick-recent-calls');
    if (!list) return;

    try {
      const calls = await callCenterFetch('/call-center/calls?limit=5');
      if (!calls || !calls.length) {
        list.innerHTML = `<div style="padding:12px; color:#64748B; font-size:12px;">No recent calls</div>`;
        return;
      }

      list.innerHTML = calls.map(c => `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:10px 0; border-bottom:1px solid #F1F5F9;">
          <div>
            <div style="font-weight:700; font-size:13px; color:#0F172A;">${c.caller_name || c.caller_number}</div>
            <div style="font-size:11px; color:#64748B;">${c.caller_number} • ${formatDateAgo(c.created_at || c.started_at)}</div>
          </div>
          <button class="btn btn-secondary" onclick="softphoneDialCall('${c.caller_number}')" style="font-size:11px; padding:4px 10px; border-radius:9999px;">
            📞 Dial
          </button>
        </div>
      `).join('');
    } catch (e) {}
  }

  /* ==========================================================================
     8. Sub-View: Call History & Audio Recordings
     ========================================================================== */
  window.loadCallHistory = async function () {
    const tbody = document.getElementById('cc-history-table-body');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:#64748B;">Loading call history from database...</td></tr>`;

    try {
      const search = (document.getElementById('history-search-input')?.value || '').trim();
      const direction = document.getElementById('history-filter-direction')?.value || '';

      let url = `/call-center/calls?limit=50`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (direction) url += `&direction=${encodeURIComponent(direction)}`;

      const calls = await callCenterFetch(url);
      const countBadge = document.getElementById('cc-history-count-badge');
      if (countBadge) {
        countBadge.innerText = `${(calls || []).length} call${(calls || []).length === 1 ? '' : 's'}`;
      }
      if (!calls || !calls.length) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:32px; color:#64748B;">No call logs found in database matching your criteria.</td></tr>`;
        return;
      }

      tbody.innerHTML = calls.map(c => {
        const dirBadge = c.direction === 'INBOUND'
          ? `<span class="cc-badge cc-badge-inbound">↙ Inbound</span>`
          : `<span class="cc-badge cc-badge-outbound">↗ Outbound</span>`;

        let statusBadge = `<span class="cc-badge cc-badge-completed">Completed</span>`;
        if (c.status === 'MISSED') statusBadge = `<span class="cc-badge cc-badge-missed">Missed</span>`;
        else if (c.status === 'IN_PROGRESS' || c.status === 'IN_CALL') statusBadge = `<span class="cc-badge cc-badge-in_call">Active</span>`;
        else if (c.status === 'QUEUED') statusBadge = `<span class="cc-badge cc-badge-queued">Queued</span>`;
        else if (c.status === 'RINGING') statusBadge = `<span class="cc-badge cc-badge-ringing">Ringing</span>`;

        const duration = formatCallDuration(c.duration_seconds);
        const isAdmin = isCurrentUserAdmin();
        const rawAudioSrc = c.stream_url || c.recording_url;
        let recordingPlayer = `<span style="color:#94A3B8; font-size:11px;">None</span>`;

        if (rawAudioSrc || c.recording_restricted) {
          if (isAdmin && rawAudioSrc) {
            const authAudioSrc = getAuthenticatedAudioUrl(rawAudioSrc);
            const authDlUrl = getAuthenticatedAudioUrl(`${rawAudioSrc}?download=true`);
            recordingPlayer = `
              <div style="display:flex; align-items:center; gap:6px;">
                <div class="cc-audio-player">
                  <audio controls src="${authAudioSrc}" preload="none" onerror="onAudioPlaybackError(this, ${c.id})"></audio>
                  <div style="font-size:9px; color:#059669; font-weight:700; margin-top:2px; display:flex; align-items:center; gap:3px;">
                    <span>🗄️</span> DB Stored
                  </div>
                </div>
                <button class="btn btn-primary" onclick="openAudioPlayerModal(${c.id}, '${escapeQuote(c.caller_name)}', '${escapeQuote(c.caller_number)}', '${authAudioSrc}', '${authDlUrl}')" style="font-size:10px; padding:4px 8px; font-weight:700; background:#2563EB; display:inline-flex; align-items:center; gap:3px;" title="Listen in high-clarity player (Admin Only)">
                  <span>🎧</span> Listen
                </button>
              </div>`;
          } else {
            recordingPlayer = `
              <span class="badge" style="background:#F1F5F9; color:#64748B; border:1px solid #E2E8F0; font-size:11px; font-weight:600; padding:4px 8px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;" title="Audio recordings can only be listened to by System Administrators.">
                <span>🔒</span> Admin Only
              </span>`;
          }
        }

        const virtualNum = c.recipient_number || c.virtual_number || '-';

        return `
          <tr>
            <td>${dirBadge}</td>
            <td>
              <div style="font-weight:700; color:#0F172A;">${c.caller_name || 'Anonymous'}</div>
              <div style="font-size:11px; color:#64748B; font-family:monospace;">${c.caller_number}</div>
            </td>
            <td>${virtualNum}</td>
            <td>${c.agent_name || '<span style="color:#94A3B8;">Auto-Attendant</span>'}</td>
            <td>${formatDate(c.created_at || c.started_at)}</td>
            <td style="font-weight:600;">${duration}</td>
            <td>${statusBadge}</td>
            <td>
              <div style="display:flex; align-items:center; gap:8px;">
                ${recordingPlayer}
                <button class="btn btn-secondary" onclick="openCallNotesModal(${c.id}, '${escapeQuote(c.caller_name)}', '${c.disposition || ''}', '${escapeQuote(c.notes || '')}')" style="font-size:11px; padding:4px 8px;">
                  📝 Notes
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:24px; color:#EF4444;">Failed to load call history: ${e.message}</td></tr>`;
    }
  };

  /* ==========================================================================
     9. Sub-View: Phone Numbers Management
     ========================================================================== */
  window.loadPhoneNumbers = async function () {
    const tbody = document.getElementById('cc-numbers-table-body');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:#64748B;">Loading virtual numbers from database...</td></tr>`;

    try {
      const numbers = await callCenterFetch('/call-center/numbers');
      if (!numbers || !numbers.length) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:32px; color:#64748B;">No virtual phone numbers provisioned in database.</td></tr>`;
        return;
      }

      tbody.innerHTML = numbers.map(n => `
        <tr>
          <td>
            <span style="font-weight:800; font-family:monospace; color:#0F172A; font-size:14px;">${n.phone_number}</span>
          </td>
          <td>
            <div style="font-weight:700;">${n.friendly_name}</div>
            <div style="font-size:11px; color:#64748B;">${n.provider || 'Twilio'}</div>
          </td>
          <td>
            <span class="cc-badge" style="background:#F1F5F9; color:#334155;">${n.queue_name || (n.assigned_queue_id ? 'Assigned to Queue' : 'Direct Line')}</span>
          </td>
          <td>
            <span style="font-size:12px; font-weight:700; color:${n.record_calls ? '#10B981' : '#64748B'};">
              ${n.record_calls ? '● Enabled' : '○ Disabled'}
            </span>
          </td>
          <td>
            <span style="font-size:12px; font-weight:700; color:${n.voicemail_enabled ? '#10B981' : '#64748B'};">
              ${n.voicemail_enabled ? '● Enabled' : '○ Disabled'}
            </span>
          </td>
          <td>
            <span class="cc-badge cc-badge-completed">${n.status || 'ACTIVE'}</span>
          </td>
          <td>
            <button class="btn btn-secondary" onclick="openEditNumberModal(${JSON.stringify(n).replace(/"/g, '&quot;')})" style="font-size:11px; padding:4px 10px;">
              ⚙️ Configure
            </button>
          </td>
        </tr>
      `).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:24px; color:#EF4444;">Error loading phone numbers: ${e.message}</td></tr>`;
    }
  };

  /* ==========================================================================
     10. Sub-View: Call Queues & ACD Routing
     ========================================================================== */
  window.loadCallQueues = async function () {
    const grid = document.getElementById('cc-queues-grid');
    if (!grid) return;

    grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:32px; color:#64748B;">Loading queues from database...</div>`;

    try {
      const queues = await callCenterFetch('/call-center/queues');
      if (!queues || !queues.length) {
        grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:32px; color:#64748B;">No queues found in database.</div>`;
        return;
      }

      grid.innerHTML = queues.map(q => {
        const waitingCount = q.waiting_callers_count ?? q.waiting_callers ?? 0;
        const activeCount = q.active_callers_count ?? q.active_calls ?? 0;
        const membersCount = q.members ? q.members.length : (q.members_count ?? 0);
        const strategy = q.strategy || q.routing_strategy || 'ROUND_ROBIN';

        return `
          <div class="cc-kpi-card" style="display:flex; flex-direction:column; gap:14px;">
            <div style="display:flex; align-items:flex-start; justify-content:space-between; width:100%;">
              <div>
                <h4 style="font-size:16px; font-weight:800; color:#0F172A; margin:0;">${q.name}</h4>
                <div style="font-size:12px; color:#64748B; margin-top:2px;">${q.description || 'Priority Queue'}</div>
              </div>
              <span class="cc-badge" style="background:#ECFDF5; color:#065F46; font-weight:800;">
                ${strategy}
              </span>
            </div>

            <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; background:#F8FAFC; border-radius:10px; padding:10px; text-align:center;">
              <div>
                <div style="font-size:18px; font-weight:800; color:${waitingCount > 0 ? '#EF4444' : '#0F172A'};">${waitingCount}</div>
                <div style="font-size:10px; color:#64748B; text-transform:uppercase;">Waiting</div>
              </div>
              <div>
                <div style="font-size:18px; font-weight:800; color:#0F172A;">${activeCount}</div>
                <div style="font-size:10px; color:#64748B; text-transform:uppercase;">Active</div>
              </div>
              <div>
                <div style="font-size:18px; font-weight:800; color:#10B981;">${membersCount}</div>
                <div style="font-size:10px; color:#64748B; text-transform:uppercase;">Agents</div>
              </div>
            </div>

            <div style="font-size:12px; color:#475569; display:flex; flex-direction:column; gap:4px;">
              <div><strong>Hold Music:</strong> ${q.hold_music_url ? '🎵 Active Audio Loop' : 'Disabled'}</div>
              <div><strong>Max Wait:</strong> ${q.max_wait_time_seconds} seconds</div>
            </div>

            <div style="display:flex; align-items:center; gap:8px; margin-top:auto; pt:6px;">
              <button class="btn btn-secondary" onclick="simulateIncomingCallModal(${q.id}, '${q.name}')" style="flex:1; font-size:11px; padding:6px 10px; background:#F0FDF4; border-color:#86EFAC; color:#15803D; font-weight:700;">
                ⚡ Test Inbound
              </button>
              <button class="btn btn-secondary" onclick="openConfigureQueueModal(${JSON.stringify(q).replace(/"/g, '&quot;')})" style="flex:1; font-size:11px; padding:6px 10px;">
                ⚙️ Configure
              </button>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:32px; color:#EF4444;">Error loading queues: ${e.message}</div>`;
    }
  };

  /* ==========================================================================
     11. Sub-View: Contacts CRM Directory
     ========================================================================== */
  window.loadCallerContacts = async function () {
    const tbody = document.getElementById('cc-contacts-table-body');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:#64748B;">Loading caller profiles from database...</td></tr>`;

    try {
      const search = (document.getElementById('contacts-search-input')?.value || '').trim();
      let url = `/call-center/contacts`;
      if (search) url += `?search=${encodeURIComponent(search)}`;

      const contacts = await callCenterFetch(url);
      if (!contacts || !contacts.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:32px; color:#64748B;">No contacts found in database.</td></tr>`;
        return;
      }

      tbody.innerHTML = contacts.map(c => {
        const isVip = c.vip_level === 'VIP' || c.is_vip;
        const org = c.company_or_site || c.organization || 'Client Contact';
        const callCount = c.total_calls ?? c.total_calls_count ?? 0;

        return `
          <tr>
            <td>
              <div style="font-weight:700; color:#0F172A; display:flex; align-items:center; gap:6px;">
                ${isVip ? '⭐' : ''} ${c.full_name}
              </div>
              <div style="font-size:11px; color:#64748B;">${org}</div>
            </td>
            <td style="font-family:monospace; font-weight:700;">${c.phone_number}</td>
            <td>${c.email || '-'}</td>
            <td>
              <span class="cc-badge" style="background:#EFF6FF; color:#1D4ED8; font-weight:800;">
                ${callCount} calls
              </span>
            </td>
            <td style="font-size:12px; color:#64748B; max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${c.notes || '-'}
            </td>
            <td>
              <button class="btn btn-primary" onclick="softphoneDialCall('${c.phone_number}')" style="font-size:11px; padding:4px 10px; background:#22C55E;">
                📞 Call
              </button>
            </td>
          </tr>
        `;
      }).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:#EF4444;">Error loading contacts: ${e.message}</td></tr>`;
    }
  };

  /* ==========================================================================
     12. Sub-View: IVR & Smart Routing Visual Tree
     ========================================================================== */
  async function renderIVRView() {
    const container = document.getElementById('cc-ivr-content');
    if (!container) return;

    try {
      const queues = await callCenterFetch('/call-center/queues');
      const numbers = await callCenterFetch('/call-center/numbers');

      const primaryNum = numbers && numbers.length ? numbers[0].phone_number : '+254 20 790 0000';
      const qEmergency = queues.find(q => q.name.toLowerCase().includes('emergency')) || queues[0] || { name: 'Emergency Guard Dispatch' };
      const qGeneral = queues.find(q => q.name.toLowerCase().includes('client') || q.name.toLowerCase().includes('general')) || queues[1] || { name: 'General Client Services' };

      container.innerHTML = `
        <div class="cc-table-card" style="padding:24px;">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:20px;">
            <div>
              <h4 style="font-size:17px; font-weight:800; color:#0F172A; margin:0;">Visual IVR & Call Flow Architecture (Live DB Synced)</h4>
              <p style="font-size:12px; color:#64748B; margin:4px 0 0 0;">Configured for DID Primary Inbound Trunk: <strong>${primaryNum}</strong></p>
            </div>
            <button class="btn btn-secondary" onclick="testIVRGreetingVoice()" style="display:flex; align-items:center; gap:6px;">
              <span>🔊</span> Play IVR Greeting Audio
            </button>
          </div>

          <div class="cc-ivr-tree">
            <div class="cc-ivr-node" style="border-left: 4px solid #22C55E;">
              <div style="font-weight:800; font-size:14px; color:#0F172A;">🏢 Main Auto-Attendant Greeting</div>
              <div style="font-size:12px; color:#64748B; margin-top:4px;">
                <em>"Thank you for calling CorpSec Investigations & Guarding Services. For rapid guard emergency response, press 1. For client accounts and billing, press 2. To speak with our operator, press 0."</em>
              </div>
            </div>

            <div class="cc-ivr-node" style="border-left: 4px solid #EF4444; margin-left:32px;">
              <div style="display:flex; align-items:center; justify-content:space-between;">
                <div style="font-weight:700; color:#0F172A;">Key [1]: Rapid Guard Emergency Response</div>
                <span class="cc-badge cc-badge-missed">High Priority</span>
              </div>
              <div style="font-size:12px; color:#64748B; margin-top:4px;">
                Routes to database queue: <strong>${qEmergency.name}</strong> (${qEmergency.strategy || 'LONGEST_IDLE'})
              </div>
            </div>

            <div class="cc-ivr-node" style="border-left: 4px solid #3B82F6; margin-left:32px;">
              <div style="display:flex; align-items:center; justify-content:space-between;">
                <div style="font-weight:700; color:#0F172A;">Key [2]: Client Accounts & Invoicing</div>
                <span class="cc-badge" style="background:#EFF6FF; color:#1D4ED8;">Standard Priority</span>
              </div>
              <div style="font-size:12px; color:#64748B; margin-top:4px;">
                Routes to database queue: <strong>${qGeneral.name}</strong> (${qGeneral.strategy || 'ROUND_ROBIN'})
              </div>
            </div>

            <div class="cc-ivr-node" style="border-left: 4px solid #F59E0B; margin-left:32px;">
              <div style="display:flex; align-items:center; justify-content:space-between;">
                <div style="font-weight:700; color:#0F172A;">Key [0]: Operator / Receptionist</div>
                <span class="cc-badge" style="background:#FEF3C7; color:#92400E;">Ring-All</span>
              </div>
              <div style="font-size:12px; color:#64748B; margin-top:4px;">
                Rings all online supervisor and dispatch softphones simultaneously.
              </div>
            </div>
          </div>
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<div style="padding:20px; color:#EF4444;">Failed to retrieve IVR configuration: ${e.message}</div>`;
    }
  }

  window.testIVRGreetingVoice = function () {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const msg = new SpeechSynthesisUtterance("Thank you for calling CorpSec Investigations and Guarding Services. For rapid guard emergency response, press 1. For client accounts and billing, press 2. To speak with our operator, press 0.");
      msg.rate = 0.95;
      window.speechSynthesis.speak(msg);
      if (typeof showToast === 'function') showToast('Playing synthesized IVR greeting audio', 'info');
    } else {
      playDTMFTone('1');
    }
  };

  /* ==========================================================================
     13. Sub-View: Team Presence & Live Agents
     ========================================================================== */
  window.loadTeamPresence = async function () {
    const grid = document.getElementById('cc-team-grid');
    if (!grid) return;

    grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:32px; color:#64748B;">Loading team presence from database...</div>`;

    try {
      const agents = await callCenterFetch('/call-center/agents');
      if (!agents || !agents.length) {
        grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:32px; color:#64748B;">No agents registered in Call Center yet.</div>`;
        return;
      }

      grid.innerHTML = agents.map(a => {
        let statusPill = `<span class="agent-status-pill status-available"><span class="status-indicator-dot"></span> Available</span>`;
        if (a.status === 'ON_CALL') statusPill = `<span class="agent-status-pill status-on_call"><span class="status-indicator-dot"></span> On Call</span>`;
        else if (a.status === 'BREAK') statusPill = `<span class="agent-status-pill status-break"><span class="status-indicator-dot"></span> Break</span>`;
        else if (a.status === 'OFFLINE') statusPill = `<span class="agent-status-pill status-offline"><span class="status-indicator-dot"></span> Offline</span>`;

        const name = a.full_name || a.user_name || a.user_email || 'Agent';
        const initials = name.slice(0, 2).toUpperCase();

        return `
          <div class="cc-kpi-card" style="display:flex; flex-direction:column; gap:12px;">
            <div style="display:flex; align-items:center; justify-content:space-between; width:100%;">
              <div style="display:flex; align-items:center; gap:10px;">
                <div style="width:40px; height:40px; border-radius:50%; background:#EFF6FF; color:#2563EB; display:flex; align-items:center; justify-content:center; font-weight:800;">
                  ${initials}
                </div>
                <div>
                  <div style="font-weight:800; font-size:14px; color:#0F172A;">${name}</div>
                  <div style="font-size:11px; color:#64748B;">${a.email || a.user_email || ''}</div>
                </div>
              </div>
              ${statusPill}
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; background:#F8FAFC; border-radius:8px; padding:8px 12px; font-size:11px;">
              <div><strong>Handled Today:</strong> ${a.calls_taken_today ?? a.total_calls_handled_today ?? 0}</div>
              <div><strong>Handle Time:</strong> ${Math.round(a.average_handle_time_seconds || a.total_talk_time_seconds || 0)}s</div>
            </div>

            <div style="font-size:11px; color:#64748B;">
              <strong>Queues:</strong> ${a.assigned_queues?.join(', ') || 'General Inbound'}
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:32px; color:#EF4444;">Error loading team: ${e.message}</div>`;
    }
  };

  window.onAudioPlaybackError = function (el, callId) {
    if (!el || el.dataset.retried === 'true' || !isCurrentUserAdmin()) return;
    el.dataset.retried = 'true';
    console.warn(`[CallCenter] Audio playback fallback for call #${callId}`);
    const fallbackUrl = `/api/v1/call-center/recordings/${callId}/stream?fallback=true&t=${Date.now()}`;
    el.src = getAuthenticatedAudioUrl(fallbackUrl);
    try { el.load(); } catch (err) {}
  };

  /* ==========================================================================
     14. Sub-View: Recordings Library
     ========================================================================== */
  function renderRecordingsRows(calls) {
    const tbody = document.getElementById('cc-recordings-table-body');
    if (!tbody) return;

    if (!calls || !calls.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:32px; color:#64748B;">No audio recordings found matching criteria.</td></tr>`;
      return;
    }

    const isAdmin = isCurrentUserAdmin();
    tbody.innerHTML = calls.map(c => {
      const rawAudioSrc = c.stream_url || c.recording_url || `/api/v1/call-center/recordings/${c.id}/stream`;
      const rawDlUrl = c.download_url || `/api/v1/call-center/recordings/${c.id}/stream?download=true`;
      const authAudioSrc = isAdmin ? getAuthenticatedAudioUrl(rawAudioSrc) : null;
      const authDlUrl = isAdmin ? getAuthenticatedAudioUrl(rawDlUrl) : null;

      const audioCell = isAdmin ? `
        <div class="cc-audio-player">
          <audio controls src="${authAudioSrc}" preload="metadata" onerror="onAudioPlaybackError(this, ${c.id})"></audio>
          <div style="font-size:10px; color:#059669; font-weight:700; margin-top:3px; display:flex; align-items:center; gap:4px;">
            <span>🗄️</span> Retrieved from Database
          </div>
        </div>
      ` : `
        <div style="display:inline-flex; align-items:center; gap:6px; background:#F8FAFC; border:1px solid #E2E8F0; padding:6px 12px; border-radius:8px;">
          <span style="font-size:14px;">🔒</span>
          <div>
            <div style="font-size:11px; font-weight:700; color:#475569;">Admin Access Only</div>
            <div style="font-size:10px; color:#94A3B8;">Audio playback restricted</div>
          </div>
        </div>
      `;

      const actionCell = isAdmin ? `
        <div style="display:flex; align-items:center; gap:6px;">
          <button class="btn btn-primary" onclick="openAudioPlayerModal(${c.id}, '${escapeQuote(c.caller_name)}', '${escapeQuote(c.caller_number)}', '${authAudioSrc}', '${authDlUrl}')" style="font-size:11px; padding:6px 10px; display:inline-flex; align-items:center; gap:4px; font-weight:700; background:#2563EB;">
            <span>🎧</span> Listen
          </button>
          <a href="${authDlUrl}" download="call_recording_${c.id}.wav" class="btn btn-secondary" style="font-size:11px; padding:6px 10px; text-decoration:none; display:inline-flex; align-items:center; gap:4px; font-weight:700;">
            <span>⬇</span> Download
          </a>
        </div>
      ` : `
        <span style="font-size:11px; color:#94A3B8; font-weight:600; display:inline-flex; align-items:center; gap:4px; padding:4px 8px; background:#F1F5F9; border-radius:4px;">
          <span>🔒</span> Restricted
        </span>
      `;

      return `
      <tr>
        <td>
          <div style="font-weight:700; color:#0F172A;">${c.caller_name || 'Caller'}</div>
          <div style="font-size:11px; color:#64748B; font-family:monospace;">${c.caller_number}</div>
        </td>
        <td>${c.agent_name || 'Agent'}</td>
        <td>${formatDate(c.created_at || c.started_at)}</td>
        <td style="font-weight:700;">${formatCallDuration(c.duration_seconds)}</td>
        <td>${audioCell}</td>
        <td>${actionCell}</td>
      </tr>
    `;
    }).join('');
  }

  window.filterCallRecordings = function (query) {
    const data = window.CallCenter.recordingsData || [];
    const countBadge = document.getElementById('cc-recordings-count-badge');
    const q = (query || '').toLowerCase().trim();
    if (!q) {
      if (countBadge) countBadge.innerText = `${data.length} recording${data.length === 1 ? '' : 's'}`;
      renderRecordingsRows(data);
      return;
    }
    const filtered = data.filter(c =>
      (c.caller_name || '').toLowerCase().includes(q) ||
      (c.caller_number || '').toLowerCase().includes(q) ||
      (c.agent_name || '').toLowerCase().includes(q) ||
      (c.disposition || '').toLowerCase().includes(q)
    );
    if (countBadge) countBadge.innerText = `${filtered.length} of ${data.length}`;
    renderRecordingsRows(filtered);
  };

  window.loadCallRecordings = async function () {
    const tbody = document.getElementById('cc-recordings-table-body');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:#64748B;">Loading recordings from database...</td></tr>`;

    try {
      const calls = await callCenterFetch('/call-center/recordings');
      window.CallCenter.recordingsData = calls || [];

      const countBadge = document.getElementById('cc-recordings-count-badge');
      if (countBadge) {
        countBadge.innerText = `${(calls || []).length} recording${(calls || []).length === 1 ? '' : 's'}`;
      }

      const searchInput = document.getElementById('recordings-search-input');
      if (searchInput && searchInput.value) {
        window.filterCallRecordings(searchInput.value);
      } else {
        renderRecordingsRows(calls);
      }
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:#EF4444;">Error loading recordings: ${e.message}</td></tr>`;
    }
  };

  /* ==========================================================================
     15. Sub-View: Missed & Abandoned Calls
     ========================================================================== */
  window.loadMissedCalls = async function () {
    const tbody = document.getElementById('cc-missed-table-body');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:#64748B;">Loading missed calls from database...</td></tr>`;

    try {
      const calls = await callCenterFetch('/call-center/missed');
      if (!calls || !calls.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:32px; color:#10B981; font-weight:700;">🎉 No missed calls! All callers were handled.</td></tr>`;
        return;
      }

      tbody.innerHTML = calls.map(c => `
        <tr>
          <td>
            <span class="cc-badge cc-badge-missed">⚠ Missed</span>
          </td>
          <td>
            <div style="font-weight:700; color:#0F172A;">${c.caller_name || 'Unknown Caller'}</div>
            <div style="font-size:11px; color:#64748B; font-family:monospace;">${c.caller_number}</div>
          </td>
          <td>${c.queue_name || 'General Inbound'}</td>
          <td>${formatDateAgo(c.created_at || c.started_at)}</td>
          <td>${c.wait_time_seconds ? `${c.wait_time_seconds}s wait` : 'Immediate abandon'}</td>
          <td>
            <button class="btn btn-primary" onclick="softphoneDialCall('${c.caller_number}')" style="font-size:11px; padding:6px 12px; background:#22C55E; display:inline-flex; align-items:center; gap:5px;">
              <span>📞</span> Return Call
            </button>
          </td>
        </tr>
      `).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:#EF4444;">Error loading missed calls: ${e.message}</td></tr>`;
    }
  };

  /* ==========================================================================
     16. Sub-View: Reports & KPI Analytics
     ========================================================================== */
  async function loadAnalyticsReports() {
    loadCallCenterOverview();
    const container = document.getElementById('cc-view-reports');
    if (!container) return;

    try {
      const data = await callCenterFetch('/call-center/overview');
      const total = data.total_calls_today || 0;
      const missed = data.missed_today || 0;
      const avgDuration = data.avg_duration_seconds || 0;
      const avgWait = data.avg_wait_time_seconds || 0;

      const abandonRate = total > 0 ? ((missed / total) * 100).toFixed(1) : '0.0';
      const fcrRate = total > 0 ? (((total - missed) / total) * 100).toFixed(1) : '100.0';
      const ahtMins = `${Math.floor(avgDuration / 60)}m ${avgDuration % 60}s`;

      const repFcr = document.getElementById('report-fcr-val');
      const repAht = document.getElementById('report-aht-val');
      const repWait = document.getElementById('report-sl-val');
      const repAband = document.getElementById('report-aband-val');

      if (repFcr) repFcr.innerText = `${fcrRate}%`;
      if (repAht) repAht.innerText = ahtMins;
      if (repWait) repWait.innerText = `${avgWait}s`;
      if (repAband) repAband.innerText = `${abandonRate}%`;
    } catch (e) {}
  }

  /* ==========================================================================
     17. Sub-View: Settings & Voice Trunk Credentials
     ========================================================================== */
  function renderSettingsView() {
    // Static settings template
  }

  /* ==========================================================================
     18. Modals & Inbound Simulation Helpers
     ========================================================================== */
  window.simulateIncomingCallModal = function (queueId, queueName) {
    const qSelect = document.getElementById('sim-queue-select');
    if (qSelect && queueId) qSelect.value = queueId;
    const modal = document.getElementById('modal-simulate-call');
    if (modal) modal.style.display = 'flex';
  };

  window.executeSimulateCall = async function () {
    const name = document.getElementById('sim-caller-name')?.value || 'Test Caller';
    const number = document.getElementById('sim-caller-number')?.value || '+254 711 000 111';
    const queueId = parseInt(document.getElementById('sim-queue-select')?.value || '1');

    const modal = document.getElementById('modal-simulate-call');
    if (modal) modal.style.display = 'none';

    try {
      const res = await callCenterFetch('/call-center/calls/simulate-incoming', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caller_name: name,
          caller_number: number,
          queue_id: queueId
        })
      });

      if (res && res.call_id) {
        if (typeof showToast === 'function') {
          showToast(`Inbound call simulated from ${name} (${number})`, 'success');
        }
        onIncomingCallReceived(res);
      }
    } catch (e) {
      if (typeof showToast === 'function') showToast('Simulation error: ' + (e.message || ''), 'danger');
    }
  };

  window.openCallNotesModal = function (callId, callerName, disposition, notes) {
    document.getElementById('notes-call-id').value = callId;
    document.getElementById('notes-caller-title').innerText = callerName || 'Call Notes';
    document.getElementById('notes-disposition-select').value = disposition || 'RESOLVED';
    document.getElementById('notes-textarea').value = notes || '';
    document.getElementById('modal-call-notes').style.display = 'flex';
  };

  window.saveCallNotes = async function () {
    const callId = document.getElementById('notes-call-id').value;
    const disposition = document.getElementById('notes-disposition-select').value;
    const notes = document.getElementById('notes-textarea').value;

    try {
      await callCenterFetch(`/call-center/calls/${callId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: notes })
      });

      document.getElementById('modal-call-notes').style.display = 'none';
      if (typeof showToast === 'function') showToast('Call notes saved successfully to database', 'success');
      loadCallHistory();
    } catch (e) {
      if (typeof showToast === 'function') showToast('Error saving notes', 'danger');
    }
  };

  // Helper formatting functions
  function formatCallDuration(seconds) {
    if (!seconds) return '00:00';
    const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
    const secs = String(seconds % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  }

  function formatDate(isoStr) {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('en-KE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return isoStr;
    }
  }

  function formatDateAgo(isoStr) {
    if (!isoStr) return '-';
    try {
      const d = new Date(isoStr);
      const diffMs = Date.now() - d.getTime();
      const mins = Math.floor(diffMs / 60000);
      if (mins < 1) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `${hrs}h ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    } catch (e) {
      return isoStr;
    }
  }

  function escapeQuote(str) {
    return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

  /* ==========================================================================
     18b. Audio Player Modal (Direct Database Audio Playback for Admins Only)
     ========================================================================== */
  window.openAudioPlayerModal = function (callId, callerName, callerNumber, audioSrc, dlUrl) {
    if (!isCurrentUserAdmin()) {
      if (typeof showToast === 'function') {
        showToast('🔒 Access Denied: Only System Administrators are authorized to listen to call recordings.', 'warning');
      } else {
        alert('Access Denied: Only System Administrators are authorized to listen to call recordings.');
      }
      return;
    }
    const modal = document.getElementById('modal-audio-player');
    if (!modal) return;

    const callerNameEl = document.getElementById('modal-audio-caller-name');
    const callerNumEl = document.getElementById('modal-audio-caller-number');
    const callIdEl = document.getElementById('modal-audio-call-id');

    if (callerNameEl) callerNameEl.innerText = callerName || 'Client Call';
    if (callerNumEl) callerNumEl.innerText = callerNumber || '';
    if (callIdEl) callIdEl.innerText = `#${callId}`;

    const rawStreamUrl = audioSrc || `/api/v1/call-center/recordings/${callId}/stream`;
    const streamUrl = getAuthenticatedAudioUrl(rawStreamUrl);
    const audioEl = document.getElementById('modal-audio-element');
    if (audioEl) {
      audioEl.pause();
      audioEl.src = streamUrl;
      audioEl.playbackRate = 1.0;
      audioEl.load();
      audioEl.play().catch(e => console.log('Autoplay deferred until interaction:', e));
    }

    const dlBtn = document.getElementById('modal-audio-download-btn');
    if (dlBtn) {
      const rawDl = dlUrl || `/api/v1/call-center/recordings/${callId}/stream?download=true`;
      dlBtn.href = getAuthenticatedAudioUrl(rawDl);
      dlBtn.download = `call_recording_${callId}.wav`;
    }

    // Reset rate buttons
    document.querySelectorAll('.btn-playback-rate').forEach(b => {
      const isDefault = b.dataset.rate === '1.0';
      b.style.background = isDefault ? '#2563EB' : '#F1F5F9';
      b.style.color = isDefault ? '#FFFFFF' : '#475569';
    });

    modal.style.display = 'flex';
  };

  window.closeAudioPlayerModal = function () {
    const modal = document.getElementById('modal-audio-player');
    const audioEl = document.getElementById('modal-audio-element');
    if (audioEl) audioEl.pause();
    if (modal) modal.style.display = 'none';
  };

  window.setAudioPlaybackRate = function (rate) {
    const audioEl = document.getElementById('modal-audio-element');
    if (audioEl) {
      audioEl.playbackRate = rate;
      document.querySelectorAll('.btn-playback-rate').forEach(b => {
        const isMatch = parseFloat(b.dataset.rate) === rate;
        b.style.background = isMatch ? '#2563EB' : '#F1F5F9';
        b.style.color = isMatch ? '#FFFFFF' : '#475569';
      });
    }
  };

  /* ==========================================================================
     20. Guard SMS Text Messaging & Carrier Dispatch Controller
     ========================================================================== */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.loadGuardSMSView = async function () {
    try {
      // 1. Fetch SMS Overview & KPI metrics
      const overview = await callCenterFetch('/call-center/sms/overview');
      if (overview) {
        const totalSentEl = document.getElementById('sms-kpi-total-sent');
        const deliveriesEl = document.getElementById('sms-kpi-deliveries');
        const rateEl = document.getElementById('sms-kpi-rate');
        const guardsEl = document.getElementById('sms-kpi-guards');

        const totalSent = overview.total_messages_sent != null ? overview.total_messages_sent : (overview.total_sent || 0);
        const deliveries = overview.total_guard_deliveries != null ? overview.total_guard_deliveries : (overview.delivered_count || 0);
        const rate = overview.delivery_success_rate != null ? overview.delivery_success_rate : (overview.success_rate != null ? overview.success_rate : 100);
        const activeGuards = overview.active_guards_registered != null ? overview.active_guards_registered : (overview.active_guards || 0);

        if (totalSentEl) totalSentEl.innerText = totalSent;
        if (deliveriesEl) deliveriesEl.innerText = deliveries;
        if (rateEl) rateEl.innerText = `${rate}%`;
        if (guardsEl) guardsEl.innerText = activeGuards;
      }

      // 2. Load active guards list for targeting
      const guards = await callCenterFetch('/call-center/sms/guards');
      if (Array.isArray(guards)) {
        window.CallCenter.sms.allGuards = guards;
        populateSMSSitesDropdown(guards);
        renderSMSGuardsPicker();
      }

      // 3. Load SMS History
      await loadGuardSMSHistory();
    } catch (e) {
      console.error('Error loading Guard SMS view:', e);
    }
  };

  function populateSMSSitesDropdown(guards) {
    const siteSelect = document.getElementById('sms-site-select');
    if (!siteSelect) return;

    const currentVal = siteSelect.value;
    const siteMap = new Map();
    (guards || []).forEach(g => {
      if (g.site_id && g.site_name) {
        siteMap.set(g.site_id, g.site_name);
      }
    });

    let opts = '<option value="">-- Choose Client Site --</option>';
    siteMap.forEach((name, id) => {
      const selected = String(id) === String(currentVal) ? 'selected' : '';
      opts += `<option value="${id}" ${selected}>${escapeHtml(name)}</option>`;
    });
    siteSelect.innerHTML = opts;
  }

  window.setGuardSMSMode = function (mode) {
    window.CallCenter.sms.mode = mode;

    const btnAll = document.getElementById('sms-mode-btn-all');
    const btnSpecified = document.getElementById('sms-mode-btn-specified');
    const btnSite = document.getElementById('sms-mode-btn-site');

    const activeStyle = 'flex:1; padding:9px 12px; font-size:12px; font-weight:700; border-radius:8px; border:2px solid #4338CA; background:#EEF2FF; color:#4338CA; cursor:pointer;';
    const inactiveStyle = 'flex:1; padding:9px 12px; font-size:12px; font-weight:700; border-radius:8px; border:1px solid #CBD5E1; background:#F8FAFC; color:#64748B; cursor:pointer;';

    if (btnAll) btnAll.style.cssText = mode === 'ALL' ? activeStyle : inactiveStyle;
    if (btnSpecified) btnSpecified.style.cssText = mode === 'SPECIFIED' ? activeStyle : inactiveStyle;
    if (btnSite) btnSite.style.cssText = mode === 'SITE' ? activeStyle : inactiveStyle;

    const siteWrap = document.getElementById('sms-site-selector-wrap');
    if (siteWrap) siteWrap.style.display = mode === 'SITE' ? 'block' : 'none';

    const pickerControls = document.getElementById('sms-guard-picker-controls');
    if (pickerControls) pickerControls.style.display = mode === 'SPECIFIED' ? 'flex' : 'none';

    const searchWrap = document.getElementById('sms-guard-search-wrap');
    if (searchWrap) searchWrap.style.display = mode === 'SPECIFIED' ? 'block' : 'none';

    updateSMSTargetSummary();
    renderSMSGuardsPicker();
  };

  function updateSMSTargetSummary() {
    const summaryEl = document.getElementById('sms-target-summary-text');
    if (!summaryEl) return;

    const mode = window.CallCenter.sms.mode;
    const allGuards = window.CallCenter.sms.allGuards || [];
    const selectedIds = window.CallCenter.sms.selectedGuardIds || new Set();

    if (mode === 'ALL') {
      summaryEl.innerText = `Target: Broadcasting to All Active Guards (${allGuards.length} guards)`;
    } else if (mode === 'SPECIFIED') {
      summaryEl.innerText = `Target: Sending to ${selectedIds.size} specified guard(s)`;
    } else if (mode === 'SITE') {
      const siteSelect = document.getElementById('sms-site-select');
      const siteName = siteSelect && siteSelect.selectedIndex > 0 ? siteSelect.options[siteSelect.selectedIndex].text : 'Selected Site';
      summaryEl.innerText = `Target: Sending to guards deployed at ${siteName}`;
    }
  }

  window.onSMSSiteChange = function () {
    const siteSelect = document.getElementById('sms-site-select');
    const val = siteSelect ? siteSelect.value : '';
    window.CallCenter.sms.siteId = val ? parseInt(val) : null;
    updateSMSTargetSummary();
    renderSMSGuardsPicker();
  };

  function renderSMSGuardsPicker(filterText = '') {
    const container = document.getElementById('sms-guards-picker-list');
    const countSub = document.getElementById('sms-recipients-count-sub');
    if (!container) return;

    const mode = window.CallCenter.sms.mode || 'ALL';
    let guards = window.CallCenter.sms.allGuards || [];
    const selectedIds = window.CallCenter.sms.selectedGuardIds || new Set();

    if (mode === 'SITE') {
      if (!window.CallCenter.sms.siteId) {
        container.innerHTML = `<div style="text-align:center; padding:28px 16px; color:#64748B;">
          <div style="font-size:24px; margin-bottom:6px;">🏢</div>
          <div>Please select a client site deployment from the dropdown on the left to view deployed guards.</div>
        </div>`;
        if (countSub) countSub.innerText = 'No client site selected';
        return;
      }
      guards = guards.filter(g => g.site_id === window.CallCenter.sms.siteId);
    }

    const q = (filterText || document.getElementById('sms-guard-search-input')?.value || '').trim().toLowerCase();
    if (q) {
      guards = guards.filter(g => {
        const name = (g.full_name || g.name || '').toLowerCase();
        const empNo = (g.employee_number || '').toLowerCase();
        const phone = (g.phone_formatted || g.phone || '').toLowerCase();
        const site = (g.site_name || '').toLowerCase();
        return name.includes(q) || empNo.includes(q) || phone.includes(q) || site.includes(q);
      });
    }

    if (mode === 'ALL') {
      if (countSub) countSub.innerText = `Broadcasting to all ${guards.length} registered active guards`;
    } else if (mode === 'SPECIFIED') {
      if (countSub) countSub.innerText = `${selectedIds.size} of ${window.CallCenter.sms.allGuards.length} guards selected`;
    } else if (mode === 'SITE') {
      if (countSub) countSub.innerText = `${guards.length} guard(s) deployed at this site`;
    }

    if (guards.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:24px; color:#64748B;">No guards found matching selection.</div>`;
      return;
    }

    if (mode === 'SPECIFIED') {
      container.innerHTML = guards.map(g => {
        const gId = g.id || g.guard_id;
        const gName = g.full_name || g.name || 'Guard';
        const gPhone = g.phone_formatted || g.phone || '--';
        const empNo = g.employee_number || ('ID:' + gId);
        const isChecked = selectedIds.has(gId);

        return `
          <label style="display:flex; align-items:center; gap:10px; padding:8px 12px; margin-bottom:6px; background:${isChecked ? '#F0FDF4' : '#FFFFFF'}; border:1px solid ${isChecked ? '#86EFAC' : '#E2E8F0'}; border-radius:8px; cursor:pointer;">
            <input type="checkbox" value="${gId}" ${isChecked ? 'checked' : ''}
              onchange="onSMSGuardCheckChange(${gId}, this.checked)"
              style="width:16px; height:16px; accent-color:#4338CA; cursor:pointer;">
            <div style="flex:1;">
              <div style="font-weight:700; color:#1E293B; font-size:12px;">
                ${escapeHtml(gName)}
                <span style="color:#64748B; font-weight:normal; font-size:11px;">(${escapeHtml(empNo)})</span>
              </div>
              <div style="font-size:11px; color:#64748B;">📱 ${escapeHtml(gPhone)} • 🏢 ${escapeHtml(g.site_name || 'Unassigned')}</div>
            </div>
            ${isChecked ? '<span class="badge" style="background:#ECFDF5; color:#065F46; font-size:10px; font-weight:700;">Selected</span>' : ''}
          </label>
        `;
      }).join('');
    } else {
      container.innerHTML = guards.map(g => {
        const gId = g.id || g.guard_id;
        const gName = g.full_name || g.name || 'Guard';
        const gPhone = g.phone_formatted || g.phone || '--';
        const empNo = g.employee_number || ('ID:' + gId);

        return `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; margin-bottom:6px; background:#FFFFFF; border:1px solid #E2E8F0; border-radius:8px;">
          <div>
            <div style="font-weight:700; color:#1E293B; font-size:12px;">
              ${escapeHtml(gName)}
              <span style="color:#64748B; font-weight:normal; font-size:11px;">(${escapeHtml(empNo)})</span>
            </div>
            <div style="font-size:11px; color:#64748B;">📱 ${escapeHtml(gPhone)} • 🏢 ${escapeHtml(g.site_name || 'Unassigned')}</div>
          </div>
          <span class="badge" style="background:#EEF2FF; color:#4338CA; font-size:10px; font-weight:700;">
            ${mode === 'ALL' ? 'Broadcast' : 'Site Deployed'}
          </span>
        </div>
      `;
      }).join('');
    }
  }

  window.filterSMSGuardsList = function (text) {
    renderSMSGuardsPicker(text);
  };

  window.toggleSelectAllSMSGuards = function (selectAll) {
    const guards = window.CallCenter.sms.allGuards || [];
    if (selectAll) {
      guards.forEach(g => window.CallCenter.sms.selectedGuardIds.add(g.id || g.guard_id));
    } else {
      window.CallCenter.sms.selectedGuardIds.clear();
    }
    updateSMSTargetSummary();
    renderSMSGuardsPicker();
  };

  window.onSMSGuardCheckChange = function (guardId, isChecked) {
    if (isChecked) {
      window.CallCenter.sms.selectedGuardIds.add(guardId);
    } else {
      window.CallCenter.sms.selectedGuardIds.delete(guardId);
    }
    updateSMSTargetSummary();
    const countSub = document.getElementById('sms-recipients-count-sub');
    if (countSub) {
      countSub.innerText = `${window.CallCenter.sms.selectedGuardIds.size} of ${window.CallCenter.sms.allGuards.length} guards selected`;
    }
  };

  window.applySMSTemplate = function (type) {
    const templates = {
      emergency: {
        text: 'ALERT: CorpSec Emergency muster drill initiated. All deployed personnel must immediately report readiness and post security status to Central Dispatch.',
        category: 'EMERGENCY'
      },
      turnout: {
        text: 'REMINDER: Incoming shift handover begins in 30 minutes. Complete physical post inspection and ensure site occurrence logbook is duly countersigned.',
        category: 'SHIFT'
      },
      callback: {
        text: 'URGENT DISPATCH: Contact CorpSec Central Dispatch operations desk immediately on +254711082143 regarding duty assignment.',
        category: 'DISPATCH'
      },
      advance: {
        text: 'FINANCE NOTICE: Your approved mid-month salary advance has been disbursed to your registered M-Pesa mobile number.',
        category: 'PAYROLL'
      }
    };

    const tmpl = templates[type];
    if (!tmpl) return;

    const textArea = document.getElementById('cc-sms-message-text');
    const catSelect = document.getElementById('sms-category-select');

    if (textArea) textArea.value = tmpl.text;
    if (catSelect) catSelect.value = tmpl.category;
    window.onSMSMessageTextInput(tmpl.text);
  };

  window.onSMSMessageTextInput = function (text) {
    const len = (text || '').length;
    const segments = Math.ceil(len / 160) || 1;
    const counterEl = document.getElementById('sms-char-counter');
    if (counterEl) {
      counterEl.innerText = `${len} / ${segments * 160} chars (${segments} SMS segment${segments > 1 ? 's' : ''})`;
    }
  };

  window.submitGuardSMS = async function () {
    const textArea = document.getElementById('cc-sms-message-text');
    const text = (textArea ? textArea.value : '').trim();

    if (!text) {
      if (typeof showToast === 'function') showToast('Please enter message text before transmitting.', 'warning');
      return;
    }

    const mode = window.CallCenter.sms.mode || 'ALL';
    const category = document.getElementById('sms-category-select')?.value || 'GENERAL';
    let guardIds = [];
    let siteId = null;

    if (mode === 'SPECIFIED') {
      guardIds = Array.from(window.CallCenter.sms.selectedGuardIds);
      if (guardIds.length === 0) {
        if (typeof showToast === 'function') showToast('Please select at least one guard from the checklist.', 'warning');
        return;
      }
    } else if (mode === 'SITE') {
      siteId = window.CallCenter.sms.siteId;
      if (!siteId) {
        if (typeof showToast === 'function') showToast('Please select a client site deployment.', 'warning');
        return;
      }
    }

    const btn = document.getElementById('btn-dispatch-guard-sms');
    const label = document.getElementById('btn-dispatch-sms-label');
    if (btn) btn.disabled = true;
    if (label) label.innerText = 'Transmitting...';

    try {
      const payload = {
        recipient_type: mode,
        message_text: text,
        category: category,
        guard_ids: guardIds.length ? guardIds : null,
        site_id: siteId ? parseInt(siteId) : null
      };

      const res = await callCenterFetch('/call-center/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res && (res.message_id || res.id || res.success)) {
        if (typeof showToast === 'function') {
          showToast(`✅ SMS broadcast transmitted successfully to ${res.total_recipients} guard(s)!`, 'success');
        }
        if (textArea) textArea.value = '';
        window.onSMSMessageTextInput('');
        await window.loadGuardSMSView();
      } else {
        throw new Error((res && res.detail) ? res.detail : 'SMS dispatch failed');
      }
    } catch (err) {
      console.error('Error submitting Guard SMS:', err);
      if (typeof showToast === 'function') {
        showToast('SMS Dispatch failed: ' + (err.message || 'Unknown server error'), 'danger');
      }
    } finally {
      if (btn) btn.disabled = false;
      if (label) label.innerText = 'Transmit SMS';
    }
  };

  window.loadGuardSMSHistory = async function () {
    const tbody = document.getElementById('sms-history-table-body');
    if (!tbody) return;

    try {
      const history = await callCenterFetch('/call-center/sms/history?limit=50');
      const list = Array.isArray(history) ? history : (history && history.items ? history.items : []);
      window.CallCenter.sms.history = list;

      const badge = document.getElementById('sms-history-count-badge');
      if (badge) badge.innerText = `${list.length} dispatch${list.length === 1 ? '' : 'es'}`;

      if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:24px; color:#64748B;">No SMS text dispatches recorded yet. Use the composer above to transmit messages.</td></tr>`;
        return;
      }

      tbody.innerHTML = list.map(m => {
        const dateStr = m.created_at ? new Date(m.created_at).toLocaleString() : '--';
        let scopeBadge = '<span class="badge" style="background:#EEF2FF; color:#4338CA; font-weight:700;">📢 All Guards</span>';
        if (m.recipient_type === 'SPECIFIED') scopeBadge = `<span class="badge" style="background:#F0FDF4; color:#166534; font-weight:700;">🎯 Specified (${m.total_recipients})</span>`;
        else if (m.recipient_type === 'SITE') scopeBadge = `<span class="badge" style="background:#FFFBEB; color:#92400E; font-weight:700;">🏢 Site Deployed</span>`;

        let catBadge = `<span class="badge" style="background:#F1F5F9; color:#475569;">${escapeHtml(m.category || 'GENERAL')}</span>`;
        if (m.category === 'EMERGENCY') catBadge = `<span class="badge" style="background:#FEE2E2; color:#991B1B; font-weight:700;">🚨 EMERGENCY</span>`;
        else if (m.category === 'SHIFT') catBadge = `<span class="badge" style="background:#FEF3C7; color:#92400E; font-weight:700;">⏰ SHIFT</span>`;
        else if (m.category === 'DISPATCH') catBadge = `<span class="badge" style="background:#EFF6FF; color:#1D4ED8; font-weight:700;">📞 DISPATCH</span>`;
        else if (m.category === 'PAYROLL') catBadge = `<span class="badge" style="background:#ECFDF5; color:#065F46; font-weight:700;">💰 PAYROLL</span>`;

        let statusBadge = '<span class="badge" style="background:#ECFDF5; color:#065F46; font-weight:700;">DELIVERED</span>';
        if (m.status === 'SENT') statusBadge = '<span class="badge" style="background:#EFF6FF; color:#1E40AF; font-weight:700;">SENT</span>';
        else if (m.status === 'FAILED') statusBadge = '<span class="badge" style="background:#FEE2E2; color:#991B1B; font-weight:700;">FAILED</span>';

        const rawText = m.message_text || '';
        const textExcerpt = rawText.length > 55 ? (rawText.substring(0, 55) + '...') : rawText;

        const refCode = m.reference_code || m.message_reference || ('SMS-' + m.id);
        return `
          <tr>
            <td style="padding:10px 12px; font-weight:700; font-family:monospace; color:#4338CA;">${escapeHtml(refCode)}</td>
            <td style="padding:10px 12px; white-space:nowrap; color:#475569;">${dateStr}</td>
            <td style="padding:10px 12px;">${scopeBadge}</td>
            <td style="padding:10px 12px;">${catBadge}</td>
            <td style="padding:10px 12px; color:#1E293B; max-width:240px;" title="${escapeHtml(rawText)}">${escapeHtml(textExcerpt)}</td>
            <td style="padding:10px 12px; font-weight:700; color:#1E293B;">${m.delivered_count} / ${m.total_recipients}</td>
            <td style="padding:10px 12px;">${statusBadge}</td>
            <td style="padding:10px 12px; color:#475569;">${escapeHtml(m.sender_name || 'System Dispatch')}</td>
            <td style="padding:10px 12px; text-align:center;">
              <button class="btn btn-secondary" onclick="viewSMSRecipients(${m.id})"
                style="font-size:11px; padding:4px 8px; cursor:pointer;">
                👁️ Audit
              </button>
            </td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error('Error fetching SMS history:', err);
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:16px; color:#EF4444;">Failed to load SMS dispatch log.</td></tr>`;
    }
  };

  window.viewSMSRecipients = async function (smsId) {
    const modal = document.getElementById('modal-sms-recipients');
    if (!modal) return;
    modal.style.display = 'flex';

    const titleEl = document.getElementById('modal-sms-rec-title');
    const subEl = document.getElementById('modal-sms-rec-sub');
    const textEl = document.getElementById('modal-sms-rec-text');
    const tbody = document.getElementById('modal-sms-rec-tbody');

    if (titleEl) titleEl.innerText = `📨 SMS Delivery Audit (Batch #${smsId})`;
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:16px; color:#64748B;">Loading recipient records...</td></tr>`;

    try {
      const cached = (window.CallCenter.sms.history || []).find(x => x.id === smsId);
      if (cached) {
        if (textEl) textEl.innerText = cached.message_text || '--';
        if (subEl) subEl.innerText = `Batch Ref: ${cached.reference_code || cached.message_reference || ''} • Sent: ${cached.created_at ? new Date(cached.created_at).toLocaleString() : ''} • Dispatcher: ${cached.sender_name || 'System'}`;
      }

      const res = await callCenterFetch(`/call-center/sms/${smsId}/recipients`);
      if (!tbody) return;

      if (res && typeof res === 'object') {
        if (textEl && res.message_text) textEl.innerText = res.message_text;
        if (subEl) subEl.innerText = `Batch Ref: ${res.message_reference || ''} • Sent: ${res.created_at || ''} • Dispatcher: ${res.sender_name || 'System'}`;
      }

      const recs = (res && Array.isArray(res.recipients)) ? res.recipients : (Array.isArray(res) ? res : []);
      if (!recs.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:16px; color:#64748B;">No individual recipient records logged for this dispatch.</td></tr>`;
        return;
      }

      tbody.innerHTML = recs.map(r => {
        const stat = (r.status || r.delivery_status || 'DELIVERED').toUpperCase();
        let badge = '<span class="badge" style="background:#ECFDF5; color:#065F46; font-weight:700;">DELIVERED</span>';
        if (stat === 'SENT') badge = '<span class="badge" style="background:#EFF6FF; color:#1E40AF; font-weight:700;">SENT</span>';
        else if (stat === 'FAILED') badge = '<span class="badge" style="background:#FEE2E2; color:#991B1B; font-weight:700;">FAILED</span>';

        return `
          <tr>
            <td style="padding:8px 10px; font-weight:600; color:#1E293B;">
              ${escapeHtml(r.guard_name || 'Guard')}
              <div style="font-size:10px; color:#64748B; font-weight:normal;">${escapeHtml(r.employee_number || '')}</div>
            </td>
            <td style="padding:8px 10px; font-family:monospace; color:#334155;">${escapeHtml(r.phone_number || '')}</td>
            <td style="padding:8px 10px; color:#475569;">${escapeHtml(r.site_name || 'Unassigned')}</td>
            <td style="padding:8px 10px;">${badge}</td>
            <td style="padding:8px 10px; font-family:monospace; font-size:11px; color:#64748B;">${escapeHtml(r.gateway_message_id || '--')}</td>
          </tr>
        `;
      }).join('');
    } catch (err) {
      console.error('Error fetching SMS recipient details:', err);
      if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:16px; color:#EF4444;">Failed to load recipient audit receipts.</td></tr>`;
    }
  };

  window.closeSMSRecipientsModal = function () {
    const modal = document.getElementById('modal-sms-recipients');
    if (modal) modal.style.display = 'none';
  };

  /* ==========================================================================
     19. Initialization Function
     ========================================================================== */
  window.initCallCenter = function () {
    initCallCenterWebSocket();
    fetchCurrentAgentStatus();
    loadCallCenterOverview();
    switchCallCenterSubTab('phone');
    initDraggableSoftphone();
  };

  // Auto-init draggable softphone when DOM loads; WS/status are started only after verified login in checkAuthStatus()
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initDraggableSoftphone();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      initDraggableSoftphone();
    });
  }

})();
