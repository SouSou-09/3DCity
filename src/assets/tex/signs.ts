import { Layers, RGB, TextureData, TextureSpec, Tex, hex, sstep } from './core';
import { planks } from './surfaces';
import { C, Pen, Pt, SignShape, arcPts, bicycle, bus, ribbon, signFinish, signOutline, textWidth, truck, walker, wheelchair } from './signkit';

const list: TextureSpec[] = [];
const shapes = new Map<string, SignShape>();
/** Shape of the blank a sign face is printed on. */
export function signShape(id: string): SignShape {
  return shapes.get(id) ?? 'rect';
}

const { white: W, black: K, red: R, yellow: Y, orange: O, green: G, blue: B, brown: BR, lime: LM } = C;
const LAMP_GREEN: RGB = hex(0x2aa24c);

/** Registers a sign face w by h metres; `old` adds a sun-bleached, dirty twin. */
function sign(id: string, label: string, shape: SignShape, w: number, h: number, bg: RGB, draw: (p: Pen) => void, old = false): void {
  const density = Math.max(96, Math.min(640, 512 / Math.max(w, h)));
  const seed = 5000 + list.length;
  const ages: [string, string, number][] = old ? [['', '', 0.06], ['-old', '・古い', 0.85]] : [['', '', 0.06]];
  for (const [suffix, extra, age] of ages) {
    shapes.set(`sign/${id}${suffix}`, shape);
    list.push({
      id: `sign/${id}${suffix}`, label: label + extra, category: 'sign', meters: [w, h], tile: 'none', decal: false, density,
      generate: (tex) => {
        const p = new Pen(tex, shape, w, h);
        draw(p);
        return signFinish(p, bg, seed, age);
      },
    });
  }
}
const mirror = (pts: Pt[], w: number): Pt[] => pts.map(([x, y]) => [w - x, y]);
const sides: [string, string, boolean][] = [['left', '左', true], ['right', '右', false]];

// --- Regulatory signs. ---
sign('stop', '一時停止 STOP', 'octagon', 0.75, 0.75, R, (p) => {
  p.border(W, 0.02, 0.012);
  p.centred(W, ['STOP'], 0.25, { weight: 0.085, fit: 0.6 });
}, true);
sign('plaque-all-way', '補助板 ALL WAY', 'rect', 0.45, 0.15, R, (p) => {
  p.border(W, 0.007, 0.006);
  p.centred(W, ['ALL WAY'], 0.065);
});
sign('plaque-4-way', '補助板 4-WAY', 'rect', 0.3, 0.15, R, (p) => {
  p.border(W, 0.007, 0.006);
  p.centred(W, ['4-WAY'], 0.065);
});
sign('yield', 'ゆずれ YIELD', 'yield', 0.9, 0.78, R, (p) => {
  p.border(W, 0.014, 0.01);
  p.fill(W, 0.1);
  p.text(R, 'YIELD', 0.45, 0.55, 0.075, { fit: 0.3, weight: 0.09 });
}, true);
sign('do-not-enter', '進入禁止 DO NOT ENTER', 'rect', 0.75, 0.75, W, (p) => {
  p.disc(R, 0.375, 0.375, 0.34);
  p.rect(W, 0.12, 0.335, 0.63, 0.415);
  p.text(W, 'DO NOT', 0.375, 0.47, 0.06);
  p.text(W, 'ENTER', 0.375, 0.215, 0.06);
}, true);
sign('wrong-way', '逆走注意 WRONG WAY', 'rect', 0.9, 0.6, R, (p) => {
  p.border(W, 0.016, 0.012);
  p.centred(W, ['WRONG', 'WAY'], 0.15);
});
for (const [id, jp, flip] of sides) {
  sign(`one-way-${id}`, `一方通行 ONE WAY(${jp})`, 'rect', 0.9, 0.3, K, (p) => {
    const f = (pts: Pt[]): Pt[] => (flip ? mirror(pts, 0.9) : pts);
    p.border(W, 0.008, 0.008);
    p.arrow(W, f([[0.05, 0.15], [0.85, 0.15]]), 0.075, 0.115, 0.17);
    p.text(K, 'ONE WAY', flip ? 0.5 : 0.4, 0.105, 0.09, { weight: 0.085 });
  }, id === 'left');
}
for (const n of [25, 30, 35, 40, 45, 55, 65]) {
  sign(`speed-${n}`, `制限速度 ${n}`, 'rect', 0.6, 0.75, W, (p) => {
    p.border(K, 0.013, 0.01);
    p.text(K, 'SPEED', 0.3, 0.6, 0.075);
    p.text(K, 'LIMIT', 0.3, 0.475, 0.075);
    p.text(K, String(n), 0.3, 0.1, 0.27, { weight: 0.085 });
  }, n === 25 || n === 35);
}
sign('speed-school-25', '通学路 制限速度 25', 'rect', 0.6, 0.9, W, (p) => {
  p.rect(LM, 0, 0.72, 0.6, 0.9);
  p.border(K, 0.013, 0.01);
  p.text(K, 'SCHOOL', 0.3, 0.765, 0.085);
  p.text(K, 'SPEED', 0.3, 0.61, 0.065);
  p.text(K, 'LIMIT', 0.3, 0.51, 0.065);
  p.text(K, '25', 0.3, 0.2, 0.24, { weight: 0.085 });
  p.lines(K, ['WHEN CHILDREN', 'ARE PRESENT'], 0.16, 0.035, { gap: 0.02 });
});
const small = (id: string, label: string, ink: RGB, lines: string[], size = 0.05, old = false): void =>
  sign(id, label, 'rect', 0.3, 0.45, W, (p) => {
    p.border(ink, 0.008, 0.007);
    p.centred(ink, lines, size, { fit: 0.24 });
  }, old);
