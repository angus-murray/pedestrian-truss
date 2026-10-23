/*
 * PDF report (A4, jsPDF), laid out as the Barrier5100 / Baseplate2D reports: title block, numbered sections with
 * ruled headings, tables with shaded header rows, a boxed overall result, a figure of the 3D view, running header
 * and page numbers. DejaVu Sans is embedded for Greek letters and symbols; "x_y" and "^n" in text are drawn as
 * subscripts and superscripts.
 */
import { jsPDF } from 'jspdf';
import type { BridgeInput } from '../model/types';
import { DECK_INFO, GROUP_INFO, GROUPS } from '../model/types';
import { effectiveSections, type BridgeModel } from '../model/build';
import { comboLabel, windPressure, type AnalysisResults } from '../model/analysis';
import { summarise } from '../components/Results';
import type { ViewCapture } from '../components/viewer/Viewer3D';

export interface ReportInfo {
  projectName: string;
  projectNumber: string;
  structure: string;
  location: string;
  designer: string;
  date: string;
}

export const REPORT_INFO_FIELDS: [keyof ReportInfo & string, string][] = [
  ['projectName', 'Project Name'],
  ['projectNumber', 'Project Number'],
  ['structure', 'Structure'],
  ['location', 'Location'],
  ['designer', 'Designer'],
  ['date', 'Date (DD/MM/YYYY)']
];

export interface ReportData {
  input: BridgeInput;
  model: BridgeModel;
  results: AnalysisResults;
  image: ViewCapture | null;
}

const INK: [number, number, number] = [30, 41, 59]; // slate-800
const BODY: [number, number, number] = [51, 65, 85]; // slate-700
const MUTED: [number, number, number] = [100, 116, 139]; // slate-500
const RULE: [number, number, number] = [203, 213, 225]; // slate-300
const FILL: [number, number, number] = [241, 245, 249]; // slate-100

const PW = 210, PH = 297, M = 18, CW = PW - 2 * M;
const TOP = 24, BOTTOM = PH - 16;
const PAD = 1.15;
const PT = 0.3528; // mm per point
const lineH = (pt: number) => pt * PT * 1.2;

const f1 = (v: number) => v.toFixed(1);
const f0 = (v: number) => v.toFixed(0);
const pct = (u: number) => (u >= 9.99 ? '> 999%' : `${(u * 100).toFixed(1)}%`);
const passFail = (ok: boolean) => (ok ? 'PASS' : 'FAIL');

let fontCache: { regular: string; bold: string } | null = null;
async function loadFonts(): Promise<{ regular: string; bold: string }> {
  if (fontCache) return fontCache;
  const b64 = async (url: string) => {
    const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return btoa(s);
  };
  fontCache = { regular: await b64('/fonts/DejaVuSans.ttf'), bold: await b64('/fonts/DejaVuSans-Bold.ttf') };
  return fontCache;
}

/** Text with "x_sub" subscripts and "^sup" superscripts (as RichText in the app). */
const TOKEN = /([A-Za-zα-ωΑ-Ω][*']?)_([A-Za-z0-9,.]+)|\^([0-9.]+)/g;
type Seg = { t: string; v: 0 | -1 | 1 };
function segments(text: string): Seg[] {
  const out: Seg[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ t: text.slice(last, i), v: 0 });
    if (m[3] !== undefined) out.push({ t: m[3], v: 1 });
    else out.push({ t: m[1], v: 0 }, { t: m[2], v: -1 });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last), v: 0 });
  return out;
}

