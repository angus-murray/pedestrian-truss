# PedTruss

Design and checking of steel pony (half-through) truss footbridges to AS 5100, by Angus Murray.

The bridge is two parallel trusses (Warren, Pratt or Howe) with a deck on cross girders at the bottom chord panel
points, optionally on stringers. The top chords are restrained laterally only by the U-frames formed by the verticals and cross girders.
From the inputs (span, truss type, panel length, depth, clear width, handrail width, sections, deck, screens and
loads) the app builds a 3D frame model and runs, in the browser:

- linear static analysis of the load cases and the ULS / SLS combinations (with U-frame restraint forces);
- linearised elastic buckling of the whole structure for every ULS combination (Lanczos);
- natural frequencies;
- member checks to AS 5100.6 (section and member capacities in compression, tension, bending, shear and combined
  actions), with effective lengths from the buckling analysis, from factors on the member length, or for the top
  chord from the U-frame stiffness;
- deflection and frequency checks;
- a section optimiser that refines each member group towards 90% utilisation in a few analysis iterations.

The 3D view shows the bridge as built (section shapes, mitred member ends, deck, kerbs, handrails, mesh screens,
bearings, abutments) and the results: utilisation, axial force, deflected shape, buckling and vibration modes.
Truss spacing (centres) = clear width + 2 × handrail width + chord width.

## Development

```bash
bun install
bun run dev      # http://localhost:3000
bun run test     # solver and model verification tests
bun run lint     # typecheck
bun run build    # production build in dist/
```

The analysis runs in a Web Worker: `src/fea/` (frame elements, profile Cholesky solver, Lanczos eigensolver),
`src/model/` (model generation, analysis, design checks), `src/design/` (section properties and AS 5100.6
capacities). Assumptions and references are in the About page (`src/components/About.tsx`).
