// X New-Posts Badge — service worker.
// Drives the ~60s background trigger cadence with chrome.alarms (page timers throttle in
// background), and sets the toolbar badge from engine count reports.
'use strict';

var ALARM = 'xnpb-tick';
var DEFAULTS = { toolbar: true, title: true, favicon: true, appBadge: true, foreground: false };
var X_MATCHES = ['https://x.com/*', 'https://twitter.com/*', 'https://mobile.x.com/*', 'https://mobile.twitter.com/*'];

chrome.runtime.onInstalled.addListener(function () { ensureAlarm(); });
chrome.runtime.onStartup.addListener(function () { ensureAlarm(); });

// No popup (badge-only), so a click on the toolbar icon opens the settings page.
chrome.action.onClicked.addListener(function () { chrome.runtime.openOptionsPage(); });
// ~72s period. X's gate needs the tab "hidden" >= ~60s between our re-hide and the next focus; the
// engine re-hides ~4s after each focus, so the effective hidden gap is period - ~4s (~68s), safely
// above the 60s floor. (Packed extensions clamp periodInMinutes to a 1-minute minimum, so we cannot
// go below ~60s anyway — which matches X's gate.)
function ensureAlarm() {
  chrome.alarms.get(ALARM, function (a) {
    if (!a) chrome.alarms.create(ALARM, { periodInMinutes: 1.2 }); // alarms fire on-or-after schedule
  });
}
ensureAlarm();

// On each tick, tell every open X tab to (maybe) trigger. The engine ignores the trigger unless the
// tab is genuinely backgrounded, so foreground tabs stay passive.
chrome.alarms.onAlarm.addListener(function (a) {
  if (a.name !== ALARM) return;
  chrome.tabs.query({ url: X_MATCHES }, function (tabs) {
    for (var i = 0; i < tabs.length; i++) {
      chrome.tabs.sendMessage(tabs[i].id, { type: 'trigger' }, function () { void chrome.runtime.lastError; });
    }
  });
});

// Per-tab counts -> GLOBAL toolbar badge = MAX across open X tabs, so multiple X instances (e.g. a
// normal tab AND the installed app) don't fight over the badge and make it flicker. The badge is
// global so the count is visible on the toolbar icon from any tab (the whole point: see it while
// you're NOT on X). SW memory is ephemeral; tabs re-report (foreground every few seconds, background
// on each refresh) so the map repopulates after a worker restart.
var counts = {};  // tabId -> last reported count

chrome.runtime.onMessage.addListener(function (msg, sender) {
  if (!msg || msg.type !== 'count' || !sender.tab) return;
  counts[sender.tab.id] = msg.count;
  repaintBadge();
});

chrome.tabs.onRemoved.addListener(function (tabId) {
  if (tabId in counts) { delete counts[tabId]; repaintBadge(); }
});

function repaintBadge() {
  chrome.storage.sync.get(DEFAULTS, function (s) {
    var max = 0;
    for (var k in counts) if (counts[k] > max) max = counts[k];
    var text = (s.toolbar !== false) ? badgeText(max) : '';
    chrome.action.setBadgeBackgroundColor({ color: '#1d9bf0' }, function () { void chrome.runtime.lastError; });
    chrome.action.setBadgeText({ text: text }, function () { void chrome.runtime.lastError; });
  });
}

function badgeText(n) {
  n = Math.floor(Number(n) || 0);
  if (n <= 0) return '';
  if (n > 99) return '99+';
  return String(n);
}

// Repaint the toolbar badge when the toolbar toggle changes (off -> clear, on -> current max).
chrome.storage.onChanged.addListener(function (changes, area) {
  if (area !== 'sync' || !('toolbar' in changes)) return;
  repaintBadge();
});
