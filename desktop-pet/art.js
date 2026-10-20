// 照着主人家的橘猫画的 Q 版贴图（画在 200×200 的坐标里），几种表情各画一张
window.drawPet = function drawPet(variant, size) {
  const FUR = '#e8a868', FUR_DARK = '#c98446', WHITE = '#fff8ef', PINK = '#f2a3aa', EYE = '#141a14', EYE_RIM = '#3f4f33';
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  x.scale(size / 200, size / 200);
  x.lineCap = 'round'; x.lineJoin = 'round';
  const P = d => new Path2D(d);
  const ell = (cx, cy, rx, ry, fill, rot = 0) => { x.beginPath(); x.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2); x.fillStyle = fill; x.fill(); };
  const stroke = (d, color, w) => { x.strokeStyle = color; x.lineWidth = w; x.stroke(P(d)); };
  const fillStroke = (d, color, w) => { const p = P(d); x.fillStyle = color; x.fill(p); x.strokeStyle = color; x.lineWidth = w; x.stroke(p); };

  // striped tail curling up on the right
  stroke('M156 150 C198 146 200 96 178 84', FUR, 17);
  for (const d of ['M190 128 L178 124', 'M194 110 L181 110', 'M189 93 L178 98']) stroke(d, FUR_DARK, 4);
  // rounded ears
  fillStroke('M34 98 L44 44 L86 74 Z', FUR, 14);
  fillStroke('M166 98 L156 44 L114 74 Z', FUR, 14);
  fillStroke('M46 86 L50 58 L72 76 Z', PINK, 6);
  fillStroke('M154 86 L150 58 L128 76 Z', PINK, 6);
  // round jelly head/body
  const g = x.createRadialGradient(84, 100, 8, 100, 128, 96);
  g.addColorStop(0, '#f6c995'); g.addColorStop(.55, FUR); g.addColorStop(1, '#cf8c4f');
  ell(100, 128, 86, 64, g);
  // tabby stripes on forehead and cheeks
  for (const d of ['M88 70 Q91 79 89 87', 'M100 66 L100 86', 'M112 70 Q109 79 111 87',
                   'M20 118 L36 120', 'M22 132 L38 131', 'M180 118 L164 120', 'M178 132 L162 131']) stroke(d, FUR_DARK, 4);
  // white chest, chin and puffy whisker pads
  ell(100, 166, 58, 26, WHITE);
  ell(100, 136, 15, 10, WHITE);
  ell(87, 124, 17, 12.5, WHITE); ell(113, 124, 17, 12.5, WHITE);
  // big dark eyes
  if (variant === 'open' || variant === 'surprised') {
    const r = variant === 'surprised' ? 1.15 : 1;
    for (const ex of [68, 132]) {
      ell(ex, 102, 16 * r, 17 * r, EYE_RIM);
      ell(ex, 102, 13.5 * r, 14.5 * r, EYE);
      ell(ex + 5, 95, 5 * r, 5 * r, '#fff');
      ell(ex - 5, 109, 2.2 * r, 2.2 * r, 'rgba(255,255,255,.8)');
    }
  } else if (variant === 'blink' || variant === 'sleep') {
    stroke('M56 102 Q68 110 80 102', EYE, 4); stroke('M120 102 Q132 110 144 102', EYE, 4);
  } else {
    stroke('M58 94 L76 102 L58 110', EYE, 4.5); stroke('M142 94 L124 102 L142 110', EYE, 4.5);
  }
  // blush
  x.globalAlpha = variant === 'squint' ? .85 : .45;
  ell(46, 122, 11, 6.5, PINK); ell(154, 122, 11, 6.5, PINK);
  x.globalAlpha = 1;
  // pink nose
  fillStroke('M94 113 L106 113 L100 120 Z', '#ef9aa4', 4);
  // mouth
  if (variant === 'squint') {
    fillStroke('M91 125 Q100 144 109 125 Z', '#c4505c', 1);
    stroke('M91 125 Q100 144 109 125 Z', '#6a4a3a', 2.5);
    ell(100, 134, 4.5, 3.5, '#f5a0aa');
  } else if (variant === 'surprised') {
    ell(100, 129, 4.5, 5.5, '#c4505c');
  } else if (variant === 'sleep') {
    stroke('M96 126 Q100 128 104 126', '#6a4a3a', 2.5);
  } else {
    stroke('M100 120 L100 124 M90 124 Q95 130 100 124 Q105 130 110 124', '#6a4a3a', 2.5);
  }
  // long whiskers (grey under-stroke so they show on light desktops)
  const whiskers = ['M76 122 L18 112', 'M76 127 L16 128', 'M77 132 L20 144',
                    'M124 122 L182 112', 'M124 127 L184 128', 'M123 132 L180 144'];
  for (const d of whiskers) stroke(d, 'rgba(120,100,80,.45)', 2.6);
  for (const d of whiskers) stroke(d, '#ffffff', 1.4);
  // white paws
  for (const px of [72, 128]) {
    ell(px, 186, 16, 9, WHITE);
    x.strokeStyle = '#d8a777'; x.lineWidth = 2; x.beginPath(); x.ellipse(px, 186, 16, 9, 0, 0, Math.PI * 2); x.stroke();
  }
  // jelly shine
  ell(30, 140, 5, 12, 'rgba(255,255,255,.35)', .3);
  ell(100, 70, 18, 4.5, 'rgba(255,255,255,.3)');
  return c;
};
