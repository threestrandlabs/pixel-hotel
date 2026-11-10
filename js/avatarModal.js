// Avatar Creator Modal Controller for Pixel Hotel v0.9.0.
// Live voxel preview, rotating view, responsive tabs, shop unlocks, randomise & save.

import {
  SKIN_TONES, EYE_PRESETS, MOUTH_PRESETS,
  HAIR_STYLES, HAIR_COLORS,
  TOP_STYLES, TOP_COLORS,
  BOTTOM_STYLES, BOTTOM_COLORS,
  SHOE_COLORS,
  ACCESSORY_STYLES, ACCESSORY_COLORS,
  DEFAULT_PLAYER_LOOK, validateAvatarLook, randomizeLook,
} from './avatar.js';
import { renderCharacter } from './voxel.js';

let host = null;
let avatarDraft = null;
let currentPreviewDir = 'down';
let activeCategoryTab = 'skin';

const PREVIEW_DIRS = ['down', 'left', 'up', 'right'];
const DIR_LABELS = { down: 'Front', left: 'Left', up: 'Back', right: 'Right' };

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function updatePreviewCanvas() {
  const canvas = document.getElementById('avatarPreviewCanvas');
  if (!canvas || !avatarDraft) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  const look = validateAvatarLook(avatarDraft) || DEFAULT_PLAYER_LOOK;
  const pose = { stride: 0, sit: false, lie: false, blink: false, breathe: 0 };
  const rendered = renderCharacter(look, currentPreviewDir, pose, makeCanvas, dpr * 1.5);

  if (rendered && rendered.canvas) {
    const scale = (dpr * 1.5);
    const drawW = rendered.canvas.width / scale;
    const drawH = rendered.canvas.height / scale;
    const destX = Math.round((w - drawW) / 2);
    const destY = Math.round((h - drawH) / 2 + 10);
    ctx.imageRendering = 'pixelated';
    ctx.drawImage(rendered.canvas, destX, destY, drawW, drawH);
  }

  const dirLabel = document.getElementById('avatarDirLabel');
  if (dirLabel) dirLabel.textContent = DIR_LABELS[currentPreviewDir] || 'Front';
}

function isItemUnlocked(prefix, id, cost) {
  if (!cost) return true;
  const state = host.getState();
  const key = `${prefix}:${id}`;
  return Array.isArray(state.unlocked) && state.unlocked.includes(key);
}

function tryUnlockItem(prefix, id, name, cost) {
  if (!cost) return true;
  const state = host.getState();
  const key = `${prefix}:${id}`;
  if (Array.isArray(state.unlocked) && state.unlocked.includes(key)) return true;

  if (state.coins < cost) {
    host.showToast(`Not enough coins! (Costs ${cost} coins)`);
    return false;
  }

  state.coins -= cost;
  if (!Array.isArray(state.unlocked)) state.unlocked = [];
  state.unlocked.push(key);
  host.spendCoins(cost);
  host.showToast(`Unlocked ${name}! (-${cost} coins) ✨`);
  return true;
}

