import type { SectionCategory } from '../data/sections';

export type TrussType = 'warren' | 'pratt' | 'howe';
export type BracingType = 'x' | 'single' | 'none';
export type DeckType = 'concrete' | 'precast' | 'frp' | 'timber' | 'steel';
export type GroupKey = 'topChord' | 'bottomChord' | 'endPost' | 'vertical' | 'diagonal' | 'crossGirder' | 'stringer' | 'bracing';
export type LeMethod = 'buckling' | 'factor' | 'uframe';
export type Finish = 'galvanised' | 'grey' | 'green' | 'charcoal';
/** Welded joints at the ends of the web members and cross girders: rigid, or semi-rigid (rotational springs). */
export type JointModel = 'rigid' | 'as5100' | 'flex' | 'ec3';
/** Connection types of AS 5100.6 Cl. 5.6.3 for the joint flexibility f. */
export type AsJoint = 'a' | 'b' | 'c';

/**
 * Joint flexibility f of AS 5100.6 Cl. 5.6.3 (cross-member to vertical of a U-frame), in mrad/kNm
 * (1 × 10⁻¹⁰ rad/Nmm = 0.1 mrad/kNm).
 */
export const AS5100_JOINT_FLEX: Record<AsJoint, { f: number; label: string }> = {
  a: { f: 0.05, label: '(a) Bolted, Unstiffened End Plates or Cleats' },
  b: { f: 0.02, label: '(b) Bolted, Stiffened End Plates' },
  c: { f: 0.01, label: '(c) Welded All Round, or Stiffened Both Sides' }
};

export interface GroupSection {
  category: SectionCategory;
  name: string;
  grade: string;
  /** Section depth rotated 90° from the default direction (see GROUP_INFO). */
  rotate: boolean;
}

export interface GroupDesign {
  method: LeMethod;
  /** Effective length factors for buckling about the major and minor axes (factor method). */
  kMajor: number;
  kMinor: number;
  /** Effective length factor for lateral–torsional buckling. */
  kLtb: number;
}

export interface Combination {
  name: string;
  type: 'ULS' | 'SLS';
  /** Factors on G1 steel, G1 deck, G2, Q, W, B. */
  g1s: number;
  g1d: number;
  g2: number;
  q: number;
  w: number;
  b: number;
  /** SLS only: check the vertical deflection against the limit. */
  deflection: boolean;
}

export interface BridgeInput {
  // geometry
  span: number; // m, centre to centre of bearings
  trussType: TrussType;
  panels: number; // number of panels (even)
  depth: number; // m, centroid of bottom chord to centroid of top chord
  clearWidth: number; // m, between handrails
  handrailWidth: number; // mm, handrail offset: inside face of truss to inside face of handrail
  cgLevel: number; // mm, top of cross girder above (+) or below (−) top of bottom chord
  bracing: BracingType;
  webPinned: boolean;
  bracingPinned: boolean;
  // deck and furniture
  deckType: DeckType;
  deckThickness: number; // mm
  deckDensity: number; // kN/m³
  stringerCount: number; // 0: the deck spans between the bottom chords
  chordsSupportDeck: boolean; // with stringers: the bottom chords also support the deck
  stringerSpacing: number; // m
  screens: boolean;
  screenHeight: number; // m above deck
  screenLoad: number; // kPa
  screenSolidity: number; // 0–1
  handrails: 1 | 2;
  handrailHeight1: number; // m above deck
  handrailHeight2: number; // m above deck
  handrailLoad: number; // kN/m per rail per side
  services: number; // kN/m total
  finish: Finish;
  // sections
  sections: Record<GroupKey, GroupSection>;
  // loads
  connectionAllowance: number; // %
  pedestrian: number; // kPa
  windUls: number; // m/s
  windSls: number; // m/s
  dragCoeff: number; // each truss, on its projected solid area
  leewardShielding: number; // shielding factor K_sh for the leeward truss
  liftCoeff: number;
  barrier: number; // kN/m, nominal: 0.75 (3.0 where crowd loading or panic is possible)
  barrierVertical: number; // kN/m, simultaneous vertical load on the barrier (Cl. 12.5)
  restraintPct: number; // % of top chord force, 0 = off
  uFrameJointFlex: number; // mrad/kNm, joint flexibility f (U-frame method, and the semi-rigid joints with jointModel 'flex')
  jointModel: JointModel;
  jointAsType: AsJoint;
  combos: Combination[];
  // design
  design: Record<GroupKey, GroupDesign>;
  amplify: boolean;
  bucklingModes: number;
  elementsPerMember: number;
  participation: number; // %
  deflLimit: number; // span / x, vertical (pedestrian)
  latDeflLimit: number; // span / x, horizontal under SLS wind
  precamberLimit: number; // span / x, precamber (hog) for the permanent loads
  vibDecrement: number; // logarithmic decrement δ (AS 5100.2 Table 13.4.2)
  freqLatMin: number; // Hz
  modalQ: number; // % of pedestrian load as mass
  optimiseTarget: number; // %, utilisation the section optimiser aims for
  optimiseCompact: boolean; // optimiser ranks sections by mass × outer width (compact) rather than by mass
  minWebRatio: number; // optimiser: web member width at least this × the chord width (0–1)
  maxSlenderness: number; // L/r limit of the truss members (AISC 360-16 D1 User Note: 300); 0 = not checked
}

