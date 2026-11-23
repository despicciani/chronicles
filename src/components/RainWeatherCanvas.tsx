import React, { useEffect, useRef } from 'react';

interface RainWeatherCanvasProps {
  width: number;
  height: number;
}

interface RainDrop {
  x: number;
  y: number;
  len: number;
  speed: number;
  wind: number;
  alpha: number;
  width: number;
  layer: 0 | 1;
}

interface GroundRipple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  speed: number;
}

export const RainWeatherCanvas: React.FC<RainWeatherCanvasProps> = ({ width, height }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Cap internal resolution cleanly for crispness + high FPS on large maps
    const scale = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.floor(width * scale));
    canvas.height = Math.max(1, Math.floor(height * scale));
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    const areaFactor = Math.max(0.5, Math.min(2.2, (width * height) / (1100 * 750)));
    const dropCount = Math.round(135 * areaFactor);
    const maxRipples = Math.round(28 * areaFactor);

    const makeDrop = (randomY: boolean): RainDrop => {
      const layer: 0 | 1 = Math.random() < 0.58 ? 0 : 1;
      const speed = layer === 0 ? 480 + Math.random() * 180 : 760 + Math.random() * 240;
      return {
        x: Math.random() * (width + 260) - 80,
        y: randomY ? Math.random() * height : -40 - Math.random() * 140,
        len: layer === 0 ? 14 + Math.random() * 10 : 22 + Math.random() * 16,
        speed,
        wind: layer === 0 ? -115 - Math.random() * 25 : -175 - Math.random() * 35,
        alpha: layer === 0 ? 0.16 + Math.random() * 0.14 : 0.28 + Math.random() * 0.22,
        width: layer === 0 ? 0.85 : 1.3,
        layer,
      };
    };

    const drops: RainDrop[] = Array.from({ length: dropCount }, () => makeDrop(true));
    const ripples: GroundRipple[] = [];

    let lightningAlpha = 0;
    let nextLightningIn = 7 + Math.random() * 9;
    let lastTime = performance.now();
    let rafId = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      ctx.clearRect(0, 0, width, height);

      // 1. Subtle cool stormy wash & edge vignette
      ctx.fillStyle = 'rgba(12, 24, 44, 0.14)';
      ctx.fillRect(0, 0, width, height);

      // 2. Occasional soft distant lightning sheen
      nextLightningIn -= dt;
      if (nextLightningIn <= 0) {
        lightningAlpha = 0.09 + Math.random() * 0.06;
        nextLightningIn = 8 + Math.random() * 11;
      }
      if (lightningAlpha > 0.002) {
        ctx.fillStyle = `rgba(196, 224, 255, ${lightningAlpha.toFixed(3)})`;
        ctx.fillRect(0, 0, width, height);
        lightningAlpha *= Math.pow(0.04, dt);
      }

      // 3. Ground water ripples (splashes hitting stone/puddles)
      if (ripples.length < maxRipples && Math.random() < dt * 24 * areaFactor) {
        ripples.push({
          x: Math.random() * width,
          y: Math.random() * height,
          radius: 1.5,
          maxRadius: 7 + Math.random() * 9,
          alpha: 0.34 + Math.random() * 0.2,
          speed: 18 + Math.random() * 14,
        });
      }

      ctx.lineWidth = 1;
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.radius += r.speed * dt;
        const progress = r.radius / r.maxRadius;
        if (progress >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        const currentAlpha = r.alpha * (1 - progress);
        ctx.strokeStyle = `rgba(186, 226, 255, ${currentAlpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(r.x, r.y, r.radius, r.radius * 0.62, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 4. Two-layer slanted raindrops with soft tail & bright tip
      ctx.lineCap = 'round';
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        d.x += d.wind * dt;
        d.y += d.speed * dt;

        if (d.y - d.len > height || d.x < -120) {
          // Chance to spawn a ripple near where the drop landed
          if (ripples.length < maxRipples && d.layer === 1 && Math.random() < 0.25) {
            ripples.push({
              x: Math.max(8, Math.min(width - 8, d.x)),
              y: Math.max(8, Math.min(height - 8, Math.random() * height)),
              radius: 1.2,
              maxRadius: 6 + Math.random() * 7,
              alpha: 0.32,
              speed: 20,
            });
          }
          drops[i] = makeDrop(false);
          continue;
        }

        const norm = Math.hypot(d.wind, d.speed) || 1;
        const dx = (d.wind / norm) * d.len;
        const dy = (d.speed / norm) * d.len;
        const tailX = d.x - dx;
        const tailY = d.y - dy;

        const grad = ctx.createLinearGradient(tailX, tailY, d.x, d.y);
        grad.addColorStop(0, 'rgba(147, 197, 253, 0)');
        grad.addColorStop(0.7, `rgba(186, 226, 255, ${(d.alpha * 0.75).toFixed(3)})`);
        grad.addColorStop(1, `rgba(235, 248, 255, ${d.alpha.toFixed(3)})`);

        ctx.strokeStyle = grad;
        ctx.lineWidth = d.width;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(d.x, d.y);
        ctx.stroke();
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="absolute inset-0 pointer-events-none z-25"
    />
  );
};
