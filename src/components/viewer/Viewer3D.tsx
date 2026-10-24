import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { useTheme, pct } from 'engineering-ui';
import { CheckCircle2, Loader2, Play } from 'lucide-react';
import type { BridgeModel } from '../../model/build';
import { comboLabel, bucklingLabel, type AnalysisResults } from '../../model/analysis';
import { buildBridge, groundLevel, type BridgeObjects } from './scene';
import { buildPeople } from './people';
import { buildSky, type Sky } from './sky';
import { axialColour, magnitudeColour, momentColour, utilColour, UTIL_LEGEND } from './colours';

export type ViewMode = 'model' | 'util' | 'axial' | 'bending' | 'deflection' | 'buckling' | 'vibration';

export interface ViewCapture {
  data: string;
  w: number;
  h: number;
}

const Ico: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const MODES: { key: ViewMode; label: string; icon: React.ReactNode }[] = [
  { key: 'model', label: 'Model', icon: <Ico><path d="M2 17h20M2 7h20M2 17L7 7l5 10 5-10 5 10" /></Ico> },
  { key: 'util', label: 'Utilisation', icon: <Ico><rect x="3" y="12" width="4" height="9" /><rect x="10" y="7" width="4" height="14" /><rect x="17" y="3" width="4" height="18" /></Ico> },
  { key: 'axial', label: 'Axial Force', icon: <Ico><path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4" /></Ico> },
  { key: 'bending', label: 'Bending', icon: <Ico><path d="M2 8h20" /><path d="M2 8c4 10 16 10 20 0" /><path d="M7 8v5M12 8v6.5M17 8v5" /></Ico> },
  { key: 'deflection', label: 'Deflection', icon: <Ico><path d="M2 6h20" strokeDasharray="2 2" /><path d="M2 6c5 9 15 9 20 0" /></Ico> },
  { key: 'buckling', label: 'Buckling', icon: <Ico><path d="M12 2v20" strokeDasharray="2 2" /><path d="M12 2c-6 6-6 14 0 20" /></Ico> },
  { key: 'vibration', label: 'Vibration', icon: <Ico><path d="M2 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0" /></Ico> }
];
/** Eye height above the deck of the first-person view (m). */
const EYE_HEIGHT = 1.6;
const VIEWS = [
  { key: 'iso', label: '3D' },
  { key: 'elev', label: 'Elevation' },
  { key: 'plan', label: 'Plan' },
  { key: 'end', label: 'End' },
  { key: 'fpv', label: 'First Person' }
] as const;

export const Viewer3D: React.FC<{
  model: BridgeModel;
  results: AnalysisResults | null;
  selected: number | null;
  onSelect: (id: number | null) => void;
  solveState: 'idle' | 'solving' | 'solved' | 'blocked';
  progress?: string;
  onSolve: () => void;
  onCancel: () => void;
  blockedReason?: string;
  captureRef?: React.MutableRefObject<(() => ViewCapture | null) | null>;
}> = ({ model, results, selected, onSelect, solveState, progress, onSolve, onCancel, blockedReason, captureRef }) => {
  const [theme] = useTheme();
  const mountRef = useRef<HTMLDivElement>(null);
  const three = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
    persp: THREE.PerspectiveCamera;
    ortho: THREE.OrthographicCamera;
    orthoHalf: number;
    controls: OrbitControls;
    sun: THREE.DirectionalLight;
    ground: THREE.Mesh;
    overlay: THREE.Group;
    lineMats: LineMaterial[];
    animate: ((t: number) => void) | null;
    /** First-person view: a pedestrian's eye on the deck. */
    eye: THREE.PerspectiveCamera;
    sky: Sky;
    hemi: THREE.HemisphereLight;
    fpv: { yaw: number; pitch: number; keys: Set<string>; last: number } | null;
  } | null>(null);
  const bridge = useRef<BridgeObjects | null>(null);
  const [mode, setMode] = useState<ViewMode>('model');
  const [combo, setCombo] = useState(-1); // −1: envelope (utilisation)
  const [bendAxis, setBendAxis] = useState<'major' | 'minor'>('major');
  const [bCombo, setBCombo] = useState(0);
  const [bMode, setBMode] = useState(0);
  const [vMode, setVMode] = useState(0);
  const [scale, setScale] = useState(1);
  const [showDeck, setShowDeck] = useState(true);
  const [showPeople, setShowPeople] = useState(false);
  const people = useRef<THREE.Group | null>(null);
  const [hover, setHover] = useState<{ id: number; x: number; y: number } | null>(null);
  const hasResults = !!results && !results.errors.length && results.design.length > 0;

  // results views need results
  useEffect(() => {
    if (!hasResults && mode !== 'model') setMode('model');
  }, [hasResults, mode]);
  useEffect(() => setShowDeck(mode === 'model'), [mode]);

  // ---------------------------------------------------------------- renderer, scene, camera
  useEffect(() => {
    const el = mountRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.55;
    const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 2000);
    camera.up.set(0, 0, 1);
    // true (orthographic) projection for the elevation, plan and end views
    const ortho = new THREE.OrthographicCamera(-10, 10, 10, -10, -500, 2000);
    ortho.up.set(0, 0, 1);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    const hemi = new THREE.HemisphereLight('#e8f0ff', '#8a8270', 1.1);
    scene.add(hemi);
    const sky = buildSky();
    scene.add(sky.group);
    const sun = new THREE.DirectionalLight('#fff6e8', 2.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun, sun.target);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: '#d9dccf', roughness: 1 }));
    ground.receiveShadow = true;
    scene.add(ground);
    const overlay = new THREE.Group();
    scene.add(overlay);
    const lineMats: LineMaterial[] = [];
    // a pedestrian's eye: 60° vertical field of view, close to the natural field of view on a screen
    const eye = new THREE.PerspectiveCamera(60, 1, 0.05, 2000);
    eye.up.set(0, 0, 1);
    three.current = { renderer, scene, camera, persp: camera, ortho, orthoHalf: 20, controls, sun, ground, overlay, lineMats, animate: null, eye, fpv: null, sky, hemi };
    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      eye.aspect = w / h;
      eye.updateProjectionMatrix();
      const half = three.current?.orthoHalf ?? 20;
      ortho.left = -half;
      ortho.right = half;
      ortho.top = (half * h) / w;
      ortho.bottom = (-half * h) / w;
      ortho.updateProjectionMatrix();
      lineMats.forEach((m) => m.resolution.set(w, h));
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    renderer.setAnimationLoop((time) => {
      const t = three.current;
      if (t?.fpv) walk(t, time / 1000);
      else controls.update();
      t?.animate?.(time / 1000);
      if (t) {
        // the sky dome travels with the camera
        t.sky.group.position.copy(t.camera.position);
        renderer.render(scene, t.camera);
      }
    });
    return () => {
      ro.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      three.current = null;
    };
  }, []);

  // theme: background and ground
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    const night = theme === 'dark';
    t.scene.background = new THREE.Color(night ? '#0b1220' : '#e3f1fb');
    t.sky.setNight(night);
    (t.ground.material as THREE.MeshStandardMaterial).color.set(night ? '#1c241d' : '#cfd9c2');
    // moonlight: dim and cool; daylight: bright and warm
    t.sun.color.set(night ? '#9db3ff' : '#fff6e8');
    t.sun.intensity = night ? 0.35 : 2.2;
    t.hemi.color.set(night ? '#4a5a80' : '#e8f0ff');
    t.hemi.groundColor.set(night ? '#151a14' : '#8a8270');
    t.hemi.intensity = night ? 0.45 : 1.1;
    t.scene.environmentIntensity = night ? 0.12 : 0.55;
    if (bridge.current) bridge.current.setNight(night);
  }, [theme]);

  // ---------------------------------------------------------------- first-person view
  const modelRef = useRef(model);
  modelRef.current = model;
  const [fpv, setFpv] = useState(false);
  /** Moves the eye with the keys held (walking pace 1.4 m/s), within the walkway, and aims it. */
  const walk = (t: NonNullable<typeof three.current>, now: number) => {
    const f = t.fpv!;
    const dt = Math.min(0.1, now - (f.last || now));
    f.last = now;
    const { geo } = modelRef.current;
    const fwd = new THREE.Vector3(Math.cos(f.yaw), Math.sin(f.yaw), 0);
    const side = new THREE.Vector3(-fwd.y, fwd.x, 0);
    const v = new THREE.Vector3();
    const k = f.keys;
    if (k.has('w') || k.has('arrowup')) v.add(fwd);
    if (k.has('s') || k.has('arrowdown')) v.sub(fwd);
    if (k.has('a') || k.has('arrowleft')) v.add(side);
    if (k.has('d') || k.has('arrowright')) v.sub(side);
    if (v.lengthSq() > 0) t.eye.position.addScaledVector(v.normalize(), (k.has('shift') ? 4 : 1.4) * dt);
    clampEye(t, geo);
    const dir = new THREE.Vector3(Math.cos(f.pitch) * Math.cos(f.yaw), Math.cos(f.pitch) * Math.sin(f.yaw), Math.sin(f.pitch));
    t.eye.lookAt(t.eye.position.clone().add(dir));
  };
  const clampEye = (t: NonNullable<typeof three.current>, geo: BridgeModel['geo']) => {
    const yMax = Math.max(0, geo.clearWidth / 2 - 0.3);
    t.eye.position.x = Math.min(geo.L + 6, Math.max(-6, t.eye.position.x));
    t.eye.position.y = Math.min(yMax, Math.max(-yMax, t.eye.position.y));
    t.eye.position.z = geo.deckTop + EYE_HEIGHT;
  };
  useEffect(() => {
    if (!fpv) return;
    const keyOf = (e: KeyboardEvent) => e.key.toLowerCase();
    const MOVE = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'];
    const dn = (e: KeyboardEvent) => {
      const k = keyOf(e);
      if (!MOVE.includes(k) || (e.target as HTMLElement)?.closest('input, select, textarea')) return;
      e.preventDefault();
      three.current?.fpv?.keys.add(k);
    };
    const up = (e: KeyboardEvent) => three.current?.fpv?.keys.delete(keyOf(e));
    const blur = () => three.current?.fpv?.keys.clear();
    window.addEventListener('keydown', dn);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', dn);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [fpv]);

  // ---------------------------------------------------------------- camera views
  const setView = (v: (typeof VIEWS)[number]['key']) => {
    const t = three.current;
    if (!t) return;
    const { geo } = model;
    if (v === 'fpv') {
      // standing on the deck near the left end, on the centreline, looking along the bridge
      t.fpv = { yaw: 0, pitch: -0.05, keys: new Set(), last: 0 };
      t.eye.position.set(Math.min(2, geo.L / 4), 0, geo.deckTop + EYE_HEIGHT);
      t.camera = t.eye;
      t.controls.enabled = false;
      setFpv(true);
      setShowDeck(true);
      return;
    }
    t.fpv = null;
    t.controls.enabled = true;
    setFpv(false);
    const c = new THREE.Vector3(geo.L / 2, 0, geo.H / 2);
    const r = Math.max(geo.L, 8);
    if (v === 'iso') {
      const dist = (r / 2 / Math.tan((t.persp.fov * Math.PI) / 360)) * 1.15;
      t.camera = t.persp;
      t.persp.position.copy(c.clone().add(new THREE.Vector3(-0.5, -1, 0.38).normalize().multiplyScalar(dist * 0.78)));
      t.controls.target.copy(c);
    } else {
      const target = v === 'end' ? new THREE.Vector3(0, 0, geo.H / 2) : c;
      const dir = v === 'elev' ? new THREE.Vector3(0, -1, 0) : v === 'plan' ? new THREE.Vector3(0, -0.0001, 1) : new THREE.Vector3(-1, 0, 0);
      t.orthoHalf = (v === 'end' ? Math.max(geo.s, geo.H) + 3 : geo.L + 4) / 2;
      t.camera = t.ortho;
      t.ortho.zoom = 1;
      t.ortho.position.copy(target.clone().add(dir.multiplyScalar(100)));
      t.controls.target.copy(target);
      const w = mountRef.current!.clientWidth, h = mountRef.current!.clientHeight;
      t.ortho.left = -t.orthoHalf;
      t.ortho.right = t.orthoHalf;
      t.ortho.top = (t.orthoHalf * h) / w;
      t.ortho.bottom = (-t.orthoHalf * h) / w;
    }
    t.controls.object = t.camera;
    t.camera.updateProjectionMatrix();
    t.controls.update();
  };

  // ---------------------------------------------------------------- bridge geometry
  const modelKey = useMemo(() => JSON.stringify(model.input), [model]);
  const firstFit = useRef(true);
  useEffect(() => {
    const t = three.current;
    if (!t) return;
    bridge.current?.dispose();
    if (bridge.current) t.scene.remove(bridge.current.root);
    const b = buildBridge(model);
    bridge.current = b;
    b.setNight(theme === 'dark');
    t.scene.add(b.root);
    if (people.current) {
      t.scene.remove(people.current);
      people.current.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    }
    people.current = buildPeople(model);
    people.current.visible = showPeople;
    t.scene.add(people.current);
    const { geo } = model;
    t.ground.position.set(geo.L / 2, 0, groundLevel(model) - 0.005);
    t.sun.position.set(geo.L / 2 - 12, -18, 30);
    t.sky.setDirection(new THREE.Vector3(-12, -18, 30));
    t.sun.target.position.set(geo.L / 2, 0, 0);
    const sc = t.sun.shadow.camera;
    const half = geo.L / 2 + 12;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 1; sc.far = 120;
    sc.updateProjectionMatrix();
    if (firstFit.current) {
      firstFit.current = false;
      setView('iso');
    }
    return () => undefined;
  }, [modelKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- result display
  useEffect(() => {
    const t = three.current, b = bridge.current;
    if (!t || !b) return;
    // reset overlay
    t.overlay.children.forEach((o) => {
      const l = o as LineSegments2;
      l.geometry?.dispose();
    });
    t.overlay.clear();
    t.lineMats.splice(0).forEach((m) => m.dispose());
    t.animate = null;
    b.furniture.visible = showDeck;
    if (people.current) people.current.visible = showDeck && showPeople;
    b.context.visible = true;

    const res = hasResults ? results! : null;
    const ghost = mode === 'deflection' || mode === 'buckling' || mode === 'vibration' || mode === 'bending';
    b.members.forEach((mesh, id) => {
      const old = mesh.material as THREE.Material;
      if (old !== b.steel) old.dispose();
      let mat: THREE.Material = b.steel;
      if (res && (mode === 'util' || mode === 'axial')) {
        let col: THREE.Color;
        if (mode === 'util') {
          const d = res.design[id];
          col = utilColour(combo < 0 ? d.util : d.byCombo[combo] ?? 0);
        } else {
          const ci = combo < 0 ? 0 : combo;
          const sf = res.forces[ci][id];
          let N = 0;
          for (let s = 0; s < sf.length; s += 6) if (Math.abs(sf[s]) > Math.abs(N)) N = sf[s];
          col = axialColour(N, axialMax(res, ci));
        }
        mat = new THREE.MeshStandardMaterial({ color: col, metalness: 0.1, roughness: 0.6 });
      } else if (ghost) mat = new THREE.MeshStandardMaterial({ color: '#94a3b8', transparent: true, opacity: 0.18, depthWrite: false });
      if (id === selected && !ghost) {
        mat = (mat === b.steel ? b.steel.clone() : mat) as THREE.MeshStandardMaterial;
        (mat as THREE.MeshStandardMaterial).emissive = new THREE.Color('#2563eb');
        (mat as THREE.MeshStandardMaterial).emissiveIntensity = 0.55;
      }
      mesh.material = mat;
      mesh.castShadow = !ghost;
    });
    // end plates and gussets follow the members: ghosted (and without shadows) in the deformed-shape views
    const detailGhost = ghost ? new THREE.MeshStandardMaterial({ color: '#94a3b8', transparent: true, opacity: 0.18, depthWrite: false }) : null;
    b.details.forEach((d) => {
      const old = d.material as THREE.Material;
      if (old !== b.steel) old.dispose();
      d.material = detailGhost ?? b.steel;
      d.castShadow = !ghost;
    });

    if (!res || !ghost) return;
    if (mode === 'bending') {
      // bending moment diagram on each member, drawn in its plane of bending: the major-axis moment offsets
      // along the section depth, the minor-axis moment across it
      const ci = combo < 0 ? 0 : combo;
      const comp = bendAxis === 'major' ? 4 : 5;
      const mmax = momentMax(res, ci, comp);
      const sc = mmax > 0 ? (model.geo.L / 25 / mmax) * scale : 0;
      const segs: number[] = [], cols: number[] = [];
      for (const m of model.members) {
        const sf = res.forces[ci][m.id];
        const ax = new THREE.Vector3(...m.b).sub(new THREE.Vector3(...m.a)).normalize();
        const dz = new THREE.Vector3(...m.depthDir);
        dz.addScaledVector(ax, -dz.dot(ax)).normalize();
        const dir = bendAxis === 'major' ? dz : new THREE.Vector3().crossVectors(dz, ax).normalize();
        const pt = (k: number) => {
          const f = m.stations[k];
          const base = new THREE.Vector3(...m.a).lerp(new THREE.Vector3(...m.b), f);
          return { base, tip: base.clone().addScaledVector(dir, sf[k * 6 + comp] * sc), M: sf[k * 6 + comp] };
        };
        const push = (p: THREE.Vector3, q: THREE.Vector3, mp: number, mq: number) => {
          segs.push(p.x, p.y, p.z, q.x, q.y, q.z);
          for (const v of [mp, mq]) {
            const c = momentColour(Math.abs(v) / (mmax || 1));
            cols.push(c.r, c.g, c.b);
          }
        };
        for (let k = 0; k < m.stations.length; k++) {
          const p = pt(k);
          if (Math.abs(p.M) > mmax * 0.002) push(p.base, p.tip, p.M, p.M);
          if (k > 0) {
            const q = pt(k - 1);
            if (Math.max(Math.abs(q.M), Math.abs(p.M)) > mmax * 0.002) push(q.tip, p.tip, q.M, p.M);
          }
        }
      }
      if (!segs.length) return;
      const geom = new LineSegmentsGeometry();
      geom.setPositions(segs);
      geom.setColors(cols);
      const lm = new LineMaterial({ vertexColors: true, linewidth: 2, worldUnits: false });
      lm.resolution.set(mountRef.current!.clientWidth, mountRef.current!.clientHeight);
      t.lineMats.push(lm);
      t.overlay.add(new LineSegments2(geom, lm));
      return;
    }
    const nodes = model.fe.nodes;
    let shape: Float32Array | null = null;
    let amp = 1;
    if (mode === 'deflection') {
      const ci = combo < 0 ? 0 : combo;
      shape = res.disp[ci];
      let mx = 0;
      for (let i = 0; i < shape.length; i += 6) mx = Math.max(mx, Math.hypot(shape[i], shape[i + 1], shape[i + 2]));
      amp = mx > 0 ? (model.geo.L / 40 / mx) * scale : 1;
    } else if (mode === 'buckling') {
      const bk = res.buckling[Math.min(bCombo, res.buckling.length - 1)];
      shape = bk?.modes[Math.min(bMode, bk.modes.length - 1)] ?? null;
      amp = (model.geo.L / 30) * scale;
    } else {
      shape = res.modal.modes[Math.min(vMode, res.modal.modes.length - 1)] ?? null;
      amp = (model.geo.L / 30) * scale;
    }
    if (!shape) return;
    let mag = 0;
    for (let i = 0; i < shape.length; i += 6) mag = Math.max(mag, Math.hypot(shape[i], shape[i + 1], shape[i + 2]));
    const segs: number[] = [], cols: number[] = [];
    for (const m of model.members)
      for (let k = 0; k < m.nodes.length - 1; k++) {
        const a = m.nodes[k], c = m.nodes[k + 1];
        segs.push(nodes[a].x, nodes[a].y, nodes[a].z, nodes[c].x, nodes[c].y, nodes[c].z);
        for (const nd of [a, c]) {
          const col = magnitudeColour(Math.hypot(shape[nd * 6], shape[nd * 6 + 1], shape[nd * 6 + 2]) / (mag || 1));
          cols.push(col.r, col.g, col.b);
        }
      }
    const base = Float32Array.from(segs);
    const geom = new LineSegmentsGeometry();
    const nodeOf: number[] = [];
    for (const m of model.members) for (let k = 0; k < m.nodes.length - 1; k++) nodeOf.push(m.nodes[k], m.nodes[k + 1]);
    const pos = new Float32Array(base.length);
    const place = (f: number) => {
      for (let i = 0; i < nodeOf.length; i++) {
        const nd = nodeOf[i];
        pos[i * 3] = base[i * 3] + f * shape![nd * 6];
        pos[i * 3 + 1] = base[i * 3 + 1] + f * shape![nd * 6 + 1];
        pos[i * 3 + 2] = base[i * 3 + 2] + f * shape![nd * 6 + 2];
      }
      geom.setPositions(pos);
    };
    place(amp);
    geom.setColors(cols);
    const lm = new LineMaterial({ vertexColors: true, linewidth: 3, worldUnits: false });
    lm.resolution.set(mountRef.current!.clientWidth, mountRef.current!.clientHeight);
    t.lineMats.push(lm);
    const lines = new LineSegments2(geom, lm);
    t.overlay.add(lines);
    if (mode === 'vibration') t.animate = (time) => place(amp * Math.sin(time * 2.4));
  }, [results, hasResults, mode, combo, bendAxis, bCombo, bMode, vMode, scale, showDeck, showPeople, selected, modelKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------- picking
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const pick = (e: React.PointerEvent): number | null => {
    const t = three.current, b = bridge.current;
    if (!t || !b) return null;
    const r = t.renderer.domElement.getBoundingClientRect();
    const p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(p, t.camera);
    const hit = raycaster.intersectObjects([...b.members.values()], false)[0];
    return hit ? (hit.object.userData.memberId as number) : null;
  };
  const down = useRef<{ x: number; y: number } | null>(null);
  const lastPtr = useRef<{ x: number; y: number } | null>(null);
  const onMove = (e: React.PointerEvent) => {
    const t = three.current;
    if (t?.fpv && e.buttons) {
      // drag to look around
      const p = lastPtr.current;
      if (p) {
        t.fpv.yaw += (e.clientX - p.x) * 0.004;
        t.fpv.pitch = Math.max(-1.3, Math.min(1.3, t.fpv.pitch + (e.clientY - p.y) * 0.004));
      }
      lastPtr.current = { x: e.clientX, y: e.clientY };
      return setHover(null);
    }
    lastPtr.current = null;
    if (e.buttons) return setHover(null);
    const id = pick(e);
    const r = mountRef.current!.getBoundingClientRect();
    setHover(id === null ? null : { id, x: e.clientX - r.left, y: e.clientY - r.top });
  };
  const onUp = (e: React.PointerEvent) => {
    const d = down.current;
    down.current = null;
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
    onSelect(pick(e));
  };

  // ---------------------------------------------------------------- capture for the report
  useEffect(() => {
    if (!captureRef) return;
    captureRef.current = () => {
      const t = three.current;
      if (!t) return null;
      t.renderer.render(t.scene, t.camera);
      const c = t.renderer.domElement;
      return { data: c.toDataURL('image/jpeg', 0.9), w: c.width, h: c.height };
    };
  }, [captureRef]);

  const hm = hover ? model.members[hover.id] : null;
  const hoverInfo = hm && hasResults ? hoverDetail(mode, results!, hm.id, model, combo) : null;
  const bk = hasResults ? results!.buckling[Math.min(bCombo, results!.buckling.length - 1)] : null;

  return (
    <div className="relative w-full h-full bg-slate-50 rounded-lg overflow-hidden border border-slate-200">
      <div
        ref={mountRef}
        className="absolute inset-0"
        onPointerDown={(e) => (down.current = { x: e.clientX, y: e.clientY })}
        onPointerUp={onUp}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onWheel={(e) => {
          const t = three.current;
          if (!t?.fpv) return;
          // wheel: a step forward or back
          t.eye.position.addScaledVector(new THREE.Vector3(Math.cos(t.fpv.yaw), Math.sin(t.fpv.yaw), 0), -Math.sign(e.deltaY) * 0.5);
          clampEye(t, model.geo);
        }}
      />

      {/* modes */}
      <div className="absolute top-2 left-2 bg-white border border-slate-200 rounded-lg shadow-2xs p-1 flex flex-col gap-0.5 text-xs">
        {MODES.map((m) => {
          const dis = m.key !== 'model' && !hasResults;
          return (
            <button
              key={m.key}
              type="button"
              disabled={dis}
              title={dis ? 'Solve the model first' : undefined}
              onClick={() => setMode(m.key)}
              className={`flex items-center gap-1.5 px-2 h-7 rounded-md font-medium transition-colors ${
                mode === m.key ? 'bg-blue-50 text-blue-700' : dis ? 'text-slate-400 cursor-not-allowed' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {m.icon}
              <span>{m.label}</span>
            </button>
          );
        })}
        <div className="border-t border-slate-100 my-0.5" />
        <label className="check px-2 h-6">
          <input type="checkbox" className="checkbox" checked={showDeck} onChange={(e) => setShowDeck(e.target.checked)} />
          <span>Deck &amp; Screens</span>
        </label>
        <label className={`check px-2 h-6 ${showDeck ? '' : 'opacity-50'}`} title="Pedestrians and cyclists, for illustration only">
          <input type="checkbox" className="checkbox" checked={showPeople} disabled={!showDeck} onChange={(e) => setShowPeople(e.target.checked)} />
          <span>People</span>
        </label>
      </div>

      {/* views and solve */}
      <div className="absolute top-2 right-2 flex flex-col items-end gap-2">
        <div className="flex gap-2">
          <div className="bg-white border border-slate-200 rounded-lg shadow-2xs p-0.5 flex text-xs">
            {VIEWS.map((v) => (
              <button key={v.key} type="button" onClick={() => setView(v.key)} className="px-2 h-7 rounded-md font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900">
                {v.label}
              </button>
            ))}
          </div>
          {solveState === 'solving' ? (
            <button type="button" onClick={onCancel} className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg border border-rose-300 bg-white text-rose-700 hover:bg-rose-50">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Cancel
            </button>
          ) : solveState === 'solved' ? (
            <button type="button" onClick={onSolve} className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Solved
            </button>
          ) : (
            <button type="button" onClick={onSolve} disabled={solveState === 'blocked'} title={solveState === 'blocked' ? blockedReason : undefined} className="btn-primary disabled:bg-slate-400">
              <Play className="w-3.5 h-3.5" />
              Solve
            </button>
          )}
        </div>
        {solveState === 'solving' && progress && <div className="bg-white border border-slate-200 rounded-lg shadow-2xs px-2 py-1 text-[11px] text-slate-600">{progress}…</div>}

        {/* result selectors */}
        {hasResults && mode !== 'model' && (
          <div className="bg-white border border-slate-200 rounded-lg shadow-2xs p-2 space-y-1.5 w-64 text-[11px]">
            {(mode === 'util' || mode === 'axial' || mode === 'bending' || mode === 'deflection') && (
              <select className="control-sm w-full" value={combo} onChange={(e) => setCombo(+e.target.value)}>
                {mode === 'util' && <option value={-1}>Envelope (All ULS)</option>}
                {results!.combos.map((c, i) =>
                  mode === 'util' && c.type !== 'ULS' ? null : (
                    <option key={i} value={i}>
                      {comboLabel(c)}
                    </option>
                  )
                )}
              </select>
            )}
            {mode === 'bending' && (
              <div className="grid grid-cols-2 gap-1">
                {(['major', 'minor'] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={`rounded px-2 py-1 font-medium border ${bendAxis === a ? 'bg-blue-50 text-blue-700 border-blue-200' : 'text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                    onClick={() => setBendAxis(a)}
                  >
                    {a === 'major' ? 'Major Axis (Mx)' : 'Minor Axis (My)'}
                  </button>
                ))}
              </div>
            )}
            {mode === 'buckling' && (
              <>
                <select className="control-sm w-full" value={bCombo} onChange={(e) => (setBCombo(+e.target.value), setBMode(0))}>
                  {results!.buckling.map((b, i) => (
                    <option key={i} value={i}>
                      {bucklingLabel(results!.combos[b.combo])}
                    </option>
                  ))}
                </select>
                <select className="control-sm w-full" value={bMode} onChange={(e) => setBMode(+e.target.value)}>
                  {bk?.values.map((v, i) => (
                    <option key={i} value={i}>
                      Mode {i + 1}: λ = {v.toFixed(2)}
                    </option>
                  ))}
                </select>
              </>
            )}
            {mode === 'vibration' && (
              <select className="control-sm w-full" value={vMode} onChange={(e) => setVMode(+e.target.value)}>
                {results!.modal.freqs.map((f, i) => (
                  <option key={i} value={i}>
                    Mode {i + 1}: {f.toFixed(2)} Hz ({results!.modal.kinds[i]})
                  </option>
                ))}
              </select>
            )}
            {(mode === 'deflection' || mode === 'buckling' || mode === 'vibration' || mode === 'bending') && (
              <div className="flex items-center gap-2">
                <span className="text-slate-600 font-medium">Scale</span>
                <input type="range" className="range" min={0.2} max={4} step={0.1} value={scale} onChange={(e) => setScale(+e.target.value)} />
              </div>
            )}
            {mode === 'deflection' && <DeflectionNote results={results!} combo={combo < 0 ? 0 : combo} />}
            {mode === 'bending' && (
              <div className="text-slate-600 tabular-nums">
                Max {bendAxis === 'major' ? 'major' : 'minor'}-axis moment {momentMax(results!, combo < 0 ? 0 : combo, bendAxis === 'major' ? 4 : 5).toFixed(1)} kNm; diagram drawn in the plane of bending of each member
              </div>
            )}
          </div>
        )}
      </div>

      {/* legend */}
      {hasResults && (mode === 'util' || mode === 'axial') && (
        <div className="absolute bottom-2 left-2 bg-white border border-slate-200 rounded-lg shadow-2xs px-2 py-1.5 text-[11px] text-slate-700 tabular-nums space-y-0.5">
          {mode === 'util'
            ? UTIL_LEGEND.map((l) => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: l.colour }} />
                  {l.label}
                </div>
              ))
            : [
                { label: 'Tension', colour: '#1d4ed8' },
                { label: 'Compression', colour: '#dc2626' }
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-sm" style={{ background: l.colour }} />
                  {l.label} (max {axialMax(results!, combo < 0 ? 0 : combo).toFixed(0)} kN)
                </div>
              ))}
        </div>
      )}

      {fpv && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-white/90 border border-slate-200 rounded-lg shadow-2xs px-3 py-1.5 text-[11px] text-slate-700">
          Eye level {EYE_HEIGHT.toFixed(1)} m above the deck. Drag to look around; W/S or ↑/↓ to walk, A/D or ←/→ to step sideways (Shift to hurry); wheel to step.
        </div>
      )}

      {/* hover tooltip */}
      {hm && hover && (
        <div className="absolute pointer-events-none bg-white border border-slate-200 rounded-lg shadow-lg px-2 py-1.5 text-[11px] text-slate-700 tabular-nums" style={{ left: Math.min(hover.x + 14, (mountRef.current?.clientWidth ?? 400) - 200), top: hover.y + 14 }}>
          <div className="font-semibold text-slate-800">{hm.name}</div>
          <div>{hm.sp.def.name}</div>
          {(mode === 'model' || !hoverInfo) && <div>Length {hm.length.toFixed(3)} m</div>}
          {hoverInfo}
        </div>
      )}
    </div>
  );
};