small('no-parking-any-time', '駐車禁止 NO PARKING ANY TIME', R, ['NO', 'PARKING', 'ANY', 'TIME'], 0.055, true);
small('no-stopping', '駐停車禁止 NO STOPPING', R, ['NO', 'STOPPING', 'ANY', 'TIME'], 0.055);
small('tow-away', 'レッカー移動区域 TOW-AWAY ZONE', R, ['TOW-AWAY', 'ZONE', 'NO', 'PARKING'], 0.05);
small('parking-2hr', '2時間駐車 2 HOUR PARKING', G, ['2 HOUR', 'PARKING', '8AM-6PM', 'MON-SAT'], 0.05, true);
small('parking-30min', '30分駐車', G, ['30 MIN', 'PARKING', '9AM-5PM'], 0.055);
small('loading-zone', '荷捌き LOADING ZONE', R, ['LOADING', 'ZONE', '30 MIN', 'LIMIT'], 0.05);
small('street-cleaning', '路面清掃日 駐車禁止', R, ['NO PARKING', 'TUESDAY', '8AM-10AM', 'STREET', 'CLEANING'], 0.04);
small('permit-parking', '許可車両のみ', G, ['PERMIT', 'PARKING', 'ONLY', 'ZONE 4'], 0.05);
sign('parking-disabled', '障害者用駐車場', 'rect', 0.3, 0.45, W, (p) => {
  p.border(G, 0.008, 0.007);
  p.lines(G, ['RESERVED', 'PARKING'], 0.41, 0.045, { fit: 0.24 });
  p.rect(B, 0.07, 0.04, 0.23, 0.2, 0.012);
  wheelchair(p.tex, p.ink(W), 0.15, 0.055, 0.13);
});
sign('ev-charging', 'EV充電専用', 'rect', 0.3, 0.45, W, (p) => {
  p.border(G, 0.008, 0.007);
  p.centred(G, ['ELECTRIC', 'VEHICLE', 'CHARGING', 'ONLY'], 0.045, { fit: 0.24 });
});
sign('no-parking-symbol', '駐車禁止(記号)', 'rect', 0.6, 0.6, W, (p) => {
  p.border(K, 0.012, 0.01);
  p.text(K, 'P', 0.3, 0.16, 0.28, { weight: 0.1 });
  p.prohibit(0.3, 0.3, 0.23);
}, true);
const ban = (id: string, label: string, draw: (p: Pen) => void, old = false): void =>
  sign(id, label, 'rect', 0.6, 0.6, W, (p) => {
    p.border(K, 0.012, 0.01);
    draw(p);
    p.prohibit(0.3, 0.3, 0.235);
  }, old);
for (const [id, jp, flip] of sides) {
  ban(`no-${id}-turn`, `${jp}折禁止`, (p) => p.arrow(K, flip ? [[0.37, 0.13], [0.37, 0.37], [0.15, 0.37]] : mirror([[0.37, 0.13], [0.37, 0.37], [0.15, 0.37]], 0.6), 0.032), id === 'left');
}
ban('no-u-turn', '転回禁止', (p) => p.arrow(K, [[0.4, 0.13], [0.4, 0.34], ...arcPts(0.3, 0.34, 0.1, 0, 180, 8), [0.2, 0.2]], 0.03));
ban('no-trucks', '大型車通行止め', (p) => truck(p.tex, p.ink(K), 0.3, 0.2, 0.36));
ban('no-pedestrians', '歩行者横断禁止', (p) => walker(p.tex, p.ink(K), 0.3, 0.12, 0.36));
ban('no-bikes', '自転車通行止め', (p) => bicycle(p.tex, p.ink(K), 0.3, 0.2, 0.42));
const lane = (id: string, label: string, draw: (p: Pen) => void): void =>
  sign(id, label, 'rect', 0.75, 0.9, W, (p) => {
    p.border(K, 0.014, 0.011);
    draw(p);
  });
const bend: Pt[] = [[0.47, 0.36], [0.47, 0.6], [0.44, 0.7], [0.36, 0.76], [0.18, 0.76]];
for (const [id, jp, flip] of sides) {
  lane(`lane-${id}-only`, `${jp}折専用 ONLY`, (p) => {
    p.arrow(K, flip ? bend : mirror(bend, 0.75), 0.04);
    p.text(K, 'ONLY', 0.375, 0.1, 0.16, { weight: 0.085 });
  });
  lane(`lane-straight-${id}`, `直進・${jp}折`, (p) => {
    const b = bend.map(([x, y]) => [x - 0.03, y - 0.14] as Pt);
    p.arrow(K, flip ? b : mirror(b, 0.75), 0.035);
    p.arrow(K, flip ? [[0.44, 0.12], [0.44, 0.8]] : mirror([[0.44, 0.12], [0.44, 0.8]], 0.75), 0.035);
  });
}
lane('lane-straight-only', '直進専用 ONLY', (p) => {
  p.arrow(K, [[0.375, 0.36], [0.375, 0.82]], 0.04);
  p.text(K, 'ONLY', 0.375, 0.1, 0.16, { weight: 0.085 });
});
const plate = (id: string, label: string, lines: string[], size: number, extra?: (p: Pen) => void, cy = 0.375): void =>
  sign(id, label, 'rect', 0.6, 0.75, W, (p) => {
    p.border(K, 0.013, 0.01);
    p.centred(K, lines, size, { cy, fit: 0.48 });
    extra?.(p);
  });
