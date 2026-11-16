# Impeccable report — Pixel Hotel

Date: 16 Nov 2026, 10:12 AM (Asia/Singapore)
Tool: Impeccable CLI 4.9.2, engine v0.1.24 (free, no API key)
Providers installed: claude, antigravity, gemini (project scope)

## Applicability: full

Pixel Hotel is a vanilla HTML/CSS/JS web app (`index.html`, `css/`, `js/`). Skill commands, the design hook, source detection, and URL detection all apply. This does not cover the isometric pixel art or rooms — only the web UI (menus, HUD, panels).

Install lives on branch `impeccable`, created from the main checkout at `/workspace/pixel-hotel`, so the held v0.12.6 / v0.13.0 worktrees were not touched. Nothing was pushed.

## What was installed

Installed with:

```
npx impeccable install -y --providers=claude,antigravity,gemini --scope=project
```

Project files:
- `.claude/skills/impeccable/` plus `.claude/agents/` (Claude Code skill, agents)
- `.agent/skills/impeccable/` (Google Antigravity / agy)
- `.gemini/skills/impeccable/` and `.gemini/settings.json` (Gemini CLI skill + hook)
- `.claude/settings.json` (committed Claude hook)

The installer also wrote Claude hooks to `.claude/settings.local.json` (machine-local; not committed). Hook accepted. App UI code was not changed; findings were not fixed. Nothing was pushed.

`.claude/settings.local.json` was already present in this repo (permissions plus the new hook) and stays gitignored. The hook is also in the committed `.claude/settings.json`.

## Scan 1 — source (`index.html`, `css/`)

```
npx impeccable detect index.html css
```

HTML received a parsed-page check (including linked CSS). Exit code 2 (primary findings present).

Primary findings: **53**. Advisories: **1** (do not fail the scan).
Severity breakdown: warning 53, advisory 1.

By rule:

| Hits | Rule | Severity | Category |
| ---: | --- | --- | --- |
| 23 | `undersized-ui-text` | warning | quality |
| 12 | `tiny-text` | warning | quality |
| 5 | `gray-on-color` | warning | quality |
| 4 | `low-contrast` | warning | quality |
| 4 | `dark-glow` | warning | slop |
| 1 | `broken-image` | warning | quality |
| 1 | `wide-tracking` | warning | quality |
| 1 | `nested-cards` | warning | slop |
| 1 | `skipped-heading` | warning | quality |
| 1 | `side-tab` | warning | slop |
| 1 | `bounce-easing` | advisory | slop |

Representative examples:

- `gray-on-color` — text #555555 on bg #2c2150 (/workspace/pixel-hotel/index.html)
- `low-contrast` — 2.0:1 (need 4.5:1) — text #555555 on #2c2150 (/workspace/pixel-hotel/index.html)
- `dark-glow` — Zero-offset box-shadow glow (#00e5ff) (/workspace/pixel-hotel/index.html)
- `broken-image` — <img src=""> (/workspace/pixel-hotel/index.html)
- `tiny-text` — 11px body text (/workspace/pixel-hotel/index.html)
- `undersized-ui-text` — 8px functional text "Elevator" (below 11px floor) (/workspace/pixel-hotel/index.html)
- `wide-tracking` — letter-spacing: 0.06em on body text (/workspace/pixel-hotel/index.html)
- `nested-cards` — Card inside card (div) (/workspace/pixel-hotel/index.html)
- `skipped-heading` — <h2> "💇 Antoine's Azure Salon" followed by <h4> "Select Hairstyle" (missing h3) (/workspace/pixel-hotel/index.html)
- `side-tab` — border-left: 3px solid #ffd54f (/workspace/pixel-hotel/css/style.css:1873)
- `bounce-easing` — animation: mp-eq-bounce (/workspace/pixel-hotel/css/style.css:534)

Most hits are typography and contrast in HUD / panel CSS (`undersized-ui-text`, `tiny-text`, `gray-on-color`, `low-contrast`). A smaller set are "AI slop" tells (`dark-glow`, `side-tab`, `nested-cards`) plus one empty `<img src="">` and a skipped heading in the salon panel markup. Many source hits are on hidden or off-screen panels, so they outnumber what a single loaded page shows.

## Scan 2 — local URL (rendered default view)

Static server: `python3 -m http.server 8765` at `http://127.0.0.1:8765/`. Viewport: default 1280×800. Chrome was used. The server was stopped after the scan.

```
npx impeccable detect http://127.0.0.1:8765/
```

Primary findings: **5**. Advisories: **1** (do not fail the scan).
Severity breakdown: warning 5, advisory 1.

By rule:

| Hits | Rule | Severity | Category |
| ---: | --- | --- | --- |
| 2 | `undersized-ui-text` | warning | quality |
| 1 | `wide-tracking` | warning | quality |
| 1 | `low-contrast` | warning | quality |
| 1 | `nested-cards` | warning | slop |
| 1 | `bounce-easing` | advisory | slop |

Representative examples:

- `wide-tracking` — letter-spacing: 0.06em on body text (http://127.0.0.1:8765/)
- `undersized-ui-text` — 10.5px functional text "0:00" (below 11px floor) (http://127.0.0.1:8765/)
- `low-contrast` — placeholder "Say something... (try 'hello')" 3.8:1 (need 4.5:1) — text #757575 on #1b1430 (http://127.0.0.1:8765/)
- `nested-cards` — Card inside card (http://127.0.0.1:8765/)
- `bounce-easing` — animation: mp-eq-bounce (http://127.0.0.1:8765/)

The rendered scan only sees the default view, not every closed panel, which is why the count is much lower than the source scan.

## Summary

Full fit for menus and HUD. Top source issues: tiny / undersized UI text (35 hits combined), gray-on-color and low contrast (9), glow shadows (4). Rendered default view: 5 primary + 1 advisory. No app code was changed.
