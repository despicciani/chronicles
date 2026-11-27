import React, { useEffect, useRef } from 'react';
import { TacticalMap } from '../shared/types';

interface MapWeatherCanvasProps {
  weather: Exclude<TacticalMap['weather'], 'none'>;
  width: number;
  height: number;
}

export const MapWeatherCanvas: React.FC<MapWeatherCanvasProps> = ({
  weather,
  width,
  height,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const MAX_CANVAS_DIM = 4096;
    const scaleX = Math.min(dpr, MAX_CANVAS_DIM / Math.max(1, width));
    const scaleY = Math.min(dpr, MAX_CANVAS_DIM / Math.max(1, height));
    const safeScale = Math.min(scaleX, scaleY);
    canvas.width = Math.max(1, Math.min(MAX_CANVAS_DIM, Math.floor(width * safeScale)));
    canvas.height = Math.max(1, Math.min(MAX_CANVAS_DIM, Math.floor(height * safeScale)));
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);

    const areaFactor = Math.max(0.5, Math.min(2.2, (width * height) / (1100 * 750)));
    let lastTime = performance.now();
    let rafId = 0;

    if (weather === 'rain') {
      const dropCount = Math.round(135 * areaFactor);
      const maxRipples = Math.round(28 * areaFactor);
      const makeDrop = (randomY: boolean) => {
        const layer: 0 | 1 = Math.random() < 0.58 ? 0 : 1;
        return {
          x: Math.random() * (width + 260) - 80,
          y: randomY ? Math.random() * height : -40 - Math.random() * 140,
          len: layer === 0 ? 14 + Math.random() * 10 : 22 + Math.random() * 16,
          speed: layer === 0 ? 480 + Math.random() * 180 : 760 + Math.random() * 240,
          wind: layer === 0 ? -115 - Math.random() * 25 : -175 - Math.random() * 35,
          alpha: layer === 0 ? 0.16 + Math.random() * 0.14 : 0.28 + Math.random() * 0.22,
          width: layer === 0 ? 0.85 : 1.3,
          layer,
        };
      };
      const drops = Array.from({ length: dropCount }, () => makeDrop(true));
      const ripples: Array<{
        x: number;
        y: number;
        radius: number;
        maxRadius: number;
        alpha: number;
        speed: number;
      }> = [];
      let lightningAlpha = 0;
      let nextLightningIn = 7 + Math.random() * 9;

      const tick = (now: number) => {
        const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(12, 24, 44, 0.14)';
        ctx.fillRect(0, 0, width, height);

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
          const p = r.radius / r.maxRadius;
          if (p >= 1) {
            ripples.splice(i, 1);
            continue;
          }
          ctx.strokeStyle = `rgba(186, 226, 255, ${(r.alpha * (1 - p)).toFixed(3)})`;
          ctx.beginPath();
          ctx.ellipse(r.x, r.y, r.radius, r.radius * 0.62, 0, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.lineCap = 'round';
        for (let i = 0; i < drops.length; i++) {
          const d = drops[i];
          d.x += d.wind * dt;
          d.y += d.speed * dt;
          if (d.y - d.len > height || d.x < -120) {
            drops[i] = makeDrop(false);
            continue;
          }
          const norm = Math.hypot(d.wind, d.speed) || 1;
          const tailX = d.x - (d.wind / norm) * d.len;
          const tailY = d.y - (d.speed / norm) * d.len;
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
    } else if (weather === 'embers') {
      const emberCount = Math.round(95 * areaFactor);
      const makeEmber = (randomY: boolean) => {
        const hot = Math.random() < 0.35;
        return {
          x: Math.random() * width,
          y: randomY ? Math.random() * height : height + 10 + Math.random() * 80,
          vy: -(24 + Math.random() * 58),
          vx: (Math.random() - 0.35) * 26,
          radius: hot ? 1.8 + Math.random() * 2.2 : 1.0 + Math.random() * 1.6,
          phase: Math.random() * Math.PI * 2,
          sway: 14 + Math.random() * 24,
          flickerSpeed: 3 + Math.random() * 5,
          alpha: 0.45 + Math.random() * 0.5,
          hot,
        };
      };
      const embers = Array.from({ length: emberCount }, () => makeEmber(true));
      let glowTime = 0;

      const tick = (now: number) => {
        const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;
        glowTime += dt;
        ctx.clearRect(0, 0, width, height);

        // Warm subtle firelight haze along the bottom edge
        const firePulse = 0.08 + Math.sin(glowTime * 2.4) * 0.025;
        const haze = ctx.createLinearGradient(0, height, 0, 0);
        haze.addColorStop(0, `rgba(180, 52, 12, ${(firePulse + 0.06).toFixed(3)})`);
        haze.addColorStop(0.55, `rgba(120, 34, 8, ${(firePulse * 0.5).toFixed(3)})`);
        haze.addColorStop(1, 'rgba(30, 10, 4, 0.04)');
        ctx.fillStyle = haze;
        ctx.fillRect(0, 0, width, height);

        for (let i = 0; i < embers.length; i++) {
          const e = embers[i];
          e.phase += dt * e.flickerSpeed;
          e.x += (e.vx + Math.sin(e.phase * 0.65) * e.sway) * dt;
          e.y += e.vy * dt;
          if (e.y < -20 || e.x < -40 || e.x > width + 40) {
            embers[i] = makeEmber(false);
            continue;
          }
          const flicker = 0.62 + 0.38 * Math.sin(e.phase);
          const a = e.alpha * flicker * Math.min(1, Math.max(0.15, e.y / (height * 0.35)));

          // Soft glowing halo
          const haloR = e.radius * 4.2;
          const halo = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, haloR);
          if (e.hot) {
            halo.addColorStop(0, `rgba(255, 244, 196, ${a.toFixed(3)})`);
            halo.addColorStop(0.35, `rgba(251, 146, 60, ${(a * 0.65).toFixed(3)})`);
            halo.addColorStop(1, 'rgba(239, 68, 68, 0)');
          } else {
            halo.addColorStop(0, `rgba(253, 186, 116, ${a.toFixed(3)})`);
            halo.addColorStop(0.45, `rgba(234, 88, 12, ${(a * 0.45).toFixed(3)})`);
            halo.addColorStop(1, 'rgba(185, 28, 28, 0)');
          }
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(e.x, e.y, haloR, 0, Math.PI * 2);
          ctx.fill();

          // Crisp hot ember core
          ctx.fillStyle = e.hot
            ? `rgba(255, 250, 224, ${Math.min(1, a * 1.15).toFixed(3)})`
            : `rgba(251, 146, 60, ${a.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.radius * 0.72, 0, Math.PI * 2);
          ctx.fill();
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    } else if (weather === 'snow') {
      const flakeCount = Math.round(115 * areaFactor);
      const makeFlake = (randomY: boolean) => {
        const depth = Math.random(); // 0 = far, 1 = close
        return {
          x: Math.random() * width,
          y: randomY ? Math.random() * height : -15 - Math.random() * 60,
          vy: 22 + depth * 56,
          vx: 8 + depth * 22,
          radius: 1.1 + depth * 2.5,
          phase: Math.random() * Math.PI * 2,
          sway: 12 + depth * 20,
          alpha: 0.25 + depth * 0.55,
        };
      };
      const flakes = Array.from({ length: flakeCount }, () => makeFlake(true));

      const tick = (now: number) => {
        const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;
        ctx.clearRect(0, 0, width, height);

        // Cool crisp frost tint
        ctx.fillStyle = 'rgba(186, 220, 255, 0.06)';
        ctx.fillRect(0, 0, width, height);

        for (let i = 0; i < flakes.length; i++) {
          const f = flakes[i];
          f.phase += dt * 1.4;
          f.x += (f.vx + Math.sin(f.phase) * f.sway) * dt;
          f.y += f.vy * dt;
          if (f.y > height + 16 || f.x > width + 24) {
            flakes[i] = makeFlake(false);
            if (flakes[i].x > width) flakes[i].x = Math.random() * width;
            continue;
          }
          const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius * 2.1);
          grad.addColorStop(0, `rgba(255, 255, 255, ${f.alpha.toFixed(3)})`);
          grad.addColorStop(0.55, `rgba(224, 242, 254, ${(f.alpha * 0.55).toFixed(3)})`);
          grad.addColorStop(1, 'rgba(224, 242, 254, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.radius * 2.1, 0, Math.PI * 2);
          ctx.fill();
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    } else if (weather === 'mist') {
      const cloudCount = Math.max(14, Math.round(22 * areaFactor));
      const clouds = Array.from({ length: cloudCount }, (_, idx) => {
        const dir = idx % 2 === 0 ? 1 : -1;
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          rx: 130 + Math.random() * 190,
          ry: 80 + Math.random() * 120,
          vx: dir * (7 + Math.random() * 14),
          vy: (Math.random() - 0.5) * 5,
          alpha: 0.06 + Math.random() * 0.07,
          phase: Math.random() * Math.PI * 2,
        };
      });

      const tick = (now: number) => {
        const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;
        ctx.clearRect(0, 0, width, height);

        // Moonlit misty ambient veil
        ctx.fillStyle = 'rgba(148, 163, 184, 0.09)';
        ctx.fillRect(0, 0, width, height);

        for (let i = 0; i < clouds.length; i++) {
          const c = clouds[i];
          c.phase += dt * 0.45;
          c.x += c.vx * dt;
          c.y += (c.vy + Math.sin(c.phase) * 3.5) * dt;
          if (c.x - c.rx > width) c.x = -c.rx;
          if (c.x + c.rx < 0) c.x = width + c.rx;
          if (c.y - c.ry > height) c.y = -c.ry;
          if (c.y + c.ry < 0) c.y = height + c.ry;

          ctx.save();
          ctx.translate(c.x, c.y);
          ctx.scale(1, c.ry / c.rx);
          const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, c.rx);
          grad.addColorStop(0, `rgba(226, 232, 240, ${c.alpha.toFixed(3)})`);
          grad.addColorStop(0.55, `rgba(203, 213, 225, ${(c.alpha * 0.45).toFixed(3)})`);
          grad.addColorStop(1, 'rgba(148, 163, 184, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, c.rx, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    }

    return () => cancelAnimationFrame(rafId);
  }, [weather, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="absolute inset-0 pointer-events-none z-25"
    />
  );
};
