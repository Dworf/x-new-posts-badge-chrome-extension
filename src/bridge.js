// X New-Posts Badge — isolated content-script bridge.
// Relays messages between the MAIN-world engine (window.postMessage) and the service worker
// (chrome.runtime), and pushes chrome.storage settings into the engine.
(function () {
  'use strict';
  var MSG = 'xnpb';
  var DEFAULTS = { toolbar: true, title: true, favicon: true, appBadge: true, foreground: false };
  var DEBUG = false; try { DEBUG = (localStorage.getItem('xnpbDebug') === '1'); } catch (e) {}
  function stamp() { var d = new Date(); return d.toTimeString().slice(0, 8) + '.' + ('00' + d.getMilliseconds()).slice(-3); }
  function log() { if (!DEBUG) return; try { console.log.apply(console, ['[xnpb:bridge ' + stamp() + ']'].concat([].slice.call(arguments))); } catch (e) {} }

  function toEngine(payload) {
    window.postMessage({ source: MSG + ':bridge', payload: payload }, location.origin);
  }

  // engine -> bridge -> service worker
  window.addEventListener('message', function (ev) {
    if (ev.source !== window) return;
    var d = ev.data;
    if (!d || d.source !== MSG + ':engine' || !d.payload) return;
    if (d.payload.type === 'count') {
      try { chrome.runtime.sendMessage({ type: 'count', count: d.payload.count }, function () { void chrome.runtime.lastError; }); } catch (e) {}
    }
  });

  // service worker -> bridge -> engine (e.g. "trigger" on the alarm)
  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.type === 'trigger') { log('trigger from SW -> engine'); toEngine({ type: 'trigger' }); }
  });

  // settings: load now, push to engine, and watch for changes
  function pushSettings(s) {
    toEngine({ type: 'settings', settings: {
      toolbar: s.toolbar !== false, title: s.title !== false, favicon: s.favicon !== false,
      appBadge: s.appBadge !== false, foreground: s.foreground === true
    } });
  }
  chrome.storage.sync.get(DEFAULTS, function (s) { pushSettings(s); });
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'sync') return;
    chrome.storage.sync.get(DEFAULTS, function (s) { pushSettings(s); });
  });
})();
