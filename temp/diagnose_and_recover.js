/**
 * Roadster 资产诊断与恢复脚本
 * 在浏览器 DevTools Console 中运行
 * 
 * 使用方法：
 * 1. 打开浏览器，按 F12 打开开发者工具
 * 2. 切换到 Console 标签
 * 3. 复制此脚本全部内容，粘贴到 Console 中，按 Enter 执行
 */

(function() {
  const LS_KEYS = [
    'rdstr_assets',         // 旧格式（v2.3 迁移前）
    'rdstr_asset_drafts',   // 当前资产草稿
    'rdstr_asset_history',  // 历史快照
    'rdstr_migrated_v23',   // 迁移标记
    'rdstr_drafts',         // 交易草稿
    'roadster_assets',      // 另一个可能存在的 key
  ];

  console.log('='.repeat(60));
  console.log('🔍 Roadster 资产诊断报告');
  console.log('='.repeat(60));

  // ── 1. 扫描所有 localStorage key ──
  console.log('\n📋 第一步：扫描 localStorage 中所有资产相关 key');
  
  const results = {};
  for (const key of LS_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw === null) {
      results[key] = { exists: false };
      console.log(`  ❌ ${key}: 不存在`);
    } else {
      try {
        const parsed = JSON.parse(raw);
        const len = Array.isArray(parsed) ? parsed.length : 
                    (typeof parsed === 'object' ? Object.keys(parsed).length : 'scalar');
        results[key] = { exists: true, raw, parsed, type: typeof parsed, size: raw.length };
        console.log(`  ✅ ${key}: 存在 (${raw.length} bytes, ${Array.isArray(parsed) ? parsed.length + ' items' : typeof parsed})`);
      } catch (e) {
        results[key] = { exists: true, raw, parsed: null, error: e.message };
        console.log(`  ⚠️ ${key}: 存在但解析失败 - ${e.message}, 原始值: ${raw.substring(0, 100)}`);
      }
    }
  }

  // ── 2. 分析 rdstr_asset_drafts ──
  console.log('\n📋 第二步：分析 rdstr_asset_drafts 当前数据');
  
  const drafts = results['rdstr_asset_drafts'];
  if (drafts && drafts.exists && drafts.parsed && Array.isArray(drafts.parsed)) {
    const assets = drafts.parsed;
    console.log(`  总资产数: ${assets.length}`);
    
    const normal = assets.filter(a => !a.deleted && a.name && a.name.length > 0);
    const deleted = assets.filter(a => a.deleted);
    const noName = assets.filter(a => !a.deleted && (!a.name || a.name.length === 0));
    
    console.log(`  有效资产: ${normal.length}`);
    console.log(`  已删除: ${deleted.length}`);
    console.log(`  无名称: ${noName.length}`);
    
    if (normal.length > 0) {
      console.log('\n  正常资产列表:');
      console.table(normal.map(a => ({
        id: a.id,
        name: a.name,
        category: a.category || '-',
        value: a.value,
        date: (a.date || a.createdAt || '').slice(0, 10)
      })));
    }
    
    if (noName.length > 0) {
      console.log('\n  ⚠️ 无名称资产（可能是异常数据）:');
      console.table(noName.map(a => ({ id: a.id, name: a.name, value: a.value })));
    }
    
    // 检查异常 ID
    const abnormalIds = assets.filter(a => {
      if (a.id && a.id.includes('.')) return true;
      if (a.id && /^ast-/.test(a.id) && a.id.includes('-', 4)) return true;
      return false;
    });
    if (abnormalIds.length > 0) {
      console.log('\n  🔴 检测到异常 ID 资产:');
      console.table(abnormalIds.map(a => ({ id: a.id, name: a.name, value: a.value })));
    }
  } else {
    console.log('  ❌ rdstr_asset_drafts 为空或格式异常');
    if (drafts && drafts.raw) {
      console.log(`  原始数据前200字符: ${drafts.raw.substring(0, 200)}`);
    }
  }

  // ── 3. 分析历史快照 ──
  console.log('\n📋 第三步：分析 rdstr_asset_history 历史快照');
  
  const history = results['rdstr_asset_history'];
  if (history && history.exists && history.parsed && Array.isArray(history.parsed)) {
    const snaps = history.parsed;
    console.log(`  快照总数: ${snaps.length}`);
    
    if (snaps.length > 0) {
      // 显示最近 5 条快照
      const recent = snaps.slice(-5);
      console.log('\n  最近快照:');
      recent.forEach((s, i) => {
        const ts = s.ts || s.date || 'unknown';
        const total = s.total || 0;
        const bdType = typeof s.breakdown;
        const bdSize = bdType === 'object' ? Object.keys(s.breakdown || {}).length : 
                       (Array.isArray(s.breakdown) ? s.breakdown.length : 'N/A');
        console.log(`    [${i}] ${ts} | total: ${total} | breakdown: ${bdType} (${bdSize} entries)`);
      });

      // 分析最新快照的 breakdown 结构
      const latest = snaps[snaps.length - 1];
      console.log('\n  最新快照 breakdown 详情:');
      console.log('  ts:', latest.ts || latest.date);
      console.log('  total:', latest.total);
      console.log('  breakdown type:', typeof latest.breakdown);
      
      if (latest.breakdown && typeof latest.breakdown === 'object') {
        const entries = Object.entries(latest.breakdown);
        console.log(`  breakdown 条目数: ${entries.length}`);
        if (entries.length > 0) {
          console.log('  前5条:');
          entries.slice(0, 5).forEach(([id, val]) => {
            console.log(`    ${id}: ${val}`);
          });
        }
      }
      
      // 检查是否有 name/category 信息在快照中
      console.log('\n  快照顶层字段:', Object.keys(latest).join(', '));
    }
  } else {
    console.log('  ❌ rdstr_asset_history 为空或不存在');
  }

  // ── 4. 检查旧格式 rdstr_assets ──
  console.log('\n📋 第四步：检查旧格式 rdstr_assets');
  
  const oldAssets = results['rdstr_assets'];
  if (oldAssets && oldAssets.exists && oldAssets.parsed && Array.isArray(oldAssets.parsed)) {
    console.log(`  ✅ 旧格式数据仍存在！${oldAssets.parsed.length} 条资产`);
    console.log('  字段样例:', oldAssets.parsed.length > 0 ? Object.keys(oldAssets.parsed[0]).join(', ') : 'N/A');
    if (oldAssets.parsed.length > 0) {
      console.table(oldAssets.parsed.slice(0, 10).map(a => ({
        id: a.id, name: a.name, category: a.category, value: a.value
      })));
    }
  } else {
    console.log('  ❌ 旧格式数据已不存在（可能已被迁移并删除）');
  }

  // ── 5. 迁移状态 ──
  console.log('\n📋 第五步：迁移标记状态');
  const migratedV23 = results['rdstr_migrated_v23'];
  console.log(`  MIGRATED_V23: ${migratedV23.exists ? '已设置 (值=' + migratedV23.raw + ')' : '未设置'}`);

  // ── 总结 ──
  console.log('\n' + '='.repeat(60));
  console.log('📊 诊断总结');
  console.log('='.repeat(60));

  const hasOldAssets = results['rdstr_assets'] && results['rdstr_assets'].exists && 
                       results['rdstr_assets'].parsed && Array.isArray(results['rdstr_assets'].parsed) && 
                       results['rdstr_assets'].parsed.length > 0;
  const hasDrafts = results['rdstr_asset_drafts'] && results['rdstr_asset_drafts'].exists &&
                    results['rdstr_asset_drafts'].parsed && Array.isArray(results['rdstr_asset_drafts'].parsed) &&
                    results['rdstr_asset_drafts'].parsed.filter(a => !a.deleted && a.name).length > 0;
  const hasHistory = results['rdstr_asset_history'] && results['rdstr_asset_history'].exists &&
                     results['rdstr_asset_history'].parsed && Array.isArray(results['rdstr_asset_history'].parsed) &&
                     results['rdstr_asset_history'].parsed.length > 0;

  if (hasDrafts) {
    console.log('✅ 当前 rdstr_asset_drafts 中有正常资产数据，无需恢复');
    console.log('   如果页面显示异常，请硬刷新浏览器（Ctrl+Shift+R）');
  } else if (hasOldAssets) {
    console.log('✅ 旧格式 rdstr_assets 仍存在，可以从中恢复');
    console.log('   运行 recoverFromOldFormat() 即可恢复');
  } else if (hasHistory) {
    console.log('⚠️ 仅有历史快照可用，可恢复资产 ID 和金额，但无法恢复名称和分类');
    console.log('   运行 recoverFromHistory() 尝试恢复');
  } else {
    console.log('❌ 所有本地数据源均无可恢复的资产数据');
    console.log('   如果曾登录，Firestore 云端可能仍有数据。请在 Console 输入:');
    console.log('   localStorage.getItem("rdstr_migrated_v23") 检查迁移状态');
  }

  // ── 暴露恢复函数到全局 ──

  window.recoverFromOldFormat = function() {
    const raw = localStorage.getItem('rdstr_assets');
    if (!raw) { console.log('❌ rdstr_assets 不存在'); return; }
    const oldAssets = JSON.parse(raw);
    if (!Array.isArray(oldAssets) || oldAssets.length === 0) {
      console.log('❌ rdstr_assets 为空'); return;
    }
    
    const restored = oldAssets
      .filter(a => !a.deleted)
      .map(a => ({
        id: a.id || 'restored_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        name: a.name || '未命名资产',
        category: a.category || 'other',
        value: typeof a.value === 'number' ? a.value : (parseFloat(a.value) || 0),
        note: a.note || '',
        date: a.date || a.createdAt || a.updatedAt || new Date().toISOString().split('T')[0],
        createdAt: a.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deviceId: a.deviceId || 'recovered',
        version: (a.version || 0) + 1,
        deleted: false
      }));
    
    localStorage.setItem('rdstr_asset_drafts', JSON.stringify(restored));
    console.log(`✅ 从 rdstr_assets 恢复 ${restored.length} 条资产到 rdstr_asset_drafts`);
    console.log('刷新页面即可看到资产');
    return restored;
  };

  window.recoverFromHistory = function() {
    const raw = localStorage.getItem('rdstr_asset_history');
    if (!raw) { console.log('❌ rdstr_asset_history 不存在'); return; }
    const history = JSON.parse(raw);
    if (!Array.isArray(history) || history.length === 0) {
      console.log('❌ 历史快照为空'); return;
    }

    const latest = history[history.length - 1];
    const breakdown = latest.breakdown;
    
    if (!breakdown || typeof breakdown !== 'object') {
      console.log('❌ 快照中 breakdown 格式异常:', typeof breakdown);
      console.log('快照结构:', JSON.stringify(latest).slice(0, 500));
      return;
    }

    // breakdown 是 { id: value } 对象
    const entries = Object.entries(breakdown);
    if (entries.length === 0) {
      console.log('❌ breakdown 为空对象');
      return;
    }

    const restored = entries.map(([id, value], i) => ({
      id: id,
      name: '快照恢复_' + (i + 1),
      category: 'other',
      value: typeof value === 'number' ? value : (parseFloat(value) || 0),
      note: '从历史快照恢复 (' + (latest.ts || latest.date || 'unknown') + ')',
      date: (latest.ts || latest.date || '').slice(0, 10),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deviceId: 'snapshot_recovery',
      version: 1,
      deleted: false
    }));

    localStorage.setItem('rdstr_asset_drafts', JSON.stringify(restored));
    console.log(`✅ 从历史快照恢复 ${restored.length} 条资产到 rdstr_asset_drafts`);
    console.log('⚠️ 注意：名称和分类已丢失，仅恢复了 ID 和金额。请手动编辑补充名称。');
    console.log('刷新页面即可看到资产');
    return restored;
  };

  window.clearAndReset = function() {
    localStorage.removeItem('rdstr_asset_drafts');
    localStorage.removeItem('rdstr_migrated_v23');
    console.log('✅ 已清除 rdstr_asset_drafts 和迁移标记');
    console.log('刷新页面后将重新执行迁移（如果 rdstr_assets 仍存在）');
  };

  console.log('\n📌 可用命令:');
  if (hasOldAssets) console.log('  recoverFromOldFormat()  - 从旧格式恢复');
  if (hasHistory) console.log('  recoverFromHistory()    - 从历史快照恢复');
  console.log('  clearAndReset()         - 清除草稿和迁移标记，触发重新迁移');

})();
