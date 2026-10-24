/**
 * Three.js geometry of the bridge: members extruded from their section outlines (rounded corners of hollow
 * sections, root radii of hot-rolled sections) and cut to the faces of the members they meet, deck, kerbs,
 * handrails, mesh screens, bearings and abutments.
 */
import * as THREE from 'three';
import type { BridgeModel, Member } from '../../model/build';
import type { Pt } from '../../design/section';
import type { Vec3 } from '../../fea/frame';

export interface CutPlane {
  p: Vec3;
  n: Vec3;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const signedArea = (pts: Pt[]) => pts.reduce((s, p, i) => s + (p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1]), 0) / 2;

/** Member axes: ex along the member, ez the depth direction, ey = ez × ex. */
export function memberAxes(a: Vec3, b: Vec3, depthDir: Vec3) {
  const ex = unit(sub(b, a));
  let r = depthDir;
  if (Math.abs(dot(unit(r), ex)) > 0.999) r = Math.abs(ex[2]) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  const p = dot(r, ex);
  const ez = unit([r[0] - p * ex[0], r[1] - p * ex[1], r[2] - p * ex[2]]);
  const ey = cross(ez, ex);
  return { ex, ey, ez };
}

/**
 * Prism of a section outline (mm, x = width, y = depth) from a to b, with each end projected onto a cut plane
 * (a mitred end where the member meets the face of another member).
 */
export function extrudeSection(outer: Pt[], holes: Pt[][], a: Vec3, b: Vec3, depthDir: Vec3, cutA?: CutPlane | null, cutB?: CutPlane | null): THREE.BufferGeometry {
  const { ex, ey, ez } = memberAxes(a, b, depthDir);
  const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const ccw = (r: Pt[]) => (signedArea(r) < 0 ? r.slice().reverse() : r);
  const rings = [ccw(outer).map(([x, y]) => [x / 1000, y / 1000] as Pt), ...holes.map((h) => ccw(h).map(([x, y]) => [x / 1000, y / 1000] as Pt))];
  const at = (p: Pt, x: number): Vec3 => [a[0] + p[0] * ey[0] + p[1] * ez[0] + x * ex[0], a[1] + p[0] * ey[1] + p[1] * ez[1] + x * ex[1], a[2] + p[0] * ey[2] + p[1] * ez[2] + x * ex[2]];
  const project = (v: Vec3, cut: CutPlane | null | undefined): Vec3 => {
    if (!cut) return v;
    const den = dot(ex, cut.n);
    if (Math.abs(den) < 0.15) return v;
    const t = dot(sub(cut.p, v), cut.n) / den;
    return [v[0] + t * ex[0], v[1] + t * ex[1], v[2] + t * ex[2]];
  };
  const pos: number[] = [], nor: number[] = [];
  const push = (v: Vec3, n: Vec3) => {
    pos.push(v[0], v[1], v[2]);
    nor.push(n[0], n[1], n[2]);
  };
  const world2 = (n2: Pt): Vec3 => unit([n2[0] * ey[0] + n2[1] * ez[0], n2[0] * ey[1] + n2[1] * ez[1], n2[0] * ey[2] + n2[1] * ez[2]]);
  for (const ring of rings) {
    const m = ring.length;
    const en: Pt[] = ring.map((p, i) => {
      const q = ring[(i + 1) % m];
      const dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
      return [dy / l, -dx / l];
    });
    // smooth normal at a vertex where the outline turns by less than 40°
    const vn = ring.map((_, i) => {
      const n0 = en[(i - 1 + m) % m], n1 = en[i];
      const c = n0[0] * n1[0] + n0[1] * n1[1];
      return c > Math.cos((40 * Math.PI) / 180) ? ([(n0[0] + n1[0]) / 2, (n0[1] + n1[1]) / 2] as Pt) : null;
    });
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      const ni = world2(vn[i] ?? en[i]), nj = world2(vn[j] ?? en[i]);
      const A = project(at(ring[i], 0), cutA), B = project(at(ring[j], 0), cutA), C = project(at(ring[j], L), cutB), D = project(at(ring[i], L), cutB);
      push(A, ni); push(B, nj); push(C, nj);
      push(A, ni); push(C, nj); push(D, ni);
    }
  }
  // end caps: solid (sealed) ends, as the ends of hollow sections are capped or meet the face of another member
  const outerRing = rings[0];
  const tris = THREE.ShapeUtils.triangulateShape(outerRing.map(([x, y]) => new THREE.Vector2(x, y)), []);
  const capNormal = (cut: CutPlane | null | undefined, sign: number): Vec3 => {
    if (!cut || Math.abs(dot(ex, cut.n)) < 0.15) return [sign * ex[0], sign * ex[1], sign * ex[2]];
    const n = dot(cut.n, ex) * sign >= 0 ? cut.n : ([-cut.n[0], -cut.n[1], -cut.n[2]] as Vec3);
    return n;
  };
  const nA = capNormal(cutA, -1), nB = capNormal(cutB, 1);
  const all = outerRing;
  for (const [i, j, k] of tris) {
    const ccwTri = (all[j][0] - all[i][0]) * (all[k][1] - all[i][1]) - (all[k][0] - all[i][0]) * (all[j][1] - all[i][1]) > 0;
    const [p, q, r] = ccwTri ? [i, j, k] : [i, k, j];
    // start cap faces −x: clockwise seen from +x
    push(project(at(all[p], 0), cutA), nA); push(project(at(all[r], 0), cutA), nA); push(project(at(all[q], 0), cutA), nA);
    push(project(at(all[p], L), cutB), nB); push(project(at(all[q], L), cutB), nB); push(project(at(all[r], L), cutB), nB);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/** Axis-aligned box between two corners. */
export function boxBetween(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}

/** Cylinder (circular bar or tube) between two points. */
export function rod(a: Vec3, b: Vec3, r: number, seg = 16): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
  g.applyQuaternion(q);
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return g;
}

