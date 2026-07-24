# 记账明细 · 日卡片模式设计

## 目标
将现有"按月折叠列表"升级为"日卡片网格"，支持快速跨月/跨年浏览。

## 新增视图：day-card（保留原有 list / calendar）

### 导航栏
- 左侧：`<select>` 下拉年份（当前年 ±2 年）
- 右侧：横向滚动月份标签（1月~12月），当前月高亮
- 下方：月度概览行（收入 +¥xxx | 支出 -¥xxx | 结余 ±¥xxx）

### 日卡片网格
- 桌面 3 列（`grid-template-columns: repeat(3, 1fr)`）
- 手机 2 列
- 无记录日：灰色弱化占位（日期 + "无记录"）
- 有记录日：日期、星期、净额（绿/红）、彩色圆点（绿=收入, 红=支出）

### 展开交互
- 点击卡片 → `grid-column: 1/-1` 占满整行展开
- 展开区显示当日全部交易明细（复用 _rowHtml）
- 再次点击 → 收起回原位
- 同一时间只有一个展开卡片
- 进入页面时，有记录的最新日期自动展开

### 搜索/筛选
- 搜索或筛选时退回平铺列表模式（同现有逻辑）

## 改动文件
- `src/js/pages/transactions.js`：新增 day-card 渲染逻辑 + 状态管理
- `src/css/components.css`：新增日卡片样式
- `src/roadster.html`：视图切换按钮新增 "日卡片" 选项（如需要）

## 状态变量
- `_currentView`: 'list' | 'calendar' | 'daycard'
- `_daycardYear` / `_daycardMonth`：当前选中的年月
- `_expandedDay`：当前展开的日期 key (YYYY-MM-DD) 或 null
