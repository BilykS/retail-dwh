/**
 * The "data journey" scene: a camera flight through space, where tables float in
 * zero gravity and threads carry real values from the source systems into the
 * stars. Every visual is a function of one number, the stage position, so scrolling
 * backwards undoes everything exactly.
 */
import * as THREE from 'three';
import {
  CAMERA,
  COLOR,
  FLOWS,
  RECEIPT,
  SOURCES,
  SOURCE_KEYS,
  STAGES,
  STAR_LINKS,
  TARGETS,
  WHOLE_VIEW,
  type SourceTable,
  type TargetTable,
} from './scene-data';

type Lang = 'en' | 'uk';

const CARD_WIDTH = 300;
const HEADER = 32;
const ROW = 22;
const TEXTURE_SCALE = 3;
const SEGMENTS = 40;
const LAST = CAMERA.length - 1;
const ZOOM_MIN = Math.log(0.3);
const ZOOM_MAX = Math.log(6);
/** At this screen shape or wider, the last camera stop already fits both source systems. */
const WHOLE_FIT_ASPECT = 1.66;
const MONO = '"JetBrains Mono", Consolas, monospace';

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const ease = (t: number) => t * t * (3 - 2 * t);
const columnName = (c: [string, string]) => c[0].replace('*', '');

function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}

interface Card {
  name: string;
  isTarget: boolean;
  def: SourceTable | TargetTable;
  color?: string;
  stage: number;
  height: number;
  index: Map<string, number>;
  /** Which rows have received their value. Only target tables use it. */
  shown: Map<string, boolean> | null;
  context: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  home: THREE.Vector3;
  phase: number;
  drift: number;
}

interface Thread {
  from: Card;
  fromColumn: string;
  to: Card;
  toColumn: string;
  color: THREE.Color;
  line: THREE.Line;
  material: THREE.LineBasicMaterial;
  pill: THREE.Sprite;
  repaintPill: () => void;
  lift: number;
  wave: number;
  lag: number;
  landed: boolean;
}

interface Link {
  a: Card;
  aColumn: string;
  b: Card;
  bColumn: string;
  line: THREE.Line;
  material: THREE.LineBasicMaterial;
}

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

