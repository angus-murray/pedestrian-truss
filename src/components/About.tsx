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
        limit state, and the deflections, frequencies and vertical acceleration for the serviceability limit state. A result of "Implemented Checks Satisfied" covers only the checks listed here: connections, fatigue and the other matters under Not Covered must be designed separately.
      </p>
    </section>

    <Panel title="Geometry and Structural Model">
      <Bullets
        items={[
          <>Axes: <S s="X" /> along the span (0 at the left bearings), <S s="Y" /> across (truss A at −<S s="s" />/2, truss B at +<S s="s" />/2), <S s="Z" /> up from the bottom chord centroid.</>,
          <>Truss spacing (centres): <S s="s" /> = clear width + 2 × handrail offset + truss width. The truss width is the width across the bridge of the widest truss member (chords, end posts, verticals or diagonals), and the handrail offset is measured from the inside face of that member to the inside face of the handrail.</>,
          <>The number of panels is an even number (an input), so the trusses are symmetric. All three types have raking end posts with the top chord section, meeting the top chord in a mitred knee. Pratt and Howe trusses have verticals at the panel points 1 to n − 1 and the top chord from panel point 1 to n − 1, with the end posts in the end panels. A Warren truss has no verticals: the top chord nodes are at mid-panel.</>,
          <>Pratt diagonals slope down towards midspan (tension under gravity load); Howe diagonals slope up towards midspan; Warren diagonals alternate between the bottom chord panel points and the mid-panel top chord nodes.</>,
          <>Chords are continuous. All truss members (end posts, verticals and diagonals) and the cross girders are moment connected, with the joints rigid or semi-rigid as chosen under Web and Cross Girder Joints; the verticals (or, in a Warren truss, the diagonals) form the U-frames with the cross girders. The plan bracing is always pinned: bending about both axes is released at its ends (torsion is not released), so it acts as a bracing truss.</>,
          <>
            Web and cross girder joints. A smaller member welded to the face of a larger hollow section rotates partly by the out-of-plane bending of that face, so the welded joint is semi-rigid. Four models are available for both ends of every vertical, diagonal and cross girder (the end posts are continuous with the top chord):
            <b> Rigid</b>; <b>Semi-rigid to AS 5100.6 Cl. 5.6.3</b> (the default), a rotational spring <S s="k" /> = 1/<S s="f" /> about both axes of the member, between the node and the member end, with the joint flexibility <S s="f" /> that AS 5100.6 Cl. 5.6.3 gives for the joint between the cross-member and the verticals of a U-frame: 0.5 × 10<sup>−10</sup> rad/Nmm (0.05 mrad/kNm) for (a) bolted or riveted through unstiffened end plates or cleats, 0.2 × 10<sup>−10</sup> rad/Nmm (0.02 mrad/kNm) for (b) through stiffened end plates, and 0.1 × 10<sup>−10</sup> rad/Nmm (0.01 mrad/kNm, <S s="k" /> = 100,000 kNm/rad) for (c) welded right around the cross-section or bolted between stiffened end plates and a stiffened part of the vertical. The clause is for the U-frame joint; the same value is applied to the web member to chord joints, as a welded joint of the same kind. It is also the <S s="f" /> of the U-frame effective length method; <b>Semi-rigid, joint flexibility f</b>, the same spring with <S s="f" /> entered by the user; and
            <b> Semi-rigid, EN 1993-1-8 rigid limit</b>, a spring of <S s="S" /><sub>j</sub> = 8<S s="E I" /><sub>b</sub>/<S s="L" /><sub>b</sub> about each axis of the member (its second moment of area and length between nodes), the least stiffness at which EN 1993-1-8 Cl. 5.2.2.5(2) still classifies a joint in a braced frame as rigid. This shows how much the results depend on joints that are rigid only by classification; it is not a calculated stiffness of a particular joint. A spring is condensed into the element stiffness (as a release is, with zero stiffness), and the member end moments are those carried by the springs.
          </>,
          <>Cross girders span between the bottom chord panel points of the two trusses. Their level is set by the top of the cross girder relative to the top of the bottom chord, and their underside may not be below the underside of the bottom chord. Within the depth of the bottom chord, an offset cross girder is connected to the chord node by a rigid link (excluded from the geometric stiffness). Raised so that its top is above the top of the bottom chord, which is possible only in a Pratt or Howe truss and with cross girders no wider (along the bridge) than the verticals, the cross girder connects to the verticals directly at its own level; the U-frame height is then measured from that connection. The end cross girders, at the raking end posts, stay on rigid links to the bottom chord end nodes. Plan bracing connects the cross girder ends in the model; it is drawn below the cross girders and stringers, on gusset plates.</>,
          <>Each member is divided into the chosen number of beam elements (Euler–Bernoulli, 6 DOF per node, shear deformation neglected) so that the buckling analysis captures buckling of individual members between nodes. Section properties are computed from the nominal outlines (root radii of hot-rolled sections; corner radii 2.5<S s="t" /> outside and 1.5<S s="t" /> inside of cold-formed hollow sections). <S s="E" /> = 200,000 MPa, <S s="G" /> = 80,000 MPa.</>,
          <>Bearings at the bottom chord ends: both left bearings fixed longitudinally, the truss A bearings guided laterally, all bearings restrained vertically, rotations free.</>,
          <>Stringers (optional) span longitudinally between the cross girders, framed between them with their tops level with the cross girder tops, and the deck bears on both. They are modelled on the cross girder axis. Each stringer span is simply supported: bending is released at both ends, and the axial degree of freedom is released at one end (a sliding end), so the stringers carry no axial force at all. They carry the deck and pedestrian loads in bending only and take no tension from the truss chords or force from the plan bracing (their nodes are not connected to the bracing, which crosses below them).</>,
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
          <>B barrier load: horizontal, outwards on both trusses, at the top handrail on the web members that carry the handrail brackets (verticals and end posts, or the diagonals and end posts of a Warren truss), with the simultaneous vertical load downwards on the handrail line (Cl. 12.5), which is inside the truss centreline and so also applies a moment about the span. Where the top handrail is above the top chord, the loads act at the top chord node with the moment of their height above it.</>,
          <>U-frame restraint forces: in each ULS combination, a lateral force at each top chord node equal to the chosen percentage of the larger compression in the adjacent top chord members (2.5% follows the restraint provisions of AS 5100.6 Cl. 6.6.1), amplified for the flexibility of the U-frames by 1/(1 − 1/<S s="λ" />), with <S s="λ" /> the lowest buckling factor of the combination in which the top chords take part. The force is a design force for each restraint, so the patterns act at every U-frame but alternate along the span where they would otherwise add up to a fictitious side load on the whole bridge. Three patterns are each a design case: both trusses inwards at every U-frame (cross girders in single curvature); both trusses in the same direction (sway, cross girders in double curvature), alternating from one U-frame to the next; and inwards and outwards alternating along the span (multi-wave). Each U-frame restrains both top chords together. They are added to the member actions but not to the buckling analysis.</>,
          <>Default ULS combinations: dead load with the pedestrian load factored by 1.5 (AS 5100.2 Table 8.3, pedestrian and cyclist path loads), and dead load with the barrier load factored by 1.8 (Table 12.5, pedestrian and cyclist path barriers) together with the serviceability pedestrian load, factor 1.0 (Cl. 12.5). The barrier load input is the nominal (unfactored) load: 0.75 kN/m by default, or 3.0 kN/m where crowd loading or panic is possible.</>,
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
            <b>Buckling analysis</b> (AS 5100.6 Cl. 4.6 elastic buckling analysis). For each axis, the member elastic buckling load is <S s="N" /><sub>om</sub> = <S s="λ" /><sub>c</sub> <S s="N" />* from the lowest buckling mode of that combination in which the member buckles about that axis,
            that is, in which its destabilising energy from bending about that axis is at least the participation threshold times the total of the member with the most, and in which it buckles rather than restrains: its own bending strain energy about that axis is less than λ<sub>c</sub> times its destabilising energy (with a 5% margin). A lightly loaded vertical that bends with the top chord in a U-frame mode restrains that mode and does not take its buckling load from it. The major-axis value amplifies the major-axis moments and the minor-axis value the minor-axis moments; the lower compression capacity governs.
            If no computed mode qualifies for an axis, <S s="N" /><sub>om</sub> is the member's pin-ended Euler load for its length between nodes (<S s="k" /> = 1), or <S s="λ" /><sub>c</sub> <S s="N" />* for the highest mode computed where that is higher (the member's own buckling factor exceeds it).
            A sway of the member's end nodes (the U-frame action of the top chord nodes) appears in the computed modes, where the member takes part if it buckles with them.
            The slenderness follows from the first formula below.
          </>,
          <>
            <b>Factor × length</b>: <S s="l" /><sub>e</sub> = <S s="k" /> <S s="L" /> about each axis, with <S s="L" /> the member length between nodes.
          </>,
          <>
            <b>U-frame</b> (top chord only): the top chord as a strut on elastic supports at the U-frames (Engesser, as BS 5400-3 Cl. 9.6.4.1.3). For a vertical on a cross girder the U-frame flexibility is that of the vertical as a cantilever, the cross girder rotation with both ends loaded together (inward forces at both top chords: the cross girder in single curvature under a uniform moment, end rotation <S s="M s" />/(2<S s="E I" /><sub>2</sub>), giving <S s="s d" /><sub>2</sub><sup>2</sup>/(2<S s="E I" /><sub>2</sub>); this is conservative against forces in the same direction, double curvature, <S s="s d" /><sub>2</sub><sup>2</sup>/(6<S s="E I" /><sub>2</sub>)) and the joint flexibility <S s="f" /> (<S s="f d" /><sub>2</sub><sup>2</sup>). In a Warren truss the U-frame at a top chord node is the two diagonals meeting there, each a cantilever of its inclined length <S s="L" /><sub>d</sub>, on two cross girders, so each diagonal takes half the force and each cross girder and joint carries half the moment (the 6, 4 and 2 below). As for all members, the lengths are taken between the nodes: <S s="d" /><sub>1</sub> = <S s="d" /><sub>2</sub> = <S s="H" /> (bottom chord node to top chord node) and <S s="L" /><sub>d</sub> = √(<S s="H" /><sup>2</sup> + (<S s="a" />/2)<sup>2</sup>). In-plane <S s="l" /><sub>e</sub> = <S s="k" /><sub>x</sub> <S s="L" />. The buckling analysis method needs none of these idealisations: the 3D model includes both directions of top chord buckling, multi-wave modes and the actual U-frame members and joints.
          </>
        ]}
      />
      <Formula>
        <S s="l" /><sub>e</sub>/<S s="r" /> = π √(<S s="E A" /><sub>g</sub> / <S s="N" /><sub>om</sub>)  (buckling analysis, each axis)
      </Formula>
      <Formula>
        <S s="δ" /> = <S s="d" /><sub>1</sub><sup>3</sup> / (3<S s="E I" /><sub>1</sub>) + <S s="s d" /><sub>2</sub><sup>2</sup> / (2<S s="E I" /><sub>2</sub>) + <S s="f d" /><sub>2</sub><sup>2</sup>   (Warren: <S s="L" /><sub>d</sub><sup>3</sup> / (6<S s="E I" /><sub>1</sub>) + <S s="s d" /><sub>2</sub><sup>2</sup> / (4<S s="E I" /><sub>2</sub>) + <S s="f d" /><sub>2</sub><sup>2</sup>/2),   <S s="l" /><sub>e</sub> = 2.5 (<S s="E I" /><sub>c</sub> <S s="a δ" />)<sup>0.25</sup> ≥ <S s="a" />
      </Formula>
      <p>
        <S s="d" /><sub>1</sub> = <S s="d" /><sub>2</sub> = <S s="H" />: height of the U-frame between the nodes (bottom chord node to top chord node; the cross girder frames into the bottom chord node); <S s="L" /><sub>d</sub> = √(<S s="H" /><sup>2</sup> + (<S s="a" />/2)<sup>2</sup>); <S s="s" />: truss spacing; <S s="I" /><sub>1</sub>, <S s="I" /><sub>2</sub>: vertical and cross girder second moments of area for U-frame bending; <S s="I" /><sub>c</sub>: top chord about its vertical axis; <S s="a" />: panel length.
      </p>
    </Panel>

    <Panel title="Member Design (AS 5100.6)">
      <p>For every member and ULS combination, using the largest actions along the member:</p>
      <Bullets
        items={[
          <>Section capacity in compression <S s="φN" /><sub>s</sub> = <S s="φ k" /><sub>f</sub> <S s="A" /><sub>n</sub> <S s="f" /><sub>y</sub> (Cl. 6.2), with <S s="k" /><sub>f</sub> from the effective widths of Cl. 6.2.4; member capacity <S s="φN" /><sub>c</sub> = <S s="φ α" /><sub>c</sub> <S s="N" /><sub>s</sub> (Cl. 6.3.3) with <S s="α" /><sub>b</sub> = −0.5 for cold-formed hollow sections and 0 for UB and UC.</>,
          <>Slenderness of the truss members (chords, end posts, verticals and diagonals): <S s="L" />/<S s="r" /> ≤ 300 by default (adjustable), with <S s="L" /> the length between nodes and <S s="r" /> the least radius of gyration, whether the member is in tension or compression. AS 5100.6 sets no such limit for tension members; the value follows ANSI/AISC 360-16 Section D1 (User Note: for members designed on the basis of tension, the slenderness ratio <S s="L" />/<S s="r" /> preferably should not exceed 300), which keeps light tension diagonals from being slack, damaged in handling or set vibrating. The optimiser respects it.</>,
          <>Tension <S s="φN" /><sub>t</sub> = <S s="φ" /> min(<S s="A" /><sub>g</sub> <S s="f" /><sub>y</sub>, 0.85 <S s="k" /><sub>t</sub> <S s="A" /><sub>n</sub> <S s="f" /><sub>u</sub>) with <S s="A" /><sub>n</sub> = <S s="A" /><sub>g</sub> and <S s="k" /><sub>t</sub> = 1 (welded connections without holes) (Cl. 7.2).</>,
          <>Section moment capacity <S s="φM" /><sub>s</sub> = <S s="φ f" /><sub>y</sub> <S s="Z" /><sub>e</sub> about each axis (Cl. 5.2); member moment capacity about the major axis <S s="φM" /><sub>b</sub> = <S s="α" /><sub>m</sub> <S s="α" /><sub>s</sub> <S s="φM" /><sub>s</sub> (Cl. 5.6.1) for I-sections and RHS bent about their major axis, with the segment length <S s="k" /><sub>LTB</sub> <S s="L" /> and <S s="α" /><sub>m</sub> from the quarter-point moments (Cl. 5.6.1.1(a)(iii)).</>,
          <>Shear <S s="φV" /><sub>v</sub> = <S s="φ" /> 0.6 <S s="f" /><sub>y</sub> <S s="A" /><sub>w</sub> (webs of I-sections and hollow sections, reduced for web slenderness), 0.36 <S s="f" /><sub>y</sub> <S s="A" /><sub>e</sub> for CHS (Cl. 5.11).</>,
          <>Combined actions: <S s="N" />*/<S s="φN" /> + <S s="M" />*<sub>x</sub>/<S s="φM" /><sub>sx</sub> + <S s="M" />*<sub>y</sub>/<S s="φM" /><sub>sy</sub> ≤ 1 station by station along the member (section, Cl. 8.3.4), and <S s="N" />*/<S s="φN" /><sub>c</sub> + <S s="δ M" />*<sub>x</sub>/<S s="φM" /><sub>bx</sub> + <S s="δ M" />*<sub>y</sub>/<S s="φM" /><sub>sy</sub> ≤ 1 (member, compression, in lieu of the more refined Cl. 8.4 interactions), with the largest axial force along the member and, for each axis, <S s="δ M" />* the larger of the largest moment along the member and <S s="δ" /> times the moment at mid-length, <S s="δ" /> = 1 / (1 − <S s="N" />*/<S s="N" /><sub>om</sub>) (<S s="c" /><sub>m</sub> = 1). The end moments from joint continuity are not amplified. In tension, <S s="N" />*/<S s="φN" /><sub>t</sub> + <S s="M" />*<sub>x</sub>/<S s="φM" /><sub>bx</sub> + <S s="M" />*<sub>y</sub>/<S s="φM" /><sub>sy</sub> ≤ 1, without amplification and without the increase of the out-of-plane capacity by tension. All are conservative.</>,
          <>Moment amplification for compression members: <S s="δ" /> = 1/(1 − <S s="N" />*/<S s="N" /><sub>om</sub>) with <S s="c" /><sub>m</sub> = 1.</>,
          <><S s="φ" /> = 0.9 throughout. Clause numbers are those of AS 5100.6, whose Sections 5 to 8 follow AS 4100.</>
        ]}
      />
    </Panel>

    <Panel title="Serviceability">
      <Bullets
        items={[
          <>Vertical deflection of the trusses and cross girders under the SLS combinations marked for the deflection check (by default, pedestrian load alone) against span / limit. Precamber: the deflection of the bottom chord panel points under the permanent loads (G1 + G2, unfactored, the two trusses averaged) is the hog to build in, so that no sag remains under the permanent loads, and its maximum is checked against span / precamber limit (default 300) (AS 5100.2 Cl. 8.4).</>,
          <>Horizontal deflection under wind, in every SLS combination with wind: at midspan, the average of the top and bottom chord lateral displacements of each truss (as the truss twists under wind), the larger of the two trusses, against span / horizontal limit (a separate limit from the vertical one).</>,
          <>Stringers: in the same combinations as the vertical deflection, the deflection of each stringer span relative to the cross girders (from the straight line between its two supports) against panel length / limit.</>,
          <>Vertical vibration (AS 5100.2 Cl. 13.4): when the first vertical frequency <S s="f" /><sub>0</sub> is below 5 Hz, the maximum vertical acceleration under one 700 N pedestrian, <S s="a" /> = 4π<sup>2</sup><S s="f" /><sub>0</sub><sup>2</sup><S s="y" /><S s="Ψ" /> (Cl. 13.4.2), shall not exceed 0.25<S s="f" /><sub>0</sub><sup>0.78</sup> m/s². <S s="f" /><sub>0</sub> is the first vertical mode of the 3D model with the permanent mass alone (any pedestrian mass for the natural frequencies is left out: the check is for one pedestrian on the bridge, and <S s="a" /> is inversely proportional to the mass), <S s="y" /> the static deflection of the bottom chords under 700 N at midspan (shared by the two trusses), and <S s="Ψ" /> the dynamic response factor of Figure 13.4.2 for the span and the logarithmic decrement <S s="δ" /> (Table 13.4.2: 0.03 for steel with asphalt or epoxy surfacing, 0.04 for composite steel and concrete), from quadratic fits to the curves, linear between them. Spans are limited to 50 m, the end of the figure; below 10 m the fits are extrapolated, with a warning.</>,
          <>Lateral vibration: a first lateral frequency below the minimum (1.5 Hz, Cl. 13.4.1) is reported as needing special consideration of lateral excitation by pedestrians.</>
        ]}
      />
    </Panel>

    <Panel title="Section Optimiser">
      <Bullets
        items={[
          <>The geometry, loads, section types and grades are kept. Each iteration analyses the bridge, then for each member group re-checks every member with each section of the same type, using the member actions of that analysis (the elastic buckling load about each axis scaled by the change in the second moment of area about it, or by its square root where the member buckles over several panels on elastic restraints, as a top chord on its U-frames), and selects the first section in the ranking below (by default the most compact for its mass) with a utilisation of at most the target (an input, default 90%); when none reaches it, the section with the lowest utilisation.</>,
          <>Serviceability is estimated from the same analysis: the truss stiffness from the chord areas (<S s="k" /> ∝ <S s="A" /><sub>t</sub><S s="A" /><sub>b</sub>/(<S s="A" /><sub>t</sub> + <S s="A" /><sub>b</sub>)), the deflection ∝ 1/<S s="k" />, <S s="f" /><sub>0</sub> ∝ √(<S s="k" />/<S s="M" />), the acceleration ∝ 1/<S s="M" /> (as <S s="f" /><sub>0</sub><sup>2</sup><S s="y" /> does not depend on the stiffness), the horizontal deflection under wind ∝ 1/<S s="A" /><sub>b</sub> (the bottom chords and plan bracing form the horizontal truss), and the stringer deflection ∝ 1/<S s="I" /><sub>x</sub>. Chord and stringer sizes are chosen to keep these within 95% of their limits.</>,
          <>Proportions: the verticals and diagonals are kept between set fractions of the chord width across the bridge: at least 0.5 of the wider chord and at most 0.9 of the narrower chord by default; where the web members need a width the chords do not have, the chords are widened. With the Compact Sections preference (the default), the sections are ranked by mass × √(outer size) instead of by mass, which favours a more compact, thicker section over a wide thin one of similar mass. The top chord is kept at least as large as the bottom chord (wider, or as wide and at least as heavy) unless no bottom chord section that small meets the target. Where vibration or deflection governs, many combinations of chord and web sizes satisfy the checks; this ranking selects smaller, proportionate members at a small cost in mass, or sometimes none.</>,
          <>The Optimise button also works while warnings stop the analysis: warnings that depend on the sections (web members wider than the chords, cross girders deeper than the bottom chords or wider than the verticals, stringers off the cross girders) are first cleared by changing the sections concerned to the nearest sizes that clear them. Warnings that do not depend on the sections (for example the diagonal angles) must be resolved first.</>,
          <>Up to four iterations; a group that alternates between two sizes is held at the heavier. If the design still fails a strength, deflection or vibration check, up to two further iterations upsize (never downsize) the groups concerned.</>,
          <>Refinement: the groups sized by a serviceability estimate, or held after alternating, then try the next lighter sections of their type in turn (up to two each), each checked by a full analysis, and keep a lighter section while every check is met and no group exceeds the target (or its utilisation before the step, if higher). The check that set the size of each group is reported. The model is then solved with the selected sections.</>
        ]}
      />
    </Panel>

    <Panel title="Not Covered">
      <Bullets
        items={[
          'Connections (welds, bolted splices, cross girder end connections, bearing stiffeners), joint eccentricities and the local capacity of hollow section joints (chord face, punching shear).',
          'Fatigue, temperature, creep and shrinkage, earthquake, vehicle and maintenance vehicle loads, vehicle impact on the trusses, and flood loads.',
          'Design of the deck, screens and handrails, and composite action of the deck with the cross girders.',
          'Second-order and imperfection analysis beyond the moment amplification; dynamic response to pedestrian loading beyond the checks of AS 5100.2 Cl. 13.4 made here (the vertical acceleration under one pedestrian when the first vertical frequency is below 5 Hz, and the lateral frequency limit): crowd loading, lateral lock-in and response to running or vandal loading are not assessed.',
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
