export interface MermaidNode {
  id: string;
  rawText: string;
  label: string;
  etapa: string | null;
  type: 'rect' | 'diamond' | 'oval';
  lane: string;
}
export interface MermaidEdge {
  from: string;
  to: string;
  label?: string;
}
export interface MermaidGraph {
  lanes: { name: string; nodeIds: string[] }[];
  nodes: Record<string, MermaidNode>;
  edges: MermaidEdge[];
}

function cleanLabel(t: string): string {
  return t.replace(/^\"|\"$/g, '').replace(/<br\s*\/?\s*>/gi, '<br>').trim();
}

function extractEtapa(label: string): string | null {
  const m = label.match(/PR-\d{3}-\d{2}/);
  return m ? m[0] : null;
}

function detectType(line: string): 'rect' | 'diamond' | 'oval' | null {
  if (/\{\"[^}]*\"\}/.test(line) || /\{[^}]+\}/.test(line)) return 'diamond';
  if (/\(\(\"?[^)]+\"?\)\)/.test(line)) return 'oval';
  if (/\[\"[^\]]+\"\]/.test(line) || /\[[^\]]+\]/.test(line)) return 'rect';
  return null;
}

function parseNodeLine(line: string): MermaidNode | null {
  const trimmed = line.trim();
  // Diamond: Id{"text"} or Id{text}
  let m = trimmed.match(/^([A-Za-z0-9_]+)\{\"?([\s\S]*?)\"?\}\s*$/);
  if (m) {
    const label = cleanLabel(m[2]);
    return { id: m[1], rawText: label, label, etapa: extractEtapa(label), type: 'diamond', lane: '' };
  }
  // Oval: Id(("text")) or Id((text))
  m = trimmed.match(/^([A-Za-z0-9_]+)\(\(\"?([\s\S]*?)\"?\)\)\s*$/);
  if (m) {
    const label = cleanLabel(m[2]);
    return { id: m[1], rawText: label, label, etapa: extractEtapa(label), type: 'oval', lane: '' };
  }
  // Rect: Id["text"] or Id[text]
  m = trimmed.match(/^([A-Za-z0-9_]+)\[\"?([\s\S]*?)\"?\]\s*$/);
  if (m) {
    const label = cleanLabel(m[2]);
    return { id: m[1], rawText: label, label, etapa: extractEtapa(label), type: 'rect', lane: '' };
  }
  return null;
}

// Returns the node id and the remainder (rest of the line after the node shape) when a definition appears inline.
function extractInlineNode(token: string): { id: string; node?: MermaidNode } {
  const node = parseNodeLine(token);
  if (node) return { id: node.id, node };
  // Fallback: id only
  const m = token.match(/^([A-Za-z0-9_]+)/);
  return { id: m ? m[1] : token };
}

function parseEdges(line: string, registerNode: (n: MermaidNode) => void): MermaidEdge[] {
  // Split line by --> while capturing optional labels: A -- "Sim" --> B
  // Normalize: handle pattern token (-- "label" -->|--> ) token chains
  const edges: MermaidEdge[] = [];
  const pattern = /\s*(--\s*\"([^\"]*)\"\s*-->|-->|--\|([^|]*)\|-->)\s*/g;
  // Split by edge ops while keeping labels
  const parts: string[] = [];
  const labels: (string | undefined)[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(line)) !== null) {
    parts.push(line.substring(lastIdx, m.index));
    labels.push(m[2] || m[3] || undefined);
    lastIdx = pattern.lastIndex;
  }
  parts.push(line.substring(lastIdx));
  if (labels.length === 0) return [];
  // Each consecutive pair of parts is an edge
  const ids: string[] = parts.map((p) => {
    const tok = p.trim();
    const { id, node } = extractInlineNode(tok);
    if (node) registerNode(node);
    return id;
  });
  for (let i = 0; i < ids.length - 1; i++) {
    edges.push({ from: ids[i], to: ids[i + 1], label: labels[i] });
  }
  return edges;
}

export function parseMermaid(text: string): MermaidGraph {
  const lines = text.split(/\r?\n/);
  const lanes: { name: string; nodeIds: string[] }[] = [];
  const nodes: Record<string, MermaidNode> = {};
  const edges: MermaidEdge[] = [];
  let currentLane: string | null = null;

  const registerNode = (n: MermaidNode) => {
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
      currentLane = sg[1].trim().replace(/^\"|\"$/g, '');
      lanes.push({ name: currentLane, nodeIds: [] });
      continue;
    }
    if (/^\s*end\s*$/.test(line)) {
      currentLane = null;
      continue;
    }
    // Try parse as node-only line
    const n = parseNodeLine(line);
    if (n) {
      registerNode(n);
      continue;
    }
    // Otherwise: treat as edge line
    if (/-->/.test(line)) {
      const es = parseEdges(line, registerNode);
      edges.push(...es);
    }
  }
  return { lanes, nodes, edges };
}
