/**
 * DXF parsing utilities — extract closed polylines for nesting.
 */
import path from 'path';
import DxfParser from 'dxf-parser';

/** Vault / nest display name from an inbox or upload filename (keeps shop basename). */
export function partNameFromFilename(filename) {
  const base = path.basename(filename, path.extname(filename)).trim();
  return base || 'part';
}

/** Convert drawing units ($INSUNITS) to inches for sheet/nest math. */
export function insunitsToInchesFactor(insunits) {
  switch (insunits) {
    case 0:
      return 1; // unitless — shop DXFs treated as inches
    case 1:
      return 1; // inches
    case 2:
      return 12; // feet → inches
    case 3:
      return 63360; // miles → inches (rare)
    case 4:
      return 1 / 25.4; // millimeters
    case 5:
      return 1 / 2.54; // centimeters
    case 6:
      return 39.3700787; // meters
    default:
      return 1;
  }
}

export function parseDxf(content) {
  const parser = new DxfParser();
  const dxf = parser.parseSync(content);
  const unitFactor = insunitsToInchesFactor(dxf.header?.$INSUNITS ?? 0);
  const flatEntities = flattenDxfEntities(dxf);

  const polylines = [];
  const segments = [];
  const chainTolerance = Math.max(0.02, unitFactor * 0.5);

  for (const { ent, matrix } of flatEntities) {
    if (ent.type === 'CIRCLE') {
      const pl = transformPolyline(
        circleToPolyline(ent.center.x, ent.center.y, ent.radius, 32),
        matrix,
        unitFactor,
      );
      if (pl.length >= 3) polylines.push(pl);
      continue;
    }

    if (ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') {
      const local = polylineVertices(ent);
      if (local?.length >= 3) {
        const closed = isClosedPolyline(ent, local);
        if (closed) {
          const pl = transformPolyline(local, matrix, unitFactor);
          if (pl.length >= 3) polylines.push(pl);
          continue;
        }
      }
    }

    for (const seg of entityToSegments(ent)) {
      segments.push({
        start: transformPoint(seg.start[0], seg.start[1], matrix, unitFactor),
        end: transformPoint(seg.end[0], seg.end[1], matrix, unitFactor),
      });
    }
  }

  for (const chain of buildClosedChains(segments, chainTolerance)) {
    if (chain.length >= 3) polylines.push(chain);
  }

  if (polylines.length === 0) {
    for (const { ent, matrix } of flatEntities) {
      const pl = entityToNestPolyline(ent, matrix, unitFactor);
      if (pl?.length >= 3) polylines.push(pl);
    }
  }

  const pruned = pruneNestPolylines(polylines);
  if (pruned.length) {
    polylines.length = 0;
    polylines.push(...pruned);
  }

  if (polylines.length === 0) {
    throw new Error('No usable closed geometry found in DXF (lines, polylines, circles, arcs)');
  }

  const allPoints = polylines.flat();
  const minX = Math.min(...allPoints.map((p) => p[0]));
  const minY = Math.min(...allPoints.map((p) => p[1]));
  const maxX = Math.max(...allPoints.map((p) => p[0]));
  const maxY = Math.max(...allPoints.map((p) => p[1]));

  const normalized = polylines.map((pl) =>
    pl.map(([x, y]) => [x - minX, y - minY]),
  );

  return {
    polylines: normalized,
    bbox: { width: maxX - minX, height: maxY - minY },
    units: dxf.header?.$INSUNITS ?? 0,
  };
}

function identityMatrix() {
  return [1, 0, 0, 1, 0, 0];
}

