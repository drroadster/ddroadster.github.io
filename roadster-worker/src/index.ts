/**
 * Roadster Finance API · Cloudflare Worker
 *
 * 零浏览器记账方案：
 * iOS 快捷指令 → 向 Worker 发 HTTP 请求 → KV 读写 → 返回 JSON
 *
 * 端点：
 *   POST   /api/tx        创建交易
 *   GET    /api/tx        查询交易清单 ?period=month&y=2026&m=7
 *   GET    /api/balance   净结余 & 当月收支
 *   GET    /api/stats     分类汇总
 *   DELETE /api/tx/:id    删除交易
 *
 * 本地开发：npx wrangler dev
 * 部署：    npx wrangler deploy
 */

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

type TxType = "income" | "expense";

interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  category: string;
  note: string;
  date: string; // "2026-07-08"
  timestamp: number; // ms
}

interface AddTxRequest {
  type: TxType;
  amount: number;
  category: string;
  note: string;
  date?: string; // 不传则默认今天
}

// ═══════════════════════════════════════════════
// Environment
// ═══════════════════════════════════════════════

export interface Env {
  ROADSTER_KV: KVNamespace;
}

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function uuid(): string {
  return crypto.randomUUID();
}

function today(): string {
  return new Date().toISOString().slice(0, 10); // "2026-07-08"
}

function ts(): number {
  return Date.now();
}

/** 通过 date 字符串生成月份索引 key，格式 "2026-07" */
function monthKey(date: string): string {
  return date.slice(0, 7);
}

/** 解析 query string 中的 period 参数，返回起始月份 */
function parsePeriod(url: URL): { since: string | null } {
  const period = url.searchParams.get("period");
  const y = url.searchParams.get("y");
  const m = url.searchParams.get("m");

  // 精确月份
  if (y && m) {
    return { since: `${y}-${m.padStart(2, "0")}` };
  }

  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1;

  switch (period) {
    case "quarter": {
      const qm = Math.floor((cm - 1) / 3) * 3 + 1;
      return { since: `${cy}-${String(qm).padStart(2, "0")}` };
    }
    case "year":
      return { since: `${cy}-01` };
    case "all":
      return { since: null };
    case "month":
    default:
      return { since: `${cy}-${String(cm).padStart(2, "0")}` };
  }
}

// ═══════════════════════════════════════════════
// KV Operations
// ═══════════════════════════════════════════════

/** 保存交易：写入 KV + 更新月份索引 */
async function saveTx(env: Env, tx: Transaction): Promise<void> {
  const key = `tx:${tx.id}`;
  const listKey = "tx:list";
  const monthIdx = `tx:month:${monthKey(tx.date)}`;

  // 并行写入：单条记录 + 全量清单 + 月份索引
  await Promise.all([
    env.ROADSTER_KV.put(key, JSON.stringify(tx)),
    appendToList(env, listKey, tx.id),
    appendToList(env, monthIdx, tx.id),
  ]);
}

async function appendToList(env: Env, key: string, item: string): Promise<void> {
  const raw = await env.ROADSTER_KV.get(key);
  const list = raw ? JSON.parse(raw) as string[] : [];
  list.push(item);
  await env.ROADSTER_KV.put(key, JSON.stringify(list));
}

async function removeFromList(env: Env, key: string, item: string): Promise<void> {
  const raw = await env.ROADSTER_KV.get(key);
  if (!raw) return;
  const list = JSON.parse(raw) as string[];
  const filtered = list.filter((i) => i !== item);
  await env.ROADSTER_KV.put(key, JSON.stringify(filtered));
}

/** 按 ID 列表批量读取交易 */
async function getTxsByIds(env: Env, ids: string[]): Promise<Transaction[]> {
  if (ids.length === 0) return [];
  const keys = ids.map((id) => `tx:${id}`);
  const results = await Promise.all(keys.map((k) => env.ROADSTER_KV.get(k)));
  return results
    .filter(Boolean)
    .map((r) => JSON.parse(r!) as Transaction)
    .sort((a, b) => b.timestamp - a.timestamp);
}

/** 读取全量 ID 或指定月份的 ID */
async function getTxIds(env: Env, since: string | null): Promise<string[]> {
  if (since) {
    // 按月份索引取
    const months = monthsSince(since);
    const allIds: string[] = [];
    for (const m of months) {
      const raw = await env.ROADSTER_KV.get(`tx:month:${m}`);
      if (raw) allIds.push(...(JSON.parse(raw) as string[]));
    }
    return allIds;
  }
  const raw = await env.ROADSTER_KV.get("tx:list");
  return raw ? (JSON.parse(raw) as string[]) : [];
}

