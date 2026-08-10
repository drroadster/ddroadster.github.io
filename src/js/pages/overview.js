// ═══════════════════════════════════════════════════════
//  ROADSTER v3.0 · pages/overview.js
//  Monthly Analysis Page — iOS-style minimal design
//  Features: period tabs, expense/income toggle, bar chart,
//  calendar grid, category breakdown, bottom nav
// ═══════════════════════════════════════════════════════

import { getTransactions, filterByPeriod, summarise, catTotals } from '../store.js';
import { buildVertBar, cssVar, hexToRgba, palette } from '../charts.js';
import { fmt, fmtK, esc, formatTxDateTime, pad2 } from '../utils.js';
import { onNavigate } from '../router.js';
import { getCatIcon } from '../config.js';

// ── State ──────────────────────────────────────────────
let _period = 'month';          // 'week' | 'month' | 'year'
let _type = 'expense';          // 'expense' | 'income'
let _selectedYear = new Date().getFullYear();
let _selectedMonth = new Date().getMonth() + 1; // 1-12
let _catDetailData = {};
let _catDetailSort = 'time';

// ── Public init ────────────────────────────────────────
export function initOverviewPage() {
  _wireControls();
  onNavigate(page => { if (page === 'overview') render(); });
}

/** Re-render. */
export function render() {
  const all = getTransactions();
  const txs = _getFilteredTxs(all);

  _renderHero(txs);
  _renderBarChart(all);
  _renderCalendar(all);
  _renderCategories(txs);
  _renderRecent(txs);
}

// ── Filter transactions by current state ───────────────
function _getFilteredTxs(all) {
  return all.filter(tx => {
    if (tx.deleted) return false;
    const d = new Date(tx.date);
    if (tx.type !== (_type === 'expense' ? '支出' : '收入')) return false;
    if (_period === 'month')
      return d.getFullYear() === _selectedYear && (d.getMonth() + 1) === _selectedMonth;
    if (_period === 'week') {
      const now = new Date();
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 7);
      return d >= startOfWeek && d < endOfWeek;
    }
    if (_period === 'year')
      return d.getFullYear() === _selectedYear;
    return false;
  });
}

// ── Controls wiring ────────────────────────────────────
function _wireControls() {
  // Period tabs
  document.querySelectorAll('#ovPeriodTabs .ov-period-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _period = btn.dataset.period;
      document.querySelectorAll('#ovPeriodTabs .ov-period-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _syncMonthSelectorVisibility();
      render();
    });
  });

  // Type toggle
  document.querySelectorAll('#ovTypeToggle .ov-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _type = btn.dataset.type;
      document.querySelectorAll('#ovTypeToggle .ov-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      render();
    });
  });

  // Month picker
  const monthPicker = document.getElementById('ovMonthPicker');
  if (monthPicker) {
    monthPicker.addEventListener('change', () => {
      const [y, m] = monthPicker.value.split('-').map(Number);
      _selectedYear = y;
      _selectedMonth = m;
      render();
    });
  }

  // Calendar toggle
  const calToggle = document.getElementById('ovCalToggle');
  if (calToggle) {
    calToggle.addEventListener('click', () => {
      const grid = document.getElementById('ovCalGrid');
      const toggle = document.getElementById('ovCalToggle');
      if (!grid || !toggle) return;
      const expanded = grid.classList.toggle('expanded');
      toggle.innerHTML = expanded ? '收起全部 ∧' : '展开全部 ∨';
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
}

function _syncMonthSelectorVisibility() {
  const selector = document.getElementById('ovMonthSelector');
  if (!selector) return;
  selector.style.display = (_period === 'week') ? 'none' : '';
  if (_period === 'month') _buildMonthDropdown();
  if (_period === 'year') _buildYearDropdown();
}

function _buildMonthDropdown() {
  const sel = document.getElementById('ovMonthPicker');
  if (!sel) return;
  const now = new Date();
  const cy = now.getFullYear(), cm = now.getMonth() + 1;
  let html = '';
  for (let y = cy - 2; y <= cy; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === cy && m > cm) continue;
      const val = `${y}-${pad2(m)}`;
      const label = `${y}年${m}月`;
      const selected = (y === _selectedYear && m === _selectedMonth) ? ' selected' : '';
      html += `<option value="${val}"${selected}>${label}</option>`;
    }
  }
  sel.innerHTML = html;
}

function _buildYearDropdown() {
  const sel = document.getElementById('ovMonthPicker');
  if (!sel) return;
  const cy = new Date().getFullYear();
  let html = '';
  for (let y = cy - 3; y <= cy; y++) {
    const selected = (y === _selectedYear) ? ' selected' : '';
    html += `<option value="${y}-01"${selected}>${y}年</option>`;
  }
  sel.innerHTML = html;
}

// ── Hero / summary line ────────────────────────────────
function _renderHero(txs) {
  const total = txs.reduce((s, tx) => s + tx.amount, 0);
  const el = document.getElementById('ovMonthTotal');
  const lbl = document.getElementById('ovMonthLabel');
  if (el) el.textContent = `¥${fmt(total)}`;
  if (lbl) {
    const typeLabel = _type === 'expense' ? '总支出' : '总收入';
    if (_period === 'month') {
      lbl.textContent = `${_selectedYear}年${_selectedMonth}月${typeLabel}`;
    } else if (_period === 'week') {
      lbl.textContent = `本周${typeLabel}`;
    } else {
      lbl.textContent = `${_selectedYear}年${typeLabel}`;
    }
  }
}

