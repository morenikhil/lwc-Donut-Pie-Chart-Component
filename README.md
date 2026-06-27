# donutChart — Salesforce LWC Reusable Component

A fully reusable **SVG-based Donut / Pie Chart** Lightning Web Component for Salesforce. It renders interactive, accessible charts from Apex data with hover tooltips, animated slices, a configurable legend, and a fully customisable colour palette — all with zero external libraries.

---

## Table of Contents

1. [Features](#features)
2. [File Structure](#file-structure)
3. [Architecture](#architecture)
4. [Quick Start](#quick-start)
5. [API Reference](#api-reference)
6. [Usage Examples](#usage-examples)
7. [Apex Controller](#apex-controller)
8. [App Builder Configuration](#app-builder-configuration)
9. [Accessibility](#accessibility)
10. [Browser & API Compatibility](#browser--api-compatibility)
11. [Customisation Guide](#customisation-guide)
12. [Known Limitations](#known-limitations)

---

## Features

| # | Feature | Detail |
|---|---------|--------|
| 1 | **SVG rendering** | Pure SVG — no Canvas, no charting library dependency |
| 2 | **Donut & Pie modes** | Toggle via `chartType` property |
| 3 | **Hover tooltips** | Label, formatted value, and percentage on slice hover |
| 4 | **Slice animation** | Active slice translates outward; dimmed slices fade |
| 5 | **Legend** | Side-by-side or stacked layout with optional total row |
| 6 | **Configurable colours** | Pass any `string[]` palette via `colorPalette` |
| 7 | **Apex wire integration** | Auto-fetches data when `recordId` is provided |
| 8 | **Static data mode** | Pass `chartData` directly from a parent component |
| 9 | **Empty / Error / Loading states** | Full lifecycle covered |
| 10 | **Keyboard accessible** | Tab + focus support on slices and legend items |
| 11 | **ARIA labels** | Meaningful labels on all interactive elements |
| 12 | **Responsive** | Stacks vertically on mobile (≤ 480 px) |
| 13 | **App Builder ready** | Exposed to all page types with design-time properties |
| 14 | **Value formatting** | Auto-abbreviates to K / M with optional prefix/suffix |

---

## File Structure

```
donutChart/
├── force-app/
│   └── main/
│       └── default/
│           ├── classes/
│           │   ├── DonutChartController.cls          ← Apex controller
│           │   └── DonutChartController.cls-meta.xml
│           └── lwc/
│               └── donutChart/
│                   ├── donutChart.html               ← Template
│                   ├── donutChart.js                 ← Controller logic
│                   ├── donutChart.css                ← Scoped styles
│                   └── donutChart.js-meta.xml        ← Metadata / App Builder config
└── README.md
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         donutChart LWC                                  │
│                                                                         │
│  ┌──────────────┐   @api chartData    ┌──────────────────────────────┐  │
│  │  Parent LWC  │──────────────────►  │         donutChart.js        │  │
│  │  or Flow     │                     │                              │  │
│  └──────────────┘                     │  resolvedData getter         │  │
│                                       │  ├─ from @api chartData      │  │
│  ┌──────────────┐   @wire recordId    │  └─ from wired Apex data     │  │
│  │  Record Page │──────────────────►  │                              │  │
│  │  (recordId)  │                     │  computedSlices getter       │  │
│  └──────────────┘                     │  ├─ buildArcPath()           │  │
│                                       │  ├─ polarToCartesian()       │  │
│  ┌──────────────┐   @AuraEnabled      │  └─ formatNumber()           │  │
│  │  Apex Class  │◄────────────────    │                              │  │
│  │  DonutChart  │   getChartData()    │  computedLegendItems getter  │  │
│  │  Controller  │                     │                              │  │
│  └──────────────┘                     │  Event handlers              │  │
│                                       │  ├─ handleSliceMouseEnter    │  │
│                                       │  ├─ handleSliceMouseLeave    │  │
│                                       │  ├─ handleLegendMouseEnter   │  │
│                                       │  └─ handleChartMouseLeave    │  │
│                                       └──────────────┬───────────────┘  │
│                                                      │ render           │
│                                       ┌──────────────▼───────────────┐  │
│                                       │      donutChart.html          │  │
│                                       │                              │  │
│                                       │  <svg>                       │  │
│                                       │    <path> × N (slices)       │  │
│                                       │    <circle> (donut hole)     │  │
│                                       │    <text> (center label)     │  │
│                                       │  </svg>                      │  │
│                                       │  <div.chart-tooltip>         │  │
│                                       │  <div.legend-container>      │  │
│                                       └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Start

### 1. Deploy to your org

```bash
# Authenticate
sf org login web --alias myOrg

# Deploy component + Apex
sf project deploy start --source-dir force-app --target-org myOrg
```

### 2. Use with static data (parent LWC)

```html
<!-- parentComponent.html -->
<template>
    <c-donut-chart
        title="Revenue by Stage"
        chart-type="donut"
        show-legend
        legend-position="side-by-side"
        show-center-text
        center-label="Total"
        value-prefix="$"
        chart-data={opportunityData}>
    </c-donut-chart>
</template>
```

```js
// parentComponent.js
import { LightningElement, wire } from 'lwc';
import getOpportunityStageData from '@salesforce/apex/DonutChartController.getOpportunityStageData';

export default class ParentComponent extends LightningElement {
    @wire(getOpportunityStageData)
    opportunityData;
}
```

### 3. Use with auto-wired Apex (recordId)

```html
<c-donut-chart
    title="Account Opportunities"
    chart-type="donut"
    record-id={recordId}
    show-legend
    value-prefix="$">
</c-donut-chart>
```

---

## API Reference

### `@api` Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `title` | `String` | `''` | Chart card heading |
| `chartType` | `'donut'\|'pie'` | `'donut'` | Rendering mode |
| `chartData` | `ChartDataItem[]` | `[]` | Static data array |
| `recordId` | `String` | `''` | Triggers Apex wire fetch |
| `labelField` | `String` | `'label'` | Key for slice label in data items |
| `valueField` | `String` | `'value'` | Key for numeric value in data items |
| `colorPalette` | `String[]` | _Built-in 12 colours_ | Array of hex/rgb colour strings |
| `showLegend` | `Boolean` | `false` | Show the legend panel |
| `legendPosition` | `'side-by-side'\|'stacked'` | `'side-by-side'` | Legend placement |
| `legendTitle` | `String` | `''` | Heading above legend rows |
| `showLegendTotal` | `Boolean` | `false` | Show total row in legend |
| `showCenterText` | `Boolean` | `true` | Show label + value in donut centre |
| `centerLabel` | `String` | `'Total'` | Label text above the centre value |
| `valuePrefix` | `String` | `''` | Prepended to formatted values (e.g. `$`) |
| `valueSuffix` | `String` | `''` | Appended to formatted values (e.g. ` hrs`) |
| `footerText` | `String` | `''` | Small annotation in the card footer |

### `@api` Method

| Method | Description |
|--------|-------------|
| `refresh()` | Clears cached Apex data and re-triggers the wire |

### `ChartDataItem` shape

```js
{
  label: string,   // display name for the slice
  value: number    // numeric value (override field names via labelField / valueField)
}
```

---

## Usage Examples

### Minimal donut

```html
<c-donut-chart chart-data={data}></c-donut-chart>
```

### Pie chart with stacked legend and currency values

```html
<c-donut-chart
    title="Closed Won by Stage"
    chart-type="pie"
    show-legend
    legend-position="stacked"
    show-legend-total
    value-prefix="$"
    chart-data={data}>
</c-donut-chart>
```

### Custom colour palette

```js
// In parent JS
customColors = ['#E63946','#457B9D','#1D3557','#A8DADC','#F1FAEE'];
```

```html
<c-donut-chart
    title="Cases by Priority"
    chart-data={caseData}
    color-palette={customColors}
    show-legend>
</c-donut-chart>
```

### Record page — Apex auto-wire

```html
<!-- On an Account record page; recordId injected by the platform -->
<c-donut-chart
    title="Pipeline by Stage"
    record-id={recordId}
    show-legend
    value-prefix="$"
    footer-text="Open opportunities only">
</c-donut-chart>
```

---

## Apex Controller

`DonutChartController` provides four ready-to-use `@AuraEnabled(cacheable=true)` methods:

| Method | Returns | Description |
|--------|---------|-------------|
| `getChartData(recordId)` | `ChartDataItem[]` | Generic dispatcher; routes by sObject type |
| `getOpportunityStageData()` | `ChartDataItem[]` | Open Opp revenue grouped by Stage |
| `getCaseStatusData()` | `ChartDataItem[]` | Cases grouped by Status (count) |
| `getAccountIndustryData()` | `ChartDataItem[]` | Accounts grouped by Industry (count) |
| `getOpportunityStageDataForAccount(accountId)` | `ChartDataItem[]` | Opp stages for a specific Account |

To wire a custom query, import any method directly:

```js
import getCaseStatusData from '@salesforce/apex/DonutChartController.getCaseStatusData';

@wire(getCaseStatusData)
wiredCases({ data }) {
    if (data) this.chartData = data;
}
```

---

## App Builder Configuration

The component exposes all key properties in Lightning App Builder. Once deployed, drag `donutChart` onto any page and configure:

- **Chart Title** — card heading
- **Chart Type** — Donut or Pie
- **Show Legend / Legend Position**
- **Center Label** (donut)
- **Value Prefix / Suffix** — currency or units
- **Record ID** — auto-populates on record pages
- **Footer Annotation**

---

## Accessibility

- All SVG `<path>` slices have `tabindex="0"`, `role="button"`, and `aria-label` (e.g. _"Prospecting: $1.2M, 32.4%"_).
- Legend items have `role="listitem"` and descriptive `aria-label`.
- The SVG wrapper has `role="img"` with a contextual `aria-label`.
- Keyboard users can Tab through slices and trigger the tooltip on focus.
- Tooltip region has `aria-live="polite"` for screen reader announcements.

---

## Browser & API Compatibility

| Item | Version |
|------|---------|
| Salesforce API | 61.0 (Summer '24) |
| LWC Engine | Latest |
| Browsers | Evergreen Chrome, Firefox, Edge, Safari |
| Mobile | iOS Safari 14+, Chrome for Android |

---

## Customisation Guide

### Change default colours

Edit `DEFAULT_COLOR_PALETTE` in `donutChart.js`:

```js
const DEFAULT_COLOR_PALETTE = [
    '#your-brand-color-1',
    '#your-brand-color-2',
    // ...
];
```

### Adjust donut hole size

Change `DONUT_INNER_RADIUS_RATIO` in `donutChart.js` (0 = pie, 0.8 = very thin ring):

```js
const DONUT_INNER_RADIUS_RATIO = 0.55; // default
```

### Adjust chart size

Change the SVG `viewBox` dimensions in `donutChart.html` and the `OUTER_RADIUS` constant in `donutChart.js`.

### Bring your own data format

If your Apex wrapper uses different field names (e.g. `name` and `amount`), pass them via `@api`:

```html
<c-donut-chart
    label-field="name"
    value-field="amount"
    chart-data={data}>
</c-donut-chart>
```

---

## Known Limitations

- The wire adapter fires only when `recordId` changes. Call `refresh()` to force a re-fetch on the same record.
- Very thin slices (< 1% share) may be hard to click on touch devices — consider grouping small values into an "Other" bucket in Apex.
- SVG `<text>` elements do not inherit SLDS font stacks on all browsers; fonts are explicitly set in CSS.