function renderTabContent() {
  const container = document.getElementById('avatarTabContent');
  if (!container || !avatarDraft) return;
  container.innerHTML = '';

  const createGroup = (title) => {
    const group = document.createElement('div');
    group.className = 'avatar-option-group';
    const h = document.createElement('div');
    h.className = 'avatar-option-title';
    h.textContent = title;
    group.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'avatar-options-grid';
    group.appendChild(grid);
    return { group, grid };
  };

  switch (activeCategoryTab) {
    case 'skin': {
      const { group, grid } = createGroup('Skin Tone');
      for (const t of SKIN_TONES) {
        const btn = document.createElement('button');
        btn.className = `pixel-btn avatar-choice-btn ${avatarDraft.skin === t.color ? 'selected' : ''}`;
        btn.innerHTML = `<span class="avatar-swatch-circle" style="background:${t.color};"></span><span>${t.name}</span>`;
        btn.addEventListener('click', () => {
          avatarDraft.skin = t.color;
          renderTabContent();
          updatePreviewCanvas();
        });
        grid.appendChild(btn);
      }
      container.appendChild(group);
      break;
    }

    case 'face': {
      const { group: eyeGroup, grid: eyeGrid } = createGroup('Eye Preset');
      for (const p of EYE_PRESETS) {
        const isSel = avatarDraft.eye === p.eyeColor && Boolean(avatarDraft.lashes) === Boolean(p.lashes);
        const btn = document.createElement('button');
        btn.className = `pixel-btn avatar-choice-btn ${isSel ? 'selected' : ''}`;
        btn.innerHTML = `<span class="avatar-swatch-circle" style="background:${p.eyeColor};"></span><span>${p.name}</span>`;
        btn.addEventListener('click', () => {
          avatarDraft.eye = p.eyeColor;
          avatarDraft.lashes = p.lashes;
          renderTabContent();
          updatePreviewCanvas();
        });
        eyeGrid.appendChild(btn);
      }
      container.appendChild(eyeGroup);

      const { group: mouthGroup, grid: mouthGrid } = createGroup('Mouth Expression');
      for (const m of MOUTH_PRESETS) {
        const btn = document.createElement('button');
        btn.className = `pixel-btn avatar-choice-btn ${avatarDraft.mouth === m.mouth ? 'selected' : ''}`;
        btn.textContent = m.name;
        btn.addEventListener('click', () => {
          avatarDraft.mouth = m.mouth;
          renderTabContent();
          updatePreviewCanvas();
        });
        mouthGrid.appendChild(btn);
      }
      container.appendChild(mouthGroup);
      break;
    }

    case 'hair': {
      const { group: styleGroup, grid: styleGrid } = createGroup('Hairstyle');
      for (const s of HAIR_STYLES) {
        const unlocked = isItemUnlocked('hair', s.id, s.cost);
        const isSel = avatarDraft.hairStyle === s.id;
        const btn = document.createElement('button');
        btn.className = `pixel-btn avatar-choice-btn ${isSel ? 'selected' : ''} ${!unlocked ? 'locked' : ''}`;
        btn.textContent = !unlocked ? `${s.name} (💰${s.cost})` : s.name;
        btn.addEventListener('click', () => {
          if (!unlocked) {
            if (!tryUnlockItem('hair', s.id, s.name, s.cost)) return;
          }
          avatarDraft.hairStyle = s.id;
          renderTabContent();
          updatePreviewCanvas();
        });
        styleGrid.appendChild(btn);
      }
      container.appendChild(styleGroup);

      const { group: colGroup, grid: colGrid } = createGroup('Hair Colour');
      for (const c of HAIR_COLORS) {
        const btn = document.createElement('button');
        btn.className = `pixel-btn avatar-choice-btn ${avatarDraft.hair === c.color ? 'selected' : ''}`;
        btn.innerHTML = `<span class="avatar-swatch-circle" style="background:${c.color};"></span><span>${c.name}</span>`;
        btn.addEventListener('click', () => {
          avatarDraft.hair = c.color;
          renderTabContent();
          updatePreviewCanvas();
        });
        colGrid.appendChild(btn);
      }
      container.appendChild(colGroup);
      break;
    }

    case 'top': {
      const { group: styleGroup, grid: styleGrid } = createGroup('Top Style');
      for (const t of TOP_STYLES) {
        const unlocked = isItemUnlocked('top', t.id, t.cost);
        const isSel = avatarDraft.outfit === t.outfit;
        const btn = document.createElement('button');
        btn.className = `pixel-btn avatar-choice-btn ${isSel ? 'selected' : ''} ${!unlocked ? 'locked' : ''}`;
        btn.textContent = !unlocked ? `${t.name} (💰${t.cost})` : t.name;
        btn.addEventListener('click', () => {
          if (!unlocked) {
            if (!tryUnlockItem('top', t.id, t.name, t.cost)) return;
          }
          avatarDraft.outfit = t.outfit;
          renderTabContent();
          updatePreviewCanvas();
        });
        styleGrid.appendChild(btn);
      }
      container.appendChild(styleGroup);

      const { group: colGroup, grid: colGrid } = createGroup('Top Colour');
      for (const c of TOP_COLORS) {
        const btn = document.createElement('button');
        btn.className = `pixel-btn avatar-choice-btn ${avatarDraft.shirt === c.color ? 'selected' : ''}`;
        btn.innerHTML = `<span class="avatar-swatch-circle" style="background:${c.color};"></span><span>${c.name}</span>`;
        btn.addEventListener('click', () => {
          avatarDraft.shirt = c.color;
          renderTabContent();
          updatePreviewCanvas();
        });
        colGrid.appendChild(btn);
      }
      container.appendChild(colGroup);
      break;
    }

    case 'bottom': {
      const { group: styleGroup, grid: styleGrid } = createGroup('Bottom Style');
      for (const b of BOTTOM_STYLES) {
        const unlocked = isItemUnlocked('bottom', b.id, b.cost);
        const isSel = Boolean(avatarDraft.skirt) === Boolean(b.skirt);
        const btn = document.createElement('button');
        btn.className = `pixel-btn avatar-choice-btn ${isSel ? 'selected' : ''} ${!unlocked ? 'locked' : ''}`;
        btn.textContent = !unlocked ? `${b.name} (💰${b.cost})` : b.name;
        btn.addEventListener('click', () => {
          if (!unlocked) {
            if (!tryUnlockItem('bottom', b.id, b.name, b.cost)) return;
          }
          avatarDraft.skirt = b.skirt;
          renderTabContent();
          updatePreviewCanvas();
        });
        styleGrid.appendChild(btn);
      }
      container.appendChild(styleGroup);

      const { group: colGroup, grid: colGrid } = createGroup('Bottom Colour');
      for (const c of BOTTOM_COLORS) {
        const btn = document.createElement('button');
        btn.className = `pixel-btn avatar-choice-btn ${avatarDraft.pants === c.color ? 'selected' : ''}`;
        btn.innerHTML = `<span class="avatar-swatch-circle" style="background:${c.color};"></span><span>${c.name}</span>`;
        btn.addEventListener('click', () => {
          avatarDraft.pants = c.color;
          renderTabContent();
          updatePreviewCanvas();
        });
        colGrid.appendChild(btn);
      }
      container.appendChild(colGroup);
      break;
    }

    case 'shoes': {
      const { group: colGroup, grid: colGrid } = createGroup('Shoes & Colour');
      for (const s of SHOE_COLORS) {
        const unlocked = isItemUnlocked('shoe', s.id, s.cost);
        const btn = document.createElement('button');
        btn.className = `pixel-btn avatar-choice-btn ${avatarDraft.shoe === s.color ? 'selected' : ''} ${!unlocked ? 'locked' : ''}`;
        btn.innerHTML = `<span class="avatar-swatch-circle" style="background:${s.color};"></span><span>${!unlocked ? `${s.name} (💰${s.cost})` : s.name}</span>`;
        btn.addEventListener('click', () => {
          if (!unlocked) {
            if (!tryUnlockItem('shoe', s.id, s.name, s.cost)) return;
          }
          avatarDraft.shoe = s.color;
          renderTabContent();
          updatePreviewCanvas();
        });
        colGrid.appendChild(btn);
      }
      container.appendChild(colGroup);
      break;
    }

    case 'accessory': {
      const { group: styleGroup, grid: styleGrid } = createGroup('Accessory Type');
      for (const a of ACCESSORY_STYLES) {
        const unlocked = isItemUnlocked('accessory', a.id, a.cost);
        const isSel = (avatarDraft.accessory || 'none') === a.id;
        const btn = document.createElement('button');
        btn.className = `pixel-btn avatar-choice-btn ${isSel ? 'selected' : ''} ${!unlocked ? 'locked' : ''}`;
        btn.textContent = !unlocked ? `${a.name} (💰${a.cost})` : a.name;
        btn.addEventListener('click', () => {
          if (!unlocked) {
            if (!tryUnlockItem('accessory', a.id, a.name, a.cost)) return;
          }
          avatarDraft.accessory = a.id;
          renderTabContent();
          updatePreviewCanvas();
        });
        styleGrid.appendChild(btn);
      }
      container.appendChild(styleGroup);

      if (avatarDraft.accessory && avatarDraft.accessory !== 'none') {
        const { group: colGroup, grid: colGrid } = createGroup('Accessory Colour');
        for (const c of ACCESSORY_COLORS) {
          const btn = document.createElement('button');
          btn.className = `pixel-btn avatar-choice-btn ${avatarDraft.accessoryColor === c.color ? 'selected' : ''}`;
          btn.innerHTML = `<span class="avatar-swatch-circle" style="background:${c.color};"></span><span>${c.name}</span>`;
          btn.addEventListener('click', () => {
            avatarDraft.accessoryColor = c.color;
            renderTabContent();
            updatePreviewCanvas();
          });
          colGrid.appendChild(btn);
        }
        container.appendChild(colGroup);
      }
      break;
    }
  }
}

