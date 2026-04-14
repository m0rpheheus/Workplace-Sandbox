/**
 * WORKPLACE SANDBOX — app.js (Blueprint Edition)
 * Modules: State · Canvas · Calibration · Library · Insights · PlacedList · Modal3D · Tools · Exporter
 */
'use strict';

/* ═══════════════════════════════════════════
   STATE
═══════════════════════════════════════════ */
const State = (() => {
  let s = {
    floorPlanLoaded: false,
    pixelsPerMm: null,
    calPhase: 0,  // 0=idle 1=pt1 2=pt2 3=awaiting input
    calPt1: null, calPt2: null,
    activeTool: 'select',
    placed: [],       // { id, type, label, seats, area, kind, obj }
    floorAreaM2: null,
  };
  return {
    get: k => k ? s[k] : { ...s },
    set: (k, v) => { s[k] = v; },
    update: p => Object.assign(s, p),
  };
})();

/* ═══════════════════════════════════════════
   DATE STAMP (ref: "Sat —— 19 January / 2019")
═══════════════════════════════════════════ */
function stampDates() {
  const now = new Date();
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];
  const day   = days[now.getDay()];
  const date  = `${now.getDate()} ${months[now.getMonth()]}`;
  const year  = now.getFullYear();

  // hero
  const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  el('meta-day', day); el('meta-date', date); el('meta-year', year);
  // topbar
  el('tb-day', day); el('tb-date', date); el('tb-year', year);
}

