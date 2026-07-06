import { useEffect, useRef, useState } from "react";

export function AetherField() {
  const reduced = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [failed, setFailed] = useState(false); const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (reduced) return;
    const canvas = canvasRef.current; if (!canvas) return;
    let context: CanvasRenderingContext2D | null = null; try { context = canvas.getContext("2d"); } catch { setFailed(true); return; }
    if (!context) { setFailed(true); return; }
    const dots = Array.from({ length: 64 }, (_, index) => ({ x: ((index * 37) % 101) / 100, y: ((index * 61) % 97) / 96, depth: 0.25 + (index % 7) / 9 }));
    let frame = 0; let last = 0; let stopped = false; const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const resize = () => { const box = canvas.getBoundingClientRect(); canvas.width = Math.max(1, Math.floor(box.width * dpr)); canvas.height = Math.max(1, Math.floor(box.height * dpr)); };
    const draw = (time: number) => { if (stopped) return; frame = requestAnimationFrame(draw); if (document.hidden || time - last < 22) return; last = time; resize(); context!.clearRect(0, 0, canvas.width, canvas.height); for (const dot of dots) { const pulse = 0.55 + Math.sin(time * 0.00035 + dot.x * 9) * 0.2; context!.fillStyle = `rgba(99,102,241,${pulse * dot.depth * 0.35})`; context!.beginPath(); context!.arc(dot.x * canvas.width, dot.y * canvas.height, 0.7 + dot.depth * 1.5, 0, Math.PI * 2); context!.fill(); } };
    frame = requestAnimationFrame(draw); return () => { stopped = true; cancelAnimationFrame(frame); };
  }, [reduced]);
  if (reduced || failed) return <div className="aether-poster" data-testid="aether-poster" aria-hidden="true" />;
  return <canvas ref={canvasRef} className="aether-field" data-testid="aether-canvas" aria-hidden="true" />;
}
