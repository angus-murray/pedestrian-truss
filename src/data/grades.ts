/**
 * Steel grades and yield stresses (AS 5100.6 Table 2.1, as AS 4100 Table 2.1).
 *  - Hot-rolled sections (AS/NZS 3679.1): f_y depends on the element thickness.
 *  - Cold-formed hollow sections (AS/NZS 1163, C250L0 / C350L0 / C450L0): f_y independent of thickness.
 */
import type { SectionCategory } from './sections';

export interface SteelGrade {
  name: string;
  standard: string;
  fu: number; // MPa
  fy: (t: number) => number; // MPa for an element of thickness t (mm)
}

const steps = (table: [number, number][], last: number) => (t: number) => {
  for (const [tMax, fy] of table) if (t <= tMax) return fy;
  return last;
};

export const HOT_ROLLED_GRADES: SteelGrade[] = [
  { name: 'Grade 300', standard: 'AS/NZS 3679.1', fu: 440, fy: steps([[11, 320], [17, 300]], 280) },
  { name: 'Grade 350', standard: 'AS/NZS 3679.1', fu: 480, fy: steps([[11, 360], [40, 340]], 330) }
];

const C = (g: number, fu: number): SteelGrade => ({ name: `Grade C${g}L0`, standard: 'AS/NZS 1163', fu, fy: () => g });
export const RHS_GRADES: SteelGrade[] = [C(250, 320), C(350, 430), C(450, 500)];
export const CHS_GRADES: SteelGrade[] = [C(250, 320), C(350, 430)];

export function gradesFor(category: SectionCategory): SteelGrade[] {
  if (category === 'SHS' || category === 'RHS') return RHS_GRADES;
  if (category === 'CHS') return CHS_GRADES;
  return HOT_ROLLED_GRADES;
}

export function defaultGrade(category: SectionCategory): string {
  return category === 'SHS' || category === 'RHS' || category === 'CHS' ? 'Grade C350L0' : 'Grade 300';
}

export function findGrade(category: SectionCategory, name: string): SteelGrade {
  const gs = gradesFor(category);
  return gs.find((g) => g.name === name) ?? gs.find((g) => g.name === defaultGrade(category))!;
}
