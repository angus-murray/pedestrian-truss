/**
 * Section properties and section capacities to AS 5100.6 (whose Sections 5 to 8 follow AS 4100):
 * polygon properties of the nominal outline (root radii of hot-rolled sections, corner radii 2.5t / 1.5t of
 * cold-formed hollow sections), plate element slenderness (Tables 5.2 and 6.2.4), form factor k_f (Cl. 6.2.2),
 * effective section moduli Z_e (Cl. 5.2.3 to 5.2.5) and shear capacity (Cl. 5.11).
 *
 * Section axes: x along the width (flanges), y along the depth. Major-axis bending is about x.
 */
import { findSection, type SectionCategory, type SectionDefinition } from '../data/sections';
import { findGrade } from '../data/grades';

export type Pt = [number, number];

export interface SectionSpec {
  category: SectionCategory;
  name: string;
  grade: string;
}

export type SectionClass = 'compact' | 'non-compact' | 'slender';

export interface SectionProps {
  spec: SectionSpec;
  def: SectionDefinition;
  kind: 'I' | 'PFC' | 'RHS' | 'CHS';
  d: number; // depth (mm)
  b: number; // width (mm)
  tMax: number; // thickest element (mm)
  A: number; // mm²
  Ix: number; // major (mm⁴)
  Iy: number; // minor (mm⁴)
  Zx: number;
  Zy: number;
  Sx: number;
  Sy: number;
  rx: number;
  ry: number;
  J: number; // mm⁴
  Iw: number; // mm⁶
  fy: number; // MPa
  fu: number; // MPa
  kf: number;
  Zex: number;
  Zey: number;
  classX: SectionClass;
  classY: SectionClass;
  /** Shear capacity φV_v (kN) for shear along the depth (major-axis bending) and along the width. */
  phiVy: number;
  phiVx: number;
  /** Member section constant α_b (Tables 6.3.3(1) and (2)). */
  alphaB: number;
  /** Mass per metre (kg/m). */
  mass: number;
  /** Outline for drawing (mm), centroid at the origin: outer boundary and holes. */
  outer: Pt[];
  holes: Pt[][];
}

export const PHI = 0.9;

// ---------------------------------------------------------------- polygon section properties
const arc = (cx: number, cy: number, r: number, a0: number, a1: number, n = 6): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });

function integrals(pts: Pt[]) {
  let A = 0, Qx = 0, Qy = 0, Ixx = 0, Iyy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
    const c = x0 * y1 - x1 * y0;
    A += c / 2;
    Qy += ((x0 + x1) * c) / 6;
    Qx += ((y0 + y1) * c) / 6;
    Iyy += ((x0 * x0 + x0 * x1 + x1 * x1) * c) / 12;
    Ixx += ((y0 * y0 + y0 * y1 + y1 * y1) * c) / 12;
  }
  return { A, Qx, Qy, Ixx, Iyy };
}

function clip(pts: Pt[], axis: 0 | 1, c: number, above: boolean): Pt[] {
  const inside = (p: Pt) => (above ? p[axis] >= c : p[axis] <= c);
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const pin = inside(p), qin = inside(q);
    if (pin) out.push(p);
    if (pin !== qin) {
      const t = (c - p[axis]) / (q[axis] - p[axis]);
      out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
    }
  }
  return out;
}

interface Shape {
  pts: Pt[];
  sign: 1 | -1;
}

function sideMoments(shapes: Shape[], axis: 0 | 1, c: number, above: boolean) {
  let A = 0, Q = 0;
  for (const s of shapes) {
    const orient = Math.sign(integrals(s.pts).A) || 1;
    const part = clip(s.pts, axis, c, above);
    if (part.length < 3) continue;
    const g = integrals(part);
    A += s.sign * orient * g.A;
    Q += s.sign * orient * (axis === 1 ? g.Qx : g.Qy);
  }
  return { A, Q };
}

