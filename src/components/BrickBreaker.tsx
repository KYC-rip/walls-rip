import { useState, useEffect, useRef } from 'react';
import { useTheme } from '../hooks/useTheme';

const HAMMER_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'%3E%3Crect x='12' y='10' width='4' height='16' rx='1' fill='%238B4513' stroke='%23654321' stroke-width='0.5'/%3E%3Crect x='5' y='3' width='18' height='8' rx='2' fill='%23555' stroke='%23333' stroke-width='0.5'/%3E%3Crect x='5' y='3' width='18' height='3' rx='1' fill='%23777'/%3E%3C/svg%3E";

const IS_INTERACTIVE = (el: Element): boolean => {
  const tag = el.tagName;
  if (['BUTTON', 'A', 'INPUT', 'TEXTAREA', 'SELECT', 'OPTION', 'SUMMARY', 'DETAILS', 'VIDEO', 'AUDIO'].includes(tag)) return true;
  const role = el.getAttribute('role');
  if (role && ['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio'].includes(role)) return true;
  const ht = el as HTMLElement;
  if (ht.tabIndex >= 0 && !['DIV', 'SPAN', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'FOOTER', 'NAV', 'ASIDE'].includes(tag)) return true;
  return false;
};

const JAGGED_CLIP = "polygon(50% 0%, 62% 8%, 78% 4%, 88% 18%, 100% 35%, 96% 52%, 100% 68%, 88% 82%, 78% 96%, 60% 100%, 42% 96%, 22% 100%, 8% 88%, 2% 70%, 0% 52%, 6% 32%, 0% 15%, 12% 4%, 30% 0%)";

export function BrickBreaker() {
  const { skin, resolvedTheme } = useTheme();
  const [holes, setHoles] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; tx: number; ty: number; rot: number; size: number; delay: number }>>([]);
  const [shaking, setShaking] = useState(false);
  const [flashPos, setFlashPos] = useState<{ x: number; y: number } | null>(null);
  const [pointerActive, setPointerActive] = useState(false);
  const [active, setActive] = useState(false);
  const particleIdRef = useRef(0);
  const holeIdRef = useRef(0);

  useEffect(() => {
    if (skin !== 'terminal') return;

    const onMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el) { setPointerActive(true); return; }
      let cur: Element | null = el;
      while (cur) {
        if (IS_INTERACTIVE(cur)) { setPointerActive(false); return; }
        cur = cur.parentElement;
      }
      setPointerActive(true);
    };

    const onLeave = () => setPointerActive(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, [skin]);

  if (skin !== 'terminal') return null;

  const isDark = resolvedTheme === 'dark';
  const strokeColor = isDark ? '#22d3ee' : '#0891b2';
  const strokeOpacity = isDark ? '0.08' : '0.12';
  const glowRGB = isDark ? '34,211,238' : '8,145,178';

  useEffect(() => {
    if (skin !== 'terminal') return;

    const onDocClick = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el) return;
      let cur: Element | null = el;
      while (cur) {
        if (IS_INTERACTIVE(cur)) return;
        cur = cur.parentElement;
      }
      smash(e.clientX, e.clientY);
    };

    const onScroll = () => {
      setActive(false);
      setHoles([]);
      setParticles([]);
    };
    window.addEventListener('scroll', onScroll, { passive: true, once: true });

    document.addEventListener('click', onDocClick);
    return () => {
      document.removeEventListener('click', onDocClick);
      window.removeEventListener('scroll', onScroll);
    };
  }, [skin]);

  const smash = (x: number, y: number) => {
    setActive(true);
    holeIdRef.current++;
    setHoles(prev => [...prev, { id: holeIdRef.current, x, y }]);
    setFlashPos({ x, y });
    setShaking(true);
    setTimeout(() => setShaking(false), 180);
    setTimeout(() => setFlashPos(null), 400);
    const newParticles = Array.from({ length: 12 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * 80;
      particleIdRef.current++;
      return {
        id: particleIdRef.current,
        x, y,
        tx: Math.cos(angle) * dist,
        ty: Math.sin(angle) * dist - 20,
        rot: (Math.random() - 0.5) * 400,
        size: 4 + Math.random() * 6,
        delay: Math.random() * 100,
      };
    });
    setParticles(prev => [...prev, ...newParticles]);
    setTimeout(() => setParticles(p => p.filter(np => !newParticles.find(n => n.id === np.id))), 700);
  };

  // Auto-smash on mount if in terminal theme
  useEffect(() => {
    if (skin !== 'terminal') return;
    setActive(true);
  }, [skin]);

  useEffect(() => {
    if (skin !== 'terminal' || !active) return;
    const count = 3 + Math.floor(Math.random() * 3);
    const positions = Array.from({ length: count }, () => ({
      x: 100 + Math.random() * (window.innerWidth - 200),
      y: 100 + Math.random() * (window.innerHeight - 200),
      delay: Math.random() * 800,
    }));
    positions.forEach(({ x, y, delay }) => {
      setTimeout(() => smash(x, y), delay);
    });
  }, [skin, active]);

  return (
    <>
      <div
        className={`fixed inset-0 z-35 pointer-events-none ${shaking ? 'animate-shake' : ''}`}
        style={{ cursor: pointerActive ? `url('${HAMMER_SVG}') 14 14, auto` : 'auto' }}
        aria-hidden="true"
      >
        {holes.map(hole => (
          <div key={hole.id} className="absolute pointer-events-none" style={{ left: hole.x, top: hole.y, width: 64, height: 64, transform: 'translate(-50%, -50%)' }}>
            <div style={{ width: '100%', height: '100%', clipPath: JAGGED_CLIP, background: `radial-gradient(circle, rgba(${glowRGB},0.15) 0%, rgba(${glowRGB},0.05) 50%, transparent 75%)`, boxShadow: `inset 0 0 20px rgba(${glowRGB},0.25), inset 0 0 40px rgba(${glowRGB},0.1)` }} />
          </div>
        ))}

        {particles.map(p => (
          <div key={p.id} className="absolute pointer-events-none" style={{
            left: p.x, top: p.y, width: p.size, height: p.size * 0.65,
            background: strokeColor, opacity: parseFloat(strokeOpacity) * 8, borderRadius: 1,
            animation: `brickParticle 550ms ease-out forwards`, animationDelay: `${p.delay}ms`,
            '--tx': `${p.tx}px`, '--ty': `${p.ty}px`, '--rot': `${p.rot}deg`,
          } as React.CSSProperties}
          />
        ))}

        {flashPos && (
          <div className="absolute pointer-events-none" style={{
            left: flashPos.x, top: flashPos.y, width: 80, height: 80, transform: 'translate(-50%, -50%)',
            background: `radial-gradient(circle, rgba(${glowRGB},0.4) 0%, transparent 70%)`,
            animation: 'impactFlash 400ms ease-out forwards',
          }} />
        )}
      </div>

      <style>{`
        @keyframes brickParticle {
          to { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) rotate(var(--rot)); opacity: 0; }
        }
        @keyframes shake {
          0%, 100% { transform: translate(0, 0); }
          20% { transform: translate(-2px, 1px); }
          40% { transform: translate(2px, -1px); }
          60% { transform: translate(-1px, 2px); }
          80% { transform: translate(1px, -2px); }
        }
        @keyframes impactFlash {
          0% { opacity: 1; transform: translate(-50%, -50%) scale(0.5); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(1.5); }
        }
        .animate-shake { animation: shake 180ms ease-out; }
        .z-35 { z-index: 35; }
      `}</style>
    </>
  );
}