plate('keep-right', '右側通行 KEEP RIGHT', ['KEEP', 'RIGHT'], 0.1, (p) => p.arrow(K, [[0.2, 0.3], [0.2, 0.22], [0.4, 0.08]], 0.03), 0.52);
plate('no-turn-on-red', '赤信号右折禁止 NO TURN ON RED', ['NO', 'TURN', 'ON RED'], 0.1, (p) => p.disc(R, 0.3, 0.13, 0.065), 0.47);
plate('left-yield-green', '左折は対向車優先', ['LEFT TURN', 'YIELD', 'ON GREEN'], 0.085, (p) => p.disc(LAMP_GREEN, 0.3, 0.13, 0.065), 0.47);
plate('stop-here-on-red', '赤信号はここで停止', ['STOP', 'HERE ON', 'RED'], 0.1, (p) => p.arrow(K, [[0.42, 0.24], [0.18, 0.08]], 0.03), 0.5);
plate('bike-lane', '自転車レーン BIKE LANE', ['BIKE', 'LANE'], 0.1, (p) => bicycle(p.tex, p.ink(K), 0.3, 0.44, 0.4), 0.22);
plate('weight-limit', '重量制限 10トン', ['WEIGHT', 'LIMIT', '10', 'TONS'], 0.095);
plate('right-lane-must-turn', '右車線は右折', ['RIGHT LANE', 'MUST', 'TURN RIGHT'], 0.09);
plate('do-not-block', '交差点内停止禁止', ['DO NOT', 'BLOCK', 'INTERSECTION'], 0.09);
plate('no-thru-traffic', '通り抜け禁止', ['NO', 'THRU', 'TRAFFIC'], 0.1);
sign('photo-enforced', '自動取締り PHOTO ENFORCED', 'rect', 0.6, 0.45, W, (p) => {
  p.border(K, 0.012, 0.01);
  p.centred(K, ['PHOTO', 'ENFORCED'], 0.1);
});
sign('truck-route', '大型車経路 TRUCK ROUTE', 'rect', 0.6, 0.45, W, (p) => {
  p.border(G, 0.012, 0.01);
  p.centred(G, ['TRUCK', 'ROUTE'], 0.11);
});
plate('ramp-one-car', 'ランプメーター 1台ずつ', ['ONE CAR', 'PER', 'GREEN'], 0.1);
plate('crosswalk-stop-on-red', '横断歩道 赤で停止', ['CROSSWALK', 'STOP', 'ON RED'], 0.09, (p) => p.disc(R, 0.3, 0.12, 0.06), 0.48);
plate('left-turn-signal', '左折専用信号', ['LEFT', 'TURN', 'SIGNAL'], 0.1);
plate('left-on-green-arrow', '左折は青矢印のみ', ['LEFT ON', 'GREEN', 'ARROW', 'ONLY'], 0.085);
sign('plaque-school', '補助板 SCHOOL', 'rect', 0.6, 0.3, LM, (p) => {
  p.border(K, 0.008, 0.007);
  p.centred(K, ['SCHOOL'], 0.11);
});
sign('plaque-when-flashing', '補助板 WHEN FLASHING', 'rect', 0.6, 0.3, W, (p) => {
  p.border(K, 0.008, 0.007);
  p.centred(K, ['WHEN', 'FLASHING'], 0.08);
});
sign('plaque-ahead', '補助板 AHEAD', 'rect', 0.6, 0.3, LM, (p) => {
  p.border(K, 0.008, 0.007);
  p.centred(K, ['AHEAD'], 0.11);
});
sign('plaque-diagonal-arrow', '補助板 斜め矢印', 'rect', 0.6, 0.3, LM, (p) => {
  p.border(K, 0.008, 0.007);
  p.arrow(K, [[0.2, 0.24], [0.42, 0.07]], 0.028, 0.07, 0.1);
});
sign('ped-button', '押しボタン案内', 'rect', 0.23, 0.3, W, (p) => {
  p.border(K, 0.006, 0.005);
  p.lines(K, ['PUSH BUTTON', 'TO CROSS'], 0.275, 0.026, { fit: 0.18 });
  walker(p.tex, p.ink(K), 0.09, 0.04, 0.13);
  p.arrow(K, [[0.14, 0.1], [0.2, 0.1]], 0.01);
});

// --- Street name blades and overhead street name signs. ---
const STREETS: [string, RGB][] = [
  ['MAIN ST', G], ['OCEAN AVE', G], ['3RD ST', G], ['HARBOR BLVD', B], ['MISSION ST', G], ['VISTA DR', BR], ['PALM AVE', B], ['MARKET ST', G],
  ['12TH AVE', G], ['CANYON RD', BR], ['GRAND AVE', K], ['BAY ST', B], ['ALDER WAY', G], ['PIER 9', B],
];
function streetName(p: Pen, name: string, size: number, cx: number, y: number): void {
  const cut = name.lastIndexOf(' ');
  const [main, suf] = [name.slice(0, cut), name.slice(cut + 1)];
  const sw = textWidth(suf, size * 0.55);
  const fit = Math.min(1, (p.w * 0.86 - sw - size * 0.35) / textWidth(main, size));
  const mw = textWidth(main, size, fit);
  const x0 = cx - (mw + size * 0.35 + sw) / 2;
  p.text(W, main, x0, y, size, { align: 'l', cond: fit, weight: 0.08 });
  p.text(W, suf, x0 + mw + size * 0.35, y + size * 0.45, size * 0.55, { align: 'l', weight: 0.085 });
}
STREETS.forEach(([name, bg], i) => {
  const id = name.toLowerCase().replace(/ /g, '-');
  sign(`street-${id}`, `街路名 ${name}`, 'rect', 0.9, 0.2, bg, (p) => {
    p.border(W, 0.005, 0.005);
    streetName(p, name, 0.1, 0.45, 0.05);
  }, i === 0 || i === 4);
  if (i < 5) {
    sign(`street-arm-${id}`, `街路名(信号アーム用) ${name}`, 'rect', 1.8, 0.45, bg, (p) => {
      p.border(W, 0.012, 0.01);
      streetName(p, name, 0.2, 0.9, 0.125);
    });
  }
});

// --- Warning signs: 0.75 m diamonds (the texture is the bounding square). ---
const D = 0.75 * Math.SQRT2;
const warn = (id: string, label: string, draw: (p: Pen) => void, old = false, bg: RGB = Y): void =>
  sign(id, label, 'diamond', D, D, bg, (p) => {
    p.border(K, 0.016, 0.014);
    draw(p);
  }, old);
