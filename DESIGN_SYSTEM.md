# STC Operations Hub — Design System

This document defines the UI standards for the Acme Operations Operations Hub.
All contributors and AI coding assistants must follow these rules when building
or modifying any interface in this application.

---

## Core principles

- **Consistency over creativity.** Every table, badge, and button should feel
  like it came from the same place.
- **Sentence case everywhere.** No ALL CAPS, no Title Case in UI text — labels,
  column headers, badge text, button labels, nav items.
- **One pattern per problem.** One action affordance per row (kebab menu). One
  badge system. One toolbar layout. Do not introduce alternatives.
- **Data density is intentional.** High-volume tables use compact padding.
  Detail-oriented tables use default padding. Do not change padding arbitrarily.

---

## Color tokens

Use your Tailwind config or CSS variables for all colors. Never hardcode hex
values in component files. The semantic mapping is:

| Intent    | Usage                                      | Tailwind example          |
|-----------|--------------------------------------------|---------------------------|
| success   | Active, Complete, Paid, Won                | green-100 / green-700     |
| warning   | Pending, Trial, In Progress, Waiting       | amber-100 / amber-700     |
| danger    | Overdue, Churned, Lost, Failed, Gone Cold  | red-100 / red-700         |
| info      | New, Verified, Synced                      | blue-100 / blue-700       |
| neutral   | Draft, Inactive, No Label, Dormant         | gray-100 / gray-600       |

---

## Typography

| Element          | Size  | Weight | Color               | Case           |
|------------------|-------|--------|---------------------|----------------|
| Column header    | 11px  | 500    | text-secondary      | Sentence case  |
| Cell body text   | 13px  | 400    | text-primary        | As-is          |
| Badge text       | 11px  | 500    | (see badge system)  | Sentence case  |
| Muted/meta text  | 11px  | 400    | text-tertiary       | Sentence case  |
| Toolbar labels   | 12px  | 500    | text-secondary      | Sentence case  |
| Page title       | 24px  | 600    | text-primary        | Title case     |

Never use font-weight 600 or 700 inside tables. 500 is the maximum.

---

## Badge system

All status indicators across the app use a single `<Badge>` component.

```tsx
type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

// Usage
<Badge variant="success">Active</Badge>
<Badge variant="warning">Pending</Badge>
<Badge variant="danger">Churned</Badge>
<Badge variant="info">New</Badge>
<Badge variant="neutral">Draft</Badge>
```

### Rules
- Shape: always pill — `border-radius: 9999px`
- Padding: `3px 8px`
- Font: 11px, weight 500
- Text: sentence case — never ALL CAPS inside a badge
- Never use a square or rounded-rectangle badge shape

### Status → variant mapping

| Status text                          | Variant  |
|--------------------------------------|----------|
| Active, Complete, Paid, Won          | success  |
| Pending, Trial, In Progress, Waiting for Trial, Waiting for Response, Waiting to Pair, Trial Follow-Up | warning |
| Overdue, Churned, Lost, Failed, Gone Cold | danger |
| New, Verified, Synced, New Lead      | info     |
| Draft, Inactive, No Label, Dormant   | neutral  |

---

## Table anatomy

Every data table in the app follows this exact structure, top to bottom:

```
[Page title]
[Section tabs — e.g. Clients / Analytics / AR / Lesson Reports]
[Stat cards — if applicable]
─────────────────────────────────────────────
[Toolbar]
  [Search input] [Filter btn] [Columns btn]  →  [X results] [+ Primary action]
─────────────────────────────────────────────
[Filter tag row — visible only when filters are active]
─────────────────────────────────────────────
[Sub-filter tabs — e.g. All (N) / Active / Dormant]
─────────────────────────────────────────────
[Column header row]
[Data rows]
─────────────────────────────────────────────
[Pagination bar]
  Showing X–Y of Z                →  Rows per page [25▾]  [‹][1][2][3][›]
```

---

## Column headers

- Text: sentence case, 11px, weight 500, color text-secondary
- Sortable columns show a sort indicator: ↕ (unsorted), ↓ (desc), ↑ (asc)
- Sortable columns have a hover state that darkens text to text-primary
- Filterable columns show a ▾ icon after the label
- The active sort column uses text-primary color (not secondary)
- No column header should be in ALL CAPS or Title Case

---

## Toolbar

