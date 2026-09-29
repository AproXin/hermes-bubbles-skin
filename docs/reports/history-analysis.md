# Hermes Desktop Native History / Session Component Architecture & Bubbles Skin Analysis

## Executive Summary

As part of **Phase 5A (History / Session Visual Layer)** of `hermes-bubbles-skin`, this document details the native Hermes Desktop DOM architecture for session navigation and history lists, and defines the non-invasive styling and enhancement strategy to harmonize the sidebar with the Bubbles frosted sapphire aesthetic.

In strict adherence to the project's core design tenets:
- **Hermes Core** remains the sole owner of session state, navigation routing, session creation/archiving/deletion, virtual scrolling, and reordering.
- **Bubbles Plugin** provides zero-overhead DOM identification and metadata stamping (`data-bubbles-session-row`, `data-bubbles-session-active`).
- **Bubbles CSS** applies the frosted glass, sapphire glow, refined typography, and responsive visual polish.

---

## 1. Native Component Hierarchy & DOM Structure

An exhaustive audit of `/Users/yuanxxx/.hermes/hermes-agent/apps/desktop/src` reveals the following key components and rendered DOM elements:

### 1.1. Sidebar Roots & Content Containers
- **Provider Wrapper**: `<div data-slot="sidebar-wrapper" class="group/sidebar-wrapper ...">`
  - Defines CSS variables: `--sidebar-width` (default 16rem / 14.8125rem) and `--sidebar-width-icon`.
- **Sidebar Root**: `<div data-slot="sidebar" data-sidebar="sidebar" class="group peer text-sidebar-foreground ...">`
  - Inner container: `<div data-slot="sidebar-inner" data-sidebar="sidebar">`
- **Sidebar Content Area**: `<div data-slot="sidebar-content" data-sidebar="content" class="scrollbar-fade flex min-h-0 flex-1 flex-col ...">`
- **Section Group**: `<div data-slot="sidebar-group" data-sidebar="group" class="relative flex w-full min-w-0 flex-col p-2">`
- **Section Header**: `SidebarSectionHeader` with `SidebarPanelLabel` and collapsible `DisclosureCaret`.

### 1.2. Virtualized & Non-Virtualized Session Lists
Defined in `apps/desktop/src/app/chat/sidebar/virtual-session-list.tsx` and `sessions-section.tsx`:
- When session count $\ge 25$, `VirtualSessionList` uses TanStack Virtualizer (`useVirtualizer`):
  ```html
  <div class="scrollbar-fade relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
    <div class="relative" style="height: [totalSize]px;">
      <div data-index="0" style="position: absolute; transform: translateY(...)px; width: 100%;">
        <!-- Session Row or Date Divider -->
      </div>
    </div>
  </div>
  ```
- When session count $< 25$ or in Pinned mode, rows are rendered statically in normal flow without virtual absolute positioning.

### 1.3. Date Dividers / Group Headers (`SidebarDateDivider`)
Defined in `apps/desktop/src/app/chat/sidebar/chrome.tsx`:
- Container:
  ```html
  <div class="group/workspace flex select-none items-center gap-2 px-2 pb-0.5 pt-2">
    <!-- Optional toggle button if collapsible -->
    <span class="shrink-0 text-[0.64rem] font-semibold uppercase tracking-[0.12em] text-(--ui-text-quaternary)">
      TODAY / YESTERDAY / PREVIOUS 7 DAYS
    </span>
    <span aria-hidden="true" class="h-px min-w-4 flex-1 bg-(--ui-stroke-tertiary)"></span>
  </div>
  ```

### 1.4. Session Row Shell (`SidebarSessionRow` / `SidebarRowShell`)
Defined in `apps/desktop/src/app/chat/sidebar/session-row.tsx` and `chrome.tsx`:
- Outer Shell:
  ```html
  <div class="group row-hover relative grid grid-cols-[minmax(0,1fr)_auto] items-stretch rounded-md [bg-(--ui-row-active-background)]"
       data-working="true"
       data-glass-opaque>
    <!-- Working animation arc (showsRunningArc) -->
    <span aria-hidden="true" class="arc-border arc-row"></span>

    <!-- Main Tap / Click Target (SidebarRowBody) -->
    <button class="row-button bg-transparent text-left z-0 flex items-center ...">
      <!-- Status Lead: Dot / Drag handle -->
      <span class="overflow-hidden">
        <span class="session-status-dot ..."></span>
      </span>

      <!-- Title & Details Wrapper -->
      <span class="min-w-0 flex-1 self-center">
        <span class="hover-marquee block font-normal group-hover:text-foreground">
          <span class="hover-marquee-inner">Session Title Here</span>
        </span>
        <!-- Optional preview / message count (comfortable/detailed density) -->
        <span class="mt-0.5 block truncate text-[0.625rem] text-(--ui-text-tertiary)">
          3 messages · 1.2k tokens
        </span>
      </span>
    </button>

    <!-- Trailing Actions Slot (data-row-actions) -->
    <div class="relative z-2 flex shrink-0 items-center justify-end gap-1" data-row-actions>
      <span class="session-row-tail min-w-5 transition-opacity group-hover:opacity-0">
        <time dateTime="...">12m</time>
      </span>
      <!-- Kebab Action Menu Button (hover-revealed) -->
      <button aria-label="Session actions" class="size-5 rounded-[4px] bg-transparent text-transparent hover:text-foreground group-hover:text-(--ui-text-tertiary) ...">
        <span class="codicon codicon-kebab-vertical"></span>
      </button>
    </div>
  </div>
  ```