export function openAvatarModal() {
  const modal = document.getElementById('avatarModal');
  if (!modal) return;
  const current = host.getState().player.look || DEFAULT_PLAYER_LOOK;
  avatarDraft = { ...DEFAULT_PLAYER_LOOK, ...current };
  currentPreviewDir = 'down';
  activeCategoryTab = 'skin';

  document.querySelectorAll('.avatar-tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === activeCategoryTab);
  });

  renderTabContent();
  updatePreviewCanvas();
  modal.classList.remove('hidden');
}

export function closeAvatarModal() {
  const modal = document.getElementById('avatarModal');
  if (modal) modal.classList.add('hidden');
}

export function isAvatarModalOpen() {
  const modal = document.getElementById('avatarModal');
  return modal && !modal.classList.contains('hidden');
}

export function initAvatarModal(hostApi) {
  host = hostApi;

  // Category tab clicks
  document.querySelectorAll('.avatar-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeCategoryTab = btn.dataset.tab;
      document.querySelectorAll('.avatar-tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderTabContent();
    });
  });

  // Rotate preview controls
  document.getElementById('btnRotateAvatarLeft')?.addEventListener('click', () => {
    const idx = PREVIEW_DIRS.indexOf(currentPreviewDir);
    currentPreviewDir = PREVIEW_DIRS[(idx - 1 + PREVIEW_DIRS.length) % PREVIEW_DIRS.length];
    updatePreviewCanvas();
  });
  document.getElementById('btnRotateAvatarRight')?.addEventListener('click', () => {
    const idx = PREVIEW_DIRS.indexOf(currentPreviewDir);
    currentPreviewDir = PREVIEW_DIRS[(idx + 1) % PREVIEW_DIRS.length];
    updatePreviewCanvas();
  });

  // Randomise button
  document.getElementById('btnRandomizeAvatar')?.addEventListener('click', () => {
    const unlocked = host.getState().unlocked || [];
    avatarDraft = randomizeLook(unlocked);
    renderTabContent();
    updatePreviewCanvas();
  });

  // Close buttons
  document.getElementById('btnAvatarCloseTop')?.addEventListener('click', closeAvatarModal);
  document.getElementById('btnCancelAvatar')?.addEventListener('click', closeAvatarModal);
  document.getElementById('avatarModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'avatarModal') closeAvatarModal();
  });

  // Save button
  document.getElementById('btnSaveAvatar')?.addEventListener('click', () => {
    if (!avatarDraft) return;
    const validated = validateAvatarLook(avatarDraft);
    host.onLookSaved(validated);
    closeAvatarModal();
  });
}