/** Cut planes at the ends of a member where it meets the chords, the cross girders or another member. */
export function memberCuts(model: BridgeModel, m: Member): [CutPlane | null, CutPlane | null] {
  const { geo } = model;
  const zTopFace = geo.H - geo.dTC / 2, zBotFace = geo.dBC / 2;
  const tcRound = model.input.sections.topChord.category === 'CHS', bcRound = model.input.sections.bottomChord.category === 'CHS';
  const web = m.group === 'vertical' || m.group === 'diagonal' || m.group === 'endPost';
  const webHalfY = webHalfWidth(model);
  const endCut = (p: Vec3): CutPlane | null => {
    const knee = kneeCut(model, m, p);
    if (knee) return knee;
    if (web) {
      // to the flat face of a box chord; into a round (CHS) chord up to the node, the overlap hidden inside it
      if (Math.abs(p[2] - geo.H) < 1e-6) return { p: [0, 0, tcRound ? geo.H : zTopFace], n: [0, 0, 1] };
      if (Math.abs(p[2]) < 1e-6) return { p: [0, 0, bcRound ? 0 : zBotFace], n: [0, 0, 1] };
    }
    if (m.group === 'crossGirder') {
      const cgBottom = geo.zCG - geo.dCG / 2;
      // below the chord: to its outer face; level with it: to its inner face; above it: to the web members
      const vert = model.members.find((x) => x.group === 'vertical');
      const vHalf = vert ? (model.input.sections.vertical.rotate ? vert.sp.b : vert.sp.d) / 2000 : webHalfY;
      const y = geo.cgOnVerticals && geo.cgTop > geo.dBC / 2 + 1e-6 ? geo.s / 2 - vHalf : bcRound && geo.cgTop > -geo.dBC / 2 + 1e-6 && cgBottom < geo.dBC / 2 - 1e-6 ? geo.s / 2 : cgBottom >= geo.dBC / 2 - 1e-6 ? geo.s / 2 - webHalfY : geo.cgTop <= -geo.dBC / 2 + 1e-6 ? geo.s / 2 + geo.wBC / 2 : geo.s / 2 - geo.wBC / 2;
      return { p: [0, y * Math.sign(p[1]), 0], n: [0, 1, 0] };
    }
    if (m.group === 'bracing') {
      // drawn below the cross girders: the ends stop on the gusset plates
      const dir = Math.sign((m.a[0] + m.b[0]) / 2 - p[0]);
      return { p: [p[0] + dir * 0.12, 0, 0], n: [1, 0, 0] };
    }
    if (m.group === 'stringer') {
      // framed into the cross girder (an open section's top flange passes into its flange, as a coped end)
      const cg = model.members.find((x) => x.group === 'crossGirder')!;
      // to the face of a hollow cross girder, or to the web of an open one
      const hollow = cg.sp.kind === 'RHS' || cg.sp.kind === 'CHS';
      const rot = model.input.sections.crossGirder.rotate;
      const half = (hollow ? (rot ? cg.sp.d : cg.sp.b) / 2 : rot ? cg.sp.def.flangeThick / 2 : cg.sp.def.webThick / 2) / 1000 + 0.004;
      const dir = Math.sign((m.a[0] + m.b[0]) / 2 - p[0]);
      return { p: [p[0] + dir * half, 0, 0], n: [1, 0, 0] };
    }
    return null;
  };
  return [endCut(m.a), endCut(m.b)];
}

