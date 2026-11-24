// 2D overlay drawing (on #gameCanvas, above the Pixi canvas): the elevator
// door transition between floors.

export function drawElevatorTransition(ctx, width, height, anim, now) {
  const t = Math.max(0, Math.min(1, (now - anim.start) / anim.duration));
  // Door close-then-open curve: peaks at t = 0.5
  const closeAmt = Math.sin(t * Math.PI);
  if (closeAmt <= 0.01) return;

  ctx.save();
  const panelW = Math.round((width * 0.52) * closeAmt);
  ctx.fillStyle = 'rgba(18, 16, 32, 0.88)';
  ctx.fillRect(0, 0, panelW, height);
  ctx.fillRect(width - panelW, 0, panelW, height);
  ctx.fillStyle = '#d8a848';
  ctx.fillRect(panelW - 4, 0, 4, height);
  ctx.fillRect(width - panelW, 0, 4, height);

  // Central digital floor counter badge
  const curFloorNum = Math.round(anim.fromFloor + (anim.toFloor - anim.fromFloor) * t);
  const curFloorBadge = (curFloorNum >= 10 && anim.toFloor >= 10) ? 'ROOFTOP (R)' : `FLOOR ${curFloorNum}`;
  const boxW = 220;
  const boxH = 68;
  const bx = Math.round((width - boxW) / 2);
  const by = Math.round(height * 0.16);
  ctx.fillStyle = 'rgba(24, 18, 44, 0.96)';
  ctx.strokeStyle = '#ffd27a';
  ctx.lineWidth = 2.5;
  roundRect(ctx, bx, by, boxW, boxH, 10);
  ctx.fill();
  ctx.stroke();

  ctx.font = '700 18px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#ffd27a';
  ctx.textAlign = 'center';
  ctx.fillText(`🛗 ${curFloorBadge}`, width / 2, by + 28);
  ctx.font = '600 14px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#f2e9ff';
  ctx.fillText(anim.toName, width / 2, by + 52);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