function multiplyMatrix(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function translateMatrix(dx, dy) {
  return [1, 0, 0, 1, dx, dy];
}

function scaleMatrix(sx, sy) {
  return [sx, 0, 0, sy, 0, 0];
}

function rotateMatrix(deg) {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
}

function transformPoint(x, y, matrix, unitFactor) {
  const wx = matrix[0] * x + matrix[2] * y + matrix[4];
  const wy = matrix[1] * x + matrix[3] * y + matrix[5];
  return [wx * unitFactor, wy * unitFactor];
}

function transformPolyline(points, matrix, unitFactor) {
  return points.map(([x, y]) => transformPoint(x, y, matrix, unitFactor));
}

/**
 * Expand INSERT references so model-space geometry includes block contents.
 */
export function flattenDxfEntities(dxf) {
  const out = [];

  function walk(entities, parentMatrix) {
    for (const ent of entities || []) {
      if (ent.type === 'INSERT') {
        const block = dxf.blocks?.[ent.name];
        if (!block?.entities?.length) continue;
        const pos = ent.position || { x: 0, y: 0 };
        const insertMatrix = multiplyMatrix(
          parentMatrix,
          multiplyMatrix(
            translateMatrix(pos.x, pos.y),
            multiplyMatrix(
              rotateMatrix(ent.rotation || 0),
              scaleMatrix(ent.xScale ?? 1, ent.yScale ?? 1),
            ),
          ),
        );
        walk(block.entities, insertMatrix);
      } else {
        out.push({ ent, matrix: parentMatrix });
      }
    }
  }

  walk(dxf.entities, identityMatrix());
  return out;
}

function isClosedPolyline(ent, pts) {
  return ent.shape || ent.closed || distance(pts[0], pts[pts.length - 1]) < 0.001;
}

function entityToNestPolyline(ent, matrix, unitFactor) {
  let local = null;
  switch (ent.type) {
    case 'LWPOLYLINE':
    case 'POLYLINE':
      local = polylineVertices(ent);
      break;
    case 'CIRCLE':
      local = circleToPolyline(ent.center.x, ent.center.y, ent.radius, 32);
      break;
    case 'ARC':
      local = arcToPolyline(ent);
      break;
    default:
      break;
  }
  if (!local || local.length < 3) return null;
  return transformPolyline(local, matrix, unitFactor);
}

function entityToSegments(ent) {
  const segments = [];
  switch (ent.type) {
    case 'LINE': {
      const a = ent.start || ent.vertices?.[0];
      const b = ent.end || ent.vertices?.[1];
      if (a && b) segments.push({ start: [a.x, a.y], end: [b.x, b.y] });
      break;
    }
    case 'LWPOLYLINE':
    case 'POLYLINE': {
      const verts = (ent.vertices || []).map((v) => [v.x, v.y]);
      for (let i = 0; i < verts.length - 1; i++) {
        segments.push({ start: verts[i], end: verts[i + 1] });
      }
      if (isClosedPolyline(ent, verts) && verts.length > 2) {
        segments.push({ start: verts[verts.length - 1], end: verts[0] });
      }
      break;
    }
    case 'ARC': {
      const pts = arcToPolyline(ent);
      if (!pts) break;
      for (let i = 0; i < pts.length - 1; i++) {
        segments.push({ start: pts[i], end: pts[i + 1] });
      }
      break;
    }
    default:
      break;
  }
  return segments;
}

function polylineVertices(ent) {
  const verts = ent.vertices || [];
  if (verts.length < 3) return null;
  const pts = verts.map((v) => [v.x, v.y]);
  const closed = isClosedPolyline(ent, pts);
  if (!closed) return pts;
  if (distance(pts[0], pts[pts.length - 1]) >= 0.001) {
    pts.push([pts[0][0], pts[0][1]]);
  }
  return pts;
}

function circleToPolyline(cx, cy, r, segments = 32) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = (2 * Math.PI * i) / segments;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  pts.push([pts[0][0], pts[0][1]]);
  return pts;
}

function arcToPolyline(ent, segments = 24) {
  const { center, radius, startAngle, endAngle } = ent;
  // dxf-parser emits radians; accept degree values if magnitudes exceed one turn.
  let start = startAngle;
  let end = endAngle;
  if (Math.max(Math.abs(start), Math.abs(end)) > Math.PI * 2 + 0.01) {
    start = (startAngle * Math.PI) / 180;
    end = (endAngle * Math.PI) / 180;
  }
  if (end <= start) end += 2 * Math.PI;
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = start + ((end - start) * i) / segments;
    pts.push([center.x + radius * Math.cos(a), center.y + radius * Math.sin(a)]);
  }
  if (end - start > 2 * Math.PI - 0.01) {
    pts.push([pts[0][0], pts[0][1]]);
  }
  return pts.length >= 2 ? pts : null;
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function near(a, b, tol) {
  return distance(a, b) <= tol;
}

function singlePolyArea(pl) {
  if (pl.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < pl.length; i++) {
    const j = (i + 1) % pl.length;
    a += pl[i][0] * pl[j][1] - pl[j][0] * pl[i][1];
  }
  return Math.abs(a) / 2;
}

