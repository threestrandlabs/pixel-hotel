// Gym, pool deck and spa furniture.
import { item, M } from '../lib/furniture.js';

export default function build(add) {
  // ---- gym (1x2 items run along v; front faces +v) ----
  item(add, 'treadmill', [1, 2], 64, (k) => {
    k.box(0.15, 0.3, 0.85, 1.9, 0, 6, M.dark);
    k.box(0.2, 0.35, 0.8, 1.85, 6, 7, M.slate, { edge: false, details: (d) => { for (let v = 0.45; v < 1.8; v += 0.2) d.top(0.2, v, 0.8, v + 0.03, M.dark[1], 7); } });
    for (const u of [0.15, 0.85]) k.box(u - 0.03, 0.25, u + 0.03, 0.35, 6, 40, M.steel, { edge: false });
    k.box(0.12, 0.1, 0.88, 0.35, 40, 50, M.dark, { front: (d) => { d.rect(0.25, 0.75, 42, 48, M.screen[1]); d.rect(0.3, 0.5, 44, 45, M.screen[0]); } });
  });

  item(add, 'weight_bench', [1, 2], 56, (k) => {
    for (const v of [0.5, 1.6]) k.box(0.4, v - 0.05, 0.6, v + 0.05, 0, 12, M.steel, { edge: false });
    k.box(0.3, 0.4, 0.7, 1.8, 12, 17, M.dark, { lit: 0 });
    for (const u of [0.08, 0.92]) k.box(u - 0.03, 0.2, u + 0.03, 0.3, 0, 32, M.steel, { edge: false });
    k.box(-0.15, 0.22, 1.15, 0.28, 32, 34, M.chrome, { edge: false });
    for (const u of [-0.1, 1.04]) k.box(u, 0.12, u + 0.06, 0.38, 26, 40, M.dark, { edge: false });
  });

  item(add, 'dumbbell_rack', [2, 1], 44, (k) => {
    for (const u of [0.15, 1.85]) k.box(u - 0.05, 0.3, u + 0.05, 0.8, 0, 26, M.steel, { edge: false });
    for (const [z, v] of [[10, 0.65], [24, 0.45]]) {
      k.box(0.1, v - 0.15, 1.9, v + 0.15, z, z + 2, M.steel);
      for (let i = 0; i < 5; i++) {
        const u = 0.3 + i * 0.35;
        for (const dv of [-0.08, 0.08]) k.box(u - 0.06, v + dv - 0.04, u + 0.06, v + dv + 0.04, z + 2, z + 7, M.dark, { edge: false });
        k.box(u - 0.02, v - 0.06, u + 0.02, v + 0.06, z + 4, z + 5, M.chrome, { edge: false });
      }
    }
  });

  item(add, 'yoga_mat', [1, 2], 8, (k) => {
    k.box(0.2, 0.15, 0.8, 1.85, 0, 1, M.lavender, { edge: false, top: M.lavender[1], details: (d) => { d.top(0.24, 0.2, 0.76, 1.8, M.lavender[2], 1); } });
    k.cyl(0.5, 0.25, 0.1, 1, 6, M.linen);
  }, { selout: 0.3 });

  item(add, 'exercise_bike', [1, 1], 54, (k) => {
    k.box(0.2, 0.35, 0.8, 0.65, 0, 3, M.dark);
    k.cyl(0.5, 0.75, 0.16, 3, 12, M.slate);
    k.box(0.45, 0.35, 0.55, 0.75, 3, 26, M.steel, { edge: false });
    k.box(0.35, 0.3, 0.65, 0.45, 26, 30, M.dark, { lit: 0 });
    k.box(0.45, 0.7, 0.55, 0.8, 12, 40, M.steel, { edge: false });
    k.box(0.25, 0.72, 0.75, 0.8, 40, 42, M.dark, { front: (d) => d.rect(0.4, 0.6, 40, 42, M.screen[1]) });
  });

  item(add, 'rowing_machine', [2, 1], 36, (k) => {
    k.box(0.1, 0.42, 1.9, 0.58, 0, 6, M.steel);
    k.cyl(1.7, 0.5, 0.22, 0, 18, M.azure, { top: M.water[1] });
    k.box(0.5, 0.35, 0.8, 0.65, 6, 11, M.dark, { lit: 0 });
    k.box(1.4, 0.3, 1.45, 0.7, 18, 22, M.dark, { edge: false });
  });

  item(add, 'squat_rack', [2, 1], 90, (k) => {
    for (const [u, v] of [[0.15, 0.15], [1.85, 0.15], [0.15, 0.85], [1.85, 0.85]]) k.box(u - 0.04, v - 0.04, u + 0.04, v + 0.04, 0, 80, M.slate, { edge: false });
    k.box(0.1, 0.1, 1.9, 0.2, 78, 82, M.slate);
    k.box(0.1, 0.8, 1.9, 0.9, 78, 82, M.slate);
    k.box(0.0, 0.47, 2.0, 0.53, 46, 48, M.chrome, { edge: false });
    for (const u of [0.0, 1.9]) k.cyl(u + 0.05, 0.5, 0.2, 38, 56, M.red, { top: M.dark[2] });
  });

  item(add, 'gym_lockers', [2, 1], 84, (k) => {
    k.box(0.05, 0.3, 1.95, 0.9, 0, 76, M.azure, { front: (d) => {
      for (let i = 0; i < 4; i++) {
        const u = 0.08 + i * 0.47;
        for (const [z0, z1] of [[4, 36], [40, 72]]) {
          d.rect(u, u + 0.43, z0, z1, M.azure[1]);
          for (let z = z1 - 8; z > z1 - 14; z -= 2) d.rect(u + 0.1, u + 0.33, z, z + 1, M.azure[3]);
          d.rect(u + 0.34, u + 0.38, z0 + 12, z0 + 17, M.chrome[1]);
        }
      }
    } });
  });

  item(add, 'water_cooler', [1, 1], 66, (k) => {
    k.box(0.3, 0.3, 0.7, 0.7, 0, 34, M.porcelain, { front: (d) => { d.rect(0.4, 0.6, 22, 28, M.dark[2]); d.rect(0.42, 0.48, 24, 26, M.azure[1]); } });
    k.cyl(0.5, 0.5, 0.17, 34, 54, M.water, { top: M.azure[0] });
    k.cyl(0.5, 0.5, 0.08, 54, 58, M.azure);
  }, { symmetric: true });

  // ---- pool deck ----
  // Shop/inventory icon for the pool (in rooms it is drawn from water tiles).
  item(add, 'pool_water', [2, 2], 12, (k) => {
    k.box(0, 0, 2, 2, 0, 4, M.stone, { lit: 0, details: (d) => {
      d.top(0.15, 0.15, 1.85, 1.85, M.water[3], 4);
      d.top(0.25, 0.25, 1.85, 1.85, M.water[2], 4);
      for (const [u, v] of [[0.6, 0.7], [1.2, 1.1], [0.9, 1.5]]) d.top(u, v, u + 0.3, v + 0.06, M.water[0], 4);
    } });
  }, { symmetric: true });

  item(add, 'deckchair', [1, 1], 40, (k) => {
    k.custom(0.15, 0.1, 0.85, 0.95, 0, 34, ({ P, cv }) => {
      for (const u of [0.18, 0.82]) for (let t = 0; t <= 1; t += 0.02) {
        const [x, y] = P(u, 0.9 - t * 0.75, t * 30);
        cv.set(Math.round(x), Math.round(y), M.bamboo[2]);
      }
      for (let i = 0; i < 6; i++) {
        const t0 = 0.1 + i * 0.14; const t1 = t0 + 0.14;
        const c = i % 2 ? M.linen[1] : M.azure[1];
        cv.poly([P(0.2, 0.9 - t0 * 0.75, t0 * 30 + 2), P(0.8, 0.9 - t0 * 0.75, t0 * 30 + 2), P(0.8, 0.9 - t1 * 0.75, t1 * 30 + 2), P(0.2, 0.9 - t1 * 0.75, t1 * 30 + 2)], c);
      }
    });
  });

  item(add, 'pool_lounger', [1, 2], 40, (k) => {
    for (const [u, v] of [[0.2, 0.3], [0.8, 0.3], [0.2, 1.8], [0.8, 1.8]]) k.box(u - 0.03, v - 0.03, u + 0.03, v + 0.03, 0, 8, M.linen, { edge: false });
    k.box(0.15, 0.6, 0.85, 1.9, 8, 13, M.teal, { lit: 0 });
    k.custom(0.15, 0.1, 0.85, 0.6, 8, 32, ({ P, cv }) => {
      cv.poly([P(0.15, 0.6, 13), P(0.85, 0.6, 13), P(0.85, 0.15, 30), P(0.15, 0.15, 30)], M.teal[1]);
      cv.poly([P(0.85, 0.6, 13), P(0.85, 0.6, 8), P(0.85, 0.15, 25), P(0.85, 0.15, 30)], M.teal[3]);
    });
  });

  item(add, 'pool_umbrella', [1, 1], 96, (k) => {
    k.cyl(0.5, 0.5, 0.2, 0, 4, M.stone);
    k.box(0.48, 0.48, 0.52, 0.52, 4, 70, M.linen, { edge: false });
    k.custom(-0.4, -0.4, 1.4, 1.4, 60, 90, ({ P, cv }) => {
      const n = 12;
      const [ax, ay] = P(0.5, 0.5, 84);
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2; const a1 = ((i + 1) / n) * Math.PI * 2;
        const p0 = P(0.5 + Math.cos(a0) * 0.85, 0.5 + Math.sin(a0) * 0.85, 66);
        const p1 = P(0.5 + Math.cos(a1) * 0.85, 0.5 + Math.sin(a1) * 0.85, 66);
        const c = i % 2 ? M.linen[1] : M.azure[1];
        cv.poly([[ax, ay], p0, p1], c);
      }
      cv.set(Math.round(ax), Math.round(ay) - 1, M.linen[0]);
    });
  }, { symmetric: true });

  item(add, 'starting_block', [1, 1], 40, (k) => {
    k.box(0.25, 0.2, 0.75, 0.8, 0, 22, M.porcelain, { front: (d) => { d.rect(0.4, 0.6, 8, 16, M.azure[2]); d.rect(0.47, 0.53, 10, 14, M.porcelain[0]); } });
    k.custom(0.2, 0.15, 0.8, 0.85, 22, 30, ({ P, cv }) => {
      cv.poly([P(0.25, 0.2, 26), P(0.75, 0.2, 26), P(0.75, 0.8, 22), P(0.25, 0.8, 22)], M.azure[1]);
    });
  });

  item(add, 'lane_rope', [1, 1], 10, (k) => {
    for (let i = 0; i < 6; i++) {
      const v = 0.08 + i * 0.17;
      k.cyl(0.5, v, 0.07, 0, 3, i % 2 ? M.red : M.linen, { top: (i % 2 ? M.red : M.linen)[0] });
    }
  });

  item(add, 'pool_ladder', [1, 1], 50, (k) => {
    for (const u of [0.25, 0.75]) {
      k.custom(u - 0.05, 0.05, u + 0.05, 0.6, 0, 44, ({ P, cv }) => {
        for (let t = 0; t <= 1; t += 0.01) {
          const a = t * Math.PI;
          const [x, y] = P(u, 0.1 + Math.sin(a) * 0.35, 4 + (1 - Math.cos(a)) * 18);
          cv.set(Math.round(x), Math.round(y), M.chrome[1]);
          cv.set(Math.round(x) + 1, Math.round(y), M.chrome[3]);
        }
      });
    }
    for (const z of [4, 12]) k.box(0.25, 0.08, 0.75, 0.18, z, z + 2, M.chrome, { edge: false });
  });

  item(add, 'telescope', [1, 1], 70, (k) => {
    k.custom(0.15, 0.15, 0.85, 0.85, 0, 40, ({ P, cv }) => {
      for (const [u, v] of [[0.2, 0.25], [0.8, 0.3], [0.5, 0.85]]) {
        for (let t = 0; t <= 1; t += 0.02) {
          const [x, y] = P(u + (0.5 - u) * t, v + (0.5 - v) * t, t * 38);
          cv.set(Math.round(x), Math.round(y), M.walnut[2]); cv.set(Math.round(x) + 1, Math.round(y), M.walnut[3]);
        }
      }
    });
    k.custom(0.1, 0.1, 0.9, 0.9, 38, 66, ({ P, cv }) => {
      const a = P(0.25, 0.75, 40); const b = P(0.8, 0.2, 62);
      const n = 40;
      for (let i = 0; i <= n; i++) {
        const x = a[0] + (b[0] - a[0]) * i / n; const y = a[1] + (b[1] - a[1]) * i / n;
        const w = 2 + Math.round(i / n * 1.5);
        for (let d = -w; d <= w; d++) cv.set(Math.round(x), Math.round(y + d), d < 0 ? M.brass[1] : d > w - 1 ? M.brass[3] : M.brass[2]);
      }
      cv.set(Math.round(b[0]), Math.round(b[1]), M.glass[0]);
    });
  });

  // ---- spa ----
  item(add, 'sauna_cabin', [2, 1], 92, (k) => {
    k.box(0.05, 0.05, 1.95, 0.95, 0, 80, M.cedar, { front: (d) => {
      for (let z = 4; z < 78; z += 6) d.rect(0.05, 1.95, z, z + 1, M.cedar[3]);
      d.rect(1.1, 1.75, 2, 66, M.walnut[3]);
      d.rect(1.15, 1.7, 6, 62, M.orange[1]);
      d.rect(1.2, 1.3, 10, 58, M.gold[0]);
      d.rect(1.18, 1.22, 30, 36, M.brass[2]);
    } });
    k.box(0.0, 0.0, 2.0, 1.0, 80, 84, M.cedar, { lit: 0 });
  });

  item(add, 'towel_rack', [1, 1], 60, (k) => {
    for (const u of [0.2, 0.8]) k.box(u - 0.03, 0.3, u + 0.03, 0.7, 0, 50, M.bamboo, { edge: false });
    for (const z of [10, 26, 42]) {
      k.box(0.15, 0.3, 0.85, 0.7, z, z + 2, M.bamboo, { edge: false });
      for (const u of [0.32, 0.5, 0.68]) k.cyl(u, 0.5, 0.08, z + 2, z + 8, z === 26 ? M.azure : M.linen);
    }
  });

  item(add, 'changing_cubicle', [2, 2], 92, (k) => {
    k.box(0.05, 0.05, 1.95, 0.15, 0, 82, M.cedar);
    k.box(0.05, 0.15, 0.15, 1.95, 0, 82, M.cedar);
    k.box(1.85, 0.15, 1.95, 1.95, 0, 82, M.cedar, { details: (d) => { for (let z = 6; z < 78; z += 5) d.side(0.2, 1.9, z, z + 2, M.cedar[3]); } });
    k.box(0.15, 1.85, 1.85, 1.95, 6, 82, M.cedar, { front: (d) => {
      for (let z = 10; z < 78; z += 5) d.rect(0.2, 1.8, z, z + 2, M.cedar[3]);
      d.rect(1.55, 1.62, 38, 46, M.brass[1]);
    } });
    k.box(0.0, 0.0, 2.0, 2.0, 82, 85, M.cedar, { lit: 0 });
  });

  item(add, 'changing_room_door', [1, 1], 92, (k) => {
    k.box(0.05, 0.0, 0.95, 0.12, 0, 82, M.cedar, { front: (d) => {
      d.rect(0.12, 0.88, 4, 76, M.cedar[1]);
      for (let z = 10; z < 72; z += 5) d.rect(0.18, 0.82, z, z + 2, M.cedar[3]);
      d.rect(0.75, 0.8, 36, 44, M.brass[1]);
    } });
  });

  item(add, 'salon_chair', [1, 1], 56, (k) => {
    k.cyl(0.5, 0.5, 0.3, 0, 3, M.chrome);
    k.cyl(0.5, 0.5, 0.07, 3, 14, M.chrome);
    k.box(0.2, 0.25, 0.8, 0.85, 14, 20, M.dark, { lit: 0 });
    k.box(0.2, 0.18, 0.8, 0.3, 20, 46, M.dark);
    for (const u of [0.2, 0.8]) k.box(u - 0.05, 0.3, u + 0.05, 0.85, 20, 26, M.chrome, { edge: false });
    k.box(0.35, 0.85, 0.65, 0.95, 4, 8, M.chrome, { edge: false });
  });

  item(add, 'massage_bed', [1, 2], 40, (k) => {
    for (const [u, v] of [[0.2, 0.2], [0.8, 0.2], [0.2, 1.8], [0.8, 1.8]]) k.box(u - 0.04, v - 0.04, u + 0.04, v + 0.04, 0, 16, M.walnut, { edge: false });
    k.box(0.12, 0.1, 0.88, 1.9, 16, 22, M.linen, { lit: 0, front: (d) => d.rect(0.12, 0.88, 12, 16, M.linen[2]) });
    k.box(0.3, 0.15, 0.7, 0.4, 22, 25, M.lavender, { lit: 0 });
    k.box(0.2, 1.3, 0.8, 1.5, 22, 24, M.lavender, { edge: false });
  });

  // Frosted glass wall section. The glass runs along v and spans the whole
  // tile, so a row of partitions joins into one continuous see-through wall.
  item(add, 'spa_partition', [1, 1], 92, (k) => {
    const u = 0.5;
    k.box(u - 0.06, 0, u + 0.06, 1, 0, 6, M.brass, { edge: false }); // floor rail
    k.custom(u - 0.02, 0, u + 0.02, 1, 6, 80, ({ P, cv }) => {
      // translucent aquamarine glass with a frosted band and soft sheen
      const top = 80; const bottom = 6;
      for (let z = bottom; z < top; z++) {
        for (let i = 0; i < 64; i++) {
          const v = i / 64;
          const [x, y] = P(u, v, z);
          const frosted = z > 30 && z < 58;
          let c = frosted ? [196, 236, 232, 150] : [150, 214, 214, 95];
          const d = (i + Math.round(z * 0.9)) % 46;
          if (d < 2) c = [255, 255, 255, 170];
          cv.set(Math.round(x), Math.round(y), c);
        }
      }
    });
    k.box(u - 0.05, 0, u + 0.05, 1, 80, 84, M.brass, { edge: false }); // top rail
    k.box(u - 0.05, 0, u + 0.05, 0.05, 6, 80, M.brass, { edge: false }); // slim post
  }, { selout: 0 });

  item(add, 'spa_door', [2, 1], 100, (k) => {
    for (const u of [0.05, 1.8]) k.box(u, 0.3, u + 0.15, 0.7, 0, 84, M.brass);
    k.box(0.05, 0.3, 1.95, 0.7, 84, 92, M.brass, { front: (d) => d.rect(0.6, 1.4, 86, 90, M.teal[1]) });
    k.custom(0.2, 0.45, 1.8, 0.55, 0, 84, ({ P, cv }) => {
      cv.poly([P(0.2, 0.5, 84), P(1.8, 0.5, 84), P(1.8, 0.5, 0), P(0.2, 0.5, 0)], M.glass[1]);
      for (let z = 4; z < 80; z += 3) { const [x, y] = P(0.4 + (z % 9) * 0.01, 0.5, z); cv.set(Math.round(x), Math.round(y), '#ffffff'); }
    });
  });
}