function properties(shapes: Shape[]) {
  let A = 0, Qx = 0, Qy = 0, Ixx = 0, Iyy = 0;
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const s of shapes) {
    const g = integrals(s.pts);
    const k = s.sign * (Math.sign(g.A) || 1);
    A += k * g.A;
    Qx += k * g.Qx;
    Qy += k * g.Qy;
    Ixx += k * g.Ixx;
    Iyy += k * g.Iyy;
    if (s.sign > 0)
      for (const [x, y] of s.pts) {
        xmin = Math.min(xmin, x); xmax = Math.max(xmax, x);
        ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
      }
  }
  A = Math.abs(A);
  const xc = Qy / A, yc = Qx / A;
  const Ix = Ixx - A * yc * yc, Iy = Iyy - A * xc * xc;
  const Zx = Ix / Math.max(ymax - yc, yc - ymin);
  const Zy = Iy / Math.max(xmax - xc, xc - xmin);
  const plastic = (axis: 0 | 1, lo: number, hi: number) => {
    for (let it = 0; it < 60; it++) {
      const c = (lo + hi) / 2;
      if (sideMoments(shapes, axis, c, true).A > A / 2) lo = c;
      else hi = c;
    }
    const c = (lo + hi) / 2;
    const a = sideMoments(shapes, axis, c, true), b = sideMoments(shapes, axis, c, false);
    return a.Q - c * a.A - (b.Q - c * b.A);
  };
  return { A, Ix, Iy, Zx, Zy, Sx: plastic(1, ymin, ymax), Sy: plastic(0, xmin, xmax), xc, yc };
}

export const roundedRect = (b: number, d: number, r: number, n = 6): Pt[] => {
  if (r <= 0.01) return [[-b / 2, -d / 2], [b / 2, -d / 2], [b / 2, d / 2], [-b / 2, d / 2]];
  const x = b / 2 - r, y = d / 2 - r;
  return [...arc(x, -y, r, -90, 0, n), ...arc(x, y, r, 0, 90, n), ...arc(-x, y, r, 90, 180, n), ...arc(-x, -y, r, 180, 270, n)];
};
const circle = (r: number, n = 40): Pt[] => Array.from({ length: n }, (_, i) => [r * Math.cos((2 * Math.PI * i) / n), r * Math.sin((2 * Math.PI * i) / n)] as Pt);

// ---------------------------------------------------------------- plate element slenderness
type Residual = 'HR' | 'CF';
type Support = 'one' | 'oneGrad' | 'both' | 'web' | 'chs';
const BEND: Record<Support, Record<Residual, [number, number]>> = {
  one: { HR: [9, 16], CF: [8, 15] },
  oneGrad: { HR: [9, 25], CF: [8, 22] },
  both: { HR: [30, 45], CF: [30, 40] },
  web: { HR: [82, 115], CF: [82, 115] },
  chs: { HR: [50, 120], CF: [50, 120] }
};
const COMP_EY: Record<'one' | 'both' | 'chs', Record<Residual, number>> = {
  one: { HR: 16, CF: 15 },
  both: { HR: 45, CF: 40 },
  chs: { HR: 82, CF: 82 }
};

interface Element {
  b: number;
  t: number;
  n: number;
  edges: 'one' | 'both' | 'chs';
}
const lambdaE = (e: Element, fy: number) => (e.edges === 'chs' ? (e.b / e.t) * (fy / 250) : (e.b / e.t) * Math.sqrt(fy / 250));

function effectiveModulus(Z: number, S: number, comp: { e: Element; sup: Support }[], fy: number, res: Residual) {
  let gov: { ls: number; lsp: number; lsy: number; sup: Support } | null = null;
  for (const { e, sup } of comp) {
    const [lsp, lsy] = BEND[sup][res];
    const ls = lambdaE(e, fy);
    if (!gov || ls / lsy > gov.ls / gov.lsy) gov = { ls, lsp, lsy, sup };
  }
  const Zc = Math.min(S, 1.5 * Z);
  if (!gov || gov.ls <= gov.lsp) return { Ze: Zc, cls: 'compact' as const };
  if (gov.ls <= gov.lsy) return { Ze: Z + ((gov.lsy - gov.ls) / (gov.lsy - gov.lsp)) * (Zc - Z), cls: 'non-compact' as const };
  const r = gov.lsy / gov.ls;
  const Ze = gov.sup === 'web' ? Z * r * r : gov.sup === 'chs' ? Math.min(Z * Math.sqrt(r), Z * (2 * r) ** 2) : Z * r;
  return { Ze, cls: 'slender' as const };
}

