import React from 'react';
import { CollapsePanel as Panel, Formula } from 'engineering-ui';

const Bullets: React.FC<{ items: React.ReactNode[] }> = ({ items }) => (
  <ul className="list-disc pl-4 space-y-1">
    {items.map((it, i) => (
      <li key={i}>{it}</li>
    ))}
  </ul>
);
const S: React.FC<{ s: string; sub?: string }> = ({ s, sub }) => (
  <>
    <i>{s}</i>
    {sub && <sub>{sub}</sub>}
  </>
);

/** About page: scope, model, loads, analysis, design and assumptions. */
export const AboutPage: React.FC = () => (
  <div className="space-y-3">
    <section className="panel !space-y-1.5 text-xs text-slate-700 leading-relaxed">
      <h2 className="text-[13px] font-bold text-slate-800">PedTruss</h2>
      <p>
        Design and checking of steel pony (half-through) truss footbridges: two parallel trusses with a deck on cross girders at the bottom chord panel points. The
        top chords have no overhead bracing; they are restrained laterally only by the U-frames formed by the verticals and the cross girders. The app builds a 3D
        frame model from the inputs, runs linear static, elastic buckling and natural frequency analyses, and checks every member to AS 5100.6 for the strength
        limit state, and the deflection and frequencies for the serviceability limit state.
      </p>
    </section>

    <Panel title="Geometry and Structural Model">
      <Bullets
        items={[
          <>Axes: <S s="X" /> along the span (0 at the left bearings), <S s="Y" /> across (truss A at −<S s="s" />/2, truss B at +<S s="s" />/2), <S s="Z" /> up from the bottom chord centroid.</>,
          <>Truss spacing (centres): <S s="s" /> = clear width + 2 × handrail width + chord width, where the chord width is the horizontal width of the wider chord.</>,
          <>The number of panels is the even number nearest to span / panel length target, so the trusses are symmetric. All three types have raking end posts with the top chord section, meeting the top chord in a mitred knee. Pratt and Howe trusses have verticals at the panel points 1 to n − 1 and the top chord from panel point 1 to n − 1, with the end posts in the end panels. A Warren truss has no verticals: the top chord nodes are at mid-panel.</>,
          <>Pratt diagonals slope down towards midspan (tension under gravity load); Howe diagonals slope up towards midspan; Warren diagonals alternate between the bottom chord panel points and the mid-panel top chord nodes.</>,
          <>Chords are continuous. Joints are rigid (welded) unless the diagonal or plan bracing ends are set as pinned, in which case bending about both axes is released at the member ends (torsion is not released). Verticals and end posts are always moment connected, as they form the U-frames (with the cross girders); in a Warren truss the U-frames are formed by the diagonals.</>,
          <>Cross girders span between the bottom chord panel points of the two trusses. When the cross girder is raised or dropped relative to the bottom chord, it is connected to the chord node by a rigid link. Plan bracing connects the cross girder ends in the model; it is drawn below the cross girders and stringers, on gusset plates.</>,
          <>Each member is divided into the chosen number of beam elements (Euler–Bernoulli, 6 DOF per node, shear deformation neglected) so that the buckling analysis captures buckling of individual members between nodes. Section properties are computed from the nominal outlines (root radii of hot-rolled sections; corner radii 2.5<S s="t" /> outside and 1.5<S s="t" /> inside of cold-formed hollow sections). <S s="E" /> = 200,000 MPa, <S s="G" /> = 80,000 MPa.</>,
          <>Bearings at the bottom chord ends: both left bearings fixed longitudinally, the truss A bearings guided laterally, all bearings restrained vertically, rotations free.</>,
          <>Stringers (optional) span longitudinally between the cross girders, framed between them with their tops level with the cross girder tops, and the deck bears on both. They are modelled on the cross girder axis. Each stringer span is simply supported: bending is released at both ends and axial force at one end, so the stringers carry the deck and pedestrian loads but take no tension from the truss chords.</>,
          <>The deck is non-structural. Without stringers it spans along the bridge between the cross girders; with stringers it spans across the bridge between the stringers, or the stringers and the bottom chords. It is not composite with the steelwork and provides no diaphragm action (the plan bracing does).</>
        ]}
      />
    </Panel>

    <Panel title="Loads and Combinations">
      <Bullets
        items={[
          <>G1 steel: member self-weight (77 kN/m³) plus the connection allowance.</>,
          <>G1 deck: deck thickness × unit weight over the width between the inside faces of the chords. Without stringers, each cross girder carries the deck over its tributary length (half a panel each side, half at the end girders) as a uniform load along it. With stringers, the deck is carried by the stringers (and the bottom chords if they support it) as line loads: each support takes the width halfway to its neighbouring supports, and the outer ones to the edge of the deck (or of the clear width for the pedestrian load). The FRP grating default of 6.0 kN/m³ suits typical mini-mesh and micro-mesh gratings (about 19 to 25 kg/m² for 30 to 50 mm depths).</>,
          <>G2: screens (weight × screen height), handrails (weight per rail × number of rails) and half the services on each bottom chord.</>,
          <>Q pedestrian load on the clear width over the full span, to the deck supports as for the deck.</>,
          <>W wind: <S s="q" /> = 0.6<S s="V" /><sup>2</sup>/1000 kPa (ULS or SLS speed), lateral, with truss A windward. Each truss takes <S s="q C" /><sub>d</sub> × its projected solid depth (the solid area of its members per metre, plus the screen mesh, solidity × height from the kerb to the top chord, over the area not already solid), half on its top chord and half on its bottom chord; the leeward truss is shielded by the factor <S s="K" /><sub>sh</sub>. The deck edge and kerb, a solid band from the top of the bottom chord to the top of the kerb (over the area not already solid), take <S s="q C" /><sub>d</sub> × its depth, carried by the deck to the two bottom chords, half each. The cross girder depth exposed below the bottom chord is added to the windward bottom chord. <S s="C" /><sub>d</sub> is the coefficient for one truss. Uplift <S s="q C" /><sub>L</sub> on the deck plan area, to the deck supports as for the deck.</>,
          <>B barrier load: horizontal, outwards on both trusses, at the top handrail on the web members that carry the handrail brackets (verticals and end posts, or the diagonals and end posts of a Warren truss).</>,
          <>U-frame restraint forces: in each ULS combination, a lateral force at each top chord node equal to the chosen percentage of the larger compression in the adjacent top chord members (2.5% follows the restraint provisions of AS 5100.6 Cl. 6.6.1), amplified for the flexibility of the U-frames by 1/(1 − 1/<S s="λ" />), with <S s="λ" /> the lowest buckling factor of the combination in which the top chords take part. The force is a design force for each restraint, so the patterns act at every U-frame but alternate along the span where they would otherwise add up to a fictitious side load on the whole bridge. Three patterns are each a design case: both trusses inwards at every U-frame (cross girders in single curvature); both trusses in the same direction (sway, cross girders in double curvature), alternating from one U-frame to the next; and inwards and outwards alternating along the span (multi-wave). Each U-frame restrains both top chords together. They are added to the member actions but not to the buckling analysis.</>,
          <>Default ULS combinations: dead load with the pedestrian load factored by 1.5 (AS 5100.2 Table 8.3, pedestrian and cyclist path loads), and dead load with the barrier load factored by 1.8 (Table 12.5, pedestrian and cyclist path barriers) together with the serviceability pedestrian load, factor 1.0 (Cl. 12.5). The barrier load input is the nominal (unfactored) load.</>,
          <>Load values and load factors are inputs; the defaults are a starting point and shall be confirmed against AS 5100.2 and the project requirements.</>
        ]}
      />
    </Panel>

    <Panel title="Analysis">
      <Bullets
        items={[
          <>Linear static analysis of each load case (Cholesky factorisation of the stiffness matrix in profile storage, nodes in reverse Cuthill–McKee order); combinations by superposition.</>,
          <>Linearised elastic buckling for every ULS combination: (<S s="K" /> + <S s="λ" /><S s="K" /><sub>G</sub>) <S s="φ" /> = 0, with the consistent geometric stiffness of each element from its axial force in that combination. The lowest load factors <S s="λ" /><sub>c</sub> and the mode shapes are found by the Lanczos method with full reorthogonalisation. A factor below 1 means the structure is unstable under the design loads.</>,
          <>Natural frequencies: <S s="K" /> <S s="φ" /> = <S s="ω" /><sup>2</sup> <S s="M" /> <S s="φ" />, lumped mass from G1 and G2 (and optionally part of Q). Modes are classed as vertical, torsional (the two trusses moving in opposite directions), lateral or longitudinal by the largest share of modal kinetic energy.</>
        ]}
      />
    </Panel>

    <Panel title="Effective Lengths">
      <p>Three methods are available for each member group:</p>
      <Bullets
        items={[
          <>
            <b>Buckling analysis</b> (AS 5100.6 Cl. 4.6 elastic buckling analysis). The member elastic buckling load is <S s="N" /><sub>om</sub> = <S s="λ" /><sub>c</sub> <S s="N" />* from the lowest buckling mode of that combination in which the member takes part,
            that is, in which its elastic strain energy is at least the participation threshold times that of the most strained member. If no computed mode qualifies, the highest computed mode is used (conservative). The slenderness follows from the first formula below.
          </>,
          <>
            <b>Factor × length</b>: <S s="l" /><sub>e</sub> = <S s="k" /> <S s="L" /> about each axis, with <S s="L" /> the member length between nodes.
          </>,
          <>
            <b>U-frame</b> (top chord only): the top chord as a strut on elastic supports at the U-frames (Engesser, as BS 5400-3 Cl. 9.6.4.1.3). For a vertical on a cross girder the U-frame flexibility is that of the vertical as a cantilever, the cross girder rotation with both ends loaded together (single curvature, conservative against double curvature, s d<sub>2</sub><sup>2</sup>/(6EI<sub>2</sub>)) and the joint flexibility <S s="f" />. In a Warren truss the U-frame at a top chord node is the two diagonals meeting there, each a cantilever of its inclined length <S s="L" /><sub>d</sub>, on two cross girders. In-plane <S s="l" /><sub>e</sub> = <S s="k" /><sub>x</sub> <S s="L" />. The buckling analysis method needs none of these idealisations: the 3D model includes both directions of top chord buckling, multi-wave modes and the actual U-frame members and joints.
          </>
        ]}
      />
      <Formula>
        <S s="l" /><sub>e</sub>/<S s="r" /> = π √(<S s="E A" /><sub>g</sub> / <S s="N" /><sub>om</sub>)  (buckling analysis, independent of the axis)
      </Formula>
      <Formula>
        <S s="δ" /> = <S s="d" /><sub>1</sub><sup>3</sup> / (3<S s="E I" /><sub>1</sub>) + <S s="s d" /><sub>2</sub><sup>2</sup> / (2<S s="E I" /><sub>2</sub>) + <S s="f d" /><sub>2</sub><sup>2</sup>   (Warren: <S s="L" /><sub>d</sub><sup>3</sup> / (6<S s="E I" /><sub>1</sub>) + <S s="s d" /><sub>2</sub><sup>2</sup> / (4<S s="E I" /><sub>2</sub>) + <S s="f d" /><sub>2</sub><sup>2</sup>/2),   <S s="l" /><sub>e</sub> = 2.5 (<S s="E I" /><sub>c</sub> <S s="a δ" />)<sup>0.25</sup> ≥ <S s="a" />
      </Formula>
      <p>
        <S s="d" /><sub>1</sub>: top chord centroid to the top of the cross girder; <S s="d" /><sub>2</sub>: top chord centroid to the cross girder centroid; <S s="I" /><sub>1</sub>, <S s="I" /><sub>2</sub>: vertical and cross girder second moments of area for U-frame bending; <S s="I" /><sub>c</sub>: top chord about its vertical axis; <S s="a" />: panel length.
      </p>
    </Panel>

    <Panel title="Member Design (AS 5100.6)">
      <p>For every member and ULS combination, using the largest actions along the member:</p>
      <Bullets
        items={[
          <>Section capacity in compression <S s="φN" /><sub>s</sub> = <S s="φ k" /><sub>f</sub> <S s="A" /><sub>n</sub> <S s="f" /><sub>y</sub> (Cl. 6.2), with <S s="k" /><sub>f</sub> from the effective widths of Cl. 6.2.4; member capacity <S s="φN" /><sub>c</sub> = <S s="φ α" /><sub>c</sub> <S s="N" /><sub>s</sub> (Cl. 6.3.3) with <S s="α" /><sub>b</sub> = −0.5 for cold-formed hollow sections, 0 for UB and UC, 0.5 for PFC.</>,
          <>Tension <S s="φN" /><sub>t</sub> = <S s="φ" /> min(<S s="A" /><sub>g</sub> <S s="f" /><sub>y</sub>, 0.85 <S s="k" /><sub>t</sub> <S s="A" /><sub>n</sub> <S s="f" /><sub>u</sub>) with <S s="A" /><sub>n</sub> = <S s="A" /><sub>g</sub> and <S s="k" /><sub>t</sub> = 1 (welded connections without holes) (Cl. 7.2).</>,
          <>Section moment capacity <S s="φM" /><sub>s</sub> = <S s="φ f" /><sub>y</sub> <S s="Z" /><sub>e</sub> about each axis (Cl. 5.2); member moment capacity about the major axis <S s="φM" /><sub>b</sub> = <S s="α" /><sub>m</sub> <S s="α" /><sub>s</sub> <S s="φM" /><sub>s</sub> (Cl. 5.6.1) for I-sections and RHS bent about their major axis, with the segment length <S s="k" /><sub>LTB</sub> <S s="L" /> and <S s="α" /><sub>m</sub> from the quarter-point moments (Cl. 5.6.1.1(a)(iii)).</>,
          <>Shear <S s="φV" /><sub>v</sub> = <S s="φ" /> 0.6 <S s="f" /><sub>y</sub> <S s="A" /><sub>w</sub> (webs of I-sections and hollow sections, reduced for web slenderness), 0.36 <S s="f" /><sub>y</sub> <S s="A" /><sub>e</sub> for CHS (Cl. 5.11).</>,
          <>Combined actions: <S s="N" />*/<S s="φN" /> + <S s="M" />*<sub>x</sub>/<S s="φM" /><sub>sx</sub> + <S s="M" />*<sub>y</sub>/<S s="φM" /><sub>sy</sub> ≤ 1 station by station along the member (section, Cl. 8.3.4), and <S s="N" />*/<S s="φN" /><sub>c</sub> + <S s="δ M" />*<sub>x</sub>/<S s="φM" /><sub>bx</sub> + <S s="δ M" />*<sub>y</sub>/<S s="φM" /><sub>sy</sub> ≤ 1 (member, in lieu of the more refined Cl. 8.4 interactions). Both are conservative.</>,
          <>Moment amplification for compression members: <S s="δ" /> = 1/(1 − <S s="N" />*/<S s="N" /><sub>om</sub>) with <S s="c" /><sub>m</sub> = 1.</>,
          <><S s="φ" /> = 0.9 throughout. Clause numbers are those of AS 5100.6, whose Sections 5 to 8 follow AS 4100.</>
        ]}
      />
    </Panel>

    <Panel title="Serviceability">
      <Bullets
        items={[
          <>Vertical deflection of the trusses and cross girders under the SLS combinations marked for the deflection check (by default, pedestrian load alone) against span / limit. The dead load deflection is reported for the precamber.</>,
          <>Horizontal deflection under wind, in every SLS combination with wind: at midspan, the average of the top and bottom chord lateral displacements of each truss (as the truss twists under wind), the larger of the two trusses, against span / horizontal limit (a separate limit from the vertical one).</>,
          <>Stringers: in the same combinations as the vertical deflection, the deflection of each stringer span relative to the cross girders (from the straight line between its two supports) against panel length / limit.</>,
          <>Vertical vibration (AS 5100.2 Cl. 13.4): when the first vertical frequency <S s="f" /><sub>0</sub> is below 5 Hz, the maximum vertical acceleration under one 700 N pedestrian, <S s="a" /> = 4π<sup>2</sup><S s="f" /><sub>0</sub><sup>2</sup><S s="y" /><S s="Ψ" /> (Cl. 13.4.2), shall not exceed 0.25<S s="f" /><sub>0</sub><sup>0.78</sup> m/s². <S s="f" /><sub>0</sub> is the first vertical mode of the 3D model, <S s="y" /> the static deflection of the bottom chords under 700 N at midspan (shared by the two trusses), and <S s="Ψ" /> the dynamic response factor of Figure 13.4.2 for the span and the logarithmic decrement <S s="δ" /> (Table 13.4.2: 0.03 for steel with asphalt or epoxy surfacing, 0.04 for composite steel and concrete), from quadratic fits to the curves, linear between them, for spans of 10 to 50 m.</>,
          <>Lateral vibration: a first lateral frequency below the minimum (1.5 Hz, Cl. 13.4.1) is reported as needing special consideration of lateral excitation by pedestrians.</>
        ]}
      />
    </Panel>

    <Panel title="Section Optimiser">
      <Bullets
        items={[
          <>The geometry, loads, section types and grades are kept. Each iteration analyses the bridge, then for each member group re-checks every member with each section of the same type, using the member actions of that analysis (the elastic buckling load scaled by the change in the smaller second moment of area), and selects the lightest section with a utilisation of at most 90%; when none reaches it, the section with the lowest utilisation.</>,
          <>Serviceability is estimated from the same analysis: the truss stiffness from the chord areas (<S s="k" /> ∝ <S s="A" /><sub>t</sub><S s="A" /><sub>b</sub>/(<S s="A" /><sub>t</sub> + <S s="A" /><sub>b</sub>)), the deflection ∝ 1/<S s="k" />, <S s="f" /><sub>0</sub> ∝ √(<S s="k" />/<S s="M" />), the acceleration ∝ 1/<S s="M" /> (as <S s="f" /><sub>0</sub><sup>2</sup><S s="y" /> does not depend on the stiffness), the horizontal deflection under wind ∝ 1/<S s="A" /><sub>b</sub> (the bottom chords and plan bracing form the horizontal truss), and the stringer deflection ∝ 1/<S s="I" /><sub>x</sub>. Chord and stringer sizes are chosen to keep these within 95% of their limits.</>,
          <>Up to four iterations; a group that alternates between two sizes is held at the heavier. If the design still fails a strength, deflection or vibration check, up to two further iterations upsize (never downsize) the groups concerned. The model is then solved with the selected sections.</>
        ]}
      />
    </Panel>

    <Panel title="Not Covered">
      <Bullets
        items={[
          'Connections (welds, bolted splices, cross girder end connections, bearing stiffeners), joint eccentricities and the local capacity of hollow section joints (chord face, punching shear).',
          'Fatigue, temperature, creep and shrinkage, earthquake, vehicle and maintenance vehicle loads, vehicle impact on the trusses, and flood loads.',
          'Design of the deck, screens and handrails, and composite action of the deck with the cross girders.',
          'Second-order and imperfection analysis beyond the moment amplification; dynamic response to pedestrian loading (only the frequencies are checked).',
          'Tension-only plan bracing (rods): bracing members are beam elements that carry compression.'
        ]}
      />
    </Panel>

    <Panel title="References">
      <Bullets
        items={[
          'AS 5100.2:2017 Bridge design, Part 2: Design loads.',
          'AS 5100.6:2017 Bridge design, Part 6: Steel and composite construction.',
          'AS 4100:2020 Steel structures.',
          'BS 5400-3:2000 Steel, concrete and composite bridges, Part 3: Code of practice for design of steel bridges (U-frame effective length).',
          'Bathe, K.J. Finite Element Procedures. Prentice Hall, 1996.',
          'Section dimensions: InfraBuild hot-rolled structural sections; Austube Mills structural steel hollow sections.',
          'Software: React, three.js, jsPDF, Tailwind CSS.'
        ]}
      />
    </Panel>
  </div>
);
