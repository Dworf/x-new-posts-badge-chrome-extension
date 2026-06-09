'use strict';
var DEFAULTS = { toolbar: true, title: true, favicon: true, appBadge: true, foreground: false };
var KEYS = ['toolbar', 'title', 'favicon', 'appBadge', 'foreground'];

function load() {
  chrome.storage.sync.get(DEFAULTS, function (s) {
    KEYS.forEach(function (k) { document.getElementById(k).checked = s[k] !== false; });
  });
}
function save() {
  var next = {};
  KEYS.forEach(function (k) { next[k] = document.getElementById(k).checked; });
  chrome.storage.sync.set(next);
}
KEYS.forEach(function (k) { document.getElementById(k).addEventListener('change', save); });
document.addEventListener('DOMContentLoaded', load);
