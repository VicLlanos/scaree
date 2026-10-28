/**
 * EMBER & ECHO — entity classes
 */
import {
  TILE, GRAVITY, MAX_FALL, JUMP_V, GROUND_SPEED, AIR_SPEED,
  COYOTE_FRAMES, JUMP_BUFFER_FRAMES, applyGravity, collideTiles, standingOn, overlaps
} from './physics.js';

/* ─── PLAYER ───────────────────────────────────────── */
export class Player {
  constructor(x, y, role) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.w = 24; this.h = 32;
    this.role = role; // 'ember' | 'echo'
    this.grounded = false;
    this.coyote = 0;
    this.jumpBuf = 0;
    this.holding = null; // crate id
    this.facing = 1;
    this.anim = 0;
    this.dead = false;
    this.checkpoint = { x, y };
    this._prevY = y;
  }

  color() { return this.role === 'echo' ? '#3fb8a8' : '#e8a33d'; }

  update(input, tiles, solidFn, platforms) {
    if (this.dead) return;

    // Horizontal
    const speed = this.grounded ? GROUND_SPEED : AIR_SPEED;
    const carrySlow = this.holding ? 0.65 : 1;
    if (input.left) { this.vx = -speed * carrySlow; this.facing = -1; }
    else if (input.right) { this.vx = speed * carrySlow; this.facing = 1; }
    else this.vx *= this.grounded ? 0.6 : 0.85;

    // Coyote + buffer
    if (this.grounded) this.coyote = COYOTE_FRAMES;
    else if (this.coyote > 0) this.coyote--;
    if (input.jumpPressed) this.jumpBuf = JUMP_BUFFER_FRAMES;
    else if (this.jumpBuf > 0) this.jumpBuf--;

    if (this.jumpBuf > 0 && this.coyote > 0) {
      this.vy = JUMP_V;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuf = 0;
      // Auto-drop crate on jump
      if (this.holding) this.holding = null;
    }

    applyGravity(this);

    // Moving platforms carry
    if (platforms) {
      for (const p of platforms) {
        if (standingOn(this, p)) {
          this.x += p.dx || 0;
          this.grounded = true;
          this.vy = 0;
          this.y = p.y - this.h;
        }
      }
    }

    collideTiles(this, tiles, solidFn);
    this.anim += Math.abs(this.vx) * 0.15;
  }

  respawn() {
    this.x = this.checkpoint.x;
    this.y = this.checkpoint.y;
    this.vx = 0; this.vy = 0;
    this.dead = false;
    this.holding = null;
  }

  draw(ctx, camX, camY) {
    const px = this.x - camX;
    const py = this.y - camY;
    const bob = this.grounded ? Math.sin(this.anim) * 1.5 : 0;
    const lean = Math.max(-0.15, Math.min(0.15, this.vx * 0.03));

    // Glow
    const g = ctx.createRadialGradient(px + 12, py + 16, 2, px + 12, py + 16, 28);
    g.addColorStop(0, this.role === 'echo' ? 'rgba(63,184,168,0.35)' : 'rgba(232,163,61,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px + 12, py + 16, 28, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.save();
    ctx.translate(px + 12, py + 16 + bob);
    ctx.transform(1, 0, lean, 1, 0, 0);
    ctx.fillStyle = this.color();
    roundRect(ctx, -12, -16, 24, 32, 5);
    // Eyes
    ctx.fillStyle = '#1a2438';
    ctx.fillRect(-6, -8, 4, 4);
    ctx.fillRect(3, -8, 4, 4);
    ctx.restore();
  }
}

/* ─── CRATE ────────────────────────────────────────── */
export class Crate {
  constructor(id, x, y) {
    this.id = id;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.w = 28; this.h = 28;
    this.heldBy = null;
    this._prevY = y;
    this.grounded = false;
  }

  update(tiles, solidFn, holder) {
    if (this.heldBy && holder) {
      // Snap in front of holder
      this.x = holder.x + (holder.facing > 0 ? holder.w + 2 : -this.w - 2);
      this.y = holder.y + 4;
      this.vx = 0; this.vy = 0;
      return;
    }
    this.heldBy = null;
    applyGravity(this);
    this.vx *= 0.92;
    collideTiles(this, tiles, solidFn);
  }

