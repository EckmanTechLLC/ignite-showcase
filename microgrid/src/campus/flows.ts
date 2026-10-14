import { Container, Graphics, Particle, ParticleContainer, type Texture } from 'pixi.js';
import { COLOR, COS, LEADS, LINK, SUB_X, TAP_X, TRUNK_Y, type Pt } from './model';
import { spacingOf, speedOf, supplyGroup, trunkSegments, type Group, type Tap } from './network';
import { finite, type Snap } from './read';

const GROUP_COLOR: Record<Group, number> = { pv: COLOR.pv, bess: COLOR.bess, grid: COLOR.grid, gen: COLOR.genset };

interface Path {
  id: string;
  pts: Pt[];
  cum: number[];
  len: number;
  /** Lift above the ground (the utility link runs overhead). */
  z: number;
  particles: Particle[];
  phase: number;
  /** Currently shown: signed kW (positive = along pts), colour, active particle count. */
  kw: number;
  color: number;
  active: number;
  /** Eased 0..1 visibility so a path fades in / out instead of popping. */
  level: number;
}

function along(p: Path, d: number): Pt {
  const { pts, cum } = p;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const t = (d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
  return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
}

const MAX_SPACING_FLOOR = 9;

/** Energy streams: leads and trunk segments carry particles whose density follows |kW| and whose colour follows the source. */
export class Flows {
  readonly layer = new Container();
  /** Particles currently visible (perf readout). */
  active = 0;
  /** True while the utility link is carrying power (scene draws the closed switch). */
  linkLive = false;
  private readonly paths = new Map<string, Path>();
  private readonly pc: ParticleContainer;
  private readonly glow = new Graphics();
  private glowKey = '';

  constructor(dot: Texture) {
    this.pc = new ParticleContainer({ texture: dot, dynamicProperties: { position: true, color: true, vertex: false, rotation: false, uvs: false } });
    this.layer.addChild(this.glow, this.pc);
    for (const [id, pts] of Object.entries(LEADS)) this.add(id, pts);
    this.add('LINK', LINK);
  }

  private add(id: string, pts: Pt[]): Path {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const len = cum[cum.length - 1];
    const n = Math.ceil(len / MAX_SPACING_FLOOR) + 1;
    const particles: Particle[] = [];
    for (let i = 0; i < n; i++) {
      const p = new Particle({ texture: this.pc.texture, anchorX: 0.5, anchorY: 0.5, alpha: 0, scaleX: 0.55, scaleY: 0.55 });
      particles.push(p);
      this.pc.addParticle(p);
    }
    const path: Path = { id, pts, cum, len, z: id === 'LINK' ? 22 : 0, particles, phase: Math.random(), kw: 0, color: 0xffffff, active: 0, level: 0 };
    this.paths.set(id, path);
    return path;
  }

  private segment(x0: number, x1: number): Path {
    const id = `T${x0}-${x1}`;
    return this.paths.get(id) ?? this.add(id, [{ x: x0, y: TRUNK_Y }, { x: x1, y: TRUNK_Y }]);
  }

  /** Signed injections at the trunk taps from the live snapshot. */
  static taps(s: Snap): Tap[] {
    const pv = s.pv.map((a, i): Tap => ({ id: `A${i + 1}`, x: TAP_X[`A${i + 1}`], kw: finite(a.ac), group: 'pv' }));
    const loads = s.bldg.map((b, i): Tap => ({ id: `L${i + 1}`, x: TAP_X[`L${i + 1}`], kw: -finite(b.kw), group: 'pv' }));
    const bess = s.bess.map((b, i): Tap => ({ id: `B${i + 1}`, x: TAP_X[`B${i + 1}`], kw: finite(b.kw), group: 'bess' }));
    return [
      ...pv,
      ...loads,
      { id: 'EV', x: TAP_X.EV, kw: -finite(s.evTotal), group: 'pv' },
      ...bess,
      { id: 'GEN', x: TAP_X.GEN, kw: finite(s.gen.kw), group: 'gen' },
      // Grid at the substation end: import feeds the trunk, export draws from it. Open link (island) carries nothing.
      { id: 'GRID', x: SUB_X, kw: s.island ? 0 : finite(s.importKw) - finite(s.exportKw), group: 'grid' },
    ];
  }

  /** Set the target flow of every path from the snapshot. */
  setTargets(s: Snap): void {
    const taps = Flows.taps(s);
    const segs = trunkSegments(taps);
    const pvSum = taps.filter((t) => t.group === 'pv' && t.kw > 0).reduce((a, t) => a + t.kw, 0);
    const bessSum = taps.filter((t) => t.group === 'bess').reduce((a, t) => a + t.kw, 0);
    const supply = supplyGroup(s.island ? 0 : finite(s.importKw), pvSum, bessSum, finite(s.gen.kw));
    const live = new Set<string>();
    for (const t of taps) {
      if (t.id === 'GRID') continue;
      const p = this.paths.get(t.id);
      if (!p) continue;
      live.add(p.id);
      // Leads are drawn asset -> trunk; a load or a charging battery flows the other way, coloured by what supplies it.
      p.kw = t.kw;
      p.color = t.kw >= 0 ? GROUP_COLOR[t.group] : t.group === 'bess' ? COLOR.bessCharge : GROUP_COLOR[supply];
    }
    for (const sg of segs) {
      const p = this.segment(sg.x0, sg.x1);
      live.add(p.id);
      p.kw = sg.kw;
      p.color = GROUP_COLOR[sg.group];
    }
    // utility link: LINK points pole -> substation, i.e. import direction
    const link = this.paths.get('LINK');
    if (link) {
      live.add('LINK');
      link.kw = s.island ? 0 : finite(s.importKw) - finite(s.exportKw);
      link.color = COLOR.grid;
      this.linkLive = Math.abs(link.kw) >= 0.8;
    }
    for (const p of this.paths.values()) if (!live.has(p.id)) p.kw = 0;
  }

  /** Advance the particles; `reduced` freezes motion and drops the particles (the static glow stays). */
  update(dt: number, reduced: boolean): void {
    let active = 0;
    let key = '';
    for (const p of this.paths.values()) {
      const sp = spacingOf(p.kw);
      const target = sp === null ? 0 : 1;
      p.level += (target - p.level) * Math.min(1, dt * 4);
      if (target === 0 && p.level < 0.02) p.level = 0;
      const n = sp === null || reduced ? 0 : Math.min(p.particles.length, Math.max(1, Math.round(p.len / sp)));
      key += `${p.id}:${p.level > 0.02 ? Math.round(p.level * 4) : 0}:${p.color.toString(16)}:${sp === null ? 0 : Math.round(sp / 4)}:${p.kw < 0 ? '-' : '+'}|`;
      if (!reduced && sp !== null) p.phase = (p.phase + (dt * speedOf(p.kw)) / p.len * (p.kw < 0 ? -1 : 1) + 1) % 1;
      const col = p.color;
      for (let i = 0; i < p.particles.length; i++) {
        const q = p.particles[i];
        if (i >= n) {
          if (q.alpha !== 0) q.alpha = 0;
          continue;
        }
        active++;
        const pos = along(p, ((p.phase + i / n) % 1) * p.len);
        q.x = pos.x;
        q.y = pos.y * COS - p.z;
        q.tint = col;
        q.alpha = 0.35 + 0.65 * p.level;
      }
      p.active = n;
    }
    this.active = active;
    this.redrawGlow(key);
  }

  private redrawGlow(key: string): void {
    if (key === this.glowKey) return;
    this.glowKey = key;
    const g = this.glow;
    g.clear();
    for (const p of this.paths.values()) {
      if (p.level <= 0.02) continue;
      const a = 0.12 + 0.2 * Math.min(1, p.level) * Math.min(1, Math.abs(p.kw) / 150 + 0.3);
      g.moveTo(p.pts[0].x, p.pts[0].y * COS - p.z);
      for (let i = 1; i < p.pts.length; i++) g.lineTo(p.pts[i].x, p.pts[i].y * COS - p.z);
      g.stroke({ width: 5, color: p.color, alpha: a, join: 'round', cap: 'round' });
    }
  }

  /** Flow of one path now (tests, debugging): signed kW. */
  kw(id: string): number {
    return this.paths.get(id)?.kw ?? 0;
  }
}
