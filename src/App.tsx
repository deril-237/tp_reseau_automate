import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type ChangeEvent,
} from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import {
  Network,
  StateEnum,
  type Identifier,
  type IMachine,
} from "./domain/Network";

// ─── Interfaces pour les données du graphe ───────────────────────────────────
interface CustomNode {
  id: Identifier;
  machine: IMachine;
  x?: number;
  y?: number;
}

// ─── Configuration des Styles Canvas ─────────────────────────────────────────
const NODE_RADIUS = 14;

const STATE_STYLE: Record<
  StateEnum,
  { fill: string; ring: string; label: string; text: string }
> = {
  [StateEnum.HEALTHY]: {
    fill: "#0b2e18",
    ring: "#22c55e",
    label: "SAIN",
    text: "#22c55e",
  },
  [StateEnum.INFECTED]: {
    fill: "#2e0b0b",
    ring: "#ef4444",
    label: "INFECTÉ",
    text: "#ef4444",
  },
  [StateEnum.RESTORED]: {
    fill: "#0b1a2e",
    ring: "#60a5fa",
    label: "RÉTABLI",
    text: "#60a5fa",
  },
};

// ─── Réseau Initial ──────────────────────────────────────────────────────────
function makeInitialNetwork(beta: number, gamma: number): Network {
  return new Network(
    {
      0: { id: 0, state: StateEnum.INFECTED, ticksSinceInfection: 3 },
      1: { id: 1, state: StateEnum.HEALTHY, ticksSinceInfection: 0 },
    },
    { 0: [1], 1: [0] },
    beta,
    gamma,
  );
}

let nodeCounter = 2;
const nextNodeId = (): Identifier => nodeCounter++ as Identifier;

// ─── Sous-composants UI ──────────────────────────────────────────────────────
function SliderRow({
  label,
  sub,
  value,
  onChange,
  accentColor,
  textColor,
}: {
  label: string;
  sub: string;
  value: number;
  onChange: (v: number) => void;
  accentColor: string;
  textColor: string;
}) {
  return (
    <div className="mb-5">
      <div className="flex justify-between mb-2">
        <span className="text-[13px] text-slate-300 font-medium">
          {label} <span className="text-slate-500">({sub})</span>
        </span>
        <span className={`text-[13px] font-bold font-mono ${textColor}`}>
          {value.toFixed(2)}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          onChange(parseFloat(e.target.value))
        }
        className="w-full h-1 rounded-full appearance-none cursor-pointer"
        style={{
          background: `linear-gradient(to right, ${accentColor} 0%, ${accentColor} ${value * 100}%, #1e293b ${value * 100}%, #1e293b 100%)`,
          accentColor,
        }}
      />
    </div>
  );
}

function StateBadge({ state }: { state: StateEnum }) {
  const s = STATE_STYLE[state];
  return (
    <span
      className="text-[11px] font-bold font-mono px-2 py-1 rounded border"
      style={{ color: s.text, borderColor: s.ring + "80", background: s.fill }}
    >
      {s.label}
    </span>
  );
}

