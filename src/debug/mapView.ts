import { City } from '../gen/city';
import { DistrictType } from '../gen/districts';
import { RoadClass } from '../gen/streamlines';
import { fieldAngle } from '../gen/tensorField';
import { clamp, mix, smoothstep } from '../core/vec2';

export interface Layers {
  districts: boolean;
  nodes: boolean;
  field: boolean;
  raw: boolean;
}

const ROAD_STYLE: Record<RoadClass, { width: number; minPx: number; fill: string; casing: string }> = {
  local: { width: 9, minPx: 1.2, fill: '#ffffff', casing: '#c9c4b8' },
  collector: { width: 13, minPx: 2, fill: '#ffffff', casing: '#b5afa0' },
  arterial: { width: 19, minPx: 3, fill: '#fff3b0', casing: '#c9a94a' },
  ramp: { width: 8, minPx: 1.5, fill: '#f9b45c', casing: '#b56d1c' },
  highway: { width: 26, minPx: 4, fill: '#f59a3c', casing: '#a9591a' },
};
const ORDER: RoadClass[] = ['local', 'collector', 'arterial', 'ramp', 'highway'];

const DISTRICT_COLOR: Record<DistrictType, [number, number, number]> = {
  downtown: [214, 69, 65],
  midtown: [235, 149, 50],
  oldtown: [155, 89, 182],
  residential: [244, 208, 63],
  suburb: [130, 200, 120],
  hills: [120, 150, 90],
  industrial: [120, 130, 150],
  beach: [80, 190, 220],
};
const DEGREE_COLOR = ['#000', '#e74c3c', '#999', '#2980b9', '#27ae60', '#8e44ad', '#8e44ad'];