/** Joint flexibility f (mrad/kNm) in use: from AS 5100.6 Cl. 5.6.3 with those joints, otherwise the input. */
export function jointFlex(input: BridgeInput): number {
  return input.jointModel === 'as5100' ? AS5100_JOINT_FLEX[input.jointAsType].f : input.uFrameJointFlex;
}

export const GROUPS: GroupKey[] = ['topChord', 'bottomChord', 'endPost', 'vertical', 'diagonal', 'crossGirder', 'stringer', 'bracing'];

export const GROUP_INFO: Record<GroupKey, { label: string; short: string; depthDir: string; rotDir: string }> = {
  topChord: { label: 'Top Chord', short: 'TC', depthDir: 'Vertical', rotDir: 'Horizontal' },
  bottomChord: { label: 'Bottom Chord', short: 'BC', depthDir: 'Vertical', rotDir: 'Horizontal' },
  endPost: { label: 'End Posts', short: 'EP', depthDir: 'Transverse', rotDir: 'Longitudinal' },
  vertical: { label: 'Verticals', short: 'V', depthDir: 'Transverse', rotDir: 'In Plane' },
  diagonal: { label: 'Diagonals', short: 'D', depthDir: 'Transverse', rotDir: 'In Plane' },
  crossGirder: { label: 'Cross Girders', short: 'CG', depthDir: 'Vertical', rotDir: 'Horizontal' },
  stringer: { label: 'Stringers', short: 'ST', depthDir: 'Vertical', rotDir: 'Horizontal' },
  bracing: { label: 'Plan Bracing', short: 'PB', depthDir: 'Vertical', rotDir: 'Horizontal' }
};

export const DECK_INFO: Record<DeckType, { label: string; thickness: number; density: number }> = {
  concrete: { label: 'Concrete Slab (In Situ)', thickness: 150, density: 25 },
  precast: { label: 'Precast Concrete Planks', thickness: 125, density: 25 },
  frp: { label: 'FRP Mesh Grating', thickness: 38, density: 6.0 },
  timber: { label: 'Timber Boards', thickness: 75, density: 9 },
  steel: { label: 'Steel Plate', thickness: 10, density: 77 }
};

const sec = (category: GroupSection['category'], name: string, grade: string, rotate = false): GroupSection => ({ category, name, grade, rotate });
const des = (method: LeMethod, kMajor = 1, kMinor = 1, kLtb = 1): GroupDesign => ({ method, kMajor, kMinor, kLtb });

