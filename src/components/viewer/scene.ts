/**
 * The rendered bridge: structural members, deck, kerbs, handrails, screens, bearings and abutments.
 */
import * as THREE from 'three';
import type { BridgeModel } from '../../model/build';
import type { Finish } from '../../model/types';
import { boxBetween, chequerTexture, chordExtents, extrudeSection, memberCuts, meshTexture, rod, speckleTexture, timberTexture } from './geometry';
import { roundedRect } from '../../design/section';

export const FINISH: Record<Finish, { colour: string; metalness: number; roughness: number; label: string }> = {
  galvanised: { colour: '#aeb4ba', metalness: 0.8, roughness: 0.42, label: 'Galvanised' },
  grey: { colour: '#8d949b', metalness: 0.35, roughness: 0.55, label: 'Grey Paint' },
  green: { colour: '#3f6b52', metalness: 0.3, roughness: 0.55, label: 'Green Paint' },
  charcoal: { colour: '#3b4046', metalness: 0.35, roughness: 0.5, label: 'Charcoal Paint' }
};

export interface BridgeObjects {
  root: THREE.Group;
  members: Map<number, THREE.Mesh>;
  furniture: THREE.Group; // deck, kerbs, handrails, screens
  context: THREE.Group; // bearings, abutments, ground
  steel: THREE.MeshStandardMaterial;
  dispose: () => void;
}

/** Ground level under the bridge (m): a clearance of 4 m below the abutment headstocks. */
export const groundLevel = (model: BridgeModel) => -model.geo.dBC / 2 - 0.22 - 1.0 - 4.0;

