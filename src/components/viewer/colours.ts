/** Colour scales for the result views. */
import * as THREE from 'three';

const UTIL_STOPS: [number, string][] = [
  [0, '#2563eb'],
  [0.4, '#0d9488'],
  [0.7, '#65a30d'],
  [0.9, '#eab308'],
  [1.0, '#f97316'],
  [1.0001, '#dc2626'],
  [2, '#7f1d1d']
];

function ramp(stops: [number, string][], v: number): THREE.Color {
  if (v <= stops[0][0]) return new THREE.Color(stops[0][1]);
  for (let i = 0; i < stops.length - 1; i++) {
    const [a, ca] = stops[i], [b, cb] = stops[i + 1];
    if (v <= b) return new THREE.Color(ca).lerp(new THREE.Color(cb), (v - a) / (b - a || 1));
  }
  return new THREE.Color(stops[stops.length - 1][1]);
}

export const utilColour = (u: number) => ramp(UTIL_STOPS, u);
export const UTIL_LEGEND = [
  { label: '< 40%', colour: '#2563eb' },
  { label: '40–70%', colour: '#0d9488' },
  { label: '70–90%', colour: '#65a30d' },
  { label: '90–100%', colour: '#eab308' },
  { label: '> 100%', colour: '#dc2626' }
];

/** Axial force: tension blue, compression red, white at zero. */
export function axialColour(n: number, max: number): THREE.Color {
  const t = Math.min(1, Math.abs(n) / (max || 1));
  return new THREE.Color('#e2e8f0').lerp(new THREE.Color(n >= 0 ? '#1d4ed8' : '#dc2626'), Math.sqrt(t));
}

/** Bending moment magnitude (0–1): grey → amber → red. */
export function momentColour(t: number): THREE.Color {
  return ramp([[0, '#94a3b8'], [0.5, '#f59e0b'], [1, '#dc2626']], t);
}

/** Displacement magnitude (0–1): blue → green → yellow → red. */
export function magnitudeColour(t: number): THREE.Color {
  return ramp([[0, '#1d4ed8'], [0.33, '#0d9488'], [0.66, '#eab308'], [1, '#dc2626']], t);
}
