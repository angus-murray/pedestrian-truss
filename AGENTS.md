# PedTruss — notes for agents

## Scope
One bridge type only: a steel pony truss footbridge (two trusses, cross girders at every bottom chord panel point,
U-frames, optional plan bracing). It is meant to be extended later; keep the model generation in
`src/model/build.ts` the single place that defines the configuration.

## Engineering rules
- Clause numbers cite AS 5100.6:2017 (Sections 5 to 8 follow AS 4100). φ = 0.9.
- Effective lengths: `buckling` uses N_om = λ_c N* from the lowest mode in which the member's destabilising
  (geometric) energy is at least the participation threshold of the largest; l_e/r = π√(E A_g / N_om).
  Do not change the participation measure to elastic strain energy: restraining members (U-frames, cross girders)
  dominate it and the top chords would pick higher modes.
- U-frame method (top chord only): Engesser / BS 5400-3, δ = d1³/(3EI1) + s d2²/(2EI2), l_e = 2.5(E Ic a δ)^0.25 ≥ a.
- Default loads and factors are starting values; the UI and About page say they must be confirmed against
  AS 5100.2.

## Units
Model and analysis in kN and m. Section properties in mm (SectionProps); converted when elements are built.

## UI look and feel
From the shared `engineering-ui` package (its `STYLE.md`). Deliberate deviations:
- Header `actions`: Open / Save / Reset of the inputs as a JSON file (inputs are also kept in localStorage).
- Section size selects have up / down arrows inside the box to step through the standard sizes.
- The Load Combinations editor and the Member Design table use `control-sm` inputs in tables.
The 3D scene background follows `useTheme()`.