export function buildBridge(model: BridgeModel): BridgeObjects {
  const { geo, input } = model;
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const fin = FINISH[input.finish];
  const steel = keep(new THREE.MeshStandardMaterial({ color: fin.colour, metalness: fin.metalness, roughness: fin.roughness }));
  const darkSteel = keep(new THREE.MeshStandardMaterial({ color: '#4a4f55', metalness: 0.5, roughness: 0.6 }));
  const root = new THREE.Group();
  const membersGroup = new THREE.Group();
  const furniture = new THREE.Group();
  const context = new THREE.Group();
  root.add(membersGroup, furniture, context);
  const members = new Map<number, THREE.Mesh>();
  const add = (grp: THREE.Group, g: THREE.BufferGeometry, mat: THREE.Material, shadow = true) => {
    keep(g);
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    grp.add(mesh);
    return mesh;
  };

  // ------------------------------------------------------------ structural members
  for (const m of model.members) {
    const [cutA, cutB] = memberCuts(model, m);
    const [a, b] = m.group === 'topChord' || m.group === 'bottomChord' ? chordExtents(model, m) : [m.a, m.b];
    const g = extrudeSection(m.sp.outer, m.sp.holes, a, b, m.depthDir, cutA, cutB);
    const mesh = add(membersGroup, g, steel);
    mesh.userData.memberId = m.id;
    members.set(m.id, mesh);
  }

  // cross girder end plates against the chords, and bearing stiffeners
  const cg = model.members.find((m) => m.group === 'crossGirder')!;
  const cgW = (input.sections.crossGirder.rotate ? cg.sp.d : cg.sp.b) / 1000;
  const cgUnder = geo.cgTop <= -geo.dBC / 2 + 1e-6;
  if (!cgUnder)
    for (let k = 0; k <= geo.n; k++)
      for (const sg of [-1, 1]) {
        const y = sg * (geo.s / 2 - geo.wBC / 2);
        add(membersGroup, boxBetween(k * geo.a - cgW / 2 - 0.01, k * geo.a + cgW / 2 + 0.01, y - sg * 0.016, y, geo.zCG - geo.dCG / 2 - 0.01, geo.cgTop), steel);
      }

  // plan bracing gussets under the cross girder ends
  if (input.bracing !== 'none') {
    const z = geo.zCG;
    for (let k = 0; k <= geo.n; k++)
      for (const sg of [-1, 1]) {
        const y0 = sg * (geo.s / 2 - geo.wBC / 2), y1 = sg * (geo.s / 2 - geo.wBC / 2 - 0.35);
        add(membersGroup, boxBetween(k * geo.a - (k === 0 ? 0 : 0.32), k * geo.a + (k === geo.n ? 0 : 0.32), Math.min(y0, y1), Math.max(y0, y1), z - 0.006, z + 0.006), steel);
      }
  }

  // ------------------------------------------------------------ deck
  const deckX0 = -0.02, deckX1 = geo.L + 0.02;
  const yIn = geo.deckWidth / 2 - 0.005;
  const deckT = input.deckThickness / 1000;
  const z0 = geo.cgTop, z1 = geo.deckTop;
  const repeatFor = (t: THREE.Texture, sx: number, sy: number) => {
    t.repeat.set(sx, sy);
    return t;
  };
  if (input.deckType === 'concrete') {
    const tex = keep(repeatFor(speckleTexture('#bdb8ae', ['#7d786f', '#e5e1d8', '#9a958c']), geo.L / 2, geo.deckWidth / 2));
    const surf = input.surfacing > 0 ? keep(repeatFor(speckleTexture('#5d5f61', ['#2f3133', '#8d9093', '#c9a96e'], 0.12), geo.L / 1.5, geo.deckWidth / 1.5)) : tex;
    const mats = [
      keep(new THREE.MeshStandardMaterial({ color: '#c4bfb5', map: tex, roughness: 0.92 })),
      keep(new THREE.MeshStandardMaterial({ color: '#ffffff', map: surf, roughness: 0.95 }))
    ];
    const g = boxBetween(deckX0, deckX1, -yIn, yIn, z0, z1);
    // top face (+z) uses the surfacing material
    g.clearGroups();
    const idx = g.index!.count;
    g.addGroup(0, 24, 0);
    g.addGroup(24, 6, 1);
    g.addGroup(30, idx - 30, 0);
    add(furniture, g, mats as unknown as THREE.Material);
  } else if (input.deckType === 'precast') {
    const tex = keep(repeatFor(speckleTexture('#c9c4ba', ['#7d786f', '#e5e1d8']), 1, geo.deckWidth / 2));
    const mat = keep(new THREE.MeshStandardMaterial({ color: '#d0cbc1', map: tex, roughness: 0.9 }));
    for (let k = 0; k < geo.n; k++) add(furniture, boxBetween(k * geo.a + 0.006, (k + 1) * geo.a - 0.006, -yIn, yIn, z0, z1), mat);
  } else if (input.deckType === 'frp') {
    const tex = keep(repeatFor(speckleTexture('#6f7c70', ['#3d463e', '#a8b4a6'], 0.2), geo.a, geo.deckWidth));
    const mat = keep(new THREE.MeshStandardMaterial({ color: '#8b9a8b', map: tex, roughness: 0.85 }));
    const pw = 0.5;
    for (let x = 0; x < geo.L - 1e-6; x += pw) add(furniture, boxBetween(x + 0.003, Math.min(geo.L, x + pw) - 0.003, -yIn, yIn, z0, z1), mat);
  } else if (input.deckType === 'timber') {
    const tex = keep(timberTexture());
    tex.repeat.set(geo.a / 1.2, 1);
    const mat = keep(new THREE.MeshStandardMaterial({ color: '#ffffff', map: tex, roughness: 0.8 }));
    const bw = 0.14, gap = 0.008;
    for (let y = -yIn; y < yIn - 1e-6; y += bw + gap) add(furniture, boxBetween(deckX0, deckX1, y, Math.min(yIn, y + bw), z0, z1), mat);
  } else {
    const tex = keep(chequerTexture());
    tex.repeat.set(geo.L / 0.6, geo.deckWidth / 0.6);
    const mat = keep(new THREE.MeshStandardMaterial({ color: '#ffffff', map: tex, metalness: 0.6, roughness: 0.5 }));
    add(furniture, boxBetween(deckX0, deckX1, -yIn, yIn, z0, z0 + Math.max(0.006, deckT)), mat);
  }

  // kerbs (kick plates) at the deck edges
  for (const sg of [-1, 1]) {
    const y = sg * (geo.deckWidth / 2 - 0.006);
    add(furniture, boxBetween(deckX0, deckX1, y - 0.005, y + 0.005, z1, z1 + 0.1), steel);
  }

  // ------------------------------------------------------------ handrails on brackets at the web members
  const rail = 0.0483 / 2;
  const zr = geo.deckTop + input.handrailHeight;
  const posts = model.members.filter((m) => m.group === 'vertical' || m.group === 'endPost');
  for (const sg of [-1, 1]) {
    const y = sg * (geo.clearWidth / 2 + rail);
    const xs = [0, geo.L];
    add(furniture, rod([xs[0], y, zr], [xs[1], y, zr], rail), steel);
    const brackets = geo.verticals ? posts.filter((p) => Math.sign(p.a[1]) === sg).map((p) => p.a[0]) : Array.from({ length: geo.n + 1 }, (_, k) => k * geo.a);
    for (const x of brackets) {
      const p = posts.find((q) => Math.abs(q.a[0] - x) < 1e-6 && Math.sign(q.a[1]) === sg);
      const halfY = p ? (Math.abs(p.depthDir[1]) > 0.5 ? p.sp.d : p.sp.b) / 2000 : geo.wBC / 2;
      const yFace = sg * (geo.s / 2 - halfY);
      const xb = Math.min(Math.max(x, 0.05), geo.L - 0.05);
      add(furniture, boxBetween(xb - 0.005, xb + 0.005, Math.min(yFace, y), Math.max(yFace, y), zr - rail - 0.05, zr - rail), steel);
    }
  }

  // ------------------------------------------------------------ screens on the outside face of the trusses
  if (input.screens) {
    const meshMat = keep(new THREE.MeshStandardMaterial({ map: keep(meshTexture('#2f3438')), transparent: true, depthWrite: false, side: THREE.DoubleSide, metalness: 0.4, roughness: 0.6 }));
    const frameMat = darkSteel;
    const zb = -geo.dBC / 2, zt = geo.deckTop + input.screenHeight;
    const above = zt > geo.H + geo.dTC / 2 + 0.02;
    const xsPost = geo.verticals ? Array.from({ length: geo.n + 1 }, (_, k) => k * geo.a) : Array.from({ length: geo.n + 1 }, (_, k) => k * geo.a);
    for (const sg of [-1, 1]) {
      const yOut = sg * (geo.s / 2 + geo.chordWidth / 2 + 0.03);
      for (let k = 0; k < xsPost.length - 1; k++) {
        const xa = xsPost[k] + 0.04, xb = xsPost[k + 1] - 0.04;
        const w = xb - xa, h = zt - zb;
        const plane = new THREE.PlaneGeometry(w, h);
        plane.rotateX(Math.PI / 2);
        plane.translate((xa + xb) / 2, yOut, (zb + zt) / 2);
        const uv = plane.attributes.uv as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 0.2), uv.getY(i) * (h / 0.2));
        add(furniture, plane, meshMat, false);
        // panel frame (flat bars)
        add(furniture, boxBetween(xa, xb, yOut - 0.003, yOut + 0.003, zt - 0.04, zt), frameMat);
        add(furniture, boxBetween(xa, xb, yOut - 0.003, yOut + 0.003, zb, zb + 0.04), frameMat);
        add(furniture, boxBetween(xa - 0.04, xa, yOut - 0.003, yOut + 0.003, zb, zt), frameMat);
        add(furniture, boxBetween(xb, xb + 0.04, yOut - 0.003, yOut + 0.003, zb, zt), frameMat);
      }
      // screen posts above the top chord
      if (above)
        for (const x of xsPost) {
          const post = new THREE.Shape(roundedRect(75, 75, 6).map(([u, v]) => new THREE.Vector2(u / 1000, v / 1000)));
          const g = new THREE.ExtrudeGeometry(post, { depth: zt - (geo.H - geo.dTC / 2), bevelEnabled: false, curveSegments: 4 });
          g.translate(x, yOut - sg * 0.045, geo.H - geo.dTC / 2);
          add(furniture, g, steel);
        }
    }
  }

  // ------------------------------------------------------------ bearings, abutments and ground
  const concrete = keep(new THREE.MeshStandardMaterial({ color: '#c9c5bd', map: keep(repeatFor(speckleTexture('#c9c5bd', ['#8a857c', '#efece6']), 3, 3)), roughness: 0.95 }));
  const rubber = keep(new THREE.MeshStandardMaterial({ color: '#2b2d30', roughness: 0.9 }));
  const bh = 0.07, plinth = 0.12;
  for (const x of [0, geo.L])
    for (const sg of [-1, 1]) {
      const y = sg * geo.s / 2;
      add(context, boxBetween(x - 0.16, x + 0.16, y - 0.16, y + 0.16, -geo.dBC / 2 - bh, -geo.dBC / 2), rubber);
      add(context, boxBetween(x - 0.22, x + 0.22, y - 0.22, y + 0.22, -geo.dBC / 2 - bh - 0.03, -geo.dBC / 2 - bh), darkSteel);
      add(context, boxBetween(x - 0.3, x + 0.3, y - 0.3, y + 0.3, -geo.dBC / 2 - bh - 0.03 - plinth, -geo.dBC / 2 - bh - 0.03), concrete);
    }
  const zHead = -geo.dBC / 2 - bh - 0.03 - plinth;
  const zGround = groundLevel(model);
  const halfW = geo.s / 2 + 0.7;
  const emb = keep(new THREE.MeshStandardMaterial({ color: '#8a9673', roughness: 1 }));
  for (const [x, dir] of [[0, -1], [geo.L, 1]] as const) {
    const xFront = x - dir * 0.45, xBack = x + dir * 0.5;
    // headstock on a spill-through embankment
    add(context, boxBetween(Math.min(xFront, xBack + dir * 0.6), Math.max(xFront, xBack + dir * 0.6), -halfW, halfW, zHead - 1.0, zHead), concrete);
    // ballast wall up to the deck
    add(context, boxBetween(Math.min(xBack, xBack + dir * 0.3), Math.max(xBack, xBack + dir * 0.3), -halfW, halfW, zHead, geo.deckTop), concrete);
    // approach path on the fill
    add(context, boxBetween(Math.min(xBack + dir * 0.3, xBack + dir * 10), Math.max(xBack + dir * 0.3, xBack + dir * 10), -geo.clearWidth / 2 - 0.3, geo.clearWidth / 2 + 0.3, geo.deckTop - 0.2, geo.deckTop), concrete);
    // embankment: fill behind the abutment, sloping 1 in 1.5 in front of the headstock down to the ground
    const top = geo.deckTop - 0.2;
    const prof = new THREE.Shape();
    const toe = xFront - dir * 1.5 * (zHead - 1.0 - zGround);
    const pts: [number, number][] = [
      [xFront, zHead - 1.0],
      [xBack + dir * 0.3, zHead - 1.0],
      [xBack + dir * 0.3, top],
      [xBack + dir * 10, top],
      [xBack + dir * 10, zGround],
      [toe, zGround]
    ];
    pts.forEach(([u, v], i) => (i ? prof.lineTo(u, v) : prof.moveTo(u, v)));
    const g = new THREE.ExtrudeGeometry(prof, { depth: 2 * halfW + 6, bevelEnabled: false });
    g.rotateX(Math.PI / 2);
    g.translate(0, halfW + 3, 0);
    add(context, g, emb, false);
  }
  return {
    root,
    members,
    furniture,
    context,
    steel,
    dispose: () => disposables.forEach((d) => d.dispose())
  };
}