const curve: Pt[] = [[0.44, 0.24], [0.44, 0.46], [0.47, 0.58], [0.54, 0.68], [0.67, 0.81]];
const winding: Pt[] = [[0.5, 0.22], [0.5, 0.32], [0.43, 0.44], [0.43, 0.52], [0.6, 0.64], [0.6, 0.7], [0.6, 0.85]];
for (const [id, jp, flip] of sides) {
  const f = (pts: Pt[]): Pt[] => (flip ? mirror(pts, D) : pts);
  warn(`curve-${id}`, `${jp}カーブ`, (p) => p.arrow(K, f(curve), 0.04), id === 'right');
  warn(`turn-${id}`, `${jp}急カーブ`, (p) => p.arrow(K, f([[0.42, 0.24], [0.42, 0.62], [0.76, 0.62]]), 0.04));
  warn(`winding-${id}`, `つづら折り(${jp}から)`, (p) => p.arrow(K, f(winding), 0.035));
  warn(`side-road-${id}`, `${jp}から合流する脇道`, (p) => {
    p.rect(K, 0.49, 0.24, 0.57, 0.82);
    p.tex.poly(p.ink(K), [f([[0.57, 0.49], [0.8, 0.49], [0.8, 0.56], [0.57, 0.56]])]);
  });
  warn(`merge-${id}`, `${jp}から合流`, (p) => {
    p.arrow(K, [[0.5, 0.22], [0.5, 0.85]], 0.04);
    p.tex.poly(p.ink(K), [ribbon(f([[0.68, 0.22], [0.68, 0.38], [0.53, 0.6]]), 0.032)]);
  });
  warn(`lane-ends-${id}`, `${jp}車線減少`, (p) => {
    p.tex.poly(p.ink(K), [ribbon(f([[0.43, 0.24], [0.43, 0.82]]), 0.022)]);
    p.tex.poly(p.ink(K), [ribbon(f([[0.66, 0.24], [0.66, 0.44], [0.54, 0.62], [0.54, 0.82]]), 0.022)]);
  });
}
warn('crossroad', '十字路あり', (p) => {
  p.rect(K, 0.49, 0.24, 0.57, 0.82);
  p.rect(K, 0.26, 0.49, 0.8, 0.57);
}, true);
warn('t-junction', 'T字路あり', (p) => {
  p.rect(K, 0.49, 0.24, 0.57, 0.62);
  p.rect(K, 0.26, 0.58, 0.8, 0.66);
});
warn('signal-ahead', '信号機あり', (p) => {
  p.rect(K, 0.44, 0.27, 0.62, 0.79, 0.03);
  p.disc(hex(0xd22a22), 0.53, 0.69, 0.055);
  p.disc(hex(0xf2c81e), 0.53, 0.53, 0.055);
  p.disc(LAMP_GREEN, 0.53, 0.37, 0.055);
}, true);
warn('stop-ahead', '一時停止あり', (p) => {
  p.arrow(K, [[0.53, 0.6], [0.53, 0.84]], 0.03);
  p.tex.poly(p.ink(R), [signOutline('octagon', 0.3, 0.3).map(([x, y]) => [x + 0.38, y + 0.26] as Pt)]);
});
warn('yield-ahead', 'ゆずれあり', (p) => {
  p.arrow(K, [[0.53, 0.62], [0.53, 0.84]], 0.03);
  p.tex.poly(p.ink(R), [[[0.53, 0.26], [0.72, 0.58], [0.34, 0.58]]]);
  p.tex.poly(p.ink(W), [[[0.53, 0.36], [0.63, 0.53], [0.43, 0.53]]]);
});
warn('divided', '中央分離帯あり', (p) => {
  p.rect(K, 0.5, 0.52, 0.56, 0.7, 0.025);
  p.arrow(K, [[0.64, 0.26], [0.64, 0.8]], 0.026);
  p.arrow(K, [[0.42, 0.8], [0.42, 0.3]], 0.026);
});
warn('two-way', '対面通行', (p) => {
  p.arrow(K, [[0.63, 0.26], [0.63, 0.82]], 0.035);
  p.arrow(K, [[0.43, 0.8], [0.43, 0.24]], 0.035);
});
warn('pedestrian', '横断歩道あり', (p) => walker(p.tex, p.ink(K), 0.53, 0.29, 0.48), true);
warn('pedestrian-lime', '横断歩道あり(蛍光)', (p) => walker(p.tex, p.ink(K), 0.53, 0.29, 0.48), false, LM);
warn('bicycle', '自転車横断あり', (p) => bicycle(p.tex, p.ink(K), 0.53, 0.38, 0.5));
warn('truck-crossing', '大型車出入口', (p) => truck(p.tex, p.ink(K), 0.53, 0.4, 0.5));
warn('roundabout', 'ロータリーあり', (p) => {
  for (let k = 0; k < 3; k++) p.arrow(K, arcPts(0.53, 0.53, 0.17, k * 120 + 20, k * 120 + 112, 8), 0.028);
});
const WARN_TEXT: [string, string, string[], number][] = [
  ['dip', '路面の窪み DIP', ['DIP'], 0.2], ['bump', '段差 BUMP', ['BUMP'], 0.17], ['dead-end', '行き止まり DEAD END', ['DEAD', 'END'], 0.14], ['slow', '徐行 SLOW', ['SLOW'], 0.17],
  ['road-narrows', '幅員減少', ['ROAD', 'NARROWS'], 0.11], ['pavement-ends', '舗装終わり', ['PAVEMENT', 'ENDS'], 0.1], ['no-outlet', '通り抜け不可', ['NO', 'OUTLET'], 0.13],
  ['low-clearance', '高さ制限', ['12 FT', '6 IN'], 0.13], ['speed-hump', 'ハンプ', ['SPEED', 'HUMP'], 0.13], ['signal-ahead-text', '信号機あり(文字)', ['SIGNAL', 'AHEAD'], 0.12],
  ['cross-traffic', '交差車両は止まらない', ['CROSS TRAFFIC', 'DOES NOT', 'STOP'], 0.075], ['fire-station', '消防署', ['FIRE', 'STATION'], 0.12],
];
for (const [id, label, lines, size] of WARN_TEXT) warn(id, label, (p) => p.centred(K, lines, size, { fit: 0.56, weight: 0.08 }), id === 'dead-end' || id === 'slow');
sign('school', '通学路', 'pentagon', 0.75, 0.75, LM, (p) => {
  p.border(K, 0.014, 0.012);
  walker(p.tex, p.ink(K), 0.27, 0.13, 0.36);
  walker(p.tex, p.ink(K), 0.49, 0.13, 0.42);
}, true);
sign('rr-advance', '踏切あり', 'circle', 0.9, 0.9, Y, (p) => {
  p.border(K, 0.02, 0.014);
  p.tex.poly(p.ink(K), [ribbon([[0.16, 0.16], [0.74, 0.74]], 0.04)]);
  p.tex.poly(p.ink(K), [ribbon([[0.16, 0.74], [0.74, 0.16]], 0.04)]);
  p.text(K, 'R', 0.19, 0.37, 0.16, { weight: 0.09 });
  p.text(K, 'R', 0.71, 0.37, 0.16, { weight: 0.09 });
}, true);
for (const [id, jp, flip] of sides) {
  const f = (pts: Pt[], w: number): Pt[] => (flip ? mirror(pts, w) : pts);
  sign(`chevron-${id}`, `カーブ誘導(${jp})`, 'rect', 0.45, 0.6, Y, (p) => p.tex.poly(p.ink(K), [f([[0.07, 0.05], [0.2, 0.05], [0.39, 0.3], [0.2, 0.55], [0.07, 0.55], [0.26, 0.3]], 0.45)]), id === 'left');
  sign(`large-arrow-${id}`, `急カーブ矢印(${jp})`, 'rect', 1.2, 0.6, Y, (p) => {
    p.border(K, 0.014, 0.012);
    p.arrow(K, f([[0.12, 0.3], [1.1, 0.3]], 1.2), 0.085, 0.2, 0.3);
  });
  sign(`object-marker-${id}`, `障害物標示(${jp})`, 'rect', 0.3, 0.9, Y, (p) => {
    for (let k = -2; k < 8; k++) p.tex.poly(p.ink(K), [f([[0, k * 0.15], [0.3, k * 0.15 + 0.3], [0.3, k * 0.15 + 0.375], [0, k * 0.15 + 0.075]], 0.3)]);
  });
}
for (const n of [15, 25, 35]) {
  sign(`advisory-${n}`, `推奨速度 ${n} MPH`, 'rect', 0.45, 0.45, Y, (p) => {
    p.border(K, 0.01, 0.008);
    p.text(K, String(n), 0.225, 0.19, 0.19, { weight: 0.085 });
    p.text(K, 'MPH', 0.225, 0.06, 0.07);
  });
}
for (const [id, label, lines] of [['dead-end-rect', '行き止まり(板)', ['DEAD END']], ['no-outlet-rect', '通り抜け不可(板)', ['NO OUTLET']], ['private-road', '私道', ['PRIVATE', 'ROAD']]] as [string, string, string[]][]) {
  sign(id, label, 'rect', 0.9, 0.45, Y, (p) => {
    p.border(K, 0.012, 0.01);
    p.centred(K, lines, lines.length > 1 ? 0.12 : 0.13);
  });
}

