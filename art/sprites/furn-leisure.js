// Arcade, library, garden, rooftop and suite furniture.
import { item, M } from '../lib/furniture.js';

// Upright arcade cabinet: body colour, marquee colour, screen accent.
function cabinet(add, id, body, marquee, glow, art) {
  item(add, id, [1, 1], 76, (k) => {
    k.box(0.18, 0.25, 0.82, 0.8, 0, 66, body, { front: (d) => {
      d.rect(0.22, 0.78, 58, 64, marquee[1]);
      d.rect(0.3, 0.7, 60, 62, marquee[0]);
      d.rect(0.24, 0.76, 34, 56, M.dark[3]);
      d.rect(0.28, 0.72, 36, 54, glow[3]);
      art(d);
      d.rect(0.22, 0.78, 26, 32, M.dark[1]);
      d.rect(0.32, 0.36, 28, 31, M.red[1]);
      d.rect(0.5, 0.54, 28, 30, M.gold[1]); d.rect(0.6, 0.64, 28, 30, M.azure[1]);
      d.rect(0.42, 0.58, 10, 14, M.gold[2]);
    } });
    k.box(0.16, 0.6, 0.84, 0.95, 26, 30, body, { lit: 0 });
  });
}

export default function build(add) {
  const snake = (c) => (d) => {
    d.rect(0.34, 0.6, 46, 48, c); d.rect(0.58, 0.62, 40, 48, c); d.rect(0.4, 0.62, 40, 42, c);
    d.rect(0.5, 0.54, 50, 52, M.red[1]);
  };
  const bricks = (c) => (d) => {
    for (let i = 0; i < 4; i++) d.rect(0.3 + i * 0.1, 0.38 + i * 0.1, 50, 53, c);
    for (let i = 0; i < 3; i++) d.rect(0.35 + i * 0.1, 0.43 + i * 0.1, 46, 49, M.gold[1]);
    d.rect(0.45, 0.58, 38, 39, '#ffffff'); d.rect(0.5, 0.52, 43, 44, '#ffffff');
  };
  const blocks = (c) => (d) => {
    d.rect(0.3, 0.7, 36, 40, c); d.rect(0.3, 0.42, 40, 44, c); d.rect(0.58, 0.7, 40, 44, M.purple[1]);
    d.rect(0.46, 0.54, 48, 52, M.gold[1]); d.rect(0.42, 0.58, 48, 50, M.gold[1]);
  };
  cabinet(add, 'mini_arcade', M.purple, M.neonPink, M.screen, snake(M.screen[1]));
  cabinet(add, 'arcade_snake_1', M.leaf, M.gold, M.screen, snake(M.screen[1]));
  cabinet(add, 'arcade_snake_2', M.dark, M.neonCyan, M.neonCyan, snake(M.neonCyan[1]));
  cabinet(add, 'arcade_breakout_1', M.red, M.gold, M.azure, bricks(M.red[1]));
  cabinet(add, 'arcade_breakout_2', M.azure, M.neonPink, M.purple, bricks(M.neonPink[1]));
  cabinet(add, 'arcade_drop_1', M.orange, M.azure, M.dark, blocks(M.neonCyan[1]));
  cabinet(add, 'arcade_drop_2', M.purple, M.gold, M.dark, blocks(M.leaf[1]));

  // ---- arcade fit-out (v0.14) ----
  // Claw crane: glass box of plush prizes over a coloured base.
  item(add, 'claw_machine', [1, 1], 80, (k) => {
    k.box(0.14, 0.14, 0.86, 0.86, 0, 26, M.neonPink, { front: (d) => { d.rect(0.3, 0.7, 8, 14, M.dark[2]); d.rect(0.62, 0.72, 18, 22, M.gold[1]); } });
    k.box(0.16, 0.16, 0.84, 0.84, 26, 28, M.chrome, { edge: false });
    const plush = [M.gold, M.azure, M.leaf, M.sakura, M.orange, M.purple];
    plush.forEach((mat, i) => k.box(0.22 + (i % 3) * 0.2, 0.25 + Math.floor(i / 3) * 0.28, 0.36 + (i % 3) * 0.2, 0.4 + Math.floor(i / 3) * 0.28, 28, 33 + (i % 2) * 2, mat, { edge: false }));
    k.custom(0.14, 0.14, 0.86, 0.86, 28, 62, ({ P, cv }) => {
      // glass: corner posts, a faint tint, and the claw on its cable
      for (const [u, v] of [[0.14, 0.86], [0.86, 0.86], [0.86, 0.14]]) {
        const [x0, y0] = P(u, v, 28); const [, y1] = P(u, v, 62);
        for (let y = Math.round(y1); y <= Math.round(y0); y++) cv.set(Math.round(x0), y, M.chrome[2]);
      }
      const [cx, cy] = P(0.5, 0.5, 58);
      for (let y = 0; y < 10; y++) cv.set(Math.round(cx), Math.round(cy) + y, M.chrome[1]);
      for (const dx of [-2, -1, 1, 2]) cv.set(Math.round(cx) + dx, Math.round(cy) + 10 + Math.abs(dx) - 1, M.chrome[1]);
    });
    k.box(0.12, 0.12, 0.88, 0.88, 62, 72, M.neonPink, { front: (d) => d.rect(0.2, 0.8, 64, 70, M.neonCyan[1]) });
  });

  // Prize counter: glass display case of prizes, with prize shelves behind.
  item(add, 'prize_counter', [3, 1], 74, (k) => {
    k.box(0.06, 0.02, 2.94, 0.14, 0, 62, M.purple, { front: (d) => {
      for (const z of [16, 32, 48]) d.rect(0.1, 2.9, z, z + 1, M.purple[3]);
      const cols = [M.gold[1], M.azure[1], M.leaf[1], M.sakura[1], M.orange[1], M.neonCyan[1]];
      for (let r = 0; r < 3; r++) for (let i = 0; i < 9; i++) d.rect(0.18 + i * 0.31, 0.32 + i * 0.31, 18 + r * 16, 26 + r * 16 - (i % 2) * 2, cols[(i + r) % cols.length]);
    } });
    k.box(0.06, 0.5, 2.94, 0.95, 0, 24, M.dark, { front: (d) => {
      d.rect(0.1, 2.9, 6, 20, M.neonCyan[3]);
      const cols = [M.gold[0], M.sakura[0], M.azure[0], M.leaf[0]];
      for (let i = 0; i < 10; i++) d.rect(0.2 + i * 0.27, 0.3 + i * 0.27, 8, 12 + (i % 3) * 2, cols[i % cols.length]);
    } });
    k.box(0.04, 0.48, 2.96, 0.97, 24, 27, M.chrome, { edge: false });
    k.box(0.3, 0.02, 2.7, 0.08, 62, 70, M.neonPink, { front: (d) => d.rect(0.5, 2.5, 64, 68, M.gold[0]) });
  });

  // Air hockey table with puck, two mallets and glowing goals.
  item(add, 'air_hockey', [2, 1], 34, (k) => {
    for (const [u, v] of [[0.15, 0.2], [1.85, 0.2], [0.15, 0.8], [1.85, 0.8]]) k.box(u - 0.05, v - 0.05, u + 0.05, v + 0.05, 0, 18, M.dark, { edge: false });
    k.box(0.06, 0.1, 1.94, 0.9, 18, 24, M.azure, { lit: 0, front: (d) => d.rect(0.06, 1.94, 18, 20, M.azure[3]) });
    k.box(0.12, 0.16, 1.88, 0.84, 24, 25, M.porcelain, { edge: false, lit: 0 });
    k.box(0.99, 0.16, 1.01, 0.84, 25, 25.5, M.red, { edge: false });
    for (const u of [0.13, 1.87]) k.box(u - 0.02, 0.38, u + 0.02, 0.62, 25, 27, M.neonCyan, { edge: false });
    k.cyl(1.0, 0.5, 0.06, 25, 26, M.dark);
    k.cyl(0.45, 0.5, 0.08, 25, 29, M.red);
    k.cyl(1.55, 0.5, 0.08, 25, 29, M.azure);
  });

  // Dance machine: lit arrow pad platform with a big screen behind.
  item(add, 'dance_machine', [2, 2], 92, (k) => {
    k.box(0.1, 0.0, 1.9, 0.35, 0, 80, M.dark, { front: (d) => {
      d.rect(0.3, 1.7, 30, 70, M.purple[3]);
      d.rect(0.36, 1.64, 34, 66, M.screen[3]);
      for (let i = 0; i < 4; i++) d.rect(0.5 + i * 0.3, 0.62 + i * 0.3, 52 - i * 4, 56 - i * 4, [M.neonPink, M.neonCyan, M.gold, M.leaf][i][1]);
      d.rect(0.3, 1.7, 72, 78, M.neonPink[1]);
    } });
    k.box(0.15, 0.45, 1.85, 1.95, 0, 6, M.steel, { lit: 0 });
    const pads = [[0.62, 0.95, M.neonPink], [1.38, 0.95, M.neonCyan], [1.0, 0.7, M.gold], [1.0, 1.45, M.leaf]];
    for (const [u, v, mat] of pads) k.box(u - 0.17, v - 0.17, u + 0.17, v + 0.17, 6, 7, mat, { edge: false, lit: 0 });
    k.box(0.2, 0.42, 1.8, 0.5, 6, 30, M.chrome, { edge: false }); // safety bar
  });

  // Racing cabinet: bucket seat in front of a screen with a wheel.
  item(add, 'racing_cabinet', [1, 2], 80, (k) => {
    k.box(0.12, 0.05, 0.88, 0.6, 0, 70, M.red, { front: (d) => {
      d.rect(0.18, 0.82, 34, 62, M.dark[3]);
      d.rect(0.22, 0.78, 38, 58, M.azure[2]);
      d.rect(0.22, 0.78, 38, 44, M.leaf[2]);
      d.rect(0.46, 0.54, 44, 54, M.dark[1]);
      d.rect(0.18, 0.82, 64, 69, M.gold[1]);
    } });
    k.box(0.3, 0.55, 0.7, 0.75, 22, 28, M.dark, { edge: false });
    k.cyl(0.5, 0.78, 0.14, 28, 30, M.dark);
    k.box(0.22, 1.1, 0.78, 1.9, 0, 12, M.dark);
    k.box(0.22, 1.1, 0.78, 1.85, 12, 16, M.red, { lit: 0 });
    k.box(0.22, 1.75, 0.78, 1.95, 16, 40, M.red);
  });

  // Token machine: change in, tokens out.
  item(add, 'token_machine', [1, 1], 64, (k) => {
    k.box(0.2, 0.3, 0.8, 0.8, 0, 56, M.gold, { front: (d) => {
      d.rect(0.26, 0.74, 44, 52, M.dark[2]); d.rect(0.3, 0.7, 46, 50, M.neonCyan[1]);
      d.rect(0.3, 0.42, 32, 40, M.dark[1]); d.rect(0.52, 0.7, 34, 38, M.dark[1]);
      d.rect(0.34, 0.66, 10, 18, M.dark[3]); d.rect(0.4, 0.6, 12, 14, M.gold[0]);
    } });
    k.box(0.18, 0.28, 0.82, 0.82, 56, 60, M.gold, { top: M.gold[0] });
  });

  item(add, 'arcade_leaderboard', [2, 1], 96, (k) => {
    for (const u of [0.3, 1.7]) k.box(u - 0.05, 0.45, u + 0.05, 0.55, 0, 40, M.dark, { edge: false });
    k.box(0.05, 0.4, 1.95, 0.6, 40, 88, M.dark, { front: (d) => {
      d.rect(0.1, 1.9, 44, 84, M.purple[3]);
      d.rect(0.3, 1.7, 76, 81, M.gold[1]);
      for (let i = 0; i < 5; i++) {
        const z = 68 - i * 6;
        d.rect(0.2, 0.3, z, z + 3, [M.gold, M.chrome, M.orange, M.neonCyan, M.neonCyan][i][1]);
        d.rect(0.4, 0.4 + 0.9 - i * 0.12, z, z + 3, M.neonCyan[1]);
        d.rect(1.45, 1.8, z, z + 3, M.neonPink[1]);
      }
    } });
  });

  item(add, 'arcade_reserved', [4, 2], 6, (k) => {
    k.box(0.05, 0.05, 3.95, 1.95, 0, 1, M.dark, { edge: false, top: M.dark[2], details: (d) => {
      for (let u = 0.1; u < 3.9; u += 0.3) { d.top(u, 0.05, u + 0.15, 0.15, M.gold[1], 1); d.top(u, 1.85, u + 0.15, 1.95, M.gold[1], 1); }
      for (let v = 0.25; v < 1.8; v += 0.3) { d.top(0.05, v, 0.15, v + 0.15, M.gold[1], 1); d.top(3.85, v, 3.95, v + 0.15, M.gold[1], 1); }
    } });
  }, { symmetric: true, selout: 0.2 });

  item(add, 'capsule_dispenser', [1, 1], 66, (k) => {
    k.box(0.25, 0.25, 0.75, 0.75, 0, 26, M.red, { front: (d) => { d.rect(0.4, 0.6, 8, 14, M.dark[2]); d.rect(0.45, 0.55, 16, 22, M.chrome[1]); } });
    for (const u of [0.38, 0.62]) {
      k.cyl(u, 0.5, 0.13, 26, 46, M.glass, { top: M.glass[0], details: ({ cx, cyT, cyB }) => {
        const cols = [M.red[1], M.gold[1], M.azure[1], M.leaf[1], M.neonPink[1]];
        for (let i = 0; i < 14; i++) k.cv.set(Math.round(cx - 4 + (i * 5) % 9), Math.round(cyB - 2 - ((i * 3) % 12)), cols[i % 5]);
      } });
      k.cyl(u, 0.5, 0.06, 46, 50, M.red);
    }
  });

  item(add, 'gumball_trophy', [1, 1], 66, (k) => {
    k.box(0.25, 0.25, 0.75, 0.75, 0, 20, M.walnut, { front: (d) => d.rect(0.35, 0.65, 8, 12, M.gold[1]) });
    k.cyl(0.5, 0.5, 0.05, 20, 30, M.gold);
    k.cyl(0.5, 0.5, 0.18, 30, 48, M.gold, { top: M.gold[3] });
    for (const u of [0.25, 0.75]) k.box(u - 0.03, 0.47, u + 0.03, 0.53, 36, 44, M.gold, { edge: false });
  }, { symmetric: true });

  item(add, 'pool_table', [2, 1], 40, (k) => {
    for (const [u, v] of [[0.2, 0.2], [1.8, 0.2], [0.2, 0.8], [1.8, 0.8]]) k.box(u - 0.07, v - 0.07, u + 0.07, v + 0.07, 0, 16, M.walnut);
    k.box(0.05, 0.05, 1.95, 0.95, 16, 24, M.walnut, { front: (d) => d.rect(0.05, 1.95, 22, 24, M.walnut[1]) });
    k.box(0.15, 0.15, 1.85, 0.85, 24, 25, M.felt, { edge: false, top: M.felt[2] });
    k.custom(0.15, 0.15, 1.85, 0.85, 25, 27, ({ P, cv }) => {
      for (const [u, v] of [[0.15, 0.15], [1.0, 0.12], [1.85, 0.15], [0.15, 0.85], [1.0, 0.88], [1.85, 0.85]]) {
        const [x, y] = P(u, v, 25); cv.set(Math.round(x), Math.round(y), M.dark[3]); cv.set(Math.round(x) + 1, Math.round(y), M.dark[3]);
      }
      const cols = [M.gold[1], M.red[1], M.azure[1], M.dark[2], M.orange[1], M.purple[1]];
      let i = 0;
      for (let row = 0; row < 3; row++) for (let j = 0; j <= row; j++) {
        const [x, y] = P(1.35 + row * 0.08, 0.5 + (j - row / 2) * 0.1, 26);
        cv.set(Math.round(x), Math.round(y), cols[i++ % cols.length]); cv.set(Math.round(x) + 1, Math.round(y), cols[(i) % cols.length]);
      }
      const [wx, wy] = P(0.55, 0.5, 26); cv.set(Math.round(wx), Math.round(wy), '#ffffff'); cv.set(Math.round(wx) + 1, Math.round(wy), '#ffffff');
      const a = P(0.2, 0.6, 27); const b = P(0.5, 0.52, 27);
      for (let t = 0; t <= 1; t += 0.05) cv.set(Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), M.bamboo[1]);
    });
  });

  // ---- library & study ----
  item(add, 'computer_desk', [2, 1], 64, (k) => {
    for (const u of [0.15, 1.85]) k.box(u - 0.08, 0.2, u + 0.08, 0.85, 0, 24, M.walnut);
    k.box(0.05, 0.15, 1.95, 0.9, 24, 28, M.walnut, { lit: 0 });
    for (const u of [0.5, 1.1]) k.box(u, 0.25, u + 0.5, 0.33, 34, 52, M.dark, { front: (d) => { d.rect(u + 0.04, u + 0.46, 37, 50, M.azure[2]); d.rect(u + 0.08, u + 0.25, 46, 48, M.screen[0]); } });
    for (const u of [0.73, 1.33]) k.box(u, 0.28, u + 0.04, 0.32, 28, 34, M.dark, { edge: false });
    k.box(0.7, 0.5, 1.3, 0.68, 28, 29.5, M.dark, { edge: false });
    k.box(1.7, 0.3, 1.78, 0.38, 28, 46, M.brass, { edge: false });
    k.cyl(1.68, 0.4, 0.1, 46, 52, M.leaf);
  });

  // ---- garden & rooftop ----
  item(add, 'sky_tree', [1, 1], 100, (k) => {
    k.box(0.15, 0.15, 0.85, 0.85, 0, 16, M.stone);
    k.box(0.2, 0.2, 0.8, 0.8, 16, 17, M.walnut, { edge: false });
    k.box(0.46, 0.46, 0.54, 0.54, 17, 46, M.walnut, { edge: false });
    k.foliage(0.5, 0.5, 52, 0.62, M.sakura, 7, { lobes: 10, flowers: { count: 24, color: '#ffffff', hi: M.sakura[0] } });
  }, { symmetric: true });

  item(add, 'garden_bench', [2, 1], 44, (k) => {
    for (const u of [0.1, 1.9]) k.box(u - 0.06, 0.2, u + 0.06, 0.85, 0, 22, M.dark, { edge: false });
    k.box(0.1, 0.35, 1.9, 0.85, 12, 15, M.walnut, { lit: 0, details: (d) => { for (let v = 0.45; v < 0.85; v += 0.12) d.top(0.1, v, 1.9, v + 0.02, M.walnut[3], 15); } });
    k.box(0.1, 0.2, 1.9, 0.3, 16, 36, M.walnut, { front: (d) => { for (const z of [22, 29]) d.rect(0.1, 1.9, z, z + 1, M.walnut[3]); } });
  });

  // ---- garden fit-out (v0.14) ----
  // Clipped boxwood hedge block: rows of them read as one continuous hedge.
  item(add, 'hedge', [1, 1], 40, (k) => {
    k.box(0.04, 0.04, 0.96, 0.96, 0, 4, M.walnut, { edge: false });
    k.box(0.06, 0.06, 0.94, 0.94, 4, 30, M.leaf, { top: M.leaf[1], front: (d) => {
      for (let i = 0; i < 9; i++) d.rect(0.1 + ((i * 37) % 80) / 100, 0.14 + ((i * 37) % 80) / 100, 8 + ((i * 11) % 20), 10 + ((i * 11) % 20), M.leaf[0]);
    } });
  }, { symmetric: true });

  // Raised cedar bed with rows of herbs and lettuces and a few tomatoes.
  item(add, 'raised_bed', [2, 1], 34, (k) => {
    k.box(0.06, 0.1, 1.94, 0.9, 0, 14, M.cedar, { front: (d) => { for (const z of [4, 9]) d.rect(0.06, 1.94, z, z + 1, M.cedar[3]); } });
    k.box(0.12, 0.16, 1.88, 0.84, 13, 14, M.terracotta, { edge: false, lit: 0 });
    for (let i = 0; i < 6; i++) {
      const u = 0.28 + i * 0.29;
      k.foliage(u, 0.33, 15, 0.13, i % 2 ? M.leaf : M.moss, 3 + i, { lobes: 5 });
      k.foliage(u, 0.67, 15, 0.13, i % 3 ? M.leaf : M.moss, 11 + i, { lobes: 5, flowers: i % 2 ? { count: 3, color: M.red[1], hi: M.red[0] } : null });
    }
  });

  // Flat stepping stones set in gravel, for paths through the garden.
  item(add, 'stepping_stone', [1, 1], 4, (k) => {
    k.disc(0.5, 0.5, 0.5, 0, M.sand[2]);
    for (const [u, v, r] of [[0.32, 0.34, 0.2], [0.68, 0.42, 0.18], [0.42, 0.72, 0.19]]) k.disc(u, v, r, 0.5, M.stone[1], { rim: M.stone[3] });
  }, { symmetric: true, selout: 0.15 });

  // Stone garden lantern with a warm glow.
  item(add, 'garden_lantern', [1, 1], 54, (k) => {
    k.box(0.3, 0.3, 0.7, 0.7, 0, 6, M.stone);
    k.box(0.43, 0.43, 0.57, 0.57, 6, 22, M.stone, { edge: false });
    k.box(0.32, 0.32, 0.68, 0.68, 22, 34, M.stone, { front: (d) => d.rect(0.4, 0.6, 25, 31, M.gold[0]) });
    k.box(0.26, 0.26, 0.74, 0.74, 34, 38, M.stone, { top: M.stone[0] });
    k.box(0.45, 0.45, 0.55, 0.55, 38, 42, M.stone, { edge: false });
  }, { symmetric: true });

  // Bird bath: a small stone basin of water on a pedestal.
  item(add, 'bird_bath', [1, 1], 30, (k) => {
    k.cyl(0.5, 0.5, 0.22, 0, 3, M.stone);
    k.cyl(0.5, 0.5, 0.08, 3, 16, M.stone);
    k.cyl(0.5, 0.5, 0.34, 16, 20, M.stone, { top: M.stone[0] });
    k.disc(0.5, 0.5, 0.27, 20, M.water[2], { rim: M.stone[1] });
  }, { symmetric: true });

  // Low planter box used as a divider (garden zones, restaurant sections).
  item(add, 'planter_divider', [2, 1], 46, (k) => {
    k.box(0.04, 0.22, 1.96, 0.78, 0, 16, M.walnut, { front: (d) => d.rect(0.04, 1.96, 13, 15, M.walnut[0]) });
    for (let i = 0; i < 5; i++) k.foliage(0.22 + i * 0.39, 0.5, 18, 0.24, M.leaf, 21 + i, { lobes: 7 });
  });

  item(add, 'flower_planter', [2, 1], 48, (k) => {
    k.box(0.05, 0.1, 1.95, 0.9, 0, 18, M.stone, { front: (d) => d.rect(0.05, 1.95, 14, 16, M.stone[0]) });
    k.foliage(0.45, 0.5, 20, 0.38, M.leaf, 2, { flowers: { count: 12, color: M.lavender[1], hi: M.azure[0] } });
    k.foliage(1.0, 0.5, 20, 0.38, M.leaf, 5, { flowers: { count: 12, color: M.gold[1], hi: M.gold[0] } });
    k.foliage(1.55, 0.5, 20, 0.38, M.leaf, 9, { flowers: { count: 12, color: M.sakura[1], hi: '#ffffff' } });
  });

  item(add, 'pergola', [2, 2], 104, (k) => {
    for (const [u, v] of [[0.1, 0.1], [1.9, 0.1], [0.1, 1.9], [1.9, 1.9]]) k.box(u - 0.06, v - 0.06, u + 0.06, v + 0.06, 0, 84, M.cedar);
    for (const v of [0.1, 1.9]) k.box(0.0, v - 0.05, 2.0, v + 0.05, 84, 90, M.cedar);
    for (let u = 0.2; u < 1.9; u += 0.3) k.box(u - 0.03, 0.0, u + 0.03, 2.0, 90, 93, M.cedar, { edge: false });
    k.custom(0, 0, 2, 2, 70, 100, ({ P, cv }) => {
      for (let i = 0; i < 70; i++) {
        const u = (i * 37 % 100) / 50; const v = (i * 53 % 100) / 50;
        const [x, y] = P(u, v, 93 - (i % 5));
        for (let d = 0; d < 3 + (i % 6); d++) cv.set(Math.round(x), Math.round(y + d), d % 2 ? M.lavender[1] : M.purple[1]);
        cv.set(Math.round(x) + 1, Math.round(y), M.leaf[2]);
      }
    });
  }, { symmetric: true });

  item(add, 'koi_pond', [2, 2], 20, (k) => {
    k.cyl(1, 1, 0.9, 0, 6, M.slate);
    k.disc(1, 1, 0.8, 6, M.water[3], { rim: M.slate[2] });
    k.custom(0.2, 0.2, 1.8, 1.8, 6, 8, ({ P, cv }) => {
      for (const [u, v, c] of [[0.7, 0.8, M.orange[1]], [1.3, 1.1, '#ffffff'], [1.0, 1.4, M.orange[2]]]) {
        const [x, y] = P(u, v, 6);
        for (let d = -2; d <= 2; d++) cv.set(Math.round(x + d), Math.round(y), c);
        cv.set(Math.round(x - 3), Math.round(y), c);
      }
      for (const [u, v] of [[0.5, 1.2], [1.4, 0.6], [1.2, 1.5]]) {
        const [x, y] = P(u, v, 6.5);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx / 9 + dy * dy <= 1) cv.set(Math.round(x + dx), Math.round(y + dy), M.leaf[1]);
        cv.set(Math.round(x), Math.round(y), M.sakura[1]);
      }
    });
  }, { symmetric: true });

  // Coin-operated binocular viewers; the plate colour hints at the city.
  for (const [id, plate] of [['sky_viewer_nyc', M.azure], ['sky_viewer_singapore', M.red], ['sky_viewer_tokyo', M.neonPink], ['sky_viewer_paris', M.lavender]]) {
    item(add, id, [1, 1], 60, (k) => {
      k.box(0.15, 0.15, 0.85, 0.85, 0, 6, M.stone);
      k.cyl(0.5, 0.5, 0.08, 6, 34, M.steel);
      k.box(0.3, 0.35, 0.7, 0.75, 34, 46, M.steel, { front: (d) => { d.rect(0.35, 0.45, 38, 43, M.dark[3]); d.rect(0.55, 0.65, 38, 43, M.dark[3]); } });
      k.box(0.35, 0.25, 0.65, 0.35, 38, 44, plate, { edge: false });
    });
  }

  // ---- suite ----
  item(add, 'suite_bed', [2, 2], 56, (k) => {
    k.box(0.05, 0.0, 1.95, 0.18, 0, 48, M.walnut, { front: (d) => {
      for (let u = 0.2; u < 1.8; u += 0.3) for (let z = 26; z < 44; z += 6) d.rect(u, u + 0.04, z, z + 2, M.walnut[3]);
    } });
    k.box(0.05, 0.18, 1.95, 1.95, 0, 14, M.walnut);
    k.box(0.1, 0.18, 1.9, 1.9, 14, 22, M.linen, { lit: 0, front: (d) => d.rect(0.1, 1.9, 14, 22, M.linen[2]) });
    k.box(0.1, 0.75, 1.9, 1.92, 22, 25, M.lavender, { lit: 0, front: (d) => d.rect(0.1, 1.9, 14, 25, M.lavender[2]) });
    for (const u of [0.25, 1.05]) k.box(u, 0.25, u + 0.7, 0.6, 22, 28, M.porcelain, { lit: 0 });
  });
}