const cache = new Map<string, SectionProps>();

/** Section properties and capacities for a section and grade (cached). */
export function sectionProps(spec: SectionSpec): SectionProps {
  const key = `${spec.category}|${spec.name}|${spec.grade}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = findSection(spec.name) ?? findSection(spec.category === 'CHS' ? '168.3×7.1 CHS' : '150×150×6.0 SHS')!;
  const grade = findGrade(def.category, spec.grade);
  const d = def.depth, b = def.flangeWidth, tf = def.flangeThick, tw = def.webThick, r = def.radius ?? 0;
  const shapes: Shape[] = [];
  let kind: SectionProps['kind'];
  let res: Residual = 'HR';
  const els: Record<string, Element> = {};
  let J = 0, Iw = 0, alphaB = 0;
  let AwY = 0, dpY = 0, twY = 1, AwX = 0, dpX = 0, twX = 1;
  let tMax = Math.max(tf, tw);

  if (def.category === 'UB' || def.category === 'UC') {
    kind = 'I';
    const yi = d / 2 - tf;
    shapes.push({
      sign: 1,
      pts: [
        [-b / 2, -d / 2], [b / 2, -d / 2], [b / 2, -yi],
        ...arc(tw / 2 + r, -yi + r, r, 270, 180), ...arc(tw / 2 + r, yi - r, r, 180, 90),
        [b / 2, yi], [b / 2, d / 2], [-b / 2, d / 2], [-b / 2, yi],
        ...arc(-tw / 2 - r, yi - r, r, 90, 0), ...arc(-tw / 2 - r, -yi + r, r, 0, -90),
        [-b / 2, -yi]
      ]
    });
    els.flange = { b: (b - tw) / 2, t: tf, n: 4, edges: 'one' };
    els.web = { b: d - 2 * tf, t: tw, n: 1, edges: 'both' };
    J = (2 * b * tf ** 3 + (d - 2 * tf) * tw ** 3) / 3;
    AwY = d * tw; dpY = d - 2 * tf; twY = tw;
    AwX = 2 * b * tf; twX = tf;
  } else if (def.category === 'PFC') {
    kind = 'PFC';
    const yi = d / 2 - tf;
    shapes.push({
      sign: 1,
      pts: [[0, -d / 2], [b, -d / 2], [b, -yi], ...arc(tw + r, -yi + r, r, 270, 180), ...arc(tw + r, yi - r, r, 180, 90), [b, yi], [b, d / 2], [0, d / 2]]
    });
    els.flange = { b: b - tw, t: tf, n: 2, edges: 'one' };
    els.web = { b: d - 2 * tf, t: tw, n: 1, edges: 'both' };
    J = (2 * b * tf ** 3 + (d - 2 * tf) * tw ** 3) / 3;
    alphaB = 0.5;
    AwY = d * tw; dpY = d - 2 * tf; twY = tw;
    AwX = 2 * b * tf; twX = tf;
  } else if (def.category === 'CHS') {
    kind = 'CHS';
    res = 'CF';
    const D = def.outerDiameter ?? d, t = def.wallThick ?? tw;
    shapes.push({ sign: 1, pts: circle(D / 2, 64) }, { sign: -1, pts: circle(D / 2 - t, 64) });
    els.chs = { b: D, t, n: 1, edges: 'chs' };
    J = (Math.PI / 2) * ((D / 2) ** 4 - (D / 2 - t) ** 4);
    alphaB = -0.5;
    tMax = t;
  } else {
    kind = 'RHS';
    res = 'CF';
    const t = def.wallThick ?? tw;
    shapes.push({ sign: 1, pts: roundedRect(b, d, 2.5 * t) }, { sign: -1, pts: roundedRect(b - 2 * t, d - 2 * t, 1.5 * t) });
    els.sideX = { b: b - 2 * t, t, n: 2, edges: 'both' };
    els.sideY = { b: d - 2 * t, t, n: 2, edges: 'both' };
    const rm = 2 * t;
    const Am = (b - t) * (d - t) - (4 - Math.PI) * rm * rm;
    const pm = 2 * (b - t + d - t) - (8 - 2 * Math.PI) * rm;
    J = (4 * Am * Am * t) / pm;
    alphaB = -0.5;
    AwY = 2 * (d - 2 * t) * t; dpY = d - 2 * t; twY = t;
    AwX = 2 * (b - 2 * t) * t; dpX = b - 2 * t; twX = t;
    tMax = t;
  }

  const P = properties(shapes);
  if (kind === 'I') Iw = (P.Iy * (d - tf) ** 2) / 4;
  if (kind === 'PFC') {
    const bb = b - tw / 2, df = d - tf;
    Iw = ((tf * bb ** 3 * df ** 2) / 12) * ((3 * bb * tf + 2 * df * tw) / (6 * bb * tf + df * tw));
  }
  const fy = Math.min(grade.fy(tf), grade.fy(tw));
  const fu = grade.fu;

  // form factor (Cl. 6.2.2, 6.2.4)
  let Ae = P.A;
  for (const e of Object.values(els)) {
    const le = lambdaE(e, fy);
    const ley = COMP_EY[e.edges][res];
    if (e.edges === 'chs') Ae = P.A * Math.min(1, Math.sqrt(ley / le), (3 * ley / le) ** 2);
    else Ae -= e.n * (e.b - Math.min(e.b, e.b * (ley / le))) * e.t;
  }
  const kf = Math.min(1, Ae / P.A);

  // bending (Table 5.2)
  type Comp = { e: Element; sup: Support };
  const casesX: Comp[][] = [], casesY: Comp[][] = [];
  if (kind === 'I') {
    casesX.push([{ e: els.flange, sup: 'one' }, { e: els.web, sup: 'web' }]);
    casesY.push([{ e: els.flange, sup: 'oneGrad' }]);
  } else if (kind === 'PFC') {
    casesX.push([{ e: els.flange, sup: 'one' }, { e: els.web, sup: 'web' }]);
    casesY.push([{ e: els.flange, sup: 'oneGrad' }], [{ e: els.web, sup: 'both' }]);
  } else if (kind === 'RHS') {
    casesX.push([{ e: els.sideX, sup: 'both' }, { e: els.sideY, sup: 'web' }]);
    casesY.push([{ e: els.sideY, sup: 'both' }, { e: els.sideX, sup: 'web' }]);
  } else {
    casesX.push([{ e: els.chs, sup: 'chs' }]);
    casesY.push([{ e: els.chs, sup: 'chs' }]);
  }
  const worst = (Z: number, S: number, cases: Comp[][]) => cases.map((c) => effectiveModulus(Z, S, c, fy, res)).reduce((a, x) => (x.Ze < a.Ze ? x : a));
  const bx = worst(P.Zx, P.Sx, casesX), by = worst(P.Zy, P.Sy, casesY);

  // shear (Cl. 5.11)
  const shearCap = (Aw: number, dp: number, t: number) => {
    let Vw = 0.6 * fy * Aw;
    if (dp > 0) {
      const lw = (dp / t) * Math.sqrt(fy / 250);
      if (lw > 82) Vw *= (82 / lw) ** 2;
    }
    return (PHI * Vw) / 1000;
  };
  let phiVy: number, phiVx: number;
  if (kind === 'CHS') phiVy = phiVx = (PHI * 0.36 * fy * P.A) / 1000;
  else {
    phiVy = shearCap(AwY, dpY, twY);
    phiVx = shearCap(AwX, dpX, twX);
  }

  // outline centred on the centroid
  const shift = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [x - P.xc, y - P.yc]);
  const props: SectionProps = {
    spec,
    def,
    kind,
    d,
    b,
    tMax,
    A: P.A,
    Ix: P.Ix,
    Iy: P.Iy,
    Zx: P.Zx,
    Zy: P.Zy,
    Sx: P.Sx,
    Sy: P.Sy,
    rx: Math.sqrt(P.Ix / P.A),
    ry: Math.sqrt(P.Iy / P.A),
    J,
    Iw,
    fy,
    fu,
    kf,
    Zex: bx.Ze,
    Zey: by.Ze,
    classX: bx.cls,
    classY: by.cls,
    phiVy,
    phiVx,
    alphaB,
    mass: P.A * 7.85e-3,
    outer: shift(shapes[0].pts),
    holes: shapes.slice(1).map((s) => shift(s.pts))
  };
  cache.set(key, props);
  return props;
}