// --- Temporary traffic control (orange). ---
const DW = 0.9 * Math.SQRT2;
const WORK: [string, string, string[], number][] = [
  ['road-work-ahead', '工事中 ROAD WORK AHEAD', ['ROAD', 'WORK', 'AHEAD'], 0.13], ['detour-ahead', '迂回路あり', ['DETOUR', 'AHEAD'], 0.15],
  ['right-lane-closed', '右車線閉鎖', ['RIGHT LANE', 'CLOSED', 'AHEAD'], 0.12], ['left-lane-closed', '左車線閉鎖', ['LEFT LANE', 'CLOSED', 'AHEAD'], 0.12],
  ['one-lane-road', '片側交互通行', ['ONE LANE', 'ROAD', 'AHEAD'], 0.13], ['prepared-to-stop', '停止準備', ['BE', 'PREPARED', 'TO STOP'], 0.12],
  ['flagger-ahead', '誘導員あり', ['FLAGGER', 'AHEAD'], 0.15], ['utility-work', '埋設工事', ['UTILITY', 'WORK', 'AHEAD'], 0.13],
  ['road-closed-ahead', 'この先通行止め', ['ROAD', 'CLOSED', 'AHEAD'], 0.13], ['uneven-lanes', '段差あり', ['UNEVEN', 'LANES'], 0.15],
];
for (const [id, label, lines, size] of WORK) {
  sign(`work-${id}`, label, 'diamond', DW, DW, O, (p) => {
    p.border(K, 0.018, 0.016);
    p.centred(K, lines, size, { fit: 0.68, weight: 0.08 });
  }, id === 'road-work-ahead');
}
for (const [id, jp, flip] of sides) {
  sign(`work-detour-${id}`, `迂回路 DETOUR(${jp})`, 'rect', 1.2, 0.6, O, (p) => {
    p.border(K, 0.014, 0.012);
    p.text(K, 'DETOUR', 0.6, 0.34, 0.17, { weight: 0.085 });
    p.arrow(K, flip ? mirror([[0.25, 0.17], [0.95, 0.17]], 1.2) : [[0.25, 0.17], [0.95, 0.17]], 0.04, 0.09, 0.14);
  });
}
const board = (id: string, label: string, w: number, h: number, bg: RGB, ink: RGB, lines: string[], size: number, old = false): void =>
  sign(id, label, 'rect', w, h, bg, (p) => {
    p.border(ink, Math.min(0.02, h * 0.035), Math.min(0.014, h * 0.03));
    p.centred(ink, lines, size);
  }, old);
board('work-end-road-work', '工事区間終わり', 0.9, 0.45, O, K, ['END', 'ROAD WORK'], 0.11);
board('work-road-closed', '通行止め ROAD CLOSED', 1.2, 0.75, W, K, ['ROAD', 'CLOSED'], 0.2, true);
board('work-road-closed-thru', '通り抜け通行止め', 1.5, 0.75, W, K, ['ROAD CLOSED', 'TO', 'THRU TRAFFIC'], 0.13);
board('work-sidewalk-closed', '歩道閉鎖', 0.6, 0.3, W, K, ['SIDEWALK', 'CLOSED'], 0.075);
board('work-sidewalk-use-other', '歩道閉鎖 反対側へ', 0.6, 0.45, W, K, ['SIDEWALK CLOSED', 'USE', 'OTHER SIDE'], 0.07);

