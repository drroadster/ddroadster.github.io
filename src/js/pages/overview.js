// ═══════════════════════════════════════════════════════
//  ROADSTER v3.1 · pages/overview.js
//  iOS Minimal Finance Dashboard — 5-period switching,
//  summary card, bar chart with labels, calendar grid,
//  category breakdown, dark mode support
// ═══════════════════════════════════════════════════════

import { getTransactions, catTotals } from '../store.js';
import { buildVertBar, cssVar, hexToRgba, palette } from '../charts.js';
import { fmt, fmtK, esc, formatTxDateTime, pad2 } from '../utils.js';
import { onNavigate } from '../router.js';
import { getCatIcon } from '../config.js';

// ── State ──────────────────────────────────────────────
let _period = 'month';          // 'day' | 'week' | 'month' | 'year' | 'all'
let _type  = 'expense';         // 'expense' | 'income'
let _selectedYear  = new Date().getFullYear();
let _selectedMonth = new Date().getMonth() + 1;
let _dayOffset   = 0;           // days offset from today (for day mode)
let _weekOffset  = 0;           // weeks offset from current week
let _yearOffset  = 0;           // years offset from current year
let _monthOffset = 0;           // months offset from current month
let _catDetailData = {};
let _catDetailSort = 'time';
let _resizeTimer = null;
let _resizeObserver = null;

// ── Public API ─────────────────────────────────────────
export function initOverviewPage() {
  _wireControls();
  onNavigate(page => { if (page === 'overview') render(); });
}

export function render() {
  const all  = getTransactions();
  const txs  = _getFilteredTxs(all);
  const prevTxs = _getPreviousPeriodTxs(all);
  const range = _buildDateRange();

  _updatePeriodUI(range);
  _renderSummaryCard(txs, prevTxs, range);
  _renderBarChart(all, range);
  _renderCalendar(all, range);
  _renderCategories(txs);
  _renderRecent(txs);
}

// ═══════════════════════════════════════════════════════
//  1. DATE RANGE BUILDER — core of 5-period logic
// ═══════════════════════════════════════════════════════
function _buildDateRange() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (_period) {
    case 'day': {
      const d = new Date(today);
      d.setDate(d.getDate() + _dayOffset);
      const start = new Date(d);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      const isToday = _dayOffset === 0;
      return {
        start, end,
        label: isToday
          ? '今天'
          : `${start.getFullYear()}年${start.getMonth()+1}月${start.getDate()}日`,
        canNext: _dayOffset < 0,
        canPrev: true,
      };
    }

    case 'week': {
      const dayOfWeek = now.getDay(); // 0=Sun
      const mondayOffset = dayOfWeek === 0 ? -6 : (1 - dayOfWeek);
      const thisMonday = new Date(today);
      thisMonday.setDate(today.getDate() + mondayOffset);
      const weekStart = new Date(thisMonday);
      weekStart.setDate(thisMonday.getDate() + _weekOffset * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      const weekLastDay = new Date(weekEnd);
      weekLastDay.setDate(weekEnd.getDate() - 1);
      const isThisWeek = _weekOffset === 0;
      return {
        start: weekStart, end: weekEnd,
        label: isThisWeek
          ? '本周'
          : `${weekStart.getMonth()+1}月${weekStart.getDate()}日-${weekLastDay.getMonth()+1}月${weekLastDay.getDate()}日`,
        canNext: _weekOffset < 0,
        canPrev: true,
      };
    }

    case 'month': {
      let y = now.getFullYear(), m = now.getMonth() + 1;
      let totalOffset = _monthOffset;
      m += totalOffset;
      while (m > 12) { m -= 12; y++; }
      while (m < 1)  { m += 12; y--; }
      const start = new Date(y, m - 1, 1);
      const end   = new Date(y, m, 1);
      const isCurrent = (y === now.getFullYear() && m === (now.getMonth() + 1));
      return {
        start, end,
        label: `${y}年${m}月`,
        canNext: !isCurrent,
        canPrev: true,
      };
    }

    case 'year': {
      const y = now.getFullYear() + _yearOffset;
      const start = new Date(y, 0, 1);
      const end   = new Date(y + 1, 0, 1);
      const isCurrent = _yearOffset === 0;
      return {
        start, end,
        label: `${y}年`,
        canNext: _yearOffset < 0,
        canPrev: true,
      };
    }

    case 'all': {
      const start = new Date(2000, 0, 1);
      const end   = new Date(2100, 0, 1);
      return {
        start, end,
        label: '全部',
        canNext: false,
        canPrev: false,
      };
    }
  }
}

