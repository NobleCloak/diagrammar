import { describe, it, expect } from 'vitest';
import {
  bboxOf,
  union,
  intersects,
  expand,
  polylineMidpoint,
  polylineMidpointSegment,
  nearestPointOnBox,
  placeBeside,
  pushUntilClear,
  stackHorizontal,
} from './geometry.js';

describe('bboxOf', () => {
  it('reads x/y/width/height off a positioned shape', () => {
    const shape = { pos: { x: 10, y: 20 }, width: 30, height: 40 };
    expect(bboxOf(shape)).toEqual({ x: 10, y: 20, width: 30, height: 40 });
  });
});

describe('union', () => {
  it('spans the min/max extent of two boxes', () => {
    // box1 spans x:[0,10] y:[0,10]; box2 spans x:[20,30] y:[5,15]
    // minX=0 minY=0 maxX=30 maxY=15 -> width=30 height=15
    const box1 = { x: 0, y: 0, width: 10, height: 10 };
    const box2 = { x: 20, y: 5, width: 10, height: 10 };
    expect(union([box1, box2])).toEqual({ x: 0, y: 0, width: 30, height: 15 });
  });

  it('returns a zero box for an empty list', () => {
    expect(union([])).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });
});

describe('intersects', () => {
  it('is true when two boxes overlap', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 5, y: 5, width: 10, height: 10 };
    expect(intersects(a, b)).toBe(true);
  });

  it('is false when two boxes only share an edge', () => {
    // a spans x:[0,10]; b starts exactly at x=10 -> a.x+a.width(10) > b.x(10) is false
    const a = { x: 0, y: 0, width: 10, height: 10 };
    const b = { x: 10, y: 0, width: 10, height: 10 };
    expect(intersects(a, b)).toBe(false);
  });
});

describe('expand', () => {
  it('grows a box by pad on every side', () => {
    // x: 10-5=5, y: 10-5=5, width: 20+2*5=30, height: 30+2*5=40
    const box = { x: 10, y: 10, width: 20, height: 30 };
    expect(expand(box, 5)).toEqual({ x: 5, y: 5, width: 30, height: 40 });
  });
});

describe('polylineMidpoint', () => {
  it('walks by arc length to the halfway point across two segments', () => {
    // seg1 (0,0)->(6,0) length 6; seg2 (6,0)->(6,14) length 14; total 20, half 10.
    // 6 of the 10 is consumed by seg1, leaving 4 into seg2 (pure +y direction):
    // point = (6, 0 + 4) = (6, 4)
    const points = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 14 },
    ];
    expect(polylineMidpoint(points)).toEqual({ x: 6, y: 4 });
  });

  it('returns the single point for a one-point polyline', () => {
    expect(polylineMidpoint([{ x: 3, y: 4 }])).toEqual({ x: 3, y: 4 });
  });

  it('throws a DiagrammarError with code "overlay" on an empty polyline', () => {
    expect(() => polylineMidpoint([])).toThrow(expect.objectContaining({ code: 'overlay' }));
  });
});

describe('polylineMidpointSegment', () => {
  it('returns the midpoint plus the endpoints of the segment it landed on', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 14 },
    ];
    expect(polylineMidpointSegment(points)).toEqual({
      point: { x: 6, y: 4 },
      from: { x: 6, y: 0 },
      to: { x: 6, y: 14 },
    });
  });

  it('returns the single point as its own segment for a one-point polyline', () => {
    const p = { x: 3, y: 4 };
    expect(polylineMidpointSegment([p])).toEqual({ point: p, from: p, to: p });
  });

  it('throws a DiagrammarError with code "overlay" on an empty polyline', () => {
    expect(() => polylineMidpointSegment([])).toThrow(expect.objectContaining({ code: 'overlay' }));
  });
});