// --- Route markers and guide signs. ---
type RouteKind = 'interstate' | 'us' | 'state';
/** Route shield s wide with its bottom-left corner at (x, y). */
function route(p: Pen, kind: RouteKind, x: number, y: number, s: number, num: string): void {
  const shield = (inset: number): Pt[] => signOutline('shield', s - inset * 2, s - inset * 2).map(([px, py]) => [x + inset + px, y + inset + py] as Pt);
  if (kind === 'interstate') {
    p.tex.poly(p.ink(W), [shield(0)]);
    p.tex.poly(p.ink(B), [shield(s * 0.035)]);
    p.rect(R, x + s * 0.06, y + s * 0.74, x + s * 0.94, y + s * 0.95, s * 0.03);
    p.rect(W, x + s * 0.04, y + s * 0.7, x + s * 0.96, y + s * 0.73);
    p.text(W, num, x + s / 2, y + s * 0.24, s * 0.36, { fit: s * 0.62, weight: 0.09 });
  } else {
    if (kind === 'us') p.tex.poly(p.ink(W), [shield(s * 0.03)]);
    else p.disc(W, x + s / 2, y + s / 2, s * 0.46);
    p.text(K, num, x + s / 2, y + s * 0.3, s * 0.38, { fit: s * 0.62, weight: 0.09 });
  }
}
for (const n of ['5', '10', '405']) {
  sign(`route-interstate-${n}`, `州間高速 ${n}`, 'shield', 0.6, 0.6, B, (p) => {
    p.rect(R, 0, 0.44, 0.6, 0.6);
    p.rect(W, 0, 0.425, 0.6, 0.445);
    p.border(W, 0.012, 0.008);
    p.text(W, n, 0.3, 0.14, 0.22, { fit: 0.4, weight: 0.09 });
    p.text(W, 'INTERSTATE', 0.3, 0.485, 0.04, { fit: 0.42 });
  }, n === '5');
}
for (const n of ['101', '66']) sign(`route-us-${n}`, `国道 US ${n}`, 'rect', 0.6, 0.6, K, (p) => route(p, 'us', 0, 0, 0.6, n), n === '101');
for (const n of ['1', '73']) sign(`route-state-${n}`, `州道 ${n}`, 'rect', 0.6, 0.6, K, (p) => route(p, 'state', 0, 0, 0.6, n));
for (const d of ['NORTH', 'SOUTH', 'EAST', 'WEST', 'JCT', 'TO']) board(`plaque-${d.toLowerCase()}`, `補助板 ${d}`, 0.6, 0.3, W, K, [d], 0.11);
const ARROWS: [string, string, Pt[]][] = [
  ['up', '直進', [[0.265, 0.07], [0.265, 0.32]]], ['left', '左', [[0.44, 0.19], [0.08, 0.19]]], ['right', '右', [[0.09, 0.19], [0.45, 0.19]]],
  ['up-left', '左斜め', [[0.38, 0.08], [0.14, 0.31]]], ['up-right', '右斜め', [[0.15, 0.08], [0.39, 0.31]]],
];
for (const [id, jp, pts] of ARROWS) {
  sign(`plaque-arrow-${id}`, `補助板 矢印(${jp})`, 'rect', 0.53, 0.38, W, (p) => {
    p.border(K, 0.009, 0.008);
    p.arrow(K, pts, 0.035, 0.085, 0.12);
  });
}
const guide = (id: string, label: string, w: number, h: number, draw: (p: Pen) => void, bg: RGB = G, old = false): void =>
  sign(id, label, 'rect', w, h, bg, (p) => {
    p.border(W, Math.min(0.035, h * 0.03), Math.min(0.03, h * 0.025));
    draw(p);
  }, old);
