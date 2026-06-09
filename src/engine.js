// X New-Posts Badge — MAIN-world engine.
//
// WHAT X DOES (verified live 2026-06-09):
//   The home-timeline "Show N posts" count comes from the HomeLatestTimeline GraphQL call
//   (POST /i/api/graphql/<hash>/HomeLatestTimeline), sent via XHR. X refetches it on a
//   Page-Visibility -> focus transition, but only after the tab was continuously hidden >= ~60s.
//   The pill count is X's own running total of new non-cursor timeline entries; it is NOT a
//   field in any single response, and the pill is not rendered while the tab is hidden.
//
// DESIGN:
//   Override visibilityState/hidden/hasFocus (controllable), keep the native getters to read REAL
//   visibility, intercept the HomeLatestTimeline XHR, and count new non-cursor entries
//   (tweet- / home-conversation-, excluding cursor-* and promoted-*). Drive the tab title/favicon
//   and the Badging API directly from here (page context); report the count to the isolated bridge
//   for the toolbar badge. Foreground = passive (mirror X's real pill). Background = accumulate
//   from responses; the service worker's alarm tells us when to fire the synthetic trigger.

(function () {
  'use strict';

  // ---- pure: count new non-cursor timeline entries in a HomeLatestTimeline response ----
  function countNewEntries(json) {
    try {
      var instr = json.data.home.home_timeline_urt.instructions || [];
      var n = 0;
      for (var i = 0; i < instr.length; i++) {
        var entries = instr[i].entries;
        if (!entries) continue;
        for (var j = 0; j < entries.length; j++) {
          var id = entries[j] && entries[j].entryId;
          if (typeof id !== 'string') continue;
          if (id.indexOf('tweet-') === 0 || id.indexOf('home-conversation-') === 0) n++;
          // cursor-*, promoted-*, who-to-follow, etc. are not counted
        }
      }
      return n;
    } catch (e) { return 0; }
  }

  // ---- pure: badge text with 99+ cap ----
  function formatBadge(n) {
    n = Math.floor(Number(n) || 0);
    if (n <= 0) return '';
    if (n > 99) return '99+';
    return String(n);
  }

  // ---- DOM: read X's own "Show N posts" pill (0 if absent) ----
  var PILL_RE = /Show\s+([\d,]+)\s+posts?/i;
  function readPill() {
    // The pill is a button; matching its text on a button avoids false positives from tweet bodies.
    var els = document.querySelectorAll('button[role="button"], div[role="button"], button');
    for (var i = 0; i < els.length; i++) {
      var t = (els[i].textContent || '').trim();
      if (t.length > 40) continue;
      var m = t.match(PILL_RE);
      if (m) return parseInt(m[1].replace(/,/g, ''), 10) || 0;
    }
    return 0;
  }

  // ---- surfaces: tab title, favicon, app-icon badge ----
  // Title manager: keep X's real title as the base, and re-apply our "(N) " prefix on top. We never
  // permanently strip X's own title (including any "(N)" X itself shows) — clearing restores it
  // verbatim. A MutationObserver (set up later) re-asserts our prefix if X overwrites the title.
  var baseTitleRaw = (document.title || '');   // X's actual current title, raw
  var ourTitle = null;                          // the exact string WE last wrote (to detect X's writes)
  function setBaseTitle(t) { baseTitleRaw = t; }   // test hook
  function stripLeadingCount(t) { return t.replace(/^\(\d+\+?\)\s+/, ''); }
  function buildTitle(n) { return '(' + formatBadge(n) + ') ' + stripLeadingCount(baseTitleRaw); }

  function drawFaviconDataUri(n) {
    var size = 32;
    var c = document.createElement('canvas');
    c.width = size; c.height = size;
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#1d9bf0';                 // X blue
    ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); ctx.fill();
    var label = formatBadge(n);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold ' + (label.length >= 3 ? 14 : 20) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, size / 2, size / 2 + 1);
    return c.toDataURL('image/png');
  }
  function faviconLink() {
    var link = document.querySelector('link[rel~="icon"][data-xnpb]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      link.setAttribute('data-xnpb', '1');
      (document.head || document.documentElement).appendChild(link);
    }
    return link;
  }
  function hideOriginalFavicons(hide) {
    var links = document.querySelectorAll('link[rel~="icon"]:not([data-xnpb])');
    for (var i = 0; i < links.length; i++) links[i].disabled = hide;
  }

  // The app-icon (dock/taskbar) badge is per-ORIGIN and shared. Only the INSTALLED app should drive
  // it — a regular browser tab calling setAppBadge/clearAppBadge would fight the app window over the
  // same icon. So gate the app-badge surface to standalone/app display-mode.
  function isInstalledApp() {
    try {
      return (window.matchMedia && (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: minimal-ui)').matches ||
        window.matchMedia('(display-mode: window-controls-overlay)').matches)) ||
        navigator.standalone === true;
    } catch (e) { return false; }
  }

  var surfaces = {
    applyTitle: function (n) {
      ourTitle = buildTitle(n);
      document.title = ourTitle;
    },
    clearTitle: function () {
      ourTitle = baseTitleRaw;
      document.title = baseTitleRaw;
    },
    applyFavicon: function (n) {
      hideOriginalFavicons(true);
      faviconLink().href = drawFaviconDataUri(n);
    },
    clearFavicon: function () {
      var link = document.querySelector('link[rel~="icon"][data-xnpb]');
      if (link) link.remove();
      hideOriginalFavicons(false);
    },
    applyAppBadge: function (n) {
      if (!window.__xnpbTest && !isInstalledApp()) { log('appBadge skipped (not installed app)'); return; }
      try {
        if (n > 0 && navigator.setAppBadge) { log('setAppBadge(' + n + ')'); navigator.setAppBadge(n); }
        else if (navigator.clearAppBadge) { log('clearAppBadge (n=0)'); navigator.clearAppBadge(); }
      } catch (e) { log('appBadge error', e); }
    },
    clearAppBadge: function () {
      if (!window.__xnpbTest && !isInstalledApp()) return;
      try { log('clearAppBadge'); if (navigator.clearAppBadge) navigator.clearAppBadge(); } catch (e) {}
    }
  };

  // ---- count orchestration + settings gating ----
  var settings = { toolbar: true, title: true, favicon: true, appBadge: true, foreground: false };
  var count = 0;
  var reportCount = function () {};   // set by the messaging layer to notify the bridge

  function applyAllSurfaces() {
    if (settings.title && count > 0) surfaces.applyTitle(count); else surfaces.clearTitle();
    if (settings.favicon && count > 0) surfaces.applyFavicon(count); else surfaces.clearFavicon();
    if (settings.appBadge && count > 0) surfaces.applyAppBadge(count); else surfaces.clearAppBadge();
  }
  function setCount(n) {
    count = Math.max(0, Math.floor(Number(n) || 0));
    applyAllSurfaces();
    reportCount(count);
  }
  function applySettings(next) {
    if (next && typeof next === 'object') {
      if ('toolbar' in next) settings.toolbar = !!next.toolbar;
      if ('title' in next) settings.title = !!next.title;
      if ('favicon' in next) settings.favicon = !!next.favicon;
      if ('appBadge' in next) settings.appBadge = !!next.appBadge;
      if ('foreground' in next) settings.foreground = !!next.foreground;
    }
    applyAllSurfaces();
  }

  // ---- home gating ----
  function onHome() {
    return window.__xnpbTest === true || location.pathname === '/home';
  }

  // ---- real-visibility capture + controllable override ----
  var dVis = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState');
  var dHid = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
  var nativeVis = (dVis && dVis.get) ? dVis.get : function () { return 'visible'; };
  var nativeHidden = (dHid && dHid.get) ? dHid.get : function () { return false; };
  function realVisibility() { return nativeVis.call(document); }

  // REAL window focus is the reliable "is the user actually here?" signal. It is false for a
  // backgrounded TAB *and* for an installed app/PWA that's still on screen but not the focused app
  // (where visibilityState stays 'visible'). Capture the native impl before we override hasFocus.
  var nativeHasFocus = (typeof document.hasFocus === 'function')
    ? document.hasFocus.bind(document)
    : function () { return nativeVis.call(document) === 'visible'; };
  function isPresent() { try { return nativeHasFocus(); } catch (e) { return realVisibility() === 'visible'; } }
  // We trigger refreshes when "away". With the foreground-refresh option on, we treat the tab as
  // always away so it keeps refreshing even while focused (at the cost of X believing it's hidden).
  function effectiveAway() { return !isPresent() || settings.foreground; }

  // Optional debug logging: run `localStorage.xnpbDebug = '1'` in the console, then reload.
  var DEBUG = false; try { DEBUG = (localStorage.getItem('xnpbDebug') === '1'); } catch (e) {}
  function stamp() { var d = new Date(); return d.toTimeString().slice(0, 8) + '.' + ('00' + d.getMilliseconds()).slice(-3); }
  function log() { if (!DEBUG) return; try { console.log.apply(console, ['[xnpb ' + stamp() + ']'].concat([].slice.call(arguments))); } catch (e) {} }

  var fake = null;            // null = passthrough, else 'visible' | 'hidden'
  var dispatching = false;    // true while WE synthesize visibility events (so we ignore our own)
  var rehideTimer = null;     // pending re-hide after a synthetic focus
  var awaitingTrigger = false;// true briefly after our synthetic focus, to attribute the refetch to us
  var awaitTimer = null;
  try {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true, get: function () { return fake !== null ? fake : nativeVis.call(document); }
    });
    Object.defineProperty(document, 'hidden', {
      configurable: true, get: function () { return fake !== null ? (fake === 'hidden') : nativeHidden.call(document); }
    });
    document.hasFocus = function () { return document.visibilityState === 'visible'; };
  } catch (e) { /* leave native behavior */ }

  function dispatchVisible() {
    dispatching = true;
    fake = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    dispatching = false;
  }
  function dispatchHidden() {
    dispatching = true;
    fake = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('blur'));
    dispatching = false;
  }

  // ---- XHR interception ----
  var HLT = 'HomeLatestTimeline';
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, url) {
    if (typeof url === 'string' && url.indexOf(HLT) !== -1) {
      this.addEventListener('load', function () {
        try { onHltResponse(this.responseText, effectiveAway()); } catch (e) {}
      });
    }
    return origOpen.apply(this, arguments);
  };

  // ---- count state machine ----
  function onHltResponse(text, isBackground) {
    if (!onHome()) return;
    var json; try { json = JSON.parse(text); } catch (e) { return; }
    var add = countNewEntries(json);
    log('HLT response: away=' + isBackground + ' ours=' + awaitingTrigger + ' newEntries=' + add + ' (count=' + count + ')');
    if (isBackground) {
      // Only count refetches WE triggered. X's own HomeLatestTimeline fetches while away — the
      // initial full timeline load (~40-85 entries), scroll pagination, etc. — are NOT "new posts"
      // and would massively over-count. Our synthetic focus sets awaitingTrigger just beforehand.
      if (awaitingTrigger) { awaitingTrigger = false; if (add > 0) setCount(count + add); }
    } else {
      reconcileToPill();   // present: the rendered pill is ground truth
    }
  }
  function reconcileToPill() {
    if (!onHome()) return;
    setCount(readPill());   // pill is ground truth; 0 when X has cleared it
  }

  // ---- trigger (called via the bridge on the SW alarm) ----
  // "Away" = the window is NOT focused (covers a backgrounded tab AND an app-switched-but-visible
  // PWA). X only refetches on a hidden->visible edge after >= ~60s hidden, so we synthesize the
  // focus, then re-hide a few seconds later (after X has reacted) so the NEXT alarm forms a fresh
  // edge. The re-hide is cancelable: if the user genuinely returns first, we must not re-hide on them.
  function maybeTrigger() {
    log('alarm: present=' + isPresent() + ' away=' + effectiveAway() + ' vis=' + realVisibility() + ' onHome=' + onHome() + ' count=' + count);
    if (!onHome()) return;
    if (!effectiveAway()) return;     // truly present and foreground-refresh off -> stay passive
    if (fake === 'visible') return;   // a synthetic cycle is already in flight; don't stack
    if (fake !== 'hidden') {          // not armed yet (e.g. foreground-refresh while focused) -> arm, trigger next cycle
      fake = 'hidden';
      log('  -> armed hidden (will trigger next cycle)');
      return;
    }
    log('  -> trigger: dispatchVisible');
    dispatchVisible();
    awaitingTrigger = true;   // attribute the next HomeLatestTimeline response to this trigger
    if (awaitTimer) clearTimeout(awaitTimer);
    awaitTimer = setTimeout(function () { awaitingTrigger = false; }, 8000);
    if (rehideTimer) clearTimeout(rehideTimer);
    rehideTimer = setTimeout(function () {
      rehideTimer = null;
      if (effectiveAway()) {
        dispatchHidden();  // re-hide so the next alarm forms a fresh edge
        // The host PWA (X) clears the shared per-origin app badge while reacting to our synthetic
        // focus/blur. Re-assert our surfaces after it has settled so the dock badge sticks.
        setTimeout(function () { if (effectiveAway()) applyAllSurfaces(); }, 1800);
      }
    }, 4000);
  }

  // ---- real present/away transitions (focus is the source of truth; also catch visibilitychange) ----
  function onRealStateChange() {
    if (dispatching) return;                    // our own synthetic event; ignore
    if (isPresent()) {
      // user genuinely returned: cancel any pending re-hide, drop overrides, reconcile to the pill
      log('real change -> PRESENT (reconcile)');
      if (rehideTimer) { clearTimeout(rehideTimer); rehideTimer = null; }
      if (awaitTimer) { clearTimeout(awaitTimer); awaitTimer = null; }
      awaitingTrigger = false;
      fake = null;
      reconcileToPill();
    } else {
      // user left: arm hidden so our later synthetic 'visible' is a real transition for X
      log('real change -> AWAY (arm hidden)');
      fake = 'hidden';
    }
  }
  document.addEventListener('visibilitychange', onRealStateChange, true);
  window.addEventListener('focus', onRealStateChange, true);
  window.addEventListener('blur', onRealStateChange, true);

  // ---- messaging with the isolated bridge (window.postMessage) ----
  var MSG = 'xnpb';
  function postToBridge(payload) {
    window.postMessage({ source: MSG + ':engine', payload: payload }, location.origin);
  }
  reportCount = function (n) { postToBridge({ type: 'count', count: n }); };

  window.addEventListener('message', function (ev) {
    if (ev.source !== window) return;
    var d = ev.data;
    if (!d || d.source !== MSG + ':bridge' || !d.payload) return;
    var p = d.payload;
    if (p.type === 'trigger') maybeTrigger();
    else if (p.type === 'settings') applySettings(p.settings);
  });

  // ---- testable namespace ----
  window.__xnpb = {
    countNewEntries: countNewEntries,
    formatBadge: formatBadge,
    readPill: readPill,
    surfaces: surfaces,
    setCount: setCount,
    applySettings: applySettings,
    maybeTrigger: maybeTrigger,
    reconcileToPill: reconcileToPill,
    __setBaseTitleForTest: setBaseTitle,
    __getCountForTest: function () { return count; },
    __setReportForTest: function (fn) { reportCount = fn; },
    __onHltResponseForTest: onHltResponse,
    __reconcileToPillForTest: reconcileToPill,
    __setAwaitingForTest: function (b) { awaitingTrigger = b; },
    __resetForTest: function () { count = 0; fake = null; awaitingTrigger = false; }
  };

  // ---- re-assert our title if X (an SPA) overwrites it; keep baseTitleRaw in sync ----
  // X rewrites document.title on navigation and in-place updates, which would drop our "(N) "
  // prefix. When the title changes to something we didn't write, treat it as X's new base and,
  // if we have a count to show on home, re-apply our prefix. (Skipped in the test harness.)
  function startTitleObserver() {
    var titleEl = document.querySelector('title');
    if (!titleEl) {
      titleEl = document.createElement('title');
      (document.head || document.documentElement).appendChild(titleEl);
    }
    var obs = new MutationObserver(function () {
      if (document.title === ourTitle) return;     // our own write; ignore
      baseTitleRaw = document.title;               // X changed it
      if (onHome() && count > 0 && settings.title) {
        ourTitle = buildTitle(count);
        document.title = ourTitle;                 // re-assert (terminates: next mutation == ourTitle)
      }
    });
    obs.observe(titleEl, { childList: true, characterData: true, subtree: true });
  }

  // ---- foreground watcher: mirror X's real pill, and detect a pill-clear with no event ----
  // While focused on /home, the pill is ground truth and can appear/clear with no HLT or visibility
  // change (e.g. you click it). Poll-reconcile cheaply. Off-home, clear our (now stale) surfaces.
  function startForegroundWatcher() {
    setInterval(function () {
      if (!isPresent()) return;        // away (any kind) uses accumulation, not the DOM pill
      if (settings.foreground) return; // foreground-refresh mode drives the count via triggers
      if (onHome()) reconcileToPill();
      else if (count > 0) setCount(0);
    }, 3000);
  }

  // ---- start passive; reconcile once the pill may exist ----
  function init() {
    log('init: present=' + isPresent() + ' vis=' + realVisibility() + ' onHome=' + onHome());
    if (!window.__xnpbTest) { startTitleObserver(); startForegroundWatcher(); }
    if (!onHome()) return;
    if (isPresent()) reconcileToPill();
    else fake = 'hidden';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
