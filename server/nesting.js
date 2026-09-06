/**
 * Bottom-left-fill nesting with 90° rotations.
 * Uses polygon bounding boxes + spacing (kerf/gap).
 */

function rotatePoint([x, y], deg) {
  const r = (deg * Math.PI) / 180;
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
}

function rotatePolyline(pl, deg) {
  return pl.map((p) => rotatePoint(p, deg));
}

function rotatePolylines(polylines, deg) {
  return polylines.map((pl) => rotatePolyline(pl, deg));
}

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

function translatePolylines(polylines, dx, dy) {
  return polylines.map((pl) => pl.map(([x, y]) => [x + dx, y + dy]));
}

function normalizePolylines(polylines) {
  const bb = bboxOfPolylines(polylines);
  return translatePolylines(polylines, -bb.minX, -bb.minY);
}

function rectsOverlap(a, b, gap) {
  return !(
    a.x + a.w + gap <= b.x ||
    b.x + b.w + gap <= a.x ||
    a.y + a.h + gap <= b.y ||
    b.y + b.h + gap <= a.y
  );
}

function polyBboxAt(polylines, x, y) {
  const moved = translatePolylines(polylines, x, y);
  const bb = bboxOfPolylines(moved);
  return { x: bb.minX, y: bb.minY, w: bb.width, h: bb.height };
}

function polyArea(polylines) {
  let area = 0;
  for (const pl of polylines) {
    let a = 0;
    for (let i = 0; i < pl.length; i++) {
      const j = (i + 1) % pl.length;
      a += pl[i][0] * pl[j][1] - pl[j][0] * pl[i][1];
    }
    area += Math.abs(a) / 2;
  }
  return area;
}

/**
 * @param {Array} parts - { id, name, polylines, qty }
 * @param {Object} sheet - { width, height }
 * @param {Object} options - { kerf, rotations }
 */
export function nestParts(parts, sheet, options = {}) {
  const kerf = options.kerf ?? 0.125;
  const rotations = options.rotations ?? [0, 90, 180, 270];
  const margin = options.margin ?? 0.25;

  const instances = [];
  for (const part of parts) {
    const qty = part.qty || 1;
    for (let i = 0; i < qty; i++) {
      instances.push({
        partId: part.id,
        name: part.name,
        polylines: part.polylines,
        instanceIndex: i,
      });
    }
  }

  // Sort largest first
  instances.sort((a, b) => polyArea(b.polylines) - polyArea(a.polylines));

  const placements = [];
  const placedRects = [];

  const usableW = sheet.width - 2 * margin;
  const usableH = sheet.height - 2 * margin;

  for (const inst of instances) {
    let best = null;
    let bestScore = Infinity;

    for (const rot of rotations) {
      const rotated = normalizePolylines(rotatePolylines(inst.polylines, rot));
      const bb = bboxOfPolylines(rotated);

      if (bb.width > usableW || bb.height > usableH) continue;

      // Grid search bottom-left positions
      const step = Math.max(0.25, Math.min(bb.width, bb.height) / 4);
      for (let y = margin; y + bb.height <= sheet.height - margin + 0.001; y += step) {
        for (let x = margin; x + bb.width <= sheet.width - margin + 0.001; x += step) {
          const rect = { x, y, w: bb.width, h: bb.height };
          let collision = false;
          for (const pr of placedRects) {
            if (rectsOverlap(rect, pr, kerf)) {
              collision = true;
              break;
            }
          }
          if (collision) continue;

          const score = y * 10000 + x;
          if (score < bestScore) {
            bestScore = score;
            best = { x, y, rotation: rot, polylines: rotated };
          }
        }
      }
    }

    if (!best) {
      return {
        success: false,
        error: `Could not place part "${inst.name}" on sheet`,
        placements,
      };
    }

    placements.push({
      partId: inst.partId,
      name: inst.name,
      x: best.x,
      y: best.y,
      rotation: best.rotation,
      polylines: best.polylines,
    });
    placedRects.push({ x: best.x, y: best.y, w: bboxOfPolylines(best.polylines).width, h: bboxOfPolylines(best.polylines).height });
  }

  const partArea = placements.reduce((s, p) => s + polyArea(p.polylines), 0);
  const sheetArea = sheet.width * sheet.height;
  const yieldPct = (partArea / sheetArea) * 100;
  const scrapPct = 100 - yieldPct;

  return {
    success: true,
    placements,
    yieldPct,
    scrapPct,
    sheet,
    kerf,
  };
}

export function nestPreviewSvg(result, sheet) {
  const scale = 4;
  const pad = 20;
  const w = sheet.width * scale + pad * 2;
  const h = sheet.height * scale + pad * 2;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" style="max-height:70vh;background:#1a1a2e">`;
  svg += `<rect x="${pad}" y="${pad}" width="${sheet.width * scale}" height="${sheet.height * scale}" fill="#2d2d44" stroke="#4a6fa5" stroke-width="2"/>`;

  const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
  result.placements.forEach((p, i) => {
    const color = colors[i % colors.length];
    for (const pl of p.polylines) {
      const pts = pl.map(([x, y]) => `${pad + (p.x + x) * scale},${pad + (p.y + y) * scale}`).join(' ');
      svg += `<polygon points="${pts}" fill="${color}33" stroke="${color}" stroke-width="1"/>`;
    }
  });
  svg += '</svg>';
  return svg;
}
