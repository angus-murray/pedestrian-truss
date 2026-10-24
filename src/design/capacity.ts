/**
 * Member capacities to AS 5100.6 (provisions as AS 4100):
 *  - compression member capacity N_c = α_c N_s (Cl. 6.3.3), with the modified slenderness λ_n from an effective
 *    length l_e or directly from an elastic buckling load N_om (l_e = π √(EI / N_om), so l_e / r = π √(E A_g / N_om));
 *  - member moment capacity M_b = α_m α_s M_s ≤ M_s (Cl. 5.6.1.1) with M_o for an equal-flanged or box section.
 */
import { PHI, type SectionProps } from './section';

export const E_STEEL = 200000; // MPa
export const G_STEEL = 80000; // MPa

/** Slenderness reduction factor α_c (Cl. 6.3.3). */
export function alphaC(lambdaN: number, alphaB: number): { alphaC: number; lambda: number } {
  const alphaA = (2100 * (lambdaN - 13.5)) / (lambdaN * lambdaN - 15.3 * lambdaN + 2050);
  const lambda = lambdaN + alphaA * alphaB;
  if (lambda <= 0) return { alphaC: 1, lambda };
  const eta = Math.max(0, 0.00326 * (lambda - 13.5));
  const xi = ((lambda / 90) ** 2 + 1 + eta) / (2 * (lambda / 90) ** 2);
  const a = xi * (1 - Math.sqrt(Math.max(0, 1 - (90 / (xi * lambda)) ** 2)));
  return { alphaC: Math.min(1, a), lambda };
}

export interface CompressionCapacity {
  /** Effective length (m) and slenderness l_e / r for the axis considered. */
  le: number;
  slenderness: number;
  lambdaN: number;
  alphaC: number;
  /** φN_s, φN_c (kN). */
  phiNs: number;
  phiNc: number;
  /** Elastic buckling load N_om (kN). */
  Nom: number;
}

/** Compression capacity for an elastic buckling load N_om (kN) about an axis with radius of gyration r (mm). */
export function compressionFromNom(sp: SectionProps, Nom: number, r: number): CompressionCapacity {
  const Ns = sp.kf * sp.A * sp.fy; // N
  const slenderness = Math.PI * Math.sqrt((E_STEEL * sp.A) / (Nom * 1000)); // l_e / r
  const lambdaN = slenderness * Math.sqrt(sp.kf) * Math.sqrt(sp.fy / 250);
  const { alphaC: ac } = alphaC(lambdaN, sp.alphaB);
  return { le: (slenderness * r) / 1000, slenderness, lambdaN, alphaC: ac, phiNs: (PHI * Ns) / 1000, phiNc: (PHI * ac * Ns) / 1000, Nom };
}

/** Compression capacity for an effective length l_e (m) about an axis with second moment I (mm⁴). */
export function compressionFromLe(sp: SectionProps, le: number, I: number): CompressionCapacity {
  const Nom = (Math.PI ** 2 * E_STEEL * I) / (le * 1000) ** 2 / 1000; // kN
  return compressionFromNom(sp, Nom, Math.sqrt(I / sp.A));
}

/** Moment modification factor α_m from the moments at the quarter points (Cl. 5.6.1.1(a)(iii)). */
export function alphaM(Mm: number, M2: number, M3: number, M4: number): number {
  const den = Math.sqrt(M2 * M2 + M3 * M3 + M4 * M4);
  if (den < 1e-9) return 1;
  return Math.min(2.5, Math.max(1, (1.7 * Math.abs(Mm)) / den));
}

export interface BendingCapacity {
  phiMs: number; // kNm
  phiMb: number; // kNm
  Mo: number; // kNm (Infinity when lateral–torsional buckling does not apply)
  alphaS: number;
  alphaM: number;
  le: number; // m
}

/** Major-axis member moment capacity for a segment of effective length le (m). */
export function majorBending(sp: SectionProps, le: number, am: number): BendingCapacity {
  const Ms = sp.fy * sp.Zex; // Nmm
  const phiMs = (PHI * Ms) / 1e6;
  // no lateral–torsional buckling for circular or square hollow sections, or minor-axis bending
  if (sp.kind === 'CHS' || sp.kind === 'ROD' || (sp.kind === 'RHS' && sp.d <= sp.b)) return { phiMs, phiMb: phiMs, Mo: Infinity, alphaS: 1, alphaM: am, le };
  const L = le * 1000;
  const Mo = Math.sqrt(((Math.PI ** 2 * E_STEEL * sp.Iy) / (L * L)) * (G_STEEL * sp.J + (Math.PI ** 2 * E_STEEL * sp.Iw) / (L * L)));
  const alphaS = Math.min(1, 0.6 * (Math.sqrt((Ms / Mo) ** 2 + 3) - Ms / Mo));
  return { phiMs, phiMb: Math.min(phiMs, am * alphaS * phiMs), Mo: Mo / 1e6, alphaS, alphaM: am, le };
}

/**
 * Design tension capacity φN_t (kN) with k_t = 1 (Cl. 7.2): gross area for the welded members (no holes); for a rod,
 * threaded at its ends, the net area is the tensile stress area of the thread, taken as 0.78 A_g (ISO metric coarse
 * threads, about 0.75 to 0.80 A_g).
 */
export function tensionCapacity(sp: SectionProps): number {
  const An = sp.kind === 'ROD' ? ROD_THREAD_AREA * sp.A : sp.A;
  return (PHI * Math.min(sp.A * sp.fy, 0.85 * An * sp.fu)) / 1000;
}

/** Tensile stress area of a threaded rod as a share of its gross area. */
export const ROD_THREAD_AREA = 0.78;
