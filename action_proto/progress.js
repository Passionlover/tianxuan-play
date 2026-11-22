/* 遊戲循環共用模組（選關畫面與戰鬥都用）：存檔、等級／經驗曲線、各節資料。11-21 jun 定案「最小閉環」。 */
(function () {
  var KEY = 'tx_save_v1', SETTINGS_KEY = 'tx_settings_v1', LV_CAP = 50;
  var TX = window.TX = {
    LV_CAP: LV_CAP,
    CHAPTERS: [
      { id: 0, name: '序章・燼潮鎮', attr: '—', x: 560, y: 1380, open: false },
      { id: 1, name: '第1章・鏡潮聖窟', attr: '水', x: 830, y: 1150, open: true },
      { id: 2, name: '第2章・赤脈熔原', attr: '火', x: 150, y: 980, open: false },
      { id: 3, name: '第3章・浮穹林海', attr: '風', x: 870, y: 770, open: false },
      { id: 4, name: '第4章・沉脊礦城', attr: '土', x: 230, y: 700, open: false },
      { id: 5, name: '第5章・鳴壁舊城', attr: '雷', x: 760, y: 540, open: false },
      { id: 6, name: '第6章・白銀階庭', attr: '光', x: 220, y: 350, open: false },
      { id: 7, name: '第7章・紫暮裂谷', attr: '闇', x: 780, y: 260, open: false },
      { id: 8, name: '終章・虛無之地', attr: '—', x: 512, y: 120, open: false }
    ],
    NODE_NAMES: ['', '潮汐渡口', '貝殼灘', '鏡面淺灣', '水晶林徑', '深潮迴廊', '古燈塔遺跡', '瀑布階台', '水晶洞口', '鏡之大廳', '聖窟深處'],
    NODE_ENEMIES: [0, 19, 19, 21, 27, 32, 35, 45, 55, 63, '首領'],
    REC_LV: [0, 1, 1, 2, 3, 5, 6, 8, 10, 12, 14],                      // 每節推薦等級＝首次一路打過來到達該節時的等級（敵人係數依此換算，讓推薦等級的玩家維持調好的難度）
    XP_OF: { tide: 12, mage: 18, fin: 16, rare: 150, boss: 400, green: 12, red: 16, blue: 18 },   // 每隻敵人經驗（第 1 章首次全通關約 Lv15）
    GOLD_PER_ENEMY: 2, FIRST_CLEAR_GOLD: 100,                           // 金幣：每隻 2；首次通關每節額外 100×節數（目前只累積，不能花）
    LOSE_XP_RATE: 0.5,                                                  // 失敗保留 50% 經驗、不給金幣
    xpNeed: function (L) { return L < 30 ? 220 + 18 * L : 1400 + 50 * (L - 30); },   // 升到下一級所需經驗（沿用舊曲線，上限 50）
    lvMul: function (L) { return 1 + 2 * (L - 1) / (LV_CAP - 1); },     // 血量、傷害倍率：Lv1＝1、Lv50＝3
    load: function () {
      var s = null;
      try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
      if (!s || typeof s !== 'object') s = {};
      if (typeof s.gold !== 'number') s.gold = 0;
      if (!Array.isArray(s.cleared)) s.cleared = [];
      if (typeof s.tutorialDone !== 'boolean') s.tutorialDone = false;
      if (!Array.isArray(s.prologueCleared)) s.prologueCleared = [];
      if (!s.heroes || typeof s.heroes !== 'object') s.heroes = {};
      return s;
    },
    save: function (s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} },
    settings: function () {
      var d = { hd: true, shake: true, dmgNum: true, auto: false }, s = null;
      try { s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); } catch (e) {}
      if (!s || typeof s !== 'object') s = {};
      Object.keys(d).forEach(function (k) { if (typeof s[k] !== 'boolean') s[k] = d[k]; });
      return s;
    },
    saveSettings: function (s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) {} },
    clearSave: function () { try { localStorage.removeItem(KEY); } catch (e) {} },
    hero: function (s, id) {
      var h = s.heroes[id]; if (!h) h = s.heroes[id] = { lv: 1, xp: 0 };
      if (!(h.lv >= 1)) h.lv = 1; if (h.lv > LV_CAP) h.lv = LV_CAP; if (!(h.xp >= 0)) h.xp = 0;
      return h;
    },
    unlocked: function (s, n) { return n === 1 || s.cleared.indexOf(n - 1) >= 0; },
    prologueUnlocked: function (s, n) { return n === 1 || s.prologueCleared.indexOf(n - 1) >= 0; },
    chapterOpen: function (s, id) {
      if (id === 0) return !!s.tutorialDone;
      if (id === 1) return true;
      return !!(TX.CHAPTERS[id] && TX.CHAPTERS[id].open);
    },
    isCleared: function (s, n) { return s.cleared.indexOf(n) >= 0; },
    // 加經驗並處理升級；回傳 { from, to, gained }
    addXp: function (h, xp) {
      var from = h.lv; h.xp += xp;
      while (h.lv < LV_CAP && h.xp >= TX.xpNeed(h.lv)) { h.xp -= TX.xpNeed(h.lv); h.lv++; }
      if (h.lv >= LV_CAP) h.xp = 0;
      return { from: from, to: h.lv, gained: xp };
    }
  };
})();
