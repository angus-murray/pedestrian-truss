/**
 * Pedestrians and cyclists on the deck, for an architectural view (not a load). Figures are built from tapered
 * limbs posed by two-link inverse kinematics, so feet stand on the deck and cyclists' feet are on the pedals.
 */
import * as THREE from 'three';
import type { BridgeModel } from '../../model/build';

const TOPS = ['#2f5d8a', '#b8473d', '#3d7a52', '#d9a441', '#5b4a7a', '#2e3338', '#d8d2c6', '#8a5a3c', '#3f7f8f', '#c56b8a'];
const SKIN = ['#e9c6a8', '#d1a27e', '#a8754f', '#7a4f33', '#f2d6bd', '#5a3a26'];
const BOTTOMS = ['#2b3440', '#3b3b3b', '#4a5a6e', '#6b5d4a', '#1f2a36', '#7d7466', '#2d3e5c'];
const HAIR = ['#1d1a17', '#3b2a1e', '#6b4a2c', '#a07b4f', '#c9c1b4', '#2a2420'];
const SHOES = ['#1c1c1e', '#f1f1f1', '#5a4636', '#2e3a4a'];

function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
}
const pick = <T,>(arr: T[], r: () => number) => arr[Math.floor(r() * arr.length) % arr.length];
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Tapered round segment between two points, with rounded ends. */
function segment(g: THREE.Group, a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number, mat: THREE.Material) {
  const len = a.distanceTo(b);
  const c = new THREE.Mesh(new THREE.CylinderGeometry(rb, ra, len, 12, 1), mat);
  c.position.copy(a).add(b).multiplyScalar(0.5);
  c.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
  g.add(c);
  for (const [p, r] of [[a, ra], [b, rb]] as const) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mat);
    s.position.copy(p);
    g.add(s);
  }
}

/**
 * Two-link chain from a root to a target (thigh and shin, or upper arm and forearm), bending towards `bend`.
 * Returns the middle joint (knee or elbow). The target is pulled in if out of reach.
 */
function ik(root: THREE.Vector3, target: THREE.Vector3, l1: number, l2: number, bend: THREE.Vector3): THREE.Vector3 {
  const d = target.clone().sub(root);
  let dist = d.length();
  dist = Math.min(dist, (l1 + l2) * 0.999);
  const dir = d.normalize();
  const cosA = (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist);
  const a = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const side = bend.clone().sub(dir.clone().multiplyScalar(bend.dot(dir))).normalize();
  return root.clone().add(dir.clone().multiplyScalar(l1 * Math.cos(a))).add(side.multiplyScalar(l1 * Math.sin(a)));
}

/** Torso: a lathe profile (hips, waist, chest, shoulders), flattened front to back. */
function torso(g: THREE.Group, hip: THREE.Vector3, neck: THREE.Vector3, k: number, mat: THREE.Material, female: boolean) {
  const len = hip.distanceTo(neck);
  const prof = [
    [0.001, 0],
    [female ? 0.17 : 0.155, 0.02],
    [female ? 0.175 : 0.16, 0.12],
    [female ? 0.135 : 0.15, 0.4],
    [female ? 0.155 : 0.175, 0.7],
    [female ? 0.16 : 0.19, 0.86],
    [0.12, 0.97],
    [0.06, 1]
  ].map(([r, y]) => new THREE.Vector2(r * k, y * len));
  const geo = new THREE.LatheGeometry(prof, 20);
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(1, 1, 0.62);
  const holder = new THREE.Group();
  holder.add(m);
  holder.position.copy(hip);
  holder.quaternion.setFromUnitVectors(V(0, 1, 0), neck.clone().sub(hip).normalize());
  // flatten front to back (local z of the lathe → global x for a figure facing +x)
  m.rotation.y = Math.PI / 2;
  g.add(holder);
}

function head(g: THREE.Group, at: THREE.Vector3, k: number, skin: THREE.Material, hair: THREE.Material, helmet?: THREE.Material) {
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.1 * k, 20, 14), skin);
  h.scale.set(1.0, 0.85, 1.18);
  h.position.copy(at);
  g.add(h);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.106 * k, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), helmet ?? hair);
  cap.rotation.x = Math.PI / 2;
  cap.rotation.z = -0.35;
  cap.scale.set(helmet ? 1.15 : 1, helmet ? 1.15 : 1, helmet ? 1.12 : 1.02);
  cap.position.copy(at).add(V(-0.012 * k, 0, 0.012 * k));
  g.add(cap);
}

