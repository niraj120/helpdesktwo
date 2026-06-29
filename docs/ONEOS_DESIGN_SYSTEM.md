# OneOS Design System — Application-wide UI/UX Spec

> **Status:** Canonical UI/UX spec for the **entire** helpdesk application.
> Every page/module must follow this **strictly**. Roll out **page by page**.
> Source of truth: `05-design-system.html` (OneOS / VBSA-ONE v1.0).

> **Scope:** App-wide. This replaces the prior visual language (View-Queries
> blue + Noto Sans) with the OneOS language (indigo + DM Serif/Instrument Sans).
> During migration the app will be mixed — that's expected; migrate one page at
> a time and check each against §7 before moving on.

---

## 0. Implementation contract

- **Fonts** loaded once via `frontend/index.html` (see §2). ✅ done.
- **Shared tokens** — the SR module's `frontend/src/utils/srTheme.ts` is the
  reference token set (kept in sync with §1–§6). For non-SR pages, either reuse
  these tokens or read the equivalent CSS variables; do **not** reintroduce the
  old palette.
- **SR module = reference implementation.** It already consumes
  `srStyles`/`srButton`/`SR` + `SrPage`/`SrTabs`, so it adopts OneOS by updating
  `srTheme.ts`. Use the SR pages as the worked example for other modules.
- **Migration order (page by page):**
  1. Service Requests hub (All / New / Email / IVR / Leads)
  2. SR Settings hub (General / Routing / Forms / Role Mapping / Clusters)
  3. Queries (View / My / Assign) + ticket detail
  4. Dashboards & Reports
  5. Admin (Users, RBAC, Projects, Master Data)
  6. Knowledge Base, SLA, remaining modules
- Per page: replace hardcoded colors/radii/fonts with the tokens, then audit
  against the §7 component specs.

---

## 1. Color tokens

### Primary (indigo)
| Token | Hex | Use |
|---|---|---|
| `--primary` / primary-700 | `#4338ca` | gradients, darkest |
| `--primary-600` | `#4f46e5` | **primary actions**, active text |
| `--primary-500` | `#6366f1` | focus ring, accents |
| `--primary-300` | `#a5b4fc` | on-dark accents |
| `--primary-100` | `#e0e7ff` | hover fills |
| `--primary-50`  | `#eef2ff` | active nav bg, subtle fills |

### Status (semantic)
| Token | Text | BG |
|---|---|---|
| success | `#22a55f` | `#dcfce7` |
| warning | `#d97706` | `#fef3c7` |
| error   | `#ef4444` | `#fee2e2` |
| info    | `#2563eb` | `#dbeafe` |

### Neutrals (ink)
`900 #0f172a` · `800 #1e293b` · `700 #334155` · `600 #475569` ·
`400 #94a3b8` · `300 #cbd5e1` · `200 #e2e8f0` · `100 #f1f5f9` ·
`50 #f8fafc` · white `#ffffff`

- **Page canvas:** `--ink-50` (`#f8fafc`)
- **Body text:** `--ink-800`; **muted:** `--ink-600`/`--ink-400`
- **Borders:** `--ink-200` (`#e2e8f0`); hairlines `--ink-100`

### Module accents (for chips/icons)
violet `#7c3aed` · blue `#2563eb` · teal `#059669` · amber `#f59e0b` ·
pink `#ec4899` · cyan `#06b6d4` · red `#ef4444` · slate `#64748b`

---

## 2. Typography

