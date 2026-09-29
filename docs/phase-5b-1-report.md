# Phase 5B.1 — Real UI Tool Transcript Polish Report

**Build Version**: `5.1.0` (with Phase 5B.1 Real UI Polish Patch)  
**Status**: `PASSED (11/11 Suites Green, 69/69 Assertions Passing)`  
**Scope**: Real UI Tool Summary extraction polish, title deduplication, accurate failure detection, and clean collapsed transcript presentation.

---

## 1. Root Causes Discovered from Real Desktop UI

Based on the actual screenshot inspection and DOM analysis against Hermes Desktop's assistant-ui tool components (`fallback.tsx`, `scaffold-row.tsx`, `fade-text.tsx`):

### Issue 1: Concatenated and Duplicated Tool Titles
- **Symptom**: `Skill Manage1 resultSkill Manage`, `已加载技能已加载技能`, `已搜索文件已搜索文件`.
- **Root Cause**:
  1. Hermes Desktop renders the title inside `FadeText` using class `text-(--conversation-scaffold-text)` without `data-slot="tool-title"`.
  2. The previous selector `toolBlock.querySelector('[data-slot="tool-title"], .tool-title, header, ...')` failed to match Hermes's scaffold row, causing it to fall through to `toolBlock.textContent`.
  3. `toolBlock.textContent` in the browser recursively concatenates all text nodes across sibling inline spans (`FadeText` + `span.tabular-nums` `1 result` + inner tool card content) without whitespace or newlines, resulting in `Skill Manage1 resultSkill Manage`.
  4. Accessibility or animated text components repeated localized strings (`已加载技能已加载技能`).

### Issue 2: Completed Tools Incorrectly Turning Red
- **Symptom**: Completed file edit tools or bash command tools erroneously showed red failure borders and glow.
- **Root Cause**:
  - `detectToolState` previously executed: `toolBlock.querySelector('.text-destructive, .bg-destructive, .codicon-error')`.
  - When inspecting file edits (`write_file`, diff view) or console stdout/stderr, deleted lines rendered with `text-rose-600` or `.text-destructive` inside the card body!
  - Querying `.text-destructive` across the entire `toolBlock` caught code diff deletions and syntax tokens, mistakenly marking completed tools as `failed`.

---

## 2. Technical Solution Implemented

### 1. Title Extraction Priority Hierarchy (`getToolTitle`)
Established a strict 5-stage priority ladder:
1. **Explicit Data Attributes**: `[data-tool-name]`, `[data-tool-title]`, `[data-call-name]`.
2. **Cleaned `aria-label`**: Strips prefixes like `Run tool: `, `Tool: `, `Executing `.
3. **Explicit Title / Name Slots**:
   - `[data-slot="tool-title"]`, `[data-slot="tool-name"]`, `.tool-title`
   - Hermes Scaffold DOM: `span[class*="conversation-scaffold-text"]`, `span.FadeText`, `[data-conversation-scaffold] span:not([class*="tabular-nums"]):not([class*="shrink-0"])`
   - `span.font-medium`, `span.font-semibold`, `strong`, `code`
4. **Header Elements**: Inspects `header`, `.group/disclosure-row`, `.status-row-content` only.
5. **Limited Sanitized Fallback**: First line of header or tool block, strictly sanitized (never raw `tool.textContent`).

### 2. Title Sanitization & Deduplication (`cleanToolTitle`)
1. **Embedded Count / Result Cleansing**:
   Regex `/\d+\s*(?:results|result|entries|entry|files|file|items|item|lines|line|ms|s)(?=[A-Z\s\d_-]|$|[^a-zA-Z0-9])/i` identifies embedded metadata labels, cleanly splitting `Skill Manage1 resultSkill Manage` into `Skill Manage`.
2. **Halving Deduplication**:
   Even-length exact duplications (e.g. `已加载技能已加载技能` -> `已加载技能`, `已搜索文件已搜索文件` -> `已搜索文件`, `Skill ManageSkill Manage` -> `Skill Manage`) are halved.