export const DEFAULT_COMBOS: Combination[] = [
  { name: 'Dead', type: 'ULS', g1s: 1.1, g1d: 1.2, g2: 1.4, q: 0, w: 0, b: 0, deflection: false },
  // pedestrian load factor 1.5 (AS 5100.2 Table 8.3)
  { name: 'Dead + Pedestrian', type: 'ULS', g1s: 1.1, g1d: 1.2, g2: 1.4, q: 1.5, w: 0, b: 0, deflection: false },
  // barrier load factor 1.8 (Table 12.5), with the serviceability pedestrian load (Cl. 12.5)
  { name: 'Dead + Pedestrian (SLS) + Barrier', type: 'ULS', g1s: 1.1, g1d: 1.2, g2: 1.4, q: 1.0, w: 0, b: 1.8, deflection: false },
  { name: 'Dead + Wind', type: 'ULS', g1s: 1.1, g1d: 1.2, g2: 1.4, q: 0, w: 1.0, b: 0, deflection: false },
  { name: 'Dead (Min) + Wind', type: 'ULS', g1s: 0.9, g1d: 0.85, g2: 0.7, q: 0, w: 1.0, b: 0, deflection: false },
  { name: 'Dead', type: 'SLS', g1s: 1, g1d: 1, g2: 1, q: 0, w: 0, b: 0, deflection: false },
  { name: 'Pedestrian', type: 'SLS', g1s: 0, g1d: 0, g2: 0, q: 1.0, w: 0, b: 0, deflection: true },
  { name: 'Dead + Pedestrian', type: 'SLS', g1s: 1, g1d: 1, g2: 1, q: 1.0, w: 0, b: 0, deflection: false },
  { name: 'Dead + Wind', type: 'SLS', g1s: 1, g1d: 1, g2: 1, q: 0, w: 1.0, b: 0, deflection: false }
];

/** Default combinations of earlier versions that have since changed: saved rows equal to these are updated. */
export const SUPERSEDED_COMBOS: [Combination, Combination][] = [
  [
    { name: 'Dead + Pedestrian', type: 'ULS', g1s: 1.1, g1d: 1.2, g2: 1.4, q: 1.8, w: 0, b: 0, deflection: false },
    DEFAULT_COMBOS[1]
  ],
  [
    { name: 'Dead + Pedestrian + Barrier', type: 'ULS', g1s: 1.1, g1d: 1.2, g2: 1.4, q: 1.8, w: 0, b: 1.0, deflection: false },
    DEFAULT_COMBOS[2]
  ]
];

export const DEFAULT_INPUT: BridgeInput = {
  span: 30,
  trussType: 'pratt',
  panels: 12,
  depth: 1.9,
  clearWidth: 3.0,
  handrailWidth: 100,
  cgLevel: 0,
  bracing: 'x',
  webPinned: false,
  bracingPinned: true,
  deckType: 'concrete',
  deckThickness: 150,
  deckDensity: 25,
  stringerCount: 0,
  chordsSupportDeck: true,
  stringerSpacing: 0.9,
  screens: true,
  screenHeight: 1.2,
  screenLoad: 0.15,
  screenSolidity: 0.4,
  handrails: 2,
  handrailHeight1: 0.9,
  handrailHeight2: 1.4,
  handrailLoad: 0.1,
  services: 0.5,
  finish: 'galvanised',
  sections: {
    topChord: sec('SHS', '250×250×9.0 SHS', 'Grade C450L0'),
    bottomChord: sec('SHS', '250×250×9.0 SHS', 'Grade C450L0'),
    endPost: sec('SHS', '250×250×9.0 SHS', 'Grade C450L0'),
    vertical: sec('SHS', '200×200×9.0 SHS', 'Grade C450L0'),
    diagonal: sec('SHS', '150×150×6.0 SHS', 'Grade C450L0'),
    crossGirder: sec('SHS', '200×200×9.0 SHS', 'Grade C450L0'),
    stringer: sec('UB', '150 UB 18.0', 'Grade 300'),
    bracing: sec('CHS', '88.9×4.0 CHS', 'Grade C350L0')
  },
  connectionAllowance: 5,
  pedestrian: 5.0,
  windUls: 48,
  windSls: 37,
  dragCoeff: 2.0,
  leewardShielding: 0.5,
  liftCoeff: 0.75,
  barrier: 0.75,
  barrierVertical: 0.75,
  restraintPct: 2.5,
  uFrameJointFlex: 0,
  jointModel: 'as5100',
  jointAsType: 'c',
  combos: DEFAULT_COMBOS,
  design: {
    topChord: des('buckling'),
    bottomChord: des('buckling'),
    endPost: des('buckling'),
    vertical: des('buckling'),
    diagonal: des('buckling'),
    crossGirder: des('factor', 1, 1, 1),
    stringer: des('factor', 1, 1, 1),
    bracing: des('factor')
  },
  amplify: true,
  bucklingModes: 8,
  elementsPerMember: 4,
  participation: 10,
  deflLimit: 600,
  latDeflLimit: 600,
  precamberLimit: 300,
  vibDecrement: 0.03,
  freqLatMin: 1.5,
  modalQ: 0,
  optimiseTarget: 90,
  optimiseCompact: true,
  minWebRatio: 0.6,
  maxSlenderness: 300
};
