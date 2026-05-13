import type { Graph as MermaidGraph } from './mermaid-parser';
export interface LaidOutNode {
  id: string;
  label: string;
  rawText: string;
  etapa: string | null;
  type: 'rect' | 'diamond' | 'oval';
  lane: string;
  x: number;
  y: number;
  w: number;
  h: number;
  col: number;
  row: number;
  laneIdx: number;
}
export interface LaidOutLane {
  name: string;
  top: number;
  height: number;
  rows: number;
}
export interface Layout {
  lanes: LaidOutLane[];
  nodes: Record<string, LaidOutNode>;
  width: number;
  height: number;
  dropDowns: Set<string>;
  endNodes: Set<string>;
  startNodes: Set<string>;
}

const ROW_H = 175;
const COL_W = 200;
const LEFT_MARGIN = 80;
const RIGHT_PAD = 80;

function sizeFor(type: 'rect' | 'diamond' | 'oval'): { w: number; h: number } {
  if (type === 'diamond') return { w: 110, h: 100 };
  if (type === 'oval') return { w: 70, h: 50 };
  return { w: 150, h: 70 };
}

function detectBackEdges(graph: MermaidGraph): Set<string> {
  const backEdges = new Set<string>();
  const color: Record<string, number> = {}; // 0=white,1=gray,2=black
  const adj: Record<string, string[]> = {};
  for (const id in graph.nodes) {
    color[id] = 0;
    adj[id] = [];
  }
  for (const e of graph.edges) {
    if (graph.nodes[e.from] && graph.nodes[e.to]) adj[e.from].push(e.to);
  }
  const indeg: Record<string, number> = {};
  for (const id in graph.nodes) indeg[id] = 0;
  for (const e of graph.edges) {
    if (graph.nodes[e.to] && graph.nodes[e.from]) indeg[e.to] = (indeg[e.to] || 0) + 1;
  }
  // Iterative DFS to avoid stack overflow on large graphs
  function dfs(start: string) {
    const stack: { node: string; childIdx: number }[] = [{ node: start, childIdx: 0 }];
    color[start] = 1;
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const children = adj[frame.node];
      if (frame.childIdx >= children.length) {
        color[frame.node] = 2;
        stack.pop();
        continue;
      }
      const v = children[frame.childIdx++];
      if (color[v] === 1) {
        backEdges.add(frame.node + '->' + v);
      } else if (color[v] === 0) {
        color[v] = 1;
        stack.push({ node: v, childIdx: 0 });
      }
    }
  }
  // Roots first
  for (const id in graph.nodes) {
    if (color[id] === 0 && (indeg[id] || 0) === 0) dfs(id);
  }
  for (const id in graph.nodes) {
    if (color[id] === 0) dfs(id);
  }
  return backEdges;
}

function computeColumns(graph: MermaidGraph, backEdges: Set<string>): Record<string, number> {
  const ids = Object.keys(graph.nodes);
  const fwdAdj: Record<string, string[]> = {};
  const fwdIndeg: Record<string, number> = {};
  for (const id of ids) {
    fwdAdj[id] = [];
    fwdIndeg[id] = 0;
  }
  for (const e of graph.edges) {
    if (!graph.nodes[e.from] || !graph.nodes[e.to]) continue;
    if (backEdges.has(e.from + '->' + e.to)) continue;
    fwdAdj[e.from].push(e.to);
    fwdIndeg[e.to]++;
  }
  // Kahn's topo sort
  const topo: string[] = [];
  const queue: string[] = [];
  for (const id of ids) if (fwdIndeg[id] === 0) queue.push(id);
  while (queue.length) {
    const u = queue.shift()!;
    topo.push(u);
    for (const v of fwdAdj[u]) {
      fwdIndeg[v]--;
      if (fwdIndeg[v] === 0) queue.push(v);
    }
  }
  // Append any leftovers (shouldn't happen)
  for (const id of ids) if (!topo.includes(id)) topo.push(id);
  const cols: Record<string, number> = {};
  for (const id of topo) cols[id] = 0;
  for (const u of topo) {
    for (const v of fwdAdj[u]) {
      const c = (cols[u] || 0) + 1;
      if (c > (cols[v] || 0)) cols[v] = c;
    }
  }
  return cols;
}

