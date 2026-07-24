# Roadster v2.3 — 实时同步架构设计

## 概述

从 v2.2 手动上传模式迁移到 Firestore onSnapshot 实时双向同步。
Store 保持单一面门，底层数据源根据登录状态自动切换。

## 1. 数据模型

移除 `origin` / `syncStatus` 字段，记录结构：

| 字段        | 说明                                  |
|-------------|---------------------------------------|
| `id`        | 唯一标识                              |
| `amount`    | 金额                                  |
| `category`  | 分类                                  |
| `note`      | 备注                                  |
| `date`      | 日期                                  |
| `type`      | 类型（income/expense）                |
| `createdAt` | 创建时间                              |
| `updatedAt` | 更新时间（冲突检测用，最后写入胜出）   |
| `deviceId`  | 创建设备                              |
| `version`   | 版本号                                |

localStorage 键改名：

| 旧键                   | 新键               | 用途               |
|------------------------|--------------------|--------------------|
| `rdstr_tx` + `rdstr_assets` | `rdstr_drafts` | 未上传的本地草稿    |

## 2. 模块职责

```
┌─────────────┐   add/delete/update   ┌──────────────┐
│   Pages/UI  │ ───────────────────────▶   store.js   │
└─────────────┘                        └──────┬───────┘
                                              │
                                     ┌────▼──────┐
                                     │ syncManager│
                                     │ (底层适配器) │
                                     └────┬──────┘
                                          │
                                   ┌──────▼───────┐
                                   │   Firestore   │
                                   │ (logged in)   │
                                   └──────────────┘
                          OR
                                   ┌──────────────┐
                                   │ localStorage  │
                                   │ (logged out)  │
                                   └──────────────┘
```

### 2.1 store.js

**现存能力（保持）：**
- `getAllTransactions()` / `getAllAssets()`
- `subscribe()` 事件订阅机制
- 与 Pages 的所有现有接口
- CRUD 操作（addTx、deleteTx、updateTx 等）

**新增职责：**
- 内部持有 `_isLoggedIn` 标记
- `addTx / deleteTx / updateTx` 内部路由：
  - 已登录 → 调用 syncManager.writeToFirestore(id, data)
  - 未登录 → 读写 `rdstr_drafts`（localStorage）
- 登录时注册 syncManager.onDataUpdate(cb) 接收 onSnapshot 推送，更新内存并 emit
- 退出时清空内存中 Firestore 数据，从 `rdstr_drafts` 恢复

### 2.2 syncManager.js

**职责收缩为底层适配器：**

- `initSyncListeners(uid, cb)` —— 启动 onSnapshot 监听用户文档，每次推送调用 cb(records)
- `stopSyncListeners()` —— 停止监听
- `writeToFirestore(uid, id, data)` —— 直接写 Firestore（setDoc / deleteDoc）
- `uploadDrafts(uid, drafts)` —— 上传草稿到 Firestore，检测重复（note+date+amount 三元组 SHA1），返回 { uploaded, duplicates }
- `deleteFirestoreRecord(uid, id)` —— 从 Firestore 删除单条记录

### 2.3 main.js

**简化 onAuthChange 回调：**

```js
onAuthChange(async (user) => {
  if (user && !_hasLoggedInOnce) {
    _hasLoggedInOnce = true;
    const drafts = store.getDrafts();  // 检查草稿
    if (drafts.length > 0) {
      // 弹窗：发现 N 条本地记录，是否上传？
      // 用户确认 → syncManager.uploadDrafts(uid, drafts)
      // 用户拒绝 → 丢弃草稿，仅显示云端
    }
    // 启动 onSnapshot
    syncManager.initSyncListeners(user.uid, (records) => {
      store.replaceFromCloud(records); // 替换内存 + emit
    });
  }
  if (!user && _hasLoggedInOnce) {
    _hasLoggedInOnce = false;
    syncManager.stopSyncListeners(); // 停止监听
    store.switchToLocalMode();       // 清空云端数据，加载草稿
  }
});
```

## 3. 核心流程

### 3.1 未登录
- store 读写 `rdstr_drafts`
- UI 标签 → "本地"

### 3.2 登录
1. 检查 `rdstr_drafts` → 有则弹窗询问上传
2. 启动 onSnapshot（监听 `/users/{uid}/transactions` 集合）
3. onSnapshot 首次返回全量数据，后续增量推送
4. store 内存替换为云端数据 + emit → UI 重渲染
5. 所有写入走 Firestore

### 3.3 上传草稿
- 逐条对比 `note + date + amount`（SHA1）
- 匹配 → 加入 duplicates 列表
- 不匹配 → 直接写入 Firestore
- 处理完弹窗：上传 N 条，发现 M 条重复
  - 重复记录逐一询问：覆盖云端 / 保留两者

### 3.4 退出登录
1. 停止 onSnapshot
2. 清空 store 内存（云端数据）
3. 恢复 `rdstr_drafts`
4. 标签恢复"本地"

### 3.5 跨设备实时同步
- onSnapshot 增量推送后直接替换 store 内存
- 当前页面正查看的记录若被推送更新，emit 后自动重渲染
- 编辑冲突：最后写入胜出（Firestore 默认行为）

### 3.6 删除记录
- 已登录 + 是云端记录 → deleteDoc Firestore → onSnapshot 推送自动移除
- 未登录 + 是草稿 → 从 `rdstr_drafts` 移除

## 4. 文件变更清单

| 文件 | 变更幅度 | 说明 |
|------|---------|------|
| `src/js/store.js` | 大幅改动 (~+120/-60) | 新增 Firestore 适配层、登录态路由、草稿隔离机制 |
| `src/js/sync/syncManager.js` | 重写 (~+200/-280) | 从手动上传改为 onSnapshot 生命周期管理 + 草稿上传 |
| `src/js/main.js` | 中等修改 (~+50/-60) | onAuthChange 回调精简，移除手动同步 UI 逻辑 |
| `src/js/db.js` | 可能移除 | 如果 v2.0 db.js 不再需要，合并功能或删除 |
| `src/index.html` | 小改 | 移除手动同步按钮相关 DOM（如有） |

## 5. 错误处理

- onSnapshot listener 断开 → 静默重连（Firebase SDK 内置），中断超过 30 秒 → showToast('网络连接异常')
- Firestore 写入失败 → showToast('保存失败，请重试')，若离线则暂存到队列（简单起见暂不实现离线队列 v1）
- 上传草稿中途停止 → 弹窗"已上传 X 条，剩余 Y 条未上传"（不会丢失草稿，仍在 rdstr_drafts 中，下次登录可重新触发）

## 6. 未纳入（YAGNI）

- 离线写队列（v1 仅限在线场景，离线时不可写入云端）
- 增量同步/差异对比（onSnapshot 天然增量）
- 多设备编辑冲突自动合并（最后写入胜出）
