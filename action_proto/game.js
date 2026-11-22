/* 天選者傳說 · 即時動作原型 v0（類《勇者鬥惡龍 破限亂鬥》）
   操作：拖曳移動；放手停下就自動攻擊；必殺鈕；換人鈕；集滿結晶三選一冒險技能。 */
(function () {
  const W = 390, H = 844, A = '../game/assets/';
  const CHAPTER_BG = 'bg_water.webp';   // 第 1 章（水）戰鬥場景圖；之後各章換成對應的 bg_*.webp
  const WORLD_W = 960, WORLD_H = 1800;
  const ARENA = { x0: 24, x1: WORLD_W - 24, y0: 90, y1: WORLD_H - 40 };
  /* 地圖物件（A3 正式美術）。x,y＝圖的底部中心（腳印所在）；s＝顯示縮放。
     type：building／mountain 擋路也擋遠程箭；lake 只擋走路；forest 可穿過但減速（腳印範圍內）
     fp：腳印（實際碰撞）＝ [kind, 寬占圖寬比例, 高占圖高比例]；kind rect＝方形、ell＝橢圓 */
  const ART = {
    bld_cabin: [386, 363], bld_house2: [481, 453], bld_warehouse: [508, 453], bld_stone: [415, 458], bld_ruin: [422, 450], bld_lighthouse: [223, 454],
    rock_mountain_l: [480, 453], rock_mountain_m: [472, 290], rock_cliff: [480, 300], rock_cluster: [438, 353], rock_boulder: [384, 353], rock_lava: [405, 332],
    tree_pine: [464, 465], tree_dead: [452, 466], tree_mixed: [463, 464], lake_small: [471, 317], lake_big: [500, 391], lake_harbor: [486, 427]
  };
  const OBJ_DEF = {   // 圖名 → [type, 縮放, 腳印kind, 寬比例, 高比例]
    /* jun 11-17：角色／敵人不可跑到障礙物後面被遮住 → 高大物件的不可通行範圍涵蓋整個圖的輪廓（高比例≈整張圖高） */
    bld_cabin: ['building', 0.45, 'rect', 0.92, 0.96], bld_house2: ['building', 0.42, 'rect', 0.92, 0.96], bld_warehouse: ['building', 0.42, 'rect', 0.94, 0.96],
    bld_stone: ['building', 0.40, 'rect', 0.92, 0.96], bld_ruin: ['building', 0.42, 'rect', 0.92, 0.96], bld_lighthouse: ['building', 0.42, 'rect', 0.74, 0.96],
    rock_mountain_l: ['mountain', 0.62, 'ell', 1.24, 1.0], rock_mountain_m: ['mountain', 0.55, 'ell', 1.24, 1.0], rock_cliff: ['mountain', 0.55, 'rect', 0.96, 0.94],
    rock_cluster: ['mountain', 0.42, 'ell', 1.12, 1.0], rock_boulder: ['mountain', 0.32, 'ell', 1.0, 0.98], rock_lava: ['mountain', 0.38, 'ell', 1.0, 0.98],
    tree_pine: ['forest', 0.42, 'ell', 0.84, 0.36], tree_dead: ['forest', 0.40, 'ell', 0.84, 0.36], tree_mixed: ['forest', 0.42, 'ell', 0.84, 0.36],
    lake_small: ['lake', 0.55, 'ell', 0.84, 0.62], lake_big: ['lake', 0.62, 'ell', 0.84, 0.64], lake_harbor: ['lake', 0.50, 'ell', 0.78, 0.62]
  };
  const PLACE = [   // [圖名, x, y]
    ['bld_cabin', 150, 1700], ['bld_lighthouse', 840, 1730],  ['rock_cluster', 700, 1560], ['tree_pine', 160, 1500],
    ['lake_small', 750, 1400],  ['rock_mountain_l', 210, 1210], 
    ['lake_harbor', 790, 1010],  ['rock_cliff', 215, 960],  ['bld_ruin', 340, 760],  ['lake_big', 225, 560], ['tree_mixed', 700, 480],  ['rock_mountain_l', 780, 330],  ['rock_cliff', 500, 190], ['bld_cabin', 150, 170], 
  ];
  const OBST = PLACE.map(([img, x, y]) => {
    const [t, sc0, kind, fw, fh] = OBJ_DEF[img], [iw, ih] = ART[img], dw = iw * sc0, dh = ih * sc0;
    const hw = dw * fw / 2, hh = dh * fh / 2;
    const cy = t === 'lake' ? y - dh * 0.46 : y - hh;
    return { t, img, x, y, s: sc0, kind, cx: x, cy, hw, hh, dw, dh };
  });
  const CELL = 24, GW = Math.ceil(WORLD_W / CELL), GH = Math.ceil(WORLD_H / CELL);
  /* 點是否落在物件腳印內（pad＝外擴量，用來給角色半徑） */
  function inFoot(o, x, y, pad) {
    if (o.kind === 'rect') return Math.abs(x - o.cx) < o.hw + pad && Math.abs(y - o.cy) < o.hh + pad;
    const u = (x - o.cx) / (o.hw + pad), v = (y - o.cy) / (o.hh + pad); return u * u + v * v < 1;
  }
  function solidAt(x, y, pad, types) {
    for (const o of OBST) {
      if (o.t === 'forest' || (types && !types.includes(o.t))) continue;
      if (inFoot(o, x, y, pad)) return o;
    }
    return null;
  }
  const inForest = (x, y) => OBST.some(o => o.t === 'forest' && inFoot(o, x, y, 0));
  function resolveSolid(e, rad) {
    for (let it = 0; it < 3; it++) {
      for (const o of OBST) {
        if (o.t === 'forest') continue;
        if (o.kind === 'rect') {
          const cx = clamp(e.x, o.cx - o.hw, o.cx + o.hw), cy = clamp(e.y, o.cy - o.hh, o.cy + o.hh);
          const dx = e.x - cx, dy = e.y - cy, d = Math.hypot(dx, dy);
          if (d >= rad) continue;
          if (d > 0.001) { e.x = cx + dx / d * rad; e.y = cy + dy / d * rad; }
          else {
            const l = e.x - (o.cx - o.hw), r = (o.cx + o.hw) - e.x, t = e.y - (o.cy - o.hh), b = (o.cy + o.hh) - e.y, m = Math.min(l, r, t, b);
            if (m === l) e.x = o.cx - o.hw - rad; else if (m === r) e.x = o.cx + o.hw + rad; else if (m === t) e.y = o.cy - o.hh - rad; else e.y = o.cy + o.hh + rad;
          }
        } else {
          const ax = o.hw + rad, ay = o.hh + rad, u = (e.x - o.cx) / ax, v = (e.y - o.cy) / ay, d = Math.hypot(u, v);
          if (d < 1) { if (d > 0.001) { e.x = o.cx + (e.x - o.cx) / d; e.y = o.cy + (e.y - o.cy) / d; } else e.x = o.cx + ax; }
        }
      }
      e.x = clamp(e.x, ARENA.x0, ARENA.x1); e.y = clamp(e.y, ARENA.y0, ARENA.y1);
    }
  }
  function clearLine(x1, y1, x2, y2, pad) {
    const d = Math.hypot(x2 - x1, y2 - y1), n = Math.ceil(d / 14);
    for (let i = 1; i < n; i++) { const t = i / n; if (solidAt(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, pad)) return false; }
    return true;
  }
  /* 流場尋路：從玩家所在格往外 BFS，敵人沿著距離變小的方向走（自動繞山、湖、建築） */
  let BLOCK = null, FIELD = null, fieldCell = -1, fieldT = 0;
  function buildBlock() {
    BLOCK = new Uint8Array(GW * GH);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) { const cx = i * CELL + CELL / 2, cy = j * CELL + CELL / 2; BLOCK[j * GW + i] = (cx < ARENA.x0 + 6 || cx > ARENA.x1 - 6 || cy < ARENA.y0 + 6 || cy > ARENA.y1 - 6 || solidAt(cx, cy, 12)) ? 1 : 0; }
  }
  function buildField(px, py) {
    const si = clamp(Math.floor(px / CELL), 0, GW - 1), sj = clamp(Math.floor(py / CELL), 0, GH - 1);
    FIELD = new Int16Array(GW * GH).fill(-1);
    const q = [sj * GW + si]; FIELD[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const c = q[h], ci = c % GW, cj = (c / GW) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
        const n = nj * GW + ni; if (FIELD[n] >= 0 || BLOCK[n]) continue;
        if (di && dj && (BLOCK[cj * GW + ni] || BLOCK[nj * GW + ci])) continue;
        FIELD[n] = FIELD[c] + 1; q.push(n);
      }
    }
    fieldCell = sj * GW + si;
  }
  function steerTarget(e, p) {
    if (clearLine(e.x, e.y, p.x, p.y, e.def.r * 0.6)) return p;
    const ci = clamp(Math.floor(e.x / CELL), 0, GW - 1), cj = clamp(Math.floor(e.y / CELL), 0, GH - 1), cur = FIELD[cj * GW + ci];
    let best = null, bd = cur < 0 ? 1e9 : cur;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = ci + di, nj = cj + dj; if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
      const v = FIELD[nj * GW + ni]; if (v < 0) continue;
      if (di && dj && (BLOCK[cj * GW + ni] || BLOCK[nj * GW + ci])) continue;
      if (v < bd) { bd = v; best = { x: ni * CELL + CELL / 2, y: nj * CELL + CELL / 2 }; }
    }
    return best || p;
  }
  const QS = new URLSearchParams(location.search);
  const TX = window.TX;
  const TUT = Math.max(0, Math.min(3, parseInt(QS.get('tut') || '0', 10) || 0));
  const TUT_DATA = TUT && window.TUT_TEXT ? TUT_TEXT.nodes[TUT] : null;
  const SET = TX.settings();
  /* 11-21 jun：最大射程 300px 要剛好打到螢幕左右邊界 → 單側要看到 300px → 鏡頭縮放 390/600=0.65；角色與敵人圖放大 1.25 倍補償視覺大小（碰撞不變）。?zoom=1 可回到舊鏡頭比較 */
  const ZOOM = (() => { const z = parseFloat(QS.get('zoom')); return z > 0.3 && z <= 1.2 ? z : 0.65; })(), VIS = ZOOM < 1 ? 1.25 : 1;
  const RS = (() => { const r = parseFloat(QS.get('rs')); return r >= 1 && r <= 3 ? r : (SET.hd ? 2 : 1); })();   // 渲染解析度倍率：網址指定時優先，否則使用設定
  const TIME_SCALE = Number(QS.get('speed')) || 1;
  const VERSION = '原型 v55（序章教學）';
  const SIM = Number(QS.get('sim')) || 0;   // ?sim=N：加速模擬 N 局，統計勝率
  const GOLD = 0xe8b84a;
  function camShake(dur, amp) { if (SET.shake && sc && sc.cameras && sc.cameras.main) sc.cameras.main.shake(dur, amp); }

  /* ---------- 資料 ---------- */
  /* 攻擊範圍等級（jun 11-15 定義，11-21 重訂）：極小60／小120／中180／大240／極大300 px */
  const RANGE_TIER = { '極小': 60, '小': 120, '中': 180, '大': 240, '極大': 300 };   // 11-21 jun 重訂
  const CH = {
    zane: { name: '澤恩', weapon: '雙刀', maxHp: 130, rangeTier: '極小', range: RANGE_TIER['極小'], cd: 0.40, dmg: 11.7, attr: '雷', kind: 'arc', art: 'zane', combo3: 1.5, ultAngle: 60, ult: { name: '千雷亂舞', r: 120 } },   /* 11-20 單一角色制樣板：動作圖暫借雷歐（art:'leo'） */
    oz: { name: '歐斯', weapon: '大盾＋戰錘', maxHp: 160, rangeTier: '小', range: RANGE_TIER['小'], cd: 0.90, dmg: 20, attr: '土', kind: 'arc', arc: Math.PI / 2, art: 'oz', oy: 140 / 144, ultAngle: 90, ult: { name: '山嶽崩落', r: 150 } },   /* 11-21 第三位玩家角色：近戰坦克（吸收與反彈） */
    sere: { name: '瑟蕾', weapon: '法杖', maxHp: 80, rangeTier: '大', range: RANGE_TIER['大'], cd: 0.80, dmg: 12, attr: '水', kind: 'bolt', art: 'sere', oy: 140 / 144, ultAngle: 23.5, ult: { name: '倒流之海', all: true } },   /* 11-21 第二位玩家角色：場地控制法師（水彈、水域、潮汐漩渦、怒濤、倒流之海） */
    leo:  { name: '雷歐', weapon: '劍', maxHp: 120, rangeTier: '小', range: RANGE_TIER['小'],  cd: 0.55, dmg: 11, attr: '雷', kind: 'arc',    ultAngle: 60,   ult: { name: '雷光劍', r: 135 } },
    mia:  { name: '美雅', weapon: '弓', maxHp: 90,  range: 240, cd: 0.45, dmg: 8,  attr: '火', kind: 'shot',   ultAngle: 4.8, ult: { name: '箭雨', all: true } }   /* 箭判定半寬10px→等效角度 2·atan(10/240)=4.8°（jun 11-17：依建議） */,
    gale: { name: '加爾', weapon: '槍', maxHp: 140, range: 125, cd: 0.7,  dmg: 14, attr: '雷', kind: 'thrust', ultAngle: 23.5, ult: { name: '雷槍突', r: 105 } }   /* 槍寬≈52px→等效角度 2·atan(26/125)=23.5° */
  };
  const ARC = Math.PI / 3;   // 劍的攻擊角度：60 度
  const ORDER = ['leo', 'mia', 'gale'];
  /* 上場名單：第一版只有雷歐（無換人）。要測換人：網址加 ?team=leo,mia,gale */
  const ROSTER = (QS.get('team') || QS.get('hero') || 'zane').split(',').filter(id => CH[id]);   // 單一角色制：預設只有澤恩，進戰鬥後不能換人（?team= 僅供舊角色測試）
  ROSTER.forEach(id => { const hk = parseFloat(QS.get('hpk')), dk = parseFloat(QS.get('dk')); if (hk > 0) CH[id].maxHp = Math.round(CH[id].maxHp * hk); if (dk > 0) CH[id].dmg = CH[id].dmg * dk; });   // 平衡測試用：?hpk=血量倍率 ?dk=普攻傷害倍率（技能傷害跟著 D 變）
  const TUNE = Object.assign({ ozPas: 0.85, ozSh: 10, ozCt: 0.2, ozCtCd: 10, ozAn: 0.3, ozAnCd: 14, sPoolSlow: 0.4, sPoolT: 5, sVorT: 3, sWaveStun: 0.5, sPas: 0.5 }, Object.fromEntries((QS.get('tune') || '').split(',').filter(Boolean).map(kv => { const [k, v] = kv.split(':'); return [k, parseFloat(v)]; })));   // 平衡用機制參數（預設＝正式值；?tune=ozPas:0.9,ozSh:15 可臨時覆蓋做模擬）
  const FR = { idle: 4, atk: 6, hit: 2, win: 4 };
  const MOVE_FR = { walk: 6, run: 6 };   // 目前只有雷歐有移動動作組
  const HAS_MOVE = { leo: true, zane: true, sere: true, oz: true };
  /* 45度斜向動作組（斜上 up／斜下 dn，朝左版；朝右用 flipX）：目前只有雷歐 */
  const HAS_DIAG = { leo: true, zane: true, sere: true, oz: true };
  const DIAG_FR = { walk: 6, run: 6, idleA: 4, atk: 6, hit: 2 };
  const DIAG_ANIM = { walk: ['walk', 6, -1], run: ['run', 8, -1], idleA: ['idle', 6, -1], atk: ['atk', 18, 0], hit: ['hit', 10, 0] };
  /* 依面向選動畫：|fy|<0.38 用側視；往上用斜上；往下用斜下（純上／下也用斜向圖） */
  const dirOf = () => { const fx = G.pl.fx, fy = G.pl.fy; if (fy > 0.38) return Math.abs(fx) < 0.38 ? 'fr' : 'dn'; if (fy < -0.38) return Math.abs(fx) < 0.38 ? 'bk' : 'up'; return ''; };
  const animName = (id, set) => { if (!HAS_DIAG[id] || !G) return `${id}_${set}`; const d = dirOf(); return `${id}_${d ? d + '_' : ''}${set}`; };

  /* 首領調整參數（11-18 模擬調整；設計原值：血650／咆哮3圈1.3秒冷卻8秒18傷害／召喚2隻每10秒上限6） */
  const BT = { hp: 1000, roarN: 5, roarDur: 0.95, roarGap: 0.3, roarCd: 5.5, roarDmg: 22, clawDmg: 20, addN: 3, addCd: 7.5, addMax: 9 };
  const NODE_N = Math.max(1, Math.min(10, parseInt(QS.get('node') || '1', 10) || 1)), LEGACY = !!QS.get('legacy');   // ?node=1~10 選節；?legacy=1 舊版 4 波
  /* ---------- 遊戲循環（11-21）：角色等級加成、存檔 ---------- */
  const REAL = !!QS.get('real') && !SIM;   // real=1 是從選關畫面正式開戰（才會讀寫存檔）；測試網址預設不動存檔
  const SAVE = REAL ? TX.load() : null;
  const HERO_ID = ROSTER[0];
  const HERO_LV = REAL ? TX.hero(SAVE, HERO_ID).lv : Math.max(1, Math.min(TX.LV_CAP, parseInt(QS.get('lv'), 10) || TX.REC_LV[NODE_N]));   // 測試網址預設用該節推薦等級（?lv=1 可指定）
  const PL_MUL = TX.lvMul(HERO_LV), REC_MUL = TX.lvMul(TX.REC_LV[NODE_N]);
  ROSTER.forEach(id => { CH[id].maxHp = Math.round(CH[id].maxHp * PL_MUL); CH[id].dmg = CH[id].dmg * PL_MUL; });
  const EN = {
    green: { hp: 28, spd: 44, dmg: 6, r: 18, scale: 0.8, tex: 'slime_green', art: 'ashslime', crystal: 1 },
    red:   { hp: 46, spd: 62, dmg: 9, r: 19, scale: 0.8, tex: 'slime_red', art: 'lavaslime', crystal: 1 },
    blue:  { hp: 42, spd: 38, dmg: 6, r: 19, scale: 0.8, tex: 'slime_blue', art: 'tideslime', crystal: 2, aoe: { cd: 3.6, tele: 0.9, r: 62, dmg: 14 } },
    boss:  { hp: 300, spd: 30, dmg: 12, r: 46, scale: 0.55, tex: 'slime_giant_purple', art: 'gatekeeper', crystal: 8, aoe: { cd: 4, tele: 1.1, r: 98, dmg: 22 } }
  };
  if (!LEGACY) Object.assign(EN, {   // 第 1 章敵人（美術暫以現有史萊姆頂替：術士＝灰潮、獵獸＝熔岩；稀有＝放大的潮水；首領＝灰潮史萊姆王）
    tide: { name: '潮藍史萊姆', hp: 40, spd: 38, dmg: 6, r: 19, scale: 0.8, tex: 'slime_blue', art: 'tideslime', crystal: 1, kind: 'tide', attr: '水', contactCd: 1.0, film: true },
    mage: { name: '鏡潮術士', hp: 48, spd: 36, dmg: 6, r: 19, scale: 0.8, tex: 'slime_green', art: 'mirrormage', crystal: 2, kind: 'mage', attr: '水', noContact: true, paraHalf: true, keep: [190, 260], aoe: { cd: 5, tele: 1.2, r: 80, dmg: 14, range: 300 } },
    fin:  { name: '赤鰭獵獸', hp: 44, spd: 85, dmg: 5, r: 19, scale: 0.8, tex: 'slime_red', art: 'finbeast', crystal: 1, kind: 'fin', attr: '火', noContact: true },
    rare: { name: '鏡藍巨大史萊姆', hp: 190, spd: 28, dmg: 10, r: 46, scale: 0.55, tex: 'slime_giant_blue', crystal: 6, kind: 'rare', attr: '水', contactCd: 1.0, flee: 25 },
    boss: { name: '逆潮鏡獸', hp: BT.hp, spd: 30, dmg: 12, r: 52, scale: 0.55, tex: 'slime_giant_purple', art: 'mirrorbeast', crystal: 10, kind: 'mirror', attr: '水', noContact: true }
  });
  /* 敵人新美術（A5／A6）：側視／正面／背面 × 移動／攻擊；n＝每組幀數，oy＝腳底錨點，sc＝顯示縮放，mv／at＝移動／攻擊動畫幀率 */
  const ENEMY_ART = {
    ashslime: { n: 6, oy: 92 / 96, sc: 1.05, mv: 6, at: 12 }, lavaslime: { n: 6, oy: 92 / 96, sc: 1.05, mv: 6, at: 12 },
    tideslime: { n: 6, oy: 92 / 96, sc: 1.05, mv: 6, at: 10 }, gatekeeper: { n: 3, oy: 170 / 176, sc: 1.0, mv: 4, at: 6 },
    mirrormage: { n: 6, oy: 92 / 96, sc: 1.05, mv: 6, at: 10 }, finbeast: { n: 6, oy: 92 / 96, sc: 1.05, mv: 12, at: 14 }, mirrorbeast: { n: 3, oy: 170 / 176, sc: 1.0, mv: 4, at: 6 }   // 第1章新美術（A9／A10）
  };
  const WAVES_OLD = [
    [['green', 5]],
    [['green', 4], ['red', 3]],
    [['green', 4], ['blue', 2], ['red', 3]],
    [['green', 3], ['blue', 3], ['red', 3], ['boss', 1]]
  ];

  /* 冒險技能（design_data.json adventure_skills，jun 11-17 定案）。cat＝類別（A基礎強化／B改變打法／C自動施放／E生存／F結晶與爆發）；lv＝每一級的說明（第3級含★質變）。
     第一批實作 A、B、C、F；E 類（吸血、守護盾）暫用舊數值，第二批再改；D 類（狀態）第三批。傷害一律以普攻傷害 D 的倍率表示。 */
  /* ---------- 第 1 章（鏡潮聖窟）：節與波次（design_data.json enemy_action／stage_action，jun 11-18 定案） ---------- */
  const NODE_NAMES = ['', '潮汐渡口', '貝殼灘', '鏡面淺灣', '水晶林徑', '深潮迴廊', '古燈塔遺跡', '瀑布階台', '水晶洞口', '鏡之大廳', '聖窟深處'];
  const NODE_DEFS = [null,
    [{ A: 5 }, { A: 6 }, { A: 8 }],
    [{ A: 5 }, { A: 4, C: 2 }, { A: 5, C: 3 }],
    [{ A: 6 }, { A: 4, C: 3 }, { A: 5, C: 3 }],
    [{ A: 5 }, { A: 4, B: 1 }, { A: 4, C: 2, B: 1 }, { A: 5, C: 3, B: 2 }],
    [{ A: 4, C: 3 }, { B: 2, C: 3 }, { A: 5, B: 2, C: 3 }, { A: 4, B: 3, C: 3 }],
    [{ C: 5 }, { B: 3, C: 3 }, { A: 6, B: 2, C: 4 }, { A: 4, B: 3, C: 5 }],
    [{ A: 6, B: 1 }, { C: 4, B: 2 }, { A: 5, B: 3, C: 3 }, { B: 4, C: 4 }, { A: 6, B: 3, C: 4 }],
    [{ A: 5, B: 2, C: 4 }, { B: 3, C: 5 }, { A: 5, B: 4, C: 3 }, { B: 5, C: 4 }, { A: 6, B: 4, C: 5 }],
    [{ A: 5, B: 3, C: 4 }, { B: 4, C: 5 }, { A: 5, B: 4, C: 4 }, { A: 5, B: 5, C: 5 }, { B: 7, C: 7 }],
    [{ A: 6, C: 3 }, { X: 1 }]];
  const LETTER = { A: 'tide', B: 'mage', C: 'fin', X: 'boss' };
  const WAVES = LEGACY ? WAVES_OLD : NODE_DEFS[NODE_N].map(w => Object.entries(w).map(([k, n]) => [LETTER[k], n]));
  const NODE_HPK = LEGACY ? 1 : (1 + 0.04 * (NODE_N - 1)) * REC_MUL, NODE_DMGK = LEGACY ? 1 : (1 + 0.03 * (NODE_N - 1)) * REC_MUL;   // 每節難度係數
  /* 屬性相剋（沿用既有規則）：剋制 ×1.5、被剋 ×0.5；水→火→風→土→雷→水，光闇互剋 */
  const BEATS = { '水': '火', '火': '風', '風': '土', '土': '雷', '雷': '水' };
  function elemMul(a, d) { if (!a || !d || QS.get('noelem')) return 1; if ((a === '光' && d === '闇') || (a === '闇' && d === '光')) return 1.5; if (BEATS[a] === d) return 1.5; if (BEATS[d] === a) return 0.5; return 1; }

  /* 11-21 jun：B 類（改變打法）從共用技能池移除，保留定義，之後分配給個別角色專屬使用（程式內的效果邏輯也保留） */
  const SKILLS_HOLD = [
    { id: 'slashwave', name: '劍氣波', cat: 'B', max: 3, lv: ['每 5 下普攻射出劍氣，1.0 倍傷害', '每 4 下，1.3 倍傷害', '每 3 下，1.6 倍；★劍氣穿透整排敵人'] },
    { id: 'twin', name: '二連擊',   cat: 'B', max: 3, lv: ['普攻 20% 機率追加一擊（0.8 倍）', '30% 機率追加一擊', '40%；★追加的一擊必暴擊'] },
    { id: 'whirl', name: '旋風斬',  cat: 'B', max: 3, lv: ['每 8 秒自動旋轉斬一圈（3 段，各 0.7 倍）', '每 7 秒，各 0.85 倍', '每 6 秒，各 1.0 倍；★旋轉時把敵人拉向身邊'] },
    { id: 'pierce', name: '貫穿箭', cat: 'B', max: 3, lv: ['箭矢穿透 2 隻，每穿一隻傷害 ×0.8', '穿透 3 隻', '穿透 4 隻；★穿透傷害不遞減'] },
    { id: 'chain', name: '連鎖雷',  cat: 'B', max: 3, lv: ['每 4 下普攻雷擊 3 隻（0.8 倍）', '雷擊 3 隻（1.1 倍）', '雷擊 4 隻（1.4 倍）；★連到第 4 隻'] }
  ];
  const SKILLS = [
    { id: 'atk',  name: '強化攻擊', cat: 'A', max: 3, lv: ['傷害 +20%', '傷害 +40%', '傷害 +60%'] },
    { id: 'as',   name: '連擊加速', cat: 'A', max: 3, lv: ['攻擊速度 +15%', '攻擊速度 +30%', '攻擊速度 +45%'] },
    { id: 'rng',  name: '攻擊範圍', cat: 'A', max: 3, lv: ['攻擊範圍 +18%', '攻擊範圍 +36%', '攻擊範圍 +54%'] },
    { id: 'spd',  name: '疾風步',   cat: 'A', max: 3, lv: ['移動速度 +12%', '移動速度 +24%', '移動速度 +36%'] },
    { id: 'thunder', name: '落雷',  cat: 'C', max: 3, lv: ['每 5 秒朝最近敵人落雷（2.0 倍）', '每 4 秒（2.5 倍）', '每 3 秒（3.0 倍）'] },
    { id: 'multithunder', name: '多重落雷', cat: 'C', max: 3, req: 'thunder', lv: ['每次落雷再追加 2 道落雷', '追加 4 道落雷', '追加 6 道落雷'] },
    { id: 'blades', name: '環繞魔球', cat: 'C', max: 3, lv: ['兩顆魔法球繞身旋轉（每次 0.5 倍）', '四顆魔法球', '六顆魔法球'] },
    { id: 'burst', name: '結晶爆裂', cat: 'C', max: 3, lv: ['撿結晶時爆炸，半徑 60（1.5 倍）', '半徑 75（2.0 倍）', '半徑 90（2.5 倍）；★爆炸擊退敵人'] },
    { id: 'wave', name: '衝擊波',   cat: 'C', max: 3, lv: ['每 6 秒震開周圍（0.9 倍）', '每 5 秒（1.45 倍）', '每 4 秒（2.0 倍）；★再震第二圈'] },
    { id: 'magnet', name: '磁吸',   cat: 'F', max: 3, lv: ['結晶吸取範圍 ×1.5', '結晶吸取範圍 ×2', '×2.5；★升級瞬間吸走全場結晶'] },
    { id: 'crit', name: '會心一擊', cat: 'F', max: 3, lv: ['暴擊率 +12%', '暴擊率 +24%', '暴擊率 +36%；★暴擊時小爆炸'] },
    { id: 'poison', name: '毒刃', cat: 'D', max: 3, lv: ['普攻附加劇毒，每秒 0.25 倍傷害、持續 5 秒', '每秒 0.35 倍', '每秒 0.45 倍；★中毒敵人死亡時毒擴散給附近敵人'] },
    { id: 'para', name: '麻痺',   cat: 'D', max: 3, lv: ['普攻 8% 機率麻痺敵人 2 秒', '12% 機率麻痺', '16%；★麻痺期間敵人受到的傷害 +30%'] },
    { id: 'slow', name: '緩速',   cat: 'D', max: 3, lv: ['普攻使敵人移速 -25%，持續 3 秒', '移速 -35%', '移速 -45%；★疊滿 3 次凍結 1 秒'] },
    { id: 'life', name: '吸血',     cat: 'E', max: 3, lv: ['造成傷害的 4% 回復生命', '造成傷害的 8% 回復生命', '造成傷害的 12% 回復生命；★血量低於 40% 時加倍'] },
    { id: 'shield', name: '守護盾', cat: 'E', max: 3, lv: ['每 10 秒生成一層護盾', '每 8 秒生成一層護盾', '每 6 秒生成一層護盾；★護盾破裂時震開周圍並造成 1.5 倍傷害'] },
    { id: 'counter', name: '反擊',   cat: 'E', max: 3, lv: ['受傷時放出震波（冷卻 3 秒，1.0 倍）', '震波 1.5 倍傷害', '震波 2.0 倍；★震波後多 1 秒無敵'] },
    { id: 'dash', name: '迴避衝刺', cat: 'E', max: 3, lv: ['敵人貼身時自動衝刺閃開（冷卻 9 秒）', '冷卻 7 秒', '冷卻 5 秒；★衝刺路徑上的敵人受 1.5 倍傷害'] }
  ];
  /* 11-21 jun：共用技能只是錦上添花，不影響角色特色——已取消「角色特長類別」機率加成，所有角色抽選機率相同 */

  /* ---------- 狀態 ---------- */
  let sc, G;
  function newGame() {
    G = {
      state: 'play', t: 0, wave: -1, waveGap: 1.2, spawnQ: [], spawnT: 0,
      chars: ROSTER.map(id => ({ id, hp: CH[id].maxHp, alive: true })),
      active: 0, swapCd: 0, inv: 0,
      pl: { x: 480, y: 1690, fx: -1, fy: 0, atkLock: 0, atkCd: 0, moving: false, hits: 0, shieldT: 0, shield: 0, waveT: 0, whirlT: 0, thunderT: 0, bladeA: 0, counterT: 0, dashT: 0, dash: null },
      st: { atk: 0, as: 0, rng: 0, spd: 0, crit: 0, chain: 0, life: 0, shield: 0, wave: 0, counter: 0, dash: 0, poison: 0, para: 0, slow: 0, slashwave: 0, twin: 0, whirl: 0, pierce: 0, thunder: 0, multithunder: 0, blades: 0, burst: 0, magnet: 0 },
      picks: [], dmgBy: {}, lastSrc: '', crystals: 0, level: 1, need: 5, gauge: 0,
      enemies: [], pickups: [], shots: [], fx: [], tq: [], swaves: [], tg: [], waveT: 0, vuln: 0, cd: [0, 0, 0], lastMove: null,
      rareWave: (!LEGACY && Math.random() < 0.06 && WAVES.length >= 3 && !WAVES[WAVES.length - 1].some(([t]) => t === 'boss')) ? 1 + Math.floor(Math.random() * (WAVES.length - 1)) : -1
    };
    if (TUT) G.tut = { phase: 'intro', hint: '', target: { x: 680, y: 1690 }, intro: true, outro: false, retry: 0, stepKills: 0, spawned: [], dodgeAttempts: 0 };
  }
  const act = () => G.chars[G.active];
  const def = () => CH[act().id];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  /* ---------- Phaser ---------- */
  const config = {
    type: Phaser.AUTO, parent: 'game', width: W * RS, height: H * RS, backgroundColor: '#0c0806',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: { preload, create, update }
  };

  function preload() {
    this.load.image('bg', A + 'bg_prologue.webp');
    if (TUT) this.load.image('serloan_portrait', A + 'lihui_serloan.png');
    this.load.image('bg_chapter', A + CHAPTER_BG);   // 結算／暫停畫面背景：該章節的戰鬥場景圖（所有角色都載入）
    ['stone', 'crack', 'ash', 'wet'].forEach(n => this.load.image('ground_' + n, A + `map/ground_${n}.png`));
    ['melee', 'ultimate', 'world'].forEach(n => this.load.spritesheet('fx_' + n, A + `fx_${n}.png`, { frameWidth: 256, frameHeight: 256 }));
    this.load.spritesheet('fx_charge', A + 'fx_charge.png', { frameWidth: 256, frameHeight: 256 });   // A8 蓄力光環（列0金／列1冷，循環）
    Object.keys(ART).forEach(n => this.load.image('map_' + n, A + `map/${n}.png`));
    ROSTER.forEach(id => {
      if (HAS_DIAG[id]) ['dn', 'up', 'fr', 'bk'].forEach(dir => Object.keys(DIAG_FR).forEach(set => { for (let i = 1; i <= DIAG_FR[set]; i++) this.load.image(`${id}_${dir}_${set}_${i}`, A + `hd_${CH[id].art || id}_1_${dir}_${set}_f${i}.png`); }));
      if (id === 'zane') {   // 第二批：施放動作（5方向×3招×4格）、必殺演出6格、失敗2格、4張特效
        ['', 'dn_', 'up_', 'fr_', 'bk_'].forEach(pre => { [1, 2, 3].forEach(k => { for (let i = 1; i <= 4; i++) this.load.image(`zane_${pre}cast${k}_${i}`, A + `hd_zane_1_${pre}cast${k}_f${i}.png`); }); if (pre) ['atk2', 'atk3'].forEach(set => { for (let i = 1; i <= 6; i++) this.load.image(`zane_${pre}${set}_${i}`, A + `hd_zane_1_${pre}${set}_f${i}.png`); }); });
        for (let i = 1; i <= 6; i++) this.load.image(`zane_ult_${i}`, A + `hd_zane_1_ult_f${i}.png`);
        for (let i = 1; i <= 2; i++) this.load.image(`zane_lose_${i}`, A + `hd_zane_1_lose_f${i}.png`);
        ['mark', 'step', 'burst', 'ult'].forEach(n => this.load.spritesheet('fx_zane_' + n, A + `fx_zane_${n}.png`, { frameWidth: 256, frameHeight: 256 }));
      }
      if (id === 'oz') {
        for (let i = 1; i <= 2; i++) this.load.image(`oz_lose_${i}`, A + `hd_oz_1_lose_f${i}.png`);
        for (let i = 1; i <= 6; i++) this.load.image(`oz_ult_${i}`, A + `hd_oz_1_ult_f${i}.png`);
        ['', 'dn_', 'up_', 'fr_', 'bk_'].forEach(pre => [1, 2, 3].forEach(k => { for (let i = 1; i <= 4; i++) this.load.image(`oz_${pre}cast${k}_${i}`, A + `hd_oz_1_${pre}cast${k}_f${i}.png`); }));
        ['hit', 'counter', 'anchor', 'ult'].forEach(n => this.load.spritesheet('fx_oz_' + n, A + `fx_oz_${n}.png`, { frameWidth: 256, frameHeight: 256 }));
      }
      if (id === 'sere') {
        for (let i = 1; i <= 2; i++) this.load.image(`sere_lose_${i}`, A + `hd_sere_1_lose_f${i}.png`);
        for (let i = 1; i <= 6; i++) this.load.image(`sere_ult_${i}`, A + `hd_sere_1_ult_f${i}.png`);
        ['', 'dn_', 'up_', 'fr_', 'bk_'].forEach(pre => [1, 2, 3].forEach(k => { for (let i = 1; i <= 4; i++) this.load.image(`sere_${pre}cast${k}_${i}`, A + `hd_sere_1_${pre}cast${k}_f${i}.png`); }));
        ['bolt', 'pool', 'vortex', 'ult'].forEach(n => this.load.spritesheet('fx_sere_' + n, A + `fx_sere_${n}.png`, { frameWidth: 256, frameHeight: 256 }));
      }
      if (id === 'zane') ['atk2', 'atk3'].forEach(set => { for (let i = 1; i <= 6; i++) this.load.image(`${id}_${set}_${i}`, A + `hd_zane_1_${set}_f${i}.png`); });
      if (HAS_MOVE[id]) Object.keys(MOVE_FR).forEach(set => { for (let i = 1; i <= MOVE_FR[set]; i++) this.load.image(`${id}_${set}_${i}`, A + `hd_${CH[id].art || id}_1_${set}_f${i}.png`); });
      Object.keys(FR).forEach(set => {
        for (let i = 1; i <= FR[set]; i++) this.load.image(`${id}_${set}_${i}`, A + `hd_${CH[id].art || id}_1_${set === 'idle' ? 'idleA' : set}_f${i}.png`);
      });
    });
    ['green', 'red', 'blue', 'giant_purple', 'giant_blue'].forEach(c => [1, 2].forEach(i => this.load.image(`slime_${c}_${i}`, A + `hd_slime_${c}_f${i}.png`)));
    Object.keys(ENEMY_ART).forEach(t => ['side', 'front', 'back'].forEach(v => ['move', 'atk'].forEach(set => { for (let i = 1; i <= ENEMY_ART[t].n; i++) this.load.image(`en_${t}_${v}_${set}_${i}`, A + `hd_en_${t}_${v}_${set}_f${i}.png`); })));
  }

  function create() {
    sc = this;
    { // 世界鏡頭縮放；介面（scrollFactor 0 的物件）改由獨立的 1:1 鏡頭繪製
      sc.cameras.main.setZoom(ZOOM * RS);
      sc.uiCam = sc.cameras.add(0, 0, W * RS, H * RS); sc.uiCam.setName('ui'); sc.uiCam.setOrigin(0, 0); sc.uiCam.setZoom(RS);   // 介面用 390×844 座標：畫面像素 = 座標 × RS
      sc.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, (obj) => { obj.cameraFilter |= sc.uiCam.id; if (obj.setResolution) obj.setResolution(RS); });   // 預設：新物件只給世界鏡頭畫
      [Phaser.GameObjects.Sprite, Phaser.GameObjects.Image, Phaser.GameObjects.Text, Phaser.GameObjects.Graphics, Phaser.GameObjects.Zone, Phaser.GameObjects.Container, Phaser.GameObjects.TileSprite, Phaser.GameObjects.Rectangle, Phaser.GameObjects.Arc, Phaser.GameObjects.Ellipse].forEach(C => {
        if (!C || C.prototype.__uiPatched) return; const o = C.prototype.setScrollFactor; C.prototype.__uiPatched = true;
        C.prototype.setScrollFactor = function (x, y) { const r = o.call(this, x, y); if (x === 0 && sc.uiCam) this.cameraFilter = (this.cameraFilter & ~sc.uiCam.id) | sc.cameras.main.id; return r; };   // 介面物件：只給介面鏡頭畫
      });
    }
    ROSTER.forEach(id => {
      const mk = (set, n, rate, rep) => sc.anims.create({ key: `${id}_${set}`, frames: Array.from({ length: n }, (_, i) => ({ key: `${id}_${set}_${i + 1}` })), frameRate: rate, repeat: rep });
      mk('idle', 4, 6, -1); mk('atk', 6, 18, 0); if (id === 'oz') { mk('lose', 2, 4, 0); mk('ult', 6, 4, 0); ['', 'dn_', 'up_', 'fr_', 'bk_'].forEach(pre => [1, 2, 3].forEach(k => sc.anims.create({ key: `oz_${pre}cast${k}`, frames: Array.from({ length: 4 }, (_, i) => ({ key: `oz_${pre}cast${k}_${i + 1}` })), frameRate: 14, repeat: 0 }))); } if (id === 'sere') { mk('lose', 2, 4, 0); mk('ult', 6, 12, -1); ['', 'dn_', 'up_', 'fr_', 'bk_'].forEach(pre => [1, 2, 3].forEach(k => sc.anims.create({ key: `sere_${pre}cast${k}`, frames: Array.from({ length: 4 }, (_, i) => ({ key: `sere_${pre}cast${k}_${i + 1}` })), frameRate: 14, repeat: 0 }))); } if (id === 'zane') {
        mk('atk2', 6, 18, 0); mk('atk3', 6, 18, 0); mk('ult', 6, 12, -1); mk('lose', 2, 4, 0);
        ['', 'dn_', 'up_', 'fr_', 'bk_'].forEach(pre => { [1, 2, 3].forEach(k => sc.anims.create({ key: `zane_${pre}cast${k}`, frames: Array.from({ length: 4 }, (_, i) => ({ key: `zane_${pre}cast${k}_${i + 1}` })), frameRate: 18, repeat: 0 })); if (pre) ['atk2', 'atk3'].forEach(set => sc.anims.create({ key: `zane_${pre}${set}`, frames: Array.from({ length: 6 }, (_, i) => ({ key: `zane_${pre}${set}_${i + 1}` })), frameRate: 18, repeat: 0 })); });
      } mk('hit', 2, 10, 0); mk('win', 4, 6, -1);
      if (HAS_MOVE[id]) { mk('walk', 6, 6, -1); mk('run', 6, 8, -1); }
      if (HAS_DIAG[id]) ['dn', 'up', 'fr', 'bk'].forEach(dir => Object.keys(DIAG_FR).forEach(set => { const [nm, rate, rep] = DIAG_ANIM[set]; sc.anims.create({ key: `${id}_${dir}_${nm}`, frames: Array.from({ length: DIAG_FR[set] }, (_, i) => ({ key: `${id}_${dir}_${set}_${i + 1}` })), frameRate: rate, repeat: rep }); }));
    });
    Object.keys(ENEMY_ART).forEach(t => ['side', 'front', 'back'].forEach(v => { const cf = ENEMY_ART[t]; ['move', 'atk'].forEach(set => sc.anims.create({ key: `en_${t}_${v}_${set}`, frames: Array.from({ length: cf.n }, (_, i) => ({ key: `en_${t}_${v}_${set}_${i + 1}` })), frameRate: set === 'move' ? cf.mv : cf.at, repeat: set === 'move' ? -1 : 0 })); }));
    ['green', 'red', 'blue', 'giant_purple', 'giant_blue'].forEach(c => sc.anims.create({ key: `slime_${c}`, frames: [{ key: `slime_${c}_1` }, { key: `slime_${c}_2` }], frameRate: 3, repeat: -1 }));
    buildGround(); buildFxTextures(); buildFxAnims();
    sc.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    buildBlock(); drawObstacles(); buildMiniTex();
    sc.gWorld = sc.add.graphics().setDepth(5);
    sc.gHud = sc.add.graphics().setDepth(1900).setScrollFactor(0);
    sc.hudTexts = {};
    buildHud();
    buildInput();
    buildMiniLayers();
    buildAuto();
    buildPause();
    newGame();
    spawnPlayer();
    if (TUT) buildTutorial();
    expose();
    if (SIM) sc.sys.setVisible(false);
  }

  /* ---------- 玩家 ---------- */
  function spawnPlayer() {
    if (sc.plSp) sc.plSp.destroy();
    const id = act().id;
    sc.plSp = sc.add.sprite(G.pl.x, G.pl.y, `${id}_idle_1`).setOrigin(0.5, CH[id].oy || 92 / 96).setScale(1.05 * VIS);
    sc.plSp.play(`${id}_idle`);
    if (!sc.shadow) sc.shadow = sc.add.ellipse(0, 0, 44, 14, 0x000000, 0.35);
  }
  function faceTo(dx, dy) { const l = Math.hypot(dx, dy) || 1; G.pl.fx = dx / l; G.pl.fy = dy / l; }
  function nearest(maxD) {
    let best = null, bd = maxD;
    G.enemies.forEach(e => { if (e.dead) return; const d = dist(e, G.pl) - e.def.r; if (d < bd) { bd = d; best = e; } });
    return best;
  }
  function dmgMul() { return 1 + 0.2 * G.st.atk; }
  function rangeMul() { return 1 + 0.18 * G.st.rng; }
  function cdMul() { return 1 / (1 + 0.15 * G.st.as) / ((G.oz && G.oz.anchor) ? 1.3 : 1); }   // 大地之錨：攻擊速度 +30%

  function tryAttack() {
    const p = G.pl, d = def();
    if (p.atkCd > 0 || p.atkLock > 0) return;
    if (G.oz && G.oz.counter) return;   // 反震姿態：3 秒內不能攻擊
    const tgt = nearest(d.range * rangeMul());
    if (!tgt) return;
    faceTo(tgt.x - p.x, tgt.y - p.y);
    p.atkCd = d.cd * cdMul(); p.atkLock = 0.32; p.slashFired = false;
    { const sw = (p.sw = (p.sw || 0) + 1); sc.plSp.play(animName(act().id, act().id === 'zane' ? ['atk', 'atk2', 'atk3'][(sw - 1) % 3] : 'atk'), true); }   // 澤恩雙刀3連斬：每3下一輪，第3斬重擊
    sc.plSp.once('animationcomplete', () => { if (G.state === 'play' && sc.plSp) sc.plSp.play(animName(act().id, 'idle'), true); });
    const id = act().id, tx = tgt.x, ty = tgt.y;
    p.pend = { t: 0.19, d, tx, ty, id };
  }

  function hurtEnemy(e, base, from, quiet, o) {
    if (e.dead || e.invuln) return;
    let dmg = base * dmgMul(), crit = !!(o && o.fc) || (!(o && o.nocrit) && Math.random() < 0.05 + 0.12 * G.st.crit);
    if (crit) dmg *= 2;
    const em = elemMul(def().attr, e.def.attr); dmg *= em;   // 屬性相剋
    if (e.filmT > 0) dmg *= 0.8; if (e.shieldT > 0) dmg *= 0.7;   // 水膜、鏡盾
    if (e.paraT > 0 && G.st.para >= 3) dmg *= 1.3;   // 麻痺 Lv3 質變：麻痺期間敵人受到的傷害 +30%
    dmg = Math.round(dmg);
    e.hp -= dmg; e.hurtT = 0.4; e.flashT = 0.08;
    if (!SIM && !(o && o.nofx)) { if (!quiet) G.hitStop = Math.max(G.hitStop || 0, crit ? 0.07 : 0.035); playFx('melee', 3, e.x, e.y - 28, { s: crit ? 0.95 : 0.6, rot: rand(0, 6.28) }); burst(e.x, e.y - 28, crit ? 9 : 5, { tint: crit ? 0xffd24a : 0xfff2c0, v0: 60, v1: 170, l0: 200, l1: 380 }); if (crit) camShake(90, 0.004); }
    if (!quiet) { const a = Math.atan2(e.y - from.y, e.x - from.x); e.x += Math.cos(a) * 7; e.y += Math.sin(a) * 7; }
    if (SET.dmgNum) floatText(e.x, e.y - 50, String(dmg), (o && o.col) || (crit ? '#ffd24a' : em > 1 ? '#ff9a3a' : em < 1 ? '#9fb0c0' : '#ffffff'), o && o.col ? 12 : (crit ? 20 : em > 1 ? 16 : 14));
    if (!quiet) G.gauge = Math.min(100, G.gauge + 3);
    if (G.st.life) { const c0 = act(); heal(dmg * 0.04 * G.st.life * (G.st.life >= 3 && c0.hp < 0.4 * CH[c0.id].maxHp ? 2 : 1)); }   // 吸血 Lv3：血量低於 40% 時加倍
    if (e.hp <= 0) killEnemy(e); else if (o && o.normal) { onHitStatus(e); if (act().id === 'zane') zanePassive(e); }
    if (crit && G.st.crit >= 3 && !(o && o.noExp)) critBlast(e);
  }

  /* o：{ k 傷害倍率, quiet 不加集氣／擊退／頓挫, fc 必暴擊, extra 追加攻擊（不累計連擊數、不觸發連鎖雷等） } */
  function doHit(d, tx, ty, o) {
    o = o || {}; const p = G.pl, k = o.k || 1, q = !!o.quiet, fo = { fc: o.fc, normal: true }; let dm = d.dmg * k * ((G.oz && G.oz.anchor && d.art === 'oz') ? 1.5 : 1);   // 大地之錨：普攻傷害 +50%
    if (!o.extra) { p.hits++; if (d.combo3 && p.hits % 3 === 0) dm *= d.combo3; }   // 澤恩：每第 3 下傷害 ×1.5
    if (d.kind === 'arc') {
      const R = d.range * rangeMul();
      G.enemies.forEach(e => {
        if (e.dead) return;
        const dx = e.x - p.x, dy = e.y - p.y, dist0 = Math.hypot(dx, dy) || 1, dd = dist0 - e.def.r;
        if (dd > R) return;
        // 60 度扇形：敵人本身有大小，角度判定放寬敵人半徑對應的張角
        let da = Math.abs(Math.atan2(dy, dx) - Math.atan2(p.fy, p.fx)); if (da > Math.PI) da = Math.PI * 2 - da;
        if (da - Math.asin(Math.min(1, e.def.r / dist0)) > (d.arc || ARC) / 2) return;
        hurtEnemy(e, dm, p, q, fo);
      });
      if (!p.slashFired || o.extra) { if (d.art === 'oz') { if (!SIM) playFx('oz_hit', 0, p.x + p.fx * R * 0.4, p.y - 22, { s: R * 2 / 230, depth: 904 }); } else slashFx(p.x, p.y, Math.atan2(p.fy, p.fx), R); }   // 圓心＝腳下（與白色範圍圈、傷害判定同一個圓心與半徑）
    } else if (d.kind === 'bolt') {   // 瑟蕾：水彈直線飛行，命中第一隻敵人或飛到射程盡頭時爆炸（半徑 40，範圍傷害）
      const sp0 = 400, rr = d.range * rangeMul() + 30, b = { x: p.x + p.fx * 18, y: p.y - 42, vx: p.fx * sp0, vy: p.fy * sp0, life: rr / sp0, dmg: dm, fc: o.fc, sp: null };
      if (!SIM) { b.sp = sc.add.sprite(b.x, b.y, 'fx_sere_bolt', 0).setScale(0.5).setRotation(Math.atan2(p.fy, p.fx)).setDepth(907).setBlendMode(ADD()); b.sp.play('sbolt_fly'); playFx('sere_bolt', 2, b.x, b.y, { s: 0.45, depth: 908 }); }
      (G.bolts = G.bolts || []).push(b);
    } else if (d.kind === 'shot') {
      const pn = G.st.pierce ? [0, 2, 3, 4][G.st.pierce] : 1;
      G.shots.push({ x: p.x, y: p.y - 40, vx: p.fx * 430, vy: p.fy * 430, life: 0.9, dmg: dm, left: pn, step: G.st.pierce >= 3 ? 1 : 0.8, k: 1, fc: o.fc, hit: new Set() });
    } else {
      const R = d.range * rangeMul(), nx = p.fx, ny = p.fy;
      G.enemies.forEach(e => {
        if (e.dead) return;
        const dx = e.x - p.x, dy = e.y - p.y, along = dx * nx + dy * ny, side = Math.abs(dx * ny - dy * nx);
        if (along > -10 && along < R + e.def.r && side < 26 + e.def.r) hurtEnemy(e, dm, p, q, fo);
      });
      lineFx(p.x, p.y - 30, nx, ny, R);
    }
    if (o.extra) return;
    if (G.st.chain && p.hits % 4 === 0) chainLightning();
    if (G.st.slashwave && p.hits % [0, 5, 4, 3][G.st.slashwave] === 0) fireSlashWave();
    if (G.st.twin && Math.random() < [0, 0.2, 0.3, 0.4][G.st.twin]) G.tq.push({ t: 0.12, fn: () => { if (G.state === 'play') doHit(d, tx, ty, { k: 0.8, quiet: true, extra: true, fc: G.st.twin >= 3 }); } });
  }

  /* ---------- 冒險技能（第一批：A／B／C／F） ---------- */
  const skillHit = (e, k, from, o) => hurtEnemy(e, k * def().dmg, from, true, o);   // 技能傷害＝普攻傷害 D × 倍率；技能不加集氣、不擊退、不頓挫
  const inRingOf = (c, R, fn) => G.enemies.forEach(e => { if (!e.dead && dist(e, c) - e.def.r < R) fn(e); });
  function pushAway(e, from, px) { const a = Math.atan2(e.y - from.y, e.x - from.x); e.x = clamp(e.x + Math.cos(a) * px, ARENA.x0, ARENA.x1); e.y = clamp(e.y + Math.sin(a) * px, ARENA.y0, ARENA.y1); resolveSolid(e, e.def.r * 0.7); }
  function pullIn(e, to, px) { const d0 = dist(e, to); if (d0 <= e.def.r + 24) return; const a = Math.atan2(to.y - e.y, to.x - e.x), m = Math.min(px, d0 - e.def.r - 24); e.x += Math.cos(a) * m; e.y += Math.sin(a) * m; resolveSolid(e, e.def.r * 0.7); }
  const stunE = (e, t) => { const d = (e.type === 'boss' || e.def.paraHalf) ? t * 0.5 : t; e.stun = Math.max(e.stun, d); e.paraT = Math.max(e.paraT || 0, d); };   // 麻痺：首領時間減半
  const slowE = (e, f, t) => { const ff = e.type === 'boss' ? f * 0.5 : f; if (!(e.slowT > 0) || ff >= e.slowF) e.slowF = ff; e.slowT = Math.max(e.slowT || 0, t); };   // 緩速：首領效果減半
  /* D 類狀態（只由「普攻命中」觸發）：毒刃＝每秒傷害、不疊層只刷新；麻痺＝機率定身；緩速＝減速，Lv3 疊滿 3 次凍結 1 秒（之後 5 秒免疫、首領不會被凍結） */
  function onHitStatus(e) {
    if (G.st.poison) e.poison = { t: 5, k: [0, 0.25, 0.35, 0.45][G.st.poison], next: e.poison ? e.poison.next : 1 };
    if (G.st.para && Math.random() < [0, 0.08, 0.12, 0.16][G.st.para]) stunE(e, 2);
    if (G.st.slow) {
      slowE(e, [0, 0.25, 0.35, 0.45][G.st.slow], 3);
      if (G.st.slow >= 3 && e.type !== 'boss' && !(e.freezeImm > 0)) {
        e.slowN = (e.slowN || 0) + 1;
        if (e.slowN >= 3) { e.slowN = 0; e.stun = Math.max(e.stun, 1); e.freezeT = 1; e.freezeImm = 5; if (!SIM) ringFx(e.x, e.y - 20, 0xa8e8ff, 36); }
      }
    }
  }
  function spreadPoison(e) {   // 毒刃 Lv3 質變：中毒敵人死亡時，毒擴散給 80px 內的敵人
    if (!SIM) ringFx(e.x, e.y - 20, 0x8fe070, 80);
    G.enemies.forEach(x => { if (x !== e && !x.dead && dist(x, e) < 80 + x.def.r) x.poison = { t: 5, k: e.poison.k, next: 1 }; });
    e.poison = null;
  }
  const statusTint = (e) => e.freezeT > 0 ? 0xa8e8ff : e.paraT > 0 ? 0xfff090 : e.poison ? 0x9bff9b : e.slowT > 0 ? 0xa8c0ff : e.shieldT > 0 ? 0x8fc8ff : e.filmT > 0 ? 0xc8ecff : 0;

  function shieldBreak() {   // 守護盾 Lv3 質變：護盾破裂時震開周圍並造成 1.5 倍傷害
    const p = G.pl; if (!SIM) { ringFx(p.x, p.y - 20, 0x7be4df, 110); burst(p.x, p.y - 30, 10, { tint: 0x7be4df, v0: 80, v1: 200, l0: 250, l1: 500 }); }
    inRingOf(p, 110, e => { skillHit(e, 1.5, p); pushAway(e, p, 60); });
  }
  function counterWave() {   // 反擊：受傷時放出震波（半徑 80、冷卻 3 秒）；Lv3 質變：震波後多 1 秒無敵
    const p = G.pl, lv = G.st.counter, k = [0, 1.0, 1.5, 2.0][lv]; p.counterT = 3;
    if (!SIM) { ringFx(p.x, p.y - 20, 0xffb070, 80); burst(p.x, p.y - 30, 8, { tint: 0xffb070, v0: 80, v1: 180, l0: 200, l1: 420 }); }
    inRingOf(p, 80, e => skillHit(e, k, p));
    if (lv >= 3) G.inv = Math.max(G.inv, 1.0 + 0.45);
  }
  function startDash() {   // 迴避衝刺：朝遠離最近敵人的方向衝 120px（0.2 秒），期間無敵
    const p = G.pl, t = nearest(40); if (!t) return false;
    const a = Math.atan2(p.y - t.y, p.x - t.x);
    p.dash = { t: 0.2, dx: Math.cos(a), dy: Math.sin(a), hit: new Set() }; G.inv = Math.max(G.inv, 0.25);
    return true;
  }
  function stepDash(dt) {
    const p = G.pl, d = p.dash; d.t -= dt;
    p.x = clamp(p.x + d.dx * 600 * dt, ARENA.x0, ARENA.x1); p.y = clamp(p.y + d.dy * 600 * dt, ARENA.y0, ARENA.y1); resolveSolid(p, 12);
    if (!SIM) { burst(p.x, p.y - 20, 1, { tint: 0x9fe6ff, v0: 10, v1: 40, l0: 200, l1: 380 }); }
    if (G.st.dash >= 3) G.enemies.forEach(e => { if (!e.dead && !d.hit.has(e) && dist(e, p) - e.def.r < 36) { d.hit.add(e); skillHit(e, 1.5, p); } });
    if (d.t <= 0) p.dash = null;
  }

  function chainLightning() {
    const lv = G.st.chain, n = [0, 3, 3, 4][lv], kk = [0, 0.8, 1.1, 1.4][lv];
    const list = G.enemies.filter(e => !e.dead && dist(e, G.pl) < 260).sort((a, b) => dist(a, G.pl) - dist(b, G.pl)).slice(0, n);
    list.forEach(e => { zapFx(G.pl.x, G.pl.y - 40, e.x, e.y - 30); skillHit(e, kk, G.pl); });
  }
  function critBlast(e) {   // 會心一擊 Lv3 質變：暴擊時以被打的敵人為中心小爆炸（0.6 倍，不再連鎖）
    if (!SIM) ringFx(e.x, e.y - 20, 0xffd24a, 50);
    G.enemies.forEach(x => { if (x !== e && !x.dead && dist(x, e) < 50 + x.def.r) hurtEnemy(x, 0.6 * def().dmg, e, true, { noExp: true }); });
  }
  function fireSlashWave() {   // 劍氣波：飛行斬擊，Lv1～2 擊中第一隻就消失，Lv3 穿透
    const p = G.pl, lv = G.st.slashwave, sw = { x: p.x, y: p.y - 24, vx: p.fx * 430, vy: p.fy * 430, trav: 0, k: [0, 1.0, 1.3, 1.6][lv], pierce: lv >= 3, hit: new Set(), dead: false, sp: null };
    if (!SIM) sw.sp = sc.add.image(sw.x, sw.y, 'fx_crescent').setScale(0.3).setRotation(Math.atan2(p.fy, p.fx)).setBlendMode(ADD()).setTint(0xfff0a0).setDepth(905);
    G.swaves.push(sw);
  }
  function updateSwaves(dt) {
    const p = G.pl;
    G.swaves.forEach(w => {
      w.x += w.vx * dt; w.y += w.vy * dt; w.trav += Math.hypot(w.vx, w.vy) * dt;
      G.enemies.forEach(e => { if (!w.dead && !e.dead && !w.hit.has(e) && Math.hypot(e.x - w.x, e.y - 30 - w.y) < e.def.r + 22) { w.hit.add(e); skillHit(e, w.k, p); if (!w.pierce) w.dead = true; } });
      if (w.trav > 340 || w.x < 0 || w.x > WORLD_W || w.y < 0 || w.y > WORLD_H || solidAt(w.x, w.y + 40, 2, ['mountain', 'building'])) w.dead = true;
      if (w.sp) { w.sp.setPosition(w.x, w.y); if (w.dead) w.sp.destroy(); }
    });
    G.swaves = G.swaves.filter(w => !w.dead);
    // 環繞飛刃
    const n = G.st.blades ? [0, 2, 4, 6][G.st.blades] : 0;
    if (n) {
      p.bladeA += 12.57 * dt;   // 約 2 圈／秒
      for (let i = 0; i < n; i++) {
        const a = p.bladeA + i * Math.PI * 2 / n, bx = p.x + Math.cos(a) * 70, by = p.y - 20 + Math.sin(a) * 56;
        G.enemies.forEach(e => {
          if (e.dead) return; e.bcd = e.bcd || {}; if (e.bcd[i] > 0) e.bcd[i] -= dt;
          if (!(e.bcd[i] > 0) && Math.hypot(e.x - bx, e.y - 30 - by) < e.def.r + 12) { e.bcd[i] = 0.6; skillHit(e, 0.5, p); }
        });
        if (!SIM) {
          if (!sc.bladeSp) sc.bladeSp = [];
          if (!sc.bladeSp[i]) { sc.bladeSp[i] = sc.add.image(bx, by, 'fx_glow').setScale(0.62).setBlendMode(ADD()).setTint(0x7fc4ff); sc.bladeSp2 = sc.bladeSp2 || []; sc.bladeSp2[i] = sc.add.image(bx, by, 'fx_glow').setScale(0.26).setBlendMode(ADD()).setTint(0xeaf8ff); }
          const pu = 1 + 0.12 * Math.sin(G.t * 9 + i * 1.7);   // 魔法球：藍色光暈＋白色核心，輕微脈動
          sc.bladeSp[i].setPosition(bx, by).setScale(0.62 * pu).setDepth(by + 60).setVisible(true); sc.bladeSp2[i].setPosition(bx, by).setScale(0.26 * pu).setDepth(by + 61).setVisible(true);
        }
      }
    }
    if (!SIM && sc.bladeSp) for (let i = n; i < sc.bladeSp.length; i++) if (sc.bladeSp[i]) { sc.bladeSp[i].setVisible(false); sc.bladeSp2[i].setVisible(false); }
  }
  function waveRing(R, k) {
    const p = G.pl; ringFx(p.x, p.y - 20, 0x8ec8ff, R);
    inRingOf(p, R, e => { skillHit(e, k, p); const a = Math.atan2(e.y - p.y, e.x - p.x); e.x += Math.cos(a) * 24; e.y += Math.sin(a) * 24; });
  }
  function whirlSeg(i, k) {   // 旋風斬一段：以腳下為圓心，半徑＝射程
    const p = G.pl, R = Math.max(100, def().range) * rangeMul();
    if (!SIM) slashFxAt(p.x, p.y, i * 2.1 + rand(0, 0.4), R);
    inRingOf(p, R, e => { skillHit(e, k, p); if (G.st.whirl >= 3) pullIn(e, p, 20); });
  }
  function multiThunder(first) {   // 多重落雷（需持有落雷）：每次落雷再追加 +2／+4／+6 道，依序落在不同敵人身上（敵人不夠時輪流再劈），每道間隔 0.12 秒
    const n = [0, 2, 4, 6][G.st.multithunder || 0]; if (!n) return;
    const pool = G.enemies.filter(e => !e.dead && dist(e, G.pl) < 420 && e !== first).sort((a, b) => dist(a, G.pl) - dist(b, G.pl)); pool.push(first);
    for (let i = 0; i < n; i++) { const tg = pool[i % pool.length]; G.tq.push({ t: 0.12 * (i + 1), fn: () => { if (G.state === 'play' && !tg.dead) thunderStrike(tg); } }); }
  }
  function thunderStrike(t) {
    const p = G.pl, k = [0, 2.0, 2.5, 3.0][G.st.thunder];
    if (!SIM) { playFx('ultimate', 1, t.x, t.y, { oy: 0.78, s: 0.9, depth: 905 }); ringFx(t.x, t.y, 0xfff060, 50); }
    G.enemies.forEach(e => { if (!e.dead && dist(e, t) - e.def.r < 50) { skillHit(e, k, p); } });
  }
  function crystalBurst() {   // 結晶爆裂：撿到結晶時在腳下爆炸
    const p = G.pl, lv = G.st.burst, R = [0, 60, 75, 90][lv], k = [0, 1.5, 2.0, 2.5][lv];
    if (!SIM) { ringFx(p.x, p.y - 10, 0x9fe6ff, R); burst(p.x, p.y - 10, 8, { tint: 0x9fe6ff, v0: 60, v1: 160, l0: 200, l1: 420 }); }
    inRingOf(p, R, e => { skillHit(e, k, p); if (lv >= 3) pushAway(e, p, 80); });
  }

  function heal(n) {
    const c = act(); c.hp = Math.min(CH[c.id].maxHp, c.hp + n);
  }

  function damagePlayer(n, src) {
    if (G.inv > 0 || G.state !== 'play') return;
    if (G.vuln > 0) n = Math.round(n * 1.2);   // 首領第二階段破防：受傷 +20%
    if (G.pl.shield > 0) { G.pl.shield--; floatText(G.pl.x, G.pl.y - 80, '擋下', '#7be4df', 16); G.inv = 0.4; if (G.st.shield >= 3) shieldBreak(); return; }
    if (act().id === 'oz') {   // 歐斯：岩肌 −15%；反震姿態 −80%（累積擋下的傷害）；大地之錨 −70%
      n = Math.max(1, Math.round(n * TUNE.ozPas));
      if (G.oz && G.oz.counter) { const nn = Math.max(1, Math.round(n * TUNE.ozCt)); G.oz.counter.acc += n - nn; n = nn; if (!SIM) playFx('oz_counter', 2, G.pl.x, G.pl.y - 30, { s: 0.6, depth: 910 }); }
      if (G.oz && G.oz.anchor) n = Math.max(1, Math.round(n * TUNE.ozAn));
    }
    const c = act(); c.hp -= n; G.inv = (src && src.bite) ? 0.1 : 0.45;   // 多段攻擊（連咬／連爪）每下之間只給 0.1 秒無敵 { const k = (src && src.type) || '?'; G.dmgBy[k] = (G.dmgBy[k] || 0) + n; G.lastSrc = k; } G.gauge = Math.min(100, G.gauge + 5);
    if (SET.dmgNum) floatText(G.pl.x, G.pl.y - 80, '-' + n, '#ff6b5b', 16);
    G.pl.hurtT = 0.4;
    if (src && !(G.oz && G.oz.anchor)) { const a = Math.atan2(G.pl.y - src.y, G.pl.x - src.x); G.pl.x = clamp(G.pl.x + Math.cos(a) * 10, ARENA.x0, ARENA.x1); G.pl.y = clamp(G.pl.y + Math.sin(a) * 10, ARENA.y0, ARENA.y1); resolveSolid(G.pl, 12); }
    if (c.hp <= 0) { c.hp = 0; c.alive = false; autoSwap(); return; }
    if (G.st.counter && G.pl.counterT <= 0) counterWave();
  }

  function autoSwap() {
    const i = G.chars.findIndex(c => c.alive);
    if (i < 0) { endGame(false); return; }
    doSwap(i, true);
  }
  function doSwap(i, force) {
    if (!force && (G.swapCd > 0 || !G.chars[i].alive || i === G.active)) return;
    G.active = i; G.swapCd = force ? G.swapCd : 2.5; G.inv = 0.6; G.pl.atkLock = 0; G.pl.atkCd = 0.1;
    spawnPlayer();
    ringFx(G.pl.x, G.pl.y - 30, 0x7be4df);
  }

  function ultimate() {
    if (G.gauge < 100 || G.state !== 'play') return;
    G.gauge = 0;
    if (TUT && G.tut) G.tut.ultUsed = true;
    const u = def().ult, p = G.pl;
    { const tg = nearest(u.r || 99999) || nearest(99999); if (tg) faceTo(tg.x - p.x, tg.y - p.y); }   // 放必殺時自動轉向最近的敵人（jun 11-17）
    if (act().id === 'sere') { sc.plSp.play('sere_ult', true); }   // 瑟蕾：倒流之海專屬演出（原地召喚海潮 6 格循環）
    else if (act().id === 'oz') sc.plSp.play('oz_ult', true);   // 歐斯：山嶽崩落專屬演出（舉盾錘怒吼→砸地→承受震波→收勢，6格慢播不循環）
    else if (act().id === 'zane') sc.plSp.play('zane_ult', true);   // 澤恩：千雷亂舞專屬演出（原地連斬6格循環）
    else { sc.plSp.play(animName(act().id, 'atk'), true);
    sc.plSp.once('animationcomplete', () => sc.plSp && G.state === 'play' && sc.plSp.play(animName(act().id, 'idle'), true)); }
    if (!SIM && act().id === 'zane') { const ur = u.r || 120; playFx('zane_ult', 0, p.x, p.y - 4, { s: ur * 2 / 235, depth: 899 }); const rg = sc.add.sprite(p.x, p.y - 30, 'fx_zane_ult', 6).setScale(ur * 2 / 230).setDepth(905).setBlendMode(ADD()); rg.play('fxa_zane_ult_1'); rg.once('animationcomplete', () => { rg.play('zult_loop'); G.ultRun && (G.ultRun.fx = rg); if (!G.ultRun) rg.destroy(); }); G.ultRun0 = rg; }
    else if (!SIM && act().id === 'oz') { playFx('oz_ult', 0, p.x, p.y - 4, { s: 300 / 240, depth: 899, a: 0.95 }); }
    else if (!SIM && act().id === 'sere') { const ur = 250; playFx('sere_ult', 0, p.x, p.y - 6, { s: ur * 2 / 240, depth: 899, add: false, a: 0.9 }); const rg = sc.add.sprite(p.x, p.y - 30, 'fx_sere_ult', 6).setScale(2.0).setDepth(905).setAlpha(0.85); rg.play('fxa_sere_ult_1'); rg.once('animationcomplete', () => { rg.play('sult_loop'); }); G.ultRun0 = rg; }
    else if (!SIM) { const ur = u.r || 300; playFx('ultimate', 2, p.x, p.y - 4, { s: ur * 2.1 / 250, depth: 899 }); playFx('ultimate', 0, p.x, p.y - 24, { s: ur * 2 / 230, depth: 905 }); }
    if (!SIM) { const wt = act().id === 'sere' ? 0x9fe6ff : act().id === 'oz' ? 0xd8b070 : 0xfff0a0; popFx('fx_glow', p.x, p.y - 30, { s0: 1, s1: (u.r || 300) / 14, tint: wt, dur: 260, a0: 0.8, depth: 897 }); burst(p.x, p.y - 30, 18, { tint: wt, v0: 80, v1: 260, l0: 300, l1: 600 }); }
    G.ultRun = { t: 0, n: 0, u, bn: null };   // 必殺演出共 ULT_DUR 秒，期間 ULT_TICKS 次傷害判定，總傷害由 ultTotal 公式決定；演出期間角色鎖定不能移動／攻擊
    G.inv = Math.max(G.inv, ULT_DUR + 0.2);
    if (!SIM) {
      const bn = uiBanner(W / 2, 238, 230, 42, u.name, { depth: 1950, color: '#fff0bd' });
      bn.forEach(o => { o.setAlpha(0); sc.tweens.add({ targets: o, alpha: 1, duration: 120, onComplete: () => { if (o.scene) sc.tweens.add({ targets: o, alpha: 0, duration: 260, delay: ULT_DUR * 1000 - 380 }); } }); });
      G.ultRun.bn = bn;
    }
  }
  function endUltRun() { const r = G.ultRun; if (r && act().id === 'oz') { G.pl.shield = 1; G.oz = G.oz || {}; G.oz.ultShT = 6; if (!SIM) playFx('oz_ult', 3, G.pl.x, G.pl.y - 30, { s: 0.7, depth: 910 }); }   // 山嶽崩落結束：獲得一層護盾 6 秒
    if (G.ultRun0) { G.ultRun0.destroy(); G.ultRun0 = null; } if (r && (act().id === 'zane' || act().id === 'sere' || act().id === 'oz') && sc.plSp && G.state === 'play') sc.plSp.play(animName(act().id, 'idle'), true); if (!r) return; if (sc.plSp && sc.plSp.anims && sc.plSp.anims.isPaused) sc.plSp.anims.resume(); if (r.bn) r.bn.forEach(o => o.destroy()); G.ultRun = null; }

  /* 必殺第 n 次判定：每次造成 ultTotal/ULT_TICKS（吃劍氣強化／暴擊），不加集氣、不擊退，持續定身 */
  function ultimateTick(u, n) {
    const p = G.pl, per = ultTotal(def()) * PL_MUL / ULT_TICKS, ur = u.r || 300;
    const inR = G.enemies.filter(e => !e.dead && (u.all || dist(e, p) - e.def.r < u.r));
    if (!SIM) {
      const wat = act().id === 'sere', ert = act().id === 'oz';   // 瑟蕾：水系配色，不用通用的黃色雷光
      if (n === 0 || n === ULT_TICKS - 1) sc.cameras.main.flash(n ? 220 : 160, wat ? 190 : ert ? 235 : 255, wat ? 235 : ert ? 205 : 240, wat ? 255 : ert ? 150 : 160);
      if (n === ULT_TICKS - 1 && act().id === 'zane') playFx('zane_ult', 2, p.x, p.y - 20, { s: ur * 2.2 / 240, depth: 906 });
      if (n === ULT_TICKS - 1 && ert) playFx('oz_ult', 2, p.x, p.y - 4, { s: 1.35, depth: 906 });
      if (n === ULT_TICKS - 1 && act().id === 'sere') playFx('sere_ult', 2, p.x, p.y + 10, { oy: 0.82, s: 1.6, depth: 906 });
      camShake(n === 0 ? 240 : 140, n === 0 ? 0.007 : 0.004);
      if (!wat && !ert && n % 2 === 0 && n > 0) playFx('ultimate', 2, p.x, p.y - 4, { s: ur * 2.1 / 250, depth: 899 });
      if (!wat && !ert && n === 3) playFx('ultimate', 0, p.x, p.y - 24, { s: ur * 2 / 230, depth: 905 });
      for (let k = 0; k < 2; k++) {
        const t = inR.length ? inR[Math.floor(Math.random() * inR.length)] : null, a = rand(0, Math.PI * 2), rr = ur * rand(0.3, 0.8);
        if (ert) playFx('oz_ult', 1, t ? t.x : p.x + Math.cos(a) * rr, t ? t.y : p.y + Math.sin(a) * rr * 0.6, { oy: 0.85, s: 0.6, depth: 905 }); else if (wat) playFx('sere_vortex', 3, t ? t.x : p.x + Math.cos(a) * rr, t ? t.y : p.y + Math.sin(a) * rr * 0.6, { oy: 0.78, s: 0.9, depth: 905 }); else playFx('ultimate', 1, t ? t.x : p.x + Math.cos(a) * rr, t ? t.y : p.y + Math.sin(a) * rr * 0.6, { oy: 0.78, s: 0.9, depth: 905 });
      }
      burst(p.x, p.y - 30, 10, { tint: wat ? 0x9fe6ff : ert ? 0xd8b070 : 0xfff0a0, v0: 80, v1: 240, l0: 300, l1: 600 });
    }
    if (act().id === 'sere') inR.forEach(e => { if (e.type !== 'boss') pullIn(e, p, Math.max(30, (dist(e, p) - 60) * 0.45)); else pullIn(e, p, 25); });   // 倒流：把敵人倒拖向瑟蕾聚成一團
    inR.forEach(e => { hurtEnemy(e, per, p, true); e.stun = 0.5; });
  }

  /* ---------- 敵人 ---------- */
  /* 敵人生成點（11-21 鏡頭拉遠後）：一律在「目前畫面外 30px 以外」、離玩家 300～800px、可走的地方；找不到才退回舊的圓環 */
  function spawnPos() {
    const vw = W / ZOOM, vh = H / ZOOM, m = 30, wv = { x: clamp(G.pl.x - vw / 2, 0, WORLD_W - vw), y: clamp(G.pl.y - 470 / ZOOM, 0, WORLD_H - vh), width: vw, height: vh };   // 依玩家位置推算畫面範圍（不用鏡頭，開場鏡頭還沒就位）
    for (let i = 0; i < 60; i++) {
      const ang = rand(0, Math.PI * 2), r = rand(300, 800), x = clamp(G.pl.x + Math.cos(ang) * r, ARENA.x0, ARENA.x1), y = clamp(G.pl.y + Math.sin(ang) * r, ARENA.y0, ARENA.y1);
      if (x > wv.x - m && x < wv.x + wv.width + m && y > wv.y - m && y < wv.y + wv.height + m) continue;
      if (solidAt(x, y, 26)) continue;
      if (FIELD) { const ci = clamp(Math.floor(x / CELL), 0, GW - 1), cj = clamp(Math.floor(y / CELL), 0, GH - 1); if (FIELD[cj * GW + ci] < 0) continue; }
      return { x, y };
    }
    return null;
  }
  function spawnEnemy(type, px, py, opts) {
    opts = opts || {};
    const d = EN[type];
    let x = 320, y = 600, tries = 0, ok = false;
    if (px != null) { x = clamp(px, ARENA.x0, ARENA.x1); y = clamp(py, ARENA.y0, ARENA.y1); ok = true; }
    if (!ok) { const sp0 = spawnPos(); if (sp0) { x = sp0.x; y = sp0.y; ok = true; } }
    while (!ok && tries++ < 25) {
      const ang = rand(0, Math.PI * 2), r = rand(270, 480);
      x = clamp(G.pl.x + Math.cos(ang) * r, ARENA.x0, ARENA.x1); y = clamp(G.pl.y + Math.sin(ang) * r, ARENA.y0, ARENA.y1);
      ok = !solidAt(x, y, 26) && Math.hypot(x - G.pl.x, y - G.pl.y) > 220;
      if (ok && FIELD) { const ci = clamp(Math.floor(x / CELL), 0, GW - 1), cj = clamp(Math.floor(y / CELL), 0, GH - 1); if (FIELD[cj * GW + ci] < 0) ok = false; }
    }
    const key = d.tex;
    const sp = d.art ? sc.add.sprite(x, y, `en_${d.art}_front_move_1`).setOrigin(0.5, ENEMY_ART[d.art].oy).setScale(ENEMY_ART[d.art].sc * (d.big || 1) * VIS) : sc.add.sprite(x, y, key + '_1').setOrigin(0.5, 1).setScale(d.scale * VIS);
    sp.play(d.art ? `en_${d.art}_front_move` : key);
    G.enemies.push({ def: d, type, x, y, hp: Math.round(d.hp * (opts.hpMul || 1) * (TUT ? 0.6 : 1) * NODE_HPK), maxHp: Math.round(d.hp * (opts.hpMul || 1) * (TUT ? 0.6 : 1) * NODE_HPK), dmgK: NODE_DMGK * (TUT ? 0.5 : 1), life: opts.noFlee ? 0 : d.flee || 0, noFlee: !!opts.noFlee, invuln: !!opts.invuln, tutDodge: !!opts.tutDodge, tutBoss: !!opts.tutBoss, filmCd: rand(2, 8), bs: d.kind === 'mirror' ? { clawCd: 2, roarCd: 4, shieldCd: 8, summonCd: 10, castT: 0, p2: false } : null, sp, dead: false, atkCd: rand(0.2, 0.8), aoeCd: d.aoe ? rand(1, d.aoe.cd) : 99, tele: 0, tx: 0, ty: 0, flash: 0, stun: 0 });
  }

  function tutSpot(i) {
    const p = G.pl, f = Math.hypot(p.fx, p.fy) > 0.1 ? { x: p.fx, y: p.fy } : { x: 1, y: 0 }, side = { x: -f.y, y: f.x };
    const dist0 = 220 + (i % 3) * 45, side0 = (i - 1) * 58;
    const x = clamp(p.x + f.x * dist0 + side.x * side0, ARENA.x0 + 28, ARENA.x1 - 28);
    const y = clamp(p.y + f.y * dist0 + side.y * side0, ARENA.y0 + 28, ARENA.y1 - 28);
    return solidAt(x, y, 24) ? { x: clamp(p.x + f.x * 220, ARENA.x0 + 28, ARENA.x1 - 28), y: clamp(p.y + f.y * 220, ARENA.y0 + 28, ARENA.y1 - 28) } : { x, y };
  }
  function tutSpawn(type, n, opts) {
    opts = opts || {};
    const spawned = [];
    for (let i = 0; i < n; i++) { const q = tutSpot(i); spawnEnemy(type, q.x, q.y, opts); const e = G.enemies[G.enemies.length - 1]; spawned.push(e); }
    G.tut.spawned = (G.tut.spawned || []).concat(spawned);
    return spawned;
  }

  /* ---------- 第 1 章敵人行為（kind：tide／rare 走標準追擊＋接觸；mage／fin／mirror 自訂） ---------- */
  /* ---------- 澤恩（雷）：標記與引爆 ---------- */
  function addMark(e) {   // 雷印：持續 6 秒、場上最多 5 個（超過時最舊的消失）
    if (!e.mark) { const ms = G.enemies.filter(x => !x.dead && x.mark); if (ms.length >= 5) ms.sort((a, b) => a.mark.t - b.mark.t)[0].mark = null; }
    e.mark = { t: 6 };
  }
  function zanePassive(e) {   // 雷痕：連續命中同一隻敵人 5 次，自動附上雷印
    e.zn = (e.zn || 0) + 1; e.znT = 3;
    if (e.zn >= 5) { e.zn = 0; addMark(e); }
  }
  function zFxAt(sheet, row, x, y, o) { return SIM ? null : playFx(sheet, row, x, y, o); }
  function zLine(sheet, row, x1, y1, x2, y2, o) {   // 水平特效（長約220px，尖端朝右）拉伸到兩點之間
    if (SIM) return null; const d = Math.hypot(x2 - x1, y2 - y1) || 1; o = o || {};
    return playFx(sheet, row, (x1 + x2) / 2, (y1 + y2) / 2, Object.assign({ s: d / 220, rot: Math.atan2(y2 - y1, x2 - x1), depth: 906 }, o));
  }
  function zMark() {   // 一技 雷印：擲出雷鏢命中最近敵人 1.5D 並附上雷印
    const p = G.pl, t = nearest(360); if (!t) return false;
    faceTo(t.x - p.x, t.y - p.y);
    if (!SIM) {
      const x0 = p.x, y0 = p.y - 40, x1 = t.x, y1 = t.y - 30, ang = Math.atan2(y1 - y0, x1 - x0);
      const dart = sc.add.sprite(x0, y0, 'fx_zane_mark', 0).setScale(0.55).setRotation(ang).setDepth(907).setBlendMode(ADD()); dart.play('zmark_fly');
      sc.tweens.add({ targets: dart, x: x1, y: y1, duration: 110, onComplete: () => { dart.destroy(); playFx('zane_burst', 3, x1, y1, { s: 0.6, depth: 908 }); } });
    }
    skillHit(t, 1.5, p); if (!t.dead) addMark(t);
    return true;
  }
  function zStep(escape) {   // 二技 閃雷步：瞬移到最近雷印敵人身後（400 內）；沒有雷印就朝移動方向衝 200px；落點 1.0D＋麻痺 0.5 秒；位移期間無敵
    const p = G.pl; let tx, ty, face = null;
    const mk = escape ? null : G.enemies.filter(e => !e.dead && e.mark && dist(e, p) < 400).sort((a, b) => dist(a, p) - dist(b, p))[0];
    if (mk) { const a = Math.atan2(mk.y - p.y, mk.x - p.x); tx = mk.x + Math.cos(a) * (mk.def.r + 30); ty = mk.y + Math.sin(a) * (mk.def.r + 30); face = [mk.x - p.x, mk.y - p.y]; }
    else { const m = G.lastMove || { x: p.fx, y: p.fy }; tx = p.x + m.x * 200; ty = p.y + m.y * 200; }
    tx = clamp(tx, ARENA.x0, ARENA.x1); ty = clamp(ty, ARENA.y0, ARENA.y1);
    let k = 1; while (k > 0.2 && solidAt(p.x + (tx - p.x) * k, p.y + (ty - p.y) * k, 14)) k -= 0.1;   // 落點撞牆就縮短
    if (k <= 0.2) return false;
    const ox = p.x, oy = p.y; p.x = p.x + (tx - p.x) * k; p.y = p.y + (ty - p.y) * k; resolveSolid(p, 12);
    if (face) faceTo(face[0], face[1]); else faceTo(p.x - ox, p.y - oy);
    G.inv = Math.max(G.inv, 0.3);
    if (!SIM) { zFxAt('zane_step', 0, ox, oy - 24, { s: 0.7, depth: 906 }); zLine('zane_step', 2, ox, oy - 24, p.x, p.y - 24); zFxAt('zane_step', 1, p.x, p.y - 6, { s: 0.55, depth: 905 }); }
    inRingOf(p, 60, e => { skillHit(e, 1.0, p); stunE(e, 0.5); });
    return true;
  }
  function zBurst() {   // 三技 雷爆：引爆所有雷印，每個 3.0D，並以 50% 傷害傳導給周圍 90px 的敵人
    const p = G.pl, ms = G.enemies.filter(e => !e.dead && e.mark); if (!ms.length) return false;
    ms.forEach(e => {
      e.mark = null;
      if (!SIM) { zFxAt('zane_burst', 2, e.x, e.y, { oy: 0.78, s: 0.7, depth: 906 }); zFxAt('zane_burst', 0, e.x, e.y - 24, { s: 0.7, depth: 907 }); }
      skillHit(e, 3.0, p);
      G.enemies.forEach(x => { if (x !== e && !x.dead && dist(x, e) - x.def.r < 90) { skillHit(x, 1.5, p); zLine('zane_burst', 1, e.x, e.y - 24, x.x, x.y - 24, { s: Math.hypot(x.x - e.x, x.y - e.y) / 220 }); } });
    });
    if (!SIM) camShake(160, 0.005);
    return true;
  }
  /* ---------- 瑟蕾（水）：場地控制 ---------- */
  const inPool = (x, y, extra) => (G.pools || []).some(pl => Math.hypot(x - pl.x, (y - pl.y) * 1.6) < pl.r + (extra || 0));
  function killFxSprite(sp, rowKey) { if (!sp) return; if (!rowKey || SIM) { sp.destroy(); return; } sp.setAlpha(1); sp.play(rowKey); sp.once('animationcomplete', () => sp.destroy()); }
  function faceNearest(r) { const t = nearest(r); if (t) faceTo(t.x - G.pl.x, t.y - G.pl.y); return t; }
  function sPool() {   // 一技 水域：面向 140px 處放半徑 90 的水窪，5 秒，最多 2 個；圈內敵人減速 40%、每秒 0.4D
    const p = G.pl; faceNearest(400);
    const x = clamp(p.x + p.fx * 140, ARENA.x0, ARENA.x1), y = clamp(p.y + p.fy * 140, ARENA.y0, ARENA.y1);
    G.pools = G.pools || [];
    if (G.pools.length >= 2) { const o = G.pools.shift(); killFxSprite(o.sp, 'fxa_sere_pool_2'); }
    const pl = { x, y, r: 90, t: TUNE.sPoolT, sp: null };
    if (!SIM) { pl.sp = sc.add.sprite(x, y, 'fx_sere_pool', 0).setScale(0.8).setDepth(8).setAlpha(0.9); pl.sp.play('fxa_sere_pool_0'); pl.sp.once('animationcomplete', () => { if (pl.sp && pl.sp.anims) pl.sp.play('spool_loop'); }); }
    G.pools.push(pl); return true;
  }
  function sVortex() {   // 二技 潮汐漩渦：半徑 100、3 秒，吸附敵人、每秒 0.6D；放在水窪上吸力 ×2、傷害 ×1.5
    const p = G.pl, t = faceNearest(300); let x, y;
    if (t) { x = t.x; y = t.y; } else { x = p.x + p.fx * 140; y = p.y + p.fy * 140; }
    x = clamp(x, ARENA.x0, ARENA.x1); y = clamp(y, ARENA.y0, ARENA.y1);
    const pl = (G.pools || []).find(q => Math.hypot(x - q.x, y - q.y) < q.r); if (pl) { x = pl.x; y = pl.y; }
    const v = { x, y, r: 100, t: TUNE.sVorT, on: !!pl, sp: null };
    if (!SIM) { v.sp = sc.add.sprite(x, y, 'fx_sere_vortex', 0).setScale(0.95).setDepth(9).setAlpha(0.95); v.sp.play('svortex_loop'); }
    (G.vortex = G.vortex || []).push(v); return true;
  }
  function sWave() {   // 三技 怒濤：前方大浪（長 260、寬 120）3.0D 並推開 90px；浪經過水窪上的敵人額外 +1.0D 並定身 0.5 秒
    const p = G.pl; faceNearest(300); const nx = p.fx, ny = p.fy, L = 260, hw = 60;
    G.enemies.forEach(e => {
      if (e.dead) return; const dx = e.x - p.x, dy = e.y - p.y, along = dx * nx + dy * ny, side = Math.abs(dx * ny - dy * nx);
      if (along > -10 && along < L + e.def.r && side < hw + e.def.r) {
        const wet = inPool(e.x, e.y, e.def.r);
        skillHit(e, 3.0, p); if (e.dead) return; pushAway(e, p, 90);
        if (wet) { skillHit(e, 1.0, p); if (!e.dead) stunE(e, TUNE.sWaveStun); zFxAt('sere_vortex', 3, e.x, e.y, { oy: 0.78, s: 0.6, depth: 908 }); }
      }
    });
    if (!SIM) {
      const ang = Math.atan2(ny, nx), left = nx < 0, w = sc.add.sprite(p.x + nx * 60, p.y + ny * 60 - 20, 'fx_sere_vortex', 12).setScale(1.15).setDepth(907).setBlendMode(ADD());
      w.setFlipX(left).setRotation(left ? Math.atan2(ny, -nx) : ang); w.play('fxa_sere_vortex_2');
      sc.tweens.add({ targets: w, x: p.x + nx * (60 + L - 60), y: p.y + ny * (60 + L - 60) - 20, duration: 520, onComplete: () => w.destroy() });
    }
    return true;
  }
  function updateSere(dt) {
    const p = G.pl;
    G.sereIn = act().id === 'sere' && inPool(p.x, p.y, 0);   // 被動「潮汐」：站在自己的水域內，冷卻速度 +50%、移速 +20%
    (G.pools || []).forEach(pl => { pl.t -= dt; });
    G.pools = (G.pools || []).filter(pl => { if (pl.t > 0) return true; killFxSprite(pl.sp, 'fxa_sere_pool_2'); return false; });
    (G.vortex || []).forEach(v => { v.t -= dt; });
    G.vortex = (G.vortex || []).filter(v => { if (v.t > 0) return true; killFxSprite(v.sp, 'fxa_sere_vortex_1'); return false; });
    const D = def().dmg;
    G.enemies.forEach(e => {
      if (e.dead) return;
      if (inPool(e.x, e.y, 0)) {
        slowE(e, TUNE.sPoolSlow, 0.3); e.poolT = (e.poolT || 1) - dt;
        if (e.poolT <= 0) { e.poolT += 1; skillHit(e, 0.4, p, { nocrit: true, col: '#7fd8ff', nofx: true }); }
      }
      (G.vortex || []).forEach(v => {
        const dd = Math.hypot(e.x - v.x, e.y - v.y); if (dd > v.r + e.def.r || dd < 6) return;
        const spd = (v.on ? 190 : 95) * (e.type === 'boss' ? 0.4 : 1), a = Math.atan2(v.y - e.y, v.x - e.x), m = Math.min(spd * dt, dd);
        e.x += Math.cos(a) * m; e.y += Math.sin(a) * m; resolveSolid(e, e.def.r * 0.7);
        e.vorT = (e.vorT || 1) - dt; if (e.vorT <= 0) { e.vorT += 1; skillHit(e, v.on ? 0.9 : 0.6, p, { nocrit: true, col: '#7fd8ff', nofx: true }); }
      });
    });
  }
  /* ---------- 歐斯（土）：吸收與反彈 ---------- */
  function oBash() {   // 一技 盾擊：先衝刺前進約 100px（撞牆縮短），再打出前方半徑 120、90° 扇形 2.0D 並麻痺 0.5 秒
    const p = G.pl; faceNearest(400); const ox = p.x, oy = p.y;
    let tx = clamp(p.x + p.fx * 100, ARENA.x0, ARENA.x1), ty = clamp(p.y + p.fy * 100, ARENA.y0, ARENA.y1), k = 1;
    while (k > 0.2 && solidAt(p.x + (tx - p.x) * k, p.y + (ty - p.y) * k, 14)) k -= 0.1;
    if (k > 0.2) { p.x = p.x + (tx - p.x) * k; p.y = p.y + (ty - p.y) * k; resolveSolid(p, 12); }
    G.inv = Math.max(G.inv, 0.25);
    if (!SIM) { zLine('oz_hit', 1, ox, oy - 14, p.x, p.y - 14, { s: Math.max(0.4, Math.hypot(p.x - ox, p.y - oy) / 220) }); }
    const R = 120, base = Math.atan2(p.fy, p.fx);
    G.enemies.forEach(e => {
      if (e.dead) return; const dx = e.x - p.x, dy = e.y - p.y, d0 = Math.hypot(dx, dy) || 1; if (d0 - e.def.r > R) return;
      let da = Math.abs(Math.atan2(dy, dx) - base); if (da > Math.PI) da = Math.PI * 2 - da; if (da - Math.asin(Math.min(1, e.def.r / d0)) > Math.PI / 4) return;
      skillHit(e, 2.0, p); if (!e.dead) stunE(e, 0.5);
    });
    if (!SIM) { zFxAt('oz_hit', 2, p.x + p.fx * 70, p.y - 20, { s: 0.9, depth: 908 }); camShake(100, 0.004); }
    return true;
  }
  function oCounter() {   // 二技 反震姿態：3 秒不能攻擊（可移動）、受傷 −80% 並累積；結束時以累積值 ×1.5（至少 5.0D）釋放半徑 120 反震波
    G.oz = G.oz || {}; if (G.oz.counter) return false;
    const c = { t: 3, acc: 0, sp: null };
    if (!SIM) { c.sp = sc.add.sprite(G.pl.x, G.pl.y - 30, 'fx_oz_counter', 0).setScale(0.62).setDepth(G.pl.y + 30).setAlpha(0.9); c.sp.play('fxa_oz_counter_0'); c.sp.once('animationcomplete', () => { if (c.sp && c.sp.anims) c.sp.play('ozshell_loop'); }); }
    G.oz.counter = c; return true;
  }
  function oAnchor() {   // 三技 大地之錨：4 秒不能移動；受傷 −70%、免疫擊退；普攻傷害 +50%、攻速 +30%；周圍 130px 敵人減速 50%、每秒 1.0D
    G.oz = G.oz || {}; if (G.oz.anchor) return false;
    const a = { t: 4, sp: null, sp2: null, sp3: null, tick: 0 }, p = G.pl;
    if (!SIM) {
      a.sp = sc.add.sprite(p.x, p.y, 'fx_oz_anchor', 0).setScale(1.15).setDepth(7).setAlpha(0.9); a.sp.play('fxa_oz_anchor_0'); a.sp.once('animationcomplete', () => { if (a.sp && a.sp.anims) a.sp.play('ozcrack_loop'); });
      a.sp2 = sc.add.sprite(p.x, p.y, 'fx_oz_anchor', 12).setScale(1.1).setDepth(9).setAlpha(0.75); a.sp2.play('ozslow_loop');
      a.sp3 = sc.add.sprite(p.x, p.y - 30, 'fx_oz_anchor', 23).setScale(0.62).setDepth(p.y + 31).setAlpha(0.85);
    }
    G.oz.anchor = a; return true;
  }
  function updateOz(dt) {
    G.oz = G.oz || {}; const p = G.pl, o = G.oz, D = def().dmg;
    o.shT = (o.shT || 0) + dt; if (o.shT >= TUNE.ozSh) { o.shT = 0; if (p.shield < 1) p.shield = 1; }   // 岩肌：每 10 秒自動獲得一層護盾
    if (o.ultShT > 0) { o.ultShT -= dt; if (o.ultShT <= 0 && p.shield > 0) p.shield = 0; }   // 必殺後護盾持續 6 秒
    if (o.counter) {
      const c = o.counter; c.t -= dt; if (c.sp) c.sp.setPosition(p.x, p.y - 30).setDepth(p.y + 30);
      if (c.t <= 0) {
        const dmg = Math.max(5.0 * D, c.acc * 1.5);
        if (!SIM) { zFxAt('oz_counter', 3, p.x, p.y - 6, { s: 1.0, depth: 906 }); camShake(140, 0.005); }
        inRingOf(p, 120, e => hurtEnemy(e, dmg, p, true, { nocrit: true, col: '#ffd08a' }));
        killFxSprite(c.sp); o.counter = null;
      }
    }
    if (o.anchor) {
      const a = o.anchor; a.t -= dt; a.tick -= dt;
      if (a.sp) a.sp.setPosition(p.x, p.y); if (a.sp2) a.sp2.setPosition(p.x, p.y); if (a.sp3) a.sp3.setPosition(p.x, p.y - 30).setDepth(p.y + 31);
      const tick = a.tick <= 0; if (tick) a.tick = 1;
      inRingOf(p, 130, e => { slowE(e, 0.5, 0.3); if (tick) skillHit(e, 1.0, p, { nocrit: true, col: '#d8b070', nofx: true }); });
      if (a.t <= 0) { killFxSprite(a.sp); killFxSprite(a.sp2); killFxSprite(a.sp3); o.anchor = null; }
    }
  }
  const HERO_SK = {
    oz: [{ id: 'oz_bash', name: '盾擊', cd: 5, fn: () => oBash() }, { id: 'oz_counter', name: '反震姿態', cd: TUNE.ozCtCd, fn: () => oCounter() }, { id: 'oz_anchor', name: '大地之錨', cd: TUNE.ozAnCd, fn: () => oAnchor() }],
    sere: [{ id: 'sr_pool', name: '水域', cd: 5, fn: () => sPool() }, { id: 'sr_vortex', name: '潮汐漩渦', cd: 9, fn: () => sVortex() }, { id: 'sr_wave', name: '怒濤', cd: 13, fn: () => sWave() }], zane: [{ id: 'z_mark', name: '雷印', cd: 4, fn: () => zMark() }, { id: 'z_step', name: '閃雷步', cd: 8, fn: (esc) => zStep(esc) }, { id: 'z_burst', name: '雷爆', cd: 12, fn: () => zBurst() }] };
  function castSkill(i, arg) {   // 主動技施放：成功才進入冷卻；施放動作最多鎖 0.3 秒（鎖定代價對等規則）
    const hs = HERO_SK[act().id]; if (!hs || G.state !== 'play' || G.cd[i] > 0 || G.ultRun) return false;
    if (!hs[i].fn(arg)) return false;
    G.cd[i] = hs[i].cd; G.pl.atkLock = Math.max(G.pl.atkLock, 0.2);
    if (TUT && G.tut) { G.tut.skillMask = (G.tut.skillMask || 0) | (1 << i); G.tut.lastSkill = i; }
    if (!SIM && sc.plSp) { sc.plSp.play(animName(act().id, (act().id === 'zane' || act().id === 'sere' || act().id === 'oz') ? 'cast' + (i + 1) : 'atk'), true); sc.plSp.once('animationcomplete', () => { if (G.state === 'play' && sc.plSp) sc.plSp.play(animName(act().id, 'idle'), true); }); }
    floatText(G.pl.x, G.pl.y - 100, hs[i].name, '#ffe27a', 16);
    return true;
  }
  const spdFor = (e) => e.def.spd * (inForest(e.x, e.y) ? 0.55 : 1) * (e.slowT > 0 ? 1 - e.slowF : 1);
  function chaseP(e, p, dt, sp) { const tg = steerTarget(e, p), tx = tg.x - e.x, ty = tg.y - e.y, td = Math.hypot(tx, ty) || 1; e.x += tx / td * sp * dt; e.y += ty / td * sp * dt; resolveSolid(e, e.def.r * 0.7); }
  function fleeEnemy(e) { e.dead = true; floatText(e.x, e.y - 60, '逃走了…', '#cfd6e6', 16); if (SIM) { e.sp.destroy(); return; } sc.tweens.add({ targets: e.sp, alpha: 0, duration: 300, onComplete: () => e.sp.destroy() }); }
  function stepEnemyCustom(e, dt, p) {
    const k = e.def.kind; if (k === 'tide' || k === 'rare') return false;
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1, sp = spdFor(e);
    if (k === 'mage') {   // 鏡潮術士：保持 190～260 距離，定時在玩家位置放預警圈
      const [lo, hi] = e.def.keep;
      if (d < lo) { e.x -= dx / d * sp * dt; e.y -= dy / d * sp * dt; resolveSolid(e, e.def.r * 0.7); } else if (d > hi) chaseP(e, p, dt, sp);
      e.aoeCd -= dt; if (e.aoeCd <= 0 && (e.tutDodge || d < e.def.aoe.range)) { e.tele = e.def.aoe.tele; e.tx = p.x; e.ty = p.y; e.tutDodgePending = !!e.tutDodge; }
      return true;
    }
    if (k === 'fin') {    // 赤鰭獵獸：快速追擊；距離 70 內預警 0.4 秒後 3 連咬（每下 5），冷卻 2.5 秒
      if (e.bite) {
        e.bite.t -= dt;
        if (!e.bite.go && e.bite.t <= 0) { e.bite.go = true; e.bite.n = 0; e.bite.nt = 0; }
        if (e.bite.go) { e.bite.nt -= dt; if (e.bite.nt <= 0) { e.bite.nt = 0.15; e.bite.n++; if (d - e.def.r < 80) damagePlayer(5 * (e.dmgK || 1), { x: e.x, y: e.y, type: e.type, bite: true }); playEnemyAtk(e); if (e.bite.n >= 3) { e.bite = null; e.biteCd = 2.5; } } }
        return true;
      }
      e.biteCd = Math.max(0, (e.biteCd || 0) - dt);
      if (e.biteCd <= 0 && d - e.def.r < 70) { e.bite = { t: 0.4, go: false }; return true; }
      if (d > e.def.r + 14) chaseP(e, p, dt, sp);
      return true;
    }
    if (k === 'mirror') { stepBoss(e, dt, p, d, dx, dy); return true; }
    return false;
  }
  /* 通用預警（首領用）：圓形或扇形，倒數結束才判定；delay＝延遲出現 */
  function addTg(o) { G.tg.push(Object.assign({ t: o.dur, delay: 0, done: false }, o)); }
  function updateTg(dt) {
    G.tg.forEach(t => { if (t.delay > 0) { t.delay -= dt; return; } t.t -= dt; if (t.t <= 0 && !t.done) { t.done = true; resolveTg(t); } });
    G.tg = G.tg.filter(t => !t.done);
  }
  function resolveTg(t) {
    const p = G.pl; let hit;
    if (t.shape === 'fan') {
      const dx = p.x - t.x, dy = p.y - t.y, dd = Math.hypot(dx, dy); let da = Math.abs(Math.atan2(dy, dx) - t.ang); if (da > Math.PI) da = Math.PI * 2 - da;
      hit = dd < t.range + 12 && da < t.arc / 2 + 0.12;
      if (!SIM) playFx('melee', 2, t.x, t.y - 8, { ox: 0.3, oy: 0.5, rot: t.ang, s: t.range / 165, depth: 906 });
    } else {
      hit = Math.hypot(p.x - t.x, p.y - t.y) < t.r;
      if (!SIM) { playFx('world', 1, t.x, t.y, { oy: 0.62, s: t.r * 2 / 220, add: false, depth: 898 }); camShake(120, 0.004); }
    }
    if (hit) { damagePlayer(t.dmg, { x: t.x, y: t.y, type: 'boss', bite: t.shape === 'fan' }); if (t.vuln) G.vuln = 5; }
  }
  const teleList = (es) => es.filter(e => e.tele > 0).map(e => ({ tx: e.tx, ty: e.ty, r: e.def.aoe.r }))
    .concat(es.filter(e => e.bite && !e.bite.go).map(e => ({ tx: e.x, ty: e.y, r: 78 })))
    .concat(G.tg.map(t => t.shape === 'fan' ? { tx: t.x + Math.cos(t.ang) * t.range / 2, ty: t.y + Math.sin(t.ang) * t.range / 2, r: t.range / 2 + 12 } : { tx: t.x, ty: t.y, r: t.r }));
  function stepBoss(e, dt, p, d, dx, dy) {   // 逆潮鏡獸
    const b = e.bs; b.clawCd -= dt; b.roarCd -= dt; b.shieldCd -= dt; b.summonCd -= dt; if (b.castT > 0) b.castT -= dt;
    if (b.shieldCd <= 0) { b.shieldCd = 15; e.shieldT = 3; floatText(e.x, e.y - 90, '鏡盾', '#9fd8ff', 16); }   // 鏡盾：3 秒內受到傷害 ×0.7
    const p2 = e.hp < e.maxHp * 0.5;
    if (p2 && !b.p2) { b.p2 = true; b.summonCd = 2; banner('逆潮鏡獸　暴走！'); }
    if (p2 && b.summonCd <= 0) { b.summonCd = BT.addCd; let n = G.enemies.filter(x => !x.dead && x.type === 'tide').length; for (let i = 0; i < BT.addN && n < BT.addMax; i++, n++) spawnEnemy('tide', e.x + rand(-70, 70), e.y + rand(-70, 70)); }   // 第二階段：每 10 秒召喚 2 隻潮藍（最多 6 隻）
    if (b.castT > 0) return;   // 施放中站定
    if (b.roarCd <= 0 && d < 420) {   // 逆流咆哮：玩家周圍依序出現 3 個預警圈
      b.roarCd = BT.roarCd; b.castT = BT.roarDur + (BT.roarN - 1) * BT.roarGap; playEnemyAtk(e);
      for (let i = 0; i < BT.roarN; i++) { const a = rand(0, 6.28), r = i ? rand(70, 110) : 0; addTg({ shape: 'circle', x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r, r: 90, dur: BT.roarDur, delay: i * BT.roarGap, dmg: BT.roarDmg * (e.dmgK || 1), vuln: p2 }); }
      return;
    }
    if (b.clawCd <= 0 && d - e.def.r < 120) {   // 揮爪連擊：前方扇形預警 0.7 秒，連 2 下
      b.clawCd = 3; b.castT = 0.95; playEnemyAtk(e); const ang = Math.atan2(dy, dx);
      [0.7, 0.95].forEach(t => addTg({ shape: 'fan', x: e.x, y: e.y, ang, range: 130, arc: 1.22, dur: t, dmg: BT.clawDmg * (e.dmgK || 1) }));
      return;
    }
    if (d > e.def.r + 40) chaseP(e, p, dt, spdFor(e));
  }

  /* 敵人面向玩家：玩家在下方→正面；在上方→背面；其餘→側視（側視圖是朝左版，玩家在右邊時翻轉） */
  function enemyView(e) { const dx = G.pl.x - e.x, dy = G.pl.y - e.y, l = Math.hypot(dx, dy) || 1; return dy / l > 0.38 ? 'front' : dy / l < -0.38 ? 'back' : 'side'; }
  function playEnemyAtk(e) {
    if (!e.def.art || !e.sp.active) return;
    e.atking = true; e.sp.play(`en_${e.def.art}_${enemyView(e)}_atk`, true);
    e.sp.once('animationcomplete', () => { e.atking = false; });
  }
  function killEnemy(e) {
    e.dead = true; G.xpGain = (G.xpGain || 0) + (TX.XP_OF[e.type] || 11); G.goldGain = (G.goldGain || 0) + TX.GOLD_PER_ENEMY; G.kills = (G.kills || 0) + 1;
    if (e.def.kind === 'mirror') G.tg = [];
    if (e.poison && G.st.poison >= 3) spreadPoison(e);
    if (!SIM) { const gc = { green: 0x9aa7a0, red: 0xff8a50, blue: 0x5aa6e8, boss: 0xb0b8c8, tide: 0x5aa6e8, mage: 0x8ab4ff, fin: 0xff8a50, rare: 0x5aa6e8 }[e.type] || 0xc0c8d0, big = e.type === 'boss'; burst(e.x, e.y - 24, big ? 26 : 12, { tint: gc, key: 'fx_glow', add: false, v0: 50, v1: big ? 220 : 150, l0: 300, l1: 620, z0: 0.2, z1: big ? 0.6 : 0.4, grav: 260 }); playFx('world', 0, e.x, e.y, { oy: 0.78, s: big ? 1.9 : 0.8, add: false, tint: big ? 0xd0d8e8 : 0xffffff }); if (big) camShake(260, 0.01); }
    const n = e.def.crystal;
    for (let i = 0; i < n; i++) G.pickups.push({ x: e.x + rand(-14, 14), y: e.y + rand(-10, 10), t: 0, fly: false });
    if (SIM) { e.sp.destroy(); return; }
    sc.tweens.add({ targets: e.sp, alpha: 0, scaleY: e.sp.scaleY * 0.3, duration: 220, onComplete: () => e.sp.destroy() });
  }

  function relocateEnemy(e) {
    const sp0 = spawnPos(); if (sp0) { e.x = sp0.x; e.y = sp0.y; return; }
    for (let i = 0; i < 40; i++) {
      const ang = rand(0, Math.PI * 2), r = rand(270, 480), x = clamp(G.pl.x + Math.cos(ang) * r, ARENA.x0, ARENA.x1), y = clamp(G.pl.y + Math.sin(ang) * r, ARENA.y0, ARENA.y1);
      const ci = clamp(Math.floor(x / CELL), 0, GW - 1), cj = clamp(Math.floor(y / CELL), 0, GH - 1);
      if (!solidAt(x, y, 26) && FIELD && FIELD[cj * GW + ci] >= 0) { e.x = x; e.y = y; return; }
    }
  }
  function updateEnemies(dt) {
    const p = G.pl;
    fieldT -= dt;
    { const pc = clamp(Math.floor(p.y / CELL), 0, GH - 1) * GW + clamp(Math.floor(p.x / CELL), 0, GW - 1); if (!FIELD || pc !== fieldCell || fieldT <= 0) { buildField(p.x, p.y); fieldT = 0.5; } }
    G.enemies.forEach(e => {
      if (e.dead) return;
      e.hurtT = Math.max(0, (e.hurtT || 0) - dt); e.stun = Math.max(0, e.stun - dt); if (e.slowT > 0) e.slowT -= dt; else e.slowN = 0;
      if (e.def.film) { e.filmCd -= dt; if (e.filmCd <= 0) { e.filmT = 2; e.filmCd = 8; } }
      if (e.filmT > 0) e.filmT -= dt; if (e.shieldT > 0) e.shieldT -= dt;
      if (e.def.flee && !e.noFlee) { e.life -= dt; if (e.life <= 0) { fleeEnemy(e); return; } }
      if (e.mark) { e.mark.t -= dt; if (e.mark.t <= 0) e.mark = null; }
      if (e.znT > 0) { e.znT -= dt; if (e.znT <= 0) e.zn = 0; }
      if (e.paraT > 0) e.paraT -= dt; if (e.freezeT > 0) e.freezeT -= dt; if (e.freezeImm > 0) e.freezeImm -= dt;
      if (e.poison) { e.poison.t -= dt; e.poison.next -= dt; if (e.poison.next <= 0) { e.poison.next += 1; skillHit(e, e.poison.k, G.pl, { nocrit: true, col: '#8fe070', nofx: true }); } if (e.poison && e.poison.t <= 0) e.poison = null; }
      if (e.dead) return;
      e.stuckT = (e.stuckT || 0) + dt;
      if (e.stuckT >= 3) {   // 每 3 秒檢查：該追人卻幾乎沒動 → 被卡住，搬到走得到玩家的地方
        const far = Math.hypot(p.x - e.x, p.y - e.y) > e.def.r + 40;
        if (far && e.sx != null && Math.hypot(e.x - e.sx, e.y - e.sy) < 8 && e.tele <= 0) relocateEnemy(e);
        e.sx = e.x; e.sy = e.y; e.stuckT = 0;
      }
      e.atkCd -= dt;
      if (e.tele > 0) {
        e.tele -= dt;
        if (e.def.art && e.tele < 0.5 && !e.slamAnim) { e.slamAnim = true; playEnemyAtk(e); }
        if (e.tele <= 0) {
          const a = e.def.aoe; playFx('world', 1, e.tx, e.ty, { oy: 0.62, s: a.r * 2 / 220, add: false, depth: 898 });
          if (!SIM) { burst(e.tx, e.ty, e.type === 'boss' ? 16 : 8, { tint: 0xd8c8b0, add: false, v0: 40, v1: 150, l0: 300, l1: 600, z0: 0.3, z1: 0.6, grav: 120 }); camShake(e.type === 'boss' ? 200 : 100, e.type === 'boss' ? 0.008 : 0.003); }
          const hit = Math.hypot(p.x - e.tx, p.y - e.ty) < a.r;
          if (e.tutDodgePending) { e.tutDodgePending = false; const t = G.tut; t.dodgeAttempts = (t.dodgeAttempts || 0) + 1; if (!hit || t.dodgeAttempts >= 3) { e.invuln = false; setTutorialStep('auto'); } else { t.hint = 'dodgeRetry'; e.aoeCd = 1.2; } }
          if (hit) damagePlayer(a.dmg * (e.dmgK || 1), { x: e.tx, y: e.ty, type: 'aoe_' + e.type });
          e.aoeCd = a.cd; e.slamAnim = false;
        }
      } else if (e.stun <= 0 && !(e.def.kind && stepEnemyCustom(e, dt, p))) {
        const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
        if (d > e.def.r + 14) {
          const tg = steerTarget(e, p), tx = tg.x - e.x, ty = tg.y - e.y, td = Math.hypot(tx, ty) || 1, sp = e.def.spd * (inForest(e.x, e.y) ? 0.55 : 1) * (e.slowT > 0 ? 1 - e.slowF : 1);
          e.x += tx / td * sp * dt; e.y += ty / td * sp * dt;
          resolveSolid(e, e.def.r * 0.7);
        }
        else if (e.atkCd <= 0 && !e.def.noContact) { e.atkCd = e.def.contactCd || 0.9; playEnemyAtk(e); damagePlayer(e.def.dmg * (e.dmgK || 1), e); }
        if (e.def.aoe) { e.aoeCd -= dt; if (e.aoeCd <= 0 && d < e.def.aoe.r + 140) { e.tele = e.def.aoe.tele; e.tx = p.x; e.ty = p.y; } }
      }
      e.x = clamp(e.x, ARENA.x0, ARENA.x1); e.y = clamp(e.y, ARENA.y0, ARENA.y1);
    });
    for (let i = 0; i < G.enemies.length; i++) for (let j = i + 1; j < G.enemies.length; j++) {
      const a = G.enemies[i], b = G.enemies[j]; if (a.dead || b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, m = a.def.r + b.def.r;
      if (d < m) { const k = (m - d) / 2; a.x -= dx / d * k; a.y -= dy / d * k; b.x += dx / d * k; b.y += dy / d * k; }
    }
    G.enemies = G.enemies.filter(e => !(e.dead && !e.sp.active));
  }

  /* ---------- 波數 ---------- */
  function updateWaves(dt) {
    if (G.state !== 'play') return;
    if (TUT) return;
    const alive = G.enemies.filter(e => !e.dead).length;
    if (G.spawnQ.length) {
      G.spawnT -= dt;
      if (G.spawnT <= 0 && alive < 12) { spawnEnemy(G.spawnQ.shift()); G.spawnT = 0.55; }
      return;
    }
    if (G.wave >= 0) G.waveT += dt;
    const last = G.wave >= WAVES.length - 1, forced = !last && G.waveT >= 20;   // 每波最多 20 秒，超過就強制出下一波
    if (alive === 0 || forced) {
      G.waveGap -= dt;
      if (G.waveGap <= 0) {
        G.wave++;
        if (G.wave >= WAVES.length) { endGame(true); return; }
        G.spawnQ = []; WAVES[G.wave].forEach(([t, n]) => { for (let i = 0; i < n; i++) G.spawnQ.push(t); });
        if (!LEGACY && G.wave === G.rareWave) G.spawnQ.push('rare');   // 稀有怪：每節 6% 機率中途出現
        G.spawnQ.sort(() => Math.random() - 0.5); G.waveGap = 1.2; G.spawnT = 0; G.waveT = 0; (G.wt = G.wt || []).push(Math.round(G.t));
        banner(G.wave === 0 && !LEGACY ? `第${NODE_N}節　${NODE_NAMES[NODE_N]}` : G.wave === WAVES.length - 1 ? (WAVES[G.wave].some(([t]) => t === 'boss') ? 'BOSS' : 'FINAL WAVE') : `WAVE ${G.wave + 1}`);
      }
    }
  }

  /* ---------- 結晶與技能 ---------- */
  function updatePickups(dt) {
    const p = G.pl;
    G.pickups.forEach(c => {
      c.t += dt;
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d < [100, 150, 200, 250][G.st.magnet] || c.fly) { c.fly = true; c.x += (p.x - c.x) / d * 340 * dt; c.y += (p.y - 20 - c.y) / d * 340 * dt; }
      if (d < 20) { c.gone = true; G.crystals++; if (G.st.burst) crystalBurst(); if (!SIM) { playFx('world', 2, p.x, p.y - 24, { s: 0.45 }); burst(p.x, p.y - 24, 4, { tint: 0x9fe6ff, v0: 30, v1: 90, l0: 200, l1: 380 }); } }
    });
    G.pickups = G.pickups.filter(c => !c.gone);
    if (G.crystals >= G.need && G.state === 'play') { G.crystals -= G.need; G.level++; G.need = Math.round(G.need * 1.35) + 1; if (G.st.magnet >= 3) G.pickups.forEach(c => { c.fly = true; }); openPick(); }
  }

  function pickSkill(s, objs) {
    G.st[s.id] = (G.st[s.id] || 0) + 1; G.picks.push(s.name);
    if (s.id === 'shield') { G.pl.shield = Math.max(G.pl.shield, 1); }
    objs.forEach(o => o.destroy());
    G.pickCtx = null;
    G.state = 'play';
    floatText(G.pl.x, G.pl.y - 110, s.name + ' Lv' + G.st[s.id], '#9fe08a', 18);
  }

  function updateSkillsTimers(dt) {
    const p = G.pl;
    if (G.st.shield) {
      p.shieldT += dt; const every = [0, 10, 8, 6][G.st.shield];
      if (p.shieldT >= every) { p.shieldT = 0; if (p.shield < 1) p.shield = 1; }
    }
    if (G.st.wave) {
      const lv = G.st.wave; p.waveT += dt;
      if (p.waveT >= [0, 6, 5, 4][lv]) { p.waveT = 0; const k = [0, 0.9, 1.45, 2.0][lv]; waveRing(90, k); if (lv >= 3) G.tq.push({ t: 0.5, fn: () => { if (G.state === 'play') waveRing(130, k); } }); }
    }
    if (G.st.whirl) {
      const lv = G.st.whirl; p.whirlT += dt;
      if (p.whirlT >= [0, 8, 7, 6][lv]) { p.whirlT = 0; const k = [0, 0.7, 0.85, 1.0][lv]; for (let i = 0; i < 3; i++) G.tq.push({ t: i * 0.2, fn: () => { if (G.state === 'play') whirlSeg(i, k); } }); }
    }
    p.counterT = Math.max(0, p.counterT - dt);
    if (G.st.dash) {
      p.dashT += dt;
      if (p.dashT >= [0, 9, 7, 5][G.st.dash] && !p.dash && startDash()) p.dashT = 0;
    }
    if (G.st.thunder) {
      p.thunderT += dt;
      if (p.thunderT >= [0, 5, 4, 3][G.st.thunder]) { const t = nearest(420); if (t) { p.thunderT = 0; thunderStrike(t); multiThunder(t); } }
    }
  }

  /* ---------- 戰鬥特效：程式材質＋疊加混合＋粒子（Codex 特效圖到貨後會逐步換成精靈圖） ---------- */
  const ADD = () => Phaser.BlendModes.ADD;
  function buildFxTextures() {
    const mk = (key, w, h, draw) => { if (sc.textures.exists(key)) return; const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); sc.textures.addCanvas(key, cv); };
    mk('fx_glow', 64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
    mk('fx_star', 64, 64, (c) => {
      c.translate(32, 32); c.fillStyle = 'rgba(255,255,255,1)'; c.shadowColor = 'white'; c.shadowBlur = 8;
      c.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 === 0 ? 28 : 5; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath(); c.fill();
    });
    mk('fx_crescent', 256, 256, (c) => {   // 面向右的新月劍光，圓心在 (128,128)
      const R = 120, a = Math.PI * 0.2, sx = 128 + Math.cos(-a) * R, sy = 128 + Math.sin(-a) * R, ex = 128 + Math.cos(a) * R, ey = 128 + Math.sin(a) * R;
      const g = c.createRadialGradient(128, 128, 60, 128, 128, R); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,1)');
      c.shadowColor = 'white'; c.shadowBlur = 12; c.fillStyle = g;
      c.beginPath(); c.arc(128, 128, R, -a, a); c.quadraticCurveTo(128 + R * 0.62, 128, sx, sy); c.closePath(); c.fill();
    });
    mk('fx_ring', 256, 256, (c) => { const g = c.createRadialGradient(128, 128, 0, 128, 128, 128); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.78, 'rgba(255,255,255,0)'); g.addColorStop(0.93, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 256, 256); });
  }
  /* Codex 特效精靈圖（A7）：每張 6 欄×4 列，一列＝一個特效 */
  const FXFPS = { melee: [34, 34, 32, 30], ultimate: [14, 16, 14, 10], world: [14, 15, 16, 10], oz_hit: [18, 20, 18, 12], oz_counter: [14, 10, 18, 16], oz_anchor: [14, 10, 10, 12], oz_ult: [14, 14, 16, 12], sere_bolt: [20, 18, 18, 16], sere_pool: [14, 10, 12, 16], sere_vortex: [10, 12, 14, 16], sere_ult: [12, 12, 14, 12], zane_mark: [18, 14, 12, 14], zane_step: [16, 16, 18, 12], zane_burst: [16, 16, 14, 16], zane_ult: [14, 14, 16, 10] };
  function buildFxAnims() {
    if (!sc.anims.exists('ozshell_loop') && sc.textures.exists('fx_oz_counter')) {
      sc.anims.create({ key: 'ozshell_loop', frames: sc.anims.generateFrameNumbers('fx_oz_counter', { start: 6, end: 11 }), frameRate: 8, repeat: -1 });
      sc.anims.create({ key: 'ozcrack_loop', frames: sc.anims.generateFrameNumbers('fx_oz_anchor', { start: 6, end: 11 }), frameRate: 8, repeat: -1 });
      sc.anims.create({ key: 'ozslow_loop', frames: sc.anims.generateFrameNumbers('fx_oz_anchor', { start: 12, end: 17 }), frameRate: 8, repeat: -1 });
    }
    if (!sc.anims.exists('sbolt_fly') && sc.textures.exists('fx_sere_bolt')) {
      sc.anims.create({ key: 'sbolt_fly', frames: sc.anims.generateFrameNumbers('fx_sere_bolt', { start: 0, end: 5 }), frameRate: 24, repeat: -1 });
      sc.anims.create({ key: 'spool_loop', frames: sc.anims.generateFrameNumbers('fx_sere_pool', { start: 6, end: 11 }), frameRate: 8, repeat: -1 });
      sc.anims.create({ key: 'svortex_loop', frames: sc.anims.generateFrameNumbers('fx_sere_vortex', { start: 0, end: 5 }), frameRate: 14, repeat: -1 });
      sc.anims.create({ key: 'sult_loop', frames: sc.anims.generateFrameNumbers('fx_sere_ult', { start: 6, end: 11 }), frameRate: 12, repeat: -1 });
    }
    if (!sc.anims.exists('zmark_fly')) { sc.anims.create({ key: 'zmark_fly', frames: sc.anims.generateFrameNumbers('fx_zane_mark', { start: 0, end: 5 }), frameRate: 24, repeat: -1 }); sc.anims.create({ key: 'zmark_loop', frames: sc.anims.generateFrameNumbers('fx_zane_mark', { start: 12, end: 17 }), frameRate: 10, repeat: -1 }); sc.anims.create({ key: 'zult_loop', frames: sc.anims.generateFrameNumbers('fx_zane_ult', { start: 18, end: 23 }), frameRate: 12, repeat: -1 }); }
    if (!sc.anims.exists('fxa_charge_0')) sc.anims.create({ key: 'fxa_charge_0', frames: sc.anims.generateFrameNumbers('fx_charge', { start: 0, end: 5 }), frameRate: 10, repeat: -1 });
    Object.keys(FXFPS).forEach(n => { for (let r = 0; r < 4; r++) { const key = `fxa_${n}_${r}`; if (!sc.anims.exists(key)) sc.anims.create({ key, frames: sc.anims.generateFrameNumbers('fx_' + n, { start: r * 6, end: r * 6 + 5 }), frameRate: FXFPS[n][r], repeat: 0 }); } });
  }
  function playFx(sheet, row, x, y, o) {
    if (SIM) return; o = o || {};
    const sp = sc.add.sprite(x, y, 'fx_' + sheet, row * 6).setOrigin(o.ox == null ? 0.5 : o.ox, o.oy == null ? 0.5 : o.oy).setScale(o.s || 1).setRotation(o.rot || 0).setDepth(o.depth || 904).setAlpha(o.a == null ? 1 : o.a);
    if (o.add !== false) sp.setBlendMode(ADD());
    if (o.tint) sp.setTint(o.tint);
    if (o.flipY) sp.setFlipY(true);
    sp.play(`fxa_${sheet}_${row}`); sp.once('animationcomplete', () => sp.destroy());
    return sp;
  }
  /* 疊加混合圖：放大並淡出 */
  function popFx(key, x, y, o) {
    if (SIM) return;
    const im = sc.add.image(x, y, key).setBlendMode(ADD()).setDepth(o.depth || 902).setTint(o.tint || 0xffffff).setAlpha(o.a0 == null ? 1 : o.a0).setScale(o.s0 || 0.5).setRotation(o.rot || 0);
    if (o.sy) im.scaleY = im.scaleX * o.sy;
    sc.tweens.add({ targets: im, scaleX: o.s1, scaleY: o.s1 * (o.sy || 1), alpha: 0, duration: o.dur || 200, ease: o.ease || 'Quad.easeOut', onComplete: () => im.destroy() });
    return im;
  }
  /* 粒子噴發：n 顆小光點，朝四周（或指定角度範圍）飛散、受重力下落、淡出 */
  function burst(x, y, n, o) {
    if (SIM) return; o = o || {};
    for (let i = 0; i < n; i++) {
      const a = (o.ang == null ? rand(0, Math.PI * 2) : o.ang + rand(-(o.spread || 0.6), o.spread || 0.6)), sp = rand(o.v0 || 40, o.v1 || 120), life = rand(o.l0 || 260, o.l1 || 480), sz = rand(o.z0 || 0.18, o.z1 || 0.34);
      const im = sc.add.image(x, y, o.key || 'fx_glow').setBlendMode(o.add === false ? Phaser.BlendModes.NORMAL : ADD()).setDepth(903).setTint(o.tint || 0xffe9a0).setScale(sz).setAlpha(0.95);
      sc.tweens.add({ targets: im, x: x + Math.cos(a) * sp * life / 1000, y: y + Math.sin(a) * sp * life / 1000 + (o.grav || 0) * life / 1000 * 0.5, scale: sz * 0.2, alpha: 0, duration: life, ease: 'Quad.easeOut', onComplete: () => im.destroy() });
    }
  }

  /* ---------- 特效 ---------- */
  function floatText(x, y, s, color, size) {
    if (SIM) return;
    const t = sc.add.text(x, y, s, { fontSize: (size || 14) + 'px', color, fontStyle: 'bold', stroke: '#1a0d06', strokeThickness: 3 }).setOrigin(0.5).setDepth(1800);
    const zb = 1 / ZOOM; t.setScale(0.4 * zb);
    sc.tweens.add({ targets: t, scale: 1.3 * zb, duration: 110, ease: 'Back.easeOut', onComplete: () => sc.tweens.add({ targets: t, scale: zb, y: y - 40 * zb, alpha: 0, duration: 560, ease: 'Quad.easeOut', onComplete: () => t.destroy() }) });
  }
  function banner(s) {
    if (SIM) return;
    const multiline = s.includes('\n');
    const t = sc.add.text(W / 2, 330, s, { fontSize: multiline ? '24px' : '40px', color: '#ffe6a8', fontStyle: 'bold', stroke: '#2a1408', strokeThickness: multiline ? 4 : 6, align: 'center', wordWrap: { width: W - 32, useAdvancedWrap: true } }).setOrigin(0.5).setDepth(3000).setScrollFactor(0).setAlpha(0);
    sc.tweens.add({ targets: t, alpha: 1, duration: 200, yoyo: true, hold: 700, onComplete: () => t.destroy() });
  }
  function fxGfx(draw, life) { if (SIM) return; const g = sc.add.graphics().setDepth(900); draw(g); sc.tweens.add({ targets: g, alpha: 0, duration: life, onComplete: () => g.destroy() }); }
  function slashFx(x, y, ang, R) {
    if (SIM) return;
    const row = (G.pl.hits % 2 === 0) ? 0 : 1, left = Math.cos(ang) < 0;
    // 圖中弧線的頂點離「揮砍起點」約 170px；以起點（約 30% 處）當圓心，頂點正好落在射程邊緣
    playFx('melee', row, x, y - 8, { ox: 0.3, oy: 0.5, rot: ang, flipX: false, s: R / 165, flipY: left });
    for (let i = 0; i < 4; i++) { const a = ang + rand(-0.5, 0.5); burst(x + Math.cos(a) * R * 0.9, y - 8 + Math.sin(a) * R * 0.9, 1, { ang: a, spread: 0.3, v0: 30, v1: 90, l0: 200, l1: 340, z0: 0.12, z1: 0.22 }); }
  }
  function slashFxAt(x, y, ang, R) { playFx('melee', 0, x, y - 8, { ox: 0.3, oy: 0.5, rot: ang, s: R / 165 }); }
  function lineFx(x, y, nx, ny, R) { fxGfx(g => { g.lineStyle(10, 0xdff6ff, 0.8); g.lineBetween(x, y, x + nx * R, y + ny * R); }, 140); }
  function zapFx(x1, y1, x2, y2) { fxGfx(g => { g.lineStyle(3, 0xfff060, 1); g.beginPath(); g.moveTo(x1, y1); for (let i = 1; i < 5; i++) g.lineTo(x1 + (x2 - x1) * i / 5 + rand(-8, 8), y1 + (y2 - y1) * i / 5 + rand(-8, 8)); g.lineTo(x2, y2); g.strokePath(); }, 220); }
  function ringFx(x, y, color, r) {
    if (SIM) return; const R = r || 60;
    popFx('fx_ring', x, y, { s0: 0.25, s1: R / 118, tint: color, dur: 360, a0: 1, sy: 0.62, depth: 899 });
    popFx('fx_glow', x, y, { s0: 0.6, s1: R / 26, tint: color, dur: 220, a0: 0.5, sy: 0.7, depth: 898 });
  }

  /* 地面：石板無縫鋪滿，再疊灰燼／裂縫／水漬的柔邊補丁讓地面有變化 */
  function makePatch(srcKey, outKey, size) {
    const cv = document.createElement('canvas'); cv.width = cv.height = size; const ctx = cv.getContext('2d');
    ctx.drawImage(sc.textures.get(srcKey).getSourceImage(), 0, 0, size, size);
    ctx.globalCompositeOperation = 'destination-in';
    const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.16, size / 2, size / 2, size * 0.5);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
    sc.textures.addCanvas(outKey, cv);
  }
  function buildGround() {
    sc.add.tileSprite(0, 0, WORLD_W, WORLD_H, 'ground_stone').setOrigin(0).setTileScale(0.55).setDepth(-10);
    ['crack', 'ash', 'wet'].forEach(n => makePatch('ground_' + n, 'patch_' + n, 360));
    // 固定亂數，讓每次開局地面一樣
    let seed = 20261116; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const kinds = ['crack', 'ash', 'wet', 'crack', 'wet', 'ash'];
    for (let k = 0; k < 34; k++) {
      const n = kinds[k % kinds.length], sz = 260 + rnd() * 220;
      const px = rnd() * WORLD_W, py = rnd() * WORLD_H, pa = 0.55 + rnd() * 0.35;
      (sc.patchList = sc.patchList || []).push({ n, x: px, y: py, sz, a: pa });
      sc.add.image(px, py, 'patch_' + n).setDisplaySize(sz, sz).setAlpha(pa).setDepth(-9);
    }
    sc.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 0x0c0a12, 0.18).setDepth(-8);
  }
  /* 把整張地圖（地面＋補丁＋障礙物）一次畫成縮小圖，給小地圖與全圖直接使用 */
  function buildMiniTex() {
    const K = 0.4, cv = document.createElement('canvas'); cv.width = Math.round(WORLD_W * K); cv.height = Math.round(WORLD_H * K);
    const c = cv.getContext('2d'), src = n => sc.textures.get(n).getSourceImage();
    const gs = src('ground_stone'), tw = gs.width * 0.55 * K, th = gs.height * 0.55 * K;
    for (let y = 0; y < cv.height; y += th) for (let x = 0; x < cv.width; x += tw) c.drawImage(gs, x, y, tw + 1, th + 1);
    (sc.patchList || []).forEach(q => { c.globalAlpha = q.a; c.drawImage(src('patch_' + q.n), (q.x - q.sz / 2) * K, (q.y - q.sz / 2) * K, q.sz * K, q.sz * K); });
    c.globalAlpha = 1; c.fillStyle = 'rgba(12,10,18,0.18)'; c.fillRect(0, 0, cv.width, cv.height);
    const img = (o) => { const im = src('map_' + o.img), w = im.width * o.s, h = im.height * o.s; c.drawImage(im, (o.x - w / 2) * K, (o.y - h) * K, w * K, h * K); };
    OBST.filter(o => o.t === 'lake').forEach(img);
    c.fillStyle = 'rgba(0,0,0,0.28)';
    OBST.filter(o => o.t !== 'lake').forEach(o => { c.beginPath(); c.ellipse((o.x + o.dw * 0.10) * K, (o.y - o.dh * 0.04) * K, o.dw * 0.46 * K, o.dh * 0.10 * K, 0, 0, Math.PI * 2); c.fill(); });
    OBST.filter(o => o.t === 'forest').forEach(img);
    OBST.filter(o => o.t !== 'lake' && o.t !== 'forest').sort((a, b) => a.y - b.y).forEach(img);
    if (sc.textures.exists('minimap_tex')) sc.textures.remove('minimap_tex');
    sc.textures.addCanvas('minimap_tex', cv);
  }
  function drawObstacles() {
    const sh = sc.add.graphics().setDepth(-7);   // 統一的地面投影（光源在左上，影子往右下）
    OBST.forEach(o => {
      if (o.t === 'lake') {
        const im = sc.add.image(o.x, o.y, 'map_' + o.img).setOrigin(0.5, 1).setScale(o.s).setDepth(-6);
        return;
      }
      sh.fillStyle(0x000000, 0.28);
      sh.fillEllipse(o.x + o.dw * 0.10, o.y - o.dh * 0.04, o.dw * 0.92, o.dh * 0.20);
      sc.add.image(o.x, o.y, 'map_' + o.img).setOrigin(0.5, 1).setScale(o.s).setDepth(o.t === 'forest' ? -5 : o.y);
    });
  }

  /* ---------- 輸入（浮動搖桿） ---------- */
  function buildInput() {
    sc.stick = { on: false, ox: 0, oy: 0, dx: 0, dy: 0, id: -1 };
    sc.input.on('pointerdown', (p, over) => {
      if (over.length || G.state !== 'play') return;
      if (p.y / RS < 130) return;
      sc.stick = { on: true, ox: p.x / RS, oy: p.y / RS, dx: 0, dy: 0, id: p.id };
    });
    sc.input.on('pointermove', p => {
      const s = sc.stick; if (!s.on || p.id !== s.id) return;
      let dx = p.x / RS - s.ox, dy = p.y / RS - s.oy; const d = Math.hypot(dx, dy), m = 56;
      if (d > m) { s.ox += dx / d * (d - m); s.oy += dy / d * (d - m); dx = dx / d * m; dy = dy / d * m; }
      s.dx = dx / m; s.dy = dy / m;
    });
    const up = p => { if (sc.stick.on && p.id === sc.stick.id) sc.stick = { on: false, ox: 0, oy: 0, dx: 0, dy: 0, id: -1 }; };
    sc.input.on('pointerup', up); sc.input.on('pointerupoutside', up);
    sc.keys = sc.input.keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,T,ONE,TWO,THREE');
  }

  function buildMiniLayers() {
    sc.miniImg = sc.add.image(W - 92, 36, 'minimap_tex').setOrigin(0).setScrollFactor(0).setDepth(1901).setDisplaySize(80, WORLD_H * 80 / WORLD_W);
    sc.gTop = sc.add.graphics().setDepth(1902).setScrollFactor(0);
  }
  /* ---------- 暫停（11-21）：右上小地圖下方的 ‖ 鈕、ESC 鍵、切到背景自動暫停 ---------- */
  function buildPause() {
    if (SIM) return;
    const x = 338, y = 214, g = sc.add.graphics().setDepth(1902).setScrollFactor(0);
    uiOrb(g, x, y, 15, false);
    g.fillStyle(0x000000, 0.5); g.fillRoundedRect(x - 6.5, y - 7, 5, 16, 1.5); g.fillRoundedRect(x + 2.5, y - 7, 5, 16, 1.5);
    g.fillStyle(0xffe6a8, 1); g.fillRoundedRect(x - 7, y - 8, 5, 16, 1.5); g.fillRoundedRect(x + 2, y - 8, 5, 16, 1.5);
    sc.pauseZone = sc.add.zone(x, y, 44, 44).setInteractive({ useHandCursor: true }).setDepth(1903).setScrollFactor(0);
    sc.pauseZone.on('pointerdown', () => pauseGame());
    sc.input.keyboard.on('keydown-ESC', () => { if (G.state === 'pause') resumeGame(); else pauseGame(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
  }
  function pauseGame() {
    if (SIM || !G || G.state !== 'play') return;   // 選技能、看大地圖、結算時不疊暫停
    G.state = 'pause'; sc.stick = { on: false, ox: 0, oy: 0, dx: 0, dy: 0, id: -1 };
    sc.tweens.pauseAll(); sc.anims.pauseAll();
    const n0 = sc.children.list.length;
    uiSceneBackdrop(2100, true);
    const pw = 280, ph = 330, px = W / 2 - pw / 2, py = H / 2 - ph / 2 - 20, g = sc.add.graphics().setDepth(2101).setScrollFactor(0);
    uiPanel(g, px, py, pw, ph, 16, 0.97);
    g.lineStyle(1, 0xf2cf86, 0.35); g.strokeRoundedRect(px + 8, py + 8, pw - 16, ph - 16, 11);
    uiBanner(W / 2, py, 210, 52, '暫停', { depth: 2102, color: '#ffe6a8' });
    UT(W / 2, py + 62, TUT ? `序章　第${TUT}節　${TUT_DATA.name}` : `第${NODE_N}節　${NODE_NAMES[NODE_N]}　WAVE ${Math.max(1, Math.min(G.wave + 1, WAVES.length))}/${WAVES.length}`, 12, '#a8987a', 2103).setOrigin(0.5);
    uiButton(W / 2, py + 120, 200, 54, '繼續', () => resumeGame(), { depth: 2103 });
    uiButton(W / 2, py + 186, 200, 54, '重新開始', () => location.reload(), { depth: 2103 });
    if (TUT) uiButton(W / 2, py + 218, 200, 42, TUT_TEXT.ui.skip, () => skipTutorial(), { depth: 2103 });
    if (REAL) uiButton(W / 2, py + 252, 200, 54, '放棄', () => { location.search = '?pick=' + HERO_ID; }, { depth: 2103 });   // 放棄＝不給經驗金幣、不算通關（jun 11-21）
    else uiButton(W / 2, py + 252, 200, 54, '換角色', () => { const q = new URLSearchParams(location.search); q.delete('hero'); q.delete('team'); location.search = q.toString(); }, { depth: 2103 });
    if (REAL) UT(W / 2, py + ph - 14, '放棄不會獲得經驗與金幣', 10, '#8a7a60', 2103).setOrigin(0.5);
    G.pauseObjs = sc.children.list.slice(n0);
  }
  function buildTutorial() {
    const t = G.tut;
    t.objs = [];
    const g = sc.add.graphics().setDepth(2050).setScrollFactor(0);
    const portrait = sc.textures.exists('serloan_portrait') ? sc.add.image(48, 788, 'serloan_portrait').setDepth(2051).setScrollFactor(0).setOrigin(0.5, 1).setCrop(0, 0, 492, 650).setDisplaySize(75, 150).setVisible(false) : sc.add.zone(48, 788, 1, 1).setDepth(2051).setScrollFactor(0).setVisible(false);
    const name = UT(92, 650, TUT_TEXT.speaker, 13, '#ffe6a8', 2052, { fontStyle: 'bold' });
    const body = UT(92, 674, '', 14, '#f1e6d2', 2052, { wordWrap: { width: 290, useAdvancedWrap: true }, lineSpacing: 4 });
    const next = UT(337, 806, TUT_TEXT.ui.next, 10, '#d9ad5c', 2052, { fontStyle: 'bold' }).setOrigin(1, 0.5);
    const z = sc.add.zone(W / 2, 742, W, 190).setInteractive().setDepth(2053).setScrollFactor(0);
    t.objs.push(g, portrait, name, body, next, z); t.body = body; t.next = next; t.portrait = portrait; t.name = name; t.dialogueIndex = 0;
    const draw = () => { g.clear(); uiPanel(g, 12, 638, W - 24, 192, 12, 0.94); g.lineStyle(2, 0xd9ad5c, 0.85); g.strokeRoundedRect(12, 638, W - 24, 192, 12); };
    draw();
    const showDialogue = (kind) => {
      const arr = TUT_DATA && TUT_DATA[kind] || [];
      t.dialogue = kind; t.dialogueLines = arr; t.dialogueIndex = 0; t.dialogueOpen = true; G.state = 'tutDialogue';
      t.objs.slice(0, 5).forEach(o => o.setVisible(true)); z.setInteractive();
      g.clear(); uiPanel(g, 12, 638, W - 24, 192, 12, 0.94); g.lineStyle(2, 0xd9ad5c, 0.85); g.strokeRoundedRect(12, 638, W - 24, 192, 12);
      portrait.setPosition(48, 788).setDisplaySize(75, 150); name.setPosition(92, 650); body.setPosition(92, 674).setWordWrapWidth(268, true);
      sc.tweens.pauseAll(); sc.anims.pauseAll(); body.setText(arr[0] || ''); next.setVisible(true); name.setVisible(true); portrait.setVisible(true);
    };
    t.showDialogue = showDialogue;
    z.on('pointerdown', () => {
      if (!t.dialogueOpen) return;
      t.dialogueIndex++;
      if (t.dialogueIndex >= t.dialogueLines.length) {
        t.dialogueOpen = false; t.dialogueLines = []; t.objs.slice(0, 5).forEach(o => o.setVisible(false));
        sc.tweens.resumeAll(); sc.anims.resumeAll(); G.state = 'play';
        if (t.dialogue === 'intro') setTutorialStep(TUT === 1 ? 'move' : TUT === 2 ? 'skill1' : 'dodge');
        else if (t.dialogue === 'outro') endGame(true);
      } else body.setText(t.dialogueLines[t.dialogueIndex]);
    });
    banner(`序章　第${TUT}節\n${TUT_DATA.name}`); showDialogue('intro');
  }
  const TUT_STEPS = {
    1: { move: { enter: '設定世界目標圈', complete: '玩家抵達目標' }, attack: { enter: '生成3隻潮藍', complete: '本步生成敵人全滅' }, crystal: { enter: '等待結晶', complete: '撿到本步結晶' }, levelup: { enter: '保證需求不超過3', complete: '三選一完成' }, clear: { enter: '生成4隻潮藍', complete: '本步生成敵人全滅' } },
    2: { skill1: { enter: '生成技能1目標', complete: '技能1成功施放' }, skill2: { enter: '生成技能2目標', complete: '技能2成功施放' }, skill3: { enter: '生成技能3目標', complete: '技能3成功施放' }, ult: { enter: '集氣設為100', complete: '必殺演出結束' }, clear: { enter: '生成3潮藍與2赤鰭', complete: '本步生成敵人全滅' } },
    3: { dodge: { enter: '生成無敵術士並施放預警圈', complete: '圈外成功或第三次結算' }, auto: { enter: '高亮AUTO', complete: 'AUTO開啟' }, boss: { enter: '生成3倍血量稀有怪', complete: '首領倒下' } }
  };
  function tutRefill() {   // 第 2 節技能／必殺步驟：生成 2 隻目標；澤恩的第三招（雷爆）要有雷印才放得出來，教學目標直接帶雷印
    const before = G.enemies.length; tutSpawn('tide', 2, { noFlee: true });
    if (act().id === 'zane' && G.tut.phase === 'skill3') G.enemies.slice(before).forEach(e => { e.mark = { t: 999 }; });
  }
  function setTutorialStep(phase) {
    const t = G.tut; t.phase = phase; t.hint = phase; t.stepKills = G.kills || 0; t.stepCrystals = G.crystals || 0; t.lastSkill = -1; t.spawned = [];
    if (TUT === 1 && phase === 'move') t.target = tutSpot(1);
    if (TUT === 1 && phase === 'attack') tutSpawn('tide', 3, { noFlee: true });
    if (TUT === 1 && phase === 'levelup') G.need = Math.min(G.need, 3);
    if (TUT === 1 && phase === 'clear') tutSpawn('tide', 4, { noFlee: true });
    if (TUT === 2 && /^(skill[123]|ult)$/.test(phase)) tutRefill();
    if (TUT === 2 && phase === 'ult') G.gauge = 100;
    if (TUT === 2 && phase === 'clear') { tutSpawn('tide', 3, { noFlee: true }); tutSpawn('fin', 2, { noFlee: true }); }
    if (TUT === 3 && phase === 'dodge') tutSpawn('mage', 1, { noFlee: true, invuln: true, tutDodge: true });
    if (TUT === 3 && phase === 'boss') tutSpawn('rare', 1, { noFlee: true, hpMul: 3, tutBoss: true });
    tutorialHint();
  }
  function tutorialHint() {
    const t = G.tut, h = TUT_DATA && TUT_DATA.hints;
    if (!t || !h || !t.hint || !t.objs) return;
    if (t.dialogueOpen) return;
    const text = h[t.hint] || '';
    if (!text) { t.objs.slice(0, 5).forEach(o => o.setVisible(false)); return; }
    t.objs.slice(0, 5).forEach(o => o.setVisible(true));
    t.objs[0].clear(); uiPanel(t.objs[0], 12, 556, 284, 128, 12, 0.94); t.objs[0].lineStyle(2, 0xd9ad5c, 0.85); t.objs[0].strokeRoundedRect(12, 556, 284, 128, 12);   // 寬只到 x=296，不蓋右側技能鈕
    t.portrait.setPosition(42, 674).setDisplaySize(44, 88).setVisible(true); t.name.setPosition(72, 568).setVisible(true); t.body.setPosition(72, 590).setWordWrapWidth(212, true).setText(text).setVisible(true); t.next.setVisible(false); t.objs[5].disableInteractive();
  }
  function updateTutorial() {
    if (!TUT || !G.tut || G.state !== 'play') return;
    const t = G.tut;
    const alive = t.spawned.length > 0 && t.spawned.some(e => e && !e.dead);
    if (TUT === 1 && t.phase === 'move' && dist(G.pl, t.target) < 55) setTutorialStep('attack');
    else if (TUT === 1 && t.phase === 'attack' && !alive) setTutorialStep('crystal');
    else if (TUT === 1 && t.phase === 'crystal' && (G.crystals > t.stepCrystals || G.level > 1)) setTutorialStep('levelup');
    else if (TUT === 1 && t.phase === 'levelup' && G.picks.length && !G.pickCtx) setTutorialStep('clear');
    else if (TUT === 1 && t.phase === 'clear' && !alive && !t.outro) { t.outro = true; buildTutorialDialogue('outro'); }
    else if (TUT === 2 && /^(skill[123]|ult)$/.test(t.phase) && !alive && !G.ultRun) tutRefill();   // 目標被打光就補，避免沒有目標可放招而卡住
    else if (TUT === 2 && t.phase === 'skill1' && t.lastSkill === 0) setTutorialStep('skill2');
    else if (TUT === 2 && t.phase === 'skill2' && t.lastSkill === 1) setTutorialStep('skill3');
    else if (TUT === 2 && t.phase === 'skill3' && t.lastSkill === 2) setTutorialStep('ult');
    else if (TUT === 2 && t.phase === 'ult' && t.ultUsed && !G.ultRun) setTutorialStep('clear');
    else if (TUT === 2 && t.phase === 'clear' && !alive && !t.outro) { t.outro = true; buildTutorialDialogue('outro'); }
    else if (TUT === 3 && t.phase === 'auto' && AI.on) setTutorialStep('boss');
    else if (TUT === 3 && t.phase === 'boss' && !alive && !t.outro) { t.outro = true; buildTutorialDialogue('outro'); }
    tutorialHint();
  }
  function buildTutorialDialogue(kind) {
    if (!G.tut || !TUT_DATA) return;
    if (G.tut.showDialogue) G.tut.showDialogue(kind);
  }
  function skipTutorial() {
    if (!TUT || !G) return;
    if (G.skipCtx) return;
    G.state = 'skipConfirm'; sc.tweens.pauseAll(); sc.anims.pauseAll(); uiSceneBackdrop(2100, true);
    const g = sc.add.graphics().setDepth(2101).setScrollFactor(0), objs = [g]; uiPanel(g, 28, 280, W - 56, 210, 14, 0.97);
    objs.push(UT(W / 2, 320, '跳過教學', 20, '#ffe6a8', 2102, { fontStyle: 'bold' }).setOrigin(0.5));
    objs.push(UT(W / 2, 365, TUT_TEXT.ui.skipConfirm, 14, '#f1e6d2', 2102, { wordWrap: { width: 270 }, align: 'center' }).setOrigin(0.5, 0));
    objs.push(...uiButton(W / 2 - 78, 452, 130, 46, '取消', closeSkipConfirm, { depth: 2103, fs: 15 }));
    objs.push(...uiButton(W / 2 + 78, 452, 130, 46, '確定跳過', confirmSkipTutorial, { depth: 2103, fs: 15 })); G.skipCtx = { objs };
  }
  function closeSkipConfirm() { if (!G.skipCtx) return; G.skipCtx.objs.forEach(o => o.destroy()); G.skipCtx = null; sc.tweens.resumeAll(); sc.anims.resumeAll(); G.state = 'pause'; }
  function confirmSkipTutorial() { const s = TX.load(); s.tutorialDone = true; TX.save(s); location.search = '?map=' + encodeURIComponent(HERO_ID); }
  function resumeGame() {
    if (!G || G.state !== 'pause') return;
    (G.pauseObjs || []).slice().forEach(o => o.destroy()); G.pauseObjs = null;
    sc.tweens.resumeAll(); sc.anims.resumeAll(); G.state = 'play';
  }
  function buildAuto() {
    sc.autoBtn = sc.add.zone(338, 528, 92, 40).setInteractive({ useHandCursor: true }).setDepth(1902).setScrollFactor(0);
    sc.autoTxt = sc.add.text(342, 527, 'AUTO', { fontSize: '16px', color: '#9a8a70', fontStyle: 'bold', stroke: '#120b07', strokeThickness: 3 }).setOrigin(0.5).setDepth(1911).setScrollFactor(0);
    sc.autoSt = sc.add.text(338, 554, '', { fontSize: '12px', color: '#ffe6a8', stroke: '#1a0d06', strokeThickness: 3 }).setOrigin(0.5).setDepth(1911).setScrollFactor(0);
    sc.autoBtn.on('pointerdown', () => { if (G.state === 'play') toggleAuto(); });
  }
  const MODE_TXT = { dodge: '閃避', kite: '拉開距離', attack: '攻擊', crystal: '撿結晶', chase: '接近敵人', wait: '待機' };
  function drawAuto(g) {
    if (!sc.autoBtn) return;
    const x = 338, y = 528, w = 92, h = 36, on = AI.on, run = on && AI.auto;
    uiPanel(g, x - w / 2, y - h / 2, w, h, 12, 0.95);
    if (on) { g.fillStyle(0x8a5a22, 0.55); g.fillRoundedRect(x - w / 2 + 3, y - h / 2 + 3, w - 6, h - 6, 10); }
    // 指示燈：開＝綠（手動接手時黃），關＝暗
    const lc = !on ? 0x3a2c22 : run ? 0x6dff7a : 0xffd24a, lx = x - w / 2 + 16;
    if (on) { g.fillStyle(lc, 0.25 + 0.12 * Math.sin(G.t * 6)); g.fillCircle(lx, y, 10); }
    g.fillStyle(0x000000, 0.8); g.fillCircle(lx, y, 6.5); g.fillStyle(lc, 1); g.fillCircle(lx, y, 5); g.fillStyle(0xffffff, on ? 0.7 : 0.15); g.fillCircle(lx - 1.5, y - 1.8, 1.8);
    sc.autoTxt.setColor(on ? '#fff0bd' : '#9a8a70');
    sc.autoSt.setText(on ? (AI.auto ? MODE_TXT[AI.mode] || '' : '手動中') : '');
  }

  /* ---------- HUD 繪圖工具：金屬框、光澤條、圓鈕 ---------- */
  function uiPanel(g, x, y, w, h, r, a) {
    g.fillStyle(0x000000, 0.35); g.fillRoundedRect(x + 1, y + 3, w, h, r);                 // 投影
    g.fillStyle(0x120b07, a == null ? 0.92 : a); g.fillRoundedRect(x, y, w, h, r);          // 底
    g.fillStyle(0x2a1a10, 0.55); g.fillRoundedRect(x + 2, y + 2, w - 4, (h - 4) * 0.5, { tl: r - 1, tr: r - 1, bl: 0, br: 0 });   // 上半亮面
    g.lineStyle(2, 0x6e4a1c, 1); g.strokeRoundedRect(x, y, w, h, r);                       // 外框（暗金）
    g.lineStyle(1, 0xf2cf86, 0.9); g.strokeRoundedRect(x + 2, y + 2, w - 4, h - 4, r - 1);  // 內框（亮金）
  }
  function uiBar(g, x, y, w, h, ratio, c1, c2, ticks) {
    const r = h / 2;
    g.fillStyle(0x000000, 0.7); g.fillRoundedRect(x - 2, y - 2, w + 4, h + 4, r + 2);
    g.fillStyle(0x2a1a14, 1); g.fillRoundedRect(x, y, w, h, r);
    const fw = Math.max(0, Math.min(1, ratio)) * w;
    if (fw > 1) {
      g.fillStyle(c2, 1); g.fillRoundedRect(x, y, fw, h, r);                                // 深色底層
      g.fillStyle(c1, 1); g.fillRoundedRect(x, y, fw, h * 0.62, { tl: r, tr: r, bl: 0, br: 0 });   // 亮色上層
      g.fillStyle(0xffffff, 0.35); g.fillRoundedRect(x + 3, y + 1.5, Math.max(0, fw - 6), 2, 1);   // 高光
    }
    if (ticks) { g.lineStyle(1, 0x000000, 0.45); for (let i = 1; i < ticks; i++) { const tx = x + w * i / ticks; g.lineBetween(tx, y + 1, tx, y + h - 1); } }
    g.lineStyle(1.5, 0xc89a48, 0.9); g.strokeRoundedRect(x, y, w, h, r);
  }
  function uiOrb(g, x, y, r, lit) {      // 圓鈕底座：金屬外環＋內凹面
    g.fillStyle(0x000000, 0.4); g.fillCircle(x + 1, y + 3, r + 4);
    g.fillStyle(0x4a3012, 1); g.fillCircle(x, y, r + 4);
    g.fillStyle(0xd9ad5c, 1); g.fillCircle(x, y, r + 2.5);
    g.fillStyle(0x3a2410, 1); g.fillCircle(x, y, r + 0.5);
    g.fillStyle(lit ? 0x5a3a14 : 0x1c120c, 1); g.fillCircle(x, y, r - 2);
    g.fillStyle(0xffffff, lit ? 0.16 : 0.08); g.fillEllipse(x, y - r * 0.45, r * 1.5, r * 0.8);   // 玻璃高光
  }

  /* ---------- 介面元件組（v26：金屬質感；選技／結算／全圖／按鈕共用，深度一律 ≥2000） ---------- */
  const UI_FONT = '"Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif';
  const SK_COL = { atk: 0xff9a6a, as: 0xffd24a, rng: 0x7fd8ff, spd: 0x9ff0b0, crit: 0xffe27a, chain: 0xc0a8ff, life: 0xff8a9a, shield: 0x7be4df, wave: 0x8ab4ff, slashwave: 0xffe27a, twin: 0xff9a6a, whirl: 0x9ff0b0, pierce: 0x7fd8ff, thunder: 0xfff060, multithunder: 0xffe27a, blades: 0xbfe8ff, burst: 0x9fe6ff, magnet: 0xff8a9a, counter: 0xffb070, dash: 0x70e0ff, oz_bash: 0xd8b070, oz_counter: 0xc8b090, oz_anchor: 0xb89868, sr_pool: 0x7fd8ff, sr_vortex: 0x6fb8ff, sr_wave: 0x9fe8ff, z_mark: 0xffe27a, z_step: 0xfff060, z_burst: 0xffd24a, poison: 0x8fe070, para: 0xfff090, slow: 0xa8e8ff };
  const UT = (x, y, s, size, color, d, o) => sc.add.text(x, y, s, Object.assign({ fontFamily: UI_FONT, fontSize: size + 'px', color: color, stroke: '#1a0d06', strokeThickness: Math.max(2, Math.round(size / 6)) }, o || {})).setDepth(d).setScrollFactor(0);
  /* 技能圖示：畫在圓徽章上（cx,cy＝中心，u＝縮放） */
  function skillIcon(g, id, cx, cy, u) {
    const col = SK_COL[id] || 0xffffff;
    const P = (a) => a.map(([x, y]) => ({ x: cx + x * u, y: cy + y * u }));
    const L = (x1, y1, x2, y2, w, c, a) => { g.lineStyle(w * u, c, a == null ? 1 : a); g.lineBetween(cx + x1 * u, cy + y1 * u, cx + x2 * u, cy + y2 * u); };
    const draw = (c, a, dx, dy) => {
      const ox = cx, oy = cy; cx = ox + dx * u; cy = oy + dy * u;
      g.fillStyle(c, a);
      if (id === 'atk') { L(-7, 7, 9, -9, 4.2, c, a); L(-6.5, -0.5, 0.5, 6.5, 3.2, c, a); L(-4, 4, -9, 9, 3, c, a); g.fillCircle(cx - 10.5 * u, cy + 10.5 * u, 2.2 * u); }
      else if (id === 'as') { L(-10, -9, -1, 0, 3.6, c, a); L(-1, 0, -10, 9, 3.6, c, a); L(2, -9, 11, 0, 3.6, c, a); L(11, 0, 2, 9, 3.6, c, a); }
      else if (id === 'rng') { g.lineStyle(2.6 * u, c, a); g.strokeCircle(cx, cy, 8 * u); g.fillCircle(cx, cy, 2.4 * u); [[0, -1], [1, 0], [0, 1], [-1, 0]].forEach(([dx2, dy2]) => L(dx2 * 11.5, dy2 * 11.5, dx2 * 15, dy2 * 15, 2.8, c, a)); }
      else if (id === 'spd') { g.fillPoints(P([[3, -9], [13, 0], [3, 9]]), true); L(-12, -5, 0, -5, 2.6, c, a); L(-14, 0, 3, 0, 2.6, c, a); L(-12, 5, 0, 5, 2.6, c, a); }
      else if (id === 'crit') { const pts = []; for (let i = 0; i < 16; i++) { const r = i % 2 ? 5 : 15, an = i * Math.PI / 8 - Math.PI / 2; pts.push([Math.cos(an) * r, Math.sin(an) * r]); } g.fillPoints(P(pts), true); }
      else if (id === 'chain') { g.fillPoints(P([[3, -15], [-8, 2], [-1, 2], [-5, 15], [9, -4], [2, -4]]), true); }
      else if (id === 'life') { g.fillCircle(cx - 4.8 * u, cy - 3 * u, 5.8 * u); g.fillCircle(cx + 4.8 * u, cy - 3 * u, 5.8 * u); g.fillPoints(P([[-10.2, -1], [10.2, -1], [0, 12]]), true); }
      else if (id === 'shield') { g.fillPoints(P([[-10, -10], [0, -14], [10, -10], [10, 0], [0, 14], [-10, 0]]), true); }
      else if (id === 'slashwave') { g.lineStyle(3.4 * u, c, a); g.beginPath(); g.arc(cx - 6 * u, cy, 14 * u, -0.95, 0.95, false); g.strokePath(); L(-14, -6, -5, -6, 2.2, c, a); L(-15, 0, -6, 0, 2.2, c, a); L(-14, 6, -5, 6, 2.2, c, a); }
      else if (id === 'twin') { L(-10, -6, 4, 8, 3.8, c, a); L(-3, -11, 11, 3, 3.8, c, a); }
      else if (id === 'whirl') { g.lineStyle(3.2 * u, c, a); g.beginPath(); g.arc(cx, cy, 10 * u, 0.5, 5.1, false); g.strokePath(); g.fillPoints(P([[3, -14], [11, -6], [1, -5]]), true); }
      else if (id === 'pierce') { L(-14, 0, 7, 0, 3.4, c, a); g.fillPoints(P([[6, -7], [15, 0], [6, 7]]), true); L(-14, -5, -9, -5, 2, c, a); L(-14, 5, -9, 5, 2, c, a); }
      else if (id === 'thunder') { g.fillPoints(P([[2, -14], [-6, 0], [-1, 0], [-4, 9], [6, -4], [1, -4]]), true); g.lineStyle(2.4 * u, c, a); g.strokeEllipse(cx, cy + 11 * u, 24 * u, 8 * u); }
      else if (id === 'multithunder') { [[-7, 0.75], [1, 1], [8, 0.65]].forEach(([ox, sc2]) => { const b = P([[2, -12], [-5, 0], [-1, 0], [-3, 8], [5, -3], [1, -3]]); g.fillPoints(b.map(q => ({ x: q.x * sc2 + ox * u * 0.6, y: q.y * sc2 })), true); }); g.lineStyle(2 * u, c, a); g.strokeEllipse(cx, cy + 11 * u, 26 * u, 8 * u); }
      else if (id === 'blades') { for (let i = 0; i < 3; i++) { const an = i * 2.094 - 1.57, bx = Math.cos(an) * 9, by = Math.sin(an) * 9; g.fillCircle(cx + bx * u, cy + by * u, 3.6 * u); g.fillStyle(0xffffff, a * 0.8); g.fillCircle(cx + bx * u - 0.8 * u, cy + by * u - 0.8 * u, 1.4 * u); g.fillStyle(c, a); } g.lineStyle(1.4 * u, c, a * 0.5); g.strokeCircle(cx, cy, 9 * u); }
      else if (id === 'burst') { g.fillPoints(P([[0, -8], [6, 0], [0, 8], [-6, 0]]), true); for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4; L(Math.cos(an) * 10, Math.sin(an) * 10, Math.cos(an) * 15, Math.sin(an) * 15, 2.2, c, a); } }
      else if (id === 'magnet') { g.lineStyle(4.6 * u, c, a); g.beginPath(); g.arc(cx, cy - 1 * u, 9 * u, 0, Math.PI, false); g.strokePath(); L(-9, -1, -9, -10, 4.6, c, a); L(9, -1, 9, -10, 4.6, c, a); }
      else if (id === 'counter') { g.fillCircle(cx, cy, 3 * u); g.lineStyle(2.8 * u, c, a); g.strokeCircle(cx, cy, 8 * u); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx2, dy2]) => { L(dx2 * 11, dy2 * 11, dx2 * 16, dy2 * 16, 3, c, a); g.fillPoints(P([[dx2 * 16 + (dy2 ? -3 : 0), dy2 * 16 + (dx2 ? -3 : 0)], [dx2 * 16 + (dy2 ? 3 : 0), dy2 * 16 + (dx2 ? 3 : 0)], [dx2 * 20, dy2 * 20]]), true); }); }
      else if (id === 'dash') { g.fillPoints(P([[-2, -12], [6, -12], [6, -2], [14, 2], [14, 9], [-2, 9]]), true); L(-14, -5, -7, -5, 2.4, c, a); L(-15, 1, -7, 1, 2.4, c, a); L(-13, 7, -7, 7, 2.4, c, a); }
      else if (id === 'oz_bash') { g.fillPoints(P([[-8, -12], [8, -12], [8, 8], [0, 14], [-8, 8]]), true); g.lineStyle(2.2 * u, 0x2a1a10, a); g.strokePoints(P([[-8, -12], [8, -12], [8, 8], [0, 14], [-8, 8], [-8, -12]]).map(q => ({ x: q.x, y: q.y })), false); L(10, 0, 17, 0, 3, c, a); L(12, -5, 17, -9, 2.4, c, a); L(12, 5, 17, 9, 2.4, c, a); }
      else if (id === 'oz_counter') { g.lineStyle(2.8 * u, c, a); g.strokeCircle(cx, cy, 12 * u); g.fillPoints(P([[-6, -6], [0, -9], [6, -6], [6, 3], [0, 9], [-6, 3]]), true); for (let i = 0; i < 4; i++) { const an = i * Math.PI / 2 + 0.78; L(Math.cos(an) * 14, Math.sin(an) * 14, Math.cos(an) * 19, Math.sin(an) * 19, 2.4, c, a); } }
      else if (id === 'oz_anchor') { g.fillPoints(P([[-12, 6], [-4, -6], [0, 2], [5, -9], [12, 6]]), true); g.lineStyle(2.2 * u, c, a); g.strokeEllipse(cx, cy + 9 * u, 28 * u, 8 * u); L(-3, 10, -6, 15, 2, c, a); L(4, 10, 7, 15, 2, c, a); }
      else if (id === 'sr_pool') { g.fillEllipse(cx, cy + 3 * u, 26 * u, 12 * u); g.lineStyle(1.8 * u, 0xffffff, a * 0.8); g.strokeEllipse(cx, cy + 3 * u, 17 * u, 7 * u); g.fillStyle(0xffffff, a); g.fillCircle(cx, cy - 8 * u, 2.4 * u); g.fillPoints(P([[0, -14], [-2.4, -9], [2.4, -9]]), true); g.fillStyle(c, a); }
      else if (id === 'sr_vortex') { g.lineStyle(2.6 * u, c, a); for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(cx, cy, (4 + k * 4.2) * u, k * 1.4, k * 1.4 + 3.6, false); g.strokePath(); } g.fillCircle(cx, cy, 2 * u); }
      else if (id === 'sr_wave') { g.fillPoints(P([[-14, 8], [-12, 0], [-6, -6], [2, -8], [9, -5], [11, 0], [6, -2], [0, -1], [-4, 3], [14, 8]]), true); g.lineStyle(2 * u, 0xffffff, a * 0.8); g.beginPath(); g.arc(cx + 2 * u, cy - 1 * u, 7 * u, -2.6, -0.4, false); g.strokePath(); }
      else if (id === 'z_mark') { g.lineStyle(2.4 * u, c, a); g.strokeCircle(cx, cy, 11 * u); L(-15, 0, -8, 0, 2.2, c, a); L(8, 0, 15, 0, 2.2, c, a); L(0, -15, 0, -8, 2.2, c, a); L(0, 8, 0, 15, 2.2, c, a); g.fillPoints(P([[2, -8], [-4, 1], [-1, 1], [-3, 8], [4, -2], [1, -2]]), true); }
      else if (id === 'z_step') { g.fillPoints(P([[5, -9], [15, 0], [5, 9]]), true); g.fillPoints(P([[-2, -12], [-10, 1], [-5, 1], [-8, 12], [2, -2], [-2, -2]]), true); L(-14, 6, -9, 6, 2, c, a); }
      else if (id === 'z_burst') { g.fillPoints(P([[0, -9], [3, -3], [9, 0], [3, 3], [0, 9], [-3, 3], [-9, 0], [-3, -3]]), true); for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4 + 0.39; L(Math.cos(an) * 11, Math.sin(an) * 11, Math.cos(an) * 16, Math.sin(an) * 16, 2.4, c, a); } }
      else if (id === 'poison') { g.fillPoints(P([[0, -13], [8, 2], [-8, 2]]), true); g.fillCircle(cx, cy + 4 * u, 8 * u); }
      else if (id === 'para') { g.lineStyle(2.4 * u, c, a); g.strokeCircle(cx, cy, 12 * u); g.fillPoints(P([[2, -9], [-5, 1], [-1, 1], [-3, 9], [5, -2], [1, -2]]), true); }
      else if (id === 'slow') { for (let i = 0; i < 3; i++) { const an = i * Math.PI / 3; L(Math.cos(an) * 13, Math.sin(an) * 13, -Math.cos(an) * 13, -Math.sin(an) * 13, 2.6, c, a); } g.fillCircle(cx, cy, 3 * u); }
      else if (id === 'wave') { g.fillCircle(cx - 9 * u, cy, 3.2 * u); [8, 13, 18].forEach(r => { g.lineStyle(2.6 * u, c, a); g.beginPath(); g.arc(cx - 9 * u, cy, r * u, -0.75, 0.75, false); g.strokePath(); }); }
      cx = ox; cy = oy;
    };
    draw(0x000000, 0.55, 0.9, 1.3);
    draw(col, 1, 0, 0);
    if (id === 'shield') { g.fillStyle(0xffffff, 0.35); g.fillPoints(P([[-6, -8], [0, -10.5], [0, 8], [-6, -1]]), true); }
    if (id === 'life') { g.fillStyle(0xffffff, 0.45); g.fillCircle(cx - 6 * u, cy - 5 * u, 1.8 * u); }
  }
  function skillMedal(g, id, cx, cy, r, lit) {
    if (lit) { g.fillStyle(SK_COL[id] || 0xffffff, 0.14); g.fillCircle(cx, cy, r + 9); }
    uiOrb(g, cx, cy, r, true);
    skillIcon(g, id, cx, cy, r / 17);
  }
  /* 技能等級小菱形（lv 已點亮；next 為下一級，亮綠） */
  function skillPips(g, x, y, lv, max, next, sz) {
    const gap = sz * 2.7;
    for (let i = 0; i < max; i++) {
      const px = x + (i - (max - 1) / 2) * gap, on = i < lv, nx = next && i === lv;
      const pts = [{ x: px, y: y - sz }, { x: px + sz, y }, { x: px, y: y + sz }, { x: px - sz, y }];
      g.fillStyle(0x000000, 0.7); g.fillPoints(pts.map(p => ({ x: p.x, y: p.y + 1 })), true);
      g.fillStyle(on ? 0xf2cf86 : nx ? 0x7be88a : 0x2a1a10, 1); g.fillPoints(pts, true);
      g.lineStyle(1, on ? 0xffffff : nx ? 0xcaffd0 : 0x6e4a1c, on || nx ? 0.8 : 1); g.strokePoints(pts, true);
    }
  }
  function uiSceneBackdrop(d, noFade) {   // 章節場景圖鋪滿畫面（等比例裁切），上面壓一層淡暗色與上下漸暗，讓面板文字清楚
    if (!sc.textures.exists('bg_chapter')) return uiBackdrop(0.8, d);
    sc.textures.get('bg_chapter').setFilter(Phaser.Textures.FilterMode.LINEAR);
    const img = sc.add.image(W / 2, H / 2, 'bg_chapter').setDepth(d).setScrollFactor(0), k = Math.max(W / img.width, H / img.height);
    img.setScale(k); if (!noFade) { img.setAlpha(0); sc.tweens.add({ targets: img, alpha: 1, duration: 450 }); }
    sc.add.rectangle(W / 2, H / 2, W, H, 0x05030a, 0.38).setDepth(d + 0.05).setScrollFactor(0).setInteractive();
    const v = sc.add.graphics().setDepth(d + 0.1).setScrollFactor(0);
    for (let i = 0; i < 10; i++) { v.fillStyle(0x000000, 0.05); v.fillRect(0, 0, W, (10 - i) * 22); v.fillRect(0, H - (10 - i) * 22, W, (10 - i) * 22); }
    return [img, v];
  }
  function uiBackdrop(alpha, d) {
    const r = sc.add.rectangle(W / 2, H / 2, W, H, 0x05030a, alpha).setDepth(d).setScrollFactor(0).setInteractive();
    const v = sc.add.graphics().setDepth(d + 0.1).setScrollFactor(0);
    for (let i = 0; i < 10; i++) { v.fillStyle(0x000000, 0.05); v.fillRect(0, 0, W, (10 - i) * 22); v.fillRect(0, H - (10 - i) * 22, W, (10 - i) * 22); }
    return [r, v];
  }
  function uiDivider(g, x, y, w) {
    g.lineStyle(1, 0x6e4a1c, 1); g.lineBetween(x - w / 2, y + 1, x - 9, y + 1); g.lineBetween(x + 9, y + 1, x + w / 2, y + 1);
    g.lineStyle(1, 0xf2cf86, 0.8); g.lineBetween(x - w / 2, y, x - 9, y); g.lineBetween(x + 9, y, x + w / 2, y);
    const pts = [{ x, y: y - 5 }, { x: x + 6, y }, { x, y: y + 5 }, { x: x - 6, y }];
    g.fillStyle(0x3a2410, 1); g.fillPoints(pts, true); g.lineStyle(1.5, 0xf2cf86, 1); g.strokePoints(pts, true);
  }
  /* 標題橫幅：金屬牌＋兩側絲帶尾 */
  function uiBanner(x, y, w, h, label, o) {
    o = o || {}; const d = o.depth || 2001, g = sc.add.graphics().setDepth(d).setScrollFactor(0);
    [-1, 1].forEach(sd => {
      const bx = x + sd * (w / 2 - 6), tx = x + sd * (w / 2 + 30);
      const pts = [{ x: bx, y: y - h / 2 + 10 }, { x: tx, y: y - h / 2 + 10 }, { x: tx - sd * 14, y: y + 8 }, { x: tx, y: y + h / 2 + 10 }, { x: bx, y: y + h / 2 + 10 }];
      g.fillStyle(0x000000, 0.4); g.fillPoints(pts.map(p => ({ x: p.x + 1, y: p.y + 3 })), true);
      g.fillStyle(0x4a1e18, 1); g.fillPoints(pts, true); g.lineStyle(2, 0xb8873a, 1); g.strokePoints(pts, true);
    });
    uiPanel(g, x - w / 2, y - h / 2, w, h, 9, 1);
    g.fillStyle(0x6a2a1e, 0.55); g.fillRoundedRect(x - w / 2 + 5, y - h / 2 + 5, w - 10, h - 10, 6);
    g.fillStyle(0xffffff, 0.1); g.fillRoundedRect(x - w / 2 + 5, y - h / 2 + 5, w - 10, (h - 10) * 0.42, { tl: 6, tr: 6, bl: 0, br: 0 });
    [-1, 1].forEach(sd => { const dx = x + sd * (w / 2 - 14), pts = [{ x: dx, y: y - 5 }, { x: dx + 5, y }, { x: dx, y: y + 5 }, { x: dx - 5, y }]; g.fillStyle(0xf2cf86, 1); g.fillPoints(pts, true); g.lineStyle(1, 0x3a2410, 1); g.strokePoints(pts, true); });
    const t = UT(x, y - 1, label, Math.round(h * 0.55), o.color || '#ffe6a8', d + 1, { fontStyle: 'bold', strokeThickness: 5 }).setOrigin(0.5).setShadow(0, 3, '#000000', 3, true, true);
    return [g, t];
  }
  /* 金屬按鈕：高光／鉚釘／按下回饋；回傳要一起銷毀的物件陣列 */
  function uiButton(x, y, w, h, label, cb, o) {
    o = o || {}; const d = o.depth || 2001, g = sc.add.graphics().setDepth(d).setScrollFactor(0), fs = o.fs || 20;
    const t = UT(x, y - 1, label, fs, '#fff3cf', d + 1, { fontStyle: 'bold', strokeThickness: 4 }).setOrigin(0.5).setShadow(0, 2, '#000000', 2, true, true);
    const z = sc.add.zone(x, y, w, h).setInteractive({ useHandCursor: true }).setDepth(d + 2).setScrollFactor(0);
    let st = 0;
    const draw = () => {
      g.clear(); const dy = st === 2 ? 2 : 0, X = x - w / 2, Y = y - h / 2 + dy, r = Math.min(13, h / 3);
      g.fillStyle(0x000000, st === 2 ? 0.25 : 0.45); g.fillRoundedRect(X + 1, y - h / 2 + 4, w, h, r);
      g.fillStyle(0x3a2410, 1); g.fillRoundedRect(X, Y, w, h, r);
      g.fillStyle(st === 1 ? 0xf2cf86 : 0xd9ad5c, 1); g.fillRoundedRect(X + 1.5, Y + 1.5, w - 3, h - 3, r - 1);
      g.fillStyle(0x3a2410, 1); g.fillRoundedRect(X + 4, Y + 4, w - 8, h - 8, r - 3);
      const c1 = st === 2 ? 0x6e4418 : st === 1 ? 0xc48a38 : 0xa86e2a, c2 = st === 2 ? 0x3e2410 : st === 1 ? 0x8a5a1e : 0x6a4018;
      g.fillStyle(c2, 1); g.fillRoundedRect(X + 5, Y + 5, w - 10, h - 10, r - 4);
      g.fillStyle(c1, 1); g.fillRoundedRect(X + 5, Y + 5, w - 10, (h - 10) * 0.52, { tl: r - 4, tr: r - 4, bl: 0, br: 0 });
      g.lineStyle(1, 0xffefbf, st === 2 ? 0.3 : 0.75); g.lineBetween(X + r, Y + 6.5, X + w - r, Y + 6.5);
      [X + 13, X + w - 13].forEach(rx => { g.fillStyle(0x000000, 0.6); g.fillCircle(rx, Y + h / 2, 3); g.fillStyle(0xf2cf86, 1); g.fillCircle(rx, Y + h / 2 - 0.5, 2.1); g.fillStyle(0xffffff, 0.8); g.fillCircle(rx - 0.6, Y + h / 2 - 1.2, 0.8); });
      t.setY(y - 1 + dy);
    };
    draw();
    let pressed = false;
    z.on('pointerover', () => { if (!pressed) { st = 1; draw(); } }); z.on('pointerout', () => { st = 0; draw(); });
    z.on('pointerdown', () => { pressed = true; st = 2; draw(); }); z.on('pointerup', () => { if (pressed) { pressed = false; st = 1; draw(); cb(); } });
    return [g, t, z];
  }
  /* 技能卡（選技畫面）：金屬框、標題條、技能徽章、等級菱形 */
  function drawSkillCard(g, x, y, w, h, s, lv, hv) {
    g.clear(); const X = x - w / 2, Y = y - h / 2, col = SK_COL[s.id] || 0xffffff;
    g.fillStyle(0x000000, 0.5); g.fillRoundedRect(X + 1, Y + 5, w, h, 12);
    g.fillStyle(0x3a2410, 1); g.fillRoundedRect(X, Y, w, h, 12);
    g.fillStyle(hv ? 0xffe9a8 : 0xd9ad5c, 1); g.fillRoundedRect(X + 1.5, Y + 1.5, w - 3, h - 3, 11);
    g.fillStyle(0x24160c, 1); g.fillRoundedRect(X + 4, Y + 4, w - 8, h - 8, 9);
    for (let i = 0; i < 8; i++) { g.fillStyle(0x4a3018, 0.5 - i * 0.06); g.fillRoundedRect(X + 5, Y + 5 + i * 14, w - 10, 16, i === 0 ? { tl: 8, tr: 8, bl: 0, br: 0 } : 0); }
    g.fillStyle(0x120b07, 0.6); g.fillRoundedRect(X + 5, Y + h * 0.55, w - 10, h * 0.45 - 5, { tl: 0, tr: 0, bl: 8, br: 8 });
    g.fillStyle(0x6a4418, 1); g.fillRoundedRect(X + 8, Y + 8, w - 16, 30, { tl: 7, tr: 7, bl: 2, br: 2 });
    g.fillStyle(0xffffff, 0.12); g.fillRoundedRect(X + 8, Y + 8, w - 16, 13, { tl: 7, tr: 7, bl: 0, br: 0 });
    g.lineStyle(1, 0xf2cf86, 0.8); g.strokeRoundedRect(X + 8, Y + 8, w - 16, 30, 6);
    g.lineStyle(1, 0xf2cf86, hv ? 0.9 : 0.35); g.strokeRoundedRect(X + 6, Y + 6, w - 12, h - 12, 9);
    if (hv) { g.fillStyle(col, 0.1); g.fillCircle(x, y - 62, 52); }
    skillMedal(g, s.id, x, y - 62, 30, true);
    skillPips(g, x, y - 18, lv, s.max, true, 5);
    uiDivider(g, x, y + 22, w - 26);
  }
  function openPick() {
    const bag = SKILLS.filter(s => (G.st[s.id] || 0) < s.max && !(s.id === 'pierce' && def().kind !== 'shot') && !(s.req && !G.st[s.req])), pool = [];   // 貫穿箭只對遠程箭矢有效，近戰不出現
    while (pool.length < 3 && bag.length) { const w = bag.map(() => 1); let r = Math.random() * w.reduce((a, b) => a + b, 0), i = 0; while (i < w.length - 1 && (r -= w[i]) > 0) i++; pool.push(bag.splice(i, 1)[0]); }
    if (SIM) { pickSkill(aiPickBest(pool), []); return; }
    G.state = 'pick';
    const objs = [];
    G.pickT = 3;
    objs.push(...uiBackdrop(0.8, 2000));
    objs.push(...uiBanner(W / 2, 148, 240, 46, '冒險技能', { depth: 2001 }));
    objs.push(UT(W / 2, 198, '選擇一項強化　本局有效', 13, '#cfd6e6', 2002).setOrigin(0.5));
    pool.forEach((s, i) => {
      const x = 70 + i * 125, y = 392, w = 114, h = 262, lv = G.st[s.id] || 0;
      const g = sc.add.graphics().setDepth(2001).setScrollFactor(0);
      const draw = (hv) => drawSkillCard(g, x, y, w, h, s, lv, hv);
      draw(false);
      const nm = UT(x, y - h / 2 + 24, s.name, 16, '#ffe6a8', 2002, { fontStyle: 'bold' }).setOrigin(0.5);
      const lt = UT(x, y + 1, `Lv ${lv} → ${lv + 1}`, 14, lv ? '#9fe08a' : '#cfd6e6', 2002, { fontStyle: 'bold' }).setOrigin(0.5);
      const ds = UT(x, y + 38, s.lv ? s.lv[lv] : s.desc, 13, '#f1e6d2', 2002, { wordWrap: { width: 90, useAdvancedWrap: true }, align: 'center', strokeThickness: 2 }).setOrigin(0.5, 0);
      const z = sc.add.zone(x, y, w, h).setInteractive({ useHandCursor: true }).setDepth(2003).setScrollFactor(0);
      z.on('pointerover', () => draw(true)); z.on('pointerout', () => draw(false)); z.on('pointerdown', () => pickSkill(s, objs));
      objs.push(g, nm, lt, ds, z);
    });
    const cg = sc.add.graphics().setDepth(2001).setScrollFactor(0);
    const cd = UT(W / 2, 584, '', 15, '#fff0bd', 2003, { fontStyle: 'bold' }).setOrigin(0.5);
    objs.push(cg, cd);
    G.pickCtx = { pool, objs, cd, cg };
  }
  function tickPick(delta) {
    const c = G.pickCtx; if (!c) return;
    G.pickT -= delta / 1000;
    c.cg.clear(); uiPanel(c.cg, W / 2 - 120, 564, 240, 50, 12, 0.95); uiBar(c.cg, W / 2 - 104, 596, 208, 8, Math.max(0, G.pickT) / 3, 0xffe27a, 0xd9992e, 0);
    c.cd.setText(`${Math.max(1, Math.ceil(G.pickT))} 秒後自動${AI.on ? '挑選' : '隨機選擇'}`);
    if (AI.on && G.pickT < 2.2) { pickSkill(aiPickBest(c.pool), c.objs); return; }
    if (G.pickT <= 0) pickSkill(c.pool[Math.floor(Math.random() * c.pool.length)], c.objs);
  }

  /* ---------- HUD ---------- */
  const SK_POS = [[338, 724], [338, 660], [338, 596]];   // 三個主動技按鈕（一技／二技／三技），在必殺鈕左側成弧形排列
  function buildHud() {
    const T = (x, y, s, o) => sc.add.text(x, y, s, Object.assign({ fontSize: '12px', color: '#f1e6d2', stroke: '#1a0d06', strokeThickness: 3 }, o || {})).setDepth(1901).setScrollFactor(0);
    sc.hudTexts.name = T(14, 12, '', { fontSize: '14px', fontStyle: 'bold', color: '#ffe6a8' });
    sc.hudTexts.hp = T(109, 37, '', { fontSize: '11px' }).setOrigin(0.5);
    sc.hudTexts.wave = T(W - 55, 16, '', { fontSize: '12px', fontStyle: 'bold', color: '#ffe6a8' }).setOrigin(0.5);
    sc.hudTexts.lv = T(16, 78, '', { fontSize: '12px', color: '#bfeeff' });
    sc.hudTexts.skills = T(14, 94, '', { fontSize: '11px', color: '#cfe8a8', wordWrap: { width: W - 110 } });
    sc.hudTexts.boss = T(W / 2, 200, '', { fontSize: '12px', fontStyle: 'bold', color: '#ffe6a8' }).setOrigin(0.5, 0);
    sc.hudTexts.ver = T(W / 2, 828, VERSION, { fontSize: '10px', color: '#a8987a' }).setOrigin(0.5, 0);
    sc.hudTexts.dbg = T(12, 100, '', { fontSize: '11px', color: '#ffffff', backgroundColor: '#000000aa' });
    sc.hudTexts.ult = T(0, 0, '必殺', { fontSize: '15px', fontStyle: 'bold', color: '#fff0bd' }).setOrigin(0.5);
    sc.hudTexts.sw = [1, 2].map(() => T(0, 0, '', { fontSize: '11px', color: '#ffffff' }).setOrigin(0.5));
    sc.swapZones = [1, 2].map((_, k) => sc.add.zone(48 + k * 66, 772, 56, 56).setInteractive({ useHandCursor: true }).setDepth(1902).setScrollFactor(0));
    if (ROSTER.length < 2) sc.swapZones.forEach(z => z.disableInteractive());
    sc.swapZones.forEach((z, k) => z.on('pointerdown', () => { const idx = swapIndices()[k]; if (idx != null) doSwap(idx); }));
    sc.mapZone = sc.add.zone(W - 52, 111, 96, 164).setInteractive({ useHandCursor: true }).setDepth(1902).setScrollFactor(0);
    sc.mapZone.on('pointerdown', () => { if (G.state === 'play') openMap(); });
    sc.skZones = SK_POS.map((pos, i) => { const z = sc.add.zone(pos[0], pos[1], 60, 60).setInteractive({ useHandCursor: true }).setDepth(1902).setScrollFactor(0); z.on('pointerdown', () => castSkill(i)); return z; });
    sc.hudTexts.skCd = SK_POS.map(() => T(0, 0, '', { fontSize: '15px', fontStyle: 'bold', color: '#ffffff' }).setOrigin(0.5).setDepth(1911));
    sc.ultZone = sc.add.zone(338, 790, 84, 84).setInteractive({ useHandCursor: true }).setDepth(1902).setScrollFactor(0);
    sc.ultZone.on('pointerdown', ultimate);
  }
  const swapIndices = () => G.chars.map((c, i) => i).filter(i => i !== G.active);

  function drawHud() {
    const g = sc.gHud; g.clear();
    const c = act(), d = def();
    const rect = (x, y, w, h, col, a) => { g.fillStyle(col, a == null ? 1 : a); g.fillRect(x, y, w, h); };
    { const hr = c.hp / d.maxHp, low = hr <= 0.3, pulse = low ? 0.5 + 0.5 * Math.sin(G.t * 8) : 0;
      uiPanel(g, 6, 8, 206, 62, 10, 0.88);
      uiBar(g, 14, 30, 190, 14, hr, low ? 0xff8a6b : 0x8cf08a, low ? 0xb02a1a : 0x2f9a44, 6);
      if (low) { g.fillStyle(0xff3a2a, 0.12 * pulse); g.fillRoundedRect(14, 30, 190, 14, 7); }
      uiBar(g, 14, 50, 190, 8, Math.min(1, G.crystals / G.need), 0x9fe6ff, 0x2a86c8, 0); }
    if (G.pl.shield > 0) { g.lineStyle(2, 0x7be4df, 1); g.strokeCircle(214, 38, 7); }
    sc.hudTexts.name.setText(`${d.name}（${d.weapon}）${d.rangeTier ? '　射程:' + d.rangeTier : ''}`);
    sc.hudTexts.hp.setText(`${Math.ceil(c.hp)}/${d.maxHp}`);
    sc.hudTexts.wave.setText(TUT ? `序章 ${TUT}/3` : (G.wave < 0 ? 'READY' : `WAVE ${Math.min(G.wave + 1, WAVES.length)}/${WAVES.length}`));
    sc.hudTexts.lv.setText(`成長 Lv${G.level}　結晶 ${G.crystals}/${G.need}`);
    sc.hudTexts.skills.setText('');
    uiPanel(g, W - 104, 5, 98, 22, 8, 0.92);                                   // 波數牌
    uiPanel(g, 6, 74, 170, 22, 8, 0.9);                                         // 成長／結晶牌
    SKILLS.filter(s2 => G.st[s2.id]).forEach((s2, i) => { const x = 19 + (i % 9) * 27, y = 114 + Math.floor(i / 9) * 34; skillMedal(g, s2.id, x, y, 10, false); skillPips(g, x, y + 17, G.st[s2.id], s2.max, false, 2.2); });
    { const bs = G.enemies.find(e => !e.dead && (e.def.kind === 'mirror' || e.tutBoss));
      if (bs) { uiPanel(g, 20, 140, 270, 30, 9, 0.92); uiBar(g, 32, 157, 246, 8, Math.max(0, bs.hp) / bs.maxHp, 0x9fd8ff, 0x2a6aa8, 0); sc.hudTexts.boss.setText(bs.def.name + (bs.shieldT > 0 ? '　鏡盾' : '')).setPosition(155, 142); } else sc.hudTexts.boss.setText(''); }
    drawMiniMap(g); drawAuto(g);
    if (TUT && G.tut && /^skill[123]$/.test(G.tut.phase)) { const i = +G.tut.phase.slice(-1) - 1; g.lineStyle(3, 0xffd24a, 0.9); g.strokeCircle(SK_POS[i][0], SK_POS[i][1], 34 + Math.sin(G.t * 6) * 4); }
    if (TUT && G.tut && G.tut.phase === 'ult') { g.lineStyle(3, 0xffd24a, 0.9); g.strokeCircle(338, 790, 46 + Math.sin(G.t * 6) * 5); }
    if (TUT && G.tut && G.tut.phase === 'auto') { g.lineStyle(3, 0xffd24a, 0.9); g.strokeRoundedRect(292, 510, 92, 40, 8); }
    if (QS.get('debug')) { const a = sc.plSp && sc.plSp.anims.currentAnim; sc.hudTexts.dbg.setText(`動畫：${a ? a.key : '-'}　面向：(${G.pl.fx.toFixed(2)}, ${G.pl.fy.toFixed(2)})　翻轉：${sc.plSp && sc.plSp.flipX ? '朝右' : '朝左'}`); } else sc.hudTexts.dbg.setText('');
    { const hs = HERO_SK[act().id];   // 三個主動技按鈕：金屬圓座＋技能圖示＋冷卻扇形與秒數
      SK_POS.forEach((pos, i) => {
        if (!hs) { sc.hudTexts.skCd[i].setText(''); return; }
        const [bx, by] = pos, sk = hs[i], cdv = G.cd[i], ready = cdv <= 0, needMark = act().id === 'zane' && i === 2 && !G.enemies.some(e => !e.dead && e.mark);
        if (ready && !needMark) { g.fillStyle(0xffd24a, 0.12 + 0.1 * (0.5 + 0.5 * Math.sin(G.t * 7))); g.fillCircle(bx, by, 34); }
        uiOrb(g, bx, by, 24, ready && !needMark);
        skillIcon(g, sk.id, bx, by, 24 / 17);
        if (!ready) { g.fillStyle(0x000000, 0.55); g.beginPath(); g.moveTo(bx, by); g.arc(bx, by, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (cdv / sk.cd), false); g.closePath(); g.fillPath(); }
        else if (needMark) { g.fillStyle(0x000000, 0.4); g.fillCircle(bx, by, 24); }
        sc.hudTexts.skCd[i].setPosition(bx, by).setText(ready ? '' : String(Math.ceil(cdv)));
      }); }
    // 必殺鈕：金屬圓環＋集氣弧＋滿氣光暈
    { const ux = 338, uy = 790, ready = G.gauge >= 100, pr = Math.min(1, G.gauge / 100), pu = 0.5 + 0.5 * Math.sin(G.t * 8);
      if (ready) { g.fillStyle(0xffd24a, 0.12 + 0.12 * pu); g.fillCircle(ux, uy, 54); g.fillStyle(0xffd24a, 0.1 + 0.08 * pu); g.fillCircle(ux, uy, 62); }
      uiOrb(g, ux, uy, 36, ready);
      g.lineStyle(7, 0x000000, 0.55); g.beginPath(); g.arc(ux, uy, 29, 0, Math.PI * 2, false); g.strokePath();       // 軌道槽
      if (pr > 0.005) {
        g.lineStyle(7, ready ? 0xffe27a : 0xd9992e, 1); g.beginPath(); g.arc(ux, uy, 29, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pr, false); g.strokePath();
        g.lineStyle(2, 0xfff6c8, 0.8); g.beginPath(); g.arc(ux, uy, 31.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pr, false); g.strokePath();
      }
      if (ready) { g.fillStyle(0xfff0a8, 0.22 + 0.14 * pu); g.fillCircle(ux, uy, 22); }
      sc.hudTexts.ult.setPosition(ux, uy).setColor(ready ? '#fff7d0' : '#b8a888').setText(ready ? def().ult.name : '必殺'); }
    // 換人鈕
    swapIndices().forEach((idx, k) => {
      const ch = G.chars[idx], x = 48 + k * 66, y = 772, cd = G.swapCd > 0, ok = ch.alive && !cd;
      uiOrb(g, x, y, 24, ok);
      const mh = CH[ch.id].maxHp; rect(x - 22, y + 20, 44, 5, 0x000000, 0.7); rect(x - 21, y + 21, 42 * ch.hp / mh, 3, ch.alive ? 0x67d96c : 0x444444);
      sc.hudTexts.sw[k].setPosition(x, y - 2).setText(ch.alive ? CH[ch.id].name : '倒下').setColor(ok ? '#ffffff' : '#7a6a5a');
    });
    sc.swapZones.forEach((z, k) => z.setPosition(48 + k * 66, 772));
    // 搖桿
    const s = sc.stick;
    if (s.on) { g.fillStyle(0x120b07, 0.32); g.fillCircle(s.ox, s.oy, 58); g.lineStyle(3, 0xd9ad5c, 0.6); g.strokeCircle(s.ox, s.oy, 56); g.lineStyle(1, 0x000000, 0.5); g.strokeCircle(s.ox, s.oy, 52); g.lineStyle(1, 0xf2cf86, 0.35); g.strokeCircle(s.ox, s.oy, 38); uiOrb(g, s.ox + s.dx * 40, s.oy + s.dy * 40, 17, true); }
  }

  /* ---------- 主迴圈 ---------- */
  function update(time, delta) {
    if (!G) return;
    if (G.state === 'pick') tickPick(delta);
    if (G.state === 'map') drawBigMap();
    if (SIM) { simFrame(); return; }   // 模擬模式不畫畫面（只算邏輯），避免白白吃 CPU／顯示
    const total = Math.min(delta / 1000, 0.05) * TIME_SCALE, n = Math.max(1, Math.ceil(total / 0.033));
    const P = QS.get('prof') ? (window.__prof = window.__prof || { step: 0, render: 0, hud: 0, n: 0 }) : null, t0 = P ? performance.now() : 0;
    for (let i = 0; i < n && G.state === 'play'; i++) stepGame(total / n);
    if (Phaser.Input.Keyboard.JustDown(sc.keys.T)) toggleAuto();
    const t1 = P ? performance.now() : 0;
    render();
    const t2 = P ? performance.now() : 0;
    drawHud();
    if (P) { const t3 = performance.now(); P.step += t1 - t0; P.render += t2 - t1; P.hud += t3 - t2; P.n++; }
  }

  /* 一個遊戲步（dt 秒）：玩家輸入／自動戰鬥 → 移動攻擊 → 敵人、波數、結晶、技能 */
  const SLASH_LEAD = 0.09;   // 劍光精靈圖最亮的第 4 格出現在播放後約 0.09 秒 → 傷害要落在這一刻
  const ULT_DUR = 1.5, ULT_TICKS = 6;
  /* 必殺總傷害（jun 11-17 平衡概念）：∝ 集氣所需秒數 ÷（攻擊範圍角度 × 攻擊射程）；只看角色基礎值，不受技能加成影響；以雷歐=156 為基準反推 K */
  const ULT_K = 156 * 60 * 100 / (Math.ceil(100 / 3) * 0.55);
  function ultTotal(d) { return d.ultAngle ? ULT_K * Math.ceil(100 / 3) * d.cd / (d.ultAngle * d.range) : d.ultFixed; }   // 必殺演出 1.5 秒、期間 6 次傷害判定（jun 11-17：演出至少 1.5 秒且全程有傷害判定）
  const ULT_DELAY = 0.18;    // 必殺特效（雷光爆發／落雷）最亮的時刻約在 0.18 秒 → 傷害延到這一刻
  function stepGame(dt) {
    if (G.hitStop > 0) { G.hitStop -= dt; return; }
    G.t += dt;
    const p = G.pl;
    G.swapCd = Math.max(0, G.swapCd - dt); G.inv = Math.max(0, G.inv - dt); G.vuln = Math.max(0, (G.vuln || 0) - dt); for (let i = 0; i < 3; i++) G.cd[i] = Math.max(0, G.cd[i] - dt);
    p.atkCd = Math.max(0, p.atkCd - dt); p.atkLock = Math.max(0, p.atkLock - dt); p.hurtT = Math.max(0, (p.hurtT || 0) - dt);
    if (act().id === 'sere') updateSere(dt); if (act().id === 'oz') updateOz(dt); updateBolts(dt);
    if (G.sereIn) for (let i = 0; i < 3; i++) G.cd[i] = Math.max(0, G.cd[i] - dt * TUNE.sPas);   // 潮汐：水域內冷卻速度 +50%
    G.tq = G.tq.filter(q => { q.t -= dt; if (q.t <= 0) { q.fn(); return false; } return true; });   // 延遲事件（二連擊、旋風斬、第二圈衝擊波）
    if (G.ultRun) p.atkLock = Math.max(p.atkLock, 0.1);   // 必殺演出期間鎖住：不能移動、不能普攻
    if (G.ultRun) { const r = G.ultRun; r.t += dt; while (r.n < ULT_TICKS && r.t >= ULT_DELAY + r.n * ((ULT_DUR - ULT_DELAY - 0.07) / (ULT_TICKS - 1))) { ultimateTick(r.u, r.n); r.n++; } if (r.t >= ULT_DUR) endUltRun(); }
    if (p.pend && !p.slashFired && p.pend.d.kind === 'arc' && p.pend.t - dt <= SLASH_LEAD) { p.slashFired = true; slashFx(p.x, p.y, Math.atan2(p.fy, p.fx), p.pend.d.range * rangeMul()); }
    if (p.pend) { p.pend.t -= dt; if (p.pend.t <= 0) { const q = p.pend; p.pend = null; if (G.state === 'play' && act().id === q.id) doHit(q.d, q.tx, q.ty); } }
    let mx = sc.stick.dx, my = sc.stick.dy;
    const k = sc.keys;
    if (k.A.isDown || k.LEFT.isDown) mx -= 1; if (k.D.isDown || k.RIGHT.isDown) mx += 1;
    if (k.W.isDown || k.UP.isDown) my -= 1; if (k.S.isDown || k.DOWN.isDown) my += 1;
    if (Phaser.Input.Keyboard.JustDown(k.SPACE)) ultimate();
    ['ONE', 'TWO', 'THREE'].forEach((kn, i) => { if (Phaser.Input.Keyboard.JustDown(k[kn])) castSkill(i); });   // 主動技快捷鍵 1／2／3
    // 自動戰鬥：碰搖桿／方向鍵就由玩家接手，放開約 2 秒後自動接回
    if (Math.hypot(mx, my) > 0.12) AI.hold = 2; else AI.hold = Math.max(0, AI.hold - dt);
    AI.auto = AI.on && AI.hold <= 0;
    if (AI.auto) { AI.t -= dt; if (AI.t <= 0) { aiDecide(); AI.t = 0.1; } mx = AI.mx; my = AI.my; }
    if (p.dash) { stepDash(dt); mx = my = 0; }   // 衝刺中不受搖桿／AI 控制
    const ml = Math.hypot(mx, my);
    if (ml > 0.12) G.lastMove = { x: mx / ml, y: my / ml };
    p.moving = ml > 0.12 && p.atkLock <= 0 && !(G.oz && G.oz.anchor);   // 大地之錨：4 秒內不能移動
    if (p.moving) {
      const spd = 150 * (1 + 0.12 * G.st.spd) * (G.sereIn ? 1.2 : 1) * (inForest(p.x, p.y) ? 0.55 : 1), s = Math.min(1, ml);
      p.x = clamp(p.x + mx / ml * spd * s * dt, ARENA.x0, ARENA.x1); p.y = clamp(p.y + my / ml * spd * s * dt, ARENA.y0, ARENA.y1);
      resolveSolid(p, 12);
      faceTo(mx, my);
    } else if (p.atkLock <= 0) tryAttack();
    updateWaves(dt); updateEnemies(dt); updateShots(dt); updatePickups(dt); updateSkillsTimers(dt); updateSwaves(dt); updateTg(dt); updateTutorial();
    if (SIM && G.t > 100 && !G.dbg1 && G.state === 'play') G.dbg1 = G.enemies.filter(e => !e.dead).map(e => [e.type, Math.round(dist(e, G.pl)), Math.round(e.x), Math.round(e.y), Math.round(e.stun * 10) / 10, e.tele > 0 ? 1 : 0]).concat([['pl', Math.round(G.pl.x), Math.round(G.pl.y), AI.mode]]);
    if (SIM && G.t > 300 && G.state === 'play') { G.lastSrc = 'timeout'; endGame(false); }
  }

  /* ---------- 自動戰鬥 AI ---------- */
  const AI = { on: QS.get('auto') === '1' || !!SIM || SET.auto, auto: false, hold: 0, t: 0, mx: 0, my: 0, mode: '' };
  /* 自動戰鬥的主動技施放（澤恩）：雷印看到敵人就放（場上雷印<4）；雷爆在 ≥2 個雷印或首領有雷印時引爆；閃雷步用來衝向遠處的雷印敵人，或在預警圈內逃生 */
  function autoCast(es, inTele) {
    const p = G.pl, marks = es.filter(e => e.mark);
    if (act().id === 'oz') {   // 歐斯自動施放：多隻敵人貼近就放大地之錨／反震姿態；有敵人在 100～260 之間就前衝盾擊
      const near = es.filter(e => dist(e, p) < 160).length;
      if (G.cd[2] <= 0 && near >= 2 && !(G.oz && G.oz.anchor)) { castSkill(2); return; }
      if (G.cd[1] <= 0 && near >= 3 && !(G.oz && G.oz.counter)) { castSkill(1); return; }
      if (G.cd[0] <= 0 && nearest(260) && !nearest(70)) castSkill(0);
      return;
    }
    if (act().id === 'sere') {   // 瑟蕾自動施放：敵人逼近就放水域；多隻敵人時放漩渦；近身時放怒濤
      if (G.cd[2] <= 0 && nearest(200)) { castSkill(2); return; }
      if (G.cd[1] <= 0 && es.filter(e => dist(e, p) < 300).length >= 2) { castSkill(1); return; }
      if (G.cd[0] <= 0 && (G.pools || []).length < 2 && nearest(300)) castSkill(0);
      return;
    }
    if (G.cd[2] <= 0 && (marks.length >= 2 || marks.some(e => e.type === 'boss'))) { castSkill(2); return; }
    if (inTele && G.cd[1] <= 0 && (AI.mx || AI.my)) { G.lastMove = { x: AI.mx, y: AI.my }; if (castSkill(1, true)) return; }
    if (G.cd[1] <= 0) { const far = marks.filter(e => dist(e, p) > 150 && dist(e, p) < 380)[0]; if (far && !nearest(60)) { if (castSkill(1)) return; } }
    if (G.cd[0] <= 0 && marks.length < 4 && nearest(340)) castSkill(0);
  }
  function toggleAuto() { AI.on = !AI.on; AI.hold = 0; AI.t = 0; AI.mx = AI.my = 0; }
  const PICK_PRIO = ['as', 'atk', 'whirl', 'slashwave', 'blades', 'thunder', 'multithunder', 'wave', 'chain', 'twin', 'crit', 'poison', 'slow', 'rng', 'burst', 'magnet', 'life', 'shield', 'counter', 'dash', 'spd', 'pierce'];
  function aiPickBest(pool) { return pool.slice().sort((a, b) => PICK_PRIO.indexOf(a.id) - PICK_PRIO.indexOf(b.id))[0]; }
  const AI_DIRS = Array.from({ length: 16 }, (_, i) => [Math.cos(i * Math.PI / 8), Math.sin(i * Math.PI / 8)]);
  function aiDecide() {
    const p = G.pl, d = def(), R = d.range * rangeMul(), hpR = act().hp / d.maxHp;
    const es = G.enemies.filter(e => !e.dead);
    const spd = 150 * (1 + 0.12 * G.st.spd);
    const edge = e => dist(e, p) - e.def.r;
    // 必殺：集氣滿，且周圍 3 隻以上／首領在範圍內／血量低時近身有敵人
    if (G.gauge >= 100) {
      const u = d.ult, inR = es.filter(e => edge(e) < u.r);
      if (inR.length >= 3 || inR.some(e => e.type === 'boss') || (hpR < 0.4 && inR.length >= 1)) ultimate();
    }
    const tele = teleList(es);
    const inTele = tele.some(e => Math.hypot(p.x - e.tx, p.y - e.ty) < e.r + 28);
    if (HERO_SK[act().id]) autoCast(es, inTele);
    const kiteD = AI.mode === 'kite' ? 78 : 34;   // 退開後要拉開到 78 才停（避免來回抖動）
    const close = es.some(e => dist(e, p) < e.def.r + 14 + kiteD);
    const none = () => { AI.mx = AI.my = 0; };
    // 評分：預測 0.45 秒後的位置安全度
    const L = spd * 0.45;
    const open = (x, y) => { let c = 0; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, qx = x + Math.cos(a) * 80, qy = y + Math.sin(a) * 80; if (qx > ARENA.x0 + 20 && qx < ARENA.x1 - 20 && qy > ARENA.y0 + 20 && qy < ARENA.y1 - 20 && !solidAt(qx, qy, 14)) c++; } return c / 8; };
    const score = (x, y, goal) => {
      if (solidAt(x, y, 14)) return -1e5;
      let sc0 = 0;
      for (const e of es) {
        const dd = Math.hypot(e.x - x, e.y - y) - e.def.spd * 0.45 - (e.def.r + 14);
        if (dd < 70) sc0 -= (70 - Math.max(dd, -20)) * (e.def.dmg / 6) * (e.def.aoe ? 1.3 : 1) * (e.type === 'boss' ? 1.5 : 1);
      }
      for (const t of tele) { const dc = Math.hypot(x - t.tx, y - t.ty) - (t.r + 28); if (dc < 0) sc0 -= 300 - dc * 3; }
      const m = Math.min(x - ARENA.x0, ARENA.x1 - x, y - ARENA.y0, ARENA.y1 - y);
      if (m < 90) sc0 -= (90 - m) * 1.2;
      if (inForest(x, y)) sc0 -= 30;
      sc0 += open(x, y) * 45;
      if (goal) sc0 -= Math.hypot(goal.x - x, goal.y - y) * 0.9;
      return sc0;
    };
    const pick = goal => {
      let best = null, bs = -1e9;
      for (const [dx, dy] of AI_DIRS) {
        let ok = true;
        for (let k = 1; k <= 3; k++) if (solidAt(p.x + dx * L * k / 3, p.y + dy * L * k / 3, 14)) { ok = false; break; }
        if (!ok) continue;
        let v = score(p.x + dx * L, p.y + dy * L, goal);
        if (AI.mx * dx + AI.my * dy > 0.9) v += 18;   // 方向連續加分，減少抖動
        if (tele.length) {   // 預警中：看整段逃跑路線（有沒有牆擋、跑完是否真的出圈）
          let fl = 0; while (fl < 220) { const qx = p.x + dx * (fl + 14), qy = p.y + dy * (fl + 14); if (solidAt(qx, qy, 14) || qx < ARENA.x0 + 8 || qx > ARENA.x1 - 8 || qy < ARENA.y0 + 8 || qy > ARENA.y1 - 8) break; fl += 14; }
          const ex = p.x + dx * fl, ey = p.y + dy * fl;
          for (const t of tele) {
            const dc = Math.hypot(ex - t.tx, ey - t.ty) - (t.r + 28);
            if (dc < 0) v -= 250 - dc * 3;
            v += (dx * (p.x - t.tx) + dy * (p.y - t.ty)) / (Math.hypot(p.x - t.tx, p.y - t.ty) || 1) * 30;
          }
          v += fl * 0.25;
        }
        if (v > bs) { bs = v; best = [dx, dy]; }
      }
      if (!best) { AI.mx = AI.my = 0; return; }
      AI.mx = best[0]; AI.my = best[1];
    };
    if (inTele) { AI.mode = 'dodge'; const nr = es.slice().sort((x, y) => dist(x, p) - dist(y, p))[0]; pick(nr ? { x: nr.x, y: nr.y } : null); return; }   // 閃避時順便朝最近敵人靠近
    if (close) { AI.mode = 'kite'; pick(null); return; }
    if (nearest(R)) { AI.mode = 'attack'; none(); return; }
    // 沒有敵人在射程：先撿近處結晶，否則朝最近敵人靠近到射程邊緣
    const cr = G.pickups.filter(c => !c.gone && !c.skip).sort((a, b) => dist(a, p) - dist(b, p))[0];
    if (cr && dist(cr, p) < 320 && clearLine(p.x, p.y, cr.x, cr.y, 12)) {
      if (AI.mode !== 'crystal' || AI.cr !== cr) { AI.cr = cr; AI.cT = 0; } AI.cT += 0.1;
      if (AI.cT > 4) { cr.skip = true; } else { AI.mode = 'crystal'; pick(cr); return; }
    }
    const tg = es.sort((a, b) => dist(a, p) - dist(b, p))[0];
    if (tg) { AI.mode = 'chase'; pick({ x: tg.x, y: tg.y }); return; }
    AI.mode = 'wait'; none();
  }

  /* ---------- 加速模擬：?sim=N 連續跑 N 局，統計勝率 ---------- */
  function simFrame() {
    for (let i = 0; i < 40 && G.state === 'play'; i++) stepGame(1 / 30);
  }
  function simRecord(win) {
    let res = []; try { res = JSON.parse(localStorage.getItem('apSimRes') || '[]'); } catch (e) {}
    res.push({ node: NODE_N, wt: G.wt, snap: G.dbg1, win, t: Math.round(G.t), hp: Math.round(act().hp), lv: G.level, wave: G.wave + 1, cause: win ? '' : G.lastSrc, dmgBy: G.dmgBy, picks: G.picks.length, info: win ? null : { px: Math.round(G.pl.x), py: Math.round(G.pl.y), mode: AI.mode, es: G.enemies.filter(e => !e.dead).map(e => [e.type, Math.round(e.x), Math.round(e.y), Math.round(e.hp), e.tele > 0 ? 1 : 0]) } });
    localStorage.setItem('apSimRes', JSON.stringify(res));
    window.__simN = res.length;
    if (res.length < SIM) setTimeout(() => location.reload(), 30); else { window.__simDone = true; document.title = 'SIMDONE'; }
  }
  if (SIM && sessionStorage.getItem('apSimInit') !== String(SIM) + (QS.get('r') || '')) { localStorage.removeItem('apSimRes'); sessionStorage.setItem('apSimInit', String(SIM) + (QS.get('r') || '')); }

  /* 受擊表現：閃爍兩次，期間維持 70% 透明度，角色動作照常播放 */
  function hurtAlpha(t) {
    if (!t || t <= 0) return 1;
    const ph = Math.floor((0.4 - t) / 0.1);   // 0,1,2,3
    return ph % 2 === 0 ? 0.35 : 0.7;
  }
  function boltExplode(b) {
    const p = G.pl; if (!SIM) { playFx('sere_bolt', 1, b.x, b.y + 22, { s: 0.55, oy: 0.8, depth: 908 }); playFx('sere_bolt', 3, b.x, b.y + 10, { s: 0.6, depth: 909 }); }
    G.enemies.forEach(e => { if (!e.dead && Math.hypot(e.x - b.x, e.y - 30 - b.y) < 50 + e.def.r) hurtEnemy(e, b.dmg, b, false, { fc: b.fc, normal: true }); });
  }
  function updateBolts(dt) {
    if (!G.bolts) return;
    G.bolts.forEach(b => {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.sp) b.sp.setPosition(b.x, b.y);
      let hit = G.enemies.some(e => !e.dead && Math.hypot(e.x - b.x, e.y - 30 - b.y) < e.def.r + 10);
      if (!hit && solidAt(b.x, b.y + 40, 2, ['mountain', 'building'])) hit = true;
      if (hit || b.life <= 0) { b.dead = true; boltExplode(b); if (b.sp) b.sp.destroy(); }
    });
    G.bolts = G.bolts.filter(b => !b.dead);
  }
  function updateShots(dt) {
    G.shots.forEach(s => {
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      G.enemies.forEach(e => { if (!s.dead && !e.dead && !(s.hit && s.hit.has(e)) && Math.hypot(e.x - s.x, e.y - 30 - s.y) < e.def.r + 10) { if (s.hit) s.hit.add(e); hurtEnemy(e, s.dmg * (s.k || 1), s, false, { fc: s.fc, normal: true }); s.k = (s.k || 1) * (s.step || 1); s.left = (s.left == null ? 1 : s.left) - 1; if (s.left <= 0) s.dead = true; } });
      if (s.x < 0 || s.x > WORLD_W || s.y < 0 || s.y > WORLD_H) s.dead = true;
      if (!s.dead && solidAt(s.x, s.y + 40, 2, ['mountain', 'building'])) { s.dead = true; ringFx(s.x, s.y + 20, 0xffffff, 18); }
    });
    G.shots = G.shots.filter(s => !s.dead && s.life > 0);
  }

  function render() {
    const p = G.pl, g = sc.gWorld; g.clear();
    if (TUT && G.tut && G.tut.phase === 'move') { const r = 30 + Math.sin(G.t * 5) * 4; g.fillStyle(0xffd24a, 0.18); g.fillCircle(G.tut.target.x, G.tut.target.y, r); g.lineStyle(3, 0xffd24a, 0.95); g.strokeCircle(G.tut.target.x, G.tut.target.y, r + 8); g.lineStyle(2, 0xfff0a0, 0.7); g.strokeCircle(G.tut.target.x, G.tut.target.y, r * 0.55); }
    if (G.state === 'play' || G.state === 'pick' || G.state === 'map') {
      const d = def(), R = d.range * rangeMul(), ready = p.atkCd <= 0;
      g.lineStyle(2, 0xffffff, ready ? 0.21 : 0.12); g.strokeCircle(p.x, p.y, R);   // jun 11-21：攻擊範圍圈只是提示，透明度加 70%（不透明度 ×0.3）
    }
    { const cam = sc.cameras.main, tx = p.x - W * RS / 2, ty = p.y - (470 - H / 2) / ZOOM - H * RS / 2;   // 角色維持在畫面 y≈470 處；邊界夾制交給鏡頭 bounds（已考慮縮放）
      cam.scrollX += (tx - cam.scrollX) * 0.18; cam.scrollY += (ty - cam.scrollY) * 0.18; }
    if (sc.plSp) {
      const id = act().id, hasMove = !!HAS_MOVE[id];
      if (p.atkLock <= 0 && G.state !== 'end') {
        const fast = Math.hypot(sc.stick.dx, sc.stick.dy) > 0.85 || (sc.keys && (sc.keys.LEFT.isDown || sc.keys.RIGHT.isDown || sc.keys.UP.isDown || sc.keys.DOWN.isDown || sc.keys.A.isDown || sc.keys.D.isDown || sc.keys.W.isDown || sc.keys.S.isDown));
        const want = p.moving && hasMove ? (fast ? 'run' : 'walk') : 'idle', key = animName(id, want);
        if (sc.plSp.anims.currentAnim && sc.plSp.anims.currentAnim.key !== key && !/_atk\d?$/.test(sc.plSp.anims.currentAnim.key)) sc.plSp.play(key, true);
        else if (sc.plSp.anims.currentAnim && /_atk\d?$/.test(sc.plSp.anims.currentAnim.key) && !sc.plSp.anims.isPlaying) sc.plSp.play(key, true);
      }
      const bob = p.moving && !hasMove ? Math.sin(G.t * 20) * 3 : 0;
      sc.plSp.setPosition(p.x, p.y + bob).setDepth(p.y).setFlipX(HAS_DIAG[act().id] && (dirOf() === 'fr' || dirOf() === 'bk') ? false : (p.fx > 0.05 || (Math.abs(p.fx) <= 0.05 && sc.plSp.flipX)));
      sc.plSp.setAlpha(hurtAlpha(p.hurtT));
      // 必殺演出期間：停在揮劍出手的那一格（第4格＝劍刺出最遠），演出結束再接著播完
      if (G.ultRun && sc.plSp.anims.currentAnim && /_atk\d?$/.test(sc.plSp.anims.currentAnim.key) && sc.plSp.anims.isPlaying && sc.plSp.anims.currentFrame && sc.plSp.anims.currentFrame.index >= 4) sc.plSp.anims.pause();
      sc.plSp.anims.timeScale = (p.moving && !hasMove) ? 2 : 1;
      sc.shadow.setPosition(p.x, p.y + 2).setDepth(p.y - 1);
      /* 蓄力光環：必殺集氣滿時，套在角色腳下循環播放（光環中心在格內 y≈195，故 origin.y=0.76；深度貼在角色下方） */
      if (!SIM) {
        const on = G.gauge >= 100 && G.state === 'play';
        if (on && !sc.chargeSp) { sc.chargeSp = sc.add.sprite(p.x, p.y + 2, 'fx_charge', 0).setOrigin(0.5, 0.76).setScale(0.55).setBlendMode(ADD()).setAlpha(0); sc.chargeSp.play('fxa_charge_0'); }
        if (sc.chargeSp) {
          const t = on ? 0.95 : 0, a = sc.chargeSp.alpha + (t - sc.chargeSp.alpha) * 0.2;
          sc.chargeSp.setPosition(p.x, p.y + 2).setDepth(p.y - 0.5).setAlpha(a);
          if (!on && a < 0.03) { sc.chargeSp.destroy(); sc.chargeSp = null; }
        }
      }
    }
    G.enemies.forEach(e => {
      if (e.dead) return;
      e.sp.setPosition(e.x, e.y).setDepth(e.y);
      if (e.def.art) {
        const v = enemyView(e);
        if (!e.atking) { const k = `en_${e.def.art}_${v}_move`; if (!e.sp.anims.currentAnim || e.sp.anims.currentAnim.key !== k) e.sp.play(k, true); }
        e.sp.setFlipX(v === 'side' && G.pl.x > e.x);
      } else e.sp.setFlipX(G.pl.x > e.x);
      e.flashT = Math.max(0, (e.flashT || 0) - 0.016);
      if (e.flashT > 0) e.sp.setTintFill(0xffffff); else { const tt = statusTint(e); if (tt) e.sp.setTint(tt); else e.sp.clearTint(); }
      e.sp.setAlpha(hurtAlpha(e.hurtT));
      if (e.tele > 0) {   // 範圍預警：底色＋由內往外填滿的進度＋警示虛線環＋脈動外框
        const a = e.def.aoe, pr = 1 - e.tele / a.tele, pu = 0.5 + 0.5 * Math.sin(G.t * 16);
        g.fillStyle(0x3a0a06, 0.22); g.fillCircle(e.tx, e.ty, a.r);
        g.fillStyle(0xff4a2a, 0.16 + 0.22 * pr); g.fillCircle(e.tx, e.ty, a.r * (0.15 + 0.85 * pr));
        g.lineStyle(2, 0xffb070, 0.35 + 0.4 * pu); g.strokeCircle(e.tx, e.ty, a.r * 0.62);
        g.lineStyle(4, 0xff5a40, 0.65 + 0.3 * pu); g.strokeCircle(e.tx, e.ty, a.r);
        for (let i = 0; i < 14; i++) { const a0 = i * Math.PI * 2 / 14 + G.t * 0.8; g.lineStyle(3, 0xffe0a0, 0.8); g.beginPath(); g.arc(e.tx, e.ty, a.r + 5, a0, a0 + 0.11, false); g.strokePath(); }
      }
    });
    G.enemies.forEach(e => { if (!e.dead && e.bite && !e.bite.go) { const pu = 0.5 + 0.5 * Math.sin(G.t * 20); g.lineStyle(3, 0xff5a40, 0.5 + 0.4 * pu); g.strokeCircle(e.x, e.y, 78); g.fillStyle(0xff4a2a, 0.12 + 0.2 * (1 - e.bite.t / 0.4)); g.fillCircle(e.x, e.y, 78 * (1 - e.bite.t / 0.4)); } });
    G.enemies.forEach(e => {   // 雷印標記：敵人頭上的雷印符文（Codex 特效，浮現→常駐循環→消散），剩 1.5 秒內閃爍
      const on = !e.dead && e.mark;
      if (on && !e.msp && !SIM) {
        e.msp = sc.add.sprite(e.x, e.y, 'fx_zane_mark', 6).setScale(0.3).setDepth(906).setBlendMode(ADD());
        e.msp.play('fxa_zane_mark_1'); e.msp.once('animationcomplete', () => { if (e.msp && e.msp.anims) e.msp.play('zmark_loop'); });
      }
      if (e.msp) {
        if (on) { e.msp.setPosition(e.x, e.y - e.def.r * 1.4 - 30); e.msp.setAlpha(e.mark.t < 1.5 ? 0.45 + 0.55 * Math.abs(Math.sin(G.t * 14)) : 1); }
        else { const sp = e.msp; e.msp = null; sp.setAlpha(1); sp.play('fxa_zane_mark_3'); sp.once('animationcomplete', () => sp.destroy()); }
      }
    });
    G.tg.forEach(t => {
      if (t.delay > 0) return;
      const pr = 1 - Math.max(0, t.t) / t.dur, pu = 0.5 + 0.5 * Math.sin(G.t * 16);
      if (t.shape === 'fan') {
        const a0 = t.ang - t.arc / 2, a1 = t.ang + t.arc / 2;
        g.fillStyle(0x3a0a06, 0.2); g.beginPath(); g.moveTo(t.x, t.y); g.arc(t.x, t.y, t.range, a0, a1, false); g.closePath(); g.fillPath();
        g.fillStyle(0xff4a2a, 0.14 + 0.24 * pr); g.beginPath(); g.moveTo(t.x, t.y); g.arc(t.x, t.y, t.range * (0.15 + 0.85 * pr), a0, a1, false); g.closePath(); g.fillPath();
        g.lineStyle(3, 0xff5a40, 0.6 + 0.3 * pu); g.beginPath(); g.moveTo(t.x, t.y); g.arc(t.x, t.y, t.range, a0, a1, false); g.closePath(); g.strokePath();
      } else {
        g.fillStyle(0x3a0a06, 0.22); g.fillCircle(t.x, t.y, t.r);
        g.fillStyle(0xff4a2a, 0.16 + 0.22 * pr); g.fillCircle(t.x, t.y, t.r * (0.15 + 0.85 * pr));
        g.lineStyle(2, 0xffb070, 0.35 + 0.4 * pu); g.strokeCircle(t.x, t.y, t.r * 0.62);
        g.lineStyle(4, 0xff5a40, 0.65 + 0.3 * pu); g.strokeCircle(t.x, t.y, t.r);
      }
    });
    G.pickups.forEach(c => {
      const y = c.y + Math.sin(c.t * 6) * 2, tw = 0.5 + 0.5 * Math.sin(c.t * 7);
      g.fillStyle(0x5cc8ff, 0.12 + 0.1 * tw); g.fillCircle(c.x, y, 14); g.fillStyle(0x9fe6ff, 0.12); g.fillCircle(c.x, y, 8);
      g.fillStyle(0x1a5a9a, 1); g.fillTriangle(c.x, y - 9, c.x - 7, y - 1, c.x + 7, y - 1); g.fillTriangle(c.x, y + 10, c.x - 7, y - 1, c.x + 7, y - 1);
      g.fillStyle(0x3aa6e8, 1); g.fillTriangle(c.x, y - 9, c.x, y - 1, c.x + 7, y - 1); g.fillTriangle(c.x, y + 10, c.x, y - 1, c.x + 7, y - 1);
      g.fillStyle(0xbff0ff, 1); g.fillTriangle(c.x, y - 9, c.x - 7, y - 1, c.x - 1, y - 1);
      g.lineStyle(1, 0xffffff, 0.85); g.strokeTriangle(c.x, y - 9, c.x - 7, y - 1, c.x + 7, y - 1); g.strokeTriangle(c.x, y + 10, c.x - 7, y - 1, c.x + 7, y - 1);
      g.fillStyle(0xffffff, 0.4 + 0.5 * tw); g.fillRect(c.x - 0.5, y - 14, 1, 5); g.fillRect(c.x - 2.5, y - 12, 5, 1);
    });
    G.shots.forEach(s => { g.lineStyle(4, 0xffd24a, 1); g.lineBetween(s.x, s.y, s.x - s.vx * 0.035, s.y - s.vy * 0.035); });
    if (G.pl.shield > 0) { g.lineStyle(3, 0x7be4df, 0.8); g.strokeEllipse(p.x, p.y - 36, 62, 84); }
  }

  /* ---------- 小地圖／全圖 ---------- */
  const OBCOL = { mountain: 0x9a9084, lake: 0x2f7fc0, forest: 0x2f9a40, building: 0xb98a52 };
  /* ---------- 小地圖／全圖：底圖、地形圖示、敵我標記 ---------- */
  function drawMapBase(g, ox, oy, w, h, k, big) {
    g.fillStyle(0x1d1a17, 1); g.fillRect(ox, oy, w, h);
    g.fillStyle(0x2c2823, 1); g.fillRect(ox, oy, w, h * 0.5);                                   // 上半略亮，帶一點光線感
    g.lineStyle(1, 0xffffff, big ? 0.06 : 0.05);                                               // 石板格線
    for (let x = 160; x < WORLD_W; x += 160) g.lineBetween(ox + x * k, oy, ox + x * k, oy + h);
    for (let y = 160; y < WORLD_H; y += 160) g.lineBetween(ox, oy + y * k, ox + w, oy + y * k);
    // 可行走範圍外圈（場地邊界）
    g.lineStyle(1, 0xc89a48, 0.35); g.strokeRect(ox + ARENA.x0 * k, oy + ARENA.y0 * k, (ARENA.x1 - ARENA.x0) * k, (ARENA.y1 - ARENA.y0) * k);
  }
  function drawMapShapes(g, ox, oy, k, big) {
    const mn = big ? 5 : 3, items = OBST.map((o, i) => ({ o, i })).sort((a, b) => a.o.cy - b.o.cy);
    const ord = { lake: 0, forest: 1, mountain: 2, building: 3 };
    items.sort((a, b) => ord[a.o.t] - ord[b.o.t] || a.o.cy - b.o.cy).forEach(({ o, i }) => {
      const cx = ox + o.cx * k, cy = oy + o.cy * k, hw = Math.max(o.hw * k, mn), hh = Math.max(o.hh * k, mn);
      if (o.t === 'lake') {
        g.fillStyle(0x0c2036, 1); g.fillEllipse(cx, cy, hw * 2.1, hh * 2.1);
        g.fillStyle(0x2a6796, 1); g.fillEllipse(cx, cy, hw * 1.8, hh * 1.8);
        g.fillStyle(0x7fc4ea, 0.5); g.fillEllipse(cx - hw * 0.25, cy - hh * 0.3, hw * 0.9, hh * 0.45);
      } else if (o.t === 'forest') {
        for (let j = 0; j < 5; j++) {
          const a = j * 2.1 + i, rr = j === 0 ? 0 : 0.58, tx = cx + Math.cos(a) * hw * rr, ty = cy + Math.sin(a) * hh * rr, r = Math.max(1.7, Math.min(hw, hh) * 0.42);
          g.fillStyle(0x15381f, 1); g.fillCircle(tx, ty, r);
          g.fillStyle(0x3f8a46, 1); g.fillCircle(tx - r * 0.25, ty - r * 0.3, r * 0.62);
        }
      } else if (o.t === 'mountain') {
        const bx = cx, by = cy + hh * 0.75, ty = cy - hh * 0.95;
        g.fillStyle(0x8f87ad, 1); g.fillTriangle(bx - hw, by, bx, ty, bx + hw * 0.12, by);
        g.fillStyle(0x4f4770, 1); g.fillTriangle(bx, ty, bx + hw, by, bx + hw * 0.12, by);
        g.fillStyle(0xf2f0ff, 0.9); g.fillTriangle(bx - hw * 0.22, ty + hh * 0.5, bx, ty, bx + hw * 0.24, ty + hh * 0.5);
      } else {   // building：小房子（牆＋紅屋頂＋門）
        const bw = hw * 1.5, bh = hh * 0.85, bx = cx - bw / 2, by = cy - hh * 0.05;
        g.fillStyle(0x000000, 0.35); g.fillRect(bx + 1, by + 1.5, bw, bh);
        g.fillStyle(0xcdb084, 1); g.fillRect(bx, by, bw, bh);
        g.fillStyle(0xa8483a, 1); g.fillTriangle(bx - bw * 0.14, by, cx, cy - hh * 0.98, bx + bw * 1.14, by);
        g.fillStyle(0x5a3a22, 1); g.fillRect(cx - bw * 0.1, by + bh * 0.4, Math.max(1.5, bw * 0.2), bh * 0.6);
      }
    });
  }
  function drawMapDots(g, ox, oy, k, big) {
    const t = G.t, f = big ? 1.4 : 1;
    G.pickups.forEach(c => { const x = ox + c.x * k, y = oy + c.y * k, r = 2.2 * f; g.fillStyle(0x9fe6ff, 1); g.fillTriangle(x, y - r, x + r, y, x, y + r); g.fillTriangle(x, y - r, x - r, y, x, y + r); });
    G.enemies.forEach(e => {
      if (e.dead) return;
      const x = ox + e.x * k, y = oy + e.y * k, boss = e.type === 'boss';
      if (boss) { const pu = 0.5 + 0.5 * Math.sin(t * 6); g.fillStyle(0xff3aa0, 0.25 + 0.2 * pu); g.fillCircle(x, y, (6 + 2 * pu) * f); }
      g.fillStyle(0x000000, 0.8); g.fillCircle(x, y, (boss ? 4.4 : 3.1) * f);
      g.fillStyle(boss ? 0xff4fb0 : 0xff4a3a, 1); g.fillCircle(x, y, (boss ? 3.4 : 2.2) * f);
    });
    // 玩家：金色箭頭（朝面向）＋脈動光圈
    const px = ox + G.pl.x * k, py = oy + G.pl.y * k, a = Math.atan2(G.pl.fy, G.pl.fx), r = (big ? 7.5 : 5), pu = 0.5 + 0.5 * Math.sin(t * 5);
    g.fillStyle(0xffe14a, 0.18 + 0.12 * pu); g.fillCircle(px, py, r * (1.5 + 0.4 * pu));
    const P = (an, rr) => [px + Math.cos(a + an) * rr, py + Math.sin(a + an) * rr];
    const A = P(0, r), B = P(2.5, r * 0.85), C = P(-2.5, r * 0.85), D = P(Math.PI, r * 0.3);
    g.fillStyle(0x000000, 0.8); g.fillTriangle(A[0] + (A[0] - px) * 0.18, A[1] + (A[1] - py) * 0.18, B[0] + (B[0] - px) * 0.2, B[1] + (B[1] - py) * 0.2, C[0] + (C[0] - px) * 0.2, C[1] + (C[1] - py) * 0.2);
    g.fillStyle(0xffe14a, 1); g.fillTriangle(A[0], A[1], B[0], B[1], D[0], D[1]); g.fillTriangle(A[0], A[1], C[0], C[1], D[0], D[1]);
    g.fillStyle(0xfff6c8, 1); g.fillCircle(px, py, big ? 1.8 : 1.2);
  }
  function drawViewFrame(g, vx, vy, vw, vh, lw) {
    g.fillStyle(0xffffff, 0.07); g.fillRect(vx, vy, vw, vh);
    g.lineStyle(lw, 0xffffff, 0.9);
    const c = Math.min(vw, vh) * 0.28;
    [[vx, vy, 1, 1], [vx + vw, vy, -1, 1], [vx, vy + vh, 1, -1], [vx + vw, vy + vh, -1, -1]].forEach(([x, y, sx, sy]) => { g.lineBetween(x, y, x + sx * c, y); g.lineBetween(x, y, x, y + sy * c); });
  }
  function drawMiniMap(g) {
    const w = 80, k = w / WORLD_W, h = WORLD_H * k, ox = W - 92, oy = 36, t = sc.gTop; t.clear();
    uiPanel(g, ox - 8, oy - 8, w + 16, h + 16, 11, 0.96);
    g.fillStyle(0x000000, 0.7); g.fillRect(ox - 1.5, oy - 1.5, w + 3, h + 3);                       // 內嵌凹槽
    drawMapDots(t, ox, oy, k, false);
    for (let n = 0; n < 4; n++) { t.lineStyle(2, 0x000000, 0.28 - n * 0.06); t.strokeRect(ox + n * 2 + 1, oy + n * 2 + 1, w - n * 4 - 2, h - n * 4 - 2); }   // 暗角
    const cam = sc.cameras.main; drawViewFrame(t, ox + cam.worldView.x * k, oy + cam.worldView.y * k, cam.worldView.width * k, cam.worldView.height * k, 1.5);
    t.lineStyle(1.5, 0xc89a48, 1); t.strokeRect(ox - 1.5, oy - 1.5, w + 3, h + 3);
    [[ox - 8, oy - 8], [ox + w + 8, oy - 8], [ox - 8, oy + h + 8], [ox + w + 8, oy + h + 8]].forEach(([x, y]) => { t.fillStyle(0x000000, 0.7); t.fillCircle(x, y, 3.4); t.fillStyle(0xf2cf86, 1); t.fillCircle(x, y, 2.4); t.fillStyle(0xffffff, 0.8); t.fillCircle(x - 0.7, y - 0.8, 0.8); });   // 四角鉚釘
  }
  function openMap() {
    G.state = 'map';
    const objs = [];
    const bd = uiBackdrop(0.88, 2000); objs.push(...bd);
    objs.push(...uiBanner(W / 2, 30, 170, 36, '全　圖', { depth: 2001 }));
    const g = sc.add.graphics().setDepth(2000.5).setScrollFactor(0); objs.push(g);
    const k = Math.min((W - 30) / WORLD_W, (H - 130) / WORLD_H), mw = WORLD_W * k, mh = WORLD_H * k, ox = (W - mw) / 2, oy = 58;
    // 地圖名稱標籤
    OBST.forEach(o => { const name = { mountain: '山', lake: '湖', forest: '森林', building: '建築' }[o.t]; objs.push(sc.add.text(ox + o.cx * k, oy + o.cy * k, name, { fontFamily: UI_FONT, fontSize: '11px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5).setDepth(2002).setScrollFactor(0)); });
    // 圖例面板與關閉鈕
    const lg = sc.add.graphics().setDepth(2001).setScrollFactor(0); objs.push(lg);
    const ly = oy + mh + 8; uiPanel(lg, 20, ly, W - 40, 46, 12, 0.95);
    objs.push(UT(W / 2, ly + 23, '山・建築：擋路也擋箭　　湖：只擋走路\n森林：可穿越但減速', 12, '#e6dcc4', 2002, { align: 'center', lineSpacing: 4, strokeThickness: 2 }).setOrigin(0.5));
    objs.push(...uiButton(W / 2, ly + 46 + 26, 130, 38, '關　閉', closeMap, { depth: 2001, fs: 16 }));
    const bimg = sc.add.image(ox, oy, 'minimap_tex').setOrigin(0).setScrollFactor(0).setDepth(2000.8).setDisplaySize(mw, mh); objs.push(bimg);
    const gTop = sc.add.graphics().setDepth(2001.5).setScrollFactor(0); objs.push(gTop);
    G.mapCtx = { objs, g, gTop, k, ox, oy, mw, mh };
    bd[0].on('pointerdown', closeMap);
  }
  function closeMap() { if (!G.mapCtx) return; G.mapCtx.objs.forEach(o => o.destroy()); G.mapCtx = null; G.state = 'play'; }
  function drawBigMap() {
    const c = G.mapCtx; if (!c) return; const g = c.g, t = c.gTop; g.clear(); t.clear();
    uiPanel(g, c.ox - 8, c.oy - 8, c.mw + 16, c.mh + 16, 12, 0.96);
    drawMapDots(t, c.ox, c.oy, c.k, true);
    const cam = sc.cameras.main; drawViewFrame(t, c.ox + cam.worldView.x * c.k, c.oy + cam.worldView.y * c.k, cam.worldView.width * c.k, cam.worldView.height * c.k, 2);
    t.lineStyle(2, 0xc89a48, 1); t.strokeRect(c.ox - 1, c.oy - 1, c.mw + 2, c.mh + 2);
  }


  /* ---------- 結束 ---------- */
  function endGame(win) {
    if (G.state === 'end') return;
    if (G.mapCtx) closeMap();
    endUltRun();
    G.state = 'end';
    if (SIM) { simRecord(win); return; }
    let rw = null;   // 結算獎勵（只有從選關畫面正式開戰時才結算並存檔）
    if (REAL) {
      const h = TX.hero(SAVE, HERO_ID), xp = win ? (G.xpGain || 0) : Math.floor((G.xpGain || 0) * TX.LOSE_XP_RATE), first = TUT ? win && SAVE.prologueCleared.indexOf(TUT) < 0 : win && !TX.isCleared(SAVE, NODE_N);
      const fg = first ? (TUT ? 50 * TUT : TX.FIRST_CLEAR_GOLD * NODE_N) : 0, gold = win ? (G.goldGain || 0) + fg : 0, r = TX.addXp(h, xp);
      SAVE.gold += gold; if (first) TUT ? SAVE.prologueCleared.push(TUT) : SAVE.cleared.push(NODE_N);
      if (TUT === 3 && win) SAVE.tutorialDone = true;
      TX.save(SAVE);
      rw = { xp, gold, fg, first, from: r.from, to: r.to, cur: h.xp, need: TX.xpNeed(h.lv), cap: h.lv >= TX.LV_CAP, total: SAVE.gold };
    }
    if (sc.plSp && (act().id === 'zane' || act().id === 'sere' || act().id === 'oz')) sc.plSp.play(win ? act().id + '_win' : act().id + '_lose', true);
    uiSceneBackdrop(2000);
    const oy = rw ? 124 : 0, pw = 320, ph = 440 + oy, px = W / 2 - pw / 2, py = 178 - oy / 2, g = sc.add.graphics().setDepth(2001).setScrollFactor(0);
    uiPanel(g, px, py, pw, ph, 16, 0.97);
    g.lineStyle(1, 0xf2cf86, 0.35); g.strokeRoundedRect(px + 8, py + 8, pw - 16, ph - 16, 11);
    [[px + 10, py + 10], [px + pw - 10, py + 10], [px + 10, py + ph - 10], [px + pw - 10, py + ph - 10]].forEach(([x, y]) => { g.fillStyle(0x000000, 0.7); g.fillCircle(x, y, 3.6); g.fillStyle(0xf2cf86, 1); g.fillCircle(x, y, 2.5); g.fillStyle(0xffffff, 0.8); g.fillCircle(x - 0.7, y - 0.8, 0.9); });
    uiBanner(W / 2, py, 250, 56, win ? '通關！' : '全員倒下', { depth: 2002, color: win ? '#ffe6a8' : '#ffa090' });
    const tm = `${Math.floor(G.t / 60)}:${String(Math.floor(G.t % 60)).padStart(2, '0')}`, hpP = Math.max(0, Math.round(act().hp / def().maxHp * 100)) + '%';
    [['通關時間', tm], ['本局成長', 'Lv ' + G.level], ['剩餘生命', hpP]].forEach(([lab, val], i) => {
      const cx = W / 2 + (i - 1) * 98, cy = py + 100;
      g.fillStyle(0x000000, 0.4); g.fillRoundedRect(cx - 44, cy - 31, 88, 62, 9);
      g.lineStyle(1.5, 0x6e4a1c, 1); g.strokeRoundedRect(cx - 44, cy - 31, 88, 62, 9);
      g.lineStyle(1, 0xf2cf86, 0.25); g.strokeRoundedRect(cx - 42, cy - 29, 84, 58, 8);
      UT(cx, cy - 15, lab, 11, '#a8987a', 2003, { strokeThickness: 2 }).setOrigin(0.5);
      UT(cx, cy + 8, val, 22, '#ffe6a8', 2003, { fontStyle: 'bold' }).setOrigin(0.5);
    });
    if (rw) {   // 獎勵區：角色等級與經驗條、金幣
      const ry = py + 172;
      UT(W / 2 - 100, ry, `${def().name}  Lv ${rw.to}`, 16, '#ffe6a8', 2003, { fontStyle: 'bold' }).setOrigin(0, 0.5);
      UT(W / 2 + 100, ry, `經驗 +${rw.xp}`, 14, '#bfe6a0', 2003, { fontStyle: 'bold' }).setOrigin(1, 0.5);
      const bx = W / 2 - 100, bw = 200, bf = rw.cap ? 1 : Math.min(1, rw.cur / rw.need);
      g.fillStyle(0x000000, 0.55); g.fillRoundedRect(bx - 1, ry + 14, bw + 2, 12, 5);
      g.fillStyle(0x3a8f4a, 1); g.fillRoundedRect(bx, ry + 15, Math.max(4, bw * bf), 10, 4);
      g.fillStyle(0xffffff, 0.25); g.fillRoundedRect(bx, ry + 15, Math.max(4, bw * bf), 4, 3);
      UT(W / 2, ry + 20, rw.cap ? '已達等級上限' : `${rw.cur} / ${rw.need}`, 10, '#ffffff', 2004, { strokeThickness: 2 }).setOrigin(0.5);
      if (rw.to > rw.from) UT(W / 2, ry + 44, `升級！  Lv ${rw.from} → Lv ${rw.to}`, 15, '#ffd24a', 2003, { fontStyle: 'bold' }).setOrigin(0.5);
      else UT(W / 2, ry + 44, win ? '' : '失敗仍保留一半經驗', 11, '#a8987a', 2003).setOrigin(0.5);
      UT(W / 2 - 100, ry + 72, `金幣 +${rw.gold}`, 15, '#ffe27a', 2003, { fontStyle: 'bold' }).setOrigin(0, 0.5);
      UT(W / 2 + 100, ry + 72, rw.fg ? `首次通關 +${rw.fg}` : (win ? '' : '失敗無金幣'), 11, '#e8c870', 2003).setOrigin(1, 0.5);
      UT(W / 2, ry + 94, `持有金幣 ${rw.total}`, 11, '#a8987a', 2003).setOrigin(0.5);
    }
    uiDivider(g, W / 2, py + 168 + oy, pw - 50);
    UT(W / 2, py + 186 + oy, '本局技能', 14, '#ffe6a8', 2003, { fontStyle: 'bold' }).setOrigin(0.5);
    const got = SKILLS.filter(s => G.st[s.id]);
    if (!got.length) UT(W / 2, py + 250 + oy, '（本局未選技能）', 13, '#a8987a', 2003).setOrigin(0.5);
    got.forEach((s, i) => {
      const row = Math.floor(i / 5), n = Math.min(5, got.length - row * 5), cx = W / 2 + ((i % 5) - (n - 1) / 2) * 58, cy = py + 232 + oy + row * 84;
      skillMedal(g, s.id, cx, cy, 19, true);
      UT(cx, cy + 27, s.name, 11, '#f1e6d2', 2003, { strokeThickness: 2 }).setOrigin(0.5);
      skillPips(g, cx, cy + 43, G.st[s.id], s.max, false, 3.6);
    });
    uiButton(W / 2 - 88, py + ph - 42, 160, 56, '再玩一次', () => location.reload(), { depth: 2003 });
    if (REAL && TUT && win && TUT < 3) uiButton(W / 2 + 88, py + ph - 42, 160, 56, TUT_TEXT.ui.nextNode, () => { location.search = '?hero=' + HERO_ID + '&tut=' + (TUT + 1) + '&real=1'; }, { depth: 2003 });
    else if (REAL && TUT === 3 && win) uiButton(W / 2 + 88, py + ph - 42, 160, 56, TUT_TEXT.ui.toMap, () => { location.search = '?map=' + HERO_ID; }, { depth: 2003 });
    else if (REAL) uiButton(W / 2 + 88, py + ph - 42, 160, 56, '回選關', () => { location.search = '?pick=' + HERO_ID; }, { depth: 2003 });
    else uiButton(W / 2 + 88, py + ph - 42, 160, 56, '換角色', () => { const q = new URLSearchParams(location.search); q.delete('hero'); q.delete('team'); location.search = q.toString(); }, { depth: 2003 });
  }

  /* ---------- 測試用 ---------- */
  function expose() {
    window.__ap = {
      get G() { return G; }, get FIELD() { return FIELD; }, get BLOCK() { return BLOCK; }, GW, GH, CELL, scene: sc, OBST, tp: (x, y) => { G.pl.x = x; G.pl.y = y; }, solidAt,
      addCrystals: n => { G.crystals += n; }, fillGauge: () => { G.gauge = 100; },
      killAll: () => G.enemies.forEach(e => !e.dead && killEnemy(e)),
      hurt: n => damagePlayer(n), cast: castSkill, ult: ultimate, swap: i => doSwap(i), win: () => endGame(true)
    };
  }

  new Phaser.Game(config);
}());