function _getISOWeekNumber(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

// ═══════════════════════════════════════════════════════
//  2. FILTER TRANSACTIONS
// ═══════════════════════════════════════════════════════
function _getFilteredTxs(all) {
  const range = _buildDateRange();
  return all.filter(tx => {
    if (tx.deleted) return false;
    const d = new Date(tx.date);
    if (tx.type !== (_type === 'expense' ? '支出' : '收入')) return false;
    if (_period === 'all') return true;
    return d >= range.start && d < range.end;
  });
}

function _getPreviousPeriodTxs(all) {
  // Get the previous period's transactions for MoM comparison
  const range = _buildDateRange();
  const duration = range.end - range.start;
  const prevStart = new Date(range.start.getTime() - duration);
  const prevEnd   = range.start;

  return all.filter(tx => {
    if (tx.deleted) return false;
    const d = new Date(tx.date);
    if (tx.type !== (_type === 'expense' ? '支出' : '收入')) return false;
    return d >= prevStart && d < prevEnd;
  });
}

// ═══════════════════════════════════════════════════════
//  3. UI UPDATE — period label, arrows, tabs
// ═══════════════════════════════════════════════════════
function _updatePeriodUI(range) {
  const labelEl = document.getElementById('ovPeriodLabel');
  if (labelEl) labelEl.textContent = range.label;

  const prevBtn = document.getElementById('ovPrevBtn');
  const nextBtn = document.getElementById('ovNextBtn');
  if (prevBtn) prevBtn.style.visibility = (_period === 'all') ? 'hidden' : 'visible';
  if (nextBtn) {
    if (_period === 'day')   nextBtn.style.visibility = _dayOffset < 0  ? 'visible' : 'hidden';
    else if (_period === 'week')  nextBtn.style.visibility = _weekOffset < 0  ? 'visible' : 'hidden';
    else if (_period === 'month') nextBtn.style.visibility = _monthOffset < 0 ? 'visible' : 'hidden';
    else if (_period === 'year')  nextBtn.style.visibility = _yearOffset < 0  ? 'visible' : 'hidden';
    else nextBtn.style.visibility = 'hidden';
  }
}

// ═══════════════════════════════════════════════════════
//  4. CONTROLS WIRING
// ═══════════════════════════════════════════════════════
function _wireControls() {
  // Period tabs
  document.querySelectorAll('#ovPeriodTabs .ov-period-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _period = btn.dataset.period;
      _dayOffset  = 0;
      _weekOffset = 0;
      _monthOffset = 0;
      _yearOffset = 0;
      document.querySelectorAll('#ovPeriodTabs .ov-period-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _syncDropdown();
      render();
    });
  });

  // Arrow navigation
  const prevBtn = document.getElementById('ovPrevBtn');
  const nextBtn = document.getElementById('ovNextBtn');
  if (prevBtn) prevBtn.addEventListener('click', () => _shiftPeriod(-1));
  if (nextBtn) nextBtn.addEventListener('click', () => _shiftPeriod(1));

  // Type toggle
  document.querySelectorAll('#ovTypeToggle .ov-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _type = btn.dataset.type;
      document.querySelectorAll('#ovTypeToggle .ov-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      render();
    });
  });

  // Month dropdown (only for month mode)
  const monthPicker = document.getElementById('ovMonthPicker');
  if (monthPicker) {
    monthPicker.addEventListener('change', () => {
      const [y, m] = monthPicker.value.split('-').map(Number);
      const now = new Date();
      _selectedYear  = y;
      _selectedMonth = m;
      _monthOffset = (y - now.getFullYear()) * 12 + (m - (now.getMonth() + 1));
      render();
    });
  }

  // Calendar toggle
  const calToggle = document.getElementById('ovCalToggle');
  if (calToggle) {
    calToggle.addEventListener('click', () => {
      const grid = document.getElementById('ovCalGrid');
      if (!grid) return;
      const expanded = grid.classList.toggle('expanded');
      calToggle.innerHTML = expanded ? '收起全部 ∧' : '展开全部 ∨';
    });
  }

  // Category detail overlay
  const overlay = document.getElementById('catDetailOverlay');
  if (overlay) {
    overlay.onclick = e => { if (e.target === overlay) _closeCatDetail(); };
  }
  document.querySelectorAll('#catDetailSortSeg .seg-pill').forEach(btn => {
    btn.onclick = () => {
      _catDetailSort = btn.dataset.sort;
      document.querySelectorAll('#catDetailSortSeg .seg-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _renderCatDetail();
    };
  });

  // ── Resize handling ──────────────────────────────────
  window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => render(), 150);
  });

  // Observe chart container resize (e.g. mobile orientation change)
  const chartWrap = document.querySelector('.ov-chart-wrap');
  if (chartWrap && !_resizeObserver) {
    _resizeObserver = new ResizeObserver(() => {
      clearTimeout(_resizeTimer);
      _resizeTimer = setTimeout(() => render(), 150);
    });
    _resizeObserver.observe(chartWrap);
  }
}

