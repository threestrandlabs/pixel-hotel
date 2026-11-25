// Lobby and general-purpose furniture.
import { item, M } from '../lib/furniture.js';
import { mix } from '../lib/canvas.js';

export default function build(add) {
  // ---- seating ----
  item(add, 'stool', [1, 1], 30, (k) => {
    for (const [u, v] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]]) k.box(u - 0.05, v - 0.05, u + 0.05, v + 0.05, 0, 13, M.walnut, { edge: false });
    k.cyl(0.5, 0.5, 0.27, 13, 16, M.walnut);
    k.cyl(0.5, 0.5, 0.24, 16, 19, M.crimson);
  }, { symmetric: true });

  item(add, 'armchair', [1, 1], 44, (k) => {
    const f = M.orange;
    for (const [u, v] of [[0.15, 0.2], [0.85, 0.2], [0.15, 0.85], [0.85, 0.85]]) k.box(u - 0.04, v - 0.04, u + 0.04, v + 0.04, 0, 5, M.walnut, { edge: false });
    k.box(0.12, 0.1, 0.88, 0.32, 5, 38, f, { lit: 1 }); // wingback
    k.box(0.12, 0.3, 0.88, 0.9, 5, 14, f);
    k.box(0.22, 0.32, 0.78, 0.88, 14, 18, f, { lit: 0 }); // cushion
    k.box(0.05, 0.12, 0.22, 0.9, 5, 25, f); // arms
    k.box(0.78, 0.12, 0.95, 0.9, 5, 25, f);
  });

  item(add, 'rooftop_sofa', [2, 1], 40, (k) => {
    const f = M.azure;
    k.box(0.1, 0.15, 1.9, 0.85, 0, 4, M.steel, { edge: false });
    k.box(0.1, 0.12, 1.9, 0.35, 4, 30, f);
    k.box(0.2, 0.35, 1.8, 0.88, 4, 13, f);
    k.box(0.2, 0.35, 1.0, 0.88, 13, 17, M.linen, { lit: 0 });
    k.box(1.0, 0.35, 1.8, 0.88, 13, 17, M.linen, { lit: 0 });
    k.box(0.02, 0.12, 0.2, 0.88, 4, 21, f);
    k.box(1.8, 0.12, 1.98, 0.88, 4, 21, f);
  });

  // ---- lighting ----
  item(add, 'lamp', [1, 1], 52, (k) => {
    k.cyl(0.5, 0.5, 0.2, 0, 4, M.chrome);
    k.cyl(0.5, 0.5, 0.05, 4, 22, M.chrome);
    k.cyl(0.5, 0.5, 0.15, 22, 40, M.orange, { top: M.gold[0], details: ({ cx, cyT }) => {
      for (const [dx, dy] of [[-2, 6], [1, 10], [-1, 14]]) { k.cv.set(Math.round(cx + dx), Math.round(cyT + dy), M.gold[0]); k.cv.set(Math.round(cx + dx + 1), Math.round(cyT + dy), M.gold[0]); }
    } });
    k.cyl(0.5, 0.5, 0.1, 40, 44, M.chrome);
  }, { symmetric: true });

  item(add, 'wall_sconce', [1, 1], 76, (k) => {
    k.box(0.4, 0.0, 0.6, 0.06, 44, 62, M.brass); // back plate on the wall
    k.box(0.47, 0.06, 0.53, 0.25, 50, 53, M.brass, { edge: false });
    k.cyl(0.5, 0.25, 0.12, 54, 64, M.gold, { top: M.gold[0] });
  });

  item(add, 'chandelier', [2, 2], 150, (k) => {
    // hangs just above head height: long chain, brass frame, two tiers of drops
    const L = 26; // how much lower than the original design
    k.box(0.97, 0.97, 1.03, 1.03, 104 - L, 148, M.brass, { edge: false });
    k.cyl(1, 1, 0.55, 86 - L, 90 - L, M.brass);
    k.cyl(1, 1, 0.32, 96 - L, 100 - L, M.brass);
    k.cyl(1, 1, 0.12, 78 - L, 104 - L, M.gold);
    k.custom(0.4, 0.4, 1.6, 1.6, 70 - L, 90 - L, ({ P, cv }) => {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const [x, y] = P(1 + Math.cos(a) * 0.55, 1 + Math.sin(a) * 0.55, 86 - L);
        for (let d = 0; d < 6; d++) cv.set(Math.round(x), Math.round(y + d), d === 5 ? '#ffffff' : mix('#bfe8f2', '#ffffff', d / 6));
        cv.set(Math.round(x), Math.round(y) - 1, M.gold[1]);
      }
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.3;
        const [x, y] = P(1 + Math.cos(a) * 0.32, 1 + Math.sin(a) * 0.32, 96 - L);
        for (let d = 0; d < 5; d++) cv.set(Math.round(x), Math.round(y + d), mix('#bfe8f2', '#ffffff', d / 5));
        const [fx, fy] = P(1 + Math.cos(a) * 0.32, 1 + Math.sin(a) * 0.32, 100 - L);
        cv.set(Math.round(fx), Math.round(fy) - 1, '#fff6c0'); cv.set(Math.round(fx), Math.round(fy) - 2, '#ffd86a');
      }
    });
  }, { symmetric: true });

  // Inlaid floor medallion under the chandelier, so it reads as hanging.
  item(add, 'chandelier_floor', [2, 2], 4, (k) => {
    k.disc(1, 1, 0.92, 0, M.gold[2], { rim: M.gold[3] });
    k.disc(1, 1, 0.78, 0.01, M.stone[1]);
    k.disc(1, 1, 0.62, 0.02, M.gold[1], { rim: M.gold[2] });
    k.disc(1, 1, 0.42, 0.03, M.crimson[2]);
    k.disc(1, 1, 0.16, 0.04, M.gold[0]);
  }, { symmetric: true, selout: 0.15 });

  item(add, 'neon_sign', [1, 1], 80, (k) => {
    k.box(0.1, 0.0, 0.9, 0.06, 40, 66, M.dark, { front: (d) => {
      d.rect(0.18, 0.82, 61, 63, M.neonPink[1]);
      d.rect(0.18, 0.82, 43, 45, M.neonPink[1]);
      d.rect(0.18, 0.24, 43, 63, M.neonPink[1]);
      d.rect(0.76, 0.82, 43, 63, M.neonPink[1]);
      d.rect(0.32, 0.68, 52, 54, M.neonCyan[1]);
      d.rect(0.46, 0.54, 47, 59, M.neonCyan[1]);
    } });
  });

  item(add, 'string_lights', [1, 1], 70, (k) => {
    k.box(0.4, 0.4, 0.6, 0.6, 0, 4, M.dark);
    k.box(0.47, 0.47, 0.53, 0.53, 4, 58, M.dark, { edge: false });
    k.box(0.38, 0.38, 0.62, 0.62, 56, 66, M.gold, { top: M.dark[1] });
    k.custom(0, 0, 1, 1, 30, 58, ({ P, cv }) => {
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const [x, y] = P(0.5 + (t - 0.5) * 0.9, 0.5 - (t - 0.5) * 0.9, 50 - Math.sin(t * Math.PI) * 12);
        cv.set(Math.round(x), Math.round(y), M.gold[0]);
        cv.set(Math.round(x), Math.round(y) + 1, M.orange[1]);
      }
    });
  }, { symmetric: true });

  // ---- plants & decor ----
  item(add, 'plant', [1, 1], 56, (k) => {
    k.cyl(0.5, 0.5, 0.24, 0, 14, M.terracotta);
    k.disc(0.5, 0.5, 0.2, 14, M.walnut[3]);
    k.foliage(0.5, 0.5, 22, 0.42, M.leaf, 3, { lobes: 9 });
  }, { symmetric: true });

  item(add, 'marble_pillar', [1, 1], 100, (k) => {
    k.box(0.12, 0.12, 0.88, 0.88, 0, 6, M.gold);
    k.cyl(0.5, 0.5, 0.3, 6, 84, M.stone, { details: ({ cx, cyT, cyB, ry }) => {
      for (const dx of [-8, -3, 2, 7]) for (let y = Math.round(cyT + ry + 2); y < cyB + ry - 2; y++) k.cv.set(Math.round(cx + dx), y, M.stone[3]);
    } });
    k.box(0.1, 0.1, 0.9, 0.9, 84, 90, M.gold);
  }, { symmetric: true });

  item(add, 'rug', [2, 2], 6, (k) => {
    k.box(0.08, 0.08, 1.92, 1.92, 0, 1, M.crimson, { edge: false, top: M.crimson[2], details: (d) => {
      d.top(0.16, 0.16, 1.84, 1.84, M.gold[2], 1);
      d.top(0.24, 0.24, 1.76, 1.76, M.crimson[1], 1);
      d.top(0.75, 0.75, 1.25, 1.25, M.gold[1], 1);
      d.top(0.88, 0.88, 1.12, 1.12, M.crimson[3], 1);
      for (const [u, v] of [[0.45, 0.45], [1.55, 0.45], [0.45, 1.55], [1.55, 1.55]]) d.top(u - 0.08, v - 0.08, u + 0.08, v + 0.08, M.gold[1], 1);
    } });
  }, { symmetric: true, selout: 0.25 });

  item(add, 'lobby_runner', [2, 3], 6, (k) => {
    k.box(0.15, 0.05, 1.85, 2.95, 0, 1, M.crimson, { edge: false, top: M.crimson[2], details: (d) => {
      d.top(0.22, 0.12, 1.78, 2.88, M.gold[1], 1);
      d.top(0.3, 0.2, 1.7, 2.8, M.crimson[2], 1);
      for (let v = 0.5; v < 2.8; v += 0.6) d.top(0.9, v, 1.1, v + 0.2, M.gold[2], 1);
    } });
  }, { symmetric: true, selout: 0.25 });

  item(add, 'bookshelf', [2, 1], 84, (k) => {
    const w = M.walnut;
    const spines = [M.crimson, M.teal, M.gold, M.lavender, M.leaf, M.azure, M.orange];
    k.box(0.05, 0.15, 1.95, 0.85, 0, 76, w, { front: (d) => {
      d.rect(0.12, 1.88, 4, 72, w[4]);
      let s = 0;
      for (const z of [6, 24, 42, 58]) {
        let u = 0.14;
        while (u < 1.82) {
          const bw = 0.06 + ((s * 7) % 3) * 0.02;
          const bh = 11 + ((s * 5) % 4);
          const c = spines[s % spines.length];
          d.rect(u, Math.min(1.86, u + bw), z, z + bh, c[2]);
          d.rect(u, u + 0.02, z, z + bh, c[1]);
          u += bw + 0.01; s++;
        }
        d.rect(0.12, 1.88, z - 2, z, w[2]);
      }
    } });
  });

  item(add, 'aquarium', [2, 1], 60, (k) => {
    k.box(0.05, 0.2, 1.95, 0.8, 0, 18, M.walnut);
    k.box(0.05, 0.2, 1.95, 0.8, 18, 52, M.glass, { lit: 0, top: M.glass[1], front: (d) => {
      d.rect(0.1, 1.9, 20, 50, M.azure[3]);
      d.rect(0.1, 1.9, 38, 50, M.azure[2]);
      d.rect(0.1, 1.9, 20, 24, M.sand[2]);
      for (const [u, z, c] of [[0.3, 24, M.red], [0.6, 24, M.purple], [1.5, 24, M.neonPink], [1.7, 24, M.leaf]]) d.rect(u, u + 0.08, z, z + 8 + (u * 7 % 5), c[1]);
      for (const [u, z] of [[0.5, 36], [1.1, 30], [1.4, 42]]) { d.rect(u, u + 0.1, z, z + 3, M.orange[1]); d.rect(u + 0.04, u + 0.06, z, z + 3, '#ffffff'); }
      for (const [u, z] of [[0.8, 46], [1.25, 44], [0.95, 40]]) d.rect(u, u + 0.02, z, z + 1, M.glass[0]);
    } });
    k.box(0.0, 0.15, 2.0, 0.85, 52, 56, M.dark);
  });

  item(add, 'jukebox', [1, 1], 64, (k) => {
    k.box(0.15, 0.25, 0.85, 0.75, 0, 44, M.walnut, { front: (d) => {
      d.rect(0.22, 0.78, 26, 40, M.gold[1]);
      d.rect(0.28, 0.72, 28, 38, M.orange[2]);
      d.rect(0.22, 0.78, 6, 22, M.dark[2]);
      for (let u = 0.3; u < 0.72; u += 0.1) d.rect(u, u + 0.04, 9, 19, M.brass[3]);
      d.rect(0.18, 0.24, 4, 42, M.neonPink[1]);
      d.rect(0.76, 0.82, 4, 42, M.neonCyan[1]);
    } });
    k.cyl(0.5, 0.5, 0.35, 44, 50, M.walnut, { top: M.neonPink[1] });
  });

  // ---- reception ----
  item(add, 'reception_desk', [3, 1], 46, (k) => {
    const w = M.walnut;
    k.box(0.05, 0.15, 2.95, 0.9, 0, 30, w, { front: (d) => {
      for (const u of [0.15, 1.05, 1.95]) { d.rect(u, u + 0.8, 6, 24, w[3]); d.rect(u + 0.04, u + 0.76, 8, 22, w[1]); }
      d.rect(0.05, 2.95, 26, 28, M.brass[1]);
    } });
    k.box(0.0, 0.1, 3.0, 0.95, 30, 34, M.stone, { lit: 0 });
    k.cyl(2.5, 0.55, 0.08, 34, 37, M.gold, { top: M.gold[0] }); // service bell
    k.box(0.4, 0.35, 0.8, 0.6, 34, 35, M.linen, { edge: false }); // ledger
    k.box(1.3, 0.25, 1.6, 0.4, 34, 42, M.dark, { front: (d) => d.rect(1.33, 1.57, 36, 41, M.screen[1]) }); // monitor
  });

  item(add, 'concierge_desk', [2, 1], 66, (k) => {
    const w = M.walnut;
    k.box(0.1, 0.0, 1.9, 0.12, 30, 60, w, { front: (d) => {
      for (let i = 0; i < 6; i++) { const u = 0.3 + i * 0.25; d.rect(u, u + 0.04, 44, 52, M.gold[1]); d.rect(u - 0.02, u + 0.06, 41, 44, M.gold[2]); }
    } });
    k.box(0.05, 0.2, 1.95, 0.9, 0, 30, w, { front: (d) => {
      d.rect(0.15, 1.85, 6, 24, w[3]);
      d.rect(0.2, 1.8, 8, 22, w[1]);
      d.rect(0.9, 1.1, 12, 18, M.gold[1]);
    } });
    k.box(0.0, 0.15, 2.0, 0.95, 30, 33, M.brass, { lit: 1 });
    k.box(0.5, 0.4, 0.95, 0.7, 33, 35, M.crimson, { edge: false });
  });

  item(add, 'luggage_trolley', [1, 1], 66, (k) => {
    k.box(0.1, 0.15, 0.9, 0.85, 4, 7, M.brass);
    for (const [u, v] of [[0.15, 0.2], [0.85, 0.2], [0.15, 0.8], [0.85, 0.8]]) k.cyl(u, v, 0.06, 0, 4, M.dark);
    k.box(0.1, 0.15, 0.16, 0.21, 7, 60, M.gold, { edge: false });
    k.box(0.84, 0.15, 0.9, 0.21, 7, 60, M.gold, { edge: false });
    k.box(0.1, 0.15, 0.9, 0.21, 58, 62, M.gold);
    k.box(0.2, 0.3, 0.8, 0.75, 7, 22, M.walnut, { front: (d) => { d.rect(0.2, 0.8, 13, 15, M.walnut[3]); d.rect(0.45, 0.55, 20, 23, M.gold[1]); } });
    k.box(0.25, 0.35, 0.75, 0.7, 22, 32, M.teal, { front: (d) => d.rect(0.25, 0.75, 26, 27, M.teal[3]) });
    k.box(0.3, 0.38, 0.65, 0.68, 32, 40, M.crimson);
  });

  item(add, 'grand_staircase', [2, 2], 84, (k) => {
    // steps climb toward the back (-v); crimson runner up the middle,
    // brass banisters on both sides
    for (let i = 0; i < 8; i++) {
      const v1 = 2 - i * 0.25;
      k.box(0.12, 0, 1.88, v1, i * 7, i * 7 + 7, M.stone, { lit: 0, front: (d) => {
        d.rect(0.55, 1.45, i * 7, i * 7 + 7, M.crimson[2]);
        d.rect(0.55, 1.45, i * 7 + 6, i * 7 + 7, M.crimson[1]);
      } });
      k.box(0.55, Math.max(0, v1 - 0.25), 1.45, v1, i * 7 + 7, i * 7 + 7.5, M.crimson, { edge: false });
    }
    for (const u of [0.06, 1.94]) {
      k.custom(u - 0.06, 0, u + 0.06, 2, 0, 80, ({ P, cv }) => {
        for (let t = 0; t <= 1; t += 1 / 160) {
          const v = 2 - t * 2;
          const z = 8 + t * 56 + 16;
          const [x, y] = P(u, v, z);
          cv.set(Math.round(x), Math.round(y), M.gold[1]);
          cv.set(Math.round(x), Math.round(y) + 1, M.gold[3]);
          if (Math.round(t * 160) % 20 === 0) {
            for (let zz = z - 16; zz < z; zz++) { const [bx, by] = P(u, v, zz); cv.set(Math.round(bx), Math.round(by), M.gold[2]); }
          }
        }
        for (const [v, z0, z1] of [[2, 0, 30], [0.02, 56, 86]]) {
          for (let zz = z0; zz < z1; zz++) { const [bx, by] = P(u, v, zz); cv.set(Math.round(bx), Math.round(by), M.gold[1]); cv.set(Math.round(bx) + 1, Math.round(by), M.gold[3]); }
        }
      });
    }
  });

  item(add, 'lobby_fountain', [2, 2], 72, (k) => {
    k.cyl(1, 1, 0.92, 0, 10, M.stone);
    k.disc(1, 1, 0.82, 10, M.water[2], { rim: M.water[3] });
    k.cyl(1, 1, 0.12, 10, 34, M.stone);
    k.cyl(1, 1, 0.45, 34, 38, M.stone);
    k.disc(1, 1, 0.38, 38, M.water[1]);
    k.cyl(1, 1, 0.08, 38, 52, M.stone);
    k.cyl(1, 1, 0.2, 52, 55, M.stone, { top: M.water[1] });
    k.custom(0.2, 0.2, 1.8, 1.8, 10, 60, ({ P, cv }) => {
      const [x, y] = P(1, 1, 60);
      for (let i = 0; i < 6; i++) cv.set(Math.round(x), Math.round(y + i), M.water[0]);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const [sx, sy] = P(1 + Math.cos(a) * 0.4, 1 + Math.sin(a) * 0.4, 36);
        for (let j = 0; j < 22; j++) if (j % 3 !== 2) cv.set(Math.round(sx + Math.cos(a) * j * 0.15), Math.round(sy + j), M.water[j % 2]);
      }
    });
  }, { symmetric: true });

  item(add, 'wardrobe', [1, 1], 84, (k) => {
    const w = M.walnut;
    k.box(0.1, 0.25, 0.9, 0.85, 0, 72, w, { front: (d) => {
      d.rect(0.15, 0.49, 6, 68, w[1]); d.rect(0.51, 0.85, 6, 68, w[1]);
      d.rect(0.2, 0.44, 40, 64, w[2]); d.rect(0.56, 0.8, 40, 64, w[2]);
      d.rect(0.2, 0.44, 10, 34, w[2]); d.rect(0.56, 0.8, 10, 34, w[2]);
      d.rect(0.45, 0.48, 34, 40, M.gold[1]); d.rect(0.52, 0.55, 34, 40, M.gold[1]);
    } });
    k.box(0.06, 0.2, 0.94, 0.9, 72, 76, w, { lit: 0 });
  });
}