function shoe(g: THREE.Group, ankle: THREE.Vector3, k: number, mat: THREE.Material, pitch = 0) {
  const s = new THREE.Mesh(new THREE.CapsuleGeometry(0.042 * k, 0.17 * k, 4, 10), mat);
  s.rotation.z = Math.PI / 2;
  s.scale.set(1, 1, 0.8);
  const holder = new THREE.Group();
  holder.add(s);
  holder.position.copy(ankle).add(V(0.05 * k, 0, -0.035 * k));
  holder.rotation.y = pitch;
  g.add(holder);
}

/** A walking figure facing +x with its feet on z = 0. */
function walker(r: () => number): THREE.Group {
  const g = new THREE.Group();
  const female = r() > 0.5;
  const h = female ? 1.58 + r() * 0.16 : 1.7 + r() * 0.17;
  const k = h / 1.75;
  const skin = new THREE.MeshStandardMaterial({ color: pick(SKIN, r), roughness: 0.65 });
  const top = new THREE.MeshStandardMaterial({ color: pick(TOPS, r), roughness: 0.85 });
  const bottom = new THREE.MeshStandardMaterial({ color: pick(BOTTOMS, r), roughness: 0.9 });
  const hair = new THREE.MeshStandardMaterial({ color: pick(HAIR, r), roughness: 0.9 });
  const shoes = new THREE.MeshStandardMaterial({ color: pick(SHOES, r), roughness: 0.6 });
  const thigh = 0.25 * h, shin = 0.25 * h, ankleH = 0.045 * h;
  const stride = (0.28 + r() * 0.1) * h;
  const phase = r() * 2 - 1; // −1..1: which foot is forward and by how much
  const hipZ = Math.sqrt((thigh + shin) ** 2 - (stride / 2) ** 2) * 0.985 + ankleH;
  const pelvis = V(0, 0, hipZ);
  // legs: front and back foot on the ground
  for (const sy of [-1, 1]) {
    const fwd = sy * phase;
    const hipJ = pelvis.clone().add(V(0, sy * 0.09 * k, 0));
    const ankle = V((fwd * stride) / 2, sy * 0.1 * k, ankleH);
    const knee = ik(hipJ, ankle, thigh, shin, V(1, 0, 0));
    segment(g, hipJ, knee, 0.075 * k, 0.055 * k, bottom);
    segment(g, knee, ankle, 0.052 * k, 0.038 * k, bottom);
    shoe(g, ankle, k, shoes, fwd > 0 ? -0.15 : 0.12);
  }
  // torso, slight forward lean
  const neck = pelvis.clone().add(V(0.02 * h, 0, 0.3 * h));
  torso(g, pelvis.clone().add(V(0, 0, -0.03 * h)), neck, k, top, female);
  segment(g, neck, neck.clone().add(V(0.005, 0, 0.05 * k)), 0.045 * k, 0.042 * k, skin);
  head(g, neck.clone().add(V(0.012 * k, 0, 0.14 * k)), k, skin, hair);
  // arms swinging opposite to the legs, elbows slightly bent
  for (const sy of [-1, 1]) {
    const sh = neck.clone().add(V(-0.01 * k, sy * 0.19 * k, -0.04 * k));
    const swing = -sy * phase * 0.35;
    const hand = sh.clone().add(V(Math.sin(swing) * 0.5 * k + 0.05 * k, sy * 0.04 * k, -Math.cos(swing) * 0.52 * k));
    const elbow = ik(sh, hand, 0.29 * k, 0.27 * k, V(-1, 0, 0));
    segment(g, sh, elbow, 0.048 * k, 0.04 * k, top);
    segment(g, elbow, hand, 0.036 * k, 0.03 * k, skin);
  }
  // some carry a backpack
  if (r() > 0.65) {
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.14 * k, 0.3 * k, 0.4 * k), new THREE.MeshStandardMaterial({ color: pick(BOTTOMS, r), roughness: 0.8 }));
    pack.position.copy(pelvis).add(V(-0.17 * k, 0, 0.33 * k));
    g.add(pack);
  }
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/** A cyclist on a bicycle facing +x, tyres on z = 0. */
function cyclist(r: () => number): THREE.Group {
  const g = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: pick(['#b8473d', '#2f5d8a', '#1f2328', '#3d7a52', '#d8d2c6'], r), metalness: 0.6, roughness: 0.35 });
  const black = new THREE.MeshStandardMaterial({ color: '#1a1b1d', roughness: 0.8 });
  const alloy = new THREE.MeshStandardMaterial({ color: '#b9bec4', metalness: 0.9, roughness: 0.3 });
  const skin = new THREE.MeshStandardMaterial({ color: pick(SKIN, r), roughness: 0.65 });
  const top = new THREE.MeshStandardMaterial({ color: pick(TOPS, r), roughness: 0.8 });
  const bottom = new THREE.MeshStandardMaterial({ color: pick(BOTTOMS, r), roughness: 0.9 });
  const hair = new THREE.MeshStandardMaterial({ color: pick(HAIR, r), roughness: 0.9 });
  const helmet = new THREE.MeshStandardMaterial({ color: pick(['#f1f1f1', '#d9a441', '#2f5d8a', '#1d1d1f'], r), roughness: 0.4 });
  const shoes = new THREE.MeshStandardMaterial({ color: pick(SHOES, r), roughness: 0.6 });
  const R = 0.34, wb = 1.03;
  const tube = (a: THREE.Vector3, b: THREE.Vector3, rad = 0.014, mat: THREE.Material = frameMat) => {
    const len = a.distanceTo(b);
    const c = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 10), mat);
    c.position.copy(a).add(b).multiplyScalar(0.5);
    c.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
    g.add(c);
  };
  // wheels: tyre, rim, hub and spokes
  for (const x of [-wb / 2, wb / 2]) {
    const c = V(x, 0, R);
    const tyre = new THREE.Mesh(new THREE.TorusGeometry(R - 0.017, 0.017, 10, 48), black);
    tyre.rotation.x = Math.PI / 2;
    tyre.position.copy(c);
    g.add(tyre);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R - 0.04, 0.008, 6, 48), alloy);
    rim.rotation.x = Math.PI / 2;
    rim.position.copy(c);
    g.add(rim);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      tube(c.clone().add(V(0, i % 2 ? 0.02 : -0.02, 0)), c.clone().add(V(Math.cos(a) * (R - 0.045), 0, Math.sin(a) * (R - 0.045))), 0.0015, alloy);
    }
    tube(c.clone().add(V(0, -0.05, 0)), c.clone().add(V(0, 0.05, 0)), 0.012, alloy);
  }
  const rear = V(-wb / 2, 0, R), front = V(wb / 2, 0, R);
  const bb = V(-0.08, 0, 0.29), seatTop = V(-0.26, 0, 0.86), headTube = V(0.33, 0, 0.8), headLow = V(0.37, 0, 0.66);
  tube(rear.clone().add(V(0, 0.04, 0)), bb, 0.011);
  tube(rear.clone().add(V(0, -0.04, 0)), bb, 0.011);
  tube(rear.clone().add(V(0, 0.04, 0)), seatTop.clone().add(V(0.03, 0, -0.08)), 0.01);
  tube(rear.clone().add(V(0, -0.04, 0)), seatTop.clone().add(V(0.03, 0, -0.08)), 0.01);
  tube(bb, seatTop.clone().add(V(0.02, 0, -0.05)), 0.016);
  tube(seatTop.clone().add(V(0.02, 0, -0.06)), headTube, 0.015);
  tube(bb, headLow, 0.019);
  tube(headLow, headTube.clone().add(V(-0.01, 0, 0.06)), 0.02);
  tube(headLow, front.clone().add(V(0, 0.045, 0)), 0.011);
  tube(headLow, front.clone().add(V(0, -0.045, 0)), 0.011);
  // seat post, saddle, stem and handlebar
  tube(seatTop.clone().add(V(0.02, 0, -0.05)), seatTop, 0.012, alloy);
  const saddle = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.18, 4, 8), black);
  saddle.rotation.z = Math.PI / 2;
  saddle.scale.set(1, 1, 0.45);
  saddle.position.copy(seatTop).add(V(0.02, 0, 0.015));
  g.add(saddle);
  const stemTop = headTube.clone().add(V(-0.01, 0, 0.1));
  const bar = stemTop.clone().add(V(0.09, 0, 0.01));
  tube(headTube, stemTop, 0.014, alloy);
  tube(stemTop, bar, 0.013, alloy);
  tube(bar.clone().add(V(0, -0.27, 0)), bar.clone().add(V(0, 0.27, 0)), 0.012, alloy);
  for (const sy of [-1, 1]) tube(bar.clone().add(V(-0.01, sy * 0.2, 0)), bar.clone().add(V(-0.01, sy * 0.28, 0)), 0.017, black);
  // cranks and pedals
  const crankAng = r() * Math.PI * 2;
  const pedals = [-1, 1].map((sy) => {
    const a = crankAng + (sy > 0 ? 0 : Math.PI);
    const p = bb.clone().add(V(Math.cos(a) * 0.17, sy * 0.1, Math.sin(a) * 0.17));
    tube(bb.clone().setY(sy * 0.07), p, 0.009, alloy);
    const ped = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.02), black);
    ped.position.copy(p).add(V(0, sy * 0.03, 0));
    g.add(ped);
    return p.clone().add(V(0, sy * 0.03, 0.03));
  });
  // rider
  const k = 1;
  const hip = seatTop.clone().add(V(-0.01, 0, 0.07));
  const shoulderC = hip.clone().add(V(0.36, 0, 0.42));
  torso(g, hip, shoulderC.clone().add(V(0.02, 0, 0.06)), k, top, r() > 0.6);
  for (const [i, sy] of [-1, 1].entries()) {
    const hipJ = hip.clone().add(V(0.02, sy * 0.1, 0));
    const ankle = pedals[i].clone().add(V(-0.04, 0, 0.05));
    const knee = ik(hipJ, ankle, 0.44, 0.44, V(1, 0, 0.3));
    segment(g, hipJ, knee, 0.075, 0.055, bottom);
    segment(g, knee, ankle, 0.052, 0.038, bottom);
    shoe(g, ankle, k, shoes, 0);
    const sh = shoulderC.clone().add(V(0, sy * 0.19, 0));
    const hand = bar.clone().add(V(-0.01, sy * 0.24, 0.02));
    const elbow = ik(sh, hand, 0.29, 0.27, V(0, sy * 0.4, -1));
    segment(g, sh, elbow, 0.046, 0.04, top);
    segment(g, elbow, hand, 0.036, 0.03, skin);
  }
  const neck = shoulderC.clone().add(V(0.04, 0, 0.07));
  segment(g, neck, neck.clone().add(V(0.04, 0, 0.05)), 0.045, 0.042, skin);
  head(g, neck.clone().add(V(0.09, 0, 0.13)), k, skin, hair, helmet);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

export function buildPeople(model: BridgeModel): THREE.Group {
  const { geo } = model;
  const group = new THREE.Group();
  const rand = rng(20261022);
  const half = geo.clearWidth / 2 - 0.35;
  // about one person per 4 m of span, and a cyclist per 12 m
  const nWalk = Math.max(2, Math.round(geo.L / 4));
  const nBike = Math.max(1, Math.round(geo.L / 12));
  for (let i = 0; i < nWalk + nBike; i++) {
    const bike = i >= nWalk;
    const p = bike ? cyclist(rand) : walker(rand);
    const x = 1 + ((i * 0.618 + rand() * 0.2) % 1) * (geo.L - 2);
    const dir = rand() > 0.5 ? 1 : -1;
    // keep left: people heading +x on one side, −x on the other
    const y = Math.max(-half, Math.min(half, -dir * (0.2 + rand() * half * 0.8)));
    p.position.set(x, y, geo.deckTop);
    p.rotation.z = (dir > 0 ? 0 : Math.PI) + (rand() - 0.5) * 0.15;
    group.add(p);
  }
  return group;
}