function findEndNodes(graph: MermaidGraph): Set<string> {
  const endIds = new Set<string>();
  for (const id in graph.nodes) {
    const n = graph.nodes[id];
    const out = graph.edges.filter((e) => e.from === id && graph.nodes[e.to]);
    const isEndOval = n.type === 'oval' && /\b(end|fim|stop|t[ée]rmino)\b/i.test(n.label);
    if (isEndOval || out.length === 0) endIds.add(id);
  }
  return endIds;
}

function findStartNodes(graph: MermaidGraph): Set<string> {
  const startIds = new Set<string>();
  const indeg: Record<string, number> = {};
  for (const id in graph.nodes) indeg[id] = 0;
  for (const e of graph.edges) {
    if (graph.nodes[e.to] && graph.nodes[e.from]) indeg[e.to] = (indeg[e.to] || 0) + 1;
  }
  for (const id in graph.nodes) {
    const n = graph.nodes[id];
    const isStartOval = n.type === 'oval' && /\b(start|in[ií]cio|begin)\b/i.test(n.label);
    if (isStartOval || (indeg[id] || 0) === 0) startIds.add(id);
  }
  return startIds;
}

function distanceToNearest(graph: MermaidGraph, targets: Set<string>): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const id in graph.nodes) dist[id] = Infinity;
  for (const id of Array.from(targets)) dist[id] = 0;
  const reverseAdj: Record<string, string[]> = {};
  for (const e of graph.edges) {
    if (!graph.nodes[e.from] || !graph.nodes[e.to]) continue;
    if (!reverseAdj[e.to]) reverseAdj[e.to] = [];
    reverseAdj[e.to].push(e.from);
  }
  const q: string[] = Array.from(targets);
  while (q.length) {
    const u = q.shift()!;
    for (const p of reverseAdj[u] || []) {
      const nd = dist[u] + 1;
      if (nd < dist[p]) {
        dist[p] = nd;
        q.push(p);
      }
    }
  }
  return dist;
}

function identifyDropDowns(
  graph: MermaidGraph,
  endIds: Set<string>,
  inCount: Record<string, number>,
  _cols: Record<string, number>
): Set<string> {
  const dist = distanceToNearest(graph, endIds);
  const drops = new Set<string>();
  for (const id in graph.nodes) {
    const n = graph.nodes[id];
    if (n.type !== 'diamond') continue;
    const outs = graph.edges.filter((e) => e.from === id && graph.nodes[e.to]);
    if (outs.length < 2) continue;

    for (const e of outs) {
      const t = e.to;
      const tDist = dist[t];
      if (!isFinite(tDist) || tDist > 2) continue;
      if ((inCount[t] || 0) !== 1) continue; // must be exclusive to this branch
      // Check siblings: a sibling that has a longer path OR is a shared/merge node makes this branch a "dead-end"
      const siblings = outs.filter((o) => o.to !== t);
      const hasMainFlow = siblings.some((o) => {
        const sDist = dist[o.to];
        if (isFinite(sDist) && sDist > tDist + 1) return true;
        if ((inCount[o.to] || 0) > 1) return true; // sibling is a shared join (main flow)
        return false;
      });
      if (!hasMainFlow) continue;
      // The drop-down node should live in the same lane as the diamond (or lane is undefined)
      const fromLane = graph.nodes[id].lane;
      const toLane = graph.nodes[t].lane;
      if (toLane && toLane !== fromLane) continue;
      drops.add(t);
    }
  }
  return drops;
}

