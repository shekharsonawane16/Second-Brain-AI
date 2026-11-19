"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { BRAND } from "@/lib/brand";

const DESKTOP_TOTAL = 5;
const MOBILE_TOTAL = 5;
const REVEAL_AT = 2.8;

interface Particle {
  x: number; y: number; vx: number; vy: number;
  tx: number; ty: number; r: number; a: number; d: number; ph: number;
}

interface Edge { a: number; b: number }

interface Field {
  w: number; h: number; cx: number; cy: number; scale: number;
  particles: Particle[]; edges: Edge[];
}

function clamp01(v: number) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function smooth(a: number, b: number, v: number) { return clamp01((v - a) / (b - a)); }

function buildField(w: number, h: number): Field {
  const count = Math.round(Math.min(150, Math.max(64, (w * h) / 15000)));
  const cx = w / 2;
  const cy = h * 0.47;
  const scale = Math.min(w * 0.62, h * 0.55, 620);
  const clusters = [
    { dx: -0.26, dy: -0.03, rx: 0.30, ry: 0.40, share: 0.52 },
    { dx: 0.26, dy: -0.02, rx: 0.32, ry: 0.42, share: 0.36 },
    { dx: 0.16, dy: 0.42, rx: 0.17, ry: 0.12, share: 0.12 }
  ];
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const pick = Math.random();
    let acc = 0;
    let c = clusters[0];
    for (const cl of clusters) { acc += cl.share; if (pick <= acc) { c = cl; break; } }
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.sqrt(Math.random());
    const tx = cx + (c.dx + Math.cos(ang) * rad * c.rx) * scale;
    const ty = cy + (c.dy + Math.sin(ang) * rad * c.ry) * scale;
    particles.push({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 9,
      vy: (Math.random() - 0.5) * 9,
      tx, ty,
      r: 0.7 + Math.random() * 1.5,
      a: 0.24 + Math.random() * 0.5,
      d: Math.random(),
      ph: Math.random() * Math.PI * 2
    });
  }

  const seen = new Set<string>();
  const edges: Edge[] = [];
  const maxD = scale * 0.21;
  const maxD2 = maxD * maxD;
  for (let i = 0; i < particles.length; i++) {
    const cand: { j: number; d: number }[] = [];
    for (let j = 0; j < particles.length; j++) {
      if (i === j) continue;
      const dx = particles[i].tx - particles[j].tx;
      const dy = particles[i].ty - particles[j].ty;
      const d = dx * dx + dy * dy;
      if (d < maxD2) cand.push({ j, d });
    }
    cand.sort((a, b) => a.d - b.d);
    for (let k = 0; k < Math.min(2, cand.length); k++) {
      const j = cand[k].j;
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a: i, b: j });
    }
  }

  return { w, h, cx, cy, scale, particles, edges };
}

interface AudioEngine { ctx: AudioContext; master: GainNode }

function createAudioEngine(): AudioEngine | null {
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor();
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);

  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 620;
  padFilter.Q.value = 1.2;
  const padGain = ctx.createGain();
  padGain.gain.value = 0.11;
  padFilter.connect(padGain);
  padGain.connect(master);

  [110, 164.81, 220, 277.18].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    o.detune.value = i % 2 ? 5 : -5;
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 0.5 : 0.22;
    o.connect(g);
    g.connect(padFilter);
    o.start();
  });

  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 190;
  lfo.connect(lfoGain);
  lfoGain.connect(padFilter.frequency);
  lfo.start();

  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.35;
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  noise.loop = true;
  const nf = ctx.createBiquadFilter();
  nf.type = "bandpass";
  nf.frequency.value = 1900;
  nf.Q.value = 0.7;
  const ng = ctx.createGain();
  ng.gain.value = 0.018;
  noise.connect(nf);
  nf.connect(ng);
  ng.connect(master);
  noise.start();

  master.gain.setTargetAtTime(0.16, ctx.currentTime, 1.3);
  return { ctx, master };
}

function playChime(engine: AudioEngine) {
  const { ctx, master } = engine;
  const now = ctx.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = i === 3 ? "sine" : "triangle";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g);
    g.connect(master);
    const at = now + i * 0.1;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(i === 3 ? 0.1 : 0.06, at + 0.035);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 2.1);
    o.start(at);
    o.stop(at + 2.2);
  });
}