class JourneyScene {
  private listeners = new AbortController();
  private observer: ResizeObserver;
  private frameId = 0;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 10, 30000);
  private clock = new THREE.Clock();

  private cards = new Map<string, Card>();
  private threads: Thread[] = [];
  /** Threads landing on each target column, keyed "table.column". */
  private incoming = new Map<string, Thread[]>();
  private sourceLinks: Link[] = [];
  private starLinks: Link[] = [];
  private stars!: THREE.Points;
  private receipt!: THREE.Mesh;
  private receiptMaterial!: THREE.MeshBasicMaterial;
  private repaintReceipt!: () => void;
  private pulseGeometry = new THREE.BufferGeometry();
  private pulsePositions!: Float32Array;
  private pulseColors!: Float32Array;

  private stageNow = 0;
  private stageTarget = 0;
  private lastStage = -1;
  private time = 0;
  private calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private width = 1;
  private height = 1;
  private view = { zoom: 0, zoomT: 0, yaw: 0, yawT: 0, pitch: 0, pitchT: 0, whole: 0, wholeT: 0 };
  private mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  private pointers = new Map<number, { x: number; y: number }>();
  private pinch: { gap: number; zoom: number } | null = null;

  private camCurve = new THREE.CatmullRomCurve3(CAMERA.map((s) => new THREE.Vector3(...s.cam)), false, 'catmullrom', 0.35);
  private lookCurve = new THREE.CatmullRomCurve3(CAMERA.map((s) => new THREE.Vector3(...s.look)), false, 'catmullrom', 0.35);
  private wholeCam = new THREE.Vector3(...WHOLE_VIEW.cam);
  private wholeLook = new THREE.Vector3(...WHOLE_VIEW.look);

  // Scratch objects, reused every frame.
  private pa = new THREE.Vector3();
  private pb = new THREE.Vector3();
  private c1 = new THREE.Vector3();
  private c2 = new THREE.Vector3();
  private pt = new THREE.Vector3();
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private offset = new THREE.Vector3();
  private side = new THREE.Vector3();
  private yAxis = new THREE.Vector3(0, 1, 0);
  private dummy = new THREE.Object3D();

  constructor(
    private root: HTMLElement,
    private canvas: HTMLCanvasElement,
    private lang: Lang,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);

    this.buildStars();
    for (const [name, def] of Object.entries(SOURCES)) this.buildCard(name, def, false);
    for (const [name, def] of Object.entries(TARGETS)) this.buildCard(name, def, true);
    this.buildReceipt();
    this.buildThreads();
    this.buildPulses();

    this.wireInput();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(root);
    this.resize();
    this.setStage(0);

    // Tables are drawn to canvases, so repaint them once the fonts arrive.
    Promise.all([
      document.fonts.load(`400 34px ${MONO}`, 'Вінниця abc'),
      document.fonts.load(`500 34px ${MONO}`, 'Вінниця abc'),
    ]).then(() => this.repaintAll(), () => {});

    root.dataset.state = 'ready';
    this.frameId = requestAnimationFrame(this.frame);
  }

  destroy() {
    cancelAnimationFrame(this.frameId);
    this.listeners.abort();
    this.observer.disconnect();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const material = m.material as THREE.Material & { map?: THREE.Texture | null };
      material?.map?.dispose();
      material?.dispose();
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private $<T extends HTMLElement>(id: string) {
    return this.root.querySelector<T>(`#${id}`)!;
  }

  /* ───────────────────────────────── Build ──────────────────────────────── */

  private buildStars() {
    const n = 4200;
    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 2600 + Math.random() * 9000;
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(b) * Math.cos(a) + 500;
      positions[i * 3 + 1] = r * Math.sin(b) * Math.sin(a);
      positions[i * 3 + 2] = r * Math.cos(b) - 2200;
      const warm = Math.random() < 0.3;
      const k = 0.45 + Math.random() * 0.55;
      colors[i * 3] = k * (warm ? 1 : 0.78);
      colors[i * 3 + 1] = k * 0.84;
      colors[i * 3 + 2] = k * (warm ? 0.78 : 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const m = new THREE.PointsMaterial({ size: 11, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, map: dotTexture(), blending: THREE.AdditiveBlending });
    this.stars = new THREE.Points(g, m);
    this.stars.renderOrder = -5;
    this.scene.add(this.stars);
  }

  private buildCard(name: string, def: SourceTable | TargetTable, isTarget: boolean) {
    const height = HEADER + def.columns.length * ROW;
    const canvas = document.createElement('canvas');
    canvas.width = CARD_WIDTH * TEXTURE_SCALE;
    canvas.height = height * TEXTURE_SCALE;
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: isTarget ? 0 : def.unused ? 0.7 : 1 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(CARD_WIDTH, height), material);
    mesh.position.set(...def.position);
    mesh.renderOrder = 1;
    this.scene.add(mesh);

    const target = isTarget ? (def as TargetTable) : null;
    const card: Card = {
      name, isTarget, def, material, mesh, texture, height,
      color: target?.color,
      stage: target?.stage ?? -1,
      index: new Map(def.columns.map((c, i) => [columnName(c), i])),
      shown: isTarget ? new Map(def.columns.map((c) => [columnName(c), false])) : null,
      context: canvas.getContext('2d')!,
      home: new THREE.Vector3(...def.position),
      phase: Math.random() * Math.PI * 2,
      drift: 5 + Math.random() * 7,
    };
    this.cards.set(name, card);
    this.paintCard(card);
  }

  private paintCard(t: Card) {
    const S = TEXTURE_SCALE;
    const x = t.context;
    const w = CARD_WIDTH * S;
    const h = t.height * S;
    const def = t.def;
    const fact = (def as TargetTable).fact;

    x.clearRect(0, 0, w, h);
    x.fillStyle = def.unused ? 'rgba(14,17,30,.42)' : 'rgba(13,17,33,.9)';
    x.fillRect(0, 0, w, h);
    x.fillStyle = t.color ? withAlpha(t.color, 0.2) : 'rgba(190,200,235,.08)';
    x.fillRect(0, 0, w, HEADER * S);
    x.strokeStyle = t.color ?? 'rgba(190,200,235,.4)';
    x.lineWidth = (fact ? 2 : 1) * S;
    x.strokeRect(x.lineWidth / 2, x.lineWidth / 2, w - x.lineWidth, h - x.lineWidth);

    x.textBaseline = 'middle';
    x.fillStyle = def.unused ? '#8A91A8' : '#F1F3FA';
    x.font = `500 ${13 * S}px ${MONO}`;
    x.textAlign = 'left';
    x.fillText(t.name, 10 * S, (HEADER / 2) * S);
    x.fillStyle = '#7C849E';
    x.font = `400 ${11.5 * S}px ${MONO}`;
    x.textAlign = 'right';
    x.fillText(def.rows, (CARD_WIDTH - 10) * S, (HEADER / 2) * S);

    def.columns.forEach((col, i) => {
      const y = (HEADER + i * ROW + ROW / 2) * S;
      const key = col[0].endsWith('*');
      const name = columnName(col);
      const on = !t.shown || t.shown.get(name);
      x.textAlign = 'left';
      x.font = `${key ? 500 : 400} ${11.5 * S}px ${MONO}`;
      x.fillStyle = def.unused ? '#6E7691' : on ? (key ? '#F1F3FA' : '#A7AEC4') : '#4A5068';
      x.fillText(name, 10 * S, y);
      if (on && col[1]) {
        x.textAlign = 'right';
        x.font = `400 ${11.5 * S}px ${MONO}`;
        x.fillStyle = def.unused || col[1] === 'null' ? '#6E7691' : (t.color ?? '#9DB1FF');
        x.fillText(col[1], (CARD_WIDTH - 10) * S, y);
      }
    });
    t.texture.needsUpdate = true;
  }

  private buildReceipt() {
    const S = TEXTURE_SCALE;
    const canvas = document.createElement('canvas');
    canvas.width = 300 * S;
    canvas.height = 170 * S;
    const x = canvas.getContext('2d')!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    this.repaintReceipt = () => {
      x.clearRect(0, 0, canvas.width, canvas.height);
      x.fillStyle = '#F4F5F8';
      x.fillRect(0, 0, canvas.width, canvas.height);
      x.textBaseline = 'middle';
      x.font = `400 ${13 * S}px ${MONO}`;
      x.fillStyle = '#17181B';
      x.textAlign = 'center';
      x.fillText(RECEIPT.store, 150 * S, 22 * S);
      RECEIPT.lines.forEach(([name, amount], i) => {
        const y = (56 + i * 28) * S;
        const traced = i === RECEIPT.traced;
        if (traced) {
          x.fillStyle = '#2A3FD0';
          x.fillRect(8 * S, y - 13 * S, 284 * S, 26 * S);
        }
        x.fillStyle = traced ? '#FFFFFF' : '#17181B';
        x.textAlign = 'left';
        x.fillText(name, 16 * S, y);
        x.textAlign = 'right';
        x.fillText(amount, 284 * S, y);
      });
      x.fillStyle = '#5F6268';
      x.textAlign = 'center';
      x.font = `400 ${11.5 * S}px ${MONO}`;
      x.fillText(RECEIPT.footer[this.lang], 150 * S, 148 * S);
      texture.needsUpdate = true;
    };
    this.repaintReceipt();
    this.receiptMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0 });
    this.receipt = new THREE.Mesh(new THREE.PlaneGeometry(300, 170), this.receiptMaterial);
    this.receipt.position.set(-1240, -130, 160);
    this.receipt.renderOrder = 1;
    this.scene.add(this.receipt);
  }

  private newLine(color: string, opacity: number) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * 3), 3));
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    const line = new THREE.Line(g, material);
    line.frustumCulled = false;
    line.renderOrder = -1;
    this.scene.add(line);
    return { line, material };
  }

  private newPill(text: string, color: string) {
    const c = document.createElement('canvas');
    const x = c.getContext('2d')!;
    const font = `500 34px ${MONO}`;
    x.font = font;
    const w = Math.ceil(x.measureText(text).width) + 36;
    c.width = w;
    c.height = 58;
    const texture = new THREE.CanvasTexture(c);
    const repaint = () => {
      x.clearRect(0, 0, w, 58);
      x.font = font;
      x.fillStyle = color;
      x.fillRect(0, 0, w, 58);
      x.fillStyle = '#05070F';
      x.textBaseline = 'middle';
      x.fillText(text, 18, 30);
      texture.needsUpdate = true;
    };
    repaint();
    const pill = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false }));
    pill.scale.set(w * 0.42, 24, 1);
    pill.renderOrder = 5;
    pill.visible = false;
    this.scene.add(pill);
    return { pill, repaint };
  }

  private buildThreads() {
    FLOWS.forEach(([fromPath, toPath, carried], i) => {
      const [fromName, fromColumn] = fromPath.split('.');
      const [toName, toColumn] = toPath.split('.');
      const from = this.cards.get(fromName)!;
      const to = this.cards.get(toName)!;
      const value = carried ?? from.def.columns[from.index.get(fromColumn)!][1];
      const { line, material } = this.newLine(to.color!, 0);
      const { pill, repaint } = this.newPill(value, to.color!);
      this.threads.push({
        from, fromColumn, to, toColumn, line, material, pill,
        repaintPill: repaint,
        color: new THREE.Color(to.color!),
        lift: (i % 2 ? 1 : -1) * (120 + (i * 37) % 260),
        wave: ((i * 53) % 200) - 100,
        lag: 0,
        landed: false,
      });
    });
    for (const t of this.threads) {
      const key = `${t.to.name}.${t.toColumn}`;
      this.incoming.set(key, [...(this.incoming.get(key) ?? []), t]);
    }
    // Values fly one after another into each table.
    for (const card of this.cards.values()) {
      const incoming = this.threads.filter((t) => t.to === card);
      incoming.forEach((t, i) => { t.lag = incoming.length > 1 ? i / (incoming.length - 1) : 0; });
    }

    this.sourceLinks = SOURCE_KEYS.map(([a, aColumn, b, bColumn]) => ({
      a: this.cards.get(a)!, aColumn, b: this.cards.get(b)!, bColumn, ...this.newLine(COLOR.source, 0.26),
    }));
    this.starLinks = STAR_LINKS.map(([a, aColumn, b, color]) => {
      const dim = this.cards.get(b)!;
      return { a: this.cards.get(a)!, aColumn, b: dim, bColumn: columnName(dim.def.columns[0]), ...this.newLine(color, 0) };
    });
  }

  private buildPulses() {
    const n = this.threads.length;
    this.pulsePositions = new Float32Array(n * 3);
    this.pulseColors = new Float32Array(n * 3);
    this.pulseGeometry.setAttribute('position', new THREE.BufferAttribute(this.pulsePositions, 3));
    this.pulseGeometry.setAttribute('color', new THREE.BufferAttribute(this.pulseColors, 3));
    const pulses = new THREE.Points(this.pulseGeometry, new THREE.PointsMaterial({ size: 13, vertexColors: true, transparent: true, depthWrite: false, map: dotTexture(), blending: THREE.AdditiveBlending }));
    pulses.frustumCulled = false;
    this.scene.add(pulses);
  }

  private repaintAll() {
    this.cards.forEach((c) => this.paintCard(c));
    this.threads.forEach((t) => t.repaintPill());
    this.repaintReceipt();
  }

  /* ───────────────────────────────── Input ──────────────────────────────── */

  private setZoom(v: number) {
    this.view.zoomT = clamp(v, ZOOM_MIN, ZOOM_MAX);
    // The slider reads "closer" to the right.
    const range = this.$<HTMLInputElement>('z-range');
    range.value = String(Math.round(this.view.zoomT < 0 ? (this.view.zoomT / ZOOM_MIN) * 100 : -(this.view.zoomT / ZOOM_MAX) * 100));
  }

  private setWhole(on: boolean) {
    this.view.wholeT = on ? 1 : 0;
    this.$('z-all').setAttribute('aria-pressed', String(on));
  }

  private straighten() {
    this.setZoom(0);
    this.view.yawT = this.view.pitchT = 0;
  }

  private wireInput() {
    const signal = this.listeners.signal;
    const { root, canvas } = this;

    this.$('stages').addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-stage]');
      if (!b) return;
      this.stageTarget = Number(b.dataset.stage);
      this.setWhole(false);
      this.straighten();
    }, { signal });

    this.$('z-in').addEventListener('click', () => this.setZoom(this.view.zoomT - 0.3), { signal });
    this.$('z-out').addEventListener('click', () => this.setZoom(this.view.zoomT + 0.3), { signal });
    this.$<HTMLInputElement>('z-range').addEventListener('input', (e) => {
      const v = Number((e.target as HTMLInputElement).value) / 100;
      this.view.zoomT = v > 0 ? v * ZOOM_MIN : -v * ZOOM_MAX;
    }, { signal });
    this.$('z-all').addEventListener('click', () => {
      const on = this.view.wholeT === 0;
      this.setWhole(on);
      if (on) this.straighten();
    }, { signal });

    const sql = this.$('sql-toggle');
    const panel = this.$('sql-panel');
    sql.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      sql.textContent = panel.hidden ? sql.dataset.show! : sql.dataset.hide!;
    }, { signal });

    root.addEventListener('wheel', (e) => {
      if ((e.target as Element).closest('#sql-panel')) return;
      // Ctrl + wheel, and a trackpad pinch which browsers report the same way, zooms.
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.setZoom(this.view.zoomT + e.deltaY * 0.004);
        return;
      }
      const delta = e.deltaY + e.deltaX;
      // Past either end, let the page itself scroll, so the footer stays reachable.
      if ((delta > 0 && this.stageTarget >= LAST) || (delta < 0 && this.stageTarget <= 0)) return;
      e.preventDefault();
      this.setWhole(false);
      this.stageTarget = clamp(this.stageTarget + delta * 0.0014, 0, LAST);
    }, { passive: false, signal });

    root.addEventListener('pointermove', (e) => {
      const r = root.getBoundingClientRect();
      this.mouse.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      this.mouse.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    }, { signal });

    document.addEventListener('keydown', (e) => {
      const el = e.target as HTMLElement;
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
      // Leave browser shortcuts alone: Alt + Left is "back", Ctrl + plus zooms the page.
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const go = (d: number) => { e.preventDefault(); this.setWhole(false); this.stageTarget = clamp(this.stageTarget + d, 0, LAST); };
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go(0.2);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(-0.2);
      if (e.key === '+' || e.key === '=') { e.preventDefault(); this.setZoom(this.view.zoomT - 0.25); }
      if (e.key === '-' || e.key === '_') { e.preventDefault(); this.setZoom(this.view.zoomT + 0.25); }
      if (e.key === '0') { e.preventDefault(); this.straighten(); this.setWhole(false); }
    }, { signal });

    // One pointer turns the scene. Two fingers pinch to zoom.
    const gap = () => {
      const [a, b] = [...this.pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    canvas.addEventListener('pointerdown', (e) => {
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      canvas.classList.add('is-dragging');
      canvas.setPointerCapture(e.pointerId);
      if (this.pointers.size === 2) this.pinch = { gap: gap(), zoom: this.view.zoomT };
    }, { signal });
    canvas.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (this.pointers.size === 1) {
        this.view.yawT = clamp(this.view.yawT - dx * 0.0045, -1.3, 1.3);
        this.view.pitchT = clamp(this.view.pitchT - dy * 0.0035, -0.9, 0.9);
      } else if (this.pinch) {
        this.setZoom(this.pinch.zoom - Math.log(gap() / this.pinch.gap));
      }
    }, { signal });
    const release = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      this.pinch = null;
      if (!this.pointers.size) canvas.classList.remove('is-dragging');
    };
    canvas.addEventListener('pointerup', release, { signal });
    canvas.addEventListener('pointercancel', release, { signal });
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.root;
    if (!w || !h) return;
    this.width = w;
    this.height = h;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private setStage(i: number) {
    if (i === this.lastStage) return;
    this.lastStage = i;
    const copy = STAGES[this.lang][i];
    this.$('c-eyebrow').textContent = copy.eyebrow;
    this.$('c-title').textContent = copy.title;
    this.$('c-text').textContent = copy.text;
    this.root.dataset.stage = String(i);

    const nav = this.$('stages');
    nav.querySelectorAll('button').forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
    const active = nav.querySelector<HTMLElement>(`[data-stage="${i}"]`);
    if (active) nav.scrollLeft = active.offsetLeft - 40;

    const sql = this.$('sql-toggle');
    sql.hidden = i !== LAST;
    if (i !== LAST) {
      this.$('sql-panel').hidden = true;
      sql.textContent = sql.dataset.show!;
    }
  }

  /* ───────────────────────────────── Frame ──────────────────────────────── */

  /** World position of a table row, on its left (-1) or right (1) edge. */
  private rowPoint(card: Card, column: string, side: number, out: THREE.Vector3) {
    const y = card.height / 2 - HEADER - (card.index.get(column)! + 0.5) * ROW;
    out.set((side * CARD_WIDTH) / 2, y, 0);
    return card.mesh.localToWorld(out);
  }

  private bezier(t: number, out: THREE.Vector3) {
    const { pa: a, c1: c, c2: d, pb: b } = this;
    const u = 1 - t;
    out.set(
      u * u * u * a.x + 3 * u * u * t * c.x + 3 * u * t * t * d.x + t * t * t * b.x,
      u * u * u * a.y + 3 * u * u * t * c.y + 3 * u * t * t * d.y + t * t * t * b.y,
      u * u * u * a.z + 3 * u * u * t * c.z + 3 * u * t * t * d.z + t * t * t * b.z,
    );
    return out;
  }

  private writeCurve(line: THREE.Line) {
    const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i <= SEGMENTS; i++) {
      this.bezier(i / SEGMENTS, this.pt);
      attr.setXYZ(i, this.pt.x, this.pt.y, this.pt.z);
    }
    attr.needsUpdate = true;
  }

  private frame = () => {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += this.calm ? 0 : dt;
    const stage = this.stageNow += (this.stageTarget - this.stageNow) * (1 - Math.exp(-dt * 4.2));
    if (Math.abs(this.stageTarget - stage) < 0.0005) this.stageNow = this.stageTarget;

    this.updateCamera(dt);
    this.updateCards();
    this.updateLinks();
    this.updateThreads();
    this.updateRows();

    this.setStage(clamp(Math.round(this.stageNow), 0, LAST));
    this.renderer.render(this.scene, this.camera);
    this.frameId = requestAnimationFrame(this.frame);
  };

  private updateCamera(dt: number) {
    const { view, mouse, pos, look, offset, side, yAxis, camera } = this;
    // Hold near each stage, move quickly between them.
    const seg = Math.floor(this.stageNow);
    const held = clamp((seg + ease(ease(this.stageNow - seg))) / LAST, 0, 1);
    this.camCurve.getPoint(held, pos);
    this.lookCurve.getPoint(held, look);

    const soft = 1 - Math.exp(-dt * 5);
    view.zoom += (view.zoomT - view.zoom) * soft;
    view.yaw += (view.yawT - view.yaw) * soft;
    view.pitch += (view.pitchT - view.pitch) * soft;
    view.whole += (view.wholeT - view.whole) * soft;
    pos.lerp(this.wholeCam, view.whole);
    look.lerp(this.wholeLook, view.whole);

    // Narrow screens stand further back so a table still fits.
    const aspect = this.width / this.height;
    const pushBack = aspect < 1.2 ? clamp(1.2 / aspect, 1, 2.1) : 1;
    // The whole scheme is wide: step back further unless the screen is wider still.
    const wholeness = Math.max(view.whole, clamp(this.stageNow - (LAST - 1), 0, 1));
    const fit = 1 + (Math.max(1, WHOLE_FIT_ASPECT / aspect) - 1) * wholeness;
    const far = Math.max(pushBack, fit) * Math.exp(view.zoom);
    offset.copy(pos).sub(look).multiplyScalar(far);
    offset.applyAxisAngle(yAxis, view.yaw);
    side.crossVectors(yAxis, offset).normalize();
    offset.applyAxisAngle(side, view.pitch);
    pos.copy(look).add(offset);

    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;
    const orbit = this.calm ? 0 : Math.sin(this.time * 0.13) * 28;
    const bob = this.calm ? 0 : Math.cos(this.time * 0.17) * 12;
    camera.position.set(pos.x + (mouse.x * 50 + orbit) * far, pos.y + (-mouse.y * 34 + bob) * far, pos.z);
    camera.lookAt(look);

    this.stars.rotation.y = this.time * 0.004;
  }

  private updateCards() {
    const { time, camera, dummy, stageNow } = this;
    this.cards.forEach((t) => {
      // Tables drift in zero gravity and turn slowly toward the viewer.
      const d = t.drift;
      t.mesh.position.set(
        t.home.x + Math.sin(time * 0.31 + t.phase) * d,
        t.home.y + Math.cos(time * 0.37 + t.phase * 1.3) * d,
        t.home.z + Math.sin(time * 0.23 + t.phase * 0.7) * d * 1.4,
      );
      dummy.position.copy(t.mesh.position);
      dummy.lookAt(camera.position);
      dummy.rotateX(Math.sin(time * 0.29 + t.phase) * 0.05);
      dummy.rotateY(Math.cos(time * 0.24 + t.phase) * 0.07);
      t.mesh.quaternion.slerp(dummy.quaternion, 0.05);
      t.mesh.updateMatrixWorld();
      if (t.isTarget) {
        t.material.opacity = clamp((stageNow - (t.stage - 1.15)) / 0.4, 0, 1);
        t.mesh.visible = t.material.opacity > 0.01;
      }
    });

    this.receiptMaterial.opacity = clamp(1 - Math.abs(stageNow - 1) / 0.6, 0, 1);
    this.receipt.visible = this.receiptMaterial.opacity > 0.01;
    this.receipt.position.y = -130 + Math.sin(time * 0.4) * 6;
    dummy.position.copy(this.receipt.position);
    dummy.lookAt(camera.position);
    this.receipt.quaternion.slerp(dummy.quaternion, 0.05);
  }

  private updateLinks() {
    const { pa, pb, c1, c2, stageNow } = this;
    for (const f of this.sourceLinks) {
      const leftToRight = f.a.home.x <= f.b.home.x;
      this.rowPoint(f.a, f.aColumn, leftToRight ? 1 : -1, pa);
      this.rowPoint(f.b, f.bColumn, leftToRight ? -1 : 1, pb);
      const m = Math.max(50, Math.abs(pb.x - pa.x) * 0.5);
      c1.set(pa.x + (leftToRight ? m : -m), pa.y, pa.z + 30);
      c2.set(pb.x + (leftToRight ? -m : m), pb.y, pb.z + 30);
      this.writeCurve(f.line);
      f.material.opacity = stageNow < LAST - 1 + 0.2 ? 0.3 : 0.2;
    }

    // The stars' own lines light up last.
    for (const f of this.starLinks) {
      const opacity = clamp((stageNow - (Math.max(f.a.stage, f.b.stage) + 0.2)) / 0.7, 0, 1);
      f.line.visible = opacity > 0;
      if (!f.line.visible) continue;
      const right = f.b.home.x > f.a.home.x + 50;
      const left = f.b.home.x < f.a.home.x - 50;
      // A dimension straight above its fact is reached around the right edge.
      this.rowPoint(f.a, f.aColumn, left ? -1 : 1, pa);
      this.rowPoint(f.b, f.bColumn, right ? -1 : 1, pb);
      const m = Math.max(90, Math.abs(pb.x - pa.x) * 0.5);
      c1.set(pa.x + (left ? -m : m), pa.y, pa.z + 20);
      c2.set(pb.x + (right ? -m : m), pb.y, pb.z + 20);
      this.writeCurve(f.line);
      f.material.opacity = opacity;
    }
  }

  private updateThreads() {
    const { pa, pb, c1, c2, pt, stageNow, time } = this;
    this.threads.forEach((f, i) => {
      const stage = f.to.stage;
      const span = 0.85;
      const t = clamp((stageNow - (stage - 0.95) - f.lag * span * 0.45) / (span * 0.55), 0, 1);
      const e = ease(t);
      f.landed = t >= 1;
      f.line.visible = t > 0;
      f.pill.visible = t > 0 && t < 1;

      if (t > 0) {
        // Each thread leaves and enters on the sides that face each other.
        const gap = f.to.home.x - f.from.home.x;
        const sideA = gap < -200 ? -1 : 1;
        const sideB = gap > 200 ? -1 : 1;
        this.rowPoint(f.from, f.fromColumn, sideA, pa);
        this.rowPoint(f.to, f.toColumn, sideB, pb);
        const dx = Math.abs(pb.x - pa.x) * 0.42 + 60;
        const near = f.from.isTarget ? 0.25 : 1;
        c1.set(pa.x + sideA * dx, pa.y + f.lift * 0.35 * near, pa.z + (f.wave + f.lift * 0.4) * near);
        c2.set(pb.x + sideB * dx, pb.y - f.lift * 0.35 * near, pb.z + (f.wave - f.lift * 0.4) * near);
        this.writeCurve(f.line);
        f.line.geometry.setDrawRange(0, Math.max(2, Math.ceil(e * (SEGMENTS + 1))));
        if (f.pill.visible) this.bezier(e, f.pill.position);
      }

      let opacity = stageNow < stage + 0.35 ? 0.78 : this.lastStage === LAST ? 0.55 : 0.24;
      // Keys between facts and dimensions hand over to the stars' brighter lines.
      if (f.from.isTarget) opacity *= 1 - clamp((stageNow - (stage + 0.2)) / 0.5, 0, 1);
      f.material.opacity = opacity;

      // A pulse keeps running along every finished thread.
      if (f.landed && !this.calm) {
        this.bezier((time * 0.16 + i * 0.137) % 1, pt);
        this.pulsePositions.set([pt.x, pt.y, pt.z], i * 3);
        this.pulseColors.set([f.color.r, f.color.g, f.color.b], i * 3);
      } else {
        this.pulsePositions[i * 3 + 2] = 1e6;
      }
    });
    this.pulseGeometry.getAttribute('position').needsUpdate = true;
    this.pulseGeometry.getAttribute('color').needsUpdate = true;
  }

  /** Redraws a table only when one of its rows changes state. */
  private updateRows() {
    this.cards.forEach((card) => {
      if (!card.shown) return;
      let dirty = false;
      for (const col of card.def.columns) {
        const name = columnName(col);
        const incoming = this.incoming.get(`${card.name}.${name}`);
        const on = incoming ? incoming.every((f) => f.landed) : this.stageNow >= card.stage - 0.75;
        if (card.shown.get(name) !== on) {
          card.shown.set(name, on);
          dirty = true;
        }
      }
      if (dirty) this.paintCard(card);
    });
  }
}

let current: JourneyScene | null = null;

/** Starts the scene on the current page, if this page has one. */
export function mountJourney() {
  const root = document.getElementById('journey');
  if (!root) return;
  const canvas = root.querySelector<HTMLCanvasElement>('#space')!;
  try {
    current?.destroy();
    current = new JourneyScene(root, canvas, document.documentElement.lang === 'uk' ? 'uk' : 'en');
  } catch {
    root.dataset.state = 'no-webgl';
  }
}

export function unmountJourney() {
  current?.destroy();
  current = null;
}