const down = (p: Pen, x: number, y: number, s: number): void => p.arrow(W, [[x, y + s], [x, y]], s * 0.13, s * 0.32, s * 0.45);
guide('guide-through', '高速案内 直進(I-5 北行き)', 4.2, 2.4, (p) => {
  route(p, 'interstate', 0.9, 1.45, 0.75, '5');
  p.text(W, 'NORTH', 2.55, 1.65, 0.34);
  p.text(W, 'HARBOR CITY', 2.1, 0.95, 0.36, { fit: 3.6 });
  down(p, 1.3, 0.2, 0.55);
  down(p, 2.9, 0.2, 0.55);
}, G, true);
guide('guide-exit-1-mile', '高速案内 出口1マイル', 4.2, 2.1, (p) => {
  route(p, 'us', 0.35, 1.2, 0.7, '101');
  p.text(W, 'OCEAN AVE', 2.6, 1.38, 0.34, { fit: 2.9 });
  p.text(W, 'BAYSIDE', 2.1, 0.75, 0.34);
  p.text(W, 'EXIT 1 MILE', 2.1, 0.2, 0.28);
});
guide('guide-exit-only', '高速案内 出口専用車線', 3.6, 2.4, (p) => {
  p.text(W, 'DOWNTOWN', 1.8, 1.72, 0.36, { fit: 3.1 });
  p.text(W, 'CIVIC CENTER', 1.8, 1.1, 0.3, { fit: 3.1 });
  p.rect(Y, 0.06, 0.06, 3.54, 0.8, 0.04);
  p.text(K, 'EXIT', 0.85, 0.28, 0.3);
  p.text(K, 'ONLY', 2.75, 0.28, 0.3);
  p.arrow(K, [[1.8, 0.72], [1.8, 0.14]], 0.07, 0.17, 0.25);
});
guide('guide-exit-right', '高速案内 出口(右)', 3.6, 1.8, (p) => {
  p.text(W, 'AIRPORT', 1.45, 1.05, 0.38);
  p.text(W, 'EXIT 24', 1.45, 0.35, 0.3);
  p.arrow(W, [[2.75, 0.4], [3.2, 1.25]], 0.075, 0.18, 0.27);
});
guide('guide-split', '高速案内 分岐', 4.8, 2.4, (p) => {
  p.rect(W, 2.385, 0.1, 2.415, 2.3);
  route(p, 'interstate', 0.4, 1.5, 0.7, '10');
  p.text(W, 'EAST', 1.6, 1.68, 0.3);
  p.text(W, 'INLAND', 1.2, 0.95, 0.34);
  down(p, 1.2, 0.2, 0.55);
  route(p, 'interstate', 2.75, 1.5, 0.7, '405');
  p.text(W, 'SOUTH', 4.0, 1.68, 0.3, { fit: 1 });
  p.text(W, 'PORT', 3.6, 0.95, 0.34);
  down(p, 3.6, 0.2, 0.55);
});
guide('guide-distance', '距離案内', 2.4, 1.5, (p) => {
  [['AIRPORT', '4'], ['DOWNTOWN', '9'], ['PORT VERDE', '23']].forEach(([name, mi], i) => {
    p.text(W, name, 0.2, 1.08 - i * 0.42, 0.22, { align: 'l', fit: 1.55 });
    p.text(W, mi, 2.2, 1.08 - i * 0.42, 0.22, { align: 'r' });
  });
});
guide('guide-street-exit', '高速案内 街路出口', 3, 1.2, (p) => p.centred(W, ['MISSION ST', 'NEXT RIGHT'], 0.27, { gap: 0.2 }));
guide('guide-next-exits', '高速案内 次の3出口', 3, 1.5, (p) => p.centred(W, ['PORT VERDE', 'NEXT 3 EXITS'], 0.3, { gap: 0.25 }));
guide('guide-gore', '出口標識(分岐点)', 1.2, 1.5, (p) => {
  p.text(W, 'EXIT', 0.6, 1.05, 0.26);
  p.text(W, '24', 0.42, 0.3, 0.42, { weight: 0.085 });
  p.arrow(W, [[0.78, 0.3], [1.02, 0.78]], 0.05, 0.12, 0.18);
}, G, true);
for (const n of ['24', '12A', '7']) guide(`guide-tab-${n.toLowerCase()}`, `出口番号板 EXIT ${n}`, 1.2, 0.45, (p) => p.centred(W, [`EXIT ${n}`], 0.2));
guide('guide-tab-left', '出口番号板 LEFT', 1.2, 0.45, (p) => p.centred(K, ['LEFT EXIT'], 0.18), Y);
guide('guide-freeway-entrance', '高速入口 FREEWAY ENTRANCE', 0.9, 0.6, (p) => p.centred(W, ['FREEWAY', 'ENTRANCE'], 0.13), G, true);
guide('guide-city-limit', '市境 PORT VERDE', 1.8, 0.9, (p) => {
  p.text(W, 'PORT VERDE', 0.9, 0.48, 0.22, { fit: 1.5 });
  p.text(W, 'POP 412,000   ELEV 85', 0.9, 0.2, 0.085);
});
guide('guide-mile-marker', '距離標', 0.3, 0.9, (p) => {
  p.text(W, 'MILE', 0.15, 0.76, 0.06);
  ['1', '2', '7'].forEach((d, i) => p.text(W, d, 0.15, 0.52 - i * 0.22, 0.17, { weight: 0.085 }));
});
guide('guide-bike-route', '自転車ルート', 0.6, 0.45, (p) => {
  bicycle(p.tex, p.ink(W), 0.3, 0.2, 0.3);
  p.text(W, 'BIKE ROUTE', 0.3, 0.07, 0.06);
});
guide('guide-park', '公園案内(茶)', 2.4, 0.9, (p) => {
  p.centred(W, ['CANYON', 'STATE PARK'], 0.2, { cx: 1.0, fit: 1.6 });
  p.arrow(W, [[1.9, 0.45], [2.25, 0.45]], 0.05, 0.12, 0.18);
}, BR);
guide('guide-beach', '海岸案内(茶)', 1.8, 0.6, (p) => p.centred(W, ['BEACH ACCESS'], 0.17), BR);
guide('guide-downtown-arrow', '街路案内 DOWNTOWN', 1.8, 0.6, (p) => {
  p.text(W, 'DOWNTOWN', 1.12, 0.21, 0.18, { fit: 1.1 });
  p.arrow(W, [[0.44, 0.3], [0.1, 0.3]], 0.04, 0.1, 0.15);
});
guide('service-hospital', '病院 H', 0.6, 0.6, (p) => p.text(W, 'H', 0.3, 0.14, 0.32, { weight: 0.11 }), B, true);
guide('service-parking', '駐車場 P', 0.6, 0.6, (p) => p.text(W, 'P', 0.3, 0.14, 0.32, { weight: 0.11 }));
guide('service-rest-area', '休憩所 1マイル', 2.4, 1.2, (p) => p.centred(W, ['REST AREA', '1 MILE'], 0.26, { gap: 0.2 }), B);
guide('service-gas-food', 'ガソリン・食事・宿泊', 1.8, 1.2, (p) => p.centred(W, ['GAS - FOOD', 'LODGING', 'NEXT RIGHT'], 0.17), B);
guide('bus-stop-blue', 'バス停(青)', 0.45, 0.6, (p) => {
  bus(p.tex, p.ink(W), 0.225, 0.2, 0.3);
  p.text(W, 'BUS STOP', 0.225, 0.07, 0.06);
}, B, true);
sign('bus-stop-round', 'バス停(丸形)', 'circle', 0.45, 0.45, W, (p) => {
  p.border(R, 0.035, 0.008);
  bus(p.tex, p.ink(K), 0.225, 0.13, 0.2);
});
sign('bus-stop-no-parking', 'バス停 駐車禁止', 'rect', 0.3, 0.45, W, (p) => {
  p.border(R, 0.008, 0.007);
  p.lines(R, ['NO', 'PARKING'], 0.41, 0.055, { fit: 0.24 });
  p.lines(K, ['BUS', 'STOP'], 0.2, 0.065, { fit: 0.24 });
});
sign('bus-route-plate', 'バス系統板', 'rect', 0.45, 0.6, W, (p) => {
  p.rect(B, 0, 0.42, 0.45, 0.6);
  bus(p.tex, p.ink(W), 0.1, 0.44, 0.13);
  p.text(W, 'METRO', 0.29, 0.475, 0.06);
  p.lines(K, ['12  47', '210', 'OWL N5'], 0.37, 0.08, { gap: 0.035 });
});
board('taxi-stand', 'タクシー乗り場', 0.45, 0.6, Y, K, ['TAXI', 'STAND'], 0.1);
board('rr-crossbuck-railroad', '踏切警標 RAILROAD', 1.2, 0.225, W, K, ['RAILROAD'], 0.12);
board('rr-crossbuck-crossing', '踏切警標 CROSSING', 1.2, 0.225, W, K, ['CROSSING'], 0.12);
board('rr-tracks', '踏切 2 TRACKS', 0.68, 0.23, W, K, ['2 TRACKS'], 0.1);