describe('nearestPointOnBox', () => {
  it('clamps a point outside the box to its nearest edge', () => {
    // box x:[0,10] y:[0,10]; p=(20,5) is right of the box -> clamp x to 10, keep y
    const box = { x: 0, y: 0, width: 10, height: 10 };
    expect(nearestPointOnBox(box, { x: 20, y: 5 })).toEqual({ x: 10, y: 5 });
  });

  it('projects a point strictly inside the box to its nearest edge', () => {
    // box x:[0,10] y:[0,10]; p=(3,1): distLeft=3 distRight=7 distTop=1 distBottom=9
    // min is distTop=1 -> project straight up to y=0, keep x
    const box = { x: 0, y: 0, width: 10, height: 10 };
    expect(nearestPointOnBox(box, { x: 3, y: 1 })).toEqual({ x: 3, y: 0 });
  });
});

describe('placeBeside', () => {
  const target = { x: 100, y: 50, width: 40, height: 20 };
  const size = { width: 10, height: 10 };

  it('places to the right, vertically centered on the target', () => {
    // x = 100+40+24=164; y = 50 + 20/2 - 10/2 = 50+10-5 = 55
    expect(placeBeside(target, size, 'right', 24)).toEqual({
      box: { x: 164, y: 55, width: 10, height: 10 },
      side: 'right',
    });
  });

  it('places to the left, vertically centered on the target', () => {
    // x = 100-24-10=66; y = 55 (same as above)
    expect(placeBeside(target, size, 'left', 24)).toEqual({
      box: { x: 66, y: 55, width: 10, height: 10 },
      side: 'left',
    });
  });

  it('places above, horizontally centered on the target', () => {
    // y = 50-24-10=16; x = 100 + 40/2 - 10/2 = 100+20-5=115
    expect(placeBeside(target, size, 'top', 24)).toEqual({
      box: { x: 115, y: 16, width: 10, height: 10 },
      side: 'top',
    });
  });

  it('places below, horizontally centered on the target', () => {
    // y = 50+20+24=94; x = 115 (same as above)
    expect(placeBeside(target, size, 'bottom', 24)).toEqual({
      box: { x: 115, y: 94, width: 10, height: 10 },
      side: 'bottom',
    });
  });
});

describe('pushUntilClear', () => {
  it('pushes right by one 16px step to clear a single obstacle', () => {
    // box x:[0,10]; obstacle x:[5,15] -> intersecting.
    // After +16: box x:[16,26]; obstacle x:[5,15] -> 16 < 15 is false -> clear.
    const box = { x: 0, y: 0, width: 10, height: 10 };
    const obstacle = { x: 5, y: 0, width: 10, height: 10 };
    expect(pushUntilClear(box, [obstacle], 'right', 16, 8)).toEqual({
      box: { x: 16, y: 0, width: 10, height: 10 },
      cleared: true,
    });
  });

  it('gives up after maxSteps and reports cleared: false', () => {
    // obstacle spans x:[0,1000]; 3 steps of 16 only reach x:[48,58], still inside.
    const box = { x: 0, y: 0, width: 10, height: 10 };
    const obstacle = { x: 0, y: 0, width: 1000, height: 10 };
    expect(pushUntilClear(box, [obstacle], 'right', 16, 3)).toEqual({
      box: { x: 48, y: 0, width: 10, height: 10 },
      cleared: false,
    });
  });

  it('leaves an already-clear box untouched', () => {
    const box = { x: 0, y: 0, width: 10, height: 10 };
    const obstacle = { x: 100, y: 100, width: 10, height: 10 };
    expect(pushUntilClear(box, [obstacle], 'right', 16, 8)).toEqual({
      box: { x: 0, y: 0, width: 10, height: 10 },
      cleared: true,
    });
  });
});

describe('stackHorizontal', () => {
  it('spaces centers by 2*radius + gap starting at the anchor', () => {
    // spacing = 2*11+4 = 26
    const points = stackHorizontal({ x: 200, y: 50 }, 3, 11, 4);
    expect(points).toEqual([
      { x: 200, y: 50 },
      { x: 226, y: 50 },
      { x: 252, y: 50 },
    ]);
  });

  it('returns an empty array for count 0', () => {
    expect(stackHorizontal({ x: 0, y: 0 }, 0, 11, 4)).toEqual([]);
  });
});