/** 生成从 since 月份到当前月份的所有月份 key */
function monthsSince(since: string): string[] {
  const result: string[] = [];
  const [sy, sm] = since.split("-").map(Number);
  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1;

  let y = sy;
  let m = sm;
  while (y < cy || (y === cy && m <= cm)) {
    result.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return result;
}

// ═══════════════════════════════════════════════
// Handlers
// ═══════════════════════════════════════════════

/** POST /api/tx — 添加一条交易 */
async function handleAddTx(env: Env, req: Request): Promise<Response> {
  let body: AddTxRequest;
  try {
    body = await req.json() as AddTxRequest;
  } catch {
    return json({ error: "请求体需为 JSON" }, 400);
  }

  // 中英文兼容：收入→income，支出→expense
  const typeMap: Record<string, TxType> = {
    income: "income", expense: "expense",
    "收入": "income", "支出": "expense",
  };
  const normalizedType = typeMap[body.type];
  if (!normalizedType) {
    return json({ error: "type 必须为 income/expense 或 收入/支出" }, 400);
  }
  if (!body.amount || body.amount <= 0) {
    return json({ error: "amount 必须为正数" }, 400);
  }

  const tx: Transaction = {
    id: uuid(),
    type: normalizedType,
    amount: Math.round(body.amount * 100) / 100,
    category: body.category || "未分类",
    note: body.note || "",
    date: body.date || today(),
    timestamp: ts(),
  };

  await saveTx(env, tx);
  return json({ ok: true, tx }, 201);
}

/** GET /api/tx — 查询交易清单 */
async function handleListTx(env: Env, url: URL): Promise<Response> {
  const { since } = parsePeriod(url);
  const ids = await getTxIds(env, since);

  // 分页
  const page = parseInt(url.searchParams.get("page") || "1");
  const size = parseInt(url.searchParams.get("size") || "20");
  const start = (page - 1) * size;
  const pagedIds = ids.slice(start, start + size);

  const txs = await getTxsByIds(env, pagedIds);
  // 计算汇总
  const totalIncome = txs
    .filter((t) => t.type === "income")
    .reduce((s, t) => s + t.amount, 0);
  const totalExpense = txs
    .filter((t) => t.type === "expense")
    .reduce((s, t) => s + t.amount, 0);

  return json({
    total: ids.length,
    page,
    size,
    summary: {
      income: Math.round(totalIncome * 100) / 100,
      expense: Math.round(totalExpense * 100) / 100,
      balance: Math.round((totalIncome - totalExpense) * 100) / 100,
    },
    txs,
  });
}

/** GET /api/balance — 净结余 */
async function handleBalance(env: Env, url: URL): Promise<Response> {
  const { since } = parsePeriod(url);
  const ids = await getTxIds(env, since);
  const txs = await getTxsByIds(env, ids);

  let income = 0;
  let expense = 0;
  for (const t of txs) {
    if (t.type === "income") income += t.amount;
    else expense += t.amount;
  }

  income = Math.round(income * 100) / 100;
  expense = Math.round(expense * 100) / 100;
  const balance = Math.round((income - expense) * 100) / 100;
  const savingRate = income > 0 ? Math.round(((income - expense) / income) * 1000) / 10 : 0;

  return json({
    period: since || "全部",
    income,
    expense,
    balance,
    savingRate,
    txCount: txs.length,
  });
}

/** GET /api/stats — 分类汇总（默认本月） */
async function handleStats(env: Env, url: URL): Promise<Response> {
  const { since } = parsePeriod(url);
  const ids = await getTxIds(env, since);
  const txs = await getTxsByIds(env, ids);

  const incomeMap: Record<string, number> = {};
  const expenseMap: Record<string, number> = {};

  for (const t of txs) {
    const map = t.type === "income" ? incomeMap : expenseMap;
    map[t.category] = (map[t.category] || 0) + t.amount;
  }

  const toList = (map: Record<string, number>) =>
    Object.entries(map)
      .map(([name, amount]) => ({ category: name, amount: Math.round(amount * 100) / 100 }))
      .sort((a, b) => b.amount - a.amount);

  return json({
    period: since || "全部",
    income: toList(incomeMap),
    expense: toList(expenseMap),
  });
}

/** DELETE /api/tx/:id — 删除交易 */
async function handleDeleteTx(
  env: Env,
  id: string,
): Promise<Response> {
  const key = `tx:${id}`;
  const raw = await env.ROADSTER_KV.get(key);
  if (!raw) return json({ error: "交易不存在" }, 404);

  const tx = JSON.parse(raw) as Transaction;
  await Promise.all([
    env.ROADSTER_KV.delete(key),
    removeFromList(env, "tx:list", id),
    removeFromList(env, `tx:month:${monthKey(tx.date)}`, id),
  ]);

  return json({ ok: true, deleted: tx });
}

// ═══════════════════════════════════════════════
// Router
// ═══════════════════════════════════════════════

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    // CORS 预检
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(req.url);
    const path = url.pathname;

    // POST /api/tx
    if (req.method === "POST" && path === "/api/tx") {
      return handleAddTx(env, req);
    }

    // GET /api/tx
    if (req.method === "GET" && path === "/api/tx") {
      return handleListTx(env, url);
    }

    // GET /api/balance
    if (req.method === "GET" && path === "/api/balance") {
      return handleBalance(env, url);
    }

    // GET /api/stats
    if (req.method === "GET" && path === "/api/stats") {
      return handleStats(env, url);
    }

    // DELETE /api/tx/:id
    const deleteMatch = path.match(/^\/api\/tx\/(.+)$/);
    if (req.method === "DELETE" && deleteMatch) {
      return handleDeleteTx(env, deleteMatch[1]);
    }

    return json({ error: "路由不存在", endpoints: ["POST /api/tx", "GET /api/tx", "GET /api/balance", "GET /api/stats", "DELETE /api/tx/:id"] }, 404);
  },
};
