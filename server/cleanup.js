/**
 * Optional geometry cleanup — diagnose and fix DXF segment issues.
 * Does not gate nest/export; standalone add-on.
 */
import DxfParser from 'dxf-parser';

const DEFAULT_SNAP = 0.02;
const DEFAULT_MIN_SEG = 0.05;

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function near(a, b, tol) {
  return dist(a, b) <= tol;
}

function segLength(s) {
  return dist(s.start, s.end);
}

function roundPt(p, decimals = 4) {
  const f = 10 ** decimals;
  return [Math.round(p[0] * f) / f, Math.round(p[1] * f) / f];
}

function segKey(s, tol) {
  const a = roundPt(s.start, 3);
  const b = roundPt(s.end, 3);
  const keyA = `${a[0]},${a[1]}`;
  const keyB = `${b[0]},${b[1]}`;
  return keyA < keyB ? `${keyA}|${keyB}` : `${keyB}|${keyA}`;
}

/** Extract line segments from raw DXF (includes open geometry). */
export function extractSegments(dxfContent) {
  const parser = new DxfParser();
  const dxf = parser.parseSync(dxfContent);
  const segments = [];
  let id = 0;

  for (const ent of dxf?.entities || []) {
    switch (ent.type) {
      case 'LINE': {
        const a = ent.start || ent.vertices?.[0];
        const b = ent.end || ent.vertices?.[1];
        if (a && b) {
          segments.push({ id: id++, type: 'line', start: [a.x, a.y], end: [b.x, b.y] });
        }
        break;
      }
      case 'LWPOLYLINE':
      case 'POLYLINE': {
        const verts = (ent.vertices || []).map((v) => [v.x, v.y]);
        for (let i = 0; i < verts.length - 1; i++) {
          segments.push({ id: id++, type: 'poly', start: verts[i], end: verts[i + 1] });
        }
        const closed = ent.shape || ent.closed || (verts.length > 2 && near(verts[0], verts[verts.length - 1], 0.001));
        if (closed && verts.length > 2 && !near(verts[0], verts[verts.length - 1], 0.001)) {
          segments.push({ id: id++, type: 'poly', start: verts[verts.length - 1], end: verts[0] });
        }
        break;
      }
      case 'ARC': {
        const pts = arcToPoints(ent, 16);
        for (let i = 0; i < pts.length - 1; i++) {
          segments.push({ id: id++, type: 'arc', start: pts[i], end: pts[i + 1] });
        }
        break;
      }
      case 'CIRCLE': {
        const pts = circleToPoints(ent.center.x, ent.center.y, ent.radius, 32);
        for (let i = 0; i < pts.length; i++) {
          segments.push({ id: id++, type: 'circle', start: pts[i], end: pts[(i + 1) % pts.length] });
        }
        break;
      }
      default:
        break;
    }
  }
  return segments;
}

function circleToPoints(cx, cy, r, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

function arcToPoints(ent, segments = 16) {
  const { center, radius, startAngle, endAngle } = ent;
  const start = (startAngle * Math.PI) / 180;
  let end = (endAngle * Math.PI) / 180;
  if (end <= start) end += 2 * Math.PI;
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = start + ((end - start) * i) / segments;
    pts.push([center.x + radius * Math.cos(a), center.y + radius * Math.sin(a)]);
  }
  return pts;
}

function chainToPoints(chain) {
  if (!chain.length) return [];
  const pts = [];
  const first = chain[0];
  pts.push(first.reversed ? [...first.end] : [...first.start]);
  for (const s of chain) {
    pts.push(s.reversed ? [...s.start] : [...s.end]);
  }
  return pts;
}

