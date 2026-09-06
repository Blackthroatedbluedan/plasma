/**
 * DXF parsing utilities — extract closed polylines for nesting.
 */
import DxfParser from 'dxf-parser';

const INCH_UNITS = [1, 4, 5, 6]; // inches or unitless treated as inches

export function parseDxf(content) {
  const parser = new DxfParser();
  const dxf = parser.parseSync(content);
  const entities = dxf?.entities || [];
  const polylines = [];

  for (const ent of entities) {
    const pl = entityToPolyline(ent);
    if (pl && pl.length >= 3) polylines.push(pl);
  }

  if (polylines.length === 0) {
    throw new Error('No usable closed geometry found in DXF (lines, polylines, circles, arcs)');
  }

  const allPoints = polylines.flat();
  const minX = Math.min(...allPoints.map((p) => p[0]));
  const minY = Math.min(...allPoints.map((p) => p[1]));
  const maxX = Math.max(...allPoints.map((p) => p[0]));
  const maxY = Math.max(...allPoints.map((p) => p[1]));

  // Normalize to origin
  const normalized = polylines.map((pl) =>
    pl.map(([x, y]) => [x - minX, y - minY])
  );

  return {
    polylines: normalized,
    bbox: { width: maxX - minX, height: maxY - minY },
    units: dxf.header?.$INSUNITS ?? 0,
  };
}

function entityToPolyline(ent) {
  switch (ent.type) {
    case 'LINE':
      return null; // open — skip unless part of polyline
    case 'LWPOLYLINE':
    case 'POLYLINE':
      return polylineVertices(ent);
    case 'CIRCLE':
      return circleToPolyline(ent.center.x, ent.center.y, ent.radius, 32);
    case 'ARC':
      return arcToPolyline(ent);
    default:
      return null;
  }
}

function polylineVertices(ent) {
  const verts = ent.vertices || [];
  if (verts.length < 3) return null;
  const pts = verts.map((v) => [v.x, v.y]);
  const closed = ent.shape || ent.closed || distance(pts[0], pts[pts.length - 1]) < 0.001;
  if (!closed && verts.length >= 3) {
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
  return pts;
}

function arcToPolyline(ent, segments = 24) {
  const { center, radius, startAngle, endAngle } = ent;
  const start = (startAngle * Math.PI) / 180;
  let end = (endAngle * Math.PI) / 180;
  if (end <= start) end += 2 * Math.PI;
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = start + ((end - start) * i) / segments;
    pts.push([center.x + radius * Math.cos(a), center.y + radius * Math.sin(a)]);
  }
  // Close if nearly full circle
  if (end - start > 2 * Math.PI - 0.01) {
    pts.push([pts[0][0], pts[0][1]]);
  }
  return pts.length >= 3 ? pts : null;
}

function distance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/**
 * Export nested layout to DXF (R12 ASCII) for FlashCut import.
 */
export function exportNestedDxf(layout, options = {}) {
  const { sheetWidth, sheetHeight, includeSheetOutline = true, kerf = 0 } = options;
  const lines = [];
  let y = 0;

  const w = (n) => n.toFixed(6).replace(/\.?0+$/, '') || '0';

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
      const transformed = transformPolyline(pl, ox, oy, rot);
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

function transformPolyline(points, ox, oy, rotationDeg) {
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