  draw(ctx, camX, camY) {
    const px = this.x - camX, py = this.y - camY;
    ctx.fillStyle = '#8a6a3a';
    ctx.fillRect(px, py, this.w, this.h);
    ctx.fillStyle = '#a08050';
    ctx.fillRect(px + 2, py + 2, this.w - 4, 4);
    ctx.strokeStyle = '#5a4020';
    ctx.strokeRect(px + 0.5, py + 0.5, this.w - 1, this.h - 1);
  }
}

/* ─── PRESSURE PLATE ───────────────────────────────── */
export class PressurePlate {
  constructor(id, x, y, linksDoor) {
    this.id = id;
    this.x = x; this.y = y;
    this.w = 32; this.h = 8;
    this.pressed = false;
    this.linksDoor = linksDoor;
  }

  check(bodies) {
    let on = false;
    for (const b of bodies) {
      if (b.x + b.w > this.x + 2 && b.x < this.x + this.w - 2 &&
          b.y + b.h >= this.y - 2 && b.y + b.h <= this.y + this.h + 6) {
        on = true; break;
      }
    }
    const changed = on !== this.pressed;
    this.pressed = on;
    return changed;
  }

  draw(ctx, camX, camY) {
    const px = this.x - camX, py = this.y - camY + (this.pressed ? 3 : 0);
    ctx.fillStyle = this.pressed ? '#e8c060' : '#5a5040';
    ctx.fillRect(px, py, this.w, this.h - (this.pressed ? 3 : 0));
  }
}

/* ─── LEVER ────────────────────────────────────────── */
export class Lever {
  constructor(id, x, y, linksDoor) {
    this.id = id;
    this.x = x; this.y = y;
    this.w = 20; this.h = 40;
    this.on = false;
    this.linksDoor = linksDoor;
  }

  toggle() { this.on = !this.on; return this.on; }

  draw(ctx, camX, camY) {
    const px = this.x - camX, py = this.y - camY;
    ctx.fillStyle = '#444';
    ctx.fillRect(px + 8, py + 10, 4, 30);
    ctx.save();
    ctx.translate(px + 10, py + 14);
    ctx.rotate(this.on ? 0.6 : -0.6);
    ctx.fillStyle = this.on ? '#3fb8a8' : '#e8a33d';
    ctx.fillRect(-3, -12, 6, 16);
    ctx.restore();
  }
}

/* ─── DOOR ─────────────────────────────────────────── */
export class Door {
  constructor(id, x, y) {
    this.id = id;
    this.x = x; this.y = y;
    this.w = 32; this.h = 96;
    this.open = false;
  }

  draw(ctx, camX, camY) {
    if (this.open) {
      ctx.globalAlpha = 0.2;
    }
    const px = this.x - camX, py = this.y - camY;
    ctx.fillStyle = '#5a3a2a';
    ctx.fillRect(px, py, this.w, this.h);
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(px + 4, py + 8, this.w - 8, this.h - 16);
    ctx.globalAlpha = 1;
  }
}

/* ─── MOVING PLATFORM ──────────────────────────────── */
export class MovingPlatform {
  constructor(id, x1, y1, x2, y2, period = 3000) {
    this.id = id;
    this.x1 = x1; this.y1 = y1;
    this.x2 = x2; this.y2 = y2;
    this.period = period;
    this.w = 64; this.h = 12;
    this.x = x1; this.y = y1;
    this.dx = 0; this.dy = 0;
  }

  // Deterministic from Date.now() — no networking needed
  update() {
    const t = (Date.now() % (this.period * 2)) / this.period;
    const s = t < 1 ? t : 2 - t; // ping-pong 0→1→0
    const nx = this.x1 + (this.x2 - this.x1) * s;
    const ny = this.y1 + (this.y2 - this.y1) * s;
    this.dx = nx - this.x;
    this.dy = ny - this.y;
    this.x = nx; this.y = ny;
  }

