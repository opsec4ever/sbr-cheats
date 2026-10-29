/* SchoolBoy Runaway - Cheat Panel
 * F2 toggles the panel. PageUp / PageDown change game speed.
 * Tabs: Speed (time hack) | Scan (memory scanner) | Locked (frozen values) | Send (SendMessage) | Misc
 */
(() => {
  "use strict";

  /* ------------------------------------------------------------------ *
   *  1. SPEED HACK - scales performance.now / Date.now. Must be installed
   *     before the game boots, which is why this runs immediately.
   * ------------------------------------------------------------------ */
  const realPerfNow = performance.now.bind(performance);
  const realDateNow = Date.now.bind(Date);
  let rate = 1;
  let lastReal = realPerfNow();
  let virt = lastReal;
  const dateBase = realDateNow();
  const perfBase = lastReal;
  const vnow = () => {
    const r = realPerfNow();
    virt += (r - lastReal) * rate;
    lastReal = r;
    return virt;
  };
  performance.now = vnow;
  Date.now = () => Math.floor(dateBase + (vnow() - perfBase));
  const setRate = (v) => {
    vnow(); // flush time at old rate
    rate = Math.max(0, Math.min(20, v));
  };

  /* ------------------------------------------------------------------ *
   *  2. MEMORY ACCESS
   * ------------------------------------------------------------------ */
  const mod = () => window.unityInstance && window.unityInstance.Module;
  const heapOf = (t) => (t === "f32" ? mod().HEAPF32 : mod().HEAP32);
  const CAP = 4000000;

  const scan = { type: "i32", addrs: null, prev: null, count: 0 };
  const frozen = new Map(); // addr -> {type, value}

  function firstScan(type, value) {
    const h = heapOf(type);
    const out = new Uint32Array(CAP);
    let n = 0;
    if (type === "i32") {
      for (let i = 0; i < h.length && n < CAP; i++) if (h[i] === value) out[n++] = i << 2;
    } else {
      const tol = Math.max(0.005, Math.abs(value) * 1e-5);
      for (let i = 0; i < h.length && n < CAP; i++) {
        const x = h[i];
        if (x - value <= tol && value - x <= tol) out[n++] = i << 2;
      }
    }
    scan.type = type;
    scan.addrs = out.slice(0, n);
    scan.prev = type === "i32" ? new Int32Array(n) : new Float32Array(n);
    for (let k = 0; k < n; k++) scan.prev[k] = h[scan.addrs[k] >> 2];
    scan.count = n;
  }

  function nextScan(mode, value) {
    const h = heapOf(scan.type);
    const keepA = [];
    const keepP = [];
    const tol = scan.type === "f32" ? Math.max(0.005, Math.abs(value || 0) * 1e-5) : 0;
    for (let k = 0; k < scan.count; k++) {
      const a = scan.addrs[k];
      const cur = h[a >> 2];
      const old = scan.prev[k];
      let ok = false;
      switch (mode) {
        case "exact": ok = Math.abs(cur - value) <= tol; break;
        case "changed": ok = cur !== old; break;
        case "unchanged": ok = cur === old; break;
        case "increased": ok = cur > old; break;
        case "decreased": ok = cur < old; break;
      }
      if (ok) { keepA.push(a); keepP.push(cur); }
    }
    scan.addrs = Uint32Array.from(keepA);
    scan.prev = scan.type === "i32" ? Int32Array.from(keepP) : Float32Array.from(keepP);
    scan.count = keepA.length;
  }

  const writeAt = (type, addr, v) => { heapOf(type)[addr >> 2] = v; };
  const readAt = (type, addr) => heapOf(type)[addr >> 2];

  setInterval(() => {
    if (!mod() || !frozen.size) return;
    for (const [addr, f] of frozen) writeAt(f.type, addr, f.value);
  }, 16);

  /* ------------------------------------------------------------------ *
   *  3. UI (shadow DOM so the page CSS can't touch it)
   * ------------------------------------------------------------------ */
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;z-index:2147483647;top:0;left:0;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
<style>
  :host{all:initial}
  *{box-sizing:border-box;font-family:'Segoe UI',system-ui,sans-serif}
  .fab{position:fixed;right:16px;bottom:16px;width:46px;height:46px;border-radius:50%;border:0;cursor:pointer;
    background:linear-gradient(135deg,#8b5cf6,#06b6d4);color:#fff;font-size:22px;box-shadow:0 0 18px #8b5cf688;}
  .fab:hover{transform:scale(1.08)}
  .panel{position:fixed;right:16px;bottom:72px;width:360px;max-width:calc(100vw - 24px);max-height:75vh;display:none;flex-direction:column;
    color:#e5e7eb;background:rgba(15,15,25,.88);backdrop-filter:blur(14px);border:1px solid #8b5cf655;border-radius:16px;
    box-shadow:0 10px 40px #000a,0 0 24px #8b5cf633;overflow:hidden;font-size:13px}
  .panel.open{display:flex}
  header{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;cursor:move;user-select:none;
    background:linear-gradient(90deg,#8b5cf633,#06b6d433)}
  header b{font-size:14px;letter-spacing:.5px;background:linear-gradient(90deg,#c4b5fd,#67e8f9);-webkit-background-clip:text;color:transparent}
  header small{color:#9ca3af}
  nav{display:flex;border-bottom:1px solid #ffffff14}
  nav button{flex:1;padding:9px 0;background:none;border:0;color:#9ca3af;cursor:pointer;font-size:12px;border-bottom:2px solid transparent}
  nav button.on{color:#fff;border-bottom-color:#8b5cf6}
  .body{padding:12px 14px;overflow:auto}
  .tab{display:none}.tab.on{display:block}
  .row{display:flex;gap:6px;align-items:center;margin:8px 0}
  .row>*{flex:1}.row>.fit{flex:0 0 auto}
  label{color:#9ca3af;font-size:11px;display:block;margin-bottom:2px}
  input,select{width:100%;padding:7px 9px;border-radius:8px;border:1px solid #ffffff22;background:#0b0b14;color:#fff;outline:none;font-size:13px}
  input:focus,select:focus{border-color:#8b5cf6}
  input[type=range]{padding:0;accent-color:#8b5cf6}
  .btn{padding:7px 10px;border-radius:8px;border:0;cursor:pointer;color:#fff;font-size:12px;font-weight:600;
    background:linear-gradient(135deg,#7c3aed,#0891b2)}
  .btn:hover{filter:brightness(1.2)}
  .btn.ghost{background:#ffffff14}.btn.red{background:#be123c}
  .big{font-size:30px;font-weight:700;text-align:center;margin:4px 0;background:linear-gradient(90deg,#c4b5fd,#67e8f9);
    -webkit-background-clip:text;color:transparent}
  .hint{color:#9ca3af;font-size:11.5px;line-height:1.45;margin:6px 0}
  .res{display:grid;grid-template-columns:78px 1fr auto auto;gap:5px;align-items:center;padding:4px 0;border-bottom:1px solid #ffffff0d}
  .res code{color:#67e8f9;font-size:11px}.res input{padding:4px 6px}
  .res .btn{padding:4px 7px}
  .toast{position:fixed;left:50%;top:18px;transform:translateX(-50%);background:#111827;border:1px solid #8b5cf6;color:#fff;
    padding:8px 14px;border-radius:10px;font-size:13px;opacity:0;transition:.25s;pointer-events:none}
  .toast.show{opacity:1}
  .fps{position:fixed;left:10px;top:8px;color:#67e8f9;font:600 12px monospace;display:none;text-shadow:0 0 4px #000}
  .log{background:#0b0b14;border-radius:8px;padding:8px;height:70px;overflow:auto;font:11px monospace;color:#a7f3d0;white-space:pre-wrap}
</style>

<div class="fps" id="fps"></div>
<div class="toast" id="toast"></div>
<button class="fab" id="fab" title="Cheat panel (F2)">&#9889;</button>

<div class="panel" id="panel">
  <header id="drag"><b>&#9889; SCHOOLBOY RUNAWAY CHEATS</b><small>F2 hide</small></header>
  <nav id="nav">
    <button data-t="game" class="on">Game</button><button data-t="speed">Speed</button><button data-t="scan">Scan</button>
    <button data-t="locked">Locked</button><button data-t="send">Send</button><button data-t="misc">Misc</button>
  </nav>
  <div class="body">

    <div class="tab on" id="t-game">
      <div class="hint"><b>Player movement</b> <span id="mvStat">(not found yet)</span></div>
      <div id="mvBox"></div>
      <div class="row"><button class="btn" id="mvFind">Find player</button><button class="btn ghost" id="mvReset">Reset speeds</button></div>
      <div class="row"><label style="margin:0"><input type="checkbox" id="fly" style="width:auto"> Fly: hold Space (experimental)</label></div>
      <div class="hint"><b>Parents</b></div>
      <div class="row"><button class="btn" id="frz">Freeze Mom + Dad</button><button class="btn ghost" id="unfrz">Unfreeze</button></div>
      <div class="row"><button class="btn" id="lockMom">Lock Mom away</button><button class="btn" id="lockDad">Lock Dad away</button></div>
      <div class="row"><button class="btn" id="nap">Dad sleeping pill</button><button class="btn ghost" id="skipTl">Skip cutscene</button></div>
      <div class="hint"><b>Timer &amp; endings</b> (endings may glitch if triggered out of order)</div>
      <div class="row"><button class="btn ghost" id="tPause">Pause timer</button><button class="btn ghost" id="tStart">Resume timer</button></div>
      <div class="row"><button class="btn ghost" data-end="StartRoofEnding">Roof ending</button><button class="btn ghost" data-end="StartGateEnding">Gate ending</button><button class="btn ghost" data-end="StartBeltEnding">Belt ending</button></div>
    </div>

    <div class="tab" id="t-speed">
      <div class="big" id="rateTxt">1.0x</div>
      <input type="range" id="rate" min="0" max="10" step="0.1" value="1">
      <div class="row">
        <button class="btn ghost" data-r="0.25">0.25x</button><button class="btn ghost" data-r="1">1x</button>
        <button class="btn ghost" data-r="2">2x</button><button class="btn ghost" data-r="5">5x</button>
        <button class="btn ghost" data-r="10">10x</button>
      </div>
      <div class="hint">Scales the game's clock. Great for speed-running or slow-mo dodging. 0x freezes time. PageUp / PageDown nudge by 0.5.</div>
    </div>

    <div class="tab" id="t-scan">
      <div class="hint"><b>Make any number infinite:</b> type your current value (coins, health, score...), hit <b>First scan</b>, change the value in-game, type the new value, hit <b>Next scan</b>. Repeat until 1-5 results remain, then lock it (&#10052;) or <b>Set</b> a huge number.</div>
      <div class="row">
        <div><label>Value</label><input id="sv" type="number" step="any" placeholder="e.g. 120"></div>
        <div class="fit" style="width:96px"><label>Type</label><select id="st"><option value="i32">Integer</option><option value="f32">Float</option></select></div>
      </div>
      <div class="row">
        <button class="btn" id="first">First scan</button><button class="btn" id="next">Next scan</button>
        <button class="btn ghost" id="reset">Reset</button>
      </div>
      <div class="row">
        <button class="btn ghost" data-m="changed">Changed</button><button class="btn ghost" data-m="unchanged">Same</button>
        <button class="btn ghost" data-m="increased">&uarr; Up</button><button class="btn ghost" data-m="decreased">&darr; Down</button>
      </div>
      <div class="hint" id="scount">No scan yet.</div>
      <div class="row"><input id="setall" type="number" step="any" placeholder="Value to write">
        <button class="btn fit" id="setAllBtn">Set shown</button><button class="btn fit" id="lockAllBtn">&#10052; shown</button></div>
      <div id="results"></div>
    </div>

    <div class="tab" id="t-locked">
      <div class="hint">Locked addresses are rewritten constantly, so they can't go down. Lock health for god mode, ammo, coins, timers...</div>
      <div id="lockedList"></div>
      <div class="row"><button class="btn red" id="unlockAll">Unlock all</button></div>
    </div>

    <div class="tab" id="t-send">
      <div class="hint">Call a public method on a Unity GameObject (<code>SendMessage</code>). You need the real object and method names.</div>
      <div class="row"><div><label>GameObject</label><input id="so" placeholder="GameManager"></div>
        <div><label>Method</label><input id="sm" placeholder="AddCoins"></div></div>
      <div class="row"><div><label>Parameter (optional)</label><input id="sp" placeholder="1000"></div>
        <button class="btn fit" id="sendBtn" style="margin-top:14px">Send</button></div>
      <div class="log" id="log"></div>
    </div>

    <div class="tab" id="t-misc">
      <div class="row"><button class="btn" id="fs">Fullscreen</button><button class="btn ghost" id="fpsBtn">Toggle FPS</button></div>
      <div class="row"><button class="btn ghost" id="gc">Free scan memory</button><button class="btn ghost" id="rl">Reload game</button></div>
      <div class="hint">Single-player tinkering tools. Settings reset when you reload the page.</div>
    </div>
  </div>
</div>`;
  document.body.appendChild(host);

  const $ = (id) => root.getElementById(id);
  const panel = $("panel");
  // keep keystrokes in the panel away from Unity
  ["keydown", "keyup", "keypress"].forEach((e) =>
    host.addEventListener(e, (ev) => ev.stopPropagation())
  );

  const toast = (msg) => {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast.id);
    toast.id = setTimeout(() => t.classList.remove("show"), 1800);
  };
  const needGame = () => {
    if (mod()) return true;
    toast("Game still loading...");
    return false;
  };

  // panel open/close + tabs + drag
  const toggle = () => panel.classList.toggle("open");
  $("fab").onclick = toggle;
  $("nav").onclick = (e) => {
    const t = e.target.dataset.t;
    if (!t) return;
    root.querySelectorAll("nav button").forEach((b) => b.classList.toggle("on", b === e.target));
    root.querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x.id === "t-" + t));
    if (t === "locked") renderLocked();
  };
  (() => {
    const h = $("drag");
    let ox, oy, drag = false;
    h.onpointerdown = (e) => {
      drag = true;
      const r = panel.getBoundingClientRect();
      ox = e.clientX - r.left; oy = e.clientY - r.top;
      h.setPointerCapture(e.pointerId);
    };
    h.onpointermove = (e) => {
      if (!drag) return;
      panel.style.left = e.clientX - ox + "px";
      panel.style.top = e.clientY - oy + "px";
      panel.style.right = panel.style.bottom = "auto";
    };
    h.onpointerup = () => (drag = false);
  })();

  // ---- speed tab
  const showRate = () => {
    $("rateTxt").textContent = rate.toFixed(rate < 1 ? 2 : 1) + "x";
    $("rate").value = rate;
  };
  $("rate").oninput = (e) => { setRate(parseFloat(e.target.value)); showRate(); };
  root.querySelectorAll("[data-r]").forEach((b) => (b.onclick = () => { setRate(+b.dataset.r); showRate(); }));

  // ---- scan tab
  const fmt = (v) => (Number.isInteger(v) ? String(v) : (+v).toFixed(3));
  const parseVal = () => {
    const v = parseFloat($("sv").value);
    return Number.isNaN(v) ? null : v;
  };

  function renderResults() {
    const box = $("results");
    $("scount").textContent = scan.addrs
      ? `${scan.count.toLocaleString()} match${scan.count === 1 ? "" : "es"}${scan.count > 50 ? " (showing 50 - keep narrowing)" : ""}`
      : "No scan yet.";
    box.innerHTML = "";
    if (!scan.addrs) return;
    const n = Math.min(scan.count, 50);
    for (let i = 0; i < n; i++) {
      const a = scan.addrs[i];
      const row = document.createElement("div");
      row.className = "res";
      row.innerHTML = `<code>0x${a.toString(16)}</code><input type="number" step="any" placeholder="${fmt(readAt(scan.type, a))}"><button class="btn">Set</button><button class="btn ghost">&#10052;</button>`;
      const inp = row.querySelector("input");
      const [setB, lockB] = row.querySelectorAll("button");
      row.dataset.addr = a;
      setB.onclick = () => {
        const v = parseFloat(inp.value);
        if (!Number.isNaN(v)) { writeAt(scan.type, a, v); toast("Written"); }
      };
      lockB.onclick = () => {
        const v = parseFloat(inp.value);
        lock(a, scan.type, Number.isNaN(v) ? readAt(scan.type, a) : v);
      };
      box.appendChild(row);
    }
  }
  // keep placeholders showing the live value
  setInterval(() => {
    if (!mod() || !scan.addrs) return;
    root.querySelectorAll("#results .res").forEach((r) => {
      const inp = r.querySelector("input");
      if (root.activeElement !== inp) inp.placeholder = fmt(readAt(scan.type, +r.dataset.addr));
    });
  }, 400);

  $("first").onclick = () => {
    if (!needGame()) return;
    const v = parseVal();
    if (v === null) return toast("Enter a value first");
    firstScan($("st").value, v);
    renderResults();
    toast(`Found ${scan.count.toLocaleString()} matches`);
  };
  const doNext = (mode) => {
    if (!needGame()) return;
    if (!scan.addrs) return toast("Run a first scan");
    const v = parseVal();
    if (mode === "exact" && v === null) return toast("Enter a value first");
    nextScan(mode, v);
    renderResults();
  };
  $("next").onclick = () => doNext("exact");
  root.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => doNext(b.dataset.m)));
  $("reset").onclick = () => { scan.addrs = null; scan.count = 0; renderResults(); };

  const shown = () => (scan.addrs ? Array.from(scan.addrs.slice(0, Math.min(scan.count, 50))) : []);
  $("setAllBtn").onclick = () => {
    if (!needGame()) return;
    const v = parseFloat($("setall").value);
    if (Number.isNaN(v)) return toast("Enter a value to write");
    shown().forEach((a) => writeAt(scan.type, a, v));
    toast("Written to shown results");
  };
  $("lockAllBtn").onclick = () => {
    if (!needGame()) return;
    const v = parseFloat($("setall").value);
    shown().forEach((a) => frozen.set(a, { type: scan.type, value: Number.isNaN(v) ? readAt(scan.type, a) : v }));
    toast("Locked shown results");
  };

  // ---- locked tab
  function lock(addr, type, value) {
    frozen.set(addr, { type, value });
    toast("Locked at " + fmt(value));
  }
  function renderLocked() {
    const box = $("lockedList");
    box.innerHTML = frozen.size ? "" : '<div class="hint">Nothing locked.</div>';
    for (const [addr, f] of frozen) {
      const row = document.createElement("div");
      row.className = "res";
      row.innerHTML = `<code>0x${addr.toString(16)}</code><input type="number" step="any" value="${f.value}"><button class="btn">Update</button><button class="btn red">&#10005;</button>`;
      const [upd, del] = row.querySelectorAll("button");
      const inp = row.querySelector("input");
      upd.onclick = () => { const v = parseFloat(inp.value); if (!Number.isNaN(v)) f.value = v; };
      del.onclick = () => { frozen.delete(addr); renderLocked(); };
      box.appendChild(row);
    }
  }
  $("unlockAll").onclick = () => { frozen.clear(); renderLocked(); };

  // ---- send tab
  const log = (m) => { const l = $("log"); l.textContent += m + "\n"; l.scrollTop = l.scrollHeight; };
  $("sendBtn").onclick = () => {
    if (!needGame()) return;
    const o = $("so").value.trim(), m = $("sm").value.trim(), p = $("sp").value.trim();
    if (!o || !m) return toast("Need object + method");
    try {
      if (p === "") window.unityInstance.SendMessage(o, m);
      else window.unityInstance.SendMessage(o, m, isNaN(+p) ? p : +p);
      log(`> ${o}.${m}(${p})`);
    } catch (e) { log("! " + e); }
  };

  // ---- misc tab
  $("fs").onclick = () => needGame() && window.unityInstance.SetFullscreen(1);
  $("fpsBtn").onclick = () => { const f = $("fps"); f.style.display = f.style.display === "block" ? "none" : "block"; };
  $("gc").onclick = () => { scan.addrs = null; scan.prev = null; scan.count = 0; renderResults(); toast("Scan memory freed"); };
  $("rl").onclick = () => location.reload();

  let frames = 0, last = realPerfNow();
  (function tick() {
    frames++;
    const now = realPerfNow();
    if (now - last >= 500) {
      $("fps").textContent = Math.round((frames * 1000) / (now - last)) + " FPS";
      frames = 0; last = now;
    }
    requestAnimationFrame(tick);
  })();

  // ---- game tab (object names + values were read from the game's own data files)
  const PATH = {
    mom: "/Mom", dad: "/Dad", player: "/FP_Controller",
    gm: "/_Parent_Manager/Game Manager", timeline: "/_Parent_Timelines",
    timer: "/_Parent_Manager/Game Manager/Game Timer",
  };
  const send = (obj, method, param) => {
    if (!needGame()) return false;
    try {
      if (param === undefined) window.unityInstance.SendMessage(obj, method);
      else window.unityInstance.SendMessage(obj, method, param);
      log(`> ${obj}.${method}(${param === undefined ? "" : param})`);
      return true;
    } catch (e) { log("! " + e); return false; }
  };

  // Player movement: FP_Body stores these floats back to back in memory.
  // Defaults from the scene: walk 3.2, run 6, jump 7.3, climb 2, crouch height 1, crouch speed 1.8, water 0.4
  const SIG = [3.2, 6, 7.3, 2, 1, 1.8, 0.4].map(Math.fround);
  const MV = [
    { key: "walk", label: "Walk speed", idx: 0, min: 0.5, max: 20, val: 3.2 },
    { key: "run", label: "Run speed", idx: 1, min: 1, max: 30, val: 6 },
    { key: "jump", label: "Jump force", idx: 2, min: 1, max: 30, val: 7.3 },
    { key: "climb", label: "Climb speed", idx: 3, min: 0.5, max: 15, val: 2 },
    { key: "crouch", label: "Crouch speed", idx: 5, min: 0.5, max: 15, val: 1.8 },
  ];
  let mvHits = [];
  const mvDefaults = MV.map((m) => m.val);
  const mvBox = $("mvBox");
  MV.forEach((m) => {
    const d = document.createElement("div");
    d.innerHTML = `<label>${m.label}: <b id="mv_${m.key}_v">${m.val}</b></label><input type="range" id="mv_${m.key}" min="${m.min}" max="${m.max}" step="0.1" value="${m.val}">`;
    mvBox.appendChild(d);
    d.querySelector("input").oninput = (e) => {
      m.val = parseFloat(e.target.value);
      d.querySelector("b").textContent = m.val;
      applyMove();
    };
  });
  function applyMove() {
    if (!mod() || !mvHits.length) return;
    const h = mod().HEAPF32;
    for (const i of mvHits) for (const m of MV) h[i + m.idx] = m.val;
  }
  function findPlayer(quiet) {
    if (!mod()) { if (!quiet) toast("Game still loading..."); return; }
    const h = mod().HEAPF32;
    const hits = [];
    for (let i = 0, n = h.length - 7; i < n; i++) {
      if (h[i] === SIG[0] && h[i + 1] === SIG[1] && h[i + 2] === SIG[2] && h[i + 3] === SIG[3] &&
          h[i + 5] === SIG[5] && h[i + 6] === SIG[6]) hits.push(i);
    }
    mvHits = hits;
    $("mvStat").textContent = hits.length ? `(found, ${hits.length} match${hits.length > 1 ? "es" : ""})` : "(not found - start a game, then press Find)";
    if (!quiet) toast(hits.length ? "Player found" : "Not found yet - load into the house first");
    if (hits.length) applyMove();
    return hits.length;
  }
  $("mvFind").onclick = () => findPlayer(false);
  $("mvReset").onclick = () => {
    MV.forEach((m, k) => { m.val = mvDefaults[k]; $("mv_" + m.key).value = m.val; $("mv_" + m.key + "_v").textContent = m.val; });
    applyMove();
  };
  // keep re-applying in case the game's own debug sliders overwrite the values
  setInterval(() => { if (mvHits.length) applyMove(); }, 500);
  // auto-find once the game is up (retries a few times while the house loads)
  let tries = 0;
  const auto = setInterval(() => {
    if (!mod()) return;
    if (findPlayer(true) || ++tries > 15) clearInterval(auto);
  }, 4000);

  // parents + misc
  $("frz").onclick = () => ["mom", "dad"].forEach((k) => { send(PATH[k], "AgentDisable"); send(PATH[k], "StopAgent"); });
  $("unfrz").onclick = () => ["mom", "dad"].forEach((k) => { send(PATH[k], "AgentEnable"); send(PATH[k], "StartAgent"); });
  $("lockMom").onclick = () => send(PATH.mom, "LockedMomInStoreroom");
  $("lockDad").onclick = () => send(PATH.dad, "LockedDadInStoreroom");
  $("nap").onclick = () => { send(PATH.dad, "AddSleepingPillInBeer"); setTimeout(() => send(PATH.dad, "DrinkBeer"), 400); };
  $("skipTl").onclick = () => send(PATH.timeline, "Skip");
  $("tPause").onclick = () => send(PATH.timer, "PauseTimer");
  $("tStart").onclick = () => send(PATH.timer, "StartTimer");
  root.querySelectorAll("[data-end]").forEach((b) => (b.onclick = () => send(PATH.gm, b.dataset.end)));

  // fly: spam ForceJump while Space is held
  let space = false;
  window.addEventListener("keydown", (e) => { if (e.code === "Space") space = true; }, true);
  window.addEventListener("keyup", (e) => { if (e.code === "Space") space = false; }, true);
  setInterval(() => {
    if ($("fly").checked && space && mod()) window.unityInstance.SendMessage(PATH.player, "ForceJump");
  }, 110);

  // ---- hotkeys
  window.addEventListener("keydown", (e) => {
    if (e.key === "F2") { e.preventDefault(); toggle(); }
    else if (e.key === "PageUp") { setRate(rate + 0.5); showRate(); toast("Speed " + rate.toFixed(1) + "x"); }
    else if (e.key === "PageDown") { setRate(rate - 0.5); showRate(); toast("Speed " + rate.toFixed(1) + "x"); }
  }, true);

  window.addEventListener("unity-ready", () => toast("Cheat panel ready - F2 to toggle"));
})();