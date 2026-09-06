/** Client-side bbox collision helpers (mirrors server/nesting.js). */

function bboxOfPolylines(polylines) {
  const pts = polylines.flat();
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

export function placementBbox(placement) {
  const bb = bboxOfPolylines(placement.polylines);
  return { x: placement.x, y: placement.y, w: bb.width, h: bb.height };
}

function rectsOverlap(a, b, gap) {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

export function checkPlacementCollisions(placements, kerf) {
  const collisions = [];
  for (let i = 0; i < placements.length; i++) {
    for (let j = i + 1; j < placements.length; j++) {
      if (rectsOverlap(placementBbox(placements[i]), placementBbox(placements[j]), kerf)) {
        collisions.push({ a: i, b: j });
      }
    }
  }
  return collisions;
}

export function checkPlacementBounds(placement, sheet, margin = 0.25) {
  const bb = placementBbox(placement);
  return (
    bb.x >= margin &&
    bb.y >= margin &&
    bb.x + bb.w <= sheet.width - margin + 0.001 &&
    bb.y + bb.h <= sheet.height - margin + 0.001
  );
}

export function clampPlacement(placement, sheet, margin = 0.25) {
  const bb = placementBbox(placement);
  const maxX = sheet.width - margin - bb.w;
  const maxY = sheet.height - margin - bb.h;
  return {
    ...placement,
    x: Math.max(margin, Math.min(maxX, placement.x)),
    y: Math.max(margin, Math.min(maxY, placement.y)),
  };
}

export const PART_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
