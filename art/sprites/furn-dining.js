// Café, restaurant, bar and kitchen furniture.
import { item, M } from '../lib/furniture.js';

// Counter body with panelled front and a contrasting top slab.
function counter(k, w, body, top, { height = 30, inset = 0.15 } = {}) {
  k.box(0.04, inset, w - 0.04, 0.92, 0, height, body, { front: (d) => {
    for (let u = 0.12; u < w - 0.2; u += 0.75) d.rect(u, Math.min(w - 0.12, u + 0.65), 5, height - 7, body[3]);
    for (let u = 0.12; u < w - 0.2; u += 0.75) d.rect(u + 0.03, Math.min(w - 0.15, u + 0.62), 7, height - 9, body[1]);
  } });
  k.box(0, inset - 0.05, w, 0.96, height, height + 4, top, { lit: 0 });
  return height + 4;
}

function bottle(k, u, v, z, c) {
  k.box(u, v, u + 0.06, v + 0.06, z, z + 9, c, { edge: false });
  k.box(u + 0.015, v + 0.015, u + 0.045, v + 0.045, z + 9, z + 13, c, { edge: false });
}

export default function build(add) {
  item(add, 'bar_counter', [3, 1], 64, (k) => {
    // back shelf with bottles, then the counter in front
    k.box(0.1, 0.0, 2.9, 0.12, 20, 58, M.walnut, { front: (d) => { d.rect(0.15, 2.85, 36, 38, M.walnut[1]); d.rect(0.15, 2.85, 48, 50, M.walnut[1]); } });
    const z = counter(k, 3, M.walnut, M.dark, { inset: 0.35 });
    const cols = [M.leaf, M.gold, M.crimson, M.azure, M.orange];
    for (let i = 0; i < 9; i++) bottle(k, 0.3 + i * 0.28, 0.13, 38, cols[i % cols.length]);
    for (const u of [0.6, 1.5, 2.3]) k.cyl(u, 0.65, 0.05, z, z + 5, M.glass);
  });

  item(add, 'boba_bar', [2, 1], 60, (k) => {
    const z = counter(k, 2, M.sakura, M.linen);
    k.box(0.2, 0.3, 0.7, 0.7, z, z + 22, M.steel, { front: (d) => d.rect(0.28, 0.62, z + 8, z + 16, M.screen[1]) });
    for (const [u, c] of [[1.0, M.sand], [1.25, M.lavender], [1.5, M.leaf]]) {
      k.cyl(u, 0.6, 0.09, z, z + 12, c, { top: M.linen[0], details: ({ cx, cyB }) => { for (let i = -1; i <= 1; i++) k.cv.set(Math.round(cx + i * 2), Math.round(cyB - 1), M.dark[2]); } });
      k.box(u - 0.01, 0.59, u + 0.01, 0.61, z + 12, z + 18, M.red, { edge: false });
    }
  });

  item(add, 'espresso_bar', [2, 1], 64, (k) => {
    const z = counter(k, 2, M.walnut, M.stone);
    k.box(0.2, 0.25, 1.0, 0.75, z, z + 24, M.copper, { front: (d) => {
      d.rect(0.3, 0.9, z + 16, z + 21, M.copper[0]);
      for (const u of [0.38, 0.72]) { d.rect(u, u + 0.08, z + 4, z + 12, M.dark[2]); }
    } });
    k.cyl(0.6, 0.5, 0.18, z + 24, z + 28, M.copper);
    k.box(1.15, 0.3, 1.85, 0.8, z, z + 14, M.glass, { lit: 0, front: (d) => {
      for (const u of [1.25, 1.5]) d.rect(u, u + 0.18, z + 2, z + 6, M.orange[1]);
      d.rect(1.3, 1.6, z + 8, z + 11, M.sakura[1]);
    } });
  });

  item(add, 'cafe_table', [1, 1], 34, (k) => {
    k.cyl(0.5, 0.5, 0.2, 0, 2, M.brass);
    k.cyl(0.5, 0.5, 0.04, 2, 20, M.brass);
    k.cyl(0.5, 0.5, 0.36, 20, 23, M.stone);
    k.cyl(0.42, 0.55, 0.07, 23, 27, M.porcelain, { top: M.walnut[1] });
    k.disc(0.6, 0.38, 0.1, 23.5, M.porcelain[1]);
    k.box(0.55, 0.33, 0.66, 0.42, 24, 26, M.orange, { edge: false });
  }, { symmetric: true });

  item(add, 'noodle_cart', [2, 1], 74, (k) => {
    for (const u of [0.35, 1.65]) k.cyl(u, 0.85, 0.14, 0, 12, M.dark);
    k.box(0.1, 0.15, 1.9, 0.8, 6, 30, M.red, { front: (d) => { d.rect(0.2, 1.8, 12, 24, M.red[3]); d.rect(0.3, 1.0, 15, 21, M.gold[1]); } });
    k.box(0.05, 0.1, 1.95, 0.85, 30, 33, M.walnut, { lit: 0 });
    k.cyl(0.6, 0.45, 0.22, 33, 45, M.steel, { top: M.sand[1] });
    k.custom(0.4, 0.2, 0.8, 0.7, 45, 60, ({ P, cv }) => {
      const [x, y] = P(0.6, 0.45, 48);
      for (let i = 0; i < 10; i++) cv.set(Math.round(x + Math.sin(i) * 3), Math.round(y - i), i % 3 ? '#ffffff' : '#e6eef5');
    });
    for (const u of [0.15, 1.85]) k.box(u - 0.03, 0.12, u + 0.03, 0.18, 33, 64, M.walnut, { edge: false });
    k.box(0.05, 0.05, 1.95, 0.25, 64, 68, M.red);
    k.cyl(1.4, 0.2, 0.1, 50, 62, M.red, { top: M.orange[1] });
  });

  item(add, 'dining_table', [2, 1], 44, (k) => {
    for (const [u, v] of [[0.2, 0.2], [1.8, 0.2], [0.2, 0.8], [1.8, 0.8]]) k.box(u - 0.04, v - 0.04, u + 0.04, v + 0.04, 0, 20, M.walnut, { edge: false });
    k.box(0.08, 0.08, 1.92, 0.92, 20, 24, M.linen, { lit: 0, front: (d) => d.rect(0.08, 1.92, 14, 20, M.linen[2]) });
    for (const u of [0.55, 1.45]) k.disc(u, 0.5, 0.16, 24.2, M.porcelain[0], { rim: M.porcelain[2] });
    k.cyl(1, 0.5, 0.05, 24, 34, M.linen, { top: M.gold[0] });
  });

  item(add, 'dining_chair', [1, 1], 56, (k) => {
    for (const [u, v] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) k.box(u - 0.04, v - 0.04, u + 0.04, v + 0.04, 0, 13, M.walnut, { edge: false });
    k.box(0.18, 0.18, 0.82, 0.82, 13, 17, M.crimson, { lit: 0 });
    k.box(0.18, 0.14, 0.82, 0.24, 17, 46, M.walnut, { front: (d) => d.rect(0.26, 0.74, 22, 42, M.crimson[2]) });
  });

  item(add, 'buffet_counter', [3, 1], 50, (k) => {
    const z = counter(k, 3, M.stone, M.stone, { height: 28 });
    for (const u of [0.55, 1.5, 2.45]) {
      k.box(u - 0.3, 0.3, u + 0.3, 0.8, z, z + 5, M.brass);
      k.cyl(u, 0.55, 0.22, z + 5, z + 10, M.gold, { top: M.gold[0] });
    }
  });

  item(add, 'chef_station', [2, 1], 60, (k) => {
    const z = counter(k, 2, M.steel, M.dark);
    for (const u of [0.45, 1.0]) k.disc(u, 0.55, 0.16, z + 0.2, M.dark[3], { rim: M.slate[1] });
    k.cyl(0.45, 0.55, 0.13, z, z + 7, M.copper);
    k.box(1.3, 0.35, 1.85, 0.8, z, z + 2, M.walnut);
    k.box(1.45, 0.5, 1.7, 0.6, z + 2, z + 4, M.red, { edge: false });
  });

  item(add, 'round_dining_table', [2, 2], 44, (k) => {
    k.cyl(1, 1, 0.12, 0, 20, M.walnut);
    k.cyl(1, 1, 0.78, 14, 24, M.linen, { top: M.linen[1] });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      k.disc(1 + Math.cos(a) * 0.5, 1 + Math.sin(a) * 0.5, 0.15, 24.3, M.porcelain[0], { rim: M.porcelain[2] });
    }
    k.cyl(1, 1, 0.05, 24, 36, M.linen, { top: M.gold[0] });
  }, { symmetric: true });

  item(add, 'dining_booth', [2, 1], 60, (k) => {
    const f = M.crimson;
    k.box(0.05, 0.05, 1.95, 0.3, 0, 50, f, { front: (d) => { for (let u = 0.3; u < 1.8; u += 0.4) d.rect(u, u + 0.04, 18, 46, f[3]); } });
    k.box(0.05, 0.3, 1.95, 0.9, 0, 15, M.walnut);
    k.box(0.1, 0.3, 1.9, 0.88, 15, 19, f, { lit: 0 });
    k.box(0.05, 0.02, 1.95, 0.32, 50, 54, M.walnut, { lit: 0 });
  });

  item(add, 'wine_wall', [2, 1], 96, (k) => {
    k.box(0.05, 0.1, 1.95, 0.7, 0, 88, M.walnut, { front: (d) => {
      d.rect(0.1, 1.9, 4, 84, M.walnut[4]);
      for (let z = 8; z < 82; z += 10) {
        for (let u = 0.16; u < 1.85; u += 0.14) {
          const c = (Math.round(u * 50) + z) % 3 === 0 ? M.leaf[3] : (Math.round(u * 30) + z) % 4 === 0 ? M.gold[3] : M.crimson[3];
          d.rect(u, u + 0.09, z, z + 5, c);
          d.rect(u + 0.02, u + 0.04, z + 3, z + 4, M.glass[1]);
        }
      }
    } });
  });

  item(add, 'maitre_d_podium', [1, 1], 52, (k) => {
    k.box(0.25, 0.3, 0.75, 0.75, 0, 36, M.walnut, { front: (d) => { d.rect(0.3, 0.7, 4, 32, M.walnut[3]); d.rect(0.33, 0.67, 6, 30, M.walnut[1]); d.rect(0.45, 0.55, 26, 28, M.gold[1]); } });
    k.box(0.2, 0.25, 0.8, 0.8, 36, 40, M.brass, { lit: 0 });
    k.box(0.32, 0.4, 0.68, 0.68, 40, 41, M.crimson, { edge: false });
  });

  item(add, 'grand_piano', [2, 2], 64, (k) => {
    const e = M.ebony;
    for (const [u, v] of [[0.3, 0.4], [1.7, 0.4], [1.0, 1.7]]) k.box(u - 0.05, v - 0.05, u + 0.05, v + 0.05, 0, 18, e, { edge: false });
    k.box(0.15, 0.25, 1.85, 1.25, 18, 30, e);
    k.box(0.5, 1.25, 1.5, 1.85, 18, 30, e);
    k.box(0.2, 1.1, 1.8, 1.35, 22, 26, M.porcelain, { lit: 0, details: (d) => {
      for (let u = 0.26; u < 1.78; u += 0.12) d.top(u, 1.1, u + 0.05, 1.22, M.dark[2], 26);
    } });
    k.custom(0.15, 0.2, 1.85, 1.0, 30, 60, ({ P, cv }) => {
      // propped-open lid
      cv.poly([P(0.2, 1.0, 31), P(1.8, 1.0, 31), P(1.8, 0.3, 58), P(0.2, 0.3, 58)], e[1]);
      cv.poly([P(0.25, 0.95, 32), P(1.75, 0.95, 32), P(1.75, 0.35, 56), P(0.25, 0.35, 56)], e[2]);
    });
    k.box(0.6, 1.9, 1.4, 2.0, 0, 14, e, { edge: false }); // bench
  });

  item(add, 'karaoke_machine', [1, 1], 72, (k) => {
    k.box(0.1, 0.1, 0.9, 0.9, 0, 2, M.purple, { edge: false, details: (d) => {
      for (const [u, v, c] of [[0.1, 0.1, M.neonPink], [0.5, 0.1, M.neonCyan], [0.1, 0.5, M.neonCyan], [0.5, 0.5, M.neonPink]]) d.top(u, v, u + 0.4, v + 0.4, c[1], 2);
    } });
    k.box(0.25, 0.2, 0.75, 0.55, 2, 52, M.dark, { front: (d) => {
      d.rect(0.3, 0.7, 30, 48, M.screen[2]);
      for (let i = 0; i < 6; i++) d.rect(0.32 + i * 0.065, 0.36 + i * 0.065, 32, 34 + ((i * 7) % 12), M.screen[0]);
      d.rect(0.3, 0.7, 8, 24, M.dark[1]);
      d.rect(0.42, 0.58, 12, 20, M.dark[3]);
    } });
    for (const u of [0.32, 0.68]) k.box(u - 0.03, 0.6, u + 0.03, 0.66, 2, 40, M.steel, { edge: false });
    for (const u of [0.32, 0.68]) k.cyl(u, 0.63, 0.05, 40, 46, M.dark);
  });

  item(add, 'kitchen_range', [2, 1], 50, (k) => {
    const z = counter(k, 2, M.steel, M.dark, { height: 30 });
    for (const [u, c] of [[0.45, M.steel], [1.0, M.copper], [1.55, M.slate]]) {
      k.disc(u, 0.55, 0.15, z + 0.2, M.azure[1], { rim: M.neonCyan[1] });
      k.cyl(u, 0.55, 0.13, z + 1, z + 9, c);
    }
  });

  item(add, 'kitchen_prep_table', [2, 1], 46, (k) => {
    for (const [u, v] of [[0.15, 0.2], [1.85, 0.2], [0.15, 0.85], [1.85, 0.85]]) k.box(u - 0.04, v - 0.04, u + 0.04, v + 0.04, 0, 26, M.steel, { edge: false });
    k.box(0.1, 0.15, 1.9, 0.9, 6, 8, M.steel, { edge: false });
    k.box(0.05, 0.1, 1.95, 0.95, 26, 30, M.steel, { lit: 0 });
    k.box(0.3, 0.3, 1.0, 0.8, 30, 33, M.walnut);
    k.box(0.45, 0.5, 0.85, 0.56, 33, 34, M.chrome, { edge: false });
    for (const [u, c] of [[1.25, M.leaf], [1.6, M.red]]) { k.cyl(u, 0.55, 0.12, 30, 34, M.porcelain); k.disc(u, 0.55, 0.09, 34.1, c[1]); }
  });

  item(add, 'kitchen_sink', [2, 1], 66, (k) => {
    const z = counter(k, 2, M.steel, M.steel, { height: 30 });
    k.disc(0.75, 0.55, 0.3, z + 0.2, M.slate[1], { rim: M.steel[1] });
    k.box(0.72, 0.15, 0.78, 0.21, z, z + 22, M.chrome, { edge: false });
    k.box(0.72, 0.15, 0.78, 0.5, z + 22, z + 25, M.chrome, { edge: false });
  });

  item(add, 'kitchen_fridge', [1, 1], 80, (k) => {
    k.box(0.1, 0.2, 0.9, 0.9, 0, 72, M.steel, { front: (d) => {
      d.rect(0.12, 0.88, 46, 47, M.steel[3]);
      d.rect(0.15, 0.2, 50, 66, M.chrome[0]); d.rect(0.15, 0.2, 20, 42, M.chrome[0]);
      d.rect(0.6, 0.82, 56, 64, M.screen[1]);
    } });
  });

  item(add, 'kitchen_pass', [2, 1], 66, (k) => {
    const z = counter(k, 2, M.steel, M.steel, { height: 30 });
    for (const u of [0.1, 1.9]) k.box(u - 0.04, 0.4, u + 0.04, 0.6, z, z + 26, M.steel, { edge: false });
    k.box(0.05, 0.35, 1.95, 0.65, z + 26, z + 29, M.steel, { front: (d) => d.rect(0.2, 1.8, z + 26, z + 27, M.orange[0]) });
    for (const u of [0.5, 1.0, 1.5]) k.cyl(u, 0.55, 0.15, z, z + 8, M.chrome, { top: M.chrome[0] });
  });
}