/** Hover text for the current view: utilisation, axial force or displacement of the member. */
function hoverDetail(mode: ViewMode, res: AnalysisResults, id: number, model: BridgeModel, combo: number): React.ReactNode {
  const ci = combo < 0 ? 0 : combo;
  if (mode === 'util') {
    const d = res.design[id];
    const u = combo < 0 ? d.util : d.byCombo[combo] ?? 0;
    return (
      <div>
        Utilisation <span className="font-semibold">{pct(u)}</span> ({combo < 0 ? d.governing : 'this combination'})
      </div>
    );
  }
  if (mode === 'axial') {
    const sf = res.forces[ci][id];
    let N = 0;
    for (let s = 0; s < sf.length; s += 6) if (Math.abs(sf[s]) > Math.abs(N)) N = sf[s];
    return (
      <div>
        <i>N</i>* = <span className="font-semibold">{Math.abs(N).toFixed(1)} kN</span> {N >= 0 ? 'tension' : 'compression'}
      </div>
    );
  }
  if (mode === 'bending') {
    const sf = res.forces[ci][id];
    const peak = (c: number) => {
      let v = 0;
      for (let s = c; s < sf.length; s += 6) if (Math.abs(sf[s]) > Math.abs(v)) v = sf[s];
      return Math.abs(v);
    };
    const n = sf.length / 6;
    return (
      <div>
        <div>
          <i>M</i>*<sub>x</sub> max <span className="font-semibold">{peak(4).toFixed(1)} kNm</span> (ends {Math.abs(sf[4]).toFixed(1)}, {Math.abs(sf[(n - 1) * 6 + 4]).toFixed(1)})
        </div>
        <div>
          <i>M</i>*<sub>y</sub> max <span className="font-semibold">{peak(5).toFixed(1)} kNm</span> (ends {Math.abs(sf[5]).toFixed(1)}, {Math.abs(sf[(n - 1) * 6 + 5]).toFixed(1)})
        </div>
      </div>
    );
  }
  if (mode === 'deflection') {
    const u = res.disp[ci];
    let v = 0, l = 0, tot = 0;
    for (const nd of model.members[id].nodes) {
      v = Math.max(v, Math.abs(u[nd * 6 + 2]));
      l = Math.max(l, Math.abs(u[nd * 6 + 1]));
      tot = Math.max(tot, Math.hypot(u[nd * 6], u[nd * 6 + 1], u[nd * 6 + 2]));
    }
    return (
      <div>
        Max displacement <span className="font-semibold">{(tot * 1000).toFixed(1)} mm</span> (vertical {(v * 1000).toFixed(1)}, lateral {(l * 1000).toFixed(1)})
      </div>
    );
  }
  return null;
}

/** Largest moment (component 4: major axis, 5: minor axis) of any member in a combination. */
function momentMax(res: AnalysisResults, ci: number, comp: 4 | 5) {
  let mx = 0;
  for (const sf of res.forces[ci] ?? []) for (let s = comp; s < sf.length; s += 6) mx = Math.max(mx, Math.abs(sf[s]));
  return mx;
}

function axialMax(res: AnalysisResults, ci: number) {
  let mx = 0;
  for (const sf of res.forces[ci] ?? []) for (let s = 0; s < sf.length; s += 6) mx = Math.max(mx, Math.abs(sf[s]));
  return mx;
}

const DeflectionNote: React.FC<{ results: AnalysisResults; combo: number }> = ({ results, combo }) => {
  const u = results.disp[combo];
  let v = 0, l = 0;
  for (let i = 0; i < u.length; i += 6) {
    v = Math.max(v, -u[i + 2]);
    l = Math.max(l, Math.abs(u[i + 1]));
  }
  return (
    <div className="text-slate-600 tabular-nums">
      Max vertical {(v * 1000).toFixed(1)} mm, lateral {(l * 1000).toFixed(1)} mm
    </div>
  );
};