3. **Word & Delimiter Deduplication**:
   Handles space-separated (`Skill Manage Skill Manage`) and delimiter-separated (`write_file / write_file`) repetitions.

### 3. Tool Summary Data Model
Separates `status`, `title`, and `count`:
- **Single Tool**: Displays checkmark icon and clean title: `▸ ✓ Skill Manage`.
- **Multiple Tools**: Checkmark icon is hidden (`display: none`), displaying count only: `▸ 3 tools completed`.
- `data-tool-count` attribute is recorded on `.bubbles-tool-group` (`1`, `3`, etc.).

### 4. Non-Destructive Accurate Failure Classification (`detectToolState`)
- **Running**:
  - Highest priority (`running > failed > completed > unknown`).
  - Active spinner (`.animate-spin`, `[data-spinner]`) or Braille characters in the status row.
- **Failed**:
  - Explicit error status (`data-tool-status="error"`, `data-tool-state="failed"`, `data-tool-error="true"`).
  - Error icon on status glyph (`svg.text-destructive`, `.codicon-error`, `[aria-label*="error" i]`).
  - `.text-destructive` inside content body (`[data-slot="tool-fallback-content"]`, `pre`, `code`, diff lines) is strictly excluded and ignored.
- **Completed**:
  - Settled tools with checkmark or statusDone remain quiet slate, never turning red.

### 5. Strict Complete Collapse & Visual Polish
- **Collapsed**:
  - `display: none !important;`
  - `visibility: hidden !important;`
  - `height: 0 !important; max-height: 0 !important;`
  - `padding: 0 !important; margin: 0 !important; border: 0 !important;`
  - `pointer-events: none !important;`
  - Ensures inner tool cards never peek through or cause partial visual bleed.
- **Expanded**:
  - `margin-left: 12px !important;`
  - `border-left: 2px solid rgba(96, 165, 250, 0.45) !important;`
- **Toggle Button**:
  - Muted slate color `#94a3b8` on quiet frosted dark background `rgba(10, 32, 64, 0.55)`.

---

## 3. Automated Test Verification (`test/phase5b-1-audit.test.js`)

All 5 core dimensions verified and passing:
1. `[Test 1] Tool Title Extraction Priority & Deduplication` — **PASSED**
2. `[Test 2] Tool Summary Data Model: Single (▸ ✓ Title) vs Multiple (▸ N tools completed)` — **PASSED**
3. `[Test 3] Accurate Tool Completed vs Failed vs Running Classification` — **PASSED**
4. `[Test 4] Visual Styling: Completed Muted, Failed Error, Running Glow` — **PASSED**
5. `[Test 5] Strict Complete Collapse & Expansion Layout` — **PASSED**

Full 11-suite regression pass:
- `final-ux-audit.test.js`: **PASSED (9/9 Dimensions)**
- `phase1-audit.test.js`: **PASSED (7/7 Assertions)**
- `phase2-audit.test.js`: **PASSED (5/5 Assertions)**
- `phase3-1-audit.test.js`: **PASSED (6/6 Assertions)**
- `phase3-audit.test.js`: **PASSED (5/5 Assertions)**
- `phase4-1-audit.test.js`: **PASSED (6/6 Assertions)**
- `phase4-audit.test.js`: **PASSED (7/7 Assertions)**
- `phase5a-1-audit.test.js`: **PASSED (6/6 Assertions)**
- `phase5a-audit.test.js`: **PASSED (6/6 Assertions)**
- `phase5b-1-audit.test.js`: **PASSED (5/5 Assertions)**
- `phase5b-audit.test.js`: **PASSED (7/7 Assertions)**
- **Total Assertions**: `69 / 69 PASSED (100% Green)`

---

## 4. Deployed Artifacts
- Source of truth: `src/plugin.js`
- Compiled plugins: `plugin.js`, `desktop/plugin.js`
- Runtime plugin: `~/.hermes/desktop-plugins/hermes-bubbles-skin/plugin.js`
- Synchronized with `node scripts/sync.js`.
