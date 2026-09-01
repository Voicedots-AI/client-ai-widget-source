# Client AI Widget — source and per-client builds

One codebase. One built file per client. Client pages point at a branch we can
overwrite, never at a version tag.

## Why this repo exists

The old setup embedded a pinned version, e.g. `@v3.1.0`. jsDelivr treats a
version tag as permanent — it resolves the tag to one commit and caches it
forever — so a client on a pinned tag can never receive a fix without editing
their own HTML. That is what stranded DSCET on a broken build.

Here, every client embeds `@main/builds/<client>/widget.js`. We can overwrite
that file whenever we like and their site picks it up.

The old repos stay frozen until their clients migrate.

## Layout

```
src/                     the widget code — the only place it lives
clients/<name>.json      per-client config: embed settings, tag name
builds/<name>/widget.js  what that client's page loads
builds/<name>/embed.html the exact snippet that client pastes
scripts/build_client.py  builds one client
tests/                   pytest suite for the build script
```

## Adding a client

1. Copy `clients/_template.json` to `clients/<name>.json` and fill in the agent
   ID, title, colours and avatars.
2. `python3 scripts/build_client.py <name>`
3. Commit `builds/<name>/` and push.
4. Purge the CDN so the change is live immediately rather than in ~12 hours:
   `curl https://purge.jsdelivr.net/gh/Voicedots-AI/client-ai-widget-source@main/builds/<name>/widget.js`
5. Send them the contents of `builds/<name>/embed.html`.

Building one client never touches another. Each client updates only when you
rebuild and push that client.

## How the widget starts up

These keys go in the `embed` block of `clients/<name>.json`:

| Key | Effect |
|---|---|
| `widgetWidth` | Card width, e.g. `"240px"`. Defaults to `300px` |
| `minimized` | `true` starts as the collapsed pill instead of the open card |
| `mobileMinimized` | Same, for viewports ≤ 768px. Falls back to `minimized` when absent |
| `autoCloseSeconds` | Fold the opening card away after N seconds. Cancelled the moment the visitor opens, closes, or talks to it, and never fires twice |

The viewport is read once, when the widget mounts, so resizing a window never
takes the card away from someone mid-conversation.

## Settings a client's page cannot give us

The `config` attribute lives in the client's own HTML. Some of them pasted it
into a CMS or a GTM tag we no longer have access to, so their snippet is frozen
at whatever it said the day it went up.

For those, put the keys in a `forceEmbed` block alongside `embed`:

```json
"forceEmbed": { "widgetWidth": "240px", "minimized": true }
```

`forceEmbed` is baked into that client's bundle at build time and beats the
config on their page, so a rebuild plus a CDN purge changes their widget with
no edit to their HTML. Keep the same values in `embed` too — that is what a
fresh paste would use, and the test suite fails if the two drift apart.

## What is configured where

| Thing | Where it lives |
|---|---|
| Which tools the agent has (lead capture, ERP lookup, attendance) | Database — `enabled_tools` on the agent profile |
| Spoken name, greeting, persona wording | Database — agent profile |
| Title, logo, theme colour, avatars, position, size, startup state | `clients/<name>.json` → the embed snippet |
| The same, for a client whose HTML we cannot edit | `clients/<name>.json` → `forceEmbed`, baked into their bundle |
| Custom HTML tag name | `clients/<name>.json` → `tagName` |
| Bug fixes and new features | `src/`, once, for everyone |

Most per-client differences are database settings, not builds. Only reach for a
build flag when the difference is genuinely in the code.

## Before a client's widget will connect

The backend rejects the WebSocket unless the client's site origin is listed on
their agent profile (`web_origins`). A fresh embed that silently fails is nearly
always this.

## Tests

```
python3 -m venv .venv && .venv/bin/pip install pytest
.venv/bin/python -m pytest tests/ -q
```