function buildChains(segments, tol) {
  const used = new Set();
  const chains = [];

  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue;
    const chain = [{ ...segments[i], segIndex: i, reversed: false }];
    used.add(i);
    let head = [...chain[0].start];
    let tail = [...chain[0].end];

    let extended = true;
    while (extended) {
      extended = false;
      for (let j = 0; j < segments.length; j++) {
        if (used.has(j)) continue;
        const s = segments[j];
        if (near(tail, s.start, tol)) {
          chain.push({ ...s, segIndex: j, reversed: false });
          tail = [...s.end];
          used.add(j);
          extended = true;
          break;
        }
        if (near(tail, s.end, tol)) {
          chain.push({ ...s, segIndex: j, reversed: true });
          tail = [...s.start];
          used.add(j);
          extended = true;
          break;
        }
      }
    }

    extended = true;
    while (extended) {
      extended = false;
      for (let j = 0; j < segments.length; j++) {
        if (used.has(j)) continue;
        const s = segments[j];
        if (near(head, s.end, tol)) {
          chain.unshift({ ...s, segIndex: j, reversed: false });
          head = [...s.start];
          used.add(j);
          extended = true;
          break;
        }
        if (near(head, s.start, tol)) {
          chain.unshift({ ...s, segIndex: j, reversed: true });
          head = [...s.end];
          used.add(j);
          extended = true;
          break;
        }
      }
    }

    const points = chainToPoints(chain);
    chains.push({
      id: chains.length,
      segments: chain,
      points,
      head,
      tail,
      closed: near(head, tail, tol),
    });
  }
  return chains;
}

function findDuplicates(segments, tol) {
  const seen = new Map();
  const dups = [];
  for (const s of segments) {
    const key = segKey(s, tol);
    if (seen.has(key)) {
      dups.push({ segmentId: s.id, duplicateOf: seen.get(key), length: segLength(s) });
    } else {
      seen.set(key, s.id);
    }
  }
  return dups;
}

export function diagnoseGeometry(dxfContent, options = {}) {
  const snapTolerance = options.snapTolerance ?? DEFAULT_SNAP;
  const minSegmentLength = options.minSegmentLength ?? DEFAULT_MIN_SEG;

  const segments = extractSegments(dxfContent);
  const issues = [];
  const summary = {
    totalSegments: segments.length,
    openContours: 0,
    endpointGaps: 0,
    tinySegments: 0,
    duplicateEdges: 0,
    joinableEndpoints: 0,
  };

  for (const s of segments) {
    const len = segLength(s);
    if (len < minSegmentLength) {
      summary.tinySegments++;
      issues.push({
        type: 'tiny_segment',
        severity: 'warn',
        segmentId: s.id,
        length: len,
        message: `Tiny segment #${s.id} (${len.toFixed(4)}")`,
      });
    }
    if (len < 1e-9) {
      issues.push({
        type: 'zero_length',
        severity: 'warn',
        segmentId: s.id,
        message: `Zero-length segment #${s.id}`,
      });
    }
  }

  const duplicates = findDuplicates(segments, snapTolerance);
  summary.duplicateEdges = duplicates.length;
  for (const d of duplicates) {
    issues.push({
      type: 'duplicate_edge',
      severity: 'info',
      segmentId: d.segmentId,
      duplicateOf: d.duplicateOf,
      message: `Duplicate edge: segment #${d.segmentId} overlaps #${d.duplicateOf}`,
    });
  }

  const chains = buildChains(segments, snapTolerance);

  for (const chain of chains) {
    if (!chain.closed && chain.points.length >= 2) {
      const gap = dist(chain.head, chain.tail);
      summary.openContours++;
      issues.push({
        type: 'open_contour',
        severity: 'error',
        chainId: chain.id,
        gap,
        pointCount: chain.points.length,
        message: `Open contour (chain ${chain.id}): ${chain.points.length} pts, gap ${gap.toFixed(4)}"`,
      });
      if (gap <= snapTolerance * 5 && gap > snapTolerance) {
        summary.endpointGaps++;
        issues.push({
          type: 'near_close_gap',
          severity: 'warn',
          chainId: chain.id,
          gap,
          message: `Near-close gap on chain ${chain.id}: ${gap.toFixed(4)}" (join tolerance ${snapTolerance}")`,
        });
      }
    }
  }

  // Joinable gaps between chain endpoints (not yet connected)
  for (let i = 0; i < chains.length; i++) {
    for (let j = i + 1; j < chains.length; j++) {
      const a = chains[i];
      const b = chains[j];
      const pairs = [
        [a.tail, b.head], [a.tail, b.tail], [a.head, b.head], [a.head, b.tail],
      ];
      for (const [p1, p2] of pairs) {
        const g = dist(p1, p2);
        if (g > 0 && g <= snapTolerance) {
          summary.joinableEndpoints++;
          issues.push({
            type: 'endpoint_gap',
            severity: 'warn',
            chainA: a.id,
            chainB: b.id,
            gap: g,
            message: `Endpoints within ${snapTolerance}": chains ${a.id}↔${b.id} (${g.toFixed(4)}")`,
          });
        }
      }
    }
  }

  return {
    issues,
    summary,
    chains: chains.map((c) => ({ id: c.id, closed: c.closed, pointCount: c.points.length })),
    previewSvg: chainsToSvg(chains, { stroke: '#e74c3c', openStroke: '#f39c12' }),
    settings: { snapTolerance, minSegmentLength },
  };
}

