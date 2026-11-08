import {
  DT, JUMP_TICKS, JUMP_BUFFER_TICKS, LANE_CHANGE_TICKS, QUEUE_EXPIRE_TICKS,
  GUST_PUSH_TICKS, INITIAL_LANE, jumpLift, laneX, speedAtH, heightAtS,
} from './config.mjs';

export function lerp(a, b, t) { return a + (b - a) * t; }

export function createActor(opts = {}) {
  const lane = opts.lane ?? INITIAL_LANE;
  const s = opts.s ?? 0;
  return {
    s,
    h: opts.h ?? heightAtS(s),
    x: opts.x ?? laneX(lane),
    lane,
    fromLane: lane,
    toLane: lane,
    laneTick: 0,
    jumpTick: 0,
    jumpBuffer: 0,
    queuedDir: 0,
    queuedAge: 0,
    gustTick: 0,
    gustDir: 0,
    pendingGustDir: 0,
    lift: 0,
    jumping: false,
  };
}

export function copyActor(p) {
  return {
    s: p.s, h: p.h, x: p.x, lane: p.lane, fromLane: p.fromLane, toLane: p.toLane,
    laneTick: p.laneTick, jumpTick: p.jumpTick, jumpBuffer: p.jumpBuffer,
    queuedDir: p.queuedDir, queuedAge: p.queuedAge, gustTick: p.gustTick,
    gustDir: p.gustDir, pendingGustDir: p.pendingGustDir, lift: p.lift,
  };
}

export function stableLane(p) {
  if (p.gustTick > 0) return p.toLane;
  if (p.laneTick > 0) return p.toLane;
  return p.lane;
}

function beginLaneChange(p, dir) {
  const dest = p.lane + dir;
  if (dest < 0 || dest > 2) return false;
  p.fromLane = p.lane;
  p.toLane = dest;
  p.laneTick = 0;
  return true;
}

export function tryLaneCommand(p, dir) {
  if (dir !== -1 && dir !== 1) return;
  if (p.gustTick > 0 || p.laneTick > 0 || p._startGust) {
    p.queuedDir = dir;
    p.queuedAge = 0;
    return;
  }
  beginLaneChange(p, dir);
}

export function tryJump(p) {
  if (p.jumpTick === 0) {
    p.jumpTick = 0;
    p._startJump = true;
    return;
  }
  if (p.jumpTick >= JUMP_TICKS - JUMP_BUFFER_TICKS) p.jumpBuffer = 1;
}

export function beginGust(p, dir) {
  if (p.gustTick > 0) return false;
  const origin = p.laneTick > 0 ? p.toLane : p.lane;
  const dest = origin + dir;
  if (dest < 0 || dest > 2) return false;
  p.lane = origin;
  p.fromLane = origin;
  p.toLane = dest;
  p.gustDir = dir;
  p.gustTick = 0;
  p.laneTick = 0;
  p._startGust = true;
  return true;
}

function applyQueue(p) {
  if (!p.queuedDir) return;
  const dir = p.queuedDir;
  p.queuedDir = 0;
  p.queuedAge = 0;
  beginLaneChange(p, dir);
}

export function stepActor(p, input = {}) {
  const prev = { x: p.x, s: p.s, lift: p.lift, lane: p.lane, h: p.h };

  if (p.pendingGustDir) {
    beginGust(p, p.pendingGustDir);
    p.pendingGustDir = 0;
  }

  if (input.jump) tryJump(p);
  if (input.laneDir) tryLaneCommand(p, input.laneDir);

  if (p._startJump) {
    p._startJump = false;
    p.jumpTick = 0;
    p.jumping = true;
  }

  if (p.queuedDir) {
    p.queuedAge += 1;
    if (p.queuedAge >= QUEUE_EXPIRE_TICKS) {
      p.queuedDir = 0;
      p.queuedAge = 0;
    }
  }

  if (p._startGust || p.gustTick > 0) {
    p._startGust = false;
    p.gustTick += 1;
    p.x = lerp(laneX(p.fromLane), laneX(p.toLane), p.gustTick / GUST_PUSH_TICKS);
    if (p.gustTick >= GUST_PUSH_TICKS) {
      p.lane = p.toLane;
      p.x = laneX(p.lane);
      p.fromLane = p.lane;
      p.gustTick = 0;
      p.gustDir = 0;
      applyQueue(p);
    }
  } else if (p.laneTick > 0 || p.toLane !== p.lane) {
    p.laneTick += 1;
    p.x = lerp(laneX(p.fromLane), laneX(p.toLane), p.laneTick / LANE_CHANGE_TICKS);
    if (p.laneTick >= LANE_CHANGE_TICKS) {
      p.lane = p.toLane;
      p.x = laneX(p.lane);
      p.fromLane = p.lane;
      p.laneTick = 0;
      applyQueue(p);
    }
  }

  if (p.jumping || p.jumpTick > 0) {
    p.jumpTick += 1;
    const u = p.jumpTick / JUMP_TICKS;
    p.lift = jumpLift(u);
    if (p.jumpTick >= JUMP_TICKS) {
      p.jumpTick = 0;
      p.lift = 0;
      p.jumping = false;
      if (p.jumpBuffer) {
        p.jumpBuffer = 0;
        p.jumping = true;
        p.jumpTick = 0;
      }
    }
  } else {
    p.lift = 0;
  }

  const v = speedAtH(p.h);
  p.s += v * DT;
  p.h = heightAtS(p.s);
  return { prev, v };
}

export function actorDigest(p) {
  return [
    p.s.toFixed(9), p.h.toFixed(9), p.x.toFixed(9), p.lane, p.toLane,
    p.laneTick, p.jumpTick, p.queuedDir, p.queuedAge, p.gustTick, p.lift.toFixed(9),
  ].join(',');
}