export function CinematicIntro() {
  const [visible, setVisible] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [phase, setPhase] = useState(0);

  const overlayRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const startRef = useRef(0);
  const rafRef = useRef(0);
  const finishingRef = useRef(false);
  const phaseRef = useRef(0);
  const audioRef = useRef<AudioEngine | null>(null);
  const chimedRef = useRef(false);
  const durationRef = useRef(DESKTOP_TOTAL);

  const finish = useCallback(() => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    cancelAnimationFrame(rafRef.current);
    try { document.body.style.overflow = ""; } catch { /* ignore */ }
    setVisible(false);
  }, []);

  const start = useCallback(() => {
    finishingRef.current = false;
    chimedRef.current = false;
    phaseRef.current = 0;
    setPhase(0);
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    durationRef.current = window.matchMedia("(max-width: 767px)").matches ? MOBILE_TOTAL : DESKTOP_TOTAL;
    startRef.current = performance.now();
    try { document.body.style.overflow = "hidden"; } catch { /* ignore */ }
    try {
      if (!audioRef.current) audioRef.current = createAudioEngine();
      const engine = audioRef.current;
      if (engine) {
        engine.ctx.resume().catch(() => {});
        engine.master.gain.setTargetAtTime(0.14, engine.ctx.currentTime, 0.8);
      }
    } catch {
      audioRef.current = null;
    }
    setVisible(true);
  }, []);

  // Plays before the workspace is shown, on every visit
  useEffect(() => {
    start();
  }, [start]);

  // Timers: reveal the brand and close even if canvas/audio fails on mobile
  useEffect(() => {
    if (!visible) return;
    const duration = durationRef.current;
    const reveal = setTimeout(() => {
      phaseRef.current = 1;
      setPhase(1);
    }, REVEAL_AT * 1000);
    const end = setTimeout(() => finish(), duration * 1000);
    return () => {
      clearTimeout(reveal);
      clearTimeout(end);
    };
  }, [visible, finish]);

  // Browsers may block audio until the first interaction; unlock as soon as it happens.
  useEffect(() => {
    if (!visible) return;
    const unlock = () => {
      try {
        const a = audioRef.current;
        if (a && a.ctx.state !== "running") a.ctx.resume().catch(() => {});
      } catch { /* ignore */ }
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [visible]);

  // Chime at reveal
  useEffect(() => {
    if (visible && phase >= 1 && !chimedRef.current) {
      chimedRef.current = true;
      if (audioRef.current) playChime(audioRef.current);
    }
  }, [visible, phase]);

  // Audio cleanup
  useEffect(() => () => {
    const a = audioRef.current;
    if (a) { a.master.gain.setTargetAtTime(0, a.ctx.currentTime, 0.2); setTimeout(() => a.ctx.close().catch(() => {}), 700); }
    audioRef.current = null;
  }, []);

  // Canvas animation
  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let field: Field | null = null;
    let disposed = false;
    let lastW = 0;
    let lastH = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (Math.abs(rect.width - lastW) < 2 && Math.abs(rect.height - lastH) < 120) return;
      lastW = rect.width;
      lastH = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      field = buildField(rect.width, rect.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const frame = (now: number) => {
      if (disposed || !field) return;
      const t = (now - startRef.current) / 1000;
      const duration = durationRef.current;
      const fadeStart = duration - 0.8;
      const { w, h, cx, cy, scale, particles, edges } = field;

      if (t > REVEAL_AT && phaseRef.current < 1) { phaseRef.current = 1; setPhase(1); }
      if (t >= fadeStart && overlayRef.current) {
        overlayRef.current.style.opacity = String(1 - smooth(fadeStart, duration, t));
      }
      if (progressRef.current) progressRef.current.style.width = `${Math.min(100, (t / duration) * 100)}%`;
      if (t >= duration) { finish(); return; }

      ctx.clearRect(0, 0, w, h);

      // soft central intelligence glow
      const animate = reduced ? 0 : 1;
      const glow = 0.9 + 0.1 * Math.sin(t * 0.9) * animate;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, scale * 0.9);
      g.addColorStop(0, `rgba(99, 102, 241, ${0.2 * glow})`);
      g.addColorStop(0.45, `rgba(124, 93, 250, ${0.11 * glow})`);
      g.addColorStop(1, "rgba(20, 24, 48, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(cx - scale, cy - scale, scale * 2, scale * 2);

      const pos = new Array<{ x: number; y: number }>(particles.length);
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const twinkle = reduced ? 0.82 : 0.55 + 0.45 * Math.sin(t * 1.8 + p.ph);
        const px = p.tx + (reduced ? 0 : Math.sin(t * 0.7 + p.ph) * 1.4);
        const py = p.ty + (reduced ? 0 : Math.cos(t * 0.6 + p.ph) * 1.4);
        pos[i] = { x: px, y: py };

        const hue = i % 3 === 0 ? 262 : i % 3 === 1 ? 232 : 218;
        ctx.beginPath();
        ctx.fillStyle = `hsla(${hue}, 100%, 68%, ${p.a * 0.16 * (0.5 + 0.5 * twinkle)})`;
        ctx.arc(px, py, p.r * 4.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = `hsla(${hue}, 95%, ${72 + 10 * twinkle}%, ${p.a * (0.55 + 0.45 * twinkle)})`;
        ctx.arc(px, py, p.r * (0.95 + 0.35 * twinkle), 0, Math.PI * 2);
        ctx.fill();
      }

      // neural structure edges
      ctx.lineWidth = 0.75;
      for (let k = 0; k < edges.length; k++) {
        const { a: ia, b: ib } = edges[k];
        const energy = 0.5 + 0.5 * Math.sin(t * 2.1 + k * 0.7) * animate;
        const alpha = 0.06 + 0.14 * energy;
        ctx.strokeStyle = `rgba(139, 122, 255, ${alpha})`;
        ctx.beginPath();
        ctx.moveTo(pos[ia].x, pos[ia].y);
        ctx.lineTo(pos[ib].x, pos[ib].y);
        ctx.stroke();
      }

      // travelling energy pulses
      for (let k = 0; k < 7 && edges.length > 0; k++) {
        const edge = edges[Math.floor(((t * 7 * animate + k * 37) % edges.length + edges.length) % edges.length)];
        const f = ((t * 0.5 * animate + k * 0.27) % 1 + 1) % 1;
        const ex = pos[edge.a].x + (pos[edge.b].x - pos[edge.a].x) * f;
        const ey = pos[edge.a].y + (pos[edge.b].y - pos[edge.a].y) * f;
        const pg = ctx.createRadialGradient(ex, ey, 0, ex, ey, 9);
        pg.addColorStop(0, "rgba(210, 220, 255, 0.95)");
        pg.addColorStop(0.4, "rgba(150, 155, 255, 0.35)");
        pg.addColorStop(1, "rgba(120, 130, 255, 0)");
        ctx.fillStyle = pg;
        ctx.beginPath();
        ctx.arc(ex, ey, 9, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      rafRef.current = requestAnimationFrame(frame);
    };

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [visible, reduced, finish]);

  if (!visible) return null;

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${BRAND.name} introduction`}
      className="fixed inset-0 z-[95] overflow-hidden bg-[#05070d] text-white"
      style={{ background: "radial-gradient(ellipse at 50% 47%, #0c1230 0%, #070a15 58%, #04060c 100%)" }}
    >
      <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 h-full w-full" />

      {/* base glow, also acts as fallback if canvas is unavailable */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[47%] h-[340px] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/20 blur-[90px]" />
        <div className="absolute left-[46%] top-[50%] h-[180px] w-[180px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-500/20 blur-[70px]" />
      </div>

      {/* Brand */}
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center">
        <p
          className="mb-3 text-[10px] font-semibold uppercase tracking-[0.42em] text-indigo-300/80 transition-opacity duration-1000 sm:text-[11px]"
          style={{ opacity: phase >= 1 ? 1 : 0 }}
        >
          Intelligence, organised
        </p>
        <h1
          className="bg-gradient-to-r from-white via-indigo-100 to-violet-200 bg-clip-text text-transparent"
          style={{
            fontSize: "clamp(1.55rem, 6.2vw, 3.9rem)",
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: "0.2em",
            opacity: phase >= 1 ? 1 : 0,
            transition: "opacity 1100ms ease"
          }}
        >
          {BRAND.name.toUpperCase()}
        </h1>
        <p
          className="mt-3 text-[12px] tracking-wide text-white/60 sm:text-sm"
          style={{
            opacity: phase >= 1 ? 1 : 0,
            transform: phase >= 1 ? "translateY(0)" : "translateY(8px)",
            transition: "opacity 1100ms ease 380ms, transform 1100ms cubic-bezier(.2,.7,.2,1) 380ms"
          }}
        >
          {BRAND.tagline}
        </p>
        <p
          className="mt-6 text-[10px] uppercase tracking-[0.3em] text-white/25"
          style={{ opacity: phase >= 1 ? 1 : 0, transition: "opacity 1200ms ease 900ms" }}
        >
          Entering your workspace
        </p>
      </div>

      {/* Progress */}
      <div aria-hidden="true" className="absolute inset-x-0 bottom-0 z-20 h-px bg-white/5">
        <div ref={progressRef} className="h-full bg-gradient-to-r from-indigo-400 to-violet-400 transition-[width] duration-150 ease-linear" style={{ width: "0%" }} />
      </div>
      <p className="sr-only">Cinematic introduction. This screen closes automatically.</p>
    </div>
  );
}