// ─── Composant Principal ─────────────────────────────────────────────────────
export default function CyberSandbox() {
  const graphRef = useRef<ForceGraphMethods>(undefined);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── États du Domaine ──
  const [beta, setBeta] = useState(0.5);
  const [gamma, setGamma] = useState(0.2);
  const networkRef = useRef<Network>(makeInitialNetwork(beta, gamma));

  // ── États de l'UI ──
  const [machines, setMachines] = useState<
    Readonly<Record<Identifier, IMachine>>
  >(networkRef.current.getMachines());
  const [automaton, setAutomaton] = useState<
    Readonly<Record<Identifier, Identifier[]>>
  >(networkRef.current.getAutomaton());
  const [iteration, setIteration] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedId, setSelectedId] = useState<Identifier | null>(1);
  const [linkTarget, setLinkTarget] = useState<string>("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dimensions, setDimensions] = useState({ width: 500, height: 400 });

  // Cache persistant pour préserver l'emplacement géographique des nœuds
  const nodePositionsRef = useRef<Record<Identifier, { x: number; y: number }>>(
    {
      0: { x: -60, y: 0 },
      1: { x: 60, y: 0 },
    },
  );

  // ── Structure de données explicite pour react-force-graph ──
  const graphData: {
    nodes: CustomNode[];
    links: { source: Identifier; target: Identifier }[];
  } = {
    nodes: Object.values(machines).map((m) => {
      const cached = nodePositionsRef.current[m.id];
      return {
        id: m.id,
        machine: m,
        x: cached ? cached.x : undefined,
        y: cached ? cached.y : undefined,
      };
    }),
    links: Object.entries(automaton).flatMap(([fromId, neighbors]) =>
      neighbors
        .filter((toId) => toId > Number(fromId))
        .map((toId) => ({
          source: Number(fromId) as Identifier,
          target: toId,
        })),
    ),
  };

  // ── Synchronisation Domaine -> UI ──
  const syncState = useCallback(() => {
    const net = networkRef.current;
    setMachines({ ...net.getMachines() });
    setAutomaton({ ...net.getAutomaton() });
    setIteration(net.getNbIteration());
  }, []);

  // ── Désactivation complète de la force d'attraction/répulsion ──
  useEffect(() => {
    if (!graphRef.current) return;
    const sim = graphRef.current.d3Force;

    sim("charge", null); // Coupe la répulsion entre nœuds
    sim("link", null); // Coupe l'effet élastique des liens
    sim("center", null); // Empêche le récentrage automatique persistant
  }, [machines, automaton]);

  // Sauvegarde de la position après un glisser-déposer (Drag End)
  const handleNodeDragEnd = (node: any) => {
    nodePositionsRef.current[node.id] = { x: node.x, y: node.y };
  };

  // ── ResizeObserver pour adapter la taille du canvas conteneur ──
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ── Contrôles d'exécution de la simulation ──
  const doStep = useCallback(() => {
    networkRef.current.nextStep();
    syncState();
  }, [syncState]);

  const start = useCallback(() => {
    if (intervalRef.current) return;
    setIsRunning(true);
    intervalRef.current = setInterval(doStep, 700);
  }, [doStep]);

  const pause = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsRunning(false);
  }, []);

  const restart = useCallback(() => {
    pause();
    nodeCounter = 2;
    nodePositionsRef.current = {
      0: { x: -60, y: 0 },
      1: { x: 60, y: 0 },
    };
    networkRef.current = makeInitialNetwork(beta, gamma);
    setSelectedId(1);
    syncState();
    setTimeout(() => graphRef.current?.zoomToFit(200, 50), 100);
  }, [pause, beta, gamma, syncState]);

  useEffect(
    () => () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    },
    [],
  );

  const handleBetaChange = (v: number) => {
    setBeta(v);
    networkRef.current.setProbabilityOfInjection(v);
  };

  const handleGammaChange = (v: number) => {
    setGamma(v);
    networkRef.current.setProbabilityOfRestoration(v);
  };

  // ── Actions Topologiques ──
  const generateRandom = () => {
    pause();
    nodeCounter = 0;
    nodePositionsRef.current = {};
    const count = 5 + Math.floor(Math.random() * 5);
    const net = Network.initRandomNetwork(count, 0.3, 0.15, beta, gamma);
    networkRef.current = net;
    const ids = Object.keys(net.getMachines()).map(Number) as Identifier[];
    nodeCounter = Math.max(...ids) + 1;
    setSelectedId(null);
    syncState();
    setTimeout(() => graphRef.current?.zoomToFit(400, 50), 100);
  };

  const addNode = () => {
    const id = nextNodeId();
    nodePositionsRef.current[id] = {
      x: (Math.random() - 0.5) * 160,
      y: (Math.random() - 0.5) * 160,
    };
    networkRef.current.addNode(id, StateEnum.HEALTHY);
    syncState();
  };

  const deleteNode = (id: Identifier) => {
    networkRef.current.removeNode(id);
    delete nodePositionsRef.current[id];
    if (selectedId === id) setSelectedId(null);
    syncState();
  };

  const deleteEdge = (a: Identifier, b: Identifier) => {
    networkRef.current.removeNeighbor(a, b);
    syncState();
  };

  const addLink = () => {
    const target = Number(linkTarget) as Identifier;
    if (selectedId === null || !linkTarget || selectedId === target) return;
    networkRef.current.addNeighbor(selectedId, target);
    setLinkTarget("");
    syncState();
  };

  // ── Dessin Canvas Customisé des Nœuds ──
  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const cx = node.x ?? 0;
      const cy = node.y ?? 0;
      const machine: IMachine = node.machine;
      if (!machine) return;

      const style = STATE_STYLE[machine.state];
      const isSelected = selectedId === node.id;

      nodePositionsRef.current[node.id] = { x: cx, y: cy };

      // Anneau bleu externe de sélection
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(cx, cy, NODE_RADIUS + 4, 0, Math.PI * 2);
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      }

      // Effet de lueur Cyberpunk (Glow)
      ctx.save();
      ctx.shadowColor = style.ring;
      ctx.shadowBlur = isSelected ? 20 : 10;
      ctx.beginPath();
      ctx.arc(cx, cy, NODE_RADIUS, 0, Math.PI * 2);
      ctx.strokeStyle = style.ring;
      ctx.lineWidth = isSelected ? 2.5 : 1.5;
      ctx.stroke();
      ctx.restore();

      // Fond plein
      ctx.beginPath();
      ctx.arc(cx, cy, NODE_RADIUS - 1, 0, Math.PI * 2);
      ctx.fillStyle = style.fill;
      ctx.fill();

      // Texte ID (M0, M1...)
      ctx.fillStyle = style.text;
      ctx.font = "bold 7px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`M${node.id}`, cx, cy - 3);

      // Texte d'état (SAIN, INFECTÉ...)
      ctx.font = "bold 4px monospace";
      ctx.fillText(style.label, cx, cy + 4);
    },
    [selectedId],
  );

  // ── Option 1 : Définition de la zone réactive au pointeur (Typée de manière stricte) ──
  const paintPointerArea = useCallback((node: any, color: any, ctx: any) => {
    const cx = node.x ?? 0;
    const cy = node.y ?? 0;
    ctx.beginPath();
    ctx.arc(cx, cy, NODE_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }, []);

  // ── Données UI calculées ──
  const selected = selectedId !== null ? (machines[selectedId] ?? null) : null;
  const neighbors = selected ? (automaton[selectedId!] ?? []) : [];
  const linkableNodes = Object.values(machines).filter(
    (m) => m.id !== selectedId && !neighbors.includes(m.id),
  );
  const metrics = networkRef.current.getMetrics();

  const panel = "bg-[#0f1729] border border-[#1e3a5f]/60 rounded-xl";
  const sectionLabel =
    "text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-3";

  return (
    <div className="min-h-screen bg-[#080e1a] text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-b-[#1e3a5f]/40 shrink-0">
        <div className="w-9 h-9 rounded-lg bg-blue-900/60 border border-blue-700/50 flex items-center justify-center text-blue-400 text-lg shrink-0">
          ⬡
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[15px] font-bold text-blue-300 leading-tight truncate">
            Maquette Cyber-Sandbox : Propagation de Ver
          </h1>
          <p className="text-[11px] text-slate-500">
            Topologie Fixe Interactif (Types Corrigés)
          </p>
        </div>
        <button
          className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 shrink-0"
          onClick={() => setSidebarOpen((o) => !o)}
        >
          ☰
        </button>
      </header>

      {/* Body Grid */}
      <main className="flex-1 flex flex-col md:grid md:grid-cols-[260px_1fr_280px] gap-3 p-3 overflow-auto min-h-0">
        {/* PARAMS (LEFT) */}
        <aside
          className={`${panel} p-4 flex flex-col ${sidebarOpen ? "" : "hidden md:flex"}`}
        >
          <p className={sectionLabel}>1. Paramètres globaux</p>
          <SliderRow
            label="Probabilité d'infection"
            sub="β"
            value={beta}
            onChange={handleBetaChange}
            accentColor="#3b82f6"
            textColor="text-blue-400"
          />
          <SliderRow
            label="Probabilité de guérison"
            sub="γ"
            value={gamma}
            onChange={handleGammaChange}
            accentColor="#22c55e"
            textColor="text-green-400"
          />

          <div className="border-t border-[#1e3a5f]/40 pt-4 mt-1">
            <p className={sectionLabel}>Génération initiale</p>
            <button
              onClick={generateRandom}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg border border-slate-700 text-slate-300 text-[13px] hover:border-slate-500 hover:text-white transition mb-2"
            >
              <span>⬡</span> Générer Réseau Aléatoire
            </button>
            <button
              onClick={addNode}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[13px] font-medium transition"
            >
              <span>+</span> Ajouter un Nœud Statique
            </button>
          </div>

          <div className="border-t border-[#1e3a5f]/40 pt-4 mt-4">
            <p className={sectionLabel}>Légende</p>
            {Object.entries(STATE_STYLE).map(([k, s]) => (
              <div key={k} className="flex items-center gap-2 mb-1.5">
                <span
                  className="w-3 h-3 rounded-full border-2 shrink-0"
                  style={{ borderColor: s.ring, background: s.fill }}
                />
                <span className="text-[12px] text-slate-400 font-mono">
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          <div className="border-t border-[#1e3a5f]/40 pt-4 mt-auto">
            <p className={sectionLabel}>Info simulation</p>
            <div className="space-y-1 text-[12px] font-mono">
              <p className="text-slate-400">
                β ={" "}
                <span className="text-blue-400 font-bold">
                  {beta.toFixed(2)}
                </span>
                {"  "}γ ={" "}
                <span className="text-green-400 font-bold">
                  {gamma.toFixed(2)}
                </span>
              </p>
              <p className="text-slate-400">
                Nœuds :{" "}
                <span className="text-slate-200">
                  {Object.keys(machines).length}
                </span>
                {"  "}Liens :{" "}
                <span className="text-slate-200">
                  {Object.values(automaton).reduce((s, a) => s + a.length, 0) /
                    2}
                </span>
              </p>
            </div>
          </div>
        </aside>

        {/* GRAPH VIEW (CENTER) */}
        <section className="flex flex-col gap-3 min-h-0">
          <div
            ref={containerRef}
            className={`${panel} flex-1 relative overflow-hidden min-h-[300px]`}
          >
            <div className="absolute top-3 right-3 z-10 bg-[#0a1422] border border-slate-700 rounded-md px-3 py-1 text-[13px] font-mono text-slate-300 select-none">
              Itération :{" "}
              <span className="text-yellow-400 font-bold">{iteration}</span>
            </div>

            <ForceGraph2D
              ref={graphRef}
              width={dimensions.width}
              height={dimensions.height}
              graphData={graphData}
              nodeCanvasObject={paintNode}
              nodePointerAreaPaint={paintPointerArea}
              backgroundColor="#080e1a"
              linkColor={() => "#334155"}
              linkWidth={1.5}
              onNodeClick={(node) => setSelectedId(node.id as Identifier)}
              onBackgroundClick={() => setSelectedId(null)}
              onNodeDragEnd={handleNodeDragEnd}
              cooldownTicks={0}
            />

            <div className="absolute bottom-2 left-3 z-10">
              <p className="text-[11px] text-slate-500 flex items-center gap-1 bg-[#080e1a]/90 px-2 py-1 rounded border border-slate-800">
                <span className="text-slate-400">ℹ</span>
                Graphe statique : Aucun effet d'attraction. Glissez un nœud pour
                fixer sa place.
              </p>
            </div>
          </div>

          {/* Controls bar */}
          <div className={`${panel} p-3 flex gap-2 flex-wrap shrink-0`}>
            <button
              onClick={start}
              disabled={isRunning}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-[13px] font-medium transition"
            >
              ▶ Démarrer
            </button>
            <button
              onClick={pause}
              disabled={!isRunning}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white text-[13px] font-medium transition"
            >
              ⏸ Pause
            </button>
            <button
              onClick={doStep}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 text-white text-[13px] font-medium transition"
            >
              ⏩ Suivant (t+1)
            </button>
            <button
              onClick={restart}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-900/70 hover:bg-red-800 border border-red-700/50 text-red-300 text-[13px] font-medium transition ml-auto"
            >
              ↺ Recommencer
            </button>
          </div>
        </section>

        {/* INSPECTOR (RIGHT) */}
        <aside className={`${panel} p-4 flex flex-col gap-4 overflow-y-auto`}>
          <div>
            <p className={sectionLabel}>2. Inspecteur de nœud</p>
            <div className="rounded-lg border border-[#1e3a5f]/60 p-3 bg-[#0a1422] mb-3">
              <p className="text-[10px] text-slate-500 mb-1">ID Sélectionné</p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15px] font-bold text-slate-100">
                  {selected !== null ? `Machine M${selectedId}` : "—"}
                </span>
                {selected !== null && <StateBadge state={selected.state} />}
              </div>
            </div>

            {selected !== null && (
              <>
                <p className="text-[12px] text-slate-400 mb-3">
                  Ticks depuis infection :{" "}
                  <span className="font-bold text-slate-200 font-mono">
                    {selected.ticksSinceInfection}
                  </span>
                </p>
                <button
                  onClick={() => deleteNode(selectedId!)}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-red-900/40 hover:bg-red-900/70 border border-red-700/50 text-red-400 text-[13px] transition mb-1"
                >
                  🗑 Supprimer le nœud
                </button>
              </>
            )}
          </div>

          {/* Adjacent connections */}
          {selected !== null && (
            <div>
              <p className={sectionLabel}>Liens adjacents (voisins)</p>
              <div className="flex flex-col gap-1.5 mb-4 max-h-40 overflow-y-auto">
                {neighbors.length === 0 && (
                  <p className="text-[12px] text-slate-600 italic">
                    Aucun voisin
                  </p>
                )}
                {neighbors.map((nid) => (
                  <div
                    key={nid}
                    className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-700/60 bg-[#0a1422]"
                  >
                    <span className="text-[13px] text-slate-300 flex items-center gap-2">
                      <span className="text-slate-500 text-xs">🔗</span>
                      Machine M{nid}
                    </span>
                    <button
                      onClick={() => deleteEdge(selectedId!, nid)}
                      className="text-red-500 hover:text-red-400 transition text-sm ml-2 shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <p className="text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-2">
                Créer une connexion :
              </p>
              <div className="flex gap-2">
                <select
                  value={linkTarget}
                  onChange={(e) => setLinkTarget(e.target.value)}
                  className="flex-1 bg-[#0a1422] border border-slate-700 rounded-lg px-3 py-2 text-[13px] text-slate-300 focus:outline-none focus:border-blue-500 min-w-0"
                >
                  <option value="">Choisir un nœud...</option>
                  {linkableNodes.map((m) => (
                    <option key={m.id} value={m.id}>
                      Machine M{m.id}
                    </option>
                  ))}
                </select>
                <button
                  onClick={addLink}
                  disabled={!linkTarget}
                  className="px-3 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white text-[13px] font-medium transition whitespace-nowrap shrink-0"
                >
                  + Lier
                </button>
              </div>
            </div>
          )}

          {/* Global metrics */}
          <div className="border-t border-[#1e3a5f]/40 pt-4 mt-auto">
            <p className={sectionLabel}>Statistiques réseau</p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  {
                    key: "HEALTHY",
                    label: "SAIN",
                    color: "#22c55e",
                    fill: "#0b2e18",
                  },
                  {
                    key: "INFECTED",
                    label: "INFECTÉ",
                    color: "#ef4444",
                    fill: "#2e0b0b",
                  },
                  {
                    key: "RESTORED",
                    label: "RÉTABLI",
                    color: "#60a5fa",
                    fill: "#0b1a2e",
                  },
                ] as const
              ).map(({ key, label, color, fill }) => (
                <div
                  key={key}
                  className="rounded-lg p-2 text-center border"
                  style={{ background: fill, borderColor: color + "40" }}
                >
                  <p
                    className="text-[20px] font-bold font-mono"
                    style={{ color }}
                  >
                    {metrics[key]}
                  </p>
                  <p
                    className="text-[8px] font-mono mt-0.5 leading-tight"
                    style={{ color }}
                  >
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
