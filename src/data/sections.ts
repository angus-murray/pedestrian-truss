/**
 * Australian structural steel sections (from Baseplate2D).
 *  - Hot-rolled UB, UC, PFC: AS/NZS 3679.1.
 *  - Cold-formed SHS, RHS, CHS: AS/NZS 1163 (corner radii 2.5t outside / 1.5t inside).
 *  - Hot-rolled round bar (rods, AS/NZS 3679.1): diameters of the ISO metric coarse thread sizes M12 to M64.
 */
export type SectionCategory = 'UB' | 'UC' | 'PFC' | 'SHS' | 'RHS' | 'CHS' | 'ROD';

export interface SectionDefinition {
  name: string;
  category: SectionCategory;
  depth: number; // mm
  flangeWidth: number; // mm
  flangeThick: number; // mm
  webThick: number; // mm
  outerDiameter?: number; // mm (CHS)
  wallThick?: number; // mm (hollow sections)
  radius?: number; // mm root radius
  massPerMetre: number; // kg/m
}

const hot: SectionDefinition[] = [
  // --- UNIVERSAL BEAMS (UB) & UNIVERSAL COLUMNS (UC) - AS/NZS 3679.1 ---
  { name: '150 UB 14.0', category: 'UB', depth: 150, flangeWidth: 75, flangeThick: 7.0, webThick: 5.0, radius: 8.0, massPerMetre: 14.0 },
  { name: '150 UB 18.0', category: 'UB', depth: 155, flangeWidth: 75, flangeThick: 9.5, webThick: 6.0, radius: 8.0, massPerMetre: 18.0 },
  { name: '180 UB 16.1', category: 'UB', depth: 173, flangeWidth: 90, flangeThick: 7.0, webThick: 4.5, radius: 8.9, massPerMetre: 16.1 },
  { name: '180 UB 18.1', category: 'UB', depth: 175, flangeWidth: 90, flangeThick: 8.0, webThick: 5.0, radius: 8.9, massPerMetre: 18.1 },
  { name: '180 UB 22.2', category: 'UB', depth: 179, flangeWidth: 90, flangeThick: 10.0, webThick: 6.0, radius: 8.9, massPerMetre: 22.2 },
  { name: '200 UB 18.2', category: 'UB', depth: 198, flangeWidth: 99, flangeThick: 7.0, webThick: 4.5, radius: 11.0, massPerMetre: 18.2 },
  { name: '200 UB 22.3', category: 'UB', depth: 202, flangeWidth: 133, flangeThick: 7.0, webThick: 5.0, radius: 8.9, massPerMetre: 22.3 },
  { name: '200 UB 25.4', category: 'UB', depth: 203, flangeWidth: 133, flangeThick: 7.8, webThick: 5.8, radius: 8.9, massPerMetre: 25.4 },
  { name: '200 UB 29.8', category: 'UB', depth: 207, flangeWidth: 134, flangeThick: 9.6, webThick: 6.3, radius: 8.9, massPerMetre: 29.8 },
  { name: '250 UB 25.7', category: 'UB', depth: 248, flangeWidth: 124, flangeThick: 8.0, webThick: 5.0, radius: 12.0, massPerMetre: 25.7 },
  { name: '250 UB 31.4', category: 'UB', depth: 252, flangeWidth: 146, flangeThick: 8.6, webThick: 6.1, radius: 8.9, massPerMetre: 31.4 },
  { name: '250 UB 37.3', category: 'UB', depth: 256, flangeWidth: 146, flangeThick: 10.9, webThick: 6.4, radius: 8.9, massPerMetre: 37.3 },
  { name: '310 UB 32.0', category: 'UB', depth: 298, flangeWidth: 149, flangeThick: 8.0, webThick: 5.5, radius: 13.0, massPerMetre: 32.0 },
  { name: '310 UB 40.4', category: 'UB', depth: 304, flangeWidth: 165, flangeThick: 10.2, webThick: 6.1, radius: 11.4, massPerMetre: 40.4 },
  { name: '310 UB 46.2', category: 'UB', depth: 307, flangeWidth: 166, flangeThick: 11.8, webThick: 6.7, radius: 11.4, massPerMetre: 46.2 },
  { name: '360 UB 44.7', category: 'UB', depth: 352, flangeWidth: 171, flangeThick: 9.7, webThick: 6.9, radius: 11.4, massPerMetre: 44.7 },
  { name: '360 UB 50.7', category: 'UB', depth: 356, flangeWidth: 171, flangeThick: 11.5, webThick: 7.3, radius: 11.4, massPerMetre: 50.7 },
  { name: '360 UB 56.7', category: 'UB', depth: 359, flangeWidth: 172, flangeThick: 13.0, webThick: 8.0, radius: 11.4, massPerMetre: 56.7 },
  { name: '410 UB 53.7', category: 'UB', depth: 403, flangeWidth: 178, flangeThick: 10.9, webThick: 7.6, radius: 11.4, massPerMetre: 53.7 },
  { name: '410 UB 59.7', category: 'UB', depth: 406, flangeWidth: 178, flangeThick: 12.8, webThick: 7.8, radius: 11.4, massPerMetre: 59.7 },
  { name: '460 UB 67.1', category: 'UB', depth: 454, flangeWidth: 190, flangeThick: 12.7, webThick: 8.5, radius: 11.4, massPerMetre: 67.1 },
  { name: '460 UB 74.6', category: 'UB', depth: 457, flangeWidth: 190, flangeThick: 14.5, webThick: 9.1, radius: 11.4, massPerMetre: 74.6 },
  { name: '460 UB 82.1', category: 'UB', depth: 460, flangeWidth: 191, flangeThick: 16.0, webThick: 9.9, radius: 11.4, massPerMetre: 82.1 },
  { name: '530 UB 82.0', category: 'UB', depth: 528, flangeWidth: 209, flangeThick: 13.2, webThick: 9.6, radius: 14.0, massPerMetre: 82.0 },
  { name: '530 UB 92.4', category: 'UB', depth: 533, flangeWidth: 209, flangeThick: 15.6, webThick: 10.2, radius: 14.0, massPerMetre: 92.4 },
  { name: '610 UB 101', category: 'UB', depth: 602, flangeWidth: 228, flangeThick: 14.8, webThick: 10.6, radius: 14.0, massPerMetre: 101 },
  { name: '610 UB 113', category: 'UB', depth: 607, flangeWidth: 228, flangeThick: 17.3, webThick: 11.2, radius: 14.0, massPerMetre: 113 },
  { name: '610 UB 125', category: 'UB', depth: 612, flangeWidth: 229, flangeThick: 19.6, webThick: 11.9, radius: 14.0, massPerMetre: 125 },
  { name: '100 UC 14.8', category: 'UC', depth: 97, flangeWidth: 99, flangeThick: 7.0, webThick: 5.0, radius: 10.0, massPerMetre: 14.8 },
  { name: '150 UC 23.4', category: 'UC', depth: 152, flangeWidth: 152, flangeThick: 6.8, webThick: 6.1, radius: 8.9, massPerMetre: 23.4 },
  { name: '150 UC 30.0', category: 'UC', depth: 158, flangeWidth: 153, flangeThick: 9.4, webThick: 6.6, radius: 8.9, massPerMetre: 30.0 },
  { name: '150 UC 37.2', category: 'UC', depth: 162, flangeWidth: 154, flangeThick: 11.5, webThick: 8.1, radius: 8.9, massPerMetre: 37.2 },
  { name: '200 UC 46.2', category: 'UC', depth: 203, flangeWidth: 203, flangeThick: 11.0, webThick: 7.3, radius: 11.4, massPerMetre: 46.2 },
  { name: '200 UC 52.2', category: 'UC', depth: 206, flangeWidth: 204, flangeThick: 12.5, webThick: 8.0, radius: 11.4, massPerMetre: 52.2 },
  { name: '200 UC 59.5', category: 'UC', depth: 210, flangeWidth: 205, flangeThick: 14.2, webThick: 9.3, radius: 11.4, massPerMetre: 59.5 },
  { name: '250 UC 72.9', category: 'UC', depth: 254, flangeWidth: 254, flangeThick: 14.2, webThick: 8.6, radius: 12.7, massPerMetre: 72.9 },
  { name: '250 UC 89.5', category: 'UC', depth: 260, flangeWidth: 256, flangeThick: 17.3, webThick: 10.5, radius: 12.7, massPerMetre: 89.5 },
  { name: '310 UC 96.8', category: 'UC', depth: 308, flangeWidth: 305, flangeThick: 15.4, webThick: 9.9, radius: 16.5, massPerMetre: 96.8 },
  { name: '310 UC 118', category: 'UC', depth: 315, flangeWidth: 307, flangeThick: 18.7, webThick: 11.9, radius: 16.5, massPerMetre: 118 },
  { name: '310 UC 137', category: 'UC', depth: 321, flangeWidth: 309, flangeThick: 21.7, webThick: 13.8, radius: 16.5, massPerMetre: 137 },
  { name: '310 UC 158', category: 'UC', depth: 327, flangeWidth: 311, flangeThick: 25.0, webThick: 15.7, radius: 16.5, massPerMetre: 158 },
  // --- PARALLEL FLANGE CHANNELS (PFC) - AS/NZS 3679.1 ---
  { name: '75 PFC', category: 'PFC', depth: 75, flangeWidth: 40, flangeThick: 6.1, webThick: 3.8, radius: 8, massPerMetre: 5.92 },
  { name: '100 PFC', category: 'PFC', depth: 100, flangeWidth: 50, flangeThick: 6.7, webThick: 4.2, radius: 8, massPerMetre: 8.33 },
  { name: '125 PFC', category: 'PFC', depth: 125, flangeWidth: 65, flangeThick: 7.5, webThick: 4.7, radius: 8, massPerMetre: 11.9 },
  { name: '150 PFC', category: 'PFC', depth: 150, flangeWidth: 75, flangeThick: 9.5, webThick: 6.0, radius: 10, massPerMetre: 17.7 },
  { name: '180 PFC', category: 'PFC', depth: 180, flangeWidth: 75, flangeThick: 11.0, webThick: 6.0, radius: 12, massPerMetre: 20.9 },
  { name: '200 PFC', category: 'PFC', depth: 200, flangeWidth: 75, flangeThick: 12.0, webThick: 6.0, radius: 12, massPerMetre: 22.9 },
  { name: '230 PFC', category: 'PFC', depth: 230, flangeWidth: 75, flangeThick: 12.0, webThick: 6.5, radius: 12, massPerMetre: 25.1 },
  { name: '250 PFC', category: 'PFC', depth: 250, flangeWidth: 90, flangeThick: 15.0, webThick: 8.0, radius: 12, massPerMetre: 35.5 },
  { name: '300 PFC', category: 'PFC', depth: 300, flangeWidth: 90, flangeThick: 16.0, webThick: 8.0, radius: 14, massPerMetre: 40.1 },
  { name: '380 PFC', category: 'PFC', depth: 380, flangeWidth: 100, flangeThick: 17.5, webThick: 10.0, radius: 14, massPerMetre: 55.2 },
];
// Cold-formed hollow sections: nominal size → wall thicknesses (mm)
const SHS_RANGE: [number, number[]][] = [
  [20, [1.6, 2.0]],
  [25, [1.6, 2.0, 2.5, 3.0]],
  [30, [1.6, 2.0]],
  [35, [1.6, 2.0, 2.5, 3.0]],
  [40, [1.6, 2.0, 2.5, 3.0, 4.0]],
  [50, [1.6, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0]],
  [65, [1.6, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0]],
  [75, [2.0, 2.5, 3.0, 3.5, 4.0, 5.0, 6.0]],
  [89, [2.0, 3.5, 5.0, 6.0]],
  [90, [2.0, 2.5]],
  [100, [2.0, 2.5, 3.0, 4.0, 5.0, 6.0, 9.0, 10.0]],
  [125, [3.0, 4.0, 5.0, 6.0, 9.0, 10.0]],
  [150, [3.0, 4.0, 5.0, 6.0, 9.0, 10.0]],
  [200, [4.0, 5.0, 6.0, 9.0, 10.0, 12.5, 16.0]],
  [250, [5.0, 6.0, 9.0, 10.0, 12.5, 16.0]],
  [300, [8.0, 10.0, 12.5, 16.0]],
  [350, [8.0, 10.0, 12.5, 16.0]],
  [400, [10.0, 12.5, 16.0]]
];
const RHS_RANGE: [number, number, number[]][] = [
  [50, 20, [1.6, 2.0, 2.5, 3.0]],
  [50, 25, [1.6, 2.0, 2.5, 3.0]],
  [65, 35, [2.0, 2.5, 3.0, 4.0]],
  [75, 25, [1.6, 2.0, 2.5]],
  [75, 50, [1.6, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0]],
  [100, 50, [1.6, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0, 6.0]],
  [125, 75, [2.0, 2.5, 3.0, 4.0, 5.0, 6.0, 9.0]],
  [150, 50, [2.0, 2.5, 3.0, 4.0, 5.0, 6.0]],
  [150, 100, [3.0, 4.0, 5.0, 6.0, 9.0, 10.0]],
  [200, 100, [4.0, 5.0, 6.0, 9.0, 10.0]],
  [250, 150, [5.0, 6.0, 9.0, 10.0, 12.5, 16.0]],
  [300, 200, [8.0, 9.0, 10.0, 12.5, 16.0]],
  [350, 250, [8.0, 10.0, 12.5, 16.0]],
  [400, 200, [8.0, 10.0, 12.5, 16.0]],
  [400, 300, [8.0, 10.0, 12.5, 16.0]]
];
const CHS_RANGE: [number, number[]][] = [
  [21.3, [2.0, 2.6, 3.2]],
  [26.9, [2.0, 2.3, 2.6, 3.2]],
  [33.7, [2.0, 2.6, 3.2, 4.0]],
  [42.4, [2.0, 2.6, 3.2, 4.0]],
  [48.3, [2.3, 2.9, 3.2, 4.0, 5.4]],
  [60.3, [2.3, 2.9, 3.6, 4.5, 5.4]],
  [76.1, [2.3, 3.2, 3.6, 4.5, 5.9]],
  [88.9, [2.6, 3.2, 4.0, 5.0, 5.5, 5.9]],
  [101.6, [2.6, 3.2, 4.0, 5.0]],
  [114.3, [3.2, 3.6, 4.5, 4.8, 5.4, 6.0]],
  [139.7, [3.0, 3.5, 5.0, 5.4]],
  [165.1, [3.0, 3.5, 5.0, 5.4]],
  [168.3, [7.1, 11.0]],
  [219.1, [4.8, 5.0, 6.4, 8.2]],
  [273.1, [4.8, 6.4, 9.3]],
  [323.9, [6.4, 9.5, 12.7]],
  [355.6, [6.4, 9.5, 12.7]],
  [406.4, [6.4, 9.5, 12.7]],
  [457.0, [6.4, 9.5, 12.7]],
  [508.0, [6.4, 9.5, 12.7]],
  [610.0, [6.4, 9.5, 12.7]]
];