  draw(ctx, camX, camY) {
    const px = this.x - camX, py = this.y - camY;
    ctx.fillStyle = '#6a7a8a';
    ctx.fillRect(px, py, this.w, this.h);
    ctx.fillStyle = '#8a9aaa';
    ctx.fillRect(px, py, this.w, 3);
  }
}

/* ─── RUNE ─────────────────────────────────────────── */
export class Rune {
  constructor(id, x, y) {
    this.id = id;
    this.x = x; this.y = y;
    this.w = 32; this.h = 10;
    this.active = false;
  }

  check(player) {
    return player.grounded &&
      player.x + player.w > this.x + 4 &&
      player.x < this.x + this.w - 4 &&
      player.y + player.h >= this.y - 4 &&
      player.y + player.h <= this.y + 14;
  }

  draw(ctx, camX, camY) {
    const px = this.x - camX, py = this.y - camY;
    ctx.fillStyle = this.active ? '#e8a33d' : '#4a3a28';
    ctx.beginPath();
    ctx.moveTo(px + 16, py);
    ctx.lineTo(px + 32, py + 10);
    ctx.lineTo(px, py + 10);
    ctx.closePath();
    ctx.fill();
  }
}

/* ─── SHARD ────────────────────────────────────────── */
export class Shard {
  constructor(id, x, y, index) {
    this.id = id;
    this.x = x; this.y = y;
    this.index = index;
    this.w = 20; this.h = 20;
    this.collected = false;
    this.bob = 0;
  }

  update() { this.bob += 0.08; }

  draw(ctx, camX, camY) {
    if (this.collected) return;
    const px = this.x - camX, py = this.y - camY + Math.sin(this.bob) * 4;
    const cols = ['#e8a33d', '#3fb8a8', '#c8a0e8', '#f0e8a0'];
    ctx.fillStyle = cols[this.index] || '#e8a33d';
    ctx.beginPath();
    ctx.moveTo(px + 10, py);
    ctx.lineTo(px + 20, py + 10);
    ctx.lineTo(px + 10, py + 20);
    ctx.lineTo(px, py + 10);
    ctx.closePath();
    ctx.fill();
    // Glow
    ctx.fillStyle = 'rgba(255,255,200,0.3)';
    ctx.beginPath();
    ctx.arc(px + 10, py + 10, 14, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* ─── NPC ──────────────────────────────────────────── */
export class NPC {
  constructor(id, x, y, name, lines) {
    this.id = id;
    this.x = x; this.y = y;
    this.w = 24; this.h = 36;
    this.name = name;
    this.lines = lines;
  }

  draw(ctx, camX, camY) {
    const px = this.x - camX, py = this.y - camY;
    ctx.fillStyle = '#c8b070';
    roundRect(ctx, px, py, this.w, this.h, 4);
    ctx.fillStyle = '#1a2438';
    ctx.fillRect(px + 5, py + 10, 3, 3);
    ctx.fillRect(px + 15, py + 10, 3, 3);
    ctx.fillStyle = '#f6e9d5';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.name, px + 12, py - 4);
  }
}

/* ─── PORTAL ───────────────────────────────────────── */
export class Portal {
  constructor(x, y, toZone, tx, ty) {
    this.x = x; this.y = y;
    this.w = 32; this.h = 64;
    this.toZone = toZone;
    this.tx = tx; this.ty = ty;
  }

  draw(ctx, camX, camY) {
    const px = this.x - camX, py = this.y - camY;
    const g = ctx.createLinearGradient(px, py, px + 32, py);
    g.addColorStop(0, 'rgba(63,184,168,0.3)');
    g.addColorStop(0.5, 'rgba(63,184,168,0.7)');
    g.addColorStop(1, 'rgba(63,184,168,0.3)');
    ctx.fillStyle = g;
    ctx.fillRect(px, py, 32, 64);
    ctx.strokeStyle = '#3fb8a8';
    ctx.strokeRect(px + 2, py + 2, 28, 60);
  }
}

/* ─── helpers ──────────────────────────────────────── */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}
