/**
 * EMBER & ECHO — physics helpers
 * AABB, gravity, axis-separated collision resolution
 */

export const TILE = 32;
export const GRAVITY = 0.55;
export const MAX_FALL = 14;
export const JUMP_V = -11.2;
export const GROUND_SPEED = 3.4;
export const AIR_SPEED = 2.8;
export const COYOTE_FRAMES = 6;
export const JUMP_BUFFER_FRAMES = 6;

/** Axis-aligned bounding box */
export function aabb(x, y, w, h) {
  return { x, y, w, h };
}

export function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Resolve dynamic body vs solid tile grid.
 * tiles: 2D array, solid(t) returns true for blocking tiles.
 * Mutates body {x,y,vx,vy,w,h,grounded}.
 */
export function collideTiles(body, tiles, solidFn) {
  const rows = tiles.length;
  const cols = tiles[0]?.length || 0;
  body.grounded = false;

  // --- X axis ---
  body.x += body.vx;
  let bx = body.x, by = body.y, bw = body.w, bh = body.h;
  const x0 = Math.floor(bx / TILE);
  const x1 = Math.floor((bx + bw - 0.01) / TILE);
  const y0 = Math.floor(by / TILE);
  const y1 = Math.floor((by + bh - 0.01) / TILE);

  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (ty < 0 || tx < 0 || ty >= rows || tx >= cols) continue;
      const t = tiles[ty][tx];
      if (!solidFn(t, false)) continue;
      const tileBox = { x: tx * TILE, y: ty * TILE, w: TILE, h: TILE };
      if (!overlaps({ x: bx, y: by, w: bw, h: bh }, tileBox)) continue;
      if (body.vx > 0) {
        body.x = tileBox.x - bw;
        body.vx = 0;
      } else if (body.vx < 0) {
        body.x = tileBox.x + tileBox.w;
        body.vx = 0;
      }
      bx = body.x;
    }
  }

  // --- Y axis ---
  body.y += body.vy;
  bx = body.x; by = body.y;
  const x0b = Math.floor(bx / TILE);
  const x1b = Math.floor((bx + bw - 0.01) / TILE);
  const y0b = Math.floor(by / TILE);
  const y1b = Math.floor((by + bh - 0.01) / TILE);

  for (let ty = y0b; ty <= y1b; ty++) {
    for (let tx = x0b; tx <= x1b; tx++) {
      if (ty < 0 || tx < 0 || ty >= rows || tx >= cols) continue;
      const t = tiles[ty][tx];
      // one-way platforms: only solid when falling onto them from above
      const oneWay = t === '=';
      if (!solidFn(t, oneWay)) continue;
      const tileBox = { x: tx * TILE, y: ty * TILE, w: TILE, h: TILE };
      if (!overlaps({ x: bx, y: by, w: bw, h: bh }, tileBox)) continue;

      if (oneWay) {
        // only collide if was above the platform last frame and falling
        if (body.vy >= 0 && body._prevY + bh <= tileBox.y + 4) {
          body.y = tileBox.y - bh;
          body.vy = 0;
          body.grounded = true;
        }
      } else if (body.vy > 0) {
        body.y = tileBox.y - bh;
        body.vy = 0;
        body.grounded = true;
      } else if (body.vy < 0) {
        body.y = tileBox.y + tileBox.h;
        body.vy = 0;
      }
      by = body.y;
    }
  }

  body._prevY = body.y;
}

/** Apply gravity */
export function applyGravity(body) {
  body.vy += GRAVITY;
  if (body.vy > MAX_FALL) body.vy = MAX_FALL;
}

/** Check if a point/rect is standing on a platform rect */
export function standingOn(body, plat) {
  return body.vy >= 0 &&
    body.x + body.w > plat.x + 2 &&
    body.x < plat.x + plat.w - 2 &&
    body.y + body.h >= plat.y - 2 &&
    body.y + body.h <= plat.y + 8;
}