Every table has one toolbar row. Left-to-right order:

1. **Search input** — placeholder: "Search [entities]..." (e.g. "Search clients...")
2. **Filter button** — outline style, 12px, label "Filter" + filter icon
3. **Columns button** — outline style, 12px, label "Columns"
4. **[flex spacer]**
5. **Result count** — muted text, 12px, format: "X results"
6. **Primary action button** — filled/primary style, format: "+ [Action]"

### Primary action labels per page

| Page                      | Button label      |
|---------------------------|-------------------|
| Clients                   | + Add client      |
| Booking Hub               | + New booking     |
| Client Conversion Tracker | + Add prospect    |
| Jobs                      | + New job         |

---

## Row actions (kebab menu)

Every table uses a single kebab menu (···) as the only row-level action
affordance. No exceptions.

- Icon: ··· (three dots), 14px, letter-spacing -1px
- Button: 24×24px, border-radius 4px, border 0.5px solid border-secondary
- Hover: background-secondary
- Column: rightmost, no header label, right-aligned
- Dropdown contains at minimum: "View" and "Delete" (delete uses danger color)

**Never use:**
- Blue pill "VIEW" buttons
- Plain "View" text links
- Inline action buttons that take up column space

---

## Row density

| Table                     | Density  | td padding   |
|---------------------------|----------|--------------|
| Clients                   | default  | 10px 12px    |
| Client Conversion Tracker | default  | 10px 12px    |
| Booking Hub               | compact  | 6px 12px     |
| Jobs                      | compact  | 6px 12px     |

Compact is appropriate for tables regularly showing 500+ rows.
Default is appropriate for tables where row content is richer (avatars,
2-line cells, multiple tags).

---

## Pagination

Every table has a pagination bar at the bottom of the card.

- Left: "Showing X–Y of Z" in 12px muted text
- Right: "Rows per page" select (options: 25, 50, 100) + page buttons
- Current page: filled/primary button style
- Prev/next: disabled and visually muted when at first/last page
- Page jump: show ellipsis (...) for large page counts

---

## Inline editable cells (Client Conversion Tracker only)

The CCT table has cells that are editable inline (MKT, LEAD, STATUS columns).
These are intentionally different from read-only cells and should remain so.

Rules for editable cells:
- Show a border and a ▾ chevron to signal interactivity
- Border: 0.5px solid border-secondary, border-radius 4px
- Chevron: 9px, color text-tertiary, positioned right
- On hover: border-color darkens to border-primary
- Badge colors inside these dropdowns must follow the badge system above

Do not convert these to read-only badges. Do not remove the inline edit
affordance from the CCT table.

---

## Empty states

Every table must handle the empty state — when no results are found (due
to search, filters, or genuinely no data).

```
[Icon — 24px, neutral]
[Title — "No [entities] found", 14px, weight 500]
[Description — "Try adjusting your filters or search term.", 12px, muted]
[CTA button — "Clear filters" if filters are active, otherwise the primary
 action button]
```

---

## Loading / skeleton states

While table data is fetching, show skeleton rows instead of a spinner.

- Show 5–8 skeleton rows
- Each row mirrors the real row structure: avatar circle skel + 2-line
  text skel + badge skel + action skel
- Animation: opacity pulse (1.5s ease-in-out, 40%–100%)
- Never show an empty table while loading — always show skeletons

---

## Things that must never change without a design review

- Sidebar navigation structure or styling
- Page title treatment (the `|` left-border accent + large heading)
- Top navigation bar
- Stat cards above the Clients table
- Section tab navigation (Clients / Analytics / AR / Lesson Reports)
- Any data fetching, API, or state management logic

---

## Pages covered by this system

| Page                      | Route                          |
|---------------------------|--------------------------------|
| Clients                   | /client-management             |
| Booking Hub               | /booking-hub/submissions       |
| Client Conversion Tracker | /client-conversion-tracker     |
| Jobs                      | /jobs-dashboard                |
| Students                  | (apply same standards)         |
| Tutors                    | (apply same standards)         |
| Schools                   | (apply same standards)         |
| Clubs                     | (apply same standards)         |

---

*Last updated: March 2026. Maintained by Doug / STC product team.*
*When using Claude Code or any AI assistant, reference this file at the
start of every session: "Follow the standards in DESIGN_SYSTEM.md"*
