import type { MermaidGraph } from './mermaid-parser';
import type { Layout, LaidOutNode } from './layout';
import type { RaciRow } from './csv-parser';

function esc(s: string): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Encode an HTML string to be safely placed inside a double-quoted attribute (data-content).
// We render with single quotes inside, and only need to escape double-quotes & ampersands.
function attr(s: string): string {
  return (s || '').replace(/"/g, '&quot;');
}

function stripBr(s: string): string {
  return (s || '').replace(/<br\s*\/?\s*>/gi, ' ').replace(/\s+/g, ' ').trim();
}

function prettifyLane(name: string): string {
  return name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

function buildDataContent(row: RaciRow | null, fallbackLabel: string, nodeType: string): string {
  if (!row) {
    const txt = stripBr(fallbackLabel) || (nodeType === 'oval' ? 'Marco do processo.' : 'Etapa do processo.');
    return `<div class='info-group'>${esc(txt)}</div>`;
  }
  const parts: string[] = [];
  if (row.descricao) {
    parts.push(`<div class='info-group'><span class='info-label'>Descrição:</span> ${esc(row.descricao)}</div>`);
  }
  const raci: string[] = [];
  if (row.responsavel) raci.push(`<div><span class='raci-badge r'>R</span> ${esc(row.responsavel)}</div>`);
  if (row.aprovador) raci.push(`<div><span class='raci-badge a'>A</span> ${esc(row.aprovador)}</div>`);
  if (row.consultado) raci.push(`<div><span class='raci-badge c'>C</span> ${esc(row.consultado)}</div>`);
  if (row.informado) raci.push(`<div><span class='raci-badge i'>I</span> ${esc(row.informado)}</div>`);
  if (raci.length) {
    parts.push(`<div class='info-group'><span class='info-label'>Matriz RACI:</span><div class='raci-box'>${raci.join('')}</div></div>`);
  }
  const extra: string[] = [];
  if (row.sistema) extra.push(`<div><strong>Sistema:</strong> ${esc(row.sistema)}</div>`);
  if (row.entregavel) extra.push(`<div><strong>Entregável:</strong> ${esc(row.entregavel)}</div>`);
  if (row.sla) extra.push(`<div><strong>SLA:</strong> ${esc(row.sla)} dias</div>`);
  if (row.departamento) extra.push(`<div><strong>Departamento:</strong> ${esc(row.departamento)}</div>`);
  if (extra.length) {
    parts.push(`<div class='info-group extra-info'>${extra.join('')}</div>`);
  }
  if (row.instrucoes) {
    parts.push(`<div class='info-group instructions-box'><span class='info-label'>Instruções:</span> ${esc(row.instrucoes)}</div>`);
  }
  return parts.join('') || `<div class='info-group'>${esc(stripBr(fallbackLabel))}</div>`;
}

/**
 * Determine exit side of source and entry side of target for an edge.
 *
 * For DIAMOND outgoing edges we use the label semantics:
 *   "Sim" → exits RIGHT
 *   "Não" → exits BOTTOM (drop-down style)
 *   (unlabeled) → exits RIGHT (default forward flow)
 *
 * For DIAMOND incoming edges, entry is LEFT or TOP depending on relative lane.
 *
 * For regular (non-diamond) nodes we use positional logic.
 */
function inferSides(
  from: LaidOutNode,
  to: LaidOutNode,
  label: string,
  isDropDown: boolean
): { s: string; e: string } {
  const isDiamondSource = from.type === 'diamond';
  const isDiamondTarget = to.type === 'diamond';
  const lbl = (label || '').trim().toLowerCase();
  const isNo = lbl === 'não' || lbl === 'nao' || lbl === 'no';
  const isSim = lbl === 'sim' || lbl === 'yes';

  // ── Source side (exit) ──
  let s: string;
  if (isDiamondSource) {
    // Label-based: "Sim" → always RIGHT, "Não" → always BOTTOM
    if (isSim) {
      s = 'right';
    } else if (isNo) {
      s = 'bottom';
    } else {
      // Unlabeled diamond exit (rare): use position
      s = to.col >= from.col ? 'right' : 'bottom';
    }
  } else {
    // Regular node: pick the most natural exit based on relative position
    if (from.laneIdx === to.laneIdx && from.row === to.row) {
      s = to.col >= from.col ? 'right' : 'left';
    } else if (to.laneIdx > from.laneIdx) {
      s = 'bottom';
    } else if (to.laneIdx < from.laneIdx) {
      s = 'top';
    } else {
      // Same lane, different row
      s = to.row > from.row ? 'bottom' : 'top';
    }
  }

  // ── Target side (entry) ──
  let e: string;
  if (isDiamondTarget) {
    // Entry into diamond: prefer left (main flow direction)
    if (from.laneIdx < to.laneIdx) {
      e = 'top';
    } else if (from.laneIdx > to.laneIdx) {
      e = 'bottom';
    } else {
      e = 'left';
    }
  } else {
    // Regular target node
    if (isDropDown) {
      e = 'top';
    } else if (from.laneIdx === to.laneIdx && from.row === to.row) {
      if (to.col > from.col) {
        e = 'left';
      } else if (to.col < from.col) {
        // backward edge (loop): enter from top
        e = 'top';
      } else {
        e = 'left';
      }
    } else if (to.laneIdx > from.laneIdx) {
      e = to.col > from.col ? 'left' : (to.col === from.col ? 'top' : 'top');
    } else if (to.laneIdx < from.laneIdx) {
      e = to.col > from.col ? 'left' : (to.col === from.col ? 'bottom' : 'bottom');
    } else {
      // same lane, different row
      e = to.row > from.row ? 'top' : 'bottom';
    }
  }

  return { s, e };
}

export interface GenerateOpts {
  processName?: string;
}

export function generateHtml(
  graph: MermaidGraph,
  layout: Layout,
  raci: Record<string, RaciRow>,
  processName: string
): string {
  // Title detection
  const raciVals = Object.values(raci);
  const processoCode = (() => {
    for (const r of raciVals) {
      const m = (r.processo || '').match(/(PR-\d+)/i);
      if (m) return m[1].toUpperCase();
    }
    for (const n of Object.values(graph.nodes)) {
      if (n.etapa) {
        const m = n.etapa.match(/(PR-\d+)/i);
        if (m) return m[1].toUpperCase();
      }
    }
    return '';
  })();
  const fallbackTitle = processoCode
    ? `${processoCode} - Fluxograma Interativo`
    : 'Fluxograma Interativo';
  const title = (processName && processName.trim()) || fallbackTitle;

  // Lanes HTML (alternating background)
  const lanesHtml = layout.lanes
    .map((l, i) => {
      const altBg = i % 2 === 1 ? 'background-color: rgba(233,236,239,0.95);' : '';
      const labelText = esc(prettifyLane(l.name));
      const noBorder = i === layout.lanes.length - 1 ? 'border-bottom: none;' : '';
      return `      <div class="swimlane" style="top: ${l.top}px; height: ${l.height}px; ${noBorder}">\n        <div class="lane-label" style="${altBg}">${labelText}</div>\n      </div>`;
    })
    .join('\n');

  // Nodes HTML
  const nodesHtml = Object.values(layout.nodes)
    .map((n) => {
      const row = (n.etapa && raci[n.etapa]) || null;
      const dataTitle = n.etapa || n.label.replace(/<br>/g, ' ');
      const dataContent = buildDataContent(row, n.label, n.type);
      // Preserve <br> in label rendering
      const labelHtml = esc(n.label.replace(/<br>/g, '\u0001BR\u0001')).replace(/\u0001BR\u0001/g, '<br>');
      const cls =
        n.type === 'diamond' ? 'node diamond pink' : n.type === 'oval' ? 'node oval blue' : 'node rect blue';
      const inner = n.type === 'diamond' ? `<div class="content">${labelHtml}</div>` : labelHtml;
      return `      <div class="${cls}" id="${esc(n.id)}" style="left: ${n.x}px; top: ${n.y}px; width: ${n.w}px; height: ${n.h}px;" data-title="${attr(dataTitle)}" data-content="${attr(dataContent)}">${inner}</div>`;
    })
    .join('\n');

  // Edges - build a JSON spec consumed at runtime so we can redraw on drag
  const endNodeIds = layout.endNodes;
  const validEdges = graph.edges.filter((e) => {
    if (!layout.nodes[e.from] || !layout.nodes[e.to]) return false;
    if (layout.dropDowns.has(e.from) && endNodeIds.has(e.to)) return false;
    return true;
  });
  const edgeSpecs = validEdges.map((e) => {
    const a = layout.nodes[e.from];
    const b = layout.nodes[e.to];
    const isDrop = layout.dropDowns.has(b.id) && a.type === 'diamond';
    const { s, e: ee } = inferSides(a, b, e.label || '', isDrop);
    return { from: a.id, to: b.id, s, e: ee, label: e.label || '' };
  });
  const edgeSpecsJson = JSON.stringify(edgeSpecs);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<style>
body, html { margin:0; padding:0; width:100%; height:100%; overflow:hidden; font-family:'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color:#f4f5f7; user-select:none; }
.process-title { position:fixed; top:15px; left:50%; transform:translateX(-50%); background:#fff; padding:12px 25px; border-radius:30px; box-shadow:0 4px 15px rgba(0,0,0,0.1); font-size:16px; font-weight:bold; color:#0d47a1; z-index:100; border:2px solid #e3f2fd; text-align:center; pointer-events:none; max-width:90vw; }
.instructions { position:fixed; bottom:20px; left:20px; background:rgba(255,255,255,0.95); padding:10px 15px; border-radius:8px; box-shadow:0 4px 10px rgba(0,0,0,0.1); pointer-events:none; z-index:100; font-size:14px; color:#333; }
#viewport { width:100vw; height:100vh; cursor:grab; position:relative; }
#viewport:active { cursor:grabbing; }
#canvas { position:absolute; transform-origin:0 0; width:${layout.width}px; height:${layout.height}px; background-color:#fff; box-shadow:0 0 20px rgba(0,0,0,0.05); margin-top:60px; }
.swimlane { width:100%; border-bottom:2px solid #a0a0a0; position:absolute; left:0; box-sizing:border-box; background:linear-gradient(to right,#fbfbfb,#fff); }
.lane-label { width:50px; height:100%; border-right:2px solid #a0a0a0; background-color:rgba(240,242,245,0.95); backdrop-filter:blur(3px); writing-mode:vertical-rl; transform:rotate(180deg); display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:13px; color:#333; position:absolute; top:0; left:0; z-index:20; box-shadow:2px 0 10px rgba(0,0,0,0.1); padding:8px 0; }
.node { position:absolute; cursor:pointer; display:flex; align-items:center; justify-content:center; text-align:center; font-size:11px; font-weight:600; box-shadow:2px 2px 6px rgba(0,0,0,0.15); transition:box-shadow 0.2s, transform 0.2s; z-index:10; box-sizing:border-box; padding:5px; line-height:1.25; }
.node:hover { box-shadow:4px 4px 15px rgba(0,0,0,0.3); transform:translateY(-2px); }
.rect { border-radius:4px; }
.oval { border-radius:50%; }
.blue { background-color:#e3f2fd; border:2px solid #1e88e5; color:#0d47a1; }
.pink { background-color:#fce4ec; border:2px solid #d81b60; color:#880e4f; }
.diamond { transform:rotate(45deg); padding:0; }
.diamond .content { transform:rotate(-45deg); width:135%; height:135%; display:flex; align-items:center; justify-content:center; padding:6px; box-sizing:border-box; }
.diamond:hover { transform:rotate(45deg) scale(1.05); }
#info-modal { display:none; position:fixed; z-index:1000; left:0; top:0; width:100%; height:100%; background-color:rgba(0,0,0,0.6); backdrop-filter:blur(4px); align-items:center; justify-content:center; opacity:0; transition:opacity 0.3s ease; }
#info-modal.show { display:flex; opacity:1; }
.modal-content { background-color:#fff; padding:30px; border-radius:12px; width:90%; max-width:550px; box-shadow:0 10px 30px rgba(0,0,0,0.3); position:relative; transform:translateY(-20px); transition:transform 0.3s ease; border-top:6px solid #1e88e5; max-height:85vh; overflow-y:auto; }
#info-modal.show .modal-content { transform:translateY(0); }
.close-btn { position:absolute; top:15px; right:20px; color:#aaa; font-size:28px; font-weight:bold; cursor:pointer; }
.close-btn:hover { color:#333; }
#modal-title { margin-top:0; margin-bottom:20px; color:#1e88e5; font-size:1.4rem; border-bottom:2px solid #f0f2f5; padding-bottom:10px; }
#modal-body { color:#444; line-height:1.5; font-size:14px; }
.info-group { margin-bottom:15px; }
.info-label { font-weight:700; color:#555; display:block; margin-bottom:6px; font-size:12px; text-transform:uppercase; letter-spacing:0.5px; }
.raci-box { display:grid; grid-template-columns:1fr 1fr; gap:10px; background:#f8f9fa; padding:12px; border-radius:8px; border:1px solid #e9ecef; }
.raci-badge { display:inline-block; width:24px; height:24px; line-height:24px; text-align:center; border-radius:4px; color:white; font-weight:bold; font-size:12px; margin-right:8px; box-shadow:1px 1px 3px rgba(0,0,0,0.2); }
.raci-badge.r { background-color:#d32f2f; }
.raci-badge.a { background-color:#1976d2; }
.raci-badge.c { background-color:#fbc02d; color:#333; }
.raci-badge.i { background-color:#388e3c; }
.extra-info { display:flex; gap:15px; flex-wrap:wrap; background:#e3f2fd; padding:12px; border-radius:8px; border:1px solid #bbdefb; color:#0d47a1; }
.instructions-box { background:#fff3e0; padding:15px; border-left:4px solid #ff9800; border-radius:4px; font-style:italic; color:#555; margin-top:20px; }
.toolbar { position:fixed; top:15px; right:15px; display:flex; gap:8px; z-index:101; }
.tb-btn { background:#fff; border:2px solid #e0e0e0; border-radius:8px; padding:8px 14px; cursor:pointer; font-weight:600; font-size:13px; box-shadow:0 2px 6px rgba(0,0,0,0.08); transition:all 0.15s; color:#333; }
.tb-btn:hover { border-color:#1e88e5; color:#1e88e5; }
.tb-btn.active { background:#1e88e5; color:#fff; border-color:#1e88e5; }
body.edit-mode .node { cursor:move !important; }
body.edit-mode .node:hover { transform:none; box-shadow:0 0 0 3px #1e88e5; }
body.edit-mode .diamond:hover { transform:rotate(45deg); box-shadow:0 0 0 3px #1e88e5; }
body.edit-mode #viewport { cursor:default; }
.legend { position:fixed; bottom:20px; right:20px; background:rgba(255,255,255,0.97); border:1px solid #e0e0e0; border-radius:10px; padding:10px 14px; box-shadow:0 2px 10px rgba(0,0,0,0.1); z-index:100; pointer-events:none; }
.legend-title { font-weight:700; font-size:12px; color:#555; margin-bottom:6px; text-transform:uppercase; letter-spacing:0.5px; }
.legend-item { display:flex; align-items:center; gap:8px; margin-bottom:3px; font-size:13px; }
</style>
</head>
<body>
  <div class="process-title">${esc(title)}</div>
  <div class="instructions" id="instructions">🖥️ <b>Scroll:</b> Zoom | ✋ <b>Arrastar:</b> Mover | 👆 <b>Clique na Etapa:</b> Informações</div>
  <div class="legend">
    <div class="legend-title">Legenda</div>
    <div class="legend-item"><svg width="36" height="10"><line x1="0" y1="5" x2="36" y2="5" stroke="#2e7d32" stroke-width="2.5"/></svg> <span style="color:#2e7d32;font-weight:700">Sim</span></div>
    <div class="legend-item"><svg width="36" height="10"><line x1="0" y1="5" x2="36" y2="5" stroke="#c62828" stroke-width="2.5" stroke-dasharray="6,3"/></svg> <span style="color:#c62828;font-weight:700">Não</span></div>
    <div class="legend-item"><svg width="36" height="10"><line x1="0" y1="5" x2="36" y2="5" stroke="#555" stroke-width="2"/></svg> <span style="color:#555;font-weight:600">Fluxo</span></div>
  </div>
  <div class="toolbar">
    <button id="btn-edit" class="tb-btn">✏️ Editar</button>
    <button id="btn-reset" class="tb-btn" style="display:none">↺ Resetar Posições</button>
    <button id="btn-download" class="tb-btn">💾 Baixar HTML</button>
  </div>
  <div id="viewport">
    <div id="canvas">
${lanesHtml}
      <svg id="svg-layer" width="${layout.width}" height="${layout.height}" style="position:absolute; top:0; left:0; pointer-events:none; z-index:5;">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#555" />
          </marker>
          <marker id="arrow-sim" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#2e7d32" />
          </marker>
          <marker id="arrow-nao" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#c62828" />
          </marker>
        </defs>
      </svg>
${nodesHtml}
    </div>
  </div>
  <div id="info-modal">
    <div class="modal-content">
      <span class="close-btn">&times;</span>
      <h2 id="modal-title">Título</h2>
      <div id="modal-body">Conteúdo</div>
    </div>
  </div>
<script>
(function(){
  var viewport = document.getElementById('viewport');
  var canvas = document.getElementById('canvas');
  var scale = 0.75, pointX = 30, pointY = 20;
  var panning = false, isDragging = false, startX=0, startY=0;
  function setTransform(){
    canvas.style.transform = 'translate('+pointX+'px,'+pointY+'px) scale('+scale+')';
    var visibleLeft = -pointX / scale;
    var labelLeft = Math.max(0, visibleLeft);
    document.querySelectorAll('.lane-label').forEach(function(l){ l.style.left = labelLeft+'px'; });
  }
  setTransform();
  viewport.addEventListener('mousedown', function(e){
    if(e.target.closest('.node')) return;
    e.preventDefault(); startX = e.clientX - pointX; startY = e.clientY - pointY; panning = true; isDragging = false;
  });
  viewport.addEventListener('mousemove', function(e){ if(!panning) return; isDragging = true; pointX = e.clientX - startX; pointY = e.clientY - startY; setTransform(); });
  viewport.addEventListener('mouseup', function(){ panning = false; });
  viewport.addEventListener('mouseleave', function(){ panning = false; });
  viewport.addEventListener('wheel', function(e){
    e.preventDefault();
    var xs = (e.clientX - pointX) / scale, ys = (e.clientY - pointY) / scale;
    var delta = e.wheelDelta ? e.wheelDelta : -e.deltaY;
    if(delta>0) scale*=1.1; else scale/=1.1;
    scale = Math.max(0.2, Math.min(scale, 3));
    pointX = e.clientX - xs*scale; pointY = e.clientY - ys*scale; setTransform();
  }, { passive: false });
  var modal = document.getElementById('info-modal');
  document.querySelector('.close-btn').addEventListener('click', function(){ modal.classList.remove('show'); });
  window.addEventListener('click', function(e){ if(e.target === modal) modal.classList.remove('show'); });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') modal.classList.remove('show'); });
  document.querySelectorAll('.node').forEach(function(node){
    node.addEventListener('mousedown', function(){ isDragging = false; });
    node.addEventListener('click', function(){
      if(isDragging) return;
      if(editMode) return;
      document.getElementById('modal-title').innerText = this.getAttribute('data-title');
      document.getElementById('modal-body').innerHTML = this.getAttribute('data-content');
      modal.classList.add('show');
    });
  });
  function getEdgePoint(id, side){
    var el = document.getElementById(id); if(!el) return {x:0,y:0};
    var r = { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
    r.right = r.left + r.width; r.bottom = r.top + r.height; r.cx = r.left + r.width/2; r.cy = r.top + r.height/2;
    if(side==='top') return {x:r.cx, y:r.top};
    if(side==='bottom') return {x:r.cx, y:r.bottom};
    if(side==='left') return {x:r.left, y:r.cy};
    if(side==='right') return {x:r.right, y:r.cy};
    return {x:r.cx, y:r.cy};
  }
  var EDGE_SPECS = ${edgeSpecsJson};
  function classifyLabel(text){
    if(!text) return 'normal';
    var t = text.toLowerCase().replace(/ã/g,'a');
    if(t==='sim'||t==='yes') return 'sim';
    if(t==='nao'||t==='não'||t==='no') return 'nao';
    return 'normal';
  }
  function drawLine(id1,id2,s,e,text){
    var p1 = getEdgePoint(id1,s), p2 = getEdgePoint(id2,e);
    var cls = classifyLabel(text);
    // Colors & style per type
    var strokeColor = cls==='sim' ? '#2e7d32' : cls==='nao' ? '#c62828' : '#555';
    var strokeWidth = cls==='normal' ? '2' : '2.5';
    var dashArray = cls==='nao' ? '8,4' : 'none';
    var markerUrl = cls==='sim' ? 'url(#arrow-sim)' : cls==='nao' ? 'url(#arrow-nao)' : 'url(#arrow)';

    var d = 'M '+p1.x+' '+p1.y+' ';
    if(s==='right' && e==='left'){
      var mx=(p1.x+p2.x)/2; d += 'L '+mx+' '+p1.y+' L '+mx+' '+p2.y+' L '+p2.x+' '+p2.y;
    } else if(s==='left' && e==='right'){
      var mx2b=(p1.x+p2.x)/2; d += 'L '+mx2b+' '+p1.y+' L '+mx2b+' '+p2.y+' L '+p2.x+' '+p2.y;
    } else if(s==='bottom' && e==='top'){
      var my=(p1.y+p2.y)/2; d += 'L '+p1.x+' '+my+' L '+p2.x+' '+my+' L '+p2.x+' '+p2.y;
    } else if(s==='top' && e==='bottom'){
      var my2=(p1.y+p2.y)/2; d += 'L '+p1.x+' '+my2+' L '+p2.x+' '+my2+' L '+p2.x+' '+p2.y;
    } else if(s==='bottom' && e==='left'){
      d += 'L '+p1.x+' '+p2.y+' L '+p2.x+' '+p2.y;
    } else if(s==='top' && e==='left'){
      d += 'L '+p1.x+' '+p2.y+' L '+p2.x+' '+p2.y;
    } else if(s==='bottom' && e==='right'){
      d += 'L '+p1.x+' '+p2.y+' L '+p2.x+' '+p2.y;
    } else if(s==='top' && e==='right'){
      d += 'L '+p1.x+' '+p2.y+' L '+p2.x+' '+p2.y;
    } else if(s==='top' && e==='top'){
      var my3 = Math.min(p1.y, p2.y) - 40; d += 'L '+p1.x+' '+my3+' L '+p2.x+' '+my3+' L '+p2.x+' '+p2.y;
    } else if(s==='bottom' && e==='bottom'){
      var my4 = Math.max(p1.y, p2.y) + 40; d += 'L '+p1.x+' '+my4+' L '+p2.x+' '+my4+' L '+p2.x+' '+p2.y;
    } else if(s==='right' && e==='right'){
      var mx3 = Math.max(p1.x, p2.x) + 40; d += 'L '+mx3+' '+p1.y+' L '+mx3+' '+p2.y+' L '+p2.x+' '+p2.y;
    } else if(s==='left' && e==='left'){
      var mx4 = Math.min(p1.x, p2.x) - 40; d += 'L '+mx4+' '+p1.y+' L '+mx4+' '+p2.y+' L '+p2.x+' '+p2.y;
    } else if(s==='right' && e==='top'){
      d += 'L '+p2.x+' '+p1.y+' L '+p2.x+' '+p2.y;
    } else if(s==='right' && e==='bottom'){
      d += 'L '+p2.x+' '+p1.y+' L '+p2.x+' '+p2.y;
    } else if(s==='left' && e==='top'){
      d += 'L '+p2.x+' '+p1.y+' L '+p2.x+' '+p2.y;
    } else if(s==='left' && e==='bottom'){
      d += 'L '+p2.x+' '+p1.y+' L '+p2.x+' '+p2.y;
    } else {
      d += 'L '+p2.x+' '+p1.y+' L '+p2.x+' '+p2.y;
    }
    var svg = document.getElementById('svg-layer');
    var path = document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d', d);
    path.setAttribute('fill','none');
    path.setAttribute('stroke', strokeColor);
    path.setAttribute('stroke-width', strokeWidth);
    path.setAttribute('marker-end', markerUrl);
    if(dashArray !== 'none') path.setAttribute('stroke-dasharray', dashArray);
    svg.appendChild(path);

    if(text){
      // Place label at the midpoint of the first segment for clarity
      var tx, ty;
      if(s==='right'){
        // First segment goes right → label at middle of horizontal run
        var segEnd = (e==='left') ? (p1.x+p2.x)/2 : p2.x;
        tx = (p1.x + segEnd) / 2;
        ty = p1.y - 14;
      } else if(s==='left'){
        var segEnd2 = (e==='right') ? (p1.x+p2.x)/2 : p2.x;
        tx = (p1.x + segEnd2) / 2;
        ty = p1.y - 14;
      } else if(s==='bottom'){
        tx = p1.x + 12;
        var segEndY = (e==='top') ? (p1.y+p2.y)/2 : p2.y;
        ty = (p1.y + segEndY) / 2;
      } else {
        tx = p1.x + 12;
        var segEndY2 = (e==='bottom') ? (p1.y+p2.y)/2 : p2.y;
        ty = (p1.y + segEndY2) / 2;
      }
      // Draw pill label
      var labelW = text.length * 10 + 18, labelH = 24;
      var g = document.createElementNS('http://www.w3.org/2000/svg','g');
      var rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
      rect.setAttribute('x', tx - 9);
      rect.setAttribute('y', ty - 16);
      rect.setAttribute('width', labelW);
      rect.setAttribute('height', labelH);
      rect.setAttribute('rx','12');
      var bgFill = cls==='sim' ? '#e8f5e9' : cls==='nao' ? '#ffebee' : '#f5f5f5';
      var bgStroke = cls==='sim' ? '#2e7d32' : cls==='nao' ? '#c62828' : '#888';
      rect.setAttribute('fill', bgFill);
      rect.setAttribute('stroke', bgStroke);
      rect.setAttribute('stroke-width','1.5');
      g.appendChild(rect);
      var t = document.createElementNS('http://www.w3.org/2000/svg','text');
      t.setAttribute('x', String(tx));
      t.setAttribute('y', String(ty));
      t.setAttribute('font-size','14');
      t.setAttribute('font-weight','800');
      t.setAttribute('fill', strokeColor);
      t.textContent = text;
      g.appendChild(t);
      svg.appendChild(g);
    }
  }
  function redrawEdges(){
    var svg = document.getElementById('svg-layer');
    // remove all children except defs
    var defs = svg.querySelector('defs');
    while(svg.firstChild) svg.removeChild(svg.firstChild);
    if(defs) svg.appendChild(defs);
    EDGE_SPECS.forEach(function(spec){ drawLine(spec.from, spec.to, spec.s, spec.e, spec.label); });
  }
  function _drawAll(){ redrawEdges(); }
  if(document.readyState === 'loading'){ window.addEventListener('DOMContentLoaded', _drawAll); } else { _drawAll(); }

  // ============== EDIT MODE ==============
  var editMode = false;
  var btnEdit = document.getElementById('btn-edit');
  var btnReset = document.getElementById('btn-reset');
  var btnDownload = document.getElementById('btn-download');
  var instructions = document.getElementById('instructions');
  var originalPositions = {};
  document.querySelectorAll('.node').forEach(function(n){
    originalPositions[n.id] = { left: n.style.left, top: n.style.top };
  });

  btnEdit.addEventListener('click', function(){
    editMode = !editMode;
    document.body.classList.toggle('edit-mode', editMode);
    btnEdit.classList.toggle('active', editMode);
    btnEdit.innerHTML = editMode ? '✓ Concluir' : '✏️ Editar';
    btnReset.style.display = editMode ? 'inline-block' : 'none';
    instructions.innerHTML = editMode
      ? '🛠️ <b>Modo Edição:</b> Arraste os blocos para reposicionar. Setas ajustam automaticamente.'
      : '🖥️ <b>Scroll:</b> Zoom | ✋ <b>Arrastar:</b> Mover | 👆 <b>Clique na Etapa:</b> Informações';
  });

  btnReset.addEventListener('click', function(){
    document.querySelectorAll('.node').forEach(function(n){
      var p = originalPositions[n.id];
      if(p){ n.style.left = p.left; n.style.top = p.top; }
    });
    redrawEdges();
  });

  // Drag node logic
  var dragNode = null, dragStartX=0, dragStartY=0, nodeStartL=0, nodeStartT=0;
  document.querySelectorAll('.node').forEach(function(node){
    node.addEventListener('mousedown', function(ev){
      if(!editMode) return;
      ev.stopPropagation(); ev.preventDefault();
      dragNode = node;
      dragStartX = ev.clientX; dragStartY = ev.clientY;
      nodeStartL = parseFloat(node.style.left); nodeStartT = parseFloat(node.style.top);
    });
  });
  window.addEventListener('mousemove', function(ev){
    if(!dragNode) return;
    var dx = (ev.clientX - dragStartX) / scale;
    var dy = (ev.clientY - dragStartY) / scale;
    dragNode.style.left = (nodeStartL + dx) + 'px';
    dragNode.style.top = (nodeStartT + dy) + 'px';
    redrawEdges();
  });
  window.addEventListener('mouseup', function(){ dragNode = null; });

  // Download current state as HTML
  btnDownload.addEventListener('click', function(){
    // Update node inline styles in the source DOM (already updated). Clone and clean.
    var clone = document.documentElement.cloneNode(true);
    // Remove dynamic SVG content (will be redrawn by script on load)
    var cSvg = clone.querySelector('#svg-layer');
    if(cSvg){
      var cDefs = cSvg.querySelector('defs');
      while(cSvg.firstChild) cSvg.removeChild(cSvg.firstChild);
      if(cDefs) cSvg.appendChild(cDefs);
    }
    // Remove edit-mode class
    var cBody = clone.querySelector('body');
    if(cBody) cBody.classList.remove('edit-mode');
    var html = '<!DOCTYPE html>\\n' + clone.outerHTML;
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = ${JSON.stringify(esc(title).replace(/[^a-zA-Z0-9-_]/g, '_') + '.html')};
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
})();
</script>
</body>
</html>`;
}
