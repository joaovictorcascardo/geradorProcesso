export interface Graph {
  lanes: Lane[];
  nodes: Record<string, Node>;
  edges: Edge[];
}

export interface Lane {
  name: string;
  nodeIds: string[];
}

export interface Node {
  id: string;
  label: string;
  rawText: string;
  etapa: string | null;
  type: 'rect' | 'diamond' | 'oval';
  lane: string;
}

export interface Edge {
  from: string;
  to: string;
  label?: string;
  hasArrow: boolean; // NOVO: Campo para saber se tem ponta de seta ou não
}

function cleanLabel(t: string): string {
  return t
    .replace(/^"|"$/g, '')
    .replace(/<br\s*\/?\s*>/gi, '<br>')
    .trim();
}

function extractEtapa(label: string): string | null {
  const m = label.match(/PR-\d{3}-\d{2}/);
  return m ? m[0] : null;
}

function parseNodeLine(line: string): Node | null {
  const trimmed = line.trim();

  let m = trimmed.match(/^([A-Za-z0-9_]+)\{\"?([\s\S]*?)\"?\}\s*$/);
  if (m) return { id: m[1], rawText: m[2], label: cleanLabel(m[2]), etapa: extractEtapa(cleanLabel(m[2])), type: 'diamond', lane: '' };

  m = trimmed.match(/^([A-Za-z0-9_]+)\(\(\"?([\s\S]*?)\"?\)\)\s*$/);
  if (m) return { id: m[1], rawText: m[2], label: cleanLabel(m[2]), etapa: extractEtapa(cleanLabel(m[2])), type: 'oval', lane: '' };

  m = trimmed.match(/^([A-Za-z0-9_]+)\[\"?([\s\S]*?)\"?\]\s*$/);
  if (m) return { id: m[1], rawText: m[2], label: cleanLabel(m[2]), etapa: extractEtapa(cleanLabel(m[2])), type: 'rect', lane: '' };

  return null;
}

function extractInlineNode(token: string): { id: string; node?: Node } {
  const node = parseNodeLine(token);
  if (node) return { id: node.id, node };
  const m = token.match(/^([A-Za-z0-9_]+)/);
  return { id: m ? m[1] : token };
}

function parseEdges(line: string, registerNode: (n: Node) => void): Edge[] {
  const edges: Edge[] = [];
  
  // REGEX MELHORADA: Agora pega --> (Com Seta) e --- (Sem Seta)
  const pattern = /\s*(?:--\s*"([^"]*)"\s*(-->|---)|(-->|---)|--\|([^|]*)\|\s*(-->|---))\s*/g;
  
  const parts: string[] = [];
  const labels: (string | undefined)[] = [];
  const arrows: boolean[] = [];

  let lastIdx = 0;
  let m;

  while ((m = pattern.exec(line)) !== null) {
    parts.push(line.substring(lastIdx, m.index));
    
    labels.push(m[1] || m[4] || undefined);
    
    const arrowMatch = m[2] || m[3] || m[5];
    arrows.push(arrowMatch === '-->'); // Se for -->, tem seta (true). Se for --- (false)

    lastIdx = pattern.lastIndex;
  }
  parts.push(line.substring(lastIdx));

  if (labels.length === 0) return [];

  const ids = parts.map((p) => {
    const { id, node } = extractInlineNode(p.trim());
    if (node) registerNode(node);
    return id;
  });

  for (let i = 0; i < ids.length - 1; i++) {
    edges.push({
      from: ids[i],
      to: ids[i + 1],
      label: labels[i],
      hasArrow: arrows[i], // Registra se a linha vai ter ponta ou não
    });
  }

  return edges;
}

export function parseMermaid(text: string): Graph {
  const lines = text.split(/\r?\n/);
  const lanes: Lane[] = [];
  const nodes: Record<string, Node> = {};
  const edges: Edge[] = [];
  let currentLane: string | null = null;

  const registerNode = (n: Node) => {
    if (!nodes[n.id]) {
      nodes[n.id] = { ...n, lane: currentLane || '' };
      if (currentLane) {
        const lane = lanes.find((l) => l.name === currentLane);
        if (lane && !lane.nodeIds.includes(n.id)) lane.nodeIds.push(n.id);
      }
    } else if (!nodes[n.id].lane && currentLane) {
      nodes[n.id].lane = currentLane;
      const lane = lanes.find((l) => l.name === currentLane);
      if (lane && !lane.nodeIds.includes(n.id)) lane.nodeIds.push(n.id);
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/%%.*$/, '').trimEnd();
    if (!line.trim()) continue;
    if (/^\s*flowchart\b/i.test(line) || /^\s*graph\b/i.test(line)) continue;

    const sg = line.match(/^\s*subgraph\s+(.+?)\s*$/);
    if (sg) {
      currentLane = sg[1].trim().replace(/^"|"$/g, '');
      lanes.push({ name: currentLane, nodeIds: [] });
      continue;
    }
    if (/^\s*end\s*$/.test(line)) {
      currentLane = null; continue;
    }

    const n = parseNodeLine(line);
    if (n) {
      registerNode(n); continue;
    }

    if (/-->|---/.test(line)) {
      edges.push(...parseEdges(line, registerNode));
    }
  }

  return { lanes, nodes, edges };
}