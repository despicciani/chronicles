import React, { useEffect, useRef } from 'react';
import { isPointInsideWallShape } from '../shared/rulesEngine';
import { TerrainCellKind, WallCellMeta } from '../shared/types';

export interface DynamicLightCircle {
  /** Center X in grid units (e.g. tok.x + tok.size / 2) */
  cx: number;
  /** Center Y in grid units */
  cy: number;
  /** Radius in grid squares */
  radiusSq: number;
  /** Optional tint color for subtle edge warmth/coolness */
  color?: string;
  /** Softness factor 0..1 (higher = softer feathered edge, great for immediate sight) */
  softEdge?: boolean;
}

interface DynamicDarknessCanvasProps {
  width: number;
  height: number;
  cellPx: number;
  gridWidth: number;
  gridHeight: number;
  terrain: Record<string, TerrainCellKind>;
  wallMeta?: Record<string, WallCellMeta>;
  lights: DynamicLightCircle[];
  isGm: boolean;
}

const RAY_COUNT = 144;

/**
 * Raycasts from (cx, cy) along angle (cos, sin) up to maxDist grid squares.
 * Respects exact sub-cell wall geometry (full, half, thin edge, center bar, diagonal, pillar)
 * and stops right past the front face of any wall/closed door so stonework catches warm torchlight.
 */
function castLightRay(
  terrain: Record<string, TerrainCellKind>,
  wallMeta: Record<string, WallCellMeta> | undefined,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  maxDist: number,
  gridWidth: number,
  gridHeight: number
): { x: number; y: number } {
  const stepSize = 0.06;
  let lastGx = Math.floor(cx);
  let lastGy = Math.floor(cy);

  for (let d = 0.04; d <= maxDist; d += stepSize) {
    const px = cx + dx * d;
    const py = cy + dy * d;
    if (px < 0 || py < 0 || px >= gridWidth || py >= gridHeight) {
      return { x: px, y: py };
    }
    const gx = Math.floor(px);
    const gy = Math.floor(py);

    // Diagonal corner pinch check: if two adjacent full walls seal the diagonal seam, stop here
    if (gx !== lastGx && gy !== lastGy) {
      const aKey = `${gx},${lastGy}`;
      const bKey = `${lastGx},${gy}`;
      const aFull = terrain[aKey] === 'wall' && (!wallMeta?.[aKey] || wallMeta[aKey].shape === 'full');
      const bFull = terrain[bKey] === 'wall' && (!wallMeta?.[bKey] || wallMeta[bKey].shape === 'full');
      if (aFull && bFull) {
        return { x: cx + dx * Math.max(0, d - stepSize), y: cy + dy * Math.max(0, d - stepSize) };
      }
    }

    const key = `${gx},${gy}`;
    if (terrain[key] === 'wall') {
      const shape = wallMeta?.[key]?.shape || 'full';
      const fx = px - gx;
      const fy = py - gy;
      if (isPointInsideWallShape(shape, fx, fy)) {
        // Gentle penetration onto the stone face so carved masonry illuminates cleanly
        const revealDepth = shape.startsWith('edge-') || shape.startsWith('bar-') ? 0.08 : 0.16;
        const wallRevealDist = Math.min(maxDist, d + revealDepth);
        return { x: cx + dx * wallRevealDist, y: cy + dy * wallRevealDist };
      }
    }
    lastGx = gx;
    lastGy = gy;
  }

  return { x: cx + dx * maxDist, y: cy + dy * maxDist };
}