// ── Bar Chart (monthly summary) ────────────────────────
function _renderBarChart(all) {
  const canvas = document.getElementById('ovBarChart');
  const emptyEl = document.getElementById('ovBarEmpty');
  if (!canvas) return;

  const activeTxs = all.filter(tx => !tx.deleted && tx.type === (_type === 'expense' ? '支出' : '收入'));

  if (!activeTxs.length) {
    canvas.style.display = 'none';
    if (emptyEl) emptyEl.style.display = '';
    return;
  }
  canvas.style.display = '';
  if (emptyEl) emptyEl.style.display = 'none';

  // Group by month for the last N months based on period context
  let monthsToShow = 5;
  if (_period === 'year') monthsToShow = 12;

  // Build month buckets for the selected year (or recent months)
  const now = new Date();
  const refYear = _period === 'year' ? _selectedYear : now.getFullYear();
  const refMonth = _period === 'year' ? 12 : now.getMonth() + 1;

  const monthBuckets = [];
  for (let i = monthsToShow - 1; i >= 0; i--) {
    let m = refMonth - i;
    let y = refYear;
    while (m <= 0) { m += 12; y--; }
    monthBuckets.push({ year: y, month: m, total: 0 });
  }

  activeTxs.forEach(tx => {
    const d = new Date(tx.date);
    const bucket = monthBuckets.find(b => b.year === d.getFullYear() && b.month === (d.getMonth() + 1));
    if (bucket) bucket.total += tx.amount;
  });

  const labels = monthBuckets.map(b => `${b.month}月`);
  const data = monthBuckets.map(b => b.total);
  const avg = data.reduce((s, v) => s + v, 0) / (data.filter(v => v > 0).length || 1);
  const barColor = _type === 'expense' ? '#A0C4F0' : '#A0E8C8';
  const colors = data.map(() => barColor);

  // Set avg reference line via annotation or just show as text
  document.getElementById('ovAvgLine').textContent = `月${_type === 'expense' ? '支出' : '收入'}均值 ¥${fmt(avg)}`;

  buildVertBar('ovBarChart', labels, data, colors);
}

// ── Calendar Grid ──────────────────────────────────────
function _renderCalendar(all) {
  const grid = document.getElementById('ovCalGrid');
  if (!grid) return;

  let year = _selectedYear, month = _selectedMonth;
  if (_period === 'week') {
    const now = new Date();
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }

  const txs = all.filter(tx => {
    if (tx.deleted) return false;
    if (tx.type !== (_type === 'expense' ? '支出' : '收入')) return false;
    const d = new Date(tx.date);
    return d.getFullYear() === year && (d.getMonth() + 1) === month;
  });

  // Build daily totals
  const dailyMap = {};
  txs.forEach(tx => {
    const d = new Date(tx.date);
    const day = d.getDate();
    dailyMap[day] = (dailyMap[day] || 0) + tx.amount;
  });

  // Calendar construction
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  const totalDays = lastDay.getDate();
  const startDow = firstDay.getDay(); // 0=Sunday

  const today = new Date();
  const isCurrentMonth = (today.getFullYear() === year && today.getMonth() === month - 1);
  const todayDate = today.getDate();

  let cells = '';
  // Empty cells before first day
  for (let i = 0; i < startDow; i++) {
    cells += '<div class="ov-cal-cell ov-cal-cell--empty"></div>';
  }
  // Day cells
  for (let d = 1; d <= totalDays; d++) {
    const amount = dailyMap[d] || 0;
    const isToday = isCurrentMonth && d === todayDate;
    const cls = isToday ? ' ov-cal-cell--today' : '';
    const amountStr = dailyMap[d] !== undefined ? `¥${fmtK(amount)}` : '-';
    const dayLabel = isToday ? '今天' : d;
    cells += `<div class="ov-cal-cell${cls}">
      <span class="ov-cal-day">${dayLabel}</span>
      <span class="ov-cal-amount">${amountStr}</span>
    </div>`;
  }

  grid.innerHTML = cells;
}

// ── Category Breakdown ─────────────────────────────────
function _renderCategories(txs) {
  const catMap = catTotals(txs, _type === 'expense' ? '支出' : '收入');
  const sorted = Object.entries(catMap)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  const container = document.getElementById('ovCatBreakdown');
  if (!container) return;

  if (!sorted.length) {
    container.innerHTML = '<div style="font-size:12px;color:var(--color-label-4);padding:8px 0;text-align:center">暂无数据</div>';
    return;
  }

  const total = sorted.reduce((s, [, v]) => s + v, 0);
  const colors = palette();

  // Find top category and most changed
  const topCat = sorted[0][0];
  // For "most changed" we'd need last month data, approximate with a note
  const summaryText = `<b>${topCat}</b>分类消费占比最高`;

  document.getElementById('ovCatSummary').innerHTML = summaryText;

  // Store data for detail
  _catDetailData = {};
  sorted.forEach(([name, val]) => {
    _catDetailData[name] = {
      transactions: txs.filter(tx => tx.category === name && tx.type === (_type === 'expense' ? '支出' : '收入')),
      total: val,
      pct: total > 0 ? ((val / total) * 100).toFixed(1) : 0,
    };
  });

  // Render progress bars
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

  // Wire click handlers
  container.querySelectorAll('.ov-cat-row').forEach(row => {
    row.addEventListener('click', () => _openCatDetail(row.dataset.catName));
  });
}

// ── Category Detail Sheet ─────────────────────────────
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

// ── Recent transactions ────────────────────────────────
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