export function layoutGraph(graph: MermaidGraph): Layout {
  // Ensure all nodes have a lane (orphan ones go to a default lane)
  const laneNames = graph.lanes.map((l) => l.name);
  const orphanLane = '_default';
  const allNodes = Object.values(graph.nodes);
  for (const n of allNodes) if (!n.lane) n.lane = orphanLane;
  if (allNodes.some((n) => n.lane === orphanLane) && !laneNames.includes(orphanLane)) {
    laneNames.push(orphanLane);
  }

  // Step 1: Detect back edges (cycles)
  const backEdges = detectBackEdges(graph);

  // Step 2: Longest-path columns
  const cols = computeColumns(graph, backEdges);

  // Step 3: Find end and start nodes; in-degree counts
  const endIds = findEndNodes(graph);
  const startIds = findStartNodes(graph);
  const inCount: Record<string, number> = {};
  for (const id in graph.nodes) inCount[id] = 0;
  for (const e of graph.edges) {
    if (graph.nodes[e.from] && graph.nodes[e.to]) inCount[e.to] = (inCount[e.to] || 0) + 1;
  }

  // Step 4: Identify dead-end branches that should drop down (be placed below their source diamond)
  const dropDowns = identifyDropDowns(graph, endIds, inCount, cols);

  // Force dropped nodes to share the same column as the diamond that triggered them
  for (const id of Array.from(dropDowns)) {
    const inEdge = graph.edges.find(
      (e) => e.to === id && graph.nodes[e.from]?.type === 'diamond'
    );
    if (inEdge) cols[id] = cols[inEdge.from];
  }

  // Step 5: Assign rows. Drop-down nodes go to row 1; everyone else to row 0.
  const nodeRow: Record<string, number> = {};
  for (const n of allNodes) nodeRow[n.id] = dropDowns.has(n.id) ? 1 : 0;

  // Step 6: Compute lane heights based on rows used
  const laneRows: Record<string, number> = {};
  for (const ln of laneNames) laneRows[ln] = 1;
  for (const n of allNodes) {
    const need = nodeRow[n.id] + 1;
    if (need > (laneRows[n.lane] || 1)) laneRows[n.lane] = need;
  }

  // Step 7: Lane positions
  let yCursor = 0;
  const lanes: LaidOutLane[] = laneNames.map((name) => {
    const rows = laneRows[name] || 1;
    const height = rows * ROW_H;
    const lane = { name, top: yCursor, height, rows };
    yCursor += height;
    return lane;
  });

  // Step 8: Place nodes with stagger when multiple share the same (lane, col, row)
  const nodes: Record<string, LaidOutNode> = {};
  let maxCol = 0;
  const slotMap: Record<string, number> = {};
  for (const n of allNodes) {
    const laneIdx = laneNames.indexOf(n.lane);
    const lane = lanes[laneIdx];
    const col = cols[n.id] ?? 0;
    if (col > maxCol) maxCol = col;
    const row = nodeRow[n.id];
    const key = laneIdx + ':' + col + ':' + row;
    const slot = slotMap[key] ?? 0;
    slotMap[key] = slot + 1;
    const { w, h } = sizeFor(n.type);
    const x = LEFT_MARGIN + col * COL_W;
    const rowTop = lane.top + row * ROW_H;
    const baseY = rowTop + (ROW_H - h) / 2;
    const y = baseY + slot * (h + 15);
    nodes[n.id] = {
      id: n.id,
      label: n.label,
      rawText: n.rawText,
      etapa: n.etapa,
      type: n.type,
      lane: n.lane,
      x,
      y,
      w,
      h,
      col,
      row,
      laneIdx,
    };
  }

  const width = LEFT_MARGIN + (maxCol + 1) * COL_W + RIGHT_PAD;
  const height = yCursor + 20;
  return { lanes, nodes, width, height, dropDowns, endNodes: endIds, startNodes: startIds };
}