### 1.5. Selected / Active Session Identification
Hermes Desktop manages active session state via `activeSessionId` passed from the router/store.
In `SidebarSessionRowImpl`:
- `isSelected && 'bg-(--ui-row-active-background)'`
- `openUnfocused && 'bg-(--ui-row-open-background)'`
- `liveTurn && 'text-foreground' data-working="true"`
In Tailwind v4, `bg-(--ui-row-active-background)` renders as an inline CSS rule or class matching that utility.

---

## 2. Bubbles Visual Enhancement Strategy

### 2.1. Frosted Glass Container & Sidebar Backdrop
- Scoped strictly under `html[data-bubbles-skin='true'] [data-slot='sidebar']`.
- Subtle dark navy frosted glass background (`rgba(8, 24, 48, 0.75)` with `backdrop-filter: blur(20px)`).
- Clean right-border separator with soft sapphire glow (`1px solid rgba(147, 197, 253, 0.15)`).

### 2.2. Session Group Divider (`SidebarDateDivider`)
- Text styled with `#93c5fd` (light sky blue), letter-spacing `0.14em`, uppercase, `font-size: 10.5px`, `font-weight: 600`.
- Hairline divider updated from neutral grey to a translucent sapphire stroke (`linear-gradient(90deg, rgba(96, 165, 250, 0.35), transparent)`).

### 2.3. Session Row Card & States
- **Default State**:
  - `border-radius: 8px !important;`
  - `margin: 1.5px 4px !important;`
  - `transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1) !important;`
  - `border: 1px solid transparent !important;`
- **Hover State**:
  - Background: `rgba(30, 64, 175, 0.22) !important;`
  - Border: `1px solid rgba(147, 197, 253, 0.28) !important;`
  - Text: Brightened to `#ffffff !important;`
  - Action kebab button smoothly transitions into view.
- **Active / Selected Session (`[data-bubbles-session-active='true']`)**:
  - Prominent Sapphire frosted glass fill: `linear-gradient(90deg, rgba(37, 99, 235, 0.35) 0%, rgba(30, 58, 138, 0.20) 100%) !important;`
  - Sapphire left indicator accent: `border-left: 3px solid #60a5fa !important;`
  - Glowing shadow: `box-shadow: 0 2px 10px rgba(37, 99, 235, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.15) !important;`
  - Title typography: `#ffffff !important; font-weight: 500 !important;`
- **Working / Live Session (`[data-working='true']`)**:
  - Subtle running pulse: `animation: bubblesPulseGlow 3s ease-in-out infinite !important;`

### 2.4. Truncation & Timestamp Placement
- Title container guaranteed `min-width: 0`, `overflow: hidden`, `text-overflow: ellipsis`, `white-space: nowrap`.
- Actions slot (`[data-row-actions]`) positioned with `shrink: 0`, keeping timestamps and kebab menus properly aligned without compressing titles abruptly.

---

## 3. Non-Invasive Architectural Guardrails

| Permitted in Bubbles Skin | Strictly Prohibited in Bubbles Skin |
| :--- | :--- |
| Stamping `data-bubbles-session-row="true"` | Storing session IDs or building custom session cache |
| Stamping `data-bubbles-session-active="true"` | Intercepting `onClick` or `onPointerDown` navigation |
| Stamping `data-bubbles-session-divider="true"` | Building custom session list/history rendering engine |
| Pure CSS visual enhancements and transitions | Custom session switching / URL manipulation |
| Non-destructive cleanup on plugin dispose | Altering backend RPC or IPC calls |

This architecture ensures seamless compatibility with Hermes Desktop auto-compression, multi-profile switches, virtual scrolling, and drag-and-drop reordering.