/** Top-down debug rendering of the generated city. */
export class MapView {
  private ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement | null = null;
  private baseKey = '';
  private city: City | null = null;
  layers: Layers = { districts: false, nodes: false, field: false, raw: false };
  /** Pixels per metre and pan offset in pixels. */
  private zoom = 1;
  private needsFit = false;
  private ox = 0;
  private oy = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    let drag: { x: number; y: number } | null = null;
    canvas.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      this.ox += e.clientX - drag.x;
      this.oy += e.clientY - drag.y;
      drag = { x: e.clientX, y: e.clientY };
      this.render();
    });
    canvas.addEventListener('pointerup', () => (drag = null));
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const k = Math.exp(-e.deltaY * 0.0015);
        this.ox = e.clientX - (e.clientX - this.ox) * k;
        this.oy = e.clientY - (e.clientY - this.oy) * k;
        this.zoom *= k;
        this.render();
      },
      { passive: false },
    );
    window.addEventListener('resize', () => this.render());
  }

  setCity(city: City): void {
    this.city = city;
    this.fit();
    this.render();
  }

  fit(): void {
    if (!this.city) return;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    // The canvas has no size while the 3D view is shown; fit on the next visible render instead.
    this.needsFit = !w || !h;
    if (this.needsFit) return;
    const s = this.city.config.size;
    this.zoom = (Math.min(w, h) * 0.96) / s;
    this.ox = (w - s * this.zoom) / 2;
    this.oy = (h - s * this.zoom) / 2;
  }

  private buildBase(city: City): HTMLCanvasElement {
    const t = city.terrain;
    const n = t.n;
    const c = document.createElement('canvas');
    c.width = c.height = n;
    const g = c.getContext('2d')!;
    const img = g.createImageData(n, n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        const sd = t.seaDist[k];
        let r: number;
        let gr: number;
        let b: number;
        if (sd < 0) {
          const d = smoothstep(0, 350, -sd);
          r = mix(156, 110, d);
          gr = mix(203, 170, d);
          b = mix(232, 215, d);
        } else if (t.riverBank[k] < 0) {
          r = 156;
          gr = 203;
          b = 232;
        } else {
          const hl = t.hill[k];
          r = mix(234, 196, hl);
          gr = mix(231, 208, hl);
          b = mix(221, 160, hl);
          const beach = 1 - smoothstep(18, 34, sd);
          r = mix(r, 240, beach);
          gr = mix(gr, 226, beach);
          b = mix(b, 180, beach);
          const i0 = Math.max(0, i - 1);
          const i1 = Math.min(n - 1, i + 1);
          const j0 = Math.max(0, j - 1);
          const j1 = Math.min(n - 1, j + 1);
          const gx = (t.height[j * n + i1] - t.height[j * n + i0]) / ((i1 - i0) * t.cell);
          const gy = (t.height[j1 * n + i] - t.height[j0 * n + i]) / ((j1 - j0) * t.cell);
          const shade = clamp(1 - (gx + gy) * 1.6, 0.6, 1.25);
          r *= shade;
          gr *= shade;
          b *= shade;
          if (this.layers.districts) {
            const col = DISTRICT_COLOR[city.districts.list[city.districts.map[k]].type];
            r = mix(r, col[0], 0.45);
            gr = mix(gr, col[1], 0.45);
            b = mix(b, col[2], 0.45);
          }
        }
        img.data[k * 4] = clamp(r, 0, 255);
        img.data[k * 4 + 1] = clamp(gr, 0, 255);
        img.data[k * 4 + 2] = clamp(b, 0, 255);
        img.data[k * 4 + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  render(): void {
    const city = this.city;
    const canvas = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    if (this.needsFit) this.fit();
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#6eaad7';
    ctx.fillRect(0, 0, w, h);
    if (!city) return;
    const key = `${city.config.seed}:${city.config.size}:${this.layers.districts}`;
    if (!this.base || this.baseKey !== key) {
      this.base = this.buildBase(city);
      this.baseKey = key;
    }
    const z = this.zoom;
    const size = city.config.size;
    ctx.save();
    ctx.translate(this.ox, this.oy);
    ctx.scale(z, z);
    ctx.imageSmoothingEnabled = true;
    const cell = city.terrain.cell;
    ctx.drawImage(this.base, -cell / 2, -cell / 2, size + cell, size + cell);

    ctx.fillStyle = 'rgba(120, 190, 110, 0.55)';
    for (const p of city.districts.parks) {
      ctx.beginPath();
      ctx.arc(p.center.x, p.center.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.layers.field) {
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.lineWidth = 1 / z;
      ctx.beginPath();
      for (let y = 30; y < size; y += 60) {
        for (let x = 30; x < size; x += 60) {
          const a = fieldAngle(city.field, x, y, 0);
          ctx.moveTo(x - Math.cos(a) * 22, y - Math.sin(a) * 22);
          ctx.lineTo(x + Math.cos(a) * 22, y + Math.sin(a) * 22);
        }
      }
      ctx.stroke();
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const edges = city.graph.edges;
    const stroke = (cls: RoadClass, casing: boolean, bridge: boolean) => {
      const st = ROAD_STYLE[cls];
      const width = Math.max(st.minPx / z, st.width);
      ctx.beginPath();
      for (const e of edges) {
        if (e.cls !== cls || e.bridge !== bridge) continue;
        ctx.moveTo(e.points[0].x, e.points[0].y);
        for (let i = 1; i < e.points.length; i++) ctx.lineTo(e.points[i].x, e.points[i].y);
      }
      ctx.lineWidth = casing ? width + (bridge ? 5 : 2) / z + (bridge ? 3 : 0) : width;
      ctx.strokeStyle = casing ? (bridge ? '#5a5a5a' : st.casing) : st.fill;
      ctx.stroke();
    };
    for (const cls of ORDER) {
      if (cls === 'ramp') {
        // Freeways are drawn above the street network.
        for (const c of ['ramp', 'highway'] as RoadClass[]) for (const b of [false, true]) stroke(c, true, b);
        for (const c of ['ramp', 'highway'] as RoadClass[]) for (const b of [false, true]) stroke(c, false, b);
        break;
      }
      for (const b of [false, true]) stroke(cls, true, b);
    }
    // Street fills go on top of all street casings so junctions look merged.
    ctx.globalCompositeOperation = 'destination-over';
    ctx.globalCompositeOperation = 'source-over';
    for (const cls of ['local', 'collector', 'arterial'] as RoadClass[]) for (const b of [false, true]) stroke(cls, false, b);

    // Railway: black-and-white ticked line; viaducts and bridges get a casing, tunnels are faint and dashed.
    for (const line of city.rail.lines) {
      const w = Math.max((line.kind === 'main' ? 3.6 : 2.4) / z, line.tracks * 3.2);
      const run = (match: (s: string) => boolean, draw: () => void) => {
        ctx.beginPath();
        let open = false;
        for (let i = 0; i < line.points.length; i++) {
          // A run includes the point after its last matching one, so neighbouring runs meet.
          const on = match(line.structure[i]) || (i > 0 && match(line.structure[i - 1]));
          if (!on) open = false;
          else if (!open) {
            ctx.moveTo(line.points[i].x, line.points[i].y);
            open = true;
          } else ctx.lineTo(line.points[i].x, line.points[i].y);
        }
        draw();
      };
      ctx.lineCap = 'butt';
      run((st) => st === 'tunnel', () => {
        ctx.setLineDash([10, 8]);
        ctx.lineWidth = w;
        ctx.strokeStyle = 'rgba(40, 40, 40, 0.45)';
        ctx.stroke();
        ctx.setLineDash([]);
      });
      run((st) => st === 'elevated' || st === 'bridge', () => {
        ctx.lineWidth = w + Math.max(3 / z, 5);
        ctx.strokeStyle = '#8a8a8a';
        ctx.stroke();
      });
      run((st) => st !== 'tunnel', () => {
        ctx.lineWidth = w;
        ctx.strokeStyle = '#2b2b2b';
        ctx.stroke();
        ctx.setLineDash([9, 9]);
        ctx.lineWidth = w * 0.5;
        ctx.strokeStyle = '#f2f2f2';
        ctx.stroke();
        ctx.setLineDash([]);
      });
      ctx.lineCap = 'round';
    }
    // Level crossings.
    ctx.fillStyle = '#d0342c';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1 / z;
    for (const c of city.railCrossings) {
      if (c.kind !== 'level') continue;
      const r = Math.max(3 / z, 5);
      ctx.beginPath();
      ctx.moveTo(c.x - r, c.y - r);
      ctx.lineTo(c.x + r, c.y + r);
      ctx.moveTo(c.x + r, c.y - r);
      ctx.lineTo(c.x - r, c.y + r);
      ctx.lineWidth = Math.max(1.6 / z, 2);
      ctx.strokeStyle = '#d0342c';
      ctx.stroke();
    }
    for (const c of ['ramp', 'highway'] as RoadClass[]) for (const b of [false, true]) stroke(c, true, b);
    for (const c of ['ramp', 'highway'] as RoadClass[]) for (const b of [false, true]) stroke(c, false, b);

    if (this.layers.raw) {
      ctx.strokeStyle = 'rgba(220, 0, 120, 0.8)';
      ctx.lineWidth = 1.5 / z;
      ctx.beginPath();
      for (const l of city.lines) {
        ctx.moveTo(l.points[0].x, l.points[0].y);
        for (let i = 1; i < l.points.length; i++) ctx.lineTo(l.points[i].x, l.points[i].y);
      }
      ctx.stroke();
    }
    if (this.layers.nodes) {
      for (const n of city.graph.nodes) {
        const d = Math.min(6, n.degree);
        if (d === 2) continue;
        ctx.fillStyle = DEGREE_COLOR[d];
        ctx.beginPath();
        ctx.arc(n.x, n.y, Math.max(3 / z, 5), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (this.layers.districts) {
      ctx.fillStyle = '#222';
      ctx.font = `${Math.max(11 / z, 26)}px sans-serif`;
      ctx.textAlign = 'center';
      for (const d of city.districts.list) ctx.fillText(d.type, d.center.x, d.center.y);
    }
    ctx.restore();
  }
}
