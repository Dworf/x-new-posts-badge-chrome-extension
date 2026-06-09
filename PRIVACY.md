# Privacy Policy — X New-Posts Badge

_Last updated: 2026-06-09_

**X New-Posts Badge** ("the extension") shows the number of new posts waiting on the X (formerly
Twitter) home timeline, on the toolbar icon, the tab title/favicon, and the installed-app icon.

## Data collection

The extension **does not collect, store, transmit, sell, or share any data** — personal or
otherwise. No analytics, no tracking, no accounts, no remote servers. It makes **no network requests
of its own**; it only observes the X home-timeline refresh that the page itself performs.

## How it works

All processing happens **locally in your browser**. To produce the count, the extension reads only
the number of new home-timeline entries from X's own `HomeLatestTimeline` response and X's on-page
"Show N posts" indicator. It does **not** read, store, or transmit the content of posts, your account
information, your browsing history, or any other information. Your three on/off preferences are
stored with Chrome's `storage.sync` so they follow your Chrome profile; nothing else is stored.

## Permissions

`alarms` (to refresh the count on a timer while a tab is in the background), `storage` (to remember
your on/off toggles), and host access to `x.com` / `twitter.com` (home timeline only) to run its
content script. No `tabs`, no `notifications`, no host access beyond X.

## Changes

If this policy changes, the updated version will be posted here with a new "last updated" date.

## Contact

Questions or concerns? Open an issue:
<https://github.com/Dworf/x-new-posts-badge-chrome-extension/issues>