export const DynamicDarknessCanvas: React.FC<DynamicDarknessCanvasProps> = ({
  width,
  height,
  cellPx,
  gridWidth,
  gridHeight,
  terrain,
  wallMeta,
  lights,
  isGm,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Cap backing canvas dimensions to 4096px so gigantic maps (up to 300x300) never exceed GPU texture limits
    const maxDim = Math.max(width, height, 1);
    const scale = Math.min(1, 4096 / maxDim);
    canvas.width = Math.max(1, Math.ceil(width * scale));
    canvas.height = Math.max(1, Math.ceil(height * scale));
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    ctx.clearRect(0, 0, width, height);

    // 1. Fill full-map darkness veil (pitch-black for players, translucent for GM)
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = isGm ? 'rgba(2, 3, 7, 0.54)' : 'rgba(2, 3, 7, 0.985)';
    ctx.fillRect(0, 0, width, height);

    // 2. Punch smooth, circular, feathered raycasted cutouts for every active light / sight source
    ctx.globalCompositeOperation = 'destination-out';
    for (const light of lights) {
      if (light.radiusSq <= 0) continue;
      const cxPx = light.cx * cellPx;
      const cyPx = light.cy * cellPx;
      const rPx = Math.max(cellPx * 0.5, light.radiusSq * cellPx);

      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < RAY_COUNT; i++) {
        const angle = (i / RAY_COUNT) * Math.PI * 2;
        const hit = castLightRay(
          terrain,
          wallMeta,
          light.cx,
          light.cy,
          Math.cos(angle),
          Math.sin(angle),
          light.radiusSq,
          gridWidth,
          gridHeight
        );
        const hx = hit.x * cellPx;
        const hy = hit.y * cellPx;
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.clip();

      const grad = ctx.createRadialGradient(cxPx, cyPx, rPx * 0.08, cxPx, cyPx, rPx);
      if (light.softEdge) {
        // Extra-smooth feathered vignette for personal immediate sight in pitch darkness
        grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
        grad.addColorStop(0.45, 'rgba(0, 0, 0, 0.92)');
        grad.addColorStop(0.75, 'rgba(0, 0, 0, 0.42)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      } else {
        grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
        grad.addColorStop(0.62, 'rgba(0, 0, 0, 0.96)');
        grad.addColorStop(0.84, 'rgba(0, 0, 0, 0.48)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      }

      ctx.fillStyle = grad;
      ctx.fillRect(cxPx - rPx, cyPx - rPx, rPx * 2, rPx * 2);
      ctx.restore();
    }

    ctx.globalCompositeOperation = 'source-over';
  }, [width, height, cellPx, gridWidth, gridHeight, terrain, wallMeta, lights, isGm]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-16"
      style={{ width, height }}
    />
  );
};

interface FogOfWarCanvasProps {
  width: number;
  height: number;
  cellPx: number;
  revealedCells: string[];
  isGm: boolean;
}

/**
 * High-performance single-canvas Fog of War renderer.
 * Supports gigantic grids up to 300x300 (90,000 cells) at 60 FPS without spawning DOM nodes.
 */
export const FogOfWarCanvas: React.FC<FogOfWarCanvasProps> = ({
  width,
  height,
  cellPx,
  revealedCells,
  isGm,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0 || cellPx <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const maxDim = Math.max(width, height, 1);
    const scale = Math.min(1, 4096 / maxDim);
    canvas.width = Math.max(1, Math.ceil(width * scale));
    canvas.height = Math.max(1, Math.ceil(height * scale));
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = isGm ? 'rgba(5, 7, 12, 0.58)' : 'rgba(5, 7, 12, 0.96)';
    ctx.fillRect(0, 0, width, height);

    const pad = 0.5 / Math.max(scale, 0.25);
    for (let i = 0; i < revealedCells.length; i++) {
      const key = revealedCells[i];
      const comma = key.indexOf(',');
      if (comma <= 0) continue;
      const gx = Number(key.slice(0, comma));
      const gy = Number(key.slice(comma + 1));
      if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue;
      ctx.clearRect(gx * cellPx - pad, gy * cellPx - pad, cellPx + pad * 2, cellPx + pad * 2);
    }
  }, [width, height, cellPx, revealedCells, isGm]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-26"
      style={{ width, height }}
    />
  );
};