function _shiftPeriod(delta) {
  switch (_period) {
    case 'day':   _dayOffset  += delta; break;
    case 'week':  _weekOffset += delta; break;
    case 'month': _monthOffset += delta; break;
    case 'year':  _yearOffset += delta; break;
    case 'all':   return;
  }
  const range = _buildDateRange();
  // Clamp next button
  if (_period === 'day' && _dayOffset > 0)   { _dayOffset = 0; }
  if (_period === 'week' && _weekOffset > 0)  { _weekOffset = 0; }
  if (_period === 'month' && _monthOffset > 0) { _monthOffset = 0; }
  if (_period === 'year' && _yearOffset > 0)  { _yearOffset = 0; }
  render();
}

function _syncDropdown() {
  const dropdownWrap = document.getElementById('ovDropdownWrap');
  if (!dropdownWrap) return;
  if (_period === 'month' || _period === 'year') {
    dropdownWrap.style.display = '';
    _buildDropdown();
  } else {
    dropdownWrap.style.display = 'none';
  }
}

function _buildDropdown() {
  const sel = document.getElementById('ovMonthPicker');
  if (!sel) return;
  const now = new Date();
  const cy = now.getFullYear(), cm = now.getMonth() + 1;
  let html = '';

  if (_period === 'month') {
    for (let y = cy - 2; y <= cy; y++) {
      for (let m = 1; m <= 12; m++) {
        if (y === cy && m > cm) continue;
        const val = `${y}-${pad2(m)}`;
        const targetY = now.getFullYear() + Math.floor((_monthOffset + (now.getMonth()+1)) / 12);
        // Simplification: use _buildDateRange year/month
        const range = _buildDateRange();
        const selected = (y === range.start.getFullYear() && m === (range.start.getMonth()+1)) ? ' selected' : '';
        html += `<option value="${val}"${selected}>${y}年${m}月</option>`;
      }
    }
  } else if (_period === 'year') {
    for (let y = cy - 3; y <= cy; y++) {
      const range = _buildDateRange();
      const selected = (y === range.start.getFullYear()) ? ' selected' : '';
      html += `<option value="${y}-01"${selected}>${y}年</option>`;
    }
  }
  sel.innerHTML = html;
}