// --- Tiling finishes for barricades, cones, posts and the backs of signs. ---
function prop(id: string, label: string, meters: readonly [number, number], tile: TextureSpec['tile'], density: number, generate: (tex: Tex, seed: number) => TextureData): void {
  const seed = 7000 + list.length;
  list.push({ id: `sign/${id}`, label, category: 'sign', meters, tile, decal: false, density, generate: (tex) => generate(tex, seed) });
}
/** Reflective sheeting in bands; `band` returns which colour (0 or 1) a point has, with soft edges. */
function banded(tex: Tex, seed: number, a: RGB, b: RGB, band: (x: number, y: number) => number, dirt = 0.25): TextureData {
  const L = new Layers(tex, a, 0.45);
  const grime = tex.noise(tex.mw / 3, tex.mh / 2, seed, 3);
  const scuff = tex.noise(tex.mw / 12, tex.mh / 12, seed + 1, 2);
  tex.map((x, y, k) => {
    const t = band(x, y);
    const d = 1 - dirt * (0.35 + grime(x, y) * 0.5 + scuff(x, y) * 0.3 + (1 - y / tex.mh) * 0.5);
    L.r[k] = (a[0] + (b[0] - a[0]) * t) * d;
    L.g[k] = (a[1] + (b[1] - a[1]) * t) * d;
    L.b[k] = (a[2] + (b[2] - a[2]) * t) * d;
    L.rough[k] = 0.42 + (1 - d) * 0.8;
    return 0;
  });
  return L.finish();
}
const wave = (v: number, soft: number): number => {
  const f = v - Math.floor(v);
  return sstep(0.5 - soft, 0.5 + soft, f) * (1 - sstep(1 - soft * 2, 1, f)) + (1 - sstep(0, soft * 2, f)) * 0;
};
for (const [id, jp, a, b] of [['orange', '橙', O, W], ['red', '赤', R, W], ['hazard', '黄黒', Y, K]] as [string, string, RGB, RGB][]) {
  for (const [side, sj, dir] of [['l', '左下がり', 1], ['r', '右下がり', -1]] as [string, string, number][]) {
    prop(`stripes-${id}-${side}`, `斜め縞 ${jp}(${sj})`, [0.4, 0.2], 'x', 640, (tex, seed) => banded(tex, seed, a, b, (x, y) => wave((x + dir * y) / 0.4, 0.02)));
  }
}
prop('gate-arm', '遮断機の縞(赤白)', [0.8, 0.1], 'x', 640, (tex, seed) => banded(tex, seed, R, W, (x) => wave(x / 0.8, 0.008)));
const coneBands = (_x: number, y: number): number => sstep(0.36, 0.365, y) * (1 - sstep(0.47, 0.475, y)) + sstep(0.53, 0.535, y) * (1 - sstep(0.6, 0.605, y));
prop('cone', 'カラーコーン(反射帯つき)', [0.6, 0.7], 'x', 512, (tex, seed) => banded(tex, seed, hex(0xf05a14), W, coneBands, 0.2));
prop('cone-dirty', 'カラーコーン 汚れ', [0.6, 0.7], 'x', 512, (tex, seed) => banded(tex, seed, hex(0xd8521a), hex(0xc8c4b8), coneBands, 0.75));
prop('cone-lime', 'カラーコーン 蛍光黄緑', [0.6, 0.7], 'x', 512, (tex, seed) => banded(tex, seed, LM, W, coneBands, 0.2));
prop('drum', '工事用ドラム(橙白)', [1.5, 1], 'x', 384, (tex, seed) => banded(tex, seed, hex(0xf05a14), W, (_x, y) => (y > 0.3 && y < 0.92 ? wave((y - 0.3) / 0.31 + 0.5, 0.01) : 0), 0.35));
prop('delineator', '視線誘導標(白)', [0.1, 1.2], 'x', 640, (tex, seed) => banded(tex, seed, hex(0xdcdcd4), hex(0xe0a020), (_x, y) => sstep(0.98, 0.985, y) * (1 - sstep(1.1, 1.105, y)), 0.4));
prop('tube-orange', 'ポストコーン(橙)', [0.25, 0.9], 'x', 640, (tex, seed) => banded(tex, seed, hex(0xf05a14), W, (_x, y) => sstep(0.6, 0.605, y) * (1 - sstep(0.68, 0.685, y)) + sstep(0.74, 0.745, y) * (1 - sstep(0.82, 0.825, y)), 0.4));
/** Sheet or section metal, optionally with the row of holes of a sign post. */
function plain(tex: Tex, seed: number, color: RGB, o: { hole?: number; rust?: number; rough?: number; metal?: number; brushed?: boolean } = {}): TextureData {
  const L = new Layers(tex, color, o.rough ?? 0.5);
  const mottle = tex.noise(tex.mw / 2, tex.mh / 2, seed, 3);
  const fine = tex.noise(tex.mw / 16, tex.mh / (o.brushed ? 1 : 16), seed + 1, 2);
  const rustN = tex.noise(tex.mw / 3, tex.mh / 3, seed + 2, 3);
  tex.map((x, y, k) => {
    const hole = o.hole ? 1 - sstep(o.hole * 0.85, o.hole, Math.hypot(x - tex.mw / 2, y - tex.mh / 2)) : 0;
    const rust = (o.rust ?? 0) * sstep(0.1, 0.5, rustN(x, y) + (o.hole ? 0.9 - Math.hypot(x - tex.mw / 2, y - tex.mh / 2) / tex.mw : 0));
    const m = (1 + mottle(x, y) * 0.1 + fine(x, y) * 0.07) * (1 - hole * 0.92);
    L.r[k] = (color[0] + (0.36 - color[0]) * rust) * m;
    L.g[k] = (color[1] + (0.2 - color[1]) * rust) * m;
    L.b[k] = (color[2] + (0.11 - color[2]) * rust) * m;
    L.metal[k] = (o.metal ?? 0) * (1 - rust) * (1 - hole);
    L.rough[k] = (o.rough ?? 0.5) + rust * 0.4 + hole * 0.4;
    L.height[k] = -hole * 0.004 + fine(x, y) * 0.0002;
    return 0;
  });
  return L.finish();
}
const ZINC: RGB = [0.6, 0.62, 0.64];
prop('back-aluminium', '標識の裏面(アルミ)', [1, 1], 'xy', 256, (tex, seed) => plain(tex, seed, [0.66, 0.67, 0.68], { metal: 0.9, rough: 0.42, brushed: true }));
prop('back-aluminium-old', '標識の裏面 くすみ', [1, 1], 'xy', 256, (tex, seed) => plain(tex, seed, [0.5, 0.5, 0.49], { metal: 0.6, rough: 0.6, brushed: true, rust: 0.12 }));
prop('post-perforated', '標識柱 穴あき角パイプ(亜鉛めっき)', [0.05, 0.05], 'xy', 2560, (tex, seed) => plain(tex, seed, ZINC, { hole: 0.0065, metal: 0.85, rough: 0.45 }));
prop('post-perforated-rusty', '標識柱 穴あき角パイプ 錆', [0.05, 0.05], 'xy', 2560, (tex, seed) => plain(tex, seed, ZINC, { hole: 0.0065, metal: 0.7, rough: 0.55, rust: 0.8 }));
prop('post-green', '標識柱 Uチャンネル(緑塗装)', [0.08, 0.05], 'xy', 2560, (tex, seed) => plain(tex, seed, hex(0x1f4a36), { hole: 0.006, rough: 0.5, rust: 0.15 }));
prop('post-wood', '標識柱 木製', [0.4, 1.2], 'xy', 384, (tex, seed) => planks(tex, { seed, width: 0.4, color: hex(0x6e5238), weathered: 0.6 }));

export const SIGN_TEXTURES: readonly TextureSpec[] = list;