Load:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
```

| Family | Stack | Use |
|---|---|---|
| Display | `'DM Serif Display', Georgia, serif` | page titles, hero, metric values |
| Body | `'Instrument Sans', 'Helvetica Neue', Arial, sans-serif` | all UI text |
| Mono | `'DM Mono', 'Fira Code', monospace` | codes, IDs, ticket #, timestamps |

### Type scale
| Role | Size | Weight | Family |
|---|---|---|---|
| H1 / Hero | 3.2rem | 700 | display |
| H2 / Section | 1.75rem | 700 | display |
| H3 / Card | 1.25rem | 700 | body |
| Body L | 1rem | 400 | body |
| Body S | 0.875rem | 400 | body |
| Caption/Meta | 0.72rem | 600, UPPERCASE, `.08em` | body |
| Code/ID | 0.7rem | 500 | mono |

Headings: letter-spacing `-.02em` to `-.03em`.

---

## 3. Spacing — 8px grid

`4 · 8 · 12 · 16(base) · 20 · 24(card pad) · 32(section gap) · 40 · 48(page pad) · 64(section bottom)`

- Card padding: **24px**
- Page padding: **40–48px**
- Section bottom margin: **64px**

## 4. Radius
`sm 4 · md 8 · lg 12 · xl 16 · 2xl 20 · full 9999`
- Buttons: `md (8)`; large buttons `lg (12)`
- Inputs: `md (8)`
- Cards: `xl (16)`; modals/filters `2xl (20)`
- Badges/pills/progress: `full`

## 5. Shadows
```
sm    0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)
md    0 4px 12px rgba(15,23,42,.08), 0 2px 6px rgba(15,23,42,.06)
lg    0 10px 28px rgba(15,23,42,.10), 0 4px 12px rgba(15,23,42,.06)
xl    0 20px 48px rgba(15,23,42,.14), 0 8px 20px rgba(15,23,42,.08)
modal 0 24px 64px rgba(15,23,42,.22), 0 8px 24px rgba(15,23,42,.12)
```
Cards use `sm`; metric cards `0 10px 24px rgba(15,23,42,.05)`; hover → `lg`.

## 6. Motion
- Easing: `cubic-bezier(0.22, 1, 0.36, 1)`
- Durations: fast `120ms` · base `200ms` · slow `320ms`
- Hover lift on cards/primary buttons: `translateY(-1px/-2px)`
- Respect `prefers-reduced-motion: reduce` (fall back to instant).

---

## 7. Components

### Buttons
- Shape: inline-flex, gap 7px, weight 600, radius `md`, family body.
- Sizes: xs `4/10` · sm `6/14` · md `8/18` · lg `11/24 r-lg` · xl `14/32 r-xl`.
- **Primary:** gradient `linear-gradient(160deg,#4f46e5,#4338ca)`, white text, shadow `0 4px 14px rgba(67,56,202,.35)`; hover lift + stronger shadow.
- **Secondary:** white bg, `#334155` text, `1.5px #e2e8f0` border, shadow sm; hover `#f8fafc` + `#cbd5e1` border.
- **Ghost:** transparent, `#475569`; hover `#f1f5f9`.
- **Outline-primary:** `#eef2ff` bg, `#4f46e5` text, `1.5px rgba(99,102,241,.4)`.
- **Danger:** gradient `#f87171→#ef4444`. **Success:** gradient `#4ade80→#22a55f`.
- Icon-only: 34×34 (`r-md`) or 42×42 (`r-lg`).
- Loading: spinner + `opacity .75`, `cursor:wait`. Disabled: `opacity .45`.
- Focus: `outline 2px var(--primary-600); outline-offset 2px`.

### Badges / status
- Pill (`r-full`), 0.65rem, weight 700, gradient bg + 1px tinted border + inset highlight; optional 6px leading dot.
- Variants: approved/success (green), review/warning (amber), audit (violet), draft (slate), info (blue), error (red).
- Sizes: sm `2/8` · md `3/10` · lg `5/13`.

### Inputs & forms
- Input: full width, `1.5px #e2e8f0`, radius `md`, pad `9/13`, 0.82rem, white.
- Focus: border `#6366f1` + ring `0 0 0 3px rgba(99,102,241,.14)`.
- Error: border `#ef4444` + ring red `.14`. Success: border `#22a55f`.
- Label: 0.74rem, weight 600, `#334155`; required `*` in error red.
- Hint: 0.66rem `#94a3b8`. Error/success msg: 0.68rem with icon.
- Left-icon, prefix-addon (mono prefix on `#f8fafc`), and custom select arrow patterns supported.
- Checkbox 16px `r-sm`; checked = `#4f46e5` fill. Radio 16px circle; checked dot `#4f46e5`.

### Cards & metrics
- Card: white, `1px #e2e8f0`, radius `xl`, shadow sm.
- Metric card: top 3px accent bar (`--card-accent`), 40px icon tile (tinted), value in **display** font 1.75rem, label 0.68rem uppercase, trend up=success/down=error; hover lift to shadow lg.
- Glass card (on dark): `rgba(255,255,255,.7)` + `backdrop-filter: blur(12px) saturate(180%)`.

### Data table
- Wrapper: `1px rgba(148,163,184,.24)`, radius `xl`, shadow `0 10px 24px rgba(15,23,42,.05)`, overflow hidden.
- `thead` bg `#f8fafc`; th 0.6rem, 700, UPPERCASE `.07em`, `#94a3b8`, bottom border `#e2e8f0`.
- td 0.78rem `#334155`, hairline bottom `rgba(148,163,184,.14)`; row hover bg `#f8fafc`.
- Name cell: weight 600 `#0f172a`; code cell: mono 0.7rem `#475569`.
- Row actions: small outline buttons (`table-btn`). Skeleton rows use shimmer.
- Pagination bar: top border `#f1f5f9`; page buttons 30×30 `r-md`; active = `#eef2ff` bg + indigo text.

### Toasts (top-right, auto-dismiss 4s)
- White card, left 3px accent bar, radius `lg`, shadow md, icon tile, title 0.78rem/700, msg 0.72rem `#475569`, close ✕.
- Variants tinted by status (success/warning/error/info). `role="alert"`.

### Modals & drawers
- Overlay centers a white modal: radius `2xl`, shadow `modal`, max-width ~440px.
- Header (title 0.96rem/700 + eyebrow caption + close 28px), body, footer (right-aligned actions). `role="dialog" aria-modal="true"`, trap focus, Esc closes.

### Filter panel (two-stage: draft → applied)
- Container radius `2xl`, shadow modal. Body = 190px category rail + options grid.
- Category buttons: active = `#eef2ff` + indigo border; show selected summary line.
- Option buttons: `r-md`, selected = `#eef2ff` + indigo + check icon.
- Footer: Clear (ghost) · Cancel (secondary) · Apply Filters (primary).

### Tabs (SR hubs)
- Pill tab bar in a white rounded container; active pill = `--primary-600` bg + white text; inactive = `#334155`, hover `#f1f5f9`.
- Use for the Service Requests hub and SR Settings hub.

### Navigation / header
- Header 52px: logo tile + wordmark + breadcrumb (`#94a3b8`, active `#0f172a`/600) + right actions + avatar (gradient indigo).
- Sidebar item: 26px icon tile, 0.74rem/600 label; active = `#eef2ff` bg + indigo label + right border.

### Progress
- Track `#f1f5f9` radius full; bar gradient by state (success green, in-progress indigo, etc.); sizes sm 5 / base 8 / lg 12.

---

## 8. Accessibility (WCAG 2.1 AA)
- Keyboard reachable; modals trap focus; Esc closes; arrows for menus.
- Visible focus: 2px indigo ring, 2px offset on `:focus-visible`.
- Icon-only buttons need `aria-label`/`title`; tables get `role`/`aria-label`.
- Contrast ≥ 4.5:1 for text; never rely on color alone (icon + text).
- Toasts `role="alert"`; dialogs `role="dialog" aria-modal`; loading `aria-live`.
- Honor `prefers-reduced-motion`.

---

## 9. srTheme.ts mapping (what to change)
| srTheme key | New value |
|---|---|
| `pageBg` | `#f8fafc` |
| `font` | `'Instrument Sans', 'Helvetica Neue', Arial, sans-serif` |
| display font (titles) | `'DM Serif Display', Georgia, serif` |
| `primary` | `#4f46e5` (gradient for buttons) |
| `primaryHover` | `#4338ca` |
| `success` | `#22a55f` · `successBg` `#dcfce7` |
| `danger` | `#ef4444` · `dangerBg` `#fee2e2` |
| `warn` | `#d97706` · `warnBg` `#fef3c7` |
| `text` | `#0f172a` · `sub` `#475569` |
| `border` | `#e2e8f0` · `inputBorder` `#e2e8f0` |
| `cardShadow` | `0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04)` |
| card radius | `16` · inputs/buttons `8` · pills `9999` |
| focus ring | `0 0 0 3px rgba(99,102,241,.14)` |

After updating tokens, audit each SR page against §7 component specs and fix
hardcoded colors/radii that bypass `srStyles`.