/* ═══════════════════════════════════════════
   CANVAS MANAGER
═══════════════════════════════════════════ */
const Canvas = (() => {
  let fc = null;

  function init() {
    const area = document.getElementById('canvas-wrap');
    fc = new fabric.Canvas('main-canvas', {
      selection: true,
      backgroundColor: 'transparent',
      preserveObjectStacking: true,
    });
    resize();
    window.addEventListener('resize', resize);

    // Double-click → 3D modal
    fc.on('mouse:dblclick', opt => {
      if (opt.target?._sd) Modal3D.open(opt.target._sd);
    });

    // Track rotation in status bar
    fc.on('object:rotating', opt => {
      if (opt.target) {
        document.getElementById('status-rotation').textContent =
          Math.round(opt.target.angle) + '°';
      }
    });

    fc.on('object:modified', () => { Insights.update(); PlacedList.update(); });
    fc.on('object:removed',  () => { Insights.update(); PlacedList.update(); });

    // Calibration clicks
    fc.on('mouse:down', opt => {
      const phase = State.get('calPhase');
      if (phase === 1) {
        const p = fc.getPointer(opt.e);
        State.set('calPt1', p);
        Calibration.drawMarker(p, 'A');
        State.set('calPhase', 2);
        document.getElementById('cal-step').textContent = 'Click Point B on the same wall';
      } else if (phase === 2) {
        const p = fc.getPointer(opt.e);
        State.set('calPt2', p);
        Calibration.drawMarker(p, 'B');
        Calibration.drawMeasureLine();
        State.set('calPhase', 3);
        Calibration.openModal();
      }
    });
  }

  function resize() {
    if (!fc) return;
    const wrap = document.getElementById('canvas-wrap');
    const status = document.getElementById('canvas-status');
    fc.setWidth(wrap.clientWidth);
    fc.setHeight(wrap.clientHeight - status.offsetHeight);
    fc.renderAll();
  }

  function getFC() { return fc; }

  function loadImage(file) {
    const reader = new FileReader();
    reader.onload = e => {
      fabric.Image.fromURL(e.target.result, img => {
        const wrap = document.getElementById('canvas-wrap');
        const w = wrap.clientWidth;
        const h = wrap.clientHeight - 32;
        const scale = Math.min(w / img.width, h / img.height) * 0.9;

        img.set({
          left: (w - img.width * scale) / 2,
          top:  (h - img.height * scale) / 2,
          scaleX: scale, scaleY: scale,
          selectable: false, evented: false,
          opacity: 0.7,
        });
        fc.clear();
        fc.add(img);
        fc.sendToBack(img);
        fc.renderAll();
        State.update({ floorPlanLoaded: true, floorAreaM2: Math.round(img.width * scale * img.height * scale / 10000) });
        document.getElementById('upload-overlay').classList.add('hidden');
        Insights.update();
      });
    };
    reader.readAsDataURL(file);
  }

  function loadDemo() {
    const wrap = document.getElementById('canvas-wrap');
    const W = wrap.clientWidth, H = wrap.clientHeight - 32;
    fc.clear();

    // Outer boundary
    const outer = [
      [60, 50], [W-60, 50], [W-60, H-50], [60, H-50], [60, 50]
    ];
    // Inner walls
    const walls = [
      [[60 + (W-120)*0.32, 50], [60 + (W-120)*0.32, H-50]],
      [[60, 50+(H-100)*0.5], [60+(W-120)*0.32, 50+(H-100)*0.5]],
      [[60+(W-120)*0.32, 50+(H-100)*0.38], [W-60, 50+(H-100)*0.38]],
      [[60+(W-120)*0.62, 50], [60+(W-120)*0.62, 50+(H-100)*0.38]],
    ];

    const wallStyle = { stroke: 'rgba(20,20,20,0.7)', strokeWidth: 1.5, selectable: false, evented: false };
    const thinStyle = { stroke: 'rgba(20,20,20,0.45)', strokeWidth: 1, selectable: false, evented: false };

    // draw outer walls as polyline
    for (let i = 0; i < outer.length - 1; i++) {
      fc.add(new fabric.Line([...outer[i], ...outer[i+1]], wallStyle));
    }
    walls.forEach(([a, b]) => fc.add(new fabric.Line([...a, ...b], thinStyle)));

    // door symbols
    const doors = [
      { x: 60+(W-120)*0.32, y: 50+(H-100)*0.25, r: 25, startAngle: -90, endAngle: 0 },
    ];
    doors.forEach(d => {
      const arc = new fabric.Circle({
        left: d.x - d.r, top: d.y - d.r, radius: d.r,
        startAngle: d.startAngle, endAngle: d.endAngle,
        stroke: 'rgba(20,20,20,0.4)', strokeWidth: 0.8,
        fill: 'transparent', selectable: false, evented: false,
      });
      fc.add(arc);
    });

    // dimension line at bottom
    fc.add(new fabric.Line([60, H-30, W-60, H-30], {
      stroke: 'rgba(20,20,20,0.3)', strokeWidth: 0.8,
      strokeDashArray: [5, 4], selectable: false, evented: false,
    }));
    fc.add(new fabric.Text('12 000 mm', {
      left: W/2, top: H-26,
      fontSize: 9, fill: 'rgba(20,20,20,0.45)',
      fontFamily: 'JetBrains Mono, monospace',
      originX: 'center', selectable: false, evented: false,
    }));

    // room labels
    const labels = [
      { t: 'OPEN WORKSPACE', x: 60+(W-120)*0.16, y: H*0.28 },
      { t: 'FOCUS ZONE',     x: 60+(W-120)*0.16, y: H*0.7  },
      { t: 'MEETING HUB',    x: 60+(W-120)*0.65, y: H*0.2  },
      { t: 'COLLAB AREA',    x: 60+(W-120)*0.65, y: H*0.65 },
    ];
    labels.forEach(({ t, x, y }) => {
      fc.add(new fabric.Text(t, {
        left: x, top: y, fontSize: 8,
        fill: 'rgba(20,20,20,0.3)',
        fontFamily: 'JetBrains Mono, monospace',
        selectable: false, evented: false, originX: 'center', originY: 'center',
      }));
    });

    fc.renderAll();
    State.update({ floorPlanLoaded: true, floorAreaM2: 280 });
    document.getElementById('upload-overlay').classList.add('hidden');
    Insights.update();
  }

  function addElement(data, dropX, dropY) {
    // Blueprint wireframe style — no fill, 1px stroke
    const W = Math.max(70, Math.min(data.w * 1.2, 180));
    const H = Math.max(55, Math.min(data.h * 1.2, 140));

    const rect = new fabric.Rect({
      width: W, height: H,
      fill: 'transparent',
      stroke: 'rgba(20,20,20,0.8)',
      strokeWidth: 1,
    });

    // diagonal construction lines (blueprint feel)
    const diag1 = new fabric.Line([0, 0, W, H], {
      stroke: 'rgba(20,20,20,0.15)', strokeWidth: 0.5,
    });
    const diag2 = new fabric.Line([W, 0, 0, H], {
      stroke: 'rgba(20,20,20,0.15)', strokeWidth: 0.5,
    });

    const labelText = new fabric.Text(data.label.toUpperCase(), {
      left: W/2, top: H/2 - 7,
      fontSize: 7.5,
      fontFamily: 'JetBrains Mono, monospace',
      fill: 'rgba(20,20,20,0.7)',
      originX: 'center', originY: 'center',
      letterSpacing: 20,
    });
    const seatText = new fabric.Text(`${data.seats} SEAT${data.seats > 1 ? 'S' : ''}`, {
      left: W/2, top: H/2 + 6,
      fontSize: 6.5,
      fontFamily: 'JetBrains Mono, monospace',
      fill: 'rgba(20,20,20,0.4)',
      originX: 'center', originY: 'center',
    });

    const group = new fabric.Group([rect, diag1, diag2, labelText, seatText], {
      left: dropX - W/2,
      top:  dropY - H/2,
      hasControls: true,
      hasBorders: true,
      cornerSize: 5,
      cornerColor: '#141414',
      borderColor: '#141414',
      cornerStyle: 'rect',
      transparentCorners: true,
    });

    const id = `el-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    group._sd = { ...data, id };
    group._eid = id;

    fc.add(group);
    fc.setActiveObject(group);
    fc.renderAll();

    const placed = State.get('placed');
    placed.push({ id, type: data.type, label: data.label, seats: data.seats, area: data.area, kind: data.kind, obj: group });
    State.set('placed', placed);
    Insights.update();
    PlacedList.update();
  }

  function removeById(id) {
    const placed = State.get('placed');
    const el = placed.find(e => e.id === id);
    if (el) {
      fc.remove(el.obj);
      State.set('placed', placed.filter(e => e.id !== id));
      fc.renderAll();
      Insights.update();
      PlacedList.update();
    }
  }

  return { init, getFC, loadImage, loadDemo, addElement, removeById };
})();

/* ═══════════════════════════════════════════
   CALIBRATION
═══════════════════════════════════════════ */
const Calibration = (() => {
  let markers = [];

  function start() {
    State.update({ calPhase: 1, calPt1: null, calPt2: null });
    document.getElementById('cal-bar').classList.remove('hidden');
    document.getElementById('cal-step').textContent = 'Click Point A on a known wall';
    Canvas.getFC().discardActiveObject();
    Canvas.getFC().defaultCursor = 'crosshair';
    Canvas.getFC().renderAll();
  }

  function drawMarker(p, label) {
    const fc = Canvas.getFC();
    const circ = new fabric.Circle({
      radius: 4, left: p.x-4, top: p.y-4,
      fill: '#141414', stroke: 'none',
      selectable: false, evented: false, _cal: true,
    });
    const txt = new fabric.Text(label, {
      left: p.x+7, top: p.y-9,
      fontSize: 9, fill: '#141414',
      fontFamily: 'JetBrains Mono, monospace',
      selectable: false, evented: false, _cal: true,
    });
    fc.add(circ, txt);
    fc.renderAll();
    markers.push(circ, txt);
  }

  function drawMeasureLine() {
    const fc = Canvas.getFC();
    const p1 = State.get('calPt1'), p2 = State.get('calPt2');
    const line = new fabric.Line([p1.x, p1.y, p2.x, p2.y], {
      stroke: '#141414', strokeWidth: 1, strokeDashArray: [5, 3],
      selectable: false, evented: false, _cal: true,
    });
    fc.add(line);
    fc.renderAll();
    markers.push(line);
  }

  function openModal() {
    const p1 = State.get('calPt1'), p2 = State.get('calPt2');
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const px = Math.sqrt(dx*dx + dy*dy).toFixed(1);
    document.getElementById('cal-px-info').textContent = `Pixel distance: ${px}px`;
    document.getElementById('cal-mm-input').value = '';
    document.getElementById('modal-cal').classList.remove('hidden');
  }

  function confirmScale(mm) {
    const p1 = State.get('calPt1'), p2 = State.get('calPt2');
    const dx = p2.x - p1.x, dy = p2.y - p1.y;
    const px = Math.sqrt(dx*dx + dy*dy);
    const ratio = px / mm;
    State.set('pixelsPerMm', ratio);

    document.getElementById('scale-display').textContent = ratio.toFixed(4);
    document.getElementById('status-scale').textContent = ratio.toFixed(3) + ' px/mm';
    document.getElementById('recalibrate-btn').classList.remove('hidden');

    cleanup();
    document.getElementById('modal-cal').classList.add('hidden');
    document.getElementById('cal-bar').classList.add('hidden');
  }

  function cleanup() {
    const fc = Canvas.getFC();
    fc.getObjects().filter(o => o._cal).forEach(o => fc.remove(o));
    State.update({ calPhase: 0 });
    fc.defaultCursor = 'default';
    fc.renderAll();
    markers = [];
  }

  function cancel() {
    cleanup();
    document.getElementById('cal-bar').classList.add('hidden');
    document.getElementById('modal-cal').classList.add('hidden');
  }

  return { start, drawMarker, drawMeasureLine, openModal, confirmScale, cancel };
})();

/* ═══════════════════════════════════════════
   INSIGHTS
═══════════════════════════════════════════ */
const Insights = {
  update() {
    const placed = State.get('placed');
    const seats = placed.reduce((s, e) => s + e.seats, 0);
    const floorM2 = State.get('floorAreaM2') || 0;

    document.getElementById('metric-headcount').textContent = seats;
    document.getElementById('metric-count').textContent = placed.length;

    if (floorM2 > 0 && seats > 0) {
      const r = (floorM2 / seats).toFixed(1);
      document.getElementById('metric-ratio').textContent = `1 : ${r}`;
      document.getElementById('metric-ratio-sub').textContent = `per seat / ${floorM2} m²`;
    } else {
      document.getElementById('metric-ratio').textContent = '—';
      document.getElementById('metric-ratio-sub').textContent = 'seats vs floor area';
    }

    const fSeats = placed.filter(e => e.kind === 'focus').reduce((s,e) => s+e.seats, 0);
    const cSeats = placed.filter(e => e.kind === 'collaborative').reduce((s,e) => s+e.seats, 0);
    const total = fSeats + cSeats || 1;
    const fPct = Math.round(fSeats / total * 100);
    const cPct = Math.round(cSeats / total * 100);

    document.getElementById('pct-focus').textContent = `${fPct}%`;
    document.getElementById('pct-collab').textContent = `${cPct}%`;
    document.getElementById('bar-focus').style.width = `${fPct}%`;
    document.getElementById('bar-collab').style.width = `${cPct}%`;
  }
};

/* ═══════════════════════════════════════════
   PLACED LIST
═══════════════════════════════════════════ */
const PlacedList = {
  update() {
    const placed = State.get('placed');
    const el = document.getElementById('placed-list');
    if (!placed.length) {
      el.innerHTML = '<div class="placed-empty">No elements placed yet.</div>';
      return;
    }
    el.innerHTML = placed.map(p => `
      <div class="placed-item">
        <span class="placed-item-name">${p.label}</span>
        <span class="placed-item-remove" data-id="${p.id}">✕</span>
      </div>`).join('');
    el.querySelectorAll('.placed-item-remove').forEach(btn => {
      btn.addEventListener('click', e => Canvas.removeById(e.target.dataset.id));
    });
  }
};

/* ═══════════════════════════════════════════
   MODAL 3D — wireframe/hidden-line SVGs
   pCon technical illustration style
═══════════════════════════════════════════ */
const Modal3D = (() => {
  // All SVGs: hidden-line wireframe (thin strokes, dashed hidden lines, construction)
  const PREVIEWS = {
    'focus-1pax': {
      svg: `<svg viewBox="0 0 480 300" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
  <!-- Construction crosshairs -->
  <line x1="240" y1="10" x2="240" y2="290" stroke="rgba(20,20,20,0.08)" stroke-width="0.5"/>
  <line x1="10" y1="150" x2="470" y2="150" stroke="rgba(20,20,20,0.08)" stroke-width="0.5"/>
  <!-- Floor plane (isometric) -->
  <polygon points="100,200 240,255 380,200 240,145" stroke="rgba(20,20,20,0.2)" stroke-width="0.8" fill="rgba(20,20,20,0.02)"/>
  <!-- Left wall -->
  <polygon points="100,90 100,200 240,255 240,145" stroke="rgba(20,20,20,0.35)" stroke-width="1" fill="rgba(20,20,20,0.04)"/>
  <!-- Right wall -->
  <polygon points="240,145 240,255 380,200 380,90" stroke="rgba(20,20,20,0.25)" stroke-width="1" fill="rgba(20,20,20,0.02)"/>
  <!-- Ceiling (hidden dashed) -->
  <polygon points="100,90 240,145 380,90 240,35" stroke="rgba(20,20,20,0.2)" stroke-width="0.6" stroke-dasharray="4,3" fill="none"/>
  <!-- Desk — hidden-line wireframe -->
  <rect x="140" y="180" width="80" height="40" stroke="rgba(20,20,20,0.7)" stroke-width="0.9" fill="none" transform="skewX(-20) translate(20,0)"/>
  <line x1="130" y1="195" x2="130" y2="215" stroke="rgba(20,20,20,0.5)" stroke-width="0.8"/>
  <line x1="200" y1="180" x2="200" y2="200" stroke="rgba(20,20,20,0.5)" stroke-width="0.8" stroke-dasharray="3,2"/>
  <!-- Chair -->
  <ellipse cx="160" cy="218" rx="15" ry="8" stroke="rgba(20,20,20,0.6)" stroke-width="0.8" fill="none"/>
  <line x1="160" y1="226" x2="160" y2="240" stroke="rgba(20,20,20,0.4)" stroke-width="0.8"/>
  <!-- Monitor -->
  <rect x="195" y="168" width="22" height="16" stroke="rgba(20,20,20,0.7)" stroke-width="0.8" fill="rgba(20,20,20,0.05)" transform="skewX(-20) translate(20,0)"/>
  <!-- Hidden construction lines -->
  <line x1="100" y1="90" x2="240" y2="35" stroke="rgba(20,20,20,0.15)" stroke-width="0.5" stroke-dasharray="3,3"/>
  <line x1="380" y1="90" x2="240" y2="35" stroke="rgba(20,20,20,0.15)" stroke-width="0.5" stroke-dasharray="3,3"/>
  <!-- Dimension lines -->
  <line x1="100" y1="270" x2="240" y2="270" stroke="rgba(20,20,20,0.25)" stroke-width="0.6"/>
  <line x1="100" y1="266" x2="100" y2="274" stroke="rgba(20,20,20,0.25)" stroke-width="0.6"/>
  <line x1="240" y1="266" x2="240" y2="274" stroke="rgba(20,20,20,0.25)" stroke-width="0.6"/>
  <text x="170" y="282" font-size="8" fill="rgba(20,20,20,0.4)" font-family="JetBrains Mono">2000mm</text>
  <!-- Annotation -->
  <text x="350" y="90" font-size="7" fill="rgba(20,20,20,0.35)" font-family="JetBrains Mono">FOCUS_01</text>
  <text x="350" y="100" font-size="7" fill="rgba(20,20,20,0.35)" font-family="JetBrains Mono">4.0 m²</text>
</svg>`,
      specs: [['Area','4 m²'],['Capacity','1 person'],['Type','Focus'],['Acoustic','High']]
    },
    'focus-2pax': {
      svg: `<svg viewBox="0 0 480 300" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
  <line x1="240" y1="10" x2="240" y2="290" stroke="rgba(20,20,20,0.06)" stroke-width="0.5"/>
  <polygon points="80,200 240,258 400,200 240,142" stroke="rgba(20,20,20,0.18)" stroke-width="0.8" fill="rgba(20,20,20,0.02)"/>
  <polygon points="80,88 80,200 240,258 240,146" stroke="rgba(20,20,20,0.3)" stroke-width="1" fill="rgba(20,20,20,0.04)"/>
  <polygon points="240,146 240,258 400,200 400,88" stroke="rgba(20,20,20,0.22)" stroke-width="1" fill="rgba(20,20,20,0.02)"/>
  <polygon points="80,88 240,146 400,88 240,30" stroke="rgba(20,20,20,0.15)" stroke-width="0.6" stroke-dasharray="4,3" fill="none"/>
  <!-- Long shared desk -->
  <rect x="110" y="185" width="200" height="35" stroke="rgba(20,20,20,0.65)" stroke-width="0.9" fill="rgba(20,20,20,0.03)" transform="skewX(-18)"/>
  <!-- 2 chairs -->
  <ellipse cx="155" cy="218" rx="14" ry="7" stroke="rgba(20,20,20,0.55)" stroke-width="0.8" fill="none"/>
  <ellipse cx="265" cy="210" rx="14" ry="7" stroke="rgba(20,20,20,0.55)" stroke-width="0.8" fill="none"/>
  <!-- 2 monitors -->
  <rect x="150" y="168" width="20" height="14" stroke="rgba(20,20,20,0.65)" stroke-width="0.8" fill="rgba(20,20,20,0.04)" transform="skewX(-18)"/>
  <rect x="258" y="162" width="20" height="14" stroke="rgba(20,20,20,0.65)" stroke-width="0.8" fill="rgba(20,20,20,0.04)" transform="skewX(-18)"/>
  <line x1="110" y1="160" x2="310" y2="160" stroke="rgba(20,20,20,0.1)" stroke-width="0.5" stroke-dasharray="3,3"/>
  <text x="370" y="88" font-size="7" fill="rgba(20,20,20,0.35)" font-family="JetBrains Mono">FOCUS_02</text>
  <text x="370" y="98" font-size="7" fill="rgba(20,20,20,0.35)" font-family="JetBrains Mono">8.0 m²</text>
</svg>`,
      specs: [['Area','8 m²'],['Capacity','2 people'],['Type','Focus'],['Layout','Side-by-side']]
    },
    'meeting-4pax': {
      svg: `<svg viewBox="0 0 480 300" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
  <line x1="240" y1="10" x2="240" y2="290" stroke="rgba(20,20,20,0.06)" stroke-width="0.5"/>
  <line x1="10" y1="165" x2="470" y2="165" stroke="rgba(20,20,20,0.06)" stroke-width="0.5"/>
  <polygon points="60,195 240,260 420,195 240,130" stroke="rgba(20,20,20,0.18)" stroke-width="0.8" fill="rgba(20,20,20,0.02)"/>
  <polygon points="60,80 60,195 240,260 240,145" stroke="rgba(20,20,20,0.3)" stroke-width="1" fill="rgba(20,20,20,0.04)"/>
  <polygon points="240,145 240,260 420,195 420,80" stroke="rgba(20,20,20,0.22)" stroke-width="1" fill="rgba(20,20,20,0.02)"/>
  <polygon points="60,80 240,145 420,80 240,15" stroke="rgba(20,20,20,0.12)" stroke-width="0.6" stroke-dasharray="4,3" fill="none"/>
  <!-- Meeting table (isometric ellipse) -->
  <ellipse cx="240" cy="198" rx="75" ry="32" stroke="rgba(20,20,20,0.65)" stroke-width="1" fill="rgba(20,20,20,0.03)"/>
  <!-- Table edge line -->
  <ellipse cx="240" cy="202" rx="75" ry="32" stroke="rgba(20,20,20,0.2)" stroke-width="0.5" fill="none" stroke-dasharray="3,2"/>
  <!-- 4 chairs -->
  <ellipse cx="240" cy="163" rx="14" ry="6" stroke="rgba(20,20,20,0.55)" stroke-width="0.8" fill="none"/>
  <ellipse cx="240" cy="235" rx="14" ry="6" stroke="rgba(20,20,20,0.55)" stroke-width="0.8" fill="none"/>
  <ellipse cx="175" cy="196" rx="7" ry="14" stroke="rgba(20,20,20,0.55)" stroke-width="0.8" fill="none"/>
  <ellipse cx="305" cy="196" rx="7" ry="14" stroke="rgba(20,20,20,0.55)" stroke-width="0.8" fill="none"/>
  <!-- Display wall -->
  <rect x="140" y="88" width="110" height="65" stroke="rgba(20,20,20,0.5)" stroke-width="0.9" fill="rgba(20,20,20,0.06)"/>
  <line x1="140" y1="88" x2="250" y2="153" stroke="rgba(20,20,20,0.1)" stroke-width="0.5"/>
  <line x1="250" y1="88" x2="140" y2="153" stroke="rgba(20,20,20,0.1)" stroke-width="0.5"/>
  <text x="370" y="78" font-size="7" fill="rgba(20,20,20,0.35)" font-family="JetBrains Mono">MTG_04</text>
  <text x="370" y="88" font-size="7" fill="rgba(20,20,20,0.35)" font-family="JetBrains Mono">16.0 m²</text>
</svg>`,
      specs: [['Area','16 m²'],['Capacity','4 people'],['Type','Collaborative'],['Display','65″ Screen']]
    },
    'meeting-6pax': {
      svg: `<svg viewBox="0 0 480 300" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
  <polygon points="50,195 240,262 430,195 240,128" stroke="rgba(20,20,20,0.18)" stroke-width="0.8" fill="rgba(20,20,20,0.02)"/>
  <polygon points="50,75 50,195 240,262 240,142" stroke="rgba(20,20,20,0.3)" stroke-width="1" fill="rgba(20,20,20,0.04)"/>
  <polygon points="240,142 240,262 430,195 430,75" stroke="rgba(20,20,20,0.22)" stroke-width="1" fill="rgba(20,20,20,0.02)"/>
  <polygon points="50,75 240,142 430,75 240,8" stroke="rgba(20,20,20,0.12)" stroke-width="0.6" stroke-dasharray="4,3" fill="none"/>
  <!-- Table -->
  <ellipse cx="240" cy="198" rx="85" ry="36" stroke="rgba(20,20,20,0.6)" stroke-width="1" fill="rgba(20,20,20,0.03)"/>
  <!-- 6 chairs -->
  <ellipse cx="240" cy="158" rx="14" ry="6" stroke="rgba(20,20,20,0.5)" stroke-width="0.8" fill="none"/>
  <ellipse cx="240" cy="240" rx="14" ry="6" stroke="rgba(20,20,20,0.5)" stroke-width="0.8" fill="none"/>
  <ellipse cx="170" cy="180" rx="7" ry="13" stroke="rgba(20,20,20,0.5)" stroke-width="0.8" fill="none"/>
  <ellipse cx="310" cy="180" rx="7" ry="13" stroke="rgba(20,20,20,0.5)" stroke-width="0.8" fill="none"/>
  <ellipse cx="165" cy="210" rx="7" ry="13" stroke="rgba(20,20,20,0.5)" stroke-width="0.8" fill="none"/>
  <ellipse cx="315" cy="210" rx="7" ry="13" stroke="rgba(20,20,20,0.5)" stroke-width="0.8" fill="none"/>
  <!-- Screen -->
  <rect x="145" y="82" width="100" height="60" stroke="rgba(20,20,20,0.5)" stroke-width="0.9" fill="rgba(20,20,20,0.06)"/>
  <text x="370" y="75" font-size="7" fill="rgba(20,20,20,0.35)" font-family="JetBrains Mono">POD_06</text>
  <text x="370" y="85" font-size="7" fill="rgba(20,20,20,0.35)" font-family="JetBrains Mono">24.0 m²</text>
</svg>`,
      specs: [['Area','24 m²'],['Capacity','6 people'],['Type','Collaborative'],['Display','75″ Screen']]
    },
    'boardroom-12pax': {
      svg: `<svg viewBox="0 0 480 300" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
  <polygon points="30,195 240,265 450,195 240,125" stroke="rgba(20,20,20,0.18)" stroke-width="0.8" fill="rgba(20,20,20,0.02)"/>
  <polygon points="30,70 30,195 240,265 240,140" stroke="rgba(20,20,20,0.3)" stroke-width="1" fill="rgba(20,20,20,0.04)"/>
  <polygon points="240,140 240,265 450,195 450,70" stroke="rgba(20,20,20,0.22)" stroke-width="1" fill="rgba(20,20,20,0.02)"/>
  <polygon points="30,70 240,140 450,70 240,0" stroke="rgba(20,20,20,0.12)" stroke-width="0.6" stroke-dasharray="4,3" fill="none"/>
  <!-- Long boardroom table -->
  <rect x="120" y="172" width="240" height="44" stroke="rgba(20,20,20,0.65)" stroke-width="1" fill="rgba(20,20,20,0.04)" transform="skewX(-15)"/>
  <!-- 12 chair positions (simplified) -->
  ${[0,1,2,3].map(i=>`<ellipse cx="${145+i*50}" cy="${164}" rx="12" ry="5" stroke="rgba(20,20,20,0.45)" stroke-width="0.7" fill="none"/>`).join('')}
  ${[0,1,2,3].map(i=>`<ellipse cx="${155+i*50}" cy="${222}" rx="12" ry="5" stroke="rgba(20,20,20,0.45)" stroke-width="0.7" fill="none"/>`).join('')}
  <ellipse cx="100" cy="192" rx="5" ry="12" stroke="rgba(20,20,20,0.45)" stroke-width="0.7" fill="none"/>
  <ellipse cx="375" cy="192" rx="5" ry="12" stroke="rgba(20,20,20,0.45)" stroke-width="0.7" fill="none"/>
  <!-- Display wall -->
  <rect x="110" y="75" width="130" height="78" stroke="rgba(20,20,20,0.5)" stroke-width="0.9" fill="rgba(20,20,20,0.06)"/>
  <!-- construction diagonals on display -->
  <line x1="110" y1="75" x2="240" y2="153" stroke="rgba(20,20,20,0.1)" stroke-width="0.5"/>
  <line x1="240" y1="75" x2="110" y2="153" stroke="rgba(20,20,20,0.1)" stroke-width="0.5"/>
  <text x="380" y="68" font-size="7" fill="rgba(20,20,20,0.35)" font-family="JetBrains Mono">BOARD_12</text>
  <text x="380" y="78" font-size="7" fill="rgba(20,20,20,0.35)" font-family="JetBrains Mono">48.0 m²</text>
</svg>`,
      specs: [['Area','48 m²'],['Capacity','12 people'],['Type','Collaborative'],['AV','Full Suite']]
    },
    'lounge': {
      svg: `<svg viewBox="0 0 480 300" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
  <polygon points="70,195 240,258 410,195 240,132" stroke="rgba(20,20,20,0.18)" stroke-width="0.8" fill="rgba(20,20,20,0.02)"/>
  <polygon points="70,82 70,195 240,258 240,145" stroke="rgba(20,20,20,0.3)" stroke-width="1" fill="rgba(20,20,20,0.04)"/>
  <polygon points="240,145 240,258 410,195 410,82" stroke="rgba(20,20,20,0.22)" stroke-width="1" fill="rgba(20,20,20,0.02)"/>
  <!-- L-shaped sofa (wireframe) -->
  <path d="M115 220 Q115 190 135 188 L235 188 Q255 188 255 208 L255 228 L115 228Z" stroke="rgba(20,20,20,0.6)" stroke-width="0.9" fill="rgba(20,20,20,0.03)"/>
  <path d="M115 228 L115 200 L138 200 L138 228" stroke="rgba(20,20,20,0.5)" stroke-width="0.8" fill="rgba(20,20,20,0.03)"/>
  <!-- Coffee table -->
  <ellipse cx="200" cy="215" rx="28" ry="14" stroke="rgba(20,20,20,0.55)" stroke-width="0.9" fill="rgba(20,20,20,0.03)"/>
  <!-- Second seating -->
  <path d="M270 188 L340 172 L340 192 L270 208Z" stroke="rgba(20,20,20,0.5)" stroke-width="0.8" fill="rgba(20,20,20,0.03)"/>
  <!-- Plant schematic -->
  <line x1="330" y1="165" x2="330" y2="188" stroke="rgba(20,20,20,0.3)" stroke-width="0.8"/>
  <circle cx="330" cy="158" r="10" stroke="rgba(20,20,20,0.4)" stroke-width="0.8" fill="none"/>
  <text x="360" y="82" font-size="7" fill="rgba(20,20,20,0.35)" font-family="JetBrains Mono">LGNG_06</text>
  <text x="360" y="92" font-size="7" fill="rgba(20,20,20,0.35)" font-family="JetBrains Mono">20.0 m²</text>
</svg>`,
      specs: [['Area','20 m²'],['Capacity','6 people'],['Type','Breakout'],['Style','Lounge']]
    },
    'phone-booth': {
      svg: `<svg viewBox="0 0 480 300" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
  <line x1="240" y1="10" x2="240" y2="290" stroke="rgba(20,20,20,0.06)" stroke-width="0.5"/>
  <!-- Narrow booth — all 6 faces wireframe -->
  <polygon points="180,220 240,248 300,220 240,192" stroke="rgba(20,20,20,0.2)" stroke-width="0.8" fill="rgba(20,20,20,0.02)"/>
  <polygon points="180,60 180,220 240,248 240,88" stroke="rgba(20,20,20,0.35)" stroke-width="1" fill="rgba(20,20,20,0.04)"/>
  <polygon points="240,88 240,248 300,220 300,60" stroke="rgba(20,20,20,0.25)" stroke-width="1" fill="rgba(20,20,20,0.02)"/>
  <polygon points="180,60 240,88 300,60 240,32" stroke="rgba(20,20,20,0.18)" stroke-width="0.6" stroke-dasharray="4,3" fill="none"/>
  <!-- Seat ledge -->
  <rect x="195" y="215" width="40" height="10" stroke="rgba(20,20,20,0.55)" stroke-width="0.8" fill="rgba(20,20,20,0.04)"/>
  <!-- Shelf -->
  <rect x="198" y="165" width="36" height="6" stroke="rgba(20,20,20,0.45)" stroke-width="0.7" fill="rgba(20,20,20,0.03)"/>
  <!-- Acoustic panel grid -->
  ${[0,1,2,3,4].map(i=>`<line x1="185" y1="${88+i*28}" x2="232" y2="${100+i*28}" stroke="rgba(20,20,20,0.1)" stroke-width="0.5" stroke-dasharray="2,3"/>`).join('')}
  <!-- Door outline -->
  <line x1="240" y1="88" x2="240" y2="248" stroke="rgba(20,20,20,0.3)" stroke-width="0.6" stroke-dasharray="4,3"/>
  <text x="310" y="60" font-size="7" fill="rgba(20,20,20,0.35)" font-family="JetBrains Mono">BOOTH_01</text>
  <text x="310" y="70" font-size="7" fill="rgba(20,20,20,0.35)" font-family="JetBrains Mono">2.0 m²</text>
</svg>`,
      specs: [['Area','2 m²'],['Capacity','1 person'],['Type','Focus'],['Acoustic','Isolated']]
    },
  };

  function open(data) {
    const p = PREVIEWS[data.type] || PREVIEWS['meeting-4pax'];
    document.getElementById('modal-title').textContent = data.label;
    document.getElementById('modal-viewport').innerHTML = p.svg;
    document.getElementById('modal-specs').innerHTML = p.specs.map(([l,v]) => `
      <div class="spec-cell">
        <span class="spec-label">${l}</span>
        <span class="spec-value">${v}</span>
      </div>`).join('');
    document.getElementById('modal-3d').classList.remove('hidden');
  }

  function close() { document.getElementById('modal-3d').classList.add('hidden'); }

  return { open, close };
})();

/* ═══════════════════════════════════════════
   DRAG & DROP
═══════════════════════════════════════════ */
const DragDrop = (() => {
  let dragData = null;

  function init() {
    document.querySelectorAll('.lib-item').forEach(item => {
      item.addEventListener('dragstart', e => {
        dragData = {
          type: item.dataset.type,
          label: item.dataset.label,
          seats: parseInt(item.dataset.seats),
          area: parseInt(item.dataset.area),
          kind: item.dataset.kind,
          w: parseInt(item.dataset.w),
          h: parseInt(item.dataset.h),
        };
        e.dataTransfer.effectAllowed = 'copy';
        item.style.opacity = '0.5';
      });
      item.addEventListener('dragend', () => { item.style.opacity = '1'; });
    });

    const wrap = document.getElementById('canvas-wrap');
    wrap.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    wrap.addEventListener('drop', e => {
      e.preventDefault();
      if (!dragData || !State.get('floorPlanLoaded')) return;
      const rect = wrap.getBoundingClientRect();
      const status = document.getElementById('canvas-status');
      Canvas.addElement(dragData, e.clientX - rect.left, e.clientY - rect.top - status.offsetHeight / 2);
      dragData = null;
    });
  }

  return { init };
})();

/* ═══════════════════════════════════════════
   TOOLS
═══════════════════════════════════════════ */
const Tools = {
  init() {
    document.querySelectorAll('.tool-row').forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;

        if (tool === 'calibrate') {
          if (!State.get('floorPlanLoaded')) { alert('Upload a floor plan first.'); return; }
          setActive(btn);
          Calibration.start();
          return;
        }
        if (tool === 'delete') {
          const active = Canvas.getFC().getActiveObject();
          if (active?._eid) Canvas.removeById(active._eid);
          return;
        }
        if (tool === 'rotate') {
          const active = Canvas.getFC().getActiveObject();
          if (active) { active.rotate((active.angle + 45) % 360); Canvas.getFC().renderAll(); }
          return;
        }
        setActive(btn);
        State.set('activeTool', tool);
      });
    });

    function setActive(target) {
      document.querySelectorAll('.tool-row').forEach(b => b.classList.remove('active'));
      target.classList.add('active');
    }
  }
};

/* ═══════════════════════════════════════════
   EXPORT
═══════════════════════════════════════════ */
const Exporter = {
  run() {
    const placed = State.get('placed');
    const json = {
      timestamp: new Date().toISOString(),
      scale_px_per_mm: State.get('pixelsPerMm'),
      floor_area_m2: State.get('floorAreaM2'),
      total_headcount: placed.reduce((s, e) => s + e.seats, 0),
      elements: placed.map(el => ({
        id: el.id, type: el.type, label: el.label,
        seats: el.seats, area_m2: el.area, kind: el.kind,
        position: {
          left: Math.round(el.obj.left),
          top: Math.round(el.obj.top),
          angle: Math.round(el.obj.angle || 0),
        }
      }))
    };
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(blob),
      download: `workplace-plan-${Date.now()}.json`
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }
};

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  stampDates();
  Canvas.init();
  Tools.init();
  DragDrop.init();

  function showApp() {
    document.getElementById('hero-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    window.dispatchEvent(new Event('resize'));
  }

  // Hero buttons
  document.getElementById('hero-upload-btn').addEventListener('click', () => {
    document.getElementById('hero-file-input').click();
  });
  document.getElementById('hero-file-input').addEventListener('change', e => {
    if (e.target.files[0]) { showApp(); setTimeout(() => Canvas.loadImage(e.target.files[0]), 80); }
  });
  document.getElementById('hero-demo-btn').addEventListener('click', () => {
    showApp(); setTimeout(() => Canvas.loadDemo(), 80);
  });

  // Upload overlay
  document.getElementById('file-input').addEventListener('change', e => {
    if (e.target.files[0]) Canvas.loadImage(e.target.files[0]);
  });
  const dz = document.getElementById('drop-zone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault(); dz.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f?.type.startsWith('image/')) Canvas.loadImage(f);
  });

  // Calibration controls
  document.getElementById('recalibrate-btn')?.addEventListener('click', () => {
    State.set('pixelsPerMm', null);
    document.getElementById('scale-display').textContent = '—';
    document.getElementById('status-scale').textContent = 'Not calibrated';
    document.getElementById('recalibrate-btn').classList.add('hidden');
    Calibration.start();
  });
  document.getElementById('cal-cancel')?.addEventListener('click', Calibration.cancel);

  // Cal modal
  document.getElementById('modal-cal-confirm').addEventListener('click', () => {
    const v = parseFloat(document.getElementById('cal-mm-input').value);
    if (!v || v <= 0) { alert('Enter a valid dimension in mm.'); return; }
    Calibration.confirmScale(v);
  });
  document.getElementById('modal-cal-cancel').addEventListener('click', Calibration.cancel);
  document.getElementById('modal-cal-close').addEventListener('click', Calibration.cancel);
  document.getElementById('modal-cal-scrim').addEventListener('click', Calibration.cancel);

  // 3D modal
  document.getElementById('modal-close').addEventListener('click', Modal3D.close);
  document.getElementById('modal-scrim').addEventListener('click', Modal3D.close);

  // Clear all / Export
  document.getElementById('clear-all-btn').addEventListener('click', () => {
    if (!confirm('Remove all placed elements?')) return;
    State.get('placed').forEach(el => Canvas.getFC().remove(el.obj));
    State.set('placed', []);
    Canvas.getFC().renderAll();
    Insights.update(); PlacedList.update();
  });
  document.getElementById('export-btn').addEventListener('click', Exporter.run);

  // ESC key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { Modal3D.close(); Calibration.cancel(); }
  });
});