function polylineBbox(pl) {
  const xs = pl.map((p) => p[0]);
  const ys = pl.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/** Drop title-block noise and microscopic chains; keep cut profile + holes near the main part. */
function pruneNestPolylines(polylines) {
  const minArea = 0.005;
  const meta = polylines
    .map((pl) => {
      const bb = polylineBbox(pl);
      return {
        pl,
        area: singlePolyArea(pl),
        cx: (bb.minX + bb.maxX) / 2,
        cy: (bb.minY + bb.maxY) / 2,
        bb,
      };
    })
    .filter((m) => m.area >= minArea && Math.max(m.bb.width, m.bb.height) > 1e-6);

  if (!meta.length) return polylines;

  meta.sort((a, b) => b.area - a.area);
  const anchor = meta[0];
  const reach = Math.max(anchor.bb.width, anchor.bb.height, 0.25) * 4 + 1;

  const kept = meta.filter(
    (m) => Math.hypot(m.cx - anchor.cx, m.cy - anchor.cy) <= reach,
  );
  return kept.length ? kept.map((m) => m.pl) : polylines;
}

function buildClosedChains(segments, tol) {
  const used = new Set();
  const closed = [];

  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue;
    const chainPts = [[...segments[i].start], [...segments[i].end]];
    let head = [...segments[i].start];
    let tail = [...segments[i].end];
    used.add(i);

    let extended = true;
    while (extended) {
      extended = false;
      for (let j = 0; j < segments.length; j++) {
        if (used.has(j)) continue;
        const s = segments[j];
        if (near(tail, s.start, tol)) {
          chainPts.push([...s.end]);
          tail = [...s.end];
          used.add(j);
          extended = true;
          break;
        }
        if (near(tail, s.end, tol)) {
          chainPts.push([...s.start]);
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
          chainPts.unshift([...s.start]);
          head = [...s.start];
          used.add(j);
          extended = true;
          break;
        }
        if (near(head, s.start, tol)) {
          chainPts.unshift([...s.end]);
          head = [...s.end];
          used.add(j);
          extended = true;
          break;
        }
      }
    }

    if (near(head, tail, tol) && chainPts.length >= 3) {
      closed.push(chainPts);
    }
  }

  return closed;
}

/**
 * Export nested layout to DXF (R12 ASCII) for FlashCut import.
 */
export function exportNestedDxf(layout, options = {}) {
  const { sheetWidth, sheetHeight, includeSheetOutline = true, kerf = 0 } = options;
  const lines = [];

  lines.push('0', 'SECTION', '2', 'HEADER');
  lines.push('9', '$INSUNITS', '70', '1'); // inches
  lines.push('0', 'ENDSEC');
  lines.push('0', 'SECTION', '2', 'TABLES');
  lines.push('0', 'TABLE', '2', 'LAYER', '70', '3');
  lines.push('0', 'LAYER', '2', '0', '70', '0', '62', '7', '6', 'CONTINUOUS');
  lines.push('0', 'LAYER', '2', 'PARTS', '70', '0', '62', '1', '6', 'CONTINUOUS');
  lines.push('0', 'LAYER', '2', 'SHEET', '70', '0', '62', '3', '6', 'CONTINUOUS');
  lines.push('0', 'ENDTAB', '0', 'ENDSEC');
  lines.push('0', 'SECTION', '2', 'ENTITIES');

  if (includeSheetOutline && sheetWidth && sheetHeight) {
    addLwPoly(lines, 'SHEET', [
      [0, 0], [sheetWidth, 0], [sheetWidth, sheetHeight], [0, sheetHeight],
    ], true);
  }

  for (const placed of layout.placements) {
    const ox = placed.x;
    const oy = placed.y;
    const rot = placed.rotation || 0;
    for (const pl of placed.polylines) {
      const transformed = transformPolylineForExport(pl, ox, oy, rot);
      addLwPoly(lines, 'PARTS', transformed, true);
    }
  }

  lines.push('0', 'ENDSEC', '0', 'EOF');
  return lines.join('\n');
}

function addLwPoly(lines, layer, points, closed) {
  lines.push('0', 'LWPOLYLINE', '8', layer, '90', String(points.length), '70', closed ? '1' : '0');
  for (const [x, y] of points) {
    lines.push('10', w(x), '20', w(y));
  }
}

function w(n) {
  return n.toFixed(6).replace(/\.?0+$/, '') || '0';
}

function transformPolylineForExport(points, ox, oy, rotationDeg) {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return points.map(([x, y]) => [
    ox + x * cos - y * sin,
    oy + x * sin + y * cos,
  ]);
}

export function polylinesToSvg(polylines, transform = {}) {
  const { offsetX = 0, offsetY = 0, scale = 1, stroke = '#e74c3c', fill = 'none' } = transform;
  return polylines
    .map((pl) => {
      const pts = pl.map(([x, y]) => `${offsetX + x * scale},${offsetY + y * scale}`).join(' ');
      return `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="0.5" />`;
    })
    .join('\n');
}
