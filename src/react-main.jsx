import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './tailwind.css';

const initialMetrics = { tick: 0, nodes: 0, entropy: 0, strength: 0, regime: 'BOOTING' };

function readMetrics() {
  const engine = window.__hakari;
  const nodes = engine?.aliveNodes?.() ?? [];
  const entropy = Number(engine?.entropyField?.normalized ?? engine?.entropyField?.S ?? 0);
  const strength = nodes.length
    ? nodes.reduce((total, node) => total + Number(node.strength ?? 0), 0) / nodes.length
    : 0;
  return {
    tick: Number(engine?.tick ?? 0),
    nodes: nodes.length,
    entropy: Number.isFinite(entropy) ? entropy : 0,
    strength: Number.isFinite(strength) ? strength : 0,
    regime: engine?.phaseDetector?.phase ?? engine?.stabilityAnalyzer?.regime ?? 'ACTIVE',
  };
}

function SemanticOrb({ metrics }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    let frame;
    let started = performance.now();

    const draw = (now) => {
      const elapsed = (now - started) / 1000;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const ratio = window.devicePixelRatio || 1;
      if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
        canvas.width = width * ratio;
        canvas.height = height * ratio;
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
      }

      const centerX = width / 2;
      const centerY = height / 2;
      const entropy = Math.max(0, Math.min(1, metrics.entropy));
      const strength = Math.max(0, Math.min(1, metrics.strength));
      const orbit = 18 + entropy * 22;
      const angle = elapsed * (0.45 + entropy * 1.2) + metrics.tick * 0.003;
      const x = centerX + Math.cos(angle) * orbit;
      const y = centerY + Math.sin(angle * 1.25) * orbit * 0.62;
      const radius = 7 + strength * 12 + Math.sin(elapsed * 3) * 1.5;

      context.clearRect(0, 0, width, height);
      context.fillStyle = '#e8dfc8';
      context.fillRect(0, 0, width, height);
      context.strokeStyle = 'rgba(28,26,20,0.1)';
      context.lineWidth = 1;
      context.beginPath();
      context.arc(centerX, centerY, orbit, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(centerX, 8);
      context.lineTo(centerX, height - 8);
      context.moveTo(8, centerY);
      context.lineTo(width - 8, centerY);
      context.stroke();

      const glow = context.createRadialGradient(x, y, 0, x, y, radius * 3.5);
      glow.addColorStop(0, 'rgba(200,75,47,0.42)');
      glow.addColorStop(1, 'rgba(200,75,47,0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(x, y, radius * 3.5, 0, Math.PI * 2);
      context.fill();

      context.fillStyle = entropy > 0.66 ? '#8c3520' : entropy > 0.33 ? '#c84b2f' : '#b87a30';
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#1c1a14';
      context.font = '9px Share Tech Mono, monospace';
      context.fillText(metrics.regime, 8, height - 10);
      context.fillText(`${metrics.nodes} nodes · S ${entropy.toFixed(2)}`, 8, 15);
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [metrics]);

  return <canvas ref={canvasRef} className="h-36 w-full border border-[#1c1a1420]" aria-label="Moving semantic state orb" />;
}

function Metric({ label, value }) {
  return <div className="flex items-center justify-between border-b border-[#1c1a1418] py-1.5"><span className="text-[9px] uppercase tracking-[0.16em] text-[#4a4535]">{label}</span><strong className="font-mono text-xs text-[#c84b2f]">{value}</strong></div>;
}

function ControlRoom() {
  const [open, setOpen] = useState(true);
  const [metrics, setMetrics] = useState(initialMetrics);
  const [health, setHealth] = useState({ state: 'checking', provider: '—', model: '—' });
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => setMetrics(readMetrics()), 250);
    return () => window.clearInterval(timer);
  }, []);

  const checkProvider = async () => {
    setHealth((current) => ({ ...current, state: 'checking' }));
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      setHealth({ state: data.keyConfigured ? 'ready' : 'missing-key', provider: data.provider, model: data.model });
    } catch (error) {
      setHealth({ state: 'offline', provider: '—', model: error.message });
    }
  };

  useEffect(() => { checkProvider(); }, []);

  const runQuery = async (event) => {
    event.preventDefault();
    if (!query.trim()) return;
    try {
      await window.__hakari?.query?.(query.trim());
      setMessage('QUERY SENT TO HAKARI');
      setQuery('');
    } catch (error) {
      setMessage(`API ERROR: ${error.message}`);
    }
  };

  if (!open) return <button onClick={() => setOpen(true)} className="fixed bottom-5 left-5 z-[95] border-2 border-[#b87a30] bg-[#1c1a14] px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-[#f0ead8]">Open HAKARI room</button>;

  return <section className="fixed bottom-5 left-5 z-[95] w-[min(19rem,calc(100vw-2.5rem))] border border-[#1c1a14] bg-[#f0ead8]/95 p-3 text-[#1c1a14] shadow-[0_12px_36px_rgba(28,26,20,0.28)] backdrop-blur-sm">
    <header className="mb-3 flex items-start justify-between border-b border-[#1c1a14] pb-2">
      <div><div className="font-mono text-[9px] uppercase tracking-[0.2em] text-[#b87a30]">HAKARI</div><h2 className="font-serif text-base">Cognitive Simulation Engine</h2></div>
      <button onClick={() => setOpen(false)} className="font-mono text-sm text-[#c84b2f]" aria-label="Close HAKARI control room">×</button>
    </header>
    <SemanticOrb metrics={metrics} />
    <div className="mt-2"><Metric label="Tick" value={metrics.tick} /><Metric label="Nodes" value={metrics.nodes} /><Metric label="Entropy" value={metrics.entropy.toFixed(3)} /><Metric label="Regime" value={metrics.regime} /></div>
    <div className="mt-3 border-t border-[#1c1a1418] pt-2"><div className="flex items-center justify-between"><span className="font-mono text-[9px] uppercase tracking-widest text-[#4a4535]">Provider</span><span className={`font-mono text-[9px] uppercase ${health.state === 'ready' ? 'text-[#5a6b44]' : 'text-[#c84b2f]'}`}>{health.state}</span></div><div className="mt-1 truncate font-mono text-[9px] text-[#4a4535]">{health.provider} · {health.model}</div><button onClick={checkProvider} className="mt-2 border border-[#1c1a14] px-2 py-1 font-mono text-[9px] uppercase tracking-wider">Check API</button></div>
    <form onSubmit={runQuery} className="mt-3 flex border border-[#1c1a14] bg-[#e8dfc8]"><input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent px-2 py-2 font-mono text-[10px] outline-none" placeholder="ask HAKARI..." /><button className="border-l border-[#1c1a14] px-2 text-[#c84b2f]">↗</button></form>
    {message && <p className="mt-2 font-mono text-[9px] text-[#4a4535]">{message}</p>}
  </section>;
}

createRoot(document.getElementById('hakari-react-root')).render(<ControlRoom />);