// ═══════════════════════════════════════════════════════
//  5. SUMMARY CARD
// ═══════════════════════════════════════════════════════
function _renderSummaryCard(txs, prevTxs, range) {
  const total = txs.reduce((s, tx) => s + tx.amount, 0);
  const prevTotal = prevTxs.reduce((s, tx) => s + tx.amount, 0);

  const amountEl = document.getElementById('ovSummaryAmount');
  const labelEl  = document.getElementById('ovSummaryLabel');
  const changeEl = document.getElementById('ovSummaryChange');

  if (amountEl) amountEl.textContent = `¥${fmt(total)}`;

  const typeLabel = _type === 'expense' ? '支出' : '收入';
  if (labelEl) {
    switch (_period) {
      case 'day':   labelEl.textContent = `本日${typeLabel}`; break;
      case 'week':  labelEl.textContent = `本周${typeLabel}`; break;
      case 'month': labelEl.textContent = `本月${typeLabel}`; break;
      case 'year':  labelEl.textContent = `${range.label}${typeLabel}`; break;
      case 'all':   labelEl.textContent = `全部${typeLabel}`; break;
    }
  }

  if (changeEl) {
    if (_period === 'all' || prevTotal === 0) {
      changeEl.textContent = '';
      changeEl.className = 'ov-summary-change';
    } else {
      const diff = total - prevTotal;
      const pct = prevTotal > 0 ? Math.abs((diff / prevTotal) * 100).toFixed(1) : 0;
      const arrow = diff >= 0 ? '↑' : '↓';
      const dir   = diff >= 0 ? 'up' : 'down';
      const prevLabel = _type === 'expense' ? '支出' : '收入';
      let periodLabel;
      switch (_period) {
        case 'day':   periodLabel = '昨日'; break;
        case 'week':  periodLabel = '上周'; break;
        case 'month': periodLabel = '上月'; break;
        case 'year':  periodLabel = '去年'; break;
        default:      periodLabel = '上期';
      }
      changeEl.textContent = `较${periodLabel} ${arrow}${pct}%`;
      changeEl.className = `ov-summary-change ov-change--${dir}`;
    }
  }
}

// ═══════════════════════════════════════════════════════
//  6. BAR CHART
// ═══════════════════════════════════════════════════════
function _renderBarChart(all, range) {
  const canvas = document.getElementById('ovBarChart');
  const emptyEl = document.getElementById('ovBarEmpty');
  if (!canvas) return;

  const activeTxs = all.filter(tx => !tx.deleted && tx.type === (_type === 'expense' ? '支出' : '收入'));

  if (!activeTxs.length) {
    canvas.style.display = 'none';
    if (emptyEl) emptyEl.style.display = '';
    const avgEl = document.getElementById('ovAvgLine');
    if (avgEl) avgEl.textContent = '';
    return;
  }
  canvas.style.display = '';
  if (emptyEl) emptyEl.style.display = 'none';

  let labels = [], data = [];
  const barColor = _type === 'expense' ? '#A0C4F0' : '#A0E8C8';
  const accentColor = '#2F54EB';

  switch (_period) {
    case 'day': {
      // Show last 7 days for context
      const now = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        const total = activeTxs.filter(tx => {
          const dx = new Date(tx.date);
          return dx >= dayStart && dx < dayEnd;
        }).reduce((s, tx) => s + tx.amount, 0);
        labels.push(`${d.getMonth()+1}/${d.getDate()}`);
        data.push(total);
      }
      break;
    }
    case 'week': {
      // Show daily breakdown for the week
      const weekStart = new Date(range.start);
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        const total = activeTxs.filter(tx => {
          const dx = new Date(tx.date);
          return dx >= dayStart && dx < dayEnd;
        }).reduce((s, tx) => s + tx.amount, 0);
        const dayNames = ['日','一','二','三','四','五','六'];
        labels.push(`周${dayNames[d.getDay()]}`);
        data.push(total);
      }
      break;
    }
    case 'month': {
      // Show last 5 months
      const now = new Date();
      for (let i = 4; i >= 0; i--) {
        let m = now.getMonth() + 1 - i, y = now.getFullYear();
        while (m <= 0) { m += 12; y--; }
        const total = activeTxs.filter(tx => {
          const d = new Date(tx.date);
          return d.getFullYear() === y && (d.getMonth() + 1) === m;
        }).reduce((s, tx) => s + tx.amount, 0);
        labels.push(`${m}月`);
        data.push(total);
      }
      break;
    }
    case 'year': {
      // Show 12 months
      const y = range.start.getFullYear();
      for (let m = 1; m <= 12; m++) {
        const total = activeTxs.filter(tx => {
          const d = new Date(tx.date);
          return d.getFullYear() === y && (d.getMonth() + 1) === m;
        }).reduce((s, tx) => s + tx.amount, 0);
        labels.push(`${m}月`);
        data.push(total);
      }
      break;
    }
    case 'all': {
      // Show yearly summary for all years with data
      const yearMap = {};
      activeTxs.forEach(tx => {
        const y = new Date(tx.date).getFullYear();
        yearMap[y] = (yearMap[y] || 0) + tx.amount;
      });
      const years = Object.keys(yearMap).sort();
      if (years.length < 2) {
        // Fallback to monthly if single year
        for (let m = 1; m <= 12; m++) {
          const total = activeTxs.filter(tx => {
            const d = new Date(tx.date);
            return (d.getMonth() + 1) === m;
          }).reduce((s, tx) => s + tx.amount, 0);
          labels.push(`${m}月`);
          data.push(total);
        }
      } else {
        years.forEach(y => {
          labels.push(`${y}年`);
          data.push(yearMap[y]);
        });
      }
      break;
    }
  }

  // Compute average
  const nonZero = data.filter(v => v > 0);
  const avg = nonZero.length > 0 ? nonZero.reduce((s, v) => s + v, 0) / nonZero.length : 0;

  const colors = data.map(() => barColor);

  // Update average line label
  const avgEl = document.getElementById('ovAvgLine');
  if (avgEl) {
    avgEl.textContent = `月${_type === 'expense' ? '支出' : '收入'}均值 ¥${fmt(avg)}`;
  }

  // Build chart with average line plugin (deferred to rAF for DOM readiness)
  requestAnimationFrame(() => {
    _buildVertBarWithAvg('ovBarChart', labels, data, colors, avg, barColor);
  });
}

