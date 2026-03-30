import { useRef, useEffect } from 'react';

interface WallSplashProps {
  onComplete: () => void;
}

/* ── Constants ── */

const WORD_COUNT = 240;
const REPULSION_RADIUS = 120;
const REPULSION_FORCE = 2.5;
const SMASH_RADIUS = 200;
const SMASH_FORCE = 18;
const SMASH_OUTER_RADIUS = 400;
const DRIFT_SPEED_MIN = 0.15;
const DRIFT_SPEED_MAX = 0.5;
const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 18;
const OPACITY_MIN = 0.3;
const OPACITY_MAX = 0.8;
const CLEAR_THRESHOLD = 0.2;
const SHAKE_DURATION = 400;
const SHAKE_INTENSITY = 14;

const TERMS = [
  'KYC', 'IDENTITY', 'SURVEILLANCE', 'COMPLIANCE', 'DATA HARVEST',
  'PHONE VERIFY', 'SELFIE CHECK', 'ADDRESS PROOF', 'SSN', 'FACIAL RECOGNITION',
  'PASSPORT', 'BANK STATEMENT', 'UTILITY BILL', 'BIOMETRIC', 'FINGERPRINT',
  'GOVERNMENT ID', 'TAX RETURN', 'CREDIT CHECK', 'SOCIAL SECURITY', 'VIDEO CALL',
  'LIVENESS CHECK', 'AML', 'SANCTIONS', 'WATCHLIST', 'PII', 'TRACKING',
  'PROFILING', 'METADATA', 'DRAGNET', 'CENSORSHIP', 'DOXXING', 'BLACKLIST',
  'DATA BROKER', 'MASS SURVEILLANCE', 'PHONE NUMBER', 'EMAIL VERIFY', 'REAL NAME',
  'HOME ADDRESS', 'DATE OF BIRTH', 'EMPLOYER', 'INCOME PROOF',
];

const WORD_COLORS = [
  '#555555', '#5a5a5a', '#4a4a4a', '#606060',
  '#2a5a2a', '#2d5d2d', '#336633', '#285828',
  '#5a2a2a', '#5d2d2d', '#663333', '#582828',
];

const HAMMER_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cg transform='rotate(-45, 16, 16)'%3E%3Crect x='14' y='16' width='4' height='14' rx='1' fill='%238B7355' stroke='%23665533' stroke-width='0.5'/%3E%3Crect x='7' y='8' width='18' height='9' rx='2' fill='%23888888' stroke='%23666666' stroke-width='0.5'/%3E%3Crect x='7' y='8' width='18' height='3' rx='1' fill='%23999999' opacity='0.5'/%3E%3C/g%3E%3C/svg%3E") 8 28, crosshair`;

const FONT_FAMILY = "'JetBrains Mono', 'Courier New', monospace";

/* ── Types ── */

interface WordState {
  text: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fontSize: number;
  baseOpacity: number;
  opacity: number;
  color: string;
  alive: boolean;
  blasted: boolean;
  repelVx: number;
  repelVy: number;
  rotation: number;
  width: number;
  height: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  decay: number;
  color: string;
  opacity: number;
}

interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
  lineWidth: number;
}

interface CrackLine {
  x: number;
  y: number;
  angle: number;
  length: number;
  progress: number;
  speed: number;
  opacity: number;
  width: number;
}

interface Flash {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
}

/* ── Component ── */

