# Roadster Worker · Cloudflare 零浏览器记账 API

## 部署（约 3 分钟）

```bash
cd roadster-worker
npm install

# 创建 KV 命名空间
npx wrangler kv:namespace create ROADSTER_KV
# 创建预览 KV 命名空间
npx wrangler kv:namespace create ROADSTER_KV --preview

# 把输出的 id 和 preview_id 填进 wrangler.toml

npx wrangler deploy
```

部署后会得到一个域名，例如 `https://roadster.your-subdomain.workers.dev`，以下记作 `<WORKER_URL>`。

---

## API 端点

### POST `/api/tx` — 创建交易

```bash
curl -X POST <WORKER_URL>/api/tx \
  -H "Content-Type: application/json" \
  -d '{"type":"expense","amount":328.50,"category":"购物","note":"盒马周末采购"}'
```

响应：
```json
{"ok":true,"tx":{"id":"a1b2c3...","type":"expense","amount":328.5,"category":"购物","note":"盒马周末采购","date":"2026-07-08","timestamp":1751990400000}}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| type | ✅ | `income` / `expense` |
| amount | ✅ | 金额（正数） |
| category | ✅ | 分类名称 |
| note | | 备注 |
| date | | 日期 `"YYYY-MM-DD"`，默认今天 |

---

### GET `/api/tx` — 查询交易清单

```
GET /api/tx?period=month&y=2026&m=7&page=1&size=20
```

| 参数 | 说明 |
|------|------|
| period | `month` / `quarter` / `year` / `all` |
| y, m | 精确指定年月（优先级高于 period） |
| page | 页码，默认 1 |
| size | 每页条数，默认 20 |

---

### GET `/api/balance` — 净结余 & 收支

```
GET /api/balance?period=month
```

响应：
```json
{
  "period": "2026-07",
  "income": 32150,
  "expense": 13729.50,
  "balance": 18420.50,
  "savingRate": 57.3,
  "txCount": 42
}
```

---

### GET `/api/stats` — 分类汇总

```
GET /api/stats?period=month
```

响应：
```json
{
  "period": "2026-07",
  "expense": [
    {"category": "餐饮", "amount": 4805.50},
    {"category": "交通", "amount": 2746},
    {"category": "购物", "amount": 2059}
  ],
  "income": [
    {"category": "工资", "amount": 28500},
    {"category": "副业", "amount": 3650}
  ]
}
```

---

### DELETE `/api/tx/:id` — 删除交易

```bash
curl -X DELETE <WORKER_URL>/api/tx/a1b2c3d4-...
```

---

## iOS 快捷指令集成

### 记一笔 · 快捷指令

1. 新建快捷指令，名称「记一笔」
2. 添加操作「要求输入」→ 类型「数字」→ 提示「金额」
3. 添加操作「从菜单中选取」→ 选项：「收入」「支出」
4. 添加操作「要求输入」→ 提示「分类（餐饮/交通/购物...）」
5. 添加操作「要求输入」→ 提示「备注」
6. 添加操作「获取 URL 内容」：
   - URL：`<WORKER_URL>/api/tx`
   - 方法：POST
   - 头部：`Content-Type: application/json`
   - 请求体 JSON：
   ```
   {"type":"<菜单结果>","amount":<上一步输入>,"category":"<分类输入>","note":"<备注输入>"}
   ```

### 今日概览 · 快捷指令

1. 新建快捷指令，名称「财务概览」
2. 添加操作「获取 URL 内容」→ URL：`<WORKER_URL>/api/balance?period=month`
3. 添加操作「获取词典值」取出 `balance`、`income`、`expense`、`savingRate`
4. 添加操作「显示结果」→ 格式化展示

---

## 数据模型

```
KV Key                → Value
─────────────────────────────────────────
tx:{uuid}             → Transaction JSON
tx:list               → ["uuid1", "uuid2", ...]  全量索引
tx:month:2026-07      → ["uuid1", ...]            月份索引
```

---

## 后续可扩展

- [ ] D1 数据库替代 KV（适合大量数据 + 复杂查询）
- [ ] 预算管理 `/api/budget`
- [ ] 周期性交易模板
- [ ] 导出 CSV