export async function generateReport(d: ReportData, info: ReportInfo): Promise<void> {
  const { input, model, results: r } = d;
  const fonts = await loadFonts();
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.addFileToVFS('DejaVuSans.ttf', fonts.regular);
  doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal');
  doc.addFileToVFS('DejaVuSans-Bold.ttf', fonts.bold);
  doc.addFont('DejaVuSans-Bold.ttf', 'DejaVu', 'bold');
  let y = M;
  let size = 9;

  const font = (style: 'normal' | 'bold', sz: number, color: [number, number, number] = BODY) => {
    doc.setFont('DejaVu', style);
    doc.setFontSize(sz);
    doc.setTextColor(...color);
    size = sz;
  };
  const ensure = (h: number) => {
    if (y + h > BOTTOM) {
      doc.addPage();
      y = TOP;
    }
  };

  // ---------- rich text: measure, wrap, draw ----------
  const segWidth = (s: Seg) => (doc.getStringUnitWidth(s.t) * size * (s.v ? 0.72 : 1) * PT);
  const richWidth = (text: string) => segments(text).reduce((w, s) => w + segWidth(s), 0);
  const drawRich = (text: string, x: number, yb: number, align: 'left' | 'center' | 'right' = 'left') => {
    const w = richWidth(text);
    let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    const base = size;
    for (const s of segments(text)) {
      if (s.v) doc.setFontSize(base * 0.72);
      doc.text(s.t, cx, yb + (s.v === -1 ? base * PT * 0.22 : s.v === 1 ? -base * PT * 0.32 : 0));
      if (s.v) doc.setFontSize(base);
      cx += segWidth(s);
    }
  };
  const wrapRich = (text: string, w: number): string[] => {
    const lines: string[] = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const t = line ? line + ' ' + word : word;
        if (line && richWidth(t) > w) {
          lines.push(line);
          line = word;
        } else line = t;
      }
      lines.push(line);
    }
    return lines;
  };
  const paragraph = (text: string, sz = 8.5, color: [number, number, number] = BODY) => {
    flushHead(3 * lineH(sz));
    font('normal', sz, color);
    for (const l of wrapRich(text, CW)) {
      ensure(lineH(sz));
      drawRich(l, M, y + sz * PT * 0.85);
      y += lineH(sz);
    }
    y += 1.5;
  };

  const heading = (text: string) => {
    ensure(60); // with the start of what follows
    y += 3;
    font('bold', 11, INK);
    doc.text(text, M, y);
    y += 1.8;
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.3);
    doc.line(M, y, M + CW, y);
    y += 3;
  };
  // A sub-heading is drawn with what follows it (table or paragraph), so it never ends a page on its own
  let pendingHead: { text: string; note?: string } | null = null;
  const subheading = (text: string, note?: string) => {
    pendingHead = { text, note };
  };
  const flushHead = (keep: number) => {
    if (!pendingHead) return;
    const { text, note } = pendingHead;
    pendingHead = null;
    font('bold', 9.5, INK);
    const titleW = doc.getTextWidth(text);
    font('normal', 7.5, MUTED);
    const ownLine = !!note && titleW + richWidth(note) + 6 > CW;
    ensure(6 + (ownLine ? 4 : 0) + keep);
    y += 1;
    font('bold', 9.5, INK);
    doc.text(text, M, y + 3);
    if (note) {
      font('normal', 7.5, MUTED);
      if (ownLine) {
        y += 4.2;
        drawRich(note, M, y + 3);
      } else drawRich(note, M + CW, y + 3, 'right');
    }
    y += 5;
  };

  type Row = { cells: string[]; kind?: 'head' | 'strong' };
  const TSZ = 8;
  const colWidths = (widths: number[]) => {
    const scale = CW / widths.reduce((a, b) => a + b, 0);
    return widths.map((w) => w * scale);
  };
  const rowLines = (row: Row, ws: number[]) => {
    font(row.kind ? 'bold' : 'normal', TSZ, row.kind === 'head' ? INK : BODY);
    const lines = row.cells.map((c, i) => wrapRich(String(c), ws[i] - 2 * PAD));
    return { lines, h: Math.max(...lines.map((l) => l.length)) * lineH(TSZ) + 2 * PAD };
  };
  /** Height of a table (mm), to keep it on one page with its heading. */
  const tableHeight = (widths: number[], rows: Row[]) => {
    const ws = colWidths(widths);
    return rows.reduce((t, row) => t + rowLines(row, ws).h, 0) + 2;
  };
  /** Table with rich-text cells; aligns default to centre except the first column. Kept on one page when it fits. */
  const table = (widths: number[], rows: Row[], aligns: ('left' | 'center' | 'right')[] = []) => {
    const sz = TSZ;
    doc.setLineWidth(0.15);
    const ws = colWidths(widths);
    const total = tableHeight(widths, rows);
    const fits = total <= BOTTOM - TOP - 12;
    flushHead(fits ? total : 25);
    if (fits) ensure(total);
    rows.forEach((row) => {
      const { lines, h } = rowLines(row, ws);
      font(row.kind ? 'bold' : 'normal', sz, row.kind === 'head' ? INK : BODY);
      ensure(h);
      if (row.kind === 'head') {
        doc.setFillColor(...FILL);
        doc.rect(M, y, CW, h, 'F');
      }
      let x = M;
      lines.forEach((l, i) => {
        const a = aligns[i] || (i === 0 ? 'left' : 'center');
        const tx = a === 'right' ? x + ws[i] - PAD : a === 'center' ? x + ws[i] / 2 : x + PAD;
        const y0 = y + PAD + (h - 2 * PAD - l.length * lineH(sz)) / 2;
        l.forEach((ln, k) => drawRich(ln, tx, y0 + k * lineH(sz) + sz * PT * 0.85, a));
        x += ws[i];
      });
      doc.setDrawColor(...RULE);
      doc.line(M, y + h, M + CW, y + h);
      y += h;
    });
    y += 2;
  };
  /** Two parameter/value column pairs, filled down the left-hand pair first. */
  const pairs = (items: [string, string][]) => {
    const half = Math.ceil(items.length / 2);
    const rows: Row[] = [];
    for (let j = 0; j < half; j++) {
      const L = items[j], R = items[j + half] || ['', ''];
      rows.push({ cells: [L[0], L[1], R[0], R[1]] });
    }
    table([40, 47, 40, 47], rows, ['left', 'left', 'left', 'left']);
  };

  const TITLE = 'Steel Pony Truss Footbridge';
  const { geo } = model;
  const sum = summarise(model, r, input);
  const f2 = (v: number) => v.toFixed(2);

  // ---------- Title block ----------
  font('normal', 8, MUTED);
  doc.text('PEDTRUSS', M, y);
  y += 7;
  font('bold', 17, INK);
  doc.text(TITLE, M, y);
  y += 6;
  font('normal', 9.5, MUTED);
  doc.text('3D frame, elastic buckling and modal analysis with member checks to AS 5100.6', M, y);
  y += 4;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.6);
  doc.line(M, y, M + CW, y);
  y += 3;

  let sec = 1;
  const details = REPORT_INFO_FIELDS.map(([k, label]) => [label.replace(' (DD/MM/YYYY)', ''), String(info[k] || '').trim()] as [string, string]).filter((p) => p[1]);
  if (details.length) {
    heading(`${sec++}   Project Details`);
    const rows: Row[] = [];
    for (let i = 0; i < details.length; i += 2) {
      const a = details[i], b = details[i + 1] || ['', ''];
      rows.push({ cells: [a[0], a[1], b[0], b[1]] });
    }
    table([32, 55, 32, 55], rows, ['left', 'left', 'left', 'left']);
  }

  // ---------- Summary ----------
  const pass = !sum.failing.length && sum.deflOk && sum.vibOk && !r.errors.length;
  heading(`${sec++}   Summary`);
  ensure(22);
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.6);
  doc.rect(M, y, CW, 18, 'S');
  font('bold', 7.5, MUTED);
  doc.text('ULS AND DEFLECTION CHECKS', M + 4, y + 6);
  font('bold', 15, INK);
  doc.text(passFail(pass), M + 4, y + 13.5);
  font('normal', 7.5, MUTED);
  doc.text('Maximum member utilisation', M + CW - 4, y + 6, { align: 'right' });
  font('bold', 12, INK);
  doc.text(pct(sum.maxUtil), M + CW - 4, y + 13.5, { align: 'right' });
  y += 22;
  if (sum.failing.length) paragraph(`Members over 100%: ${sum.failing.map((f) => `${f.name} (${pct(f.util)})`).join(', ')}.`, 8.5, INK);
  if (!sum.deflOk) paragraph('The vertical deflection exceeds the limit.', 8.5, INK);
  if (!sum.vibOk) paragraph('The vertical acceleration under a pedestrian exceeds the AS 5100.2 Cl. 13.4 limit.', 8.5, INK);
  r.errors.forEach((e) => paragraph(e, 8.5, INK));
  [...r.warnings, ...sum.dynWarnings].forEach((w) => paragraph(`•  ${w}`));
  pairs([
    ['Lowest buckling factor λ_c', sum.lambdaMin !== null ? f2(sum.lambdaMin) : '—'],
    ['First vertical frequency', sum.fVert !== null ? `${f2(sum.fVert)} Hz` : '—'],
    ['First lateral frequency', sum.fLat !== null ? `${f2(sum.fLat)} Hz` : '—'],
    ['Steel mass (incl. connections)', `${f2(model.steelMass)} t`]
  ]);

  // ---------- Geometry ----------
  heading(`${sec++}   Geometry and Deck`);
  pairs([
    ['Span L', `${f2(input.span)} m`],
    ['Truss type', `${input.trussType[0].toUpperCase()}${input.trussType.slice(1)}`],
    ['Panels', `${geo.n} at ${geo.a.toFixed(3)} m`],
    ['Truss depth h (centroids)', `${f2(input.depth)} m`],
    ['Clear width', `${f2(input.clearWidth)} m`],
    ['Handrail width', `${f0(input.handrailWidth)} mm`],
    ['Chord width', `${f0(geo.chordWidth * 1000)} mm`],
    ['Truss spacing s', `${geo.s.toFixed(3)} m`],
    ['Cross girder top above chord top', `${f0(input.cgLevel)} mm`],
    ['Plan bracing', input.bracing === 'x' ? 'X-bracing' : input.bracing === 'single' ? 'Single diagonals' : 'None'],
    ['Deck', `${DECK_INFO[input.deckType].label}, ${f0(input.deckThickness)} mm`],
    ['Screens', input.screens ? `${f2(input.screenHeight)} m above deck` : 'None'],
    ['Handrails', geo.handrailHeights.map((h) => `${f2(h)} m`).join(' and ') + ' above deck'],
    ['Stringers', input.stringers ? `${geo.stringerYs.length} at ${f2(input.stringerSpacing)} m` : 'None'],
    ['Diagonal ends', input.webPinned ? 'Pinned' : 'Rigid']
  ]);

  subheading('Sections');
  table(
    [22, 30, 22, 22, 18, 14, 16],
    [
      { cells: ['Group', 'Section', 'Grade', 'Depth direction', 'A_g (mm²)', 'f_y (MPa)', 'Mass (kg/m)'], kind: 'head' },
      ...GROUPS.filter((g) => model.members.some((x) => x.group === g)).map((g) => {
        const m = model.members.find((x) => x.group === g);
        const s = effectiveSections(input)[g];
        return {
          cells: [
            GROUP_INFO[g].label,
            m ? m.sp.def.name : s.name,
            s.grade,
            s.rotate ? GROUP_INFO[g].rotDir : GROUP_INFO[g].depthDir,
            m ? f0(m.sp.A) : '—',
            m ? f0(m.sp.fy) : '—',
            m ? f1(m.sp.mass) : '—'
          ]
        };
      })
    ]
  );

  // ---------- Loads ----------
  heading(`${sec++}   Loads and Combinations`);
  pairs([
    ['G1 steel (incl. connections)', `+${f0(input.connectionAllowance)}%`],
    ['G1 deck', `${f2((input.deckThickness / 1000) * input.deckDensity)} kPa`],
    ['G2 screens', input.screens ? `${f2(input.screenLoad)} kPa` : '—'],
    ['G2 handrails', `${f2(input.handrailLoad)} kN/m per rail`],
    ['G2 services', `${f2(input.services)} kN/m`],
    ['Pedestrian Q', `${f2(input.pedestrian)} kPa`],
    ['Wind V_u / V_s', `${f0(input.windUls)} / ${f0(input.windSls)} m/s (${f2(windPressure(input.windUls))} / ${f2(windPressure(input.windSls))} kPa)`],
    ['C_d / C_L', `${f2(input.dragCoeff)} / ${f2(input.liftCoeff)}`],
    ['Barrier load B', `${f2(input.barrier)} kN/m`],
    ['U-frame restraint', input.restraintPct > 0 ? `${f1(input.restraintPct)}% of top chord force` : 'Not applied']
  ]);
  subheading('Load combinations (factors)');
  table(
    [40, 10, 10, 10, 10, 10, 10, 10],
    [
      { cells: ['Combination', 'G1 steel', 'G1 deck', 'G2', 'Q', 'W', 'B', 'Δ check'], kind: 'head' },
      ...input.combos.map((c) => ({ cells: [`${c.type} ${c.name}`, f2(c.g1s), f2(c.g1d), f2(c.g2), f2(c.q), f2(c.w), f2(c.b), c.type === 'SLS' && c.deflection ? 'Yes' : '—'] }))
    ]
  );

  // ---------- Figure ----------
  if (d.image) {
    const fg = d.image;
    const w = CW, h = Math.min(w * (fg.h / fg.w), 120);
    const wImg = h * (fg.w / fg.h);
    heading(`${sec++}   Model`);
    ensure(h + 10);
    doc.addImage(fg.data, 'JPEG', M + (CW - wImg) / 2, y, wImg, h);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.2);
    doc.rect(M + (CW - wImg) / 2, y, wImg, h, 'S');
    y += h + 4;
    paragraph('Figure 1   3D view of the bridge as shown in the app.', 8, BODY);
  }

  // ---------- Member checks ----------
  heading(`${sec++}   Member Design (ULS, AS 5100.6)`);
  subheading('Governing member of each group');
  const memberRow = (dd: (typeof r.design)[number]) => {
    const m = model.members[dd.member];
    return {
      cells: [
        m.name,
        m.sp.def.name,
        dd.governing,
        dd.combo >= 0 ? comboLabel(r.combos[dd.combo]) : '—',
        f0(dd.N),
        f1(dd.Mx),
        f1(dd.My),
        dd.comp ? f2(Math.min(dd.leMajor, dd.leMinor)) : '—',
        dd.comp ? f0(dd.comp.phiNc) : '—',
        pct(dd.util)
      ]
    };
  };
  const W = [10, 17, 22, 25, 9, 9, 9, 8, 10, 9];
  const headRow: Row = { cells: ['Member', 'Section', 'Governing check', 'Combination', 'N* (kN)', 'M*_x (kNm)', 'M*_y (kNm)', 'l_e (m)', 'φN_c (kN)', 'Util.'], kind: 'head' };
  table(W, [
    headRow,
    ...GROUPS.map((g) => r.design.filter((x) => model.members[x.member].group === g)).filter((x) => x.length).map((ds) => memberRow(ds.reduce((a, b) => (b.util > a.util ? b : a))))
  ]);
  paragraph('N* positive in tension. l_e is the effective length used for member compression capacity (smaller of the two axes).', 7.5, MUTED);
  subheading('All members');
  table(W, [headRow, ...r.design.slice().sort((a, b) => b.util - a.util).map(memberRow)]);

  // ---------- Buckling ----------
  heading(`${sec++}   Elastic Buckling`);
  const nb = Math.min(4, Math.max(1, ...r.buckling.map((b) => b.values.length)));
  table(
    [40, ...Array(nb).fill(60 / nb)],
    [
      { cells: ['Combination', ...Array.from({ length: nb }, (_, k) => `λ_c mode ${k + 1}`)], kind: 'head' },
      ...r.buckling.map((b) => ({ cells: [comboLabel(r.combos[b.combo]), ...Array.from({ length: nb }, (_, k) => (b.values[k] !== undefined ? f2(b.values[k]) : '—'))] }))
    ]
  );

  // ---------- Serviceability ----------
  heading(`${sec++}   Serviceability`);
  subheading('Deflection', `Limit span / ${input.deflLimit}`);
  table(
    [46, 18, 18, 18],
    [
      { cells: ['Combination', 'Vertical (mm)', 'Lateral (mm)', 'Limit (mm)'], kind: 'head' },
      ...r.sls.map((s) => ({ cells: [comboLabel(r.combos[s.combo]), f1(s.maxVert * 1000), f1(s.maxLat * 1000), s.limit !== null ? `${f1(s.limit * 1000)} ${passFail(s.maxVert <= s.limit + 1e-9)}` : '—'] }))
    ]
  );
  if (r.sls.some((s) => s.stringer)) {
    subheading('Stringer deflection relative to the cross girders', `Limit panel length / ${input.deflLimit}`);
    table(
      [46, 18, 18, 18],
      [
        { cells: ['Combination', 'Deflection (mm)', 'Stringer', 'Limit (mm)'], kind: 'head' },
        ...r.sls
          .filter((s) => s.stringer)
          .map((s) => ({ cells: [comboLabel(r.combos[s.combo]), f1(s.stringer!.maxRel * 1000), model.members[s.stringer!.member].name, `${f1(s.stringer!.limit * 1000)} ${passFail(s.stringer!.maxRel <= s.stringer!.limit + 1e-9)}`] }))
      ]
    );
  }
  if (r.vibration) {
    const v = r.vibration;
    subheading('Vertical vibration (AS 5100.2 Cl. 13.4)', 'a = 4π^2 f_0^2 y Ψ ≤ 0.25 f_0^0.78 when f_0 < 5 Hz');
    table(
      [14, 14, 12, 12, 16, 16, 16],
      [
        { cells: ['f_0 (Hz)', 'y (mm)', 'δ', 'Ψ', 'a (m/s²)', 'Limit (m/s²)', 'Result'], kind: 'head' },
        {
          cells: [
            v.f0 !== null ? f2(v.f0) : '—',
            (v.y * 1000).toFixed(3),
            f2(v.delta),
            f2(v.psi),
            v.required ? v.a.toFixed(3) : '—',
            v.required ? v.limit.toFixed(3) : '—',
            v.f0 === null ? '—' : v.required ? passFail(v.ok) : 'Not required'
          ]
        }
      ]
    );
    paragraph('f_0: first vertical mode of the 3D model. y: static deflection under a 700 N pedestrian at midspan. Ψ: AS 5100.2 Figure 13.4.2 for the span and δ.', 7.5, MUTED);
  }
  subheading('Natural frequencies');
  table(
    [20, 30, 50],
    [
      { cells: ['Mode', 'Frequency (Hz)', 'Type'], kind: 'head' },
      ...r.modal.freqs.map((fq, i) => ({ cells: [String(i + 1), f2(fq), r.modal.kinds[i]] }))
    ]
  );

  // ---------- Method ----------
  heading(`${sec++}   Method and Assumptions`);
  paragraph(
    'The two trusses, cross girders and plan bracing are modelled as a linear elastic 3D frame of Euler–Bernoulli beam elements, each member divided into ' +
      `${input.elementsPerMember} elements. Chords are continuous; joints are rigid except where released. The cross girders frame into the bottom chord panel points and form U-frames with the verticals, which are the only lateral restraint of the top chords. ` +
      'The deck is non-structural and spans one way onto the cross girders. Load cases are combined linearly.'
  );
  paragraph(
    'The elastic buckling load factors λ_c come from a linearised buckling analysis of the whole frame (geometric stiffness from the member axial forces of each ULS combination). For members designed by buckling analysis, the elastic buckling load is N_om = λ_c N* for the lowest mode in which the member takes part, and the slenderness l_e/r = π√(E A_g / N_om) is used in AS 5100.6 Cl. 6.3.3. Moments in compression members are amplified by 1/(1 − N*/N_om).'
  );
  paragraph(
    'Combined actions are checked with the linear interaction N*/φN + M*_x/φM_x + M*_y/φM_y ≤ 1 for the section (Cl. 8.3.4) and the member (Cl. 8.4, with φN_c and φM_bx), which is conservative. Connections, fatigue and the deck are not designed.'
  );

  // ---------- Running header and page numbers ----------
  const total = doc.getNumberOfPages();
  const ref = [info.projectNumber, info.projectName, info.structure].map((v) => String(v || '').trim()).filter(Boolean).join('  |  ');
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.2);
    if (p > 1) {
      font('normal', 7.5, MUTED);
      doc.text(TITLE, M, 13);
      if (ref) doc.text(doc.splitTextToSize(ref, CW / 2)[0], M + CW, 13, { align: 'right' });
      doc.line(M, 15, M + CW, 15);
    }
    font('normal', 7.5, MUTED);
    doc.text(`Page ${p} of ${total}`, M + CW, PH - 10, { align: 'right' });
  }

  const safe = (v: string) => String(v || '').trim().replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '');
  doc.save(['PedTruss', safe(info.projectNumber), safe(info.structure)].filter(Boolean).join('_') + '.pdf');
}
