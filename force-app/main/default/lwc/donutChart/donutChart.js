import { LightningElement, api, track, wire } from 'lwc';
import getChartData from '@salesforce/apex/DonutChartController.getChartData';

// ── Constants ──────────────────────────────────────────────────────────────
const DEFAULT_COLOR_PALETTE = [
    '#0070D2', '#FF538A', '#04844B', '#FFB75D',
    '#1589EE', '#E8384F', '#62D2A2', '#7B5EA7',
    '#F4BC25', '#00A1CB', '#E07A5F', '#3D405B'
];

const OUTER_RADIUS = 95;
const DONUT_INNER_RADIUS_RATIO = 0.55; // inner radius as fraction of outer
const HOVER_TRANSLATE = 6;             // px to push slice outward on hover
const TWO_PI = 2 * Math.PI;
const START_ANGLE_OFFSET = -Math.PI / 2; // start from 12-o'clock

// ── Helper: polar → cartesian ──────────────────────────────────────────────
function polarToCartesian(angle, radius) {
    return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius
    };
}

// ── Helper: build SVG arc path ─────────────────────────────────────────────
function buildArcPath(startAngle, endAngle, outerR, innerR) {
    const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;

    const p1 = polarToCartesian(startAngle, outerR);
    const p2 = polarToCartesian(endAngle, outerR);
    const p3 = polarToCartesian(endAngle, innerR);
    const p4 = polarToCartesian(startAngle, innerR);

    if (innerR === 0) {
        // Pie slice: line from center to arc start, arc, close
        return [
            `M 0 0`,
            `L ${p1.x} ${p1.y}`,
            `A ${outerR} ${outerR} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
            'Z'
        ].join(' ');
    }

    // Donut slice: outer arc → inner arc (reverse)
    return [
        `M ${p1.x} ${p1.y}`,
        `A ${outerR} ${outerR} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
        `L ${p3.x} ${p3.y}`,
        `A ${innerR} ${innerR} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
        'Z'
    ].join(' ');
}

// ── Helper: compute midpoint angle of a slice ──────────────────────────────
function midAngle(startAngle, endAngle) {
    return (startAngle + endAngle) / 2;
}

// ── Helper: format numbers ─────────────────────────────────────────────────
function formatNumber(num, prefix = '', suffix = '') {
    if (num == null || isNaN(num)) return '—';
    const n = Number(num);
    let formatted;
    if (Math.abs(n) >= 1_000_000) {
        formatted = `${(n / 1_000_000).toFixed(1)}M`;
    } else if (Math.abs(n) >= 1_000) {
        formatted = `${(n / 1_000).toFixed(1)}K`;
    } else {
        formatted = n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
    return `${prefix}${formatted}${suffix}`;
}

// ═══════════════════════════════════════════════════════════════════════════
export default class DonutChart extends LightningElement {

    // ── Public API ─────────────────────────────────────────────────────────

    /** Chart title shown in the card header. */
    @api title = '';

    /**
     * 'donut' renders a ring chart; 'pie' renders a solid pie chart.
     * @type {'donut'|'pie'}
     */
    @api chartType = 'donut';

    /**
     * Layout of chart + legend.
     * @type {'side-by-side'|'stacked'|'chart-only'}
     */
    @api legendPosition = 'side-by-side';

    /** Show the legend panel. */
    @api showLegend = false;

    /** Show the total row at the bottom of the legend. */
    @api showLegendTotal = false;

    /** Optional heading above legend items. */
    @api legendTitle = '';

    /** Show the total value in the donut center. */
    @api showCenterText = true;

    /** Label above the center value (donut mode). */
    @api centerLabel = 'Total';

    /**
     * Array of hex/rgb color strings.
     * Defaults to a built-in Salesforce-inspired palette.
     * @type {string[]}
     */
    @api
    get colorPalette() { return this._colorPalette; }
    set colorPalette(val) {
        this._colorPalette = Array.isArray(val) && val.length ? val : DEFAULT_COLOR_PALETTE;
    }
    _colorPalette = DEFAULT_COLOR_PALETTE;

    /** Optional value prefix (e.g. '$'). */
    @api valuePrefix = '';

    /** Optional value suffix (e.g. ' hrs'). */
    @api valueSuffix = '';

    /** Optional footer annotation text. */
    @api footerText = '';

    /**
     * Static chart data — use when wiring data from a parent component.
     * Each item must contain `label` and `value` keys (override with
     * labelField / valueField if your Apex wrapper uses different names).
     * @type {{label:string, value:number}[]}
     */
    @api
    get chartData() { return this._chartData; }
    set chartData(val) {
        this._chartData = val || [];
        this._apexError = null;
    }

    /** Field name for the label in each data record. */
    @api labelField = 'label';

    /** Field name for the numeric value in each data record. */
    @api valueField = 'value';

    /**
     * Apex record ID passed to the wired Apex method.
     * Leave blank to use static chartData instead.
     */
    @api recordId = '';

    // ── Internal state ─────────────────────────────────────────────────────

    @track _chartData = [];
    @track _apexData = null;
    @track _apexError = null;
    @track _activeIndex = null;   // currently hovered slice index
    @track tooltip = {
        visible: false,
        label: '',
        formattedValue: '',
        percent: '',
        dotStyle: '',
        posX: 0,
        posY: 0
    };

    // ── Wire: auto-load when recordId is provided ──────────────────────────
    @wire(getChartData, { recordId: '$recordId' })
    wiredChartData({ data, error }) {
        if (data) {
            this._apexData = data;
            this._apexError = null;
        } else if (error) {
            this._apexError = error?.body?.message || 'Failed to load chart data.';
            this._apexData = null;
        }
    }

    // ── Computed: resolve data source ──────────────────────────────────────

    get resolvedData() {
        // If recordId is set, prefer wired Apex data
        if (this.recordId && this._apexData) return this._apexData;
        return this._chartData || [];
    }

    get isLoading() {
        return this.recordId && !this._apexData && !this._apexError;
    }

    get hasError() {
        return !!this._apexError;
    }

    get errorMessage() {
        return this._apexError || '';
    }

    get isEmpty() {
        return !this.isLoading && !this.hasError && this.resolvedData.length === 0;
    }

    get hasData() {
        return !this.isLoading && !this.hasError && this.resolvedData.length > 0;
    }

    // ── Chart math ─────────────────────────────────────────────────────────

    get isDonut() {
        return this.chartType !== 'pie';
    }

    get innerRadius() {
        return Math.round(OUTER_RADIUS * DONUT_INNER_RADIUS_RATIO);
    }

    get total() {
        return this.resolvedData.reduce((sum, d) => sum + Number(d[this.valueField] ?? 0), 0);
    }

    get formattedTotal() {
        return formatNumber(this.total, this.valuePrefix, this.valueSuffix);
    }

    get ariaLabel() {
        return this.title
            ? `${this.chartType === 'pie' ? 'Pie' : 'Donut'} chart: ${this.title}`
            : `${this.chartType === 'pie' ? 'Pie' : 'Donut'} chart with ${this.resolvedData.length} segments`;
    }

    // ── Computed slices ────────────────────────────────────────────────────

    get computedSlices() {
        const data = this.resolvedData;
        if (!data.length) return [];

        const total = this.total || 1; // guard divide-by-zero
        const innerR = this.isDonut ? this.innerRadius : 0;
        const colors = this._colorPalette;
        let angle = START_ANGLE_OFFSET;

        return data.map((item, index) => {
            const value = Number(item[this.valueField] ?? 0);
            const sweep = (value / total) * TWO_PI;
            const startAngle = angle;
            const endAngle = angle + sweep;
            angle = endAngle;

            const mid = midAngle(startAngle, endAngle);
            const color = colors[index % colors.length];
            const isActive = this._activeIndex === index;
            const isDimmed = this._activeIndex !== null && !isActive;
            const percent = ((value / total) * 100).toFixed(1);

            // Translate active slice outward from center
            let transformStyle = '';
            if (isActive) {
                const tx = Math.cos(mid) * HOVER_TRANSLATE;
                const ty = Math.sin(mid) * HOVER_TRANSLATE;
                transformStyle = `transform: translate(${tx}px, ${ty}px);`;
            }

            const sliceClass = [
                'chart-slice',
                isActive ? 'chart-slice--active' : '',
                isDimmed ? 'chart-slice--dimmed' : ''
            ].filter(Boolean).join(' ');

            return {
                id: `slice-${index}`,
                index,
                pathData: buildArcPath(startAngle, endAngle, OUTER_RADIUS, innerR),
                color,
                label: item[this.labelField] || `Item ${index + 1}`,
                value,
                percent,
                sliceClass,
                transformStyle,
                ariaLabel: `${item[this.labelField]}: ${formatNumber(value, this.valuePrefix, this.valueSuffix)}, ${percent}%`
            };
        });
    }

    // ── Computed legend ────────────────────────────────────────────────────

    get computedLegendItems() {
        return this.computedSlices.map(slice => {
            const isActive = this._activeIndex === slice.index;
            const isDimmed = this._activeIndex !== null && !isActive;

            return {
                id: `legend-${slice.index}`,
                index: slice.index,
                label: slice.label,
                formattedValue: formatNumber(slice.value, this.valuePrefix, this.valueSuffix),
                percent: slice.percent,
                swatchStyle: `background-color: ${slice.color}; border-radius: 2px;`,
                legendItemClass: [
                    'legend-item',
                    isActive  ? 'legend-item--active' : '',
                    isDimmed  ? 'legend-item--dimmed' : ''
                ].filter(Boolean).join(' '),
                ariaLabel: `${slice.label}: ${formatNumber(slice.value, this.valuePrefix, this.valueSuffix)}, ${slice.percent}%`
            };
        });
    }

    // ── Layout class helpers ───────────────────────────────────────────────

    get chartLayoutClass() {
        const base = 'chart-layout';
        const variant = this.showLegend
            ? (this.legendPosition === 'stacked' ? 'stacked' : 'side-by-side')
            : 'chart-only';
        return `${base}--${variant}`;
    }

    get legendClass() {
        return this.legendPosition === 'stacked'
            ? 'legend-container legend-container--stacked'
            : 'legend-container';
    }

    get tooltipClass() {
        return 'chart-tooltip';
    }

    // ── Tooltip position style ─────────────────────────────────────────────

    get tooltipPositionStyle() {
        return `left: ${this.tooltip.posX}px; top: ${this.tooltip.posY}px;`;
    }

    // ── Event handlers: slices ─────────────────────────────────────────────

    handleSliceMouseEnter(event) {
        const index = parseInt(event.currentTarget.dataset.index, 10);
        this._setActive(index, event.currentTarget);
    }

    handleSliceMouseLeave() {
        this._clearActive();
    }

    handleSliceFocus(event) {
        const index = parseInt(event.currentTarget.dataset.index, 10);
        this._setActive(index, event.currentTarget);
    }

    handleSliceBlur() {
        this._clearActive();
    }

    handleChartMouseLeave() {
        this._clearActive();
    }

    // ── Event handlers: legend ─────────────────────────────────────────────

    handleLegendMouseEnter(event) {
        const index = parseInt(event.currentTarget.dataset.index, 10);
        this._activeIndex = index;
        this._showTooltipForIndex(index, null);
    }

    handleLegendMouseLeave() {
        this._clearActive();
    }

    handleLegendFocus(event) {
        const index = parseInt(event.currentTarget.dataset.index, 10);
        this._activeIndex = index;
    }

    handleLegendBlur() {
        this._clearActive();
    }

    // ── Private helpers ────────────────────────────────────────────────────

    _setActive(index, targetEl) {
        this._activeIndex = index;
        this._showTooltipForIndex(index, targetEl);
    }

    _clearActive() {
        this._activeIndex = null;
        this.tooltip = { ...this.tooltip, visible: false };
    }

    _showTooltipForIndex(index, targetEl) {
        const slice = this.computedSlices[index];
        if (!slice) return;

        let posX = 110; // SVG center fallback
        let posY = 50;

        if (targetEl) {
            const wrapperEl = this.template.querySelector('.chart-svg-wrapper');
            if (wrapperEl) {
                const wrapperRect = wrapperEl.getBoundingClientRect();
                const targetRect = targetEl.getBoundingClientRect();
                posX = targetRect.left - wrapperRect.left + targetRect.width / 2;
                posY = targetRect.top  - wrapperRect.top;
            }
        }

        this.tooltip = {
            visible: true,
            label: slice.label,
            formattedValue: formatNumber(slice.value, this.valuePrefix, this.valueSuffix),
            percent: `${slice.percent}%`,
            dotStyle: `background-color: ${slice.color};`,
            posX,
            posY
        };
    }

    // ── Public method: refresh wired data ──────────────────────────────────

    @api
    refresh() {
        // Notifying the wire adapter to re-fetch (pattern: clear + re-trigger)
        this._apexData = null;
        this._apexError = null;
        // The reactive recordId property will re-trigger the wire automatically
        // If chartData was set via @api, nothing to refresh
    }
}