export function WallSplash({ onComplete }: WallSplashProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const counterRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const taglineRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const stateRef = useRef({
    W: 0,
    H: 0,
    dpr: 1,
    words: [] as WordState[],
    particles: [] as Particle[],
    shockwaves: [] as Shockwave[],
    cracks: [] as CrackLine[],
    flashes: [] as Flash[],
    initialWordCount: 0,
    smashCount: 0,
    gameOver: false,
    finalScatter: false,
    shakeOffset: { x: 0, y: 0 },
    shakeEnd: 0,
    mouseX: -9999,
    mouseY: -9999,
    isTouchDevice: false,
    hintVisible: true,
    lastTime: 0,
    scanlinePattern: null as CanvasPattern | null,
    scanlinePatternH: 0,
    vignetteGrad: null as CanvasGradient | null,
    vignetteW: 0,
    vignetteH: 0,
    measureCtx: null as CanvasRenderingContext2D | null,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const s = stateRef.current;
    s.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // Update hint text for touch
    if (s.isTouchDevice && hintRef.current) {
      hintRef.current.textContent = '[ tap to smash ]';
    }

    /* ── Helpers ── */

    function getMeasureCtx(): CanvasRenderingContext2D {
      if (!s.measureCtx) {
        const mc = document.createElement('canvas').getContext('2d');
        if (mc) s.measureCtx = mc;
      }
      return s.measureCtx!;
    }

    function spawnParticles(
      x: number, y: number, count: number,
      opts: { speedMin?: number; speedMax?: number; sizeMin?: number; sizeMax?: number; color?: string; life?: number } = {},
    ) {
      const { speedMin = 1, speedMax = 6, sizeMin = 1, sizeMax = 4, color, life = 1 } = opts;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = speedMin + Math.random() * (speedMax - speedMin);
        const c = color || (Math.random() > 0.7
          ? `rgba(0, 255, 65, ${0.3 + Math.random() * 0.5})`
          : `rgba(${(150 + Math.random() * 80) | 0}, ${(140 + Math.random() * 60) | 0}, ${(120 + Math.random() * 40) | 0}, ${0.4 + Math.random() * 0.4})`);
        s.particles.push({
          x: x + (Math.random() - 0.5) * 20,
          y: y + (Math.random() - 0.5) * 20,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: sizeMin + Math.random() * (sizeMax - sizeMin),
          life,
          decay: 0.012 + Math.random() * 0.025,
          color: c,
          opacity: 0.5 + Math.random() * 0.5,
        });
      }
    }

    function spawnShockwave(x: number, y: number) {
      s.shockwaves.push({
        x, y,
        radius: 0,
        maxRadius: SMASH_OUTER_RADIUS,
        opacity: 0.6,
        lineWidth: 3,
      });
    }

    function spawnCracks(x: number, y: number) {
      const count = 8 + Math.floor(Math.random() * 6);
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.4;
        const length = 40 + Math.random() * 120;
        s.cracks.push({
          x, y, angle, length,
          progress: 0,
          speed: 0.06 + Math.random() * 0.04,
          opacity: 0.6 + Math.random() * 0.4,
          width: 1 + Math.random() * 2,
        });
      }
    }

    function spawnFlash(x: number, y: number) {
      s.flashes.push({
        x, y,
        radius: 5,
        maxRadius: 80,
        opacity: 0.9,
      });
    }

    function triggerShake(_intensity: number, duration: number) {
      s.shakeEnd = performance.now() + duration;
    }

    /* ── Resize ── */

    function resize() {
      if (!canvas || !ctx) return;
      s.dpr = Math.min(window.devicePixelRatio || 1, 2);
      s.W = window.innerWidth;
      s.H = window.innerHeight;
      canvas.width = s.W * s.dpr;
      canvas.height = s.H * s.dpr;
      canvas.style.width = s.W + 'px';
      canvas.style.height = s.H + 'px';
      ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
      s.vignetteGrad = null;
      s.scanlinePattern = null;
    }

    /* ── Spawn words ── */

    function spawnWords() {
      s.words = [];
      s.particles = [];
      s.shockwaves = [];
      s.cracks = [];
      s.flashes = [];
      s.gameOver = false;
      s.finalScatter = false;
      s.smashCount = 0;
      s.hintVisible = true;

      if (taglineRef.current) {
        taglineRef.current.style.opacity = '0';
        taglineRef.current.style.pointerEvents = 'none';
      }
      if (counterRef.current) {
        counterRef.current.style.opacity = '0';
        counterRef.current.textContent = '';
      }

      // Build shuffled pool
      const pool: string[] = [];
      while (pool.length < WORD_COUNT) {
        const batch = [...TERMS].sort(() => Math.random() - 0.5);
        pool.push(...batch);
      }

      const mctx = getMeasureCtx();

      for (let i = 0; i < WORD_COUNT; i++) {
        const text = pool[i];
        const fontSize = FONT_SIZE_MIN + Math.random() * (FONT_SIZE_MAX - FONT_SIZE_MIN);
        const opacity = OPACITY_MIN + Math.random() * (OPACITY_MAX - OPACITY_MIN);
        const color = WORD_COLORS[Math.floor(Math.random() * WORD_COLORS.length)];
        const angle = Math.random() * Math.PI * 2;
        const speed = DRIFT_SPEED_MIN + Math.random() * (DRIFT_SPEED_MAX - DRIFT_SPEED_MIN);
        const font = `700 ${fontSize}px ${FONT_FAMILY}`;

        mctx.font = font;
        const width = mctx.measureText(text).width;

        s.words.push({
          text,
          x: 40 + Math.random() * (s.W - 80),
          y: 40 + Math.random() * (s.H - 80),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          fontSize,
          baseOpacity: opacity,
          opacity,
          color,
          alive: true,
          blasted: false,
          repelVx: 0,
          repelVy: 0,
          rotation: (Math.random() - 0.5) * 0.15,
          width,
          height: fontSize,
        });
      }

      s.initialWordCount = s.words.length;
    }

    /* ── Smash handler ── */

    function performSmash(cx: number, cy: number) {
      if (s.gameOver) return;

      // Hide hint on first smash
      if (s.hintVisible) {
        s.hintVisible = false;
        if (hintRef.current) {
          hintRef.current.style.transition = 'opacity 0.3s';
          hintRef.current.style.opacity = '0';
          setTimeout(() => {
            if (hintRef.current) hintRef.current.style.display = 'none';
          }, 300);
        }
        // Show counter
        if (counterRef.current) {
          counterRef.current.style.opacity = '1';
        }
      }

      s.smashCount++;

      // Visual effects
      spawnShockwave(cx, cy);
      spawnCracks(cx, cy);
      spawnFlash(cx, cy);
      triggerShake(SHAKE_INTENSITY, SHAKE_DURATION);
      spawnParticles(cx, cy, 30, { speedMin: 2, speedMax: 10, sizeMin: 1, sizeMax: 5 });

      // Blast words
      for (let i = s.words.length - 1; i >= 0; i--) {
        const w = s.words[i];
        if (!w.alive) continue;

        const dx = w.x - cx;
        const dy = w.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < SMASH_RADIUS) {
          const angle = Math.atan2(dy, dx);
          const force = SMASH_FORCE * (1 - dist / SMASH_RADIUS);
          w.vx = Math.cos(angle) * force + (Math.random() - 0.5) * 4;
          w.vy = Math.sin(angle) * force + (Math.random() - 0.5) * 4;
          w.blasted = true;
          w.opacity = w.baseOpacity * 1.5;
          spawnParticles(w.x, w.y, 3, { speedMin: 0.5, speedMax: 3, sizeMin: 1, sizeMax: 2 });
        } else if (dist < SMASH_OUTER_RADIUS) {
          const angle = Math.atan2(dy, dx);
          const falloff = 1 - (dist - SMASH_RADIUS) / (SMASH_OUTER_RADIUS - SMASH_RADIUS);
          const force = SMASH_FORCE * 0.3 * falloff;
          w.vx += Math.cos(angle) * force;
          w.vy += Math.sin(angle) * force;
        }
      }

      updateCounter();
    }

    function updateCounter() {
      const alive = s.words.filter(w => w.alive).length;
      const destroyed = s.initialWordCount - alive;
      if (counterRef.current) {
        counterRef.current.textContent = `${destroyed} / ${s.initialWordCount} DESTROYED`;
      }
    }

    /* ── Input handlers ── */

    function onMouseMove(e: MouseEvent) {
      s.mouseX = e.clientX;
      s.mouseY = e.clientY;
    }

    function onClick(e: MouseEvent) {
      performSmash(e.clientX, e.clientY);
    }

    function onTouchStart(e: TouchEvent) {
      e.preventDefault();
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        performSmash(touch.clientX, touch.clientY);
      }
    }

    /* ── Update ── */

    function update(dt: number, now: number) {
      if (s.gameOver) return;

      // Screen shake
      if (now < s.shakeEnd) {
        const remaining = (s.shakeEnd - now) / SHAKE_DURATION;
        s.shakeOffset.x = (Math.random() - 0.5) * SHAKE_INTENSITY * remaining * 2;
        s.shakeOffset.y = (Math.random() - 0.5) * SHAKE_INTENSITY * remaining * 2;
      } else {
        s.shakeOffset.x *= 0.8;
        s.shakeOffset.y *= 0.8;
        if (Math.abs(s.shakeOffset.x) < 0.1) s.shakeOffset.x = 0;
        if (Math.abs(s.shakeOffset.y) < 0.1) s.shakeOffset.y = 0;
      }

      // Check final scatter
      let aliveCount = 0;
      for (const w of s.words) { if (w.alive) aliveCount++; }

      if (!s.finalScatter && aliveCount > 0 && aliveCount <= s.initialWordCount * CLEAR_THRESHOLD) {
        s.finalScatter = true;
        for (const w of s.words) {
          if (!w.alive) continue;
          const dx = w.x - s.W / 2;
          const dy = w.y - s.H / 2;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          w.vx = (dx / dist) * 25 + (Math.random() - 0.5) * 10;
          w.vy = (dy / dist) * 25 + (Math.random() - 0.5) * 10;
          w.blasted = true;
        }
        triggerShake(20, 600);
        spawnShockwave(s.W / 2, s.H / 2);
        spawnParticles(s.W / 2, s.H / 2, 60, { speedMin: 3, speedMax: 15, sizeMin: 1, sizeMax: 4 });
      }

      // Update words
      let anyAlive = false;
      for (let i = s.words.length - 1; i >= 0; i--) {
        const w = s.words[i];
        if (!w.alive) continue;

        // Mouse repulsion (desktop only)
        if (!s.isTouchDevice && !w.blasted) {
          const dx = w.x - s.mouseX;
          const dy = w.y - s.mouseY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < REPULSION_RADIUS && dist > 0) {
            const force = (1 - dist / REPULSION_RADIUS) * REPULSION_FORCE;
            w.repelVx += (dx / dist) * force * dt;
            w.repelVy += (dy / dist) * force * dt;
          }
        }

        // Decay repulsion
        w.repelVx *= 0.92;
        w.repelVy *= 0.92;

        if (w.blasted) {
          w.vx *= 0.985;
          w.vy *= 0.985;
          w.opacity *= 0.995;

          const margin = 100;
          if (w.x < -margin || w.x > s.W + margin || w.y < -margin || w.y > s.H + margin) {
            w.alive = false;
            continue;
          }
          if (w.opacity < 0.02) {
            w.alive = false;
            continue;
          }
        } else {
          // Gentle drift: bounce off edges
          const pad = 20;
          if (w.x < pad) { w.x = pad; w.vx = Math.abs(w.vx) * 0.8 + 0.1; }
          if (w.x > s.W - pad - w.width) { w.x = s.W - pad - w.width; w.vx = -Math.abs(w.vx) * 0.8 - 0.1; }
          if (w.y < pad + w.height) { w.y = pad + w.height; w.vy = Math.abs(w.vy) * 0.8 + 0.1; }
          if (w.y > s.H - pad) { w.y = s.H - pad; w.vy = -Math.abs(w.vy) * 0.8 - 0.1; }

          // Cap drift speed
          const maxDrift = DRIFT_SPEED_MAX * 1.5;
          const speed = Math.sqrt(w.vx * w.vx + w.vy * w.vy);
          if (speed > maxDrift) {
            w.vx = (w.vx / speed) * maxDrift;
            w.vy = (w.vy / speed) * maxDrift;
          }

          // Restore opacity
          w.opacity += (w.baseOpacity - w.opacity) * 0.02;
        }

        // Apply movement
        w.x += (w.vx + w.repelVx) * dt;
        w.y += (w.vy + w.repelVy) * dt;

        anyAlive = true;
      }

      // Game over check
      if (!anyAlive && s.smashCount > 0) {
        s.gameOver = true;
        if (counterRef.current) {
          counterRef.current.style.opacity = '0';
        }
        setTimeout(() => {
          if (taglineRef.current) {
            taglineRef.current.style.opacity = '1';
            taglineRef.current.style.pointerEvents = 'auto';
          }
        }, 500);
        setTimeout(() => {
          onCompleteRef.current();
        }, 2500);
      }

      // Update particles
      for (let i = s.particles.length - 1; i >= 0; i--) {
        const p = s.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 0.04 * dt;
        p.vx *= 0.99;
        p.life -= p.decay * dt;
        if (p.life <= 0) s.particles.splice(i, 1);
      }

      // Update shockwaves
      for (let i = s.shockwaves.length - 1; i >= 0; i--) {
        const sw = s.shockwaves[i];
        sw.radius += 8 * dt;
        sw.opacity -= 0.018 * dt;
        sw.lineWidth = Math.max(0.5, sw.lineWidth - 0.04 * dt);
        if (sw.opacity <= 0 || sw.radius > sw.maxRadius) s.shockwaves.splice(i, 1);
      }

      // Update cracks
      for (let i = s.cracks.length - 1; i >= 0; i--) {
        const c = s.cracks[i];
        c.progress += c.speed * dt;
        if (c.progress >= 1) {
          c.opacity -= 0.03 * dt;
          if (c.opacity <= 0) s.cracks.splice(i, 1);
        }
      }

      // Update flashes
      for (let i = s.flashes.length - 1; i >= 0; i--) {
        const f = s.flashes[i];
        f.radius += 12 * dt;
        f.opacity -= 0.06 * dt;
        if (f.opacity <= 0) s.flashes.splice(i, 1);
      }

      updateCounter();
    }

    /* ── Render ── */

    function render(now: number) {
      if (!ctx) return;
      ctx.save();
      ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);

      // Apply shake
      ctx.translate(s.shakeOffset.x, s.shakeOffset.y);

      // Clear
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(-20, -20, s.W + 40, s.H + 40);

      // Vignette (cached gradient)
      if (!s.vignetteGrad || s.vignetteW !== s.W || s.vignetteH !== s.H) {
        s.vignetteGrad = ctx.createRadialGradient(
          s.W / 2, s.H / 2, s.W * 0.2,
          s.W / 2, s.H / 2, s.W * 0.75,
        );
        s.vignetteGrad.addColorStop(0, 'rgba(0,0,0,0)');
        s.vignetteGrad.addColorStop(1, 'rgba(0,0,0,0.65)');
        s.vignetteW = s.W;
        s.vignetteH = s.H;
      }
      ctx.fillStyle = s.vignetteGrad;
      ctx.fillRect(0, 0, s.W, s.H);

      // Draw words
      ctx.textBaseline = 'middle';
      for (const w of s.words) {
        if (!w.alive) continue;

        ctx.save();
        ctx.translate(w.x + w.width / 2, w.y);
        ctx.rotate(w.rotation);
        ctx.font = `700 ${w.fontSize}px ${FONT_FAMILY}`;
        ctx.globalAlpha = Math.max(0, Math.min(1, w.opacity));
        ctx.fillStyle = w.color;
        ctx.fillText(w.text, -w.width / 2, 0);
        ctx.restore();
      }

      // Draw cracks
      for (const c of s.cracks) {
        const len = c.length * Math.min(1, c.progress);
        const ex = c.x + Math.cos(c.angle) * len;
        const ey = c.y + Math.sin(c.angle) * len;

        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = `rgba(255, 255, 255, ${c.opacity * 0.5})`;
        ctx.lineWidth = c.width;
        ctx.stroke();

        // Secondary thinner line alongside
        if (c.width > 1.5) {
          const offset = 3;
          ctx.beginPath();
          ctx.moveTo(c.x + Math.cos(c.angle + 0.3) * 5, c.y + Math.sin(c.angle + 0.3) * 5);
          ctx.lineTo(ex + Math.cos(c.angle + 0.2) * offset, ey + Math.sin(c.angle + 0.2) * offset);
          ctx.strokeStyle = `rgba(0, 255, 65, ${c.opacity * 0.2})`;
          ctx.lineWidth = c.width * 0.4;
          ctx.stroke();
        }
      }

      // Draw shockwaves
      for (const sw of s.shockwaves) {
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 255, 65, ${sw.opacity * 0.4})`;
        ctx.lineWidth = sw.lineWidth;
        ctx.stroke();

        // Inner ring
        if (sw.radius > 20) {
          ctx.beginPath();
          ctx.arc(sw.x, sw.y, sw.radius * 0.7, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255, 255, 255, ${sw.opacity * 0.15})`;
          ctx.lineWidth = sw.lineWidth * 0.5;
          ctx.stroke();
        }
      }

      // Draw flashes
      for (const f of s.flashes) {
        const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius);
        grad.addColorStop(0, `rgba(255, 255, 255, ${f.opacity})`);
        grad.addColorStop(0.3, `rgba(0, 255, 65, ${f.opacity * 0.3})`);
        grad.addColorStop(1, 'rgba(0, 255, 65, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(f.x - f.radius, f.y - f.radius, f.radius * 2, f.radius * 2);
      }

      // Draw particles
      for (const p of s.particles) {
        const alpha = p.life * p.opacity;
        const size = p.size * (0.3 + p.life * 0.7);

        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fill();

        // Soft glow for larger particles
        if (size > 2) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, size * 2.5, 0, Math.PI * 2);
          ctx.globalAlpha = alpha * 0.1;
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // CRT scanline overlay (cached pattern)
      ctx.globalAlpha = 1;
      if (!s.scanlinePattern || s.scanlinePatternH !== s.H) {
        const patCanvas = document.createElement('canvas');
        patCanvas.width = 1;
        patCanvas.height = 6;
        const patCtx = patCanvas.getContext('2d');
        if (patCtx) {
          patCtx.fillStyle = 'rgba(0, 255, 65, 0.012)';
          patCtx.fillRect(0, 0, 1, 3);
          const pat = ctx.createPattern(patCanvas, 'repeat');
          if (pat) s.scanlinePattern = pat;
        }
        s.scanlinePatternH = s.H;
      }
      if (s.scanlinePattern && ctx) {
        ctx.fillStyle = s.scanlinePattern;
        ctx.fillRect(0, 0, s.W, s.H);
      }

      // Subtle horizontal scan band (moves slowly)
      if (ctx) {
        const scanBandY = (now * 0.03) % (s.H + 60) - 30;
        const scanGrad = ctx.createLinearGradient(0, scanBandY - 30, 0, scanBandY + 30);
        scanGrad.addColorStop(0, 'rgba(0, 255, 65, 0)');
        scanGrad.addColorStop(0.5, 'rgba(0, 255, 65, 0.02)');
        scanGrad.addColorStop(1, 'rgba(0, 255, 65, 0)');
        ctx.fillStyle = scanGrad;
        ctx.fillRect(0, scanBandY - 30, s.W, 60);

        ctx.restore();
      }
    }

    /* ── Setup ── */

    resize();
    window.addEventListener('resize', resize);

    if (!s.isTouchDevice) {
      canvas.addEventListener('mousemove', onMouseMove);
      canvas.addEventListener('click', onClick);
    }
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });

    spawnWords();

    /* ── Loop ── */

    s.lastTime = 0;

    function loop(timestamp: number) {
      if (!s.lastTime) s.lastTime = timestamp;
      const dt = Math.min((timestamp - s.lastTime) / 16.667, 3);
      s.lastTime = timestamp;

      update(dt, timestamp);
      render(timestamp);

      animFrameRef.current = requestAnimationFrame(loop);
    }

    animFrameRef.current = requestAnimationFrame(loop);

    /* ── Cleanup ── */

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('click', onClick);
      canvas.removeEventListener('touchstart', onTouchStart);
    };
  }, []);

  const isMobile = typeof window !== 'undefined' &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  return (
    <div
      className="fixed inset-0 z-[100]"
      style={{
        background: '#0a0a0a',
        fontFamily: FONT_FAMILY,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          position: 'fixed',
          top: 0,
          left: 0,
          cursor: isMobile ? undefined : HAMMER_CURSOR,
        }}
      />

      {/* Hint */}
      <div
        ref={hintRef}
        style={{
          position: 'fixed',
          bottom: '8%',
          left: '50%',
          transform: 'translateX(-50%)',
          fontFamily: FONT_FAMILY,
          fontSize: 13,
          color: '#00ff41',
          letterSpacing: 4,
          textTransform: 'uppercase',
          zIndex: 20,
          textShadow: '0 0 10px rgba(0,255,65,0.5), 0 0 40px rgba(0,255,65,0.15)',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          animation: 'wallsplash-pulse 1.8s ease-in-out infinite',
        }}
      >
        [ click to smash ]
      </div>

      {/* Counter */}
      <div
        ref={counterRef}
        style={{
          position: 'fixed',
          top: 20,
          right: 24,
          fontFamily: FONT_FAMILY,
          fontSize: 12,
          color: '#00ff4180',
          letterSpacing: 2,
          zIndex: 20,
          pointerEvents: 'none',
          opacity: 0,
          transition: 'opacity 0.5s',
        }}
      />

      {/* Tagline overlay */}
      <div
        ref={taglineRef}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          zIndex: 200,
          opacity: 0,
          pointerEvents: 'none',
          transition: 'opacity 2s ease-in',
        }}
      >
        <h1
          style={{
            fontFamily: FONT_FAMILY,
            fontSize: 'clamp(28px, 5.5vw, 72px)',
            fontWeight: 800,
            color: '#00ff41',
            lineHeight: 1.4,
            textShadow:
              '0 0 30px rgba(0,255,65,0.6), 0 0 80px rgba(0,255,65,0.25), 0 0 120px rgba(0,255,65,0.1)',
            letterSpacing: 3,
          }}
        >
          Break walls.<br />Reclaim privacy.
        </h1>
        <p
          style={{
            fontFamily: FONT_FAMILY,
            fontSize: 'clamp(12px, 2vw, 18px)',
            color: '#00ff41aa',
            marginTop: 16,
            letterSpacing: 6,
            textTransform: 'uppercase',
          }}
        >
          no kyc. no trace. no compromise.
        </p>
        <p
          style={{
            fontFamily: FONT_FAMILY,
            fontSize: 'clamp(10px, 1.4vw, 14px)',
            color: '#00ff4160',
            marginTop: 32,
            letterSpacing: 10,
            textTransform: 'uppercase',
          }}
        >
          walls.rip
        </p>
      </div>

      {/* Skip button */}
      <button
        onClick={() => onCompleteRef.current()}
        style={{
          position: 'fixed',
          top: 20,
          left: 20,
          zIndex: 30,
          fontFamily: FONT_FAMILY,
          fontSize: 11,
          color: '#ffffff30',
          background: 'none',
          border: '1px solid #ffffff15',
          padding: '6px 14px',
          cursor: 'pointer',
          letterSpacing: 2,
          textTransform: 'uppercase',
          borderRadius: 2,
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff80'; e.currentTarget.style.borderColor = '#ffffff40'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#ffffff30'; e.currentTarget.style.borderColor = '#ffffff15'; }}
      >
        Skip
      </button>

      {/* Pulse animation for hint */}
      <style>{`
        @keyframes wallsplash-pulse {
          0%, 100% { opacity: 0.3; transform: translateX(-50%) scale(1); }
          50% { opacity: 1; transform: translateX(-50%) scale(1.04); }
        }
      `}</style>
    </div>
  );
}