/**
 * Inward projection of the truss from its centreline (m): half the transverse width of the web member that sticks
 * out furthest (verticals, diagonals, end posts), and of the top chord when the screen reaches it. The screens and
 * handrail brackets are set out from this face so that they clear every member.
 */
export function webHalfWidth(model: BridgeModel): number {
  const { geo, input } = model;
  const halfY = (m: BridgeModel['members'][number]) => (Math.abs(m.depthDir[1]) > 0.5 ? m.sp.d : m.sp.b) / 2000;
  let w = 0;
  for (const m of model.members) if (m.group === 'vertical' || m.group === 'diagonal' || m.group === 'endPost') w = Math.max(w, halfY(m));
  if (input.screens && geo.deckTop + input.screenHeight > geo.H - geo.dTC / 2) w = Math.max(w, geo.wTC / 2);
  return w || geo.wTC / 2;
}

/**
 * Mitred knee where a raking end post meets the end of the top chord: both are cut on the plane
 * bisecting the angle between them. Null unless the member end p is at a knee.
 */
function kneeCut(model: BridgeModel, m: Member, p: Vec3): CutPlane | null {
  const { geo } = model;
  if (m.group !== 'endPost' && m.group !== 'topChord') return null;
  if (Math.abs(p[2] - geo.H) > 1e-6 || (Math.abs(p[0] - geo.topX0) > 1e-6 && Math.abs(p[0] - geo.topX1) > 1e-6)) return null;
  const joint = p;
  const left = joint[0] < geo.L / 2;
  const uChord: Vec3 = [left ? 1 : -1, 0, 0];
  const foot: Vec3 = [left ? 0 : geo.L, joint[1], 0];
  const uPost = unit(sub(foot, joint));
  return { p: joint, n: unit(sub(uChord, uPost)) };
}

/** Chord end extension beyond the end node (to cover the end post), with the end cap. */
export function chordExtents(model: BridgeModel, m: Member): [Vec3, Vec3] {
  const { geo } = model;
  const ep = model.members.find((x) => x.group === 'endPost');
  const epHalfX = ep ? (Math.abs(ep.depthDir[0]) > 0.5 ? ep.sp.d : ep.sp.b) / 2000 : 0.1;
  let a = m.a, b = m.b;
  if (m.group === 'bottomChord') {
    const ext = epHalfX + 0.15;
    if (m.a[0] < 1e-6) a = [m.a[0] - ext, m.a[1], m.a[2]];
    if (m.b[0] > geo.L - 1e-6) b = [m.b[0] + ext, m.b[1], m.b[2]];
  }
  return [a, b];
}