const t1 = (v: number) => v.toFixed(1);
const kgm = (area: number) => Math.round(area * 7.85e-3 * 100) / 100;
/** Rectangular hollow section area with external / internal corner radii 2.5t / 1.5t. */
const rhsArea = (d: number, b: number, t: number) => 2 * t * (d + b - 2 * t) - (4 - Math.PI) * ((2.5 * t) ** 2 - (1.5 * t) ** 2);

const hollow: SectionDefinition[] = [
  ...SHS_RANGE.flatMap(([b, ts]) =>
    ts.map((t): SectionDefinition => ({
      name: `${b}×${b}×${t1(t)} SHS`, category: 'SHS', depth: b, flangeWidth: b, flangeThick: t, webThick: t, wallThick: t, massPerMetre: kgm(rhsArea(b, b, t))
    }))
  ),
  ...RHS_RANGE.flatMap(([d, b, ts]) =>
    ts.map((t): SectionDefinition => ({
      name: `${d}×${b}×${t1(t)} RHS`, category: 'RHS', depth: d, flangeWidth: b, flangeThick: t, webThick: t, wallThick: t, massPerMetre: kgm(rhsArea(d, b, t))
    }))
  ),
  ...CHS_RANGE.flatMap(([D, ts]) =>
    ts.map((t): SectionDefinition => ({
      name: `${t1(D)}×${t1(t)} CHS`, category: 'CHS', depth: D, flangeWidth: D, flangeThick: t, webThick: t, outerDiameter: D, wallThick: t, massPerMetre: kgm(Math.PI * (D - t) * t)
    }))
  )
];

