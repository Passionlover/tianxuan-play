/* 選角畫面技能圖示（SVG；每位角色 5 個：一技、二技、三技、必殺、被動），形狀沿用戰鬥中的技能圖示概念 */
(function () {
  var B = 'M3 -15 L-7 1 L-1 1 L-4 14 L8 -4 L2 -4 Z';
  function svg(inner) { return '<svg class="ic" viewBox="-20 -20 40 40" aria-hidden="true">' + inner + '</svg>'; }
  var L = function (d) { return '<path class="l" d="' + d + '"/>'; };
  var bolt = function (t) { return '<path transform="' + (t || '') + '" d="' + B + '"/>'; };
  var arcPath = function (r, a0, a1) { var x0 = Math.cos(a0) * r, y0 = Math.sin(a0) * r, x1 = Math.cos(a1) * r, y1 = Math.sin(a1) * r; return 'M' + x0.toFixed(1) + ' ' + y0.toFixed(1) + ' A' + r + ' ' + r + ' 0 ' + ((a1 - a0) > Math.PI ? 1 : 0) + ' 1 ' + x1.toFixed(1) + ' ' + y1.toFixed(1); };
  var rays = function (r0, r1, n, off) { var d = ''; for (var i = 0; i < n; i++) { var a = i * Math.PI * 2 / n + (off || 0); d += 'M' + (Math.cos(a) * r0).toFixed(1) + ' ' + (Math.sin(a) * r0).toFixed(1) + ' L' + (Math.cos(a) * r1).toFixed(1) + ' ' + (Math.sin(a) * r1).toFixed(1) + ' '; } return L(d); };
  var star = function (n, ro, ri) { var p = []; for (var i = 0; i < n * 2; i++) { var r = i % 2 ? ri : ro, a = i * Math.PI / n - Math.PI / 2; p.push((Math.cos(a) * r).toFixed(1) + ',' + (Math.sin(a) * r).toFixed(1)); } return '<polygon points="' + p.join(' ') + '"/>'; };
  window.SELECT_ICONS = {
    zane: [
      svg('<circle class="l" r="11"/>' + L('M-17 0H-9M9 0H17M0 -17V-9M0 9V17') + bolt('scale(.62)')),                                   // 雷印：瞄準圈＋雷
      svg('<polygon points="4,-10 16,0 4,10"/>' + bolt('translate(-5 0) scale(.8)') + L('M-17 8H-11M-18 -6H-12')),                    // 閃雷步：箭頭＋雷＋速度線
      svg(star(8, 15, 6) + '<circle r="3.4" fill="#fff"/>'),                                                                              // 雷爆：爆裂星
      svg(bolt('translate(-10 3) scale(.62)') + bolt('translate(10 3) scale(.62)') + bolt('translate(0 -1) scale(.95)') + L('M-14 15H14')),    // 千雷亂舞：圈內多道落雷
      svg(bolt('translate(0 -3) scale(.8)') + '<circle cx="-10" cy="13" r="1.8"/><circle cx="-5" cy="14.5" r="1.8"/><circle cx="0" cy="15" r="1.8"/><circle cx="5" cy="14.5" r="1.8"/><circle cx="10" cy="13" r="1.8"/>') // 雷痕：雷＋5 個累積點
    ],
    sere: [
      svg('<ellipse cx="0" cy="7" rx="13" ry="6"/><ellipse class="l w" cx="0" cy="7" rx="8" ry="3"/><path d="M0 -15 L-5 -6 A5.6 5.6 0 0 0 5 -6 Z"/>'), // 水窪：水池＋水滴
      svg('<path class="l" d="' + arcPath(5, 0, 3.6) + '"/><path class="l" d="' + arcPath(9.5, 1.4, 5) + '"/><path class="l" d="' + arcPath(14, 2.8, 6.4) + '"/><circle r="2"/>'), // 潮漩：漩渦
      svg('<path d="M-15 9 C-14 0 -7 -8 2 -9 C10 -9 14 -3 14 2 C9 -1 4 0 0 3 C-4 6 -6 9 -8 10 Z"/><path class="l w" d="M-4 -2 A8 8 0 0 1 8 -6"/>' + L('M-15 14H13')),     // 潮波：浪
      svg('<circle class="l" r="15"/>' + L('M-10 -2Q-7 -6 -4 -2T2 -2T8 -2M-10 5Q-7 1 -4 5T2 5T8 5') + '<polygon points="0,-6 -4,-13 4,-13"/><polygon points="0,13 -4,20 4,20" transform="translate(0 -7)"/>'),   // 倒流之海：往中心收的潮
      svg('<ellipse cx="-3" cy="10" rx="12" ry="5"/><path d="M-3 -12 L-8 -3 A5.6 5.6 0 0 0 2 -3 Z"/>' + L('M9 -2L13 -7L17 -2M9 6L13 1L17 6'))                       // 站在水窪中：水窪＋水滴＋上升箭頭
    ],
    oz: [
      svg('<path d="M-9 -12H7V8L-1 14L-9 8Z"/>' + L('M10 0H17M12 -6L17 -10M12 6L17 10')),                                                                       // 盾擊：盾＋衝擊線
      svg('<circle class="l" r="12"/><path d="M-6 -6L0 -9L6 -6V3L0 9L-6 3Z"/>' + rays(14, 19, 4, 0.78)),                                                      // 反震姿態：盾＋向外反彈
      svg('<polygon points="-12,6 -4,-6 0,2 5,-9 12,6"/><ellipse class="l" cy="10" rx="14" ry="4"/>' + L('M-3 11L-6 16M4 11L7 16')),                          // 大地之錨：岩山＋扎根
      svg('<polygon points="-15,13 -6,-4 0,5 6,-10 15,13"/><circle cx="-9" cy="-12" r="2.8"/><circle cx="2" cy="-16" r="2.2"/><circle cx="12" cy="-9" r="2.8"/>'), // 山嶽崩落：山＋落石
      svg('<polygon points="-12,-4 -6,-13 6,-13 12,-4 8,10 0,15 -8,10"/>' + '<path class="l d" d="M-6 -13L-2 -2L-8 10M6 -13L3 -3L8 10M-2 -2H3"/>')                  // 岩肌：岩石護甲＋裂紋
    ]
  };
})();
