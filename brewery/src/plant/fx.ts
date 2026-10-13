import { Container, Sprite, type Texture } from 'pixi.js';

interface Puff {
  s: Sprite;
  life: number;
  max: number;
  vx: number;
  vy: number;
  size: number;
}

/** Steam puffs: a fixed pool of soft sprites that rise, drift, grow and fade. */
export class Steam {
  readonly layer = new Container();
  private readonly puffs: Puff[] = [];
  private readonly free: Puff[] = [];
  /** Live puffs (perf readout). */
  alive = 0;
  private acc = new Map<string, number>();

  constructor(tex: Texture, size = 220) {
    for (let i = 0; i < size; i++) {
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.visible = false;
      this.layer.addChild(s);
      const p: Puff = { s, life: 0, max: 1, vx: 0, vy: 0, size: 1 };
      this.puffs.push(p);
      this.free.push(p);
    }
  }

  /** Emit `rate` puffs per second from a point; call every frame. */
  emit(key: string, x: number, y: number, rate: number, dt: number): void {
    if (rate <= 0) return;
    let a = (this.acc.get(key) ?? 0) + rate * dt;
    while (a >= 1) {
      a -= 1;
      const p = this.free.pop();
      if (!p) break;
      p.life = 0;
      p.max = 1.8 + Math.random() * 1.4;
      p.vx = 5 + Math.random() * 9;
      p.vy = -(20 + Math.random() * 16);
      p.size = 0.35 + Math.random() * 0.25;
      p.s.position.set(x + (Math.random() - 0.5) * 8, y);
      p.s.visible = true;
      p.s.scale.set(p.size);
      p.s.alpha = 0;
    }
    this.acc.set(key, a);
  }

  update(dt: number): void {
    let alive = 0;
    for (const p of this.puffs) {
      if (!p.s.visible) continue;
      p.life += dt;
      if (p.life >= p.max) {
        p.s.visible = false;
        this.free.push(p);
        continue;
      }
      alive++;
      const f = p.life / p.max;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.vx *= 1 - 0.1 * dt;
      p.s.scale.set(p.size * (1 + f * 2.4));
      p.s.alpha = 0.55 * Math.sin(Math.min(1, f * 1.2) * Math.PI) * (1 - f * 0.4);
    }
    this.alive = alive;
  }

  clear(): void {
    for (const p of this.puffs) {
      if (p.s.visible) {
        p.s.visible = false;
        this.free.push(p);
      }
    }
    this.alive = 0;
  }
}
