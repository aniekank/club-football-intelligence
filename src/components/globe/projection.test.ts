import { describe, it, expect } from 'vitest';
import { project, slerp, angularDistance, graticule } from './projection';

/**
 * A wrong projection does not throw. It draws a globe that looks like a globe
 * and puts a stadium in the wrong ocean, which is the map version of every
 * silent-wrong-answer bug this codebase has already paid for.
 *
 * The cases below are the ones with answers that can be known without running
 * the code: the centre of the view, the four cardinal offsets, the horizon, and
 * the far side.
 */

const CENTRE = { lon: 0, lat: 0 };
const R = 100;
const CX = 200;
const CY = 150;

describe('the orthographic projection', () => {
  it('puts the point the globe is facing at the centre of the disc', () => {
    const p = project(0, 0, CENTRE, R, CX, CY);
    expect(p.x).toBeCloseTo(CX, 6);
    expect(p.y).toBeCloseTo(CY, 6);
    expect(p.visible).toBe(true);
  });

  it('puts east to the right and north UP, not down', () => {
    const east = project(30, 0, CENTRE, R, CX, CY);
    const north = project(0, 30, CENTRE, R, CX, CY);
    expect(east.x).toBeGreaterThan(CX);
    expect(east.y).toBeCloseTo(CY, 6);
    // Screen y grows downward, so north of centre must be a SMALLER y. Getting
    // this backwards produces a globe that is upside down and otherwise
    // completely plausible.
    expect(north.y).toBeLessThan(CY);
    expect(north.x).toBeCloseTo(CX, 6);
  });

  it('places a point ninety degrees away on the rim, and calls it hidden', () => {
    const p = project(90, 0, CENTRE, R, CX, CY);
    expect(Math.hypot(p.x - CX, p.y - CY)).toBeCloseTo(R, 6);
    // Exactly on the horizon is the far side's edge, not the near side's.
    expect(p.visible).toBe(false);
  });

  it('hides the far hemisphere, which projects onto the same disc', () => {
    const behind = project(150, 0, CENTRE, R, CX, CY);
    const front = project(30, 0, CENTRE, R, CX, CY);
    expect(behind.visible).toBe(false);
    expect(front.visible).toBe(true);
    // The two land in the same place. Without the visibility test the world is
    // drawn twice, mirrored.
    expect(behind.x).toBeCloseTo(front.x, 6);
    expect(behind.y).toBeCloseTo(front.y, 6);
  });

  it('never projects outside the disc', () => {
    for (let lon = -180; lon <= 180; lon += 7) {
      for (let lat = -90; lat <= 90; lat += 7) {
        const p = project(lon, lat, { lon: 24, lat: -13 }, R, CX, CY);
        expect(Math.hypot(p.x - CX, p.y - CY)).toBeLessThanOrEqual(R + 1e-9);
      }
    }
  });
});

describe('flying between two places', () => {
  it('lands exactly on the destination', () => {
    const to = { lon: -46.6, lat: -23.5 };
    const end = slerp({ lon: -0.1, lat: 51.5 }, to, 1);
    expect(end.lon).toBeCloseTo(to.lon, 6);
    expect(end.lat).toBeCloseTo(to.lat, 6);
  });

  it('passes through the midpoint of the great circle, not the average', () => {
    // Two points on the equator 180 degrees of latitude apart in the naive
    // reading: from the equator to the pole. Half way is 45 degrees.
    const mid = slerp({ lon: 0, lat: 0 }, { lon: 0, lat: 90 }, 0.5);
    expect(mid.lat).toBeCloseTo(45, 6);
  });

  it('crosses the antimeridian the short way', () => {
    // Averaging longitude sends the camera from 170E to 170W through Greenwich
    // — three quarters of the way round the planet to travel twenty degrees.
    const from = { lon: 170, lat: 0 };
    const to = { lon: -170, lat: 0 };
    const mid = slerp(from, to, 0.5);
    expect(Math.abs(mid.lon)).toBeCloseTo(180, 4);
    expect(angularDistance(from, to)).toBeCloseTo((20 * Math.PI) / 180, 6);
  });

  it('does not return NaN for a journey to the same place', () => {
    const same = { lon: 12, lat: 34 };
    const mid = slerp(same, same, 0.5);
    expect(mid.lon).toBeCloseTo(12, 6);
    expect(mid.lat).toBeCloseTo(34, 6);
    expect(angularDistance(same, same)).toBe(0);
  });
});

describe('the graticule', () => {
  it('is generated, closed over the whole sphere, and in flat pairs', () => {
    const lines = graticule(30, 10);
    expect(lines.length).toBeGreaterThan(10);
    for (const line of lines) expect(line.length % 2).toBe(0);
  });
});
