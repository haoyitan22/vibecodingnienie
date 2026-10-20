(async () => {
  // 在普通浏览器里打开时用一个假的接口，方便预览
  const api = window.pet || {
    info: async () => ({ x: 0, y: 0, w: innerWidth, h: innerHeight, area: { x: 0, y: 0, width: innerWidth, height: innerHeight } }),
    move() {}, setIgnore() {}, menu() {}, onCommand() {},
  };

  const canvas = document.getElementById('c');
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: true, alpha: true });
  if (!gl) return;

  /* ---------- textures ---------- */
  const TEX = 1024;
  const FACES = ['open', 'blink', 'squint', 'surprised', 'sleep'];
  const arts = {};
  for (const f of FACES) arts[f] = window.drawPet(f, TEX);
  const alpha = arts.open.getContext('2d').getImageData(0, 0, TEX, TEX).data;
  const opaqueAt = (u, v) => u >= 0 && v >= 0 && u < 1 && v < 1 &&
    alpha[((Math.floor(v * TEX) * TEX + Math.floor(u * TEX)) << 2) + 3] > 40;

  function shader(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, `
    attribute vec2 a_p; attribute vec2 a_uv; uniform vec2 u_res; uniform vec3 u_box; uniform float u_flip; varying vec2 v_uv;
    void main() {
      float px = mix(a_p.x, 1.0 - a_p.x, u_flip);
      vec2 p = u_box.xy + vec2(px, a_p.y) * u_box.z;
      vec2 c = p / u_res * 2.0 - 1.0;
      gl_Position = vec4(c.x, -c.y, 0.0, 1.0); v_uv = a_uv;
    }`));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, `
    precision mediump float; uniform sampler2D u_t; varying vec2 v_uv;
    void main() { gl_FragColor = texture2D(u_t, v_uv); }`));
  gl.linkProgram(prog); gl.useProgram(prog);
  const loc = {
    p: gl.getAttribLocation(prog, 'a_p'), uv: gl.getAttribLocation(prog, 'a_uv'),
    res: gl.getUniformLocation(prog, 'u_res'), box: gl.getUniformLocation(prog, 'u_box'), flip: gl.getUniformLocation(prog, 'u_flip'),
  };
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  const textures = {};
  for (const f of FACES) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, arts[f]);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    textures[f] = t;
  }
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  /* ---------- jelly mesh ---------- */
  const N = 32, V = N + 1, NV = V * V;
  const rest = new Float32Array(NV * 2), pos = new Float32Array(NV * 2), vel = new Float32Array(NV * 2), disp = new Float32Array(NV * 2);
  const gOwner = new Int32Array(NV).fill(-1), gW = new Float32Array(NV), g0 = new Float32Array(NV * 2);
  for (let r = 0; r < V; r++) for (let c = 0; c < V; c++) {
    const i = r * V + c; rest[2 * i] = pos[2 * i] = c / N; rest[2 * i + 1] = pos[2 * i + 1] = r / N;
  }
  const idx = new Uint16Array(N * N * 6); let k = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const a = r * V + c, b = a + 1, d = a + V, e = d + 1; idx.set([a, b, d, b, e, d], k); k += 6;
  }
  const uvBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf); gl.bufferData(gl.ARRAY_BUFFER, rest, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(loc.uv); gl.vertexAttribPointer(loc.uv, 2, gl.FLOAT, false, 0, 0);
  const posBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, posBuf); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(loc.p); gl.vertexAttribPointer(loc.p, 2, gl.FLOAT, false, 0, 0);
  const idxBuf = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

  const K = 70, KN = 700, DAMP = 3.2, R = 0.14, MAXPULL = 0.4;
  const grabs = new Map();

  function step(h) {
    for (let i = 0; i < NV * 2; i++) disp[i] = pos[i] - rest[i];
    for (let r = 0; r < V; r++) for (let c = 0; c < V; c++) {
      const i = r * V + c, ix = 2 * i, iy = ix + 1, owner = gOwner[i];
      if (owner >= 0 && grabs.has(owner)) {
        const gr = grabs.get(owner), w = gW[i];
        vel[ix] = (g0[ix] + gr.dx * w - pos[ix]) / h; vel[iy] = (g0[iy] + gr.dy * w - pos[iy]) / h;
        continue;
      }
      let mx = 0, my = 0, n = 0;
      if (c > 0) { mx += disp[ix - 2]; my += disp[iy - 2]; n++; }
      if (c < N) { mx += disp[ix + 2]; my += disp[iy + 2]; n++; }
      if (r > 0) { mx += disp[ix - 2 * V]; my += disp[iy - 2 * V]; n++; }
      if (r < N) { mx += disp[ix + 2 * V]; my += disp[iy + 2 * V]; n++; }
      mx /= n; my /= n;
      vel[ix] += (-K * disp[ix] + KN * (mx - disp[ix]) - DAMP * vel[ix]) * h;
      vel[iy] += (-K * disp[iy] + KN * (my - disp[iy]) - DAMP * vel[iy]) * h;
    }
    for (let i = 0; i < NV * 2; i++) pos[i] += vel[i] * h;
  }
  function squash(amount) {
    for (let i = 0; i < NV; i++) {
      vel[2 * i + 1] += (1 - rest[2 * i + 1]) * amount;
      vel[2 * i] += (rest[2 * i] - 0.5) * amount * 0.9;
    }
  }
  function nudge(dx, dy) { for (let i = 0; i < NV * 2; i += 2) { vel[i] += dx; vel[i + 1] += dy; } }

  /* ---------- layout ---------- */
  const W = innerWidth, H = innerHeight;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const S = 170, OX = (W - S) / 2, BASE_OY = H - S - 4;
  let hop = 0, flip = false;
  const toNorm = (x, y) => { let nx = (x - OX) / S; if (flip) nx = 1 - nx; return [nx, (y - (BASE_OY - hop)) / S]; };

  function nearestVertex(nx, ny) {
    let best = -1, bd = 1e9;
    for (let i = 0; i < NV; i++) { const dx = pos[2 * i] - nx, dy = pos[2 * i + 1] - ny, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
    return [best, Math.sqrt(bd)];
  }
  function onPet(x, y) {
    const [nx, ny] = toNorm(x, y), [i, d] = nearestVertex(nx, ny);
    return d < 0.05 && opaqueAt(rest[2 * i], rest[2 * i + 1]);
  }

  /* ---------- talking ---------- */
  function spawn(cls, text, x, y, extra) {
    const el = document.createElement('div'); el.className = cls; el.textContent = text;
    el.style.left = x + 'px'; el.style.top = y + 'px'; if (extra) extra(el);
    document.body.appendChild(el); el.addEventListener('animationend', () => el.remove());
  }
  const say = (words, x = W / 2, y = BASE_OY + 20) => spawn('bubble', words[Math.floor(Math.random() * words.length)], Math.min(Math.max(x, 60), W - 60), Math.max(y, 34));
  const PULL = ['喵呜…', '别拉我脸', '软乎乎', '咪~', '呼噜噜'];
  const OUCH = ['喵！！', '拉长啦！', '脸要掉了！', '哈——！'];
  const POKE = ['喵！', '咪？', '呼噜噜~', 'Q弹~', '再摸摸'];
  const CARRY = ['要去哪？', '放我下来喵', '飞起来啦'];
  const LAND = ['啪叽', '稳稳落地', '喵！'];

  /* ---------- state ---------- */
  let info = await api.info();
  let area = info.area, winX = info.x, winY = info.y, sentX = winX, sentY = winY;
  const floorY = () => area.y + area.height - H;
  let walkEnabled = true;
  try { walkEnabled = localStorage.getItem('pet-walk') !== 'off'; } catch (e) {}
  let mode = 'idle', targetX = winX, phase = 0, fallV = 0;
  let lastInteract = performance.now(), nextDecision = performance.now() + 4000, nextZ = 0;
  let blinking = false, pokeFace = 0;
  if (Math.abs(winY - floorY()) > 2) mode = 'fall';

  function touch() { lastInteract = performance.now(); if (mode === 'sleep') { mode = 'idle'; say(['喵？', '嗯…醒了']); } }
  function setWalk(on) { walkEnabled = on; try { localStorage.setItem('pet-walk', on ? 'on' : 'off'); } catch (e) {} if (!on && mode === 'walk') mode = 'idle'; }

  api.onCommand(async cmd => {
    if (cmd === 'walk-toggle') { setWalk(!walkEnabled); say(walkEnabled ? ['出去逛逛喵'] : ['好，我不乱跑']); }
    if (cmd === 'sleep-toggle') { if (mode === 'sleep') touch(); else { mode = 'sleep'; } }
    if (cmd === 'home') { info = await api.info(); area = info.area; winX = sentX = info.x; winY = sentY = info.y; mode = 'idle'; say(['我回来啦']); }
  });

  /* ---------- mouse: only the cat itself catches clicks ---------- */
  let ignoring = true;
  const setIgnore = b => { if (b !== ignoring) { ignoring = b; api.setIgnore(b); } };
  addEventListener('mousemove', e => { if (!grabs.size && mode !== 'carry') setIgnore(!onPet(e.clientX, e.clientY)); });
  addEventListener('mouseleave', () => { if (!grabs.size && mode !== 'carry') setIgnore(true); });

  let press = null;
  canvas.addEventListener('contextmenu', e => { e.preventDefault(); api.menu({ walking: walkEnabled, sleeping: mode === 'sleep' }); });

  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !onPet(e.clientX, e.clientY)) return;
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    touch();
    if (mode === 'walk' || mode === 'fall') mode = 'idle';
    const [nx, ny] = toNorm(e.clientX, e.clientY);
    for (let i = 0; i < NV; i++) {
      if (gOwner[i] >= 0) continue;
      const dx = pos[2 * i] - nx, dy = pos[2 * i + 1] - ny, d = Math.hypot(dx, dy);
      if (d < R) { const t = 1 - (d / R) ** 2; gOwner[i] = e.pointerId; gW[i] = t * t; g0[2 * i] = pos[2 * i]; g0[2 * i + 1] = pos[2 * i + 1]; }
    }
    grabs.set(e.pointerId, { dx: 0, dy: 0 });
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.screenX, sy: e.screenY, wx: winX, wy: winY, t: performance.now(), moved: 0, said: false, ouch: false };
    press.timer = setTimeout(startCarry, 450);
  });

  function dropGrab(id) { grabs.delete(id); for (let i = 0; i < NV; i++) if (gOwner[i] === id) gOwner[i] = -1; }

  function startCarry() {
    if (!press || press.moved > 6) return;
    dropGrab(press.id);
    mode = 'carry';
    press.sx = null; // re-anchor on next move
    squash(-1.6);
    say(CARRY);
  }

  canvas.addEventListener('pointermove', e => {
    if (!press || e.pointerId !== press.id) return;
    if (mode === 'carry') {
      if (press.sx === null) { press.sx = e.screenX; press.sy = e.screenY; press.wx = winX; press.wy = winY; }
      const nx = press.wx + (e.screenX - press.sx), ny = press.wy + (e.screenY - press.sy);
      nudge(-(nx - winX) / S * 3, -(ny - winY) / S * 3);   // body lags behind like jelly
      winX = nx; winY = ny;
      return;
    }
    let dx = (e.clientX - press.x) / S, dy = (e.clientY - press.y) / S;
    const len = Math.hypot(dx, dy);
    press.moved = Math.max(press.moved, len * S);
    if (press.moved > 6) clearTimeout(press.timer);
    if (len > 0) { const soft = MAXPULL * Math.tanh(len / MAXPULL) / len; dx *= soft; dy *= soft; }
    if (flip) dx = -dx;
    const g = grabs.get(e.pointerId); if (g) { g.dx = dx; g.dy = dy; }
    if (!press.said && press.moved > 10) { press.said = true; say(PULL, e.clientX, e.clientY - 18); }
    if (!press.ouch && len > 0.3) { press.ouch = true; say(OUCH, e.clientX, e.clientY - 18); }
  });

  function poke(cx, cy) {
    const [nx, ny] = toNorm(cx, cy);
    for (let i = 0; i < NV; i++) {
      const dx = pos[2 * i] - nx, dy = pos[2 * i + 1] - ny, d = Math.hypot(dx, dy);
      if (d < R * 1.8 && d > 1e-4) { const w = 1 - d / (R * 1.8); vel[2 * i] -= dx / d * 0.9 * w; vel[2 * i + 1] -= dy / d * 0.9 * w; }
    }
    squash(1.1);
    say(POKE, cx, cy - 18);
    for (let j = 0; j < 3; j++) spawn('heart', '♥', cx - 8 + (Math.random() - .5) * 50, cy - 10,
      el => { el.style.setProperty('--dx', ((Math.random() - .5) * 50) + 'px'); el.style.animationDelay = (j * .08) + 's'; });
  }

  async function release(e) {
    if (!press || e.pointerId !== press.id) return;
    clearTimeout(press.timer);
    dropGrab(press.id);
    const p = press; press = null;
    if (mode === 'carry') {
      mode = 'fall'; fallV = 0;
      info = await api.info(); area = info.area;
    } else if (p.moved < 6) {
      poke(e.clientX, e.clientY);
    } else if (p.moved > 40) {
      say(['boing~', '弹回来啦']);
    }
    lastInteract = performance.now();
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  (function blink() {
    setTimeout(() => { blinking = true; setTimeout(() => { blinking = false; blink(); }, 140); }, 1800 + Math.random() * 3200);
  })();

  /* ---------- main loop ---------- */
  const H_STEP = 1 / 240;
  let last = performance.now(), acc = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.05); last = now; acc += dt;
    while (acc >= H_STEP) { step(H_STEP); acc -= H_STEP; }

    if (mode === 'idle') {
      hop = 0;
      if (now - lastInteract > 60000) mode = 'sleep';
      else if (walkEnabled && now > nextDecision && !grabs.size) {
        nextDecision = now + 4000 + Math.random() * 6000;
        if (Math.random() < 0.6) {
          const minX = area.x, maxX = area.x + area.width - W;
          targetX = minX + Math.random() * Math.max(0, maxX - minX);
          if (Math.abs(targetX - winX) > 30) { mode = 'walk'; flip = targetX > winX; phase = 0; }
        }
      }
    } else if (mode === 'walk') {
      const d = targetX - winX, stepX = Math.sign(d) * Math.min(Math.abs(d), 70 * dt);
      winX += stepX; winY = floorY();
      const prev = Math.sin(phase); phase += dt * 11;
      hop = Math.abs(Math.sin(phase)) * 9;
      if (Math.sign(Math.sin(phase)) !== Math.sign(prev)) squash(0.35);
      if (Math.abs(targetX - winX) < 1) { mode = 'idle'; hop = 0; squash(0.6); }
    } else if (mode === 'fall') {
      hop = 0;
      fallV += 2600 * dt; winY += fallV * dt;
      const minX = area.x - W * 0.3, maxX = area.x + area.width - W * 0.7;
      winX = Math.min(Math.max(winX, minX), maxX);
      if (winY >= floorY()) {
        winY = floorY(); mode = 'idle'; squash(Math.min(3.5, fallV / 400));
        if (fallV > 500) say(LAND);
        fallV = 0; nextDecision = now + 3000;
      }
    } else if (mode === 'sleep') {
      hop = 0;
      if (now > nextZ) { nextZ = now + 1600; spawn('z', 'z', OX + S * 0.72, BASE_OY + S * 0.3); }
    }

    if (Math.round(winX) !== Math.round(sentX) || Math.round(winY) !== Math.round(sentY)) {
      sentX = winX; sentY = winY; api.move(winX, winY);
    }

    let energy = 0; for (let i = 0; i < NV * 2; i += 8) energy += vel[i] * vel[i] + vel[i + 1] * vel[i + 1];
    pokeFace = grabs.size || energy > 0.8 ? 0.35 : Math.max(0, pokeFace - dt);
    const face = mode === 'sleep' ? 'sleep' : mode === 'carry' || mode === 'fall' ? 'surprised'
      : pokeFace > 0 ? 'squint' : blinking ? 'blink' : 'open';

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(loc.res, W, H);
    gl.uniform3f(loc.box, OX, BASE_OY - hop, S);
    gl.uniform1f(loc.flip, flip ? 1 : 0);
    gl.bindTexture(gl.TEXTURE_2D, textures[face]);
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, pos);
    gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