// ── Amount formatter for bar labels ────────────────────
function _fmtBarLabel(v) {
  if (v <= 0) return '';
  if (v >= 10000) return '¥' + (v / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  return '¥' + v.toLocaleString('zh-CN');
}

// ── Y-axis tick formatter ─────────────────────────────
function _fmtAxisTick(v) {
  if (v >= 1e8) return '¥' + (v / 1e8).toFixed(0) + '亿';
  if (v >= 1e4) return '¥' + (v / 1e4).toFixed(0) + '万';
  if (v >= 1e3) return '¥' + (v / 1e3).toFixed(0) + 'k';
  return '¥' + v;
}

// Custom build with devicePixelRatio, average line, and bar-top amount labels
function _buildVertBarWithAvg(canvasId, labels, data, colors, avgValue, barColor) {
  const { Chart } = window;
  if (!Chart) return;

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // Destroy previous Chart.js instance on this canvas
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();

  // ── Device-pixel-ratio aware canvas sizing ──────────
  const dpr = window.devicePixelRatio || 1;
  const parent = canvas.parentElement;
  const rect = parent.getBoundingClientRect();
  const w = rect.width || parent.clientWidth || 320;
  const h = rect.height || parent.clientHeight || 200;

  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';

  const ctx2d = canvas.getContext('2d');
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);

  // ── Avg-line plugin ──────────────────────────────────
  if (!_avgLinePlugin) {
    _avgLinePlugin = {
      id: 'avgLinePlugin',
      afterDatasetsDraw(chart) {
        const avg = chart.options.plugins?.avgLinePlugin?.avgValue;
        if (!avg || avg <= 0) return;
        const { ctx, scales: { x, y } } = chart;
        const yPos = y.getPixelForValue(avg);
        if (yPos < y.top || yPos > y.bottom) return;

        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#2F54EB';
        ctx.lineWidth = 1.5;
        ctx.moveTo(x.left, yPos);
        ctx.lineTo(x.right, yPos);
        ctx.stroke();

        // Label next to the avg line
        ctx.fillStyle = '#2F54EB';
        ctx.font = '600 11px -apple-system, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('月均 ¥' + _fmtBarLabel(avg).replace('¥', ''), x.left + 6, yPos - 5);
        ctx.restore();
      },
    };
  }
  if (!Chart.registry.plugins.get('avgLinePlugin')) {
    Chart.register(_avgLinePlugin);
  }

  // ── Build chart ──────────────────────────────────────
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderRadius: 8,
        borderSkipped: false,
      }],
    },
    plugins: [{
      id: 'barLabels',
      afterDatasetsDraw(chart) {
        const ctx = chart.ctx;
        const meta = chart.getDatasetMeta(0);
        meta.data.forEach((bar, i) => {
          const v = chart.data.datasets[0].data[i];
          if (v === 0) return;
          const label = v >= 10000 ? `¥${(v/10000).toFixed(1)}万` : `¥${v.toLocaleString()}`;
          ctx.fillStyle = '#2F54EB';
          ctx.font = `bold ${chart.width < 400 ? 10 : 11}px -apple-system, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(label, bar.x, bar.y - 6);
        });
      }
    }],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      devicePixelRatio: dpr,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (c) => `  ¥${c.raw.toLocaleString('zh-CN')}` },
        },
        avgLinePlugin: { avgValue },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 11 },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 8,
          },
        },
        y: {
          ticks: {
            font: { size: 11 },
            callback: _fmtAxisTick,
          },
        },
      },
    },
  });
}

let _avgLinePlugin = null;

// ═══════════════════════════════════════════════════════
//  7. CALENDAR GRID
// ═══════════════════════════════════════════════════════
function _renderCalendar(all, range) {
  const grid = document.getElementById('ovCalGrid');
  const header = document.getElementById('ovCalHeader');
  if (!grid) return;

  const txs = all.filter(tx => {
    if (tx.deleted) return false;
    if (tx.type !== (_type === 'expense' ? '支出' : '收入')) return false;
    const d = new Date(tx.date);
    return d >= range.start && d < range.end;
  });

  const today = new Date();
  const todayDate = today.getDate();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();

  if (_period === 'day') {
    // Single day view — show one cell
    if (header) header.style.display = 'none';
    const d = range.start;
    const dayTotal = txs.reduce((s, tx) => s + tx.amount, 0);
    const isToday = (d.getFullYear() === todayYear && d.getMonth() === todayMonth && d.getDate() === todayDate);
    grid.innerHTML = `<div class="ov-cal-cell ov-cal-cell--today" style="grid-column:1/-1;aspect-ratio:auto;padding:24px 0">
      <span class="ov-cal-day" style="font-size:20px">${isToday ? '今天' : `${d.getMonth()+1}月${d.getDate()}日`}</span>
      <span class="ov-cal-amount" style="font-size:16px;font-weight:700">¥${fmt(dayTotal)}</span>
    </div>`;
    return;
  }

  if (_period === 'year' || _period === 'all') {
    // Monthly summary grid — 12 months in 4x3 or 6x2
    if (header) header.style.display = 'none';
    const y = _period === 'year' ? range.start.getFullYear() : todayYear;
    // Collect all years if "all" mode
    let months;
    if (_period === 'all') {
      // Show all months across all years
      const monthSet = new Set();
      txs.forEach(tx => {
        const d = new Date(tx.date);
        monthSet.add(`${d.getFullYear()}-${pad2(d.getMonth()+1)}`);
      });
      months = Array.from(monthSet).sort();
      if (months.length === 0) {
        grid.innerHTML = '<div style="text-align:center;padding:20px;color:var(--color-label-4)">暂无数据</div>';
        return;
      }
    } else {
      months = [];
      for (let m = 1; m <= 12; m++) {
        months.push(`${y}-${pad2(m)}`);
      }
    }
    const monthlyTotals = {};
    txs.forEach(tx => {
      const d = new Date(tx.date);
      const key = `${d.getFullYear()}-${pad2(d.getMonth()+1)}`;
      monthlyTotals[key] = (monthlyTotals[key] || 0) + tx.amount;
    });

    grid.style.gridTemplateColumns = 'repeat(4, 1fr)';
    grid.innerHTML = months.map(key => {
      const [yr, mo] = key.split('-').map(Number);
      const total = monthlyTotals[key] || 0;
      const isCurrent = (yr === todayYear && mo === (todayMonth + 1));
      return `<div class="ov-cal-cell ov-cal-cell--month${isCurrent ? ' ov-cal-cell--today' : ''}" style="aspect-ratio:auto;padding:10px 6px">
        <span class="ov-cal-day">${mo}月</span>
        <span class="ov-cal-amount">¥${fmtK(total)}</span>
      </div>`;
    }).join('');
    return;
  }

  // Week / Month mode — standard calendar grid
  if (header) header.style.display = '';
  grid.style.gridTemplateColumns = 'repeat(7, 1fr)';

  let daysToShow;
  if (_period === 'week') {
    // Only 7 days
    const weekStart = new Date(range.start);
    daysToShow = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      daysToShow.push(d);
    }
  } else {
    // Full month
    const firstDay = new Date(range.start.getFullYear(), range.start.getMonth(), 1);
    const lastDay = new Date(range.start.getFullYear(), range.start.getMonth() + 1, 0);
    const totalDays = lastDay.getDate();
    const startDow = firstDay.getDay();
    daysToShow = [];
    for (let i = 0; i < startDow; i++) daysToShow.push(null); // empty cells
    for (let d = 1; d <= totalDays; d++) {
      daysToShow.push(new Date(range.start.getFullYear(), range.start.getMonth(), d));
    }
  }

  // Build daily totals
  const dailyMap = {};
  txs.forEach(tx => {
    const d = new Date(tx.date);
    const day = d.getDate();
    const key = `${d.getFullYear()}-${d.getMonth()}-${day}`;
    dailyMap[key] = (dailyMap[key] || 0) + tx.amount;
  });

  grid.innerHTML = daysToShow.map(d => {
    if (!d) return '<div class="ov-cal-cell ov-cal-cell--empty"></div>';
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const amount = dailyMap[key] || 0;
    const isToday = (d.getFullYear() === todayYear && d.getMonth() === todayMonth && d.getDate() === todayDate);
    const cls = isToday ? ' ov-cal-cell--today' : '';
    const amountStr = dailyMap[key] !== undefined && dailyMap[key] > 0 ? `¥${fmtK(amount)}` : '-';
    const dayLabel = isToday ? '今天' : d.getDate();
    return `<div class="ov-cal-cell${cls}">
      <span class="ov-cal-day">${dayLabel}</span>
      <span class="ov-cal-amount">${amountStr}</span>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════
//  8. CATEGORY BREAKDOWN
// ═══════════════════════════════════════════════════════
function _renderCategories(txs) {
  const catMap = catTotals(txs, _type === 'expense' ? '支出' : '收入');
  const sorted = Object.entries(catMap)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  const container = document.getElementById('ovCatBreakdown');
  if (!container) return;

  if (!sorted.length) {
    container.innerHTML = '<div style="font-size:12px;color:var(--color-label-4);padding:8px 0;text-align:center">暂无数据</div>';
    const summary = document.getElementById('ovCatSummary');
    if (summary) summary.textContent = '暂无数据';
    return;
  }

  const total = sorted.reduce((s, [, v]) => s + v, 0);
  const colors = palette();
  const topCat = sorted[0][0];
  const summary = document.getElementById('ovCatSummary');
  if (summary) summary.innerHTML = `<b>${esc(topCat)}</b>分类消费占比最高`;

  _catDetailData = {};
  sorted.forEach(([name, val]) => {
    _catDetailData[name] = {
      transactions: txs.filter(tx => tx.category === name && tx.type === (_type === 'expense' ? '支出' : '收入')),
      total: val,
      pct: total > 0 ? ((val / total) * 100).toFixed(1) : 0,
    };
  });

  container.innerHTML = sorted.map(([name, val], i) => {
    const pct = total > 0 ? (val / total) * 100 : 0;
    const color = colors[i % colors.length];
    const icon = getCatIcon(name);
    const pctStr = pct.toFixed(1) + '%';
    return `<div class="ov-cat-row" data-cat-name="${esc(name)}">
      <div class="ov-cat-icon" style="background:${color}22;color:${color}">${icon}</div>
      <div class="ov-cat-info">
        <div class="ov-cat-name">${esc(name)}</div>
        <div class="ov-cat-bar-track">
          <div class="ov-cat-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>
      <div class="ov-cat-right">
        <div class="ov-cat-amount">¥${fmt(val)}</div>
        <div class="ov-cat-pct">${pctStr}</div>
      </div>
    </div>`;
  }).join('');

  container.querySelectorAll('.ov-cat-row').forEach(row => {
    row.addEventListener('click', () => _openCatDetail(row.dataset.catName));
  });
}

// ═══════════════════════════════════════════════════════
//  9. CATEGORY DETAIL SHEET
// ═══════════════════════════════════════════════════════
function _openCatDetail(catName) {
  const data = _catDetailData[catName];
  if (!data) return;

  const overlay = document.getElementById('catDetailOverlay');
  const titleEl = document.getElementById('catDetailTitle');
  if (!overlay || !titleEl) return;

  titleEl.textContent = `${catName} · ¥${fmt(data.total)} (${data.pct}%)`;
  _catDetailSort = 'time';
  document.querySelectorAll('#catDetailSortSeg .seg-pill').forEach(b => {
    b.classList.toggle('active', b.dataset.sort === 'time');
  });

  _renderCatDetail();
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function _closeCatDetail() {
  const overlay = document.getElementById('catDetailOverlay');
  if (overlay) overlay.classList.remove('open');
  document.body.style.overflow = '';
}

function _renderCatDetail() {
  const catName = (document.getElementById('catDetailTitle')?.textContent || '').split(' · ')[0];
  const data = _catDetailData[catName];
  const listEl = document.getElementById('catDetailList');
  if (!listEl || !data) return;

  let txs = [...data.transactions];
  switch (_catDetailSort) {
    case 'amount-desc': txs.sort((a, b) => b.amount - a.amount); break;
    case 'amount-asc':  txs.sort((a, b) => a.amount - b.amount);  break;
    default:            txs.sort((a, b) => new Date(b.date) - new Date(a.date)); break;
  }

  if (!txs.length) {
    listEl.innerHTML = '<div style="text-align:center;padding:24px;color:var(--color-label-4);font-size:13px">暂无记录</div>';
    return;
  }

  listEl.innerHTML = txs.map(tx => {
    const isGain = tx.type === '收入';
    const color = isGain ? 'var(--color-green)' : 'var(--color-orange)';
    const icon = getCatIcon(tx.category);
    const timeDisplay = formatTxDateTime(tx.date);
    const amountCls = isGain ? 'income' : 'expense';
    return `<div class="cat-detail-row">
      <div class="cat-detail-icon" style="background:${color}18;color:${color}">${icon}</div>
      <div class="cat-detail-info">
        <div class="cat-detail-note">${esc(tx.category)}${tx.note ? ' · ' + esc(tx.note) : ''}</div>
        <div class="cat-detail-date">${timeDisplay}</div>
      </div>
      <div class="cat-detail-amount ${amountCls}">¥${fmt(Math.abs(tx.amount))}</div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════
//  10. RECENT TRANSACTIONS
// ═══════════════════════════════════════════════════════
function _renderRecent(txs) {
  const el = document.getElementById('recentTxList');
  if (!el) return;
  const recent = [...txs].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);
  el.innerHTML = recent.length
    ? recent.map(_txRowHtml).join('')
    : '<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-text">还没有交易记录<br>点击右下角「＋」开始记录</div></div>';

  el.querySelectorAll('[data-tx-id]').forEach(row => {
    row.addEventListener('click', () => {
      import('./transactions.js').then(m => m.openTxDetail(row.dataset.txId));
    });
  });
}

function _txRowHtml(tx) {
  const isGain = tx.type === '收入';
  const sign = isGain ? '+' : '−';
  const cls = isGain ? 'income' : '';
  const bg = isGain
    ? 'linear-gradient(135deg,rgba(52,199,89,.16),rgba(0,199,190,.16))'
    : 'linear-gradient(135deg,rgba(0,122,255,.14),rgba(175,82,222,.14))';
  const icon = getCatIcon(tx.category);
  return `<div class="tx-row" data-tx-id="${tx.id}">
    <div class="tx-icon" style="background:${bg}">${icon}</div>
    <div class="tx-info">
      <div class="tx-name">${esc(tx.category)}${tx.note ? ' · ' + esc(tx.note) : ''}</div>
      <div class="tx-meta">${formatTxDateTime(tx.date)}</div>
    </div>
    <div class="tx-amount ${cls}">${sign}¥${fmt(Math.abs(tx.amount))}</div>
  </div>`;
}
