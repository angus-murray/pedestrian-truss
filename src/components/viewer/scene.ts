/**
 * The rendered bridge: structural members, deck, kerbs, handrails, screens, bearings and abutments.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BridgeModel } from '../../model/build';
import type { Finish } from '../../model/types';
import { boxBetween, chequerTexture, chordExtents, extrudeSection, gratingTexture, memberCuts, meshTexture, rod, speckleTexture, timberTexture, webHalfWidth } from './geometry';
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
  /** Steel details that are not members (bracing gussets): ghosted with the members. */
  details: THREE.Mesh[];
  furniture: THREE.Group; // deck, kerbs, handrails, screens
  context: THREE.Group; // bearings, abutments, ground
  steel: THREE.MeshStandardMaterial;
  dispose: () => void;
}

const GUSSET_T = 0.012;
/** Underside of the lowest of the bottom chords and cross girders, where the bracing gussets are fixed. */
const gussetTop = (model: BridgeModel) => Math.min(-model.geo.dBC / 2, model.geo.zCG - model.geo.dCG / 2);
/** Level at which the plan bracing is drawn: just below the gussets. */
function bracingZ(model: BridgeModel) {
  const br = model.members.find((m) => m.group === 'bracing');
  const d = br ? (Math.abs(br.depthDir[2]) > 0.5 ? br.sp.d : br.sp.b) / 1000 : 0;
  return gussetTop(model) - GUSSET_T - d / 2;
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
  const details: THREE.Mesh[] = [];
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
    let [a, b] = m.group === 'topChord' || m.group === 'bottomChord' ? chordExtents(model, m) : [m.a, m.b];
    // plan bracing is analysed at the cross girder ends and drawn below the cross girders and stringers
    if (m.group === 'bracing') {
      const dz = bracingZ(model) - m.a[2];
      a = [a[0], a[1], a[2] + dz];
      b = [b[0], b[1], b[2] + dz];
    }
    // stringers are analysed on the cross girder axis and drawn with their tops level with the cross girder tops
    // (1 mm lower, so the coincident top faces do not flicker)
    if (m.group === 'stringer') {
      const dz = geo.zST - geo.zCG - 0.001;
      a = [a[0], a[1], a[2] + dz];
      b = [b[0], b[1], b[2] + dz];
    }
    const g = extrudeSection(m.sp.outer, m.sp.holes, a, b, m.depthDir, cutA, cutB);
    const mesh = add(membersGroup, g, steel);
    mesh.userData.memberId = m.id;
    members.set(m.id, mesh);
  }

  // plan bracing gussets under the cross girder ends, on top of the bracing
  if (input.bracing !== 'none') {
    const zt = gussetTop(model);
    for (let k = 0; k <= geo.n; k++)
      for (const sg of [-1, 1]) {
        const y0 = sg * (geo.s / 2 + geo.wBC / 2), y1 = sg * (geo.s / 2 - geo.wBC / 2 - 0.35);
        details.push(add(membersGroup, boxBetween(k * geo.a - (k === 0 ? 0.1 : 0.4), k * geo.a + (k === geo.n ? 0.1 : 0.4), Math.min(y0, y1), Math.max(y0, y1), zt - GUSSET_T, zt), steel));
      }
  }

  // ------------------------------------------------------------ deck
  const deckX0 = -0.02, deckX1 = geo.L + 0.02;
  const yIn = geo.deckWidth / 2 - 0.005;
  const deckT = input.deckThickness / 1000;
  const z0 = geo.deckSoffit, z1 = geo.deckTop;
  const repeatFor = (t: THREE.Texture, sx: number, sy: number) => {
    t.repeat.set(sx, sy);
    return t;
  };
  if (input.deckType === 'concrete') {
    const tex = keep(repeatFor(speckleTexture('#bdb8ae', ['#7d786f', '#e5e1d8', '#9a958c']), geo.L / 2, geo.deckWidth / 2));
    const mat = keep(new THREE.MeshStandardMaterial({ color: '#c4bfb5', map: tex, roughness: 0.92 }));
    add(furniture, boxBetween(deckX0, deckX1, -yIn, yIn, z0, z1), mat);
  } else if (input.deckType === 'precast') {
    const tex = keep(repeatFor(speckleTexture('#c9c4ba', ['#7d786f', '#e5e1d8']), 1, geo.deckWidth / 2));
    const mat = keep(new THREE.MeshStandardMaterial({ color: '#d0cbc1', map: tex, roughness: 0.9 }));
    for (let k = 0; k < geo.n; k++) add(furniture, boxBetween(k * geo.a + 0.006, (k + 1) * geo.a - 0.006, -yIn, yIn, z0, z1), mat);
  } else if (input.deckType === 'frp') {
    // moulded FRP mini-mesh grating: small square openings at close centres with a gritted top, in panels
    const pitch = 0.025, tile = 4 * pitch;
    const top = keep(repeatFor(gratingTexture('#6e747a', '#25282c'), 1 / tile, 1 / tile));
    const side = keep(repeatFor(gratingTexture('#5d6368', '#2a2d31', true), 1 / tile, 1 / tile));
    const matTop = keep(new THREE.MeshStandardMaterial({ color: '#ffffff', map: top, roughness: 0.95 }));
    const matSide = keep(new THREE.MeshStandardMaterial({ color: '#ffffff', map: side, roughness: 0.9 }));
    const pw = 1.0;
    for (let x = 0; x < geo.L - 1e-6; x += pw) {
      const xa = x + 0.004, xb = Math.min(geo.L, x + pw) - 0.004;
      const g = boxBetween(xa, xb, -yIn, yIn, z0, z1);
      // texture in metres on every face
      const pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const nz = Math.abs(nor.getZ(i)), ny = Math.abs(nor.getY(i));
        uv.setXY(i, nz > 0.5 ? pos.getX(i) : ny > 0.5 ? pos.getX(i) : pos.getY(i), nz > 0.5 ? pos.getY(i) : pos.getZ(i));
      }
      g.clearGroups();
      g.addGroup(0, 24, 1);
      g.addGroup(24, 12, 0);
      add(furniture, g, [matTop, matSide] as unknown as THREE.Material);
    }
  } else if (input.deckType === 'timber') {
    // boards spanning across the bridge (on the stringers), laid side by side along it, grain along each board
    const tex = keep(timberTexture());
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const mat = keep(new THREE.MeshStandardMaterial({ color: '#ffffff', map: tex, roughness: 0.8 }));
    const bw = 0.14, gap = 0.008;
    const boards: THREE.BufferGeometry[] = [];
    for (let x = deckX0; x < deckX1 - 1e-6; x += bw + gap) {
      const g = boxBetween(x, Math.min(deckX1, x + bw), -yIn, yIn, z0, z1);
      const pos = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getY(i) + x * 7.3) / 1.2, (pos.getX(i) - x + pos.getZ(i)) / 0.6);
      boards.push(g);
    }
    add(furniture, mergeGeometries(boards), mat);
    boards.forEach((g) => g.dispose());
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

  // ------------------------------------------------------------ handrails on brackets from the web members
  const rail = 0.0483 / 2;
  const yFaceAbs = geo.s / 2 - webHalfWidth(model);
  const webs = model.members.filter((m) => m.group === 'vertical' || m.group === 'endPost' || (!geo.verticals && m.group === 'diagonal'));
  for (const h of geo.handrailHeights) {
    const zr = geo.deckTop + h;
    for (const sg of [-1, 1]) {
      const y = sg * (geo.clearWidth / 2 + rail);
      // bracket where each web member passes the rail level
      const xs = webs
        .filter((m) => Math.sign(m.a[1]) === sg && (m.a[2] - zr) * (m.b[2] - zr) <= 0 && m.a[2] !== m.b[2])
        .map((m) => m.a[0] + ((zr - m.a[2]) / (m.b[2] - m.a[2])) * (m.b[0] - m.a[0]))
        .sort((p, q) => p - q);
      add(furniture, rod([0, y, zr], [geo.L, y, zr], rail), steel);
      for (const x of xs) {
        const yFace = sg * yFaceAbs;
        add(furniture, boxBetween(x - 0.005, x + 0.005, Math.min(yFace, y), Math.max(yFace, y), zr - rail - 0.05, zr - rail), steel);
      }
    }
  }

  // ------------------------------------------------------------ screens on the inside of the trusses, behind the handrails
  if (input.screens) {
    const meshMat = keep(new THREE.MeshStandardMaterial({ map: keep(meshTexture('#2f3438')), transparent: true, depthWrite: false, side: THREE.DoubleSide, metalness: 0.4, roughness: 0.6 }));
    const frameMat = darkSteel;
    const zb = geo.deckTop + 0.1, zt = geo.deckTop + input.screenHeight;
    const tcSoffit = geo.H - geo.dTC / 2;
    const above = zt > tcSoffit + 0.02;
    // panels between the verticals, or between posts at the bottom chord panel points of a Warren truss
    const xsPost = Array.from({ length: geo.n + 1 }, (_, k) => k * geo.a);
    for (const sg of [-1, 1]) {
      const yScr = sg * (yFaceAbs - 0.012);
      for (let k = 0; k < xsPost.length - 1; k++) {
        const xa = xsPost[k] + (k === 0 ? 0.08 : 0.06), xb = xsPost[k + 1] - (k === xsPost.length - 2 ? 0.08 : 0.06);
        const w = xb - xa, h = zt - zb;
        const plane = new THREE.PlaneGeometry(w, h);
        plane.rotateX(Math.PI / 2);
        plane.translate((xa + xb) / 2, yScr, (zb + zt) / 2);
        const uv = plane.attributes.uv as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 0.2), uv.getY(i) * (h / 0.2));
        add(furniture, plane, meshMat, false);
        // panel frame (flat bars)
        add(furniture, boxBetween(xa, xb, yScr - 0.003, yScr + 0.003, zt - 0.04, zt), frameMat);
        add(furniture, boxBetween(xa, xb, yScr - 0.003, yScr + 0.003, zb, zb + 0.04), frameMat);
        add(furniture, boxBetween(xa - 0.04, xa, yScr - 0.003, yScr + 0.003, zb, zt), frameMat);
        add(furniture, boxBetween(xb, xb + 0.04, yScr - 0.003, yScr + 0.003, zb, zt), frameMat);
      }
      // screen posts only as extensions of the verticals above the top chord, when the screen is higher than the
      // chord: the screens and handrails are otherwise carried by the truss members alone
      const post = new THREE.Shape(roundedRect(75, 75, 6).map(([u, v]) => new THREE.Vector2(u / 1000, v / 1000)));
      for (const x of xsPost) {
        const end = x < 1e-6 || x > geo.L - 1e-6;
        if (end || !geo.verticals || !above) continue;
        const z0p = tcSoffit;
        const g = new THREE.ExtrudeGeometry(post, { depth: zt - z0p, bevelEnabled: false, curveSegments: 4 });
        g.translate(Math.min(Math.max(x, 0.04), geo.L - 0.04), yScr - sg * 0.045, z0p);
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
    details,
    furniture,
    context,
    steel,
    dispose: () => disposables.forEach((d) => d.dispose())
  };
}
