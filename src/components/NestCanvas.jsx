import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PART_COLORS,
  checkPlacementBounds,
  checkPlacementCollisions,
  clampPlacement,
} from '../utils/nestGeometry';

const MARGIN = 0.25;
const FIT_PAD = 0.75;
const GRID_ZOOM_THRESHOLD = 1.05;

function clientPointToSheet(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM()?.inverse();
  if (!ctm) return { x: 0, y: 0 };
  const { x, y } = pt.matrixTransform(ctm);
  return { x, y };
}

export default function NestCanvas({
  sheet,
  placements = [],
  kerf = 0.125,
  onPlacementsChange,
  loading = false,
}) {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState(null);
  const [size, setSize] = useState({ w: 400, h: 280 });

  const collisions = checkPlacementCollisions(placements, kerf);
  const collisionSet = new Set();
  for (const { a, b } of collisions) {
    collisionSet.add(a);
    collisionSet.add(b);
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sheetW = sheet?.width ?? 1;
  const sheetH = sheet?.height ?? 1;
  const viewW = sheetW + FIT_PAD * 2;
  const viewH = sheetH + FIT_PAD * 2;
  const fitScale = Math.min(size.w / viewW, size.h / viewH);
  const scale = fitScale * zoom;

  const fitToView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const zoomBy = useCallback((factor) => {
    setZoom((z) => Math.min(8, Math.max(0.25, z * factor)));
  }, []);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    zoomBy(factor);
  }, [zoomBy]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  const onPointerDown = (e, index) => {
    if (!onPlacementsChange) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = clientPointToSheet(svgRef.current, e.clientX, e.clientY);
    const placement = placements[index];
    setDrag({
      index,
      offsetX: pt.x - placement.x,
      offsetY: pt.y - placement.y,
    });
  };

  const onPointerMove = (e) => {
    if (!drag || !onPlacementsChange) return;
    const pt = clientPointToSheet(svgRef.current, e.clientX, e.clientY);
    const next = placements.map((p, i) => {
      if (i !== drag.index) return p;
      return clampPlacement(
        { ...p, x: pt.x - drag.offsetX, y: pt.y - drag.offsetY },
        sheet,
        MARGIN,
      );
    });
    onPlacementsChange(next);
  };

  const onPointerUp = () => setDrag(null);

  const showGrid = zoom >= GRID_ZOOM_THRESHOLD;
  const gridLines = [];
  if (showGrid && sheet) {
    for (let x = 0; x <= sheetW; x += 1) {
      gridLines.push({ type: 'v', x });
    }
    for (let y = 0; y <= sheetH; y += 1) {
      gridLines.push({ type: 'h', y });
    }
  }

  const tx = pan.x;
  const ty = pan.y;
  const svgW = viewW * scale;
  const svgH = viewH * scale;

  return (
    <div className="nest-canvas-wrap">
      <div className="nest-canvas-toolbar">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => zoomBy(1.25)} title="Zoom in">+</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => zoomBy(0.8)} title="Zoom out">−</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={fitToView} title="Fit sheet">Fit</button>
        <span className="nest-canvas-zoom muted-line">{Math.round(zoom * 100)}%</span>
        {loading && <span className="muted-line">Updating…</span>}
      </div>

      <div
        ref={containerRef}
        className={`nest-canvas-viewport${drag ? ' dragging' : ''}`}
      >
        <svg
          ref={svgRef}
          className="nest-canvas-svg"
          width={svgW}
          height={svgH}
          viewBox={`${-FIT_PAD} ${-FIT_PAD} ${viewW} ${viewH}`}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <g transform={`translate(${tx / scale}, ${ty / scale})`}>
            {showGrid && (
              <g className="nest-grid" pointerEvents="none">
                {gridLines.map((line, i) =>
                  line.type === 'v' ? (
                    <line key={`v${i}`} x1={line.x} y1={0} x2={line.x} y2={sheetH} />
                  ) : (
                    <line key={`h${i}`} x1={0} y1={line.y} x2={sheetW} y2={line.y} />
                  ),
                )}
              </g>
            )}

            <rect
              x={0}
              y={0}
              width={sheetW}
              height={sheetH}
              className="nest-sheet-rect"
              pointerEvents="none"
            />

            {placements.map((p, i) => {
              const color = PART_COLORS[i % PART_COLORS.length];
              const colliding = collisionSet.has(i);
              const outOfBounds = !checkPlacementBounds(p, sheet, MARGIN);
              const stroke = colliding || outOfBounds ? '#f39c12' : color;
              const fill = colliding || outOfBounds ? '#f39c1244' : `${color}33`;
              return (
                <g
                  key={`${p.partId}-${p.instanceIndex ?? i}-${i}`}
                  className="nest-part"
                  style={{ cursor: onPlacementsChange ? 'grab' : 'default' }}
                  onPointerDown={(e) => onPointerDown(e, i)}
                >
                  {p.polylines.map((pl, pi) => {
                    const pts = pl.map(([x, y]) => `${p.x + x},${p.y + y}`).join(' ');
                    return (
                      <polygon
                        key={pi}
                        points={pts}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth={colliding || outOfBounds ? 0.08 : 0.05}
                      />
                    );
                  })}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {(collisions.length > 0) && (
        <div className="alert alert-warn nest-canvas-warn">
          Parts overlap — drag to separate before sending to outbox.
        </div>
      )}
    </div>
  );
}
