import React, { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { CutInCinematicEvent, CutInStylePreset } from '../shared/types';
import { TokenPortrait } from './TokenPortrait';

interface UltimateCutInOverlayProps {
  event: CutInCinematicEvent;
  resolvedPortraitUrl: string;
  onDismiss: () => void;
}

interface CanvasParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  isWhite: boolean;
  rotation?: number;
  vRot?: number;
  isShard?: boolean;
}

interface ShockRing {
  radius: number;
  maxRadius: number;
  alpha: number;
  width: number;
}

/**
 * Ensures dark/black technique colors (like #000000 abyssal themes) still produce
 * razor-sharp luminous rims, lightning, shockwaves, and readable eyebrow badges
 * while preserving the dark core aesthetic.
 */
function resolveGlowColor(hexInput: string): { core: string; glow: string; isDarkTheme: boolean } {
  const clean = (hexInput || '#38bdf8').trim();
  const match = clean.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return { core: clean, glow: clean, isDarkTheme: false };
  const r = parseInt(match[1], 16);
  const g = parseInt(match[2], 16);
  const b = parseInt(match[3], 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  if (lum >= 68) {
    return {
      core: `#${match[1]}${match[2]}${match[3]}`,
      glow: `#${match[1]}${match[2]}${match[3]}`,
      isDarkTheme: false,
    };
  }
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  // Pure/neutral dark (black / charcoal) -> crisp lunar-silver edge glow for abyssal anime contrast
  if (maxC - minC < 18) {
    return { core: `#${match[1]}${match[2]}${match[3]}`, glow: '#e2e8f0', isDarkTheme: true };
  }
  // Tinted dark (e.g. dark crimson / dark violet) -> boost brightness preserving hue
  const scale = 210 / Math.max(1, maxC);
  const nr = Math.min(255, Math.round(r * scale + 24));
  const ng = Math.min(255, Math.round(g * scale + 24));
  const nb = Math.min(255, Math.round(b * scale + 24));
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return {
    core: `#${match[1]}${match[2]}${match[3]}`,
    glow: `#${toHex(nr)}${toHex(ng)}${toHex(nb)}`,
    isDarkTheme: true,
  };
}

const CENTERED_STYLES = new Set<CutInStylePreset>([
  'dimension-rift',
  'blood-eclipse',
  'divine-judgment',
  'shattered-mirror',
]);

export const UltimateCutInOverlay: React.FC<UltimateCutInOverlayProps> = ({
  event,
  resolvedPortraitUrl,
  onDismiss,
}) => {
  const [phase, setPhase] = useState<'riser' | 'impact' | 'hold' | 'exit'>('riser');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef<'riser' | 'impact' | 'hold' | 'exit'>('riser');
  phaseRef.current = phase;

  const palette = resolveGlowColor(event.color || '#38bdf8');
  const accent = palette.glow;
  const coreColor = palette.core;
  const style: CutInStylePreset =
    event.style ||
    (event.kind === 'domain' || event.kind === 'domain-clash'
      ? 'dimension-rift'
      : event.kind === 'transform'
        ? 'persona-slash'
        : 'anime-impact');
  const isCentered = CENTERED_STYLES.has(style);

  const eyebrow =
    event.kind === 'domain-clash'
      ? 'CONFRONTO DE DOMÍNIOS!'
      : event.kind === 'domain'
        ? 'EXPANSÃO DE DOMÍNIO'
        : event.kind === 'transform'
          ? 'TRANSFORMAÇÃO'
          : 'TÉCNICA SUPREMA';

  // 3-Beat Cinema Timing synced with soundEngine.playUltimateSfx (Drop hits at 460ms!)
  useEffect(() => {
    setPhase('riser');
    const tImpact = window.setTimeout(() => setPhase('impact'), 440);
    const tHold = window.setTimeout(() => setPhase('hold'), 575);
    const tExit = window.setTimeout(() => setPhase('exit'), 2750);
    return () => {
      window.clearTimeout(tImpact);
      window.clearTimeout(tHold);
      window.clearTimeout(tExit);
    };
  }, [event.id]);

  // 60FPS Kinetic Anime VFX Canvas tailored per visual style
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
      canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const w = () => window.innerWidth;
    const h = () => window.innerHeight;
    const particles: CanvasParticle[] = [];
    const rings: ShockRing[] = [];
    let burstFired = false;
    const startTs = performance.now();

    // Seed initial charging motes pulled inward during riser
    for (let i = 0; i < 68; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 160 + Math.random() * Math.max(w(), h()) * 0.55;
      particles.push({
        x: w() * (isCentered ? 0.5 : 0.42) + Math.cos(ang) * dist,
        y: h() * 0.5 + Math.sin(ang) * dist,
        vx: -Math.cos(ang) * (7 + Math.random() * 10),
        vy: -Math.sin(ang) * (7 + Math.random() * 10),
        size: 1.6 + Math.random() * 3.4,
        alpha: 0.45 + Math.random() * 0.55,
        life: 0,
        maxLife: 40 + Math.random() * 45,
        isWhite: Math.random() < 0.35,
      });
    }

    const spawnBurst = () => {
      const cx = w() * (isCentered ? 0.5 : 0.36);
      const cy = h() * (isCentered ? 0.44 : 0.5);
      rings.push(
        { radius: 24, maxRadius: Math.max(w(), h()) * 0.92, alpha: 0.95, width: 10 },
        { radius: 10, maxRadius: Math.max(w(), h()) * 0.65, alpha: 0.8, width: 4 }
      );
      if (style === 'shattered-mirror') {
        rings.push({ radius: 4, maxRadius: Math.max(w(), h()) * 0.48, alpha: 0.9, width: 2.5 });
      }
      const count = style === 'shattered-mirror' ? 75 : style === 'storm-overdrive' ? 130 : 110;
      for (let i = 0; i < count; i++) {
        const ang =
          style === 'persona-slash'
            ? -0.18 + (Math.random() - 0.5) * 0.55 + (Math.random() < 0.5 ? 0 : Math.PI)
            : Math.random() * Math.PI * 2;
        const speed =
          style === 'shattered-mirror'
            ? 5 + Math.random() * 16
            : style === 'blood-eclipse'
              ? 4 + Math.random() * 18
              : 10 + Math.random() * 28;
        particles.push({
          x: cx + (Math.random() - 0.5) * 60,
          y: cy + (Math.random() - 0.5) * 60,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed,
          size: style === 'shattered-mirror' ? 6 + Math.random() * 14 : 2 + Math.random() * 5,
          alpha: 0.85 + Math.random() * 0.15,
          life: 0,
          maxLife: style === 'shattered-mirror' ? 75 + Math.random() * 70 : 45 + Math.random() * 65,
          isWhite: Math.random() < 0.42,
          rotation: Math.random() * Math.PI * 2,
          vRot: (Math.random() - 0.5) * 0.16,
          isShard: style === 'shattered-mirror',
        });
      }
    };

    const drawLightningBolt = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      jitter: number,
      color: string,
      width: number,
      branch = false
    ) => {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      const segs = 8;
      let midX = (x1 + x2) / 2;
      let midY = (y1 + y2) / 2;
      for (let i = 1; i < segs; i++) {
        const t = i / segs;
        const px = x1 + (x2 - x1) * t + (Math.random() - 0.5) * jitter;
        const py = y1 + (y2 - y1) * t + (Math.random() - 0.5) * jitter;
        if (i === 4) {
          midX = px;
          midY = py;
        }
        ctx.lineTo(px, py);
      }
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 18;
      ctx.stroke();
      ctx.restore();

      if (branch && Math.random() < 0.65) {
        const bAng = Math.atan2(y2 - y1, x2 - x1) + (Math.random() < 0.5 ? 0.55 : -0.55);
        const bLen = Math.hypot(x2 - x1, y2 - y1) * 0.42;
        drawLightningBolt(
          midX,
          midY,
          midX + Math.cos(bAng) * bLen,
          midY + Math.sin(bAng) * bLen,
          jitter * 0.6,
          color,
          Math.max(1, width * 0.55),
          false
        );
      }
    };

    let lastTs = startTs;
    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;
      const step = dt * 60;
      const cw = w();
      const ch = h();
      const elapsed = now - startTs;
      const curPhase = phaseRef.current;

      ctx.clearRect(0, 0, cw, ch);

      if (!burstFired && (curPhase === 'impact' || curPhase === 'hold')) {
        burstFired = true;
        spawnBurst();
      }

      // STYLE-SPECIFIC AMBIENT CANVAS ENERGY
      if (curPhase === 'hold' || curPhase === 'impact') {
        if (style === 'divine-judgment') {
          // Vertical radiant light pillars pulsing gently
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const pillars = [0.16, 0.32, 0.5, 0.68, 0.84];
          pillars.forEach((px, idx) => {
            const pulse = 0.55 + 0.45 * Math.sin(elapsed * 0.005 + idx * 1.3);
            const bw = (idx === 2 ? 170 : 72) * (curPhase === 'impact' ? 1.5 : 1);
            const grad = ctx.createLinearGradient(cw * px - bw / 2, 0, cw * px + bw / 2, 0);
            grad.addColorStop(0, 'transparent');
            grad.addColorStop(0.5, `${accent}${idx === 2 ? '48' : '26'}`);
            grad.addColorStop(1, 'transparent');
            ctx.globalAlpha = pulse;
            ctx.fillStyle = grad;
            ctx.fillRect(cw * px - bw / 2, 0, bw, ch);
          });
          ctx.restore();
        } else if (style === 'blood-eclipse') {
          // Pulsing Eclipse Corona Halo Rings behind center
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          const cx = cw * 0.5;
          const cy = ch * 0.36;
          const baseR = Math.min(cw, ch) * 0.22;
          for (let k = 0; k < 3; k++) {
            const rad = baseR + k * 14 + Math.sin(elapsed * 0.008 + k) * 6;
            ctx.beginPath();
            ctx.arc(cx, cy, rad, 0, Math.PI * 2);
            ctx.strokeStyle = k === 0 ? '#ffffffaa' : `${accent}88`;
            ctx.lineWidth = k === 0 ? 3 : 6 - k * 1.5;
            ctx.shadowColor = accent;
            ctx.shadowBlur = 28;
            ctx.stroke();
          }
          ctx.restore();
        } else if (style !== 'shattered-mirror') {
          // Live pulsing frequency waveform across viewport (Anime, Persona, Rift, Storm)
          const waveY = ch * 0.52;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          for (let layer = 0; layer < 2; layer++) {
            ctx.beginPath();
            const amp =
              (curPhase === 'impact' ? 75 : style === 'storm-overdrive' ? 48 : 32) *
              (layer === 0 ? 1 : 0.55);
            const freq = layer === 0 ? 0.011 : 0.019;
            const speed = layer === 0 ? 0.012 : -0.017;
            for (let x = 0; x <= cw; x += 14) {
              const env = Math.sin((x / cw) * Math.PI);
              const y =
                waveY +
                Math.sin(x * freq + elapsed * speed) * amp * env +
                Math.cos(x * freq * 2.1 - elapsed * speed * 1.4) * (amp * 0.35) * env;
              if (x === 0) ctx.moveTo(x, y);
              else ctx.lineTo(x, y);
            }
            ctx.strokeStyle = layer === 0 ? `${accent}99` : '#ffffff88';
            ctx.lineWidth = layer === 0 ? 3 : 1.5;
            ctx.shadowColor = accent;
            ctx.shadowBlur = 18;
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // Crackling Lightning Arcs (Relentless in storm-overdrive, dramatic bursts in others)
      const lightningChance =
        style === 'storm-overdrive'
          ? curPhase === 'impact'
            ? 1
            : 0.72
          : style === 'divine-judgment' || style === 'blood-eclipse'
            ? curPhase === 'impact'
              ? 0.45
              : 0.06
            : curPhase === 'impact'
              ? 0.85
              : 0.22;

      const effLightningChance = 1 - Math.pow(1 - lightningChance, step);
      if ((curPhase === 'impact' || curPhase === 'hold') && Math.random() < effLightningChance) {
        const boltCount = style === 'storm-overdrive' ? 3 : 1;
        for (let b = 0; b < boltCount; b++) {
          if (style === 'storm-overdrive' && b > 0) {
            // Edge-to-edge full-screen plasma lightning
            const startY = ch * (0.12 + Math.random() * 0.76);
            const endY = ch * (0.12 + Math.random() * 0.76);
            drawLightningBolt(
              Math.random() < 0.5 ? 0 : cw,
              startY,
              Math.random() < 0.5 ? cw : 0,
              endY,
              64,
              Math.random() < 0.45 ? '#ffffff' : accent,
              curPhase === 'impact' ? 3.8 : 2.4,
              true
            );
          } else {
            const cx = cw * (isCentered ? 0.5 : 0.36);
            const cy = ch * (isCentered ? 0.42 : 0.5);
            const ang = Math.random() * Math.PI * 2;
            const len = 180 + Math.random() * Math.max(cw, ch) * 0.48;
            drawLightningBolt(
              cx,
              cy,
              cx + Math.cos(ang) * len,
              cy + Math.sin(ang) * len,
              46,
              Math.random() < 0.4 ? '#ffffff' : accent,
              curPhase === 'impact' ? 3.4 : 1.9,
              style === 'storm-overdrive'
            );
          }
        }
      }

      // Expanding Shockwave Rings
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const ringAlphaDamp = Math.pow(0.91, step);
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.radius += ((r.maxRadius - r.radius) * 0.12 + 12) * step;
        r.alpha *= ringAlphaDamp;
        if (r.alpha < 0.02) {
          rings.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.arc(
          cw * (isCentered ? 0.5 : 0.36),
          ch * (isCentered ? 0.44 : 0.5),
          r.radius,
          0,
          Math.PI * 2
        );
        ctx.strokeStyle = accent;
        ctx.globalAlpha = r.alpha;
        ctx.lineWidth = r.width;
        ctx.shadowColor = accent;
        ctx.shadowBlur = 24;
        ctx.stroke();
      }
      ctx.restore();

      // Particles, Rising Embers, Angelic Motes & Mirror Glass Shards
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (curPhase === 'hold' && particles.length < 98) {
        if (style === 'blood-eclipse') {
          // Rising dark-inferno embers floating up from the bottom
          particles.push({
            x: Math.random() * cw,
            y: ch + 10,
            vx: (Math.random() - 0.5) * 3.5,
            vy: -(4 + Math.random() * 7),
            size: 2 + Math.random() * 4,
            alpha: 0.85,
            life: 0,
            maxLife: 70 + Math.random() * 50,
            isWhite: Math.random() < 0.22,
          });
        } else if (style === 'divine-judgment') {
          // Ascending celestial starlight motes
          particles.push({
            x: Math.random() * cw,
            y: ch + 8,
            vx: (Math.random() - 0.5) * 1.4,
            vy: -(2.5 + Math.random() * 5),
            size: 2.2 + Math.random() * 4.2,
            alpha: 0.9,
            life: 0,
            maxLife: 80 + Math.random() * 55,
            isWhite: Math.random() < 0.58,
          });
        } else if (style === 'shattered-mirror') {
          // Slowly drifting polygonal glass shards (Time-Stop feel)
          const ang = Math.random() * Math.PI * 2;
          particles.push({
            x: cw * 0.5 + (Math.random() - 0.5) * cw * 0.8,
            y: ch * 0.5 + (Math.random() - 0.5) * ch * 0.7,
            vx: Math.cos(ang) * (0.8 + Math.random() * 1.8),
            vy: Math.sin(ang) * (0.8 + Math.random() * 1.8),
            size: 5 + Math.random() * 11,
            alpha: 0.65,
            life: 0,
            maxLife: 90 + Math.random() * 60,
            isWhite: Math.random() < 0.5,
            rotation: Math.random() * Math.PI * 2,
            vRot: (Math.random() - 0.5) * 0.04,
            isShard: true,
          });
        } else {
          const fromLeft = style === 'persona-slash' || style === 'storm-overdrive';
          particles.push({
            x: fromLeft ? -20 : Math.random() * cw,
            y: Math.random() * ch,
            vx: fromLeft ? 18 + Math.random() * 22 : (Math.random() - 0.5) * 6,
            vy: fromLeft ? -(2 + Math.random() * 4) : -(2 + Math.random() * 5),
            size: 1.5 + Math.random() * 3,
            alpha: 0.75,
            life: 0,
            maxLife: 45 + Math.random() * 40,
            isWhite: Math.random() < 0.3,
          });
        }
      }

      const baseDrag =
        style === 'shattered-mirror'
          ? 0.93
          : style === 'blood-eclipse' || style === 'divine-judgment'
            ? 0.99
            : 0.965;
      const effDrag = Math.pow(baseDrag, step);
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * step;
        p.y += p.vy * step;
        if (curPhase === 'hold') {
          p.vx *= effDrag;
          p.vy *= effDrag;
        }
        if (p.rotation !== undefined && p.vRot !== undefined) {
          p.rotation += p.vRot * step;
        }
        p.life += step;
        const fade = Math.max(0, 1 - p.life / p.maxLife);
        if (fade <= 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = p.alpha * fade;
        if (p.isShard) {
          // Prismatic Glass Triangle Shard
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation || 0);
          ctx.beginPath();
          ctx.moveTo(0, -p.size);
          ctx.lineTo(p.size * 0.72, p.size * 0.55);
          ctx.lineTo(-p.size * 0.65, p.size * 0.8);
          ctx.closePath();
          ctx.fillStyle = p.isWhite ? 'rgba(255,255,255,0.28)' : `${accent}44`;
          ctx.strokeStyle = p.isWhite ? '#ffffff' : accent;
          ctx.lineWidth = 1.4;
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        } else {
          ctx.strokeStyle = p.isWhite ? '#ffffff' : accent;
          ctx.lineWidth = p.size;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2);
          ctx.stroke();
        }
      }
      ctx.restore();

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [accent, event.id, isCentered, style]);

  const isImpact = phase === 'impact';
  const isRiser = phase === 'riser';
  const isExit = phase === 'exit';

  // Choose portrait clip-path & dimensions per style so square portraits ALWAYS look handcrafted
  const portraitClipPath = (() => {
    switch (style) {
      case 'dimension-rift':
        return 'polygon(22% 0%, 78% 0%, 100% 22%, 100% 78%, 78% 100%, 22% 100%, 0% 78%, 0% 22%)';
      case 'blood-eclipse':
        return 'circle(49% at 50% 50%)';
      case 'divine-judgment':
        return 'polygon(50% 0%, 92% 16%, 96% 84%, 50% 100%, 4% 84%, 8% 16%)';
      case 'shattered-mirror':
        return 'polygon(50% 0%, 96% 25%, 96% 75%, 50% 100%, 4% 75%, 4% 25%)';
      case 'storm-overdrive':
        return 'polygon(12% 0%, 100% 4%, 88% 100%, 0% 96%)';
      case 'persona-slash':
        return 'polygon(14% 0%, 100% 0%, 86% 100%, 0% 100%)';
      case 'anime-impact':
      default:
        return 'polygon(7% 0%, 100% 0%, 93% 100%, 0% 100%)';
    }
  })();

  return (
    <div
      data-modal-overlay="true"
      data-sub-overlay="true"
      onClick={onDismiss}
      className={`fixed inset-0 z-[94] pointer-events-auto cursor-pointer overflow-hidden select-none transition-opacity duration-450 ${
        isExit ? 'opacity-0' : 'opacity-100'
      }`}
      style={{
        backgroundColor: isImpact ? '#ffffff' : '#04050a',
        backgroundImage: isImpact
          ? 'none'
          : style === 'divine-judgment'
            ? `radial-gradient(ellipse at 50% 22%, ${accent}42 0%, rgba(12,11,18,0.97) 58%, #04050a 100%)`
            : style === 'blood-eclipse'
              ? `radial-gradient(circle at 50% 36%, ${accent}38 0%, rgba(8,3,6,0.98) 46%, #020204 100%)`
              : `radial-gradient(ellipse at ${isCentered ? '50%' : '36%'} 50%, ${accent}30 0%, rgba(5,7,14,0.98) 54%, #020307 100%)`,
      }}
      title="Clique ou pressione Esc para fechar"
    >
      {/* 60FPS Live Energy / Soundwave / Lightning / Shards Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{
          filter: isImpact ? 'invert(1) contrast(2.4)' : undefined,
        }}
      />

      {/* STYLE: DIMENSION RIFT CRACKS & ARCANE SEAL */}
      {style === 'dimension-rift' && !isRiser && (
        <svg
          viewBox="0 0 1600 900"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none animate-rift-crack"
        >
          <defs>
            <filter id="riftGlow">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g stroke={isImpact ? '#05070d' : accent} fill="none" filter="url(#riftGlow)">
            <polyline points="800,450 690,340 520,310 300,150 90,60" strokeWidth="6" />
            <polyline points="800,450 920,320 1140,260 1380,140 1560,40" strokeWidth="6" />
            <polyline points="800,450 660,560 440,630 220,760 40,870" strokeWidth="5.5" />
            <polyline points="800,450 950,580 1180,660 1410,790 1580,860" strokeWidth="5.5" />
            <polyline points="800,450 780,250 830,110 790,0" strokeWidth="4" opacity="0.9" />
            <polyline points="800,450 820,650 770,790 810,900" strokeWidth="4" opacity="0.9" />
            <circle cx="800" cy="450" r="245" strokeWidth="2.5" strokeDasharray="24 14" opacity="0.72" />
            <circle cx="800" cy="450" r="320" strokeWidth="1.5" strokeDasharray="10 18" opacity="0.5" />
          </g>
          {palette.isDarkTheme && !isImpact && (
            <g stroke={coreColor} fill="none" opacity="0.95">
              <polyline points="800,450 690,340 520,310 300,150 90,60" strokeWidth="2.5" />
              <polyline points="800,450 920,320 1140,260 1380,140 1560,40" strokeWidth="2.5" />
              <polyline points="800,450 660,560 440,630 220,760 40,870" strokeWidth="2.2" />
              <polyline points="800,450 950,580 1180,660 1410,790 1580,860" strokeWidth="2.2" />
            </g>
          )}
        </svg>
      )}

      {/* STYLE: BLOOD ECLIPSE / LUNAR CORONA */}
      {style === 'blood-eclipse' && !isRiser && (
        <svg
          viewBox="0 0 1600 900"
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 w-full h-full pointer-events-none animate-rift-crack"
        >
          <defs>
            <filter id="eclipseCorona">
              <feGaussianBlur stdDeviation="12" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Giant Blazing Eclipse Ring behind portrait */}
          <circle
            cx="800"
            cy="335"
            r="250"
            fill="rgba(2,2,4,0.92)"
            stroke={isImpact ? '#05070d' : accent}
            strokeWidth="12"
            filter="url(#eclipseCorona)"
          />
          <circle
            cx="800"
            cy="335"
            r="295"
            fill="none"
            stroke={isImpact ? '#05070d' : accent}
            strokeWidth="2"
            strokeDasharray="6 14"
            opacity="0.7"
          />
          {/* Dark Horizon Slash */}
          <line
            x1="0"
            y1="335"
            x2="1600"
            y2="335"
            stroke={isImpact ? '#05070d' : accent}
            strokeWidth="2.5"
            opacity="0.45"
          />
        </svg>
      )}

      {/* STYLE: DIVINE JUDGMENT / CELESTIAL STARBURST & HALO */}
      {style === 'divine-judgment' && !isRiser && (
        <svg
          viewBox="0 0 1600 900"
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 w-full h-full pointer-events-none animate-rift-crack"
        >
          <defs>
            <filter id="divineGlow">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g stroke={isImpact ? '#05070d' : accent} fill="none" filter="url(#divineGlow)">
            {/* Sacred Cathedral Halo */}
            <circle cx="800" cy="340" r="230" strokeWidth="3.5" opacity="0.85" />
            <circle cx="800" cy="340" r="268" strokeWidth="1.5" strokeDasharray="16 10" opacity="0.65" />
            {/* 8-Pointed Celestial Star Rays */}
            <line x1="800" y1="20" x2="800" y2="880" strokeWidth="3" opacity="0.6" />
            <line x1="280" y1="340" x2="1320" y2="340" strokeWidth="2.5" opacity="0.55" />
            <line x1="520" y1="60" x2="1080" y2="620" strokeWidth="2" opacity="0.45" />
            <line x1="1080" y1="60" x2="520" y2="620" strokeWidth="2" opacity="0.45" />
            <polygon
              points="800,80 865,275 1060,340 865,405 800,600 735,405 540,340 735,275"
              strokeWidth="2.2"
              opacity="0.72"
            />
          </g>
        </svg>
      )}

      {/* STYLE: SHATTERED MIRROR / TIME-STOP CLOCKWORK DIAL */}
      {style === 'shattered-mirror' && !isRiser && (
        <svg
          viewBox="0 0 1600 900"
          preserveAspectRatio="xMidYMid slice"
          className="absolute inset-0 w-full h-full pointer-events-none animate-rift-crack"
        >
          <defs>
            <filter id="prismGlow">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <g stroke={isImpact ? '#05070d' : accent} fill="none" filter="url(#prismGlow)">
            {/* Giant Arcane Clockwork Rings */}
            <circle cx="800" cy="360" r="255" strokeWidth="3" opacity="0.82" />
            <circle cx="800" cy="360" r="285" strokeWidth="10" strokeDasharray="3 34" opacity="0.78" />
            <circle cx="800" cy="360" r="345" strokeWidth="1.5" strokeDasharray="18 12" opacity="0.5" />
            {/* Clock Hands frozen at XII / III */}
            <line x1="800" y1="360" x2="800" y2="115" strokeWidth="4" opacity="0.7" />
            <line x1="800" y1="360" x2="985" y2="275" strokeWidth="3" opacity="0.65" />
            {/* Prismatic Mirror Fracture Polygons */}
            <polygon points="180,150 380,210 260,380" strokeWidth="2" fill={`${accent}14`} />
            <polygon points="1420,170 1230,240 1350,410" strokeWidth="2" fill={`${accent}14`} />
            <polygon points="220,740 430,620 350,810" strokeWidth="1.8" fill={`${accent}10`} />
            <polygon points="1390,720 1180,610 1270,820" strokeWidth="1.8" fill={`${accent}10`} />
          </g>
        </svg>
      )}

      {/* STYLE: STORM OVERDRIVE / HIGH-VOLTAGE DIAGONAL ENERGY CHEVRONS */}
      {style === 'storm-overdrive' && !isRiser && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: isImpact
              ? 'none'
              : `repeating-linear-gradient(-28deg, transparent 0px, transparent 58px, ${accent}14 58px, ${accent}14 62px)`,
          }}
        />
      )}

      {/* STYLE: PERSONA 5 DIAGONAL SLASH RIBBON */}
      {style === 'persona-slash' && (
        <div
          className={`absolute inset-0 pointer-events-none transition-transform duration-300 ${
            isRiser ? 'scale-y-0 opacity-0' : 'scale-y-100 opacity-100'
          }`}
          style={{
            clipPath: 'polygon(0 18%, 100% 8%, 100% 82%, 0 92%)',
            background: isImpact
              ? '#05060a'
              : `linear-gradient(112deg, rgba(4,6,12,0.97) 0%, ${accent}38 38%, rgba(8,10,18,0.96) 68%, ${accent}28 100%)`,
            borderTop: `4px solid ${accent}`,
            borderBottom: `4px solid ${accent}`,
            boxShadow: `inset 0 0 80px ${accent}55`,
          }}
        >
          <div
            className="absolute inset-x-0 top-0 h-2"
            style={{ background: `linear-gradient(90deg, ${accent}, #ffffff, ${accent})` }}
          />
          <div
            className="absolute inset-x-0 bottom-0 h-2"
            style={{ background: `linear-gradient(90deg, ${accent}, #ffffff, ${accent})` }}
          />
        </div>
      )}

      {/* MAIN CINEMA STAGE: SAFE ZONE BETWEEN LETTERBOX BARS (Never clipped at top/bottom!) */}
      <div
        className={`relative z-10 w-full h-full flex items-center justify-center px-6 sm:px-14 py-[11vh] ${
          isImpact ? 'animate-map-shake-heavy' : ''
        }`}
      >
        {isRiser ? (
          /* BEAT 1 (0–440ms): TENSION CHARGE SILHOUETTE & EYEBROW */
          <div className="text-center space-y-3 animate-ui-enter">
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-md bg-black/85 border text-xs sm:text-sm font-display font-black tracking-[0.34em] uppercase"
              style={{
                borderColor: accent,
                color: accent,
                boxShadow: `0 0 28px ${accent}66`,
              }}
            >
              <Sparkles className="w-4 h-4" />
              <span>{eyebrow}</span>
            </div>
            <div className="font-display font-bold text-lg sm:text-2xl tracking-[0.22em] uppercase text-[#f4ead7]/95">
              {event.actorName}
            </div>
          </div>
        ) : (
          /* BEAT 2 & 3 (440ms–2750ms): IMPACT FRAME -> SCULPTED ANIME CUT-IN FRAME & SLAM TITLE */
          <div
            className={`max-w-6xl w-full max-h-full flex items-center ${
              isCentered
                ? 'flex-col justify-center text-center gap-3 sm:gap-4'
                : 'flex-col md:flex-row justify-center md:justify-between gap-4 md:gap-10'
            }`}
          >
            {/* CINEMATIC ARTWORK PORTAL / BLADE SLICE */}
            <div
              className={`relative flex items-center justify-center shrink-0 animate-ultimate-art-slam ${
                isCentered
                  ? 'h-[31vh] sm:h-[38vh] max-h-[340px] aspect-square'
                  : style === 'persona-slash' || style === 'storm-overdrive'
                    ? 'h-[36vh] md:h-[58vh] max-h-[500px] w-[250px] sm:w-[320px] md:w-[390px]'
                    : 'h-[38vh] md:h-[62vh] max-h-[520px] w-[260px] sm:w-[330px] md:w-[400px]'
              }`}
            >
              {/* Luminous Backlit Aura Halo behind character */}
              <div
                className="absolute -inset-4 rounded-full pointer-events-none"
                style={{
                  background: `radial-gradient(circle, ${accent}77 0%, ${accent}22 50%, transparent 74%)`,
                  filter: 'blur(26px)',
                }}
              />

              {resolvedPortraitUrl ? (
                <div className="relative w-full h-full flex items-center justify-center">
                  {/* Sculpted Glowing Rim Frame */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      clipPath: portraitClipPath,
                      background: isImpact
                        ? '#05070d'
                        : `linear-gradient(145deg, #ffffff 0%, ${accent} 48%, ${
                            palette.isDarkTheme ? '#090b12' : `${accent}88`
                          } 100%)`,
                      filter: isImpact ? 'none' : `drop-shadow(0 0 26px ${accent})`,
                    }}
                  />
                  {/* Inner Portrait Viewport (top-anchored so head/eyes are NEVER clipped!) */}
                  <div
                    className="relative w-[calc(100%-6px)] h-[calc(100%-6px)] overflow-hidden bg-[#060810]"
                    style={{
                      clipPath: portraitClipPath,
                    }}
                  >
                    <img
                      src={resolvedPortraitUrl}
                      alt={event.actorName}
                      className="w-full h-full object-cover object-[50%_15%] select-none pointer-events-none"
                      style={{
                        filter: isImpact
                          ? 'grayscale(1) contrast(3.2) brightness(1.25) invert(1)'
                          : 'contrast(1.08) saturate(1.12)',
                      }}
                    />
                    {/* Atmospheric Edge Vignette so bright/white backgrounds melt seamlessly */}
                    {!isImpact && (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          boxShadow:
                            'inset 0 0 40px 10px rgba(4,6,12,0.75), inset 0 -46px 38px rgba(4,6,12,0.88)',
                        }}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <div className="relative z-10">
                  <TokenPortrait
                    name={event.actorName}
                    playerColor={accent}
                    frameStyle="arcane"
                    sizePx={200}
                  />
                </div>
              )}
            </div>

            {/* MONUMENTAL TYPOGRAPHY BLOCK */}
            <div
              className={`flex-1 min-w-0 space-y-2.5 sm:space-y-3 z-20 animate-ultimate-title-slam ${
                style === 'persona-slash' || style === 'storm-overdrive' ? '-skew-x-6' : ''
              } ${isCentered ? 'flex flex-col items-center' : 'text-center md:text-left'}`}
            >
              <div
                className={`inline-flex items-center gap-2 px-3.5 py-1 rounded-md border text-[11px] sm:text-xs font-display font-black tracking-[0.28em] uppercase ${
                  isImpact ? 'bg-black text-white border-black' : 'bg-black/85'
                }`}
                style={
                  isImpact
                    ? undefined
                    : {
                        borderColor: `${accent}cc`,
                        color: accent,
                        boxShadow: `0 0 24px ${accent}55`,
                      }
                }
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {eyebrow} • {event.actorName}
                </span>
              </div>

              <h1
                className={`font-chronicle font-black text-3xl sm:text-5xl lg:text-6xl leading-[1.02] uppercase tracking-wider break-words ${
                  isImpact ? 'text-black' : 'text-white'
                }`}
                style={{
                  textShadow: isImpact
                    ? 'none'
                    : `0 0 38px ${accent}, 0 0 14px ${accent}, 0 6px 14px rgba(0,0,0,0.98)`,
                }}
              >
                {event.techniqueName}
              </h1>

              {/* Blazing Accent Energy Divider */}
              <div
                className={`h-[3px] w-52 sm:w-80 ${isCentered ? 'mx-auto' : 'mx-auto md:mx-0'}`}
                style={{
                  background: isImpact
                    ? '#000000'
                    : `linear-gradient(90deg, ${accent}, #ffffff, ${accent}66, transparent)`,
                  boxShadow: isImpact ? 'none' : `0 0 18px ${accent}`,
                }}
              />

              {event.catchphrase && (
                <p
                  className={`font-lore italic text-sm sm:text-lg lg:text-2xl max-w-2xl leading-snug ${
                    isImpact ? 'text-black font-bold' : 'text-[#f6efe0]'
                  }`}
                  style={{
                    textShadow: isImpact ? 'none' : '0 3px 14px rgba(0,0,0,0.98)',
                  }}
                >
                  &ldquo;{event.catchphrase}&rdquo;
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* CINEMASCOPE LETTERBOX BARS (Slam shut on riser, hold through climax) */}
      <div
        className="fixed top-0 inset-x-0 z-30 bg-black pointer-events-none transition-all duration-300"
        style={{
          height: isExit ? '0vh' : '8.5vh',
          borderBottom: isImpact ? '2px solid #ffffff' : `1px solid ${accent}66`,
        }}
      />
      <div
        className="fixed bottom-0 inset-x-0 z-30 bg-black pointer-events-none transition-all duration-300 flex items-center justify-end px-5"
        style={{
          height: isExit ? '0vh' : '8.5vh',
          borderTop: isImpact ? '2px solid #ffffff' : `1px solid ${accent}66`,
        }}
      >
        {!isExit && (
          <span className="text-[10px] font-display uppercase tracking-[0.2em] text-white/40">
            Clique ou Esc para pular
          </span>
        )}
      </div>
    </div>
  );
};
