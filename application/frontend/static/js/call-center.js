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
    lookupDebounceTimer: null
  };

  /* ==========================================================================
     API Helper: Auto-resolves tokens and unwraps JSON responses
     ========================================================================== */
  async function callCenterFetch(endpoint, options = {}) {
    options = options || {};
    options.headers = options.headers || {};

    const token = localStorage.getItem('corpsec_token') ||
                  localStorage.getItem('token') ||
                  (typeof authToken !== 'undefined' ? authToken : '');

    if (token && !options.headers['Authorization']) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const apiBase = typeof API_BASE !== 'undefined' ? API_BASE : '';
    const fullUrl = endpoint.startsWith('http') ? endpoint : `${apiBase}${endpoint}`;

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
    if (window.CallCenter.ws && window.CallCenter.ws.readyState === WebSocket.OPEN) {
      return;
    }

    const token = localStorage.getItem('corpsec_token') ||
                  localStorage.getItem('token') ||
                  (typeof authToken !== 'undefined' ? authToken : '');

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
        setTimeout(initCallCenterWebSocket, 5000);
      };
    } catch (e) {
      console.warn('WebSocket init exception', e);
    }
  }

  function handleWebSocketMessage(msg) {
    if (!msg || !msg.event) return;

    if (msg.event === 'call:incoming') {
      onIncomingCallReceived(msg.data);
    } else if (msg.event === 'call:answered') {
      if (window.CallCenter.currentCall && window.CallCenter.currentCall.id === msg.data.call_id) {
        onCallConnected(msg.data);
      }
    } else if (msg.event === 'call:ended') {
      if (window.CallCenter.currentCall && window.CallCenter.currentCall.id === msg.data.call_id) {
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
      const res = await callCenterFetch('/api/v1/call-center/agent-status', {
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
    try {
      const res = await callCenterFetch('/api/v1/call-center/agent-status');
      if (res && res.status) {
        updateAgentStatusUI(res.status);
      }
    } catch (e) {
      console.warn('Could not fetch agent status', e);
    }
  }

  /* ==========================================================================
     4. Persistent Softphone Widget Controls
     ========================================================================== */
  window.toggleSoftphone = function (forceState) {
    const widget = document.getElementById('softphone-widget-container');
    const expanded = document.getElementById('softphone-expanded');
    const minimized = document.getElementById('softphone-minimized');

    if (!widget || !expanded || !minimized) return;

    if (typeof forceState === 'boolean') {
      window.CallCenter.isSoftphoneOpen = forceState;
    } else {
      window.CallCenter.isSoftphoneOpen = !window.CallCenter.isSoftphoneOpen;
    }

    if (window.CallCenter.isSoftphoneOpen) {
      expanded.style.display = 'flex';
      minimized.style.display = 'none';
      getAudioContext(); // user gesture unlocks audio
    } else {
      expanded.style.display = 'none';
      minimized.style.display = 'flex';
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
        const contact = await callCenterFetch(`/api/v1/call-center/contacts/lookup?phone=${encodeURIComponent(trimmed)}`);
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

  // Dial Outbound Call
  window.softphoneDialCall = async function (overrideNumber) {
    const input = document.getElementById('softphone-number-input');
    const destination = overrideNumber || (input ? input.value.trim() : '');

    if (!destination) {
      if (typeof showToast === 'function') showToast('Please enter a phone number to dial', 'warning');
      return;
    }

    window.toggleSoftphone(true);
    startRingingAudio();

    try {
      const res = await callCenterFetch('/api/v1/call-center/calls/dial', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination_number: destination,
          caller_id_number: '+254 20 790 0000'
        })
      });

      if (res && res.call_id) {
        window.CallCenter.currentCall = {
          id: res.call_id,
          call_sid: res.call_sid,
          caller_name: res.recipient_name || destination,
          caller_number: destination,
          status: 'IN_PROGRESS'
        };
        showActiveCallScreen(window.CallCenter.currentCall);
        setCallCenterAgentStatus('ON_CALL');
      } else {
        stopRingingAudio();
        if (typeof showToast === 'function') showToast('Failed to initiate outbound call', 'danger');
      }
    } catch (e) {
      stopRingingAudio();
      console.error('Call dial error', e);
      if (typeof showToast === 'function') showToast('Error connecting call: ' + (e.message || ''), 'danger');
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
      const res = await callCenterFetch(`/api/v1/call-center/calls/${window.CallCenter.currentCall.id || window.CallCenter.currentCall.call_id}/answer`, {
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

    if (!window.CallCenter.currentCall) return;

    try {
      const callId = window.CallCenter.currentCall.id || window.CallCenter.currentCall.call_id;
      await callCenterFetch(`/api/v1/call-center/calls/${callId}/hangup`, {
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
      document.getElementById('minimized-call-status').innerText = 'Softphone Ready';
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
      await callCenterFetch(`/api/v1/call-center/calls/${callId}/hold`, {
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
      await callCenterFetch(`/api/v1/call-center/calls/${callId}/transfer`, {
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

      await callCenterFetch(`/api/v1/call-center/calls/${callId}/hangup`, {
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
    else if (subTabId === 'settings') renderSettingsView();
  };

  function refreshActiveViews() {
    loadCallCenterOverview();
    if (window.CallCenter.activeSubTab === 'history') loadCallHistory();
    if (window.CallCenter.activeSubTab === 'queues') loadCallQueues();
    if (window.CallCenter.activeSubTab === 'team') loadTeamPresence();
    if (window.CallCenter.activeSubTab === 'missed') loadMissedCalls();
    if (window.CallCenter.activeSubTab === 'reports') loadAnalyticsReports();
  }

  /* ==========================================================================
     6. KPI Summary & Overview - Direct from Database
     ========================================================================== */
  window.loadCallCenterOverview = async function () {
    try {
      const data = await callCenterFetch('/api/v1/call-center/overview');
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

      if (badgeNumbers) badgeNumbers.innerText = data.virtual_numbers_count ?? 2;
      if (badgeQueues) badgeQueues.innerText = data.active_queues_count ?? (data.active_queues ? data.active_queues.length : 2);
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
      const queues = await callCenterFetch('/api/v1/call-center/queues');
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
      const calls = await callCenterFetch('/api/v1/call-center/calls?limit=5');
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

      let url = `/api/v1/call-center/calls?limit=50`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (direction) url += `&direction=${encodeURIComponent(direction)}`;

      const calls = await callCenterFetch(url);
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
        const recordingPlayer = c.recording_url
          ? `<div class="cc-audio-player">
               <audio controls src="${c.recording_url}" preload="none"></audio>
             </div>`
          : `<span style="color:#94A3B8; font-size:11px;">None</span>`;

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
      const numbers = await callCenterFetch('/api/v1/call-center/numbers');
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
      const queues = await callCenterFetch('/api/v1/call-center/queues');
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
      let url = `/api/v1/call-center/contacts`;
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
      const queues = await callCenterFetch('/api/v1/call-center/queues');
      const numbers = await callCenterFetch('/api/v1/call-center/numbers');

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
      const agents = await callCenterFetch('/api/v1/call-center/agents');
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

  /* ==========================================================================
     14. Sub-View: Recordings Library
     ========================================================================== */
  window.loadCallRecordings = async function () {
    const tbody = document.getElementById('cc-recordings-table-body');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:24px; color:#64748B;">Loading recordings from database...</td></tr>`;

    try {
      const calls = await callCenterFetch('/api/v1/call-center/recordings');
      if (!calls || !calls.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:32px; color:#64748B;">No audio recordings found in database yet.</td></tr>`;
        return;
      }

      tbody.innerHTML = calls.map(c => `
        <tr>
          <td>
            <div style="font-weight:700; color:#0F172A;">${c.caller_name || 'Caller'}</div>
            <div style="font-size:11px; color:#64748B; font-family:monospace;">${c.caller_number}</div>
          </td>
          <td>${c.agent_name || 'Agent'}</td>
          <td>${formatDate(c.created_at || c.started_at)}</td>
          <td style="font-weight:700;">${formatCallDuration(c.duration_seconds)}</td>
          <td>
            <div class="cc-audio-player">
              <audio controls src="${c.recording_url}" preload="metadata"></audio>
            </div>
          </td>
          <td>
            <a href="${c.recording_url}" download="call_recording_${c.id}.wav" class="btn btn-secondary" style="font-size:11px; padding:4px 8px; text-decoration:none;">
              ⬇ Download
            </a>
          </td>
        </tr>
      `).join('');
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
      const calls = await callCenterFetch('/api/v1/call-center/missed');
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
      const data = await callCenterFetch('/api/v1/call-center/overview');
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
      const res = await callCenterFetch('/api/v1/call-center/calls/simulate-incoming', {
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
      await callCenterFetch(`/api/v1/call-center/calls/${callId}/notes`, {
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
     19. Initialization Function
     ========================================================================== */
  window.initCallCenter = function () {
    initCallCenterWebSocket();
    fetchCurrentAgentStatus();
    loadCallCenterOverview();
    switchCallCenterSubTab('phone');
  };

  // Auto-init status when DOM loads
  document.addEventListener('DOMContentLoaded', () => {
    fetchCurrentAgentStatus();
    initCallCenterWebSocket();
  });

})();