// ---------------------------------------------------------------- procedural textures

function canvasTexture(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void, repeat: [number, number] = [1, 1]) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const c = cv.getContext('2d')!;
  draw(c, size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Welded wire mesh, square apertures (one tile = 4 × 4 apertures). */
export function meshTexture(colour: string) {
  return canvasTexture(256, (c, s) => {
    c.clearRect(0, 0, s, s);
    c.fillStyle = colour;
    const n = 4, w = Math.max(2, s / 48);
    for (let i = 0; i < n; i++) {
      const p = (i * s) / n;
      c.fillRect(p, 0, w, s);
      c.fillRect(0, p, s, w);
    }
  });
}

/** Fine speckle for concrete and grit surfaces. */
export function speckleTexture(base: string, dots: string[], density = 0.06) {
  return canvasTexture(512, (c, s) => {
    c.fillStyle = base;
    c.fillRect(0, 0, s, s);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const n = Math.round(s * s * density);
    for (let i = 0; i < n; i++) {
      c.fillStyle = dots[i % dots.length];
      c.globalAlpha = 0.15 + rnd() * 0.25;
      const r = 0.5 + rnd() * 1.4;
      c.fillRect(rnd() * s, rnd() * s, r, r);
    }
    c.globalAlpha = 1;
  });
}

/** Timber grain along x. */
export function timberTexture() {
  return canvasTexture(512, (c, s) => {
    c.fillStyle = '#9c6e45';
    c.fillRect(0, 0, s, s);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 160; i++) {
      c.strokeStyle = rnd() > 0.5 ? '#835a35' : '#b08158';
      c.globalAlpha = 0.25 + rnd() * 0.3;
      c.lineWidth = 0.5 + rnd() * 1.5;
      const y = rnd() * s;
      c.beginPath();
      c.moveTo(0, y);
      for (let x = 0; x <= s; x += 32) c.lineTo(x, y + Math.sin(x / 40 + i) * 2);
      c.stroke();
    }
    c.globalAlpha = 1;
  });
}

/** Chequer plate (raised bars). */
export function chequerTexture() {
  return canvasTexture(256, (c, s) => {
    c.fillStyle = '#7a8086';
    c.fillRect(0, 0, s, s);
    c.fillStyle = '#9aa1a8';
    const n = 8;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        c.save();
        c.translate(((i + 0.5) * s) / n, ((j + 0.5) * s) / n);
        c.rotate((i + j) % 2 ? Math.PI / 4 : -Math.PI / 4);
        c.fillRect(-s / n / 3, -s / n / 12, (2 * s) / n / 3, s / n / 6);
        c.restore();
      }
  });
}

/**
 * Moulded FRP mini-mesh grating, one tile of 4 × 4 openings: bars with a gritted top and dark square openings.
 * The side view shows the bars and openings in elevation.
 */
export function gratingTexture(bar: string, hole: string, side = false) {
  return canvasTexture(256, (c, s) => {
    c.fillStyle = bar;
    c.fillRect(0, 0, s, s);
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2500; i++) {
      c.fillStyle = rnd() > 0.5 ? '#9aa0a6' : '#4c5156';
      c.globalAlpha = 0.35;
      c.fillRect(rnd() * s, rnd() * s, 1.5, 1.5);
    }
    c.globalAlpha = 1;
    const n = 4, cell = s / n, open = cell * 0.62;
    c.fillStyle = hole;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < (side ? 1 : n); j++) {
        const x = i * cell + (cell - open) / 2;
        if (side) c.fillRect(x, s * 0.18, open, s * 0.64);
        else c.fillRect(x, j * cell + (cell - open) / 2, open, open);
      }
  });
}