/** Round bar diameters (mm): the metric coarse thread sizes, so that the rods can be threaded at the ends. */
const ROD_RANGE = [12, 16, 20, 24, 27, 30, 33, 36, 39, 42, 45, 48, 52, 56, 60, 64];
const rods: SectionDefinition[] = ROD_RANGE.map((D) => ({
  name: `${D} mm Rod`, category: 'ROD', depth: D, flangeWidth: D, flangeThick: D / 2, webThick: D / 2, outerDiameter: D, massPerMetre: kgm((Math.PI * D * D) / 4)
}));

/** Sections with any element thinner than 3 mm are not offered. */
export const SECTIONS: SectionDefinition[] = [...hot, ...hollow, ...rods].filter((s) => Math.min(s.flangeThick, s.webThick, s.wallThick ?? Infinity) >= 3);

export const CATEGORIES: SectionCategory[] = ['SHS', 'RHS', 'CHS', 'UB', 'UC'];
/** Section types for each member: rods for the plan bracing only. */
export const categoriesFor = (group: string): SectionCategory[] => (group === 'bracing' ? [...CATEGORIES, 'ROD'] : CATEGORIES);

export const sectionsOf = (c: SectionCategory) => SECTIONS.filter((s) => s.category === c);
export const findSection = (name: string) => SECTIONS.find((s) => s.name === name);