function chainsToSvg(chains, { stroke = '#4a9eff', openStroke = '#f39c12' } = {}) {
  const allPts = chains.flatMap((c) => c.points);
  if (!allPts.length) return '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><text x="10" y="50" fill="#888">No geometry</text></svg>';

  const xs = allPts.map((p) => p[0]);
  const ys = allPts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const pad = 20;
  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const scale = Math.min(360 / w, 260 / h);
  const svgW = w * scale + pad * 2;
  const svgH = h * scale + pad * 2;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="100%" style="max-height:280px;background:#0a0a14">`;

  for (const chain of chains) {
    const color = chain.closed ? stroke : openStroke;
    const pts = chain.points.map(([x, y]) => `${pad + (x - minX) * scale},${pad + (y - minY) * scale}`).join(' ');
    svg += `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5"/>`;
    if (!chain.closed && chain.points.length >= 2) {
      const h = chain.head;
      const t = chain.tail;
      svg += `<circle cx="${pad + (h[0] - minX) * scale}" cy="${pad + (h[1] - minY) * scale}" r="3" fill="${openStroke}"/>`;
      svg += `<circle cx="${pad + (t[0] - minX) * scale}" cy="${pad + (t[1] - minY) * scale}" r="3" fill="#e74c3c"/>`;
    }
  }
  svg += '</svg>';
  return svg;
}

export function fixGeometry(dxfContent, options = {}) {
  const snapTolerance = options.snapTolerance ?? DEFAULT_SNAP;
  const minSegmentLength = options.minSegmentLength ?? DEFAULT_MIN_SEG;
  const actions = options.actions ?? ['strip_tiny', 'remove_duplicates', 'join_gaps', 'close_gaps'];

  let segments = extractSegments(dxfContent);
  const fixed = [];

  if (actions.includes('strip_tiny')) {
    const before = segments.length;
    segments = segments.filter((s) => segLength(s) >= minSegmentLength);
    if (segments.length < before) fixed.push(`Removed ${before - segments.length} tiny segment(s)`);
  }

  if (actions.includes('remove_duplicates')) {
    const seen = new Set();
    const next = [];
    for (const s of segments) {
      const key = segKey(s, snapTolerance);
      if (!seen.has(key)) {
        seen.add(key);
        next.push(s);
      }
    }
    if (next.length < segments.length) fixed.push(`Removed ${segments.length - next.length} duplicate edge(s)`);
    segments = next;
  }

  if (actions.includes('join_gaps')) {
    let chains = buildChains(segments, snapTolerance);
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < chains.length; i++) {
        for (let j = i + 1; j < chains.length; j++) {
          const a = chains[i];
          const b = chains[j];
          const joins = [
            { at: 'tail-head', dist: dist(a.tail, b.head) },
            { at: 'tail-tail', dist: dist(a.tail, b.tail) },
            { at: 'head-head', dist: dist(a.head, b.head) },
            { at: 'head-tail', dist: dist(a.head, b.tail) },
          ].filter((j) => j.dist <= snapTolerance);

          if (joins.length) {
            const jn = joins[0];
            let newPoints = [...a.points];
            let newSegs = [...a.segments];
            if (jn.at === 'tail-head') {
              newPoints = [...a.points, ...b.points.slice(1)];
              newSegs = [...a.segments, ...b.segments];
            } else if (jn.at === 'tail-tail') {
              newPoints = [...a.points, ...[...b.points].reverse().slice(1)];
              newSegs = [...a.segments, ...b.segments.map((s) => ({ ...s, reversed: !s.reversed }))];
            } else if (jn.at === 'head-head') {
              newPoints = [...[...b.points].reverse(), ...a.points.slice(1)];
              newSegs = [...b.segments.map((s) => ({ ...s, reversed: !s.reversed })), ...a.segments];
            } else {
              newPoints = [...b.points, ...a.points.slice(1)];
              newSegs = [...b.segments, ...a.segments];
            }
            const head = newPoints[0];
            const tail = newPoints[newPoints.length - 1];
            chains[i] = {
              id: a.id,
              segments: newSegs,
              points: newPoints,
              head,
              tail,
              closed: near(head, tail, snapTolerance),
            };
            chains.splice(j, 1);
            merged = true;
            fixed.push(`Joined chains ${a.id} and ${b.id}`);
            break;
          }
        }
        if (merged) break;
      }
    }
    segments = chainsToSegments(chains);
  }

  let chains = buildChains(segments, snapTolerance);

  if (actions.includes('close_gaps')) {
    for (const chain of chains) {
      if (!chain.closed && near(chain.head, chain.tail, snapTolerance)) {
        chain.closed = true;
        fixed.push(`Closed contour on chain ${chain.id}`);
      }
    }
    segments = chainsToSegments(chains);
    chains = buildChains(segments, snapTolerance);
  }

  const polylines = chains
    .filter((c) => c.points.length >= 2)
    .map((c) => {
      const pts = [...c.points];
      if (c.closed && pts.length >= 3 && !near(pts[0], pts[pts.length - 1], 0.001)) {
        pts.push([pts[0][0], pts[0][1]]);
      }
      return pts;
    });

  const dxf = exportCleanupDxf(polylines);
  const after = diagnoseGeometry(dxf, { snapTolerance, minSegmentLength });

  return {
    dxf,
    polylines,
    fixed,
    previewSvg: chainsToSvg(buildChains(extractSegments(dxf), snapTolerance), { stroke: '#2ecc71', openStroke: '#f39c12' }),
    beforeSvg: diagnoseGeometry(dxfContent, { snapTolerance, minSegmentLength }).previewSvg,
    afterDiagnosis: after,
  };
}

function chainsToSegments(chains) {
  const segments = [];
  let id = 0;
  for (const chain of chains) {
    for (let i = 0; i < chain.points.length - 1; i++) {
      segments.push({
        id: id++,
        type: 'line',
        start: chain.points[i],
        end: chain.points[i + 1],
      });
    }
  }
  return segments;
}

function w(n) {
  return n.toFixed(6).replace(/\.?0+$/, '') || '0';
}

export function exportCleanupDxf(polylines) {
  const lines = [];
  lines.push('0', 'SECTION', '2', 'HEADER');
  lines.push('9', '$INSUNITS', '70', '1');
  lines.push('0', 'ENDSEC');
  lines.push('0', 'SECTION', '2', 'TABLES');
  lines.push('0', 'TABLE', '2', 'LAYER', '70', '2');
  lines.push('0', 'LAYER', '2', '0', '70', '0', '62', '7', '6', 'CONTINUOUS');
  lines.push('0', 'LAYER', '2', 'CLEANED', '70', '0', '62', '3', '6', 'CONTINUOUS');
  lines.push('0', 'ENDTAB', '0', 'ENDSEC');
  lines.push('0', 'SECTION', '2', 'ENTITIES');

  for (const pl of polylines) {
    if (pl.length < 2) continue;
    const closed = pl.length >= 3 && near(pl[0], pl[pl.length - 1], 0.001);
    lines.push('0', 'LWPOLYLINE', '8', 'CLEANED', '90', String(pl.length), '70', closed ? '1' : '0');
    for (const [x, y] of pl) {
      lines.push('10', w(x), '20', w(y));
    }
  }

  lines.push('0', 'ENDSEC', '0', 'EOF');
  return lines.join('\n');
}

export const CLEANUP_DEFAULTS = {
  snapTolerance: DEFAULT_SNAP,
  minSegmentLength: DEFAULT_MIN_SEG,
};
