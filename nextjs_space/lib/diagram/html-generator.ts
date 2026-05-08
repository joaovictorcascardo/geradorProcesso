import { LaidOutNode } from './layout';
import { Graph } from './mermaid-parser';
import { RaciRow } from './csv-parser';

function esc(s: string) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function attr(s: string) {
  return (s || '').replace(/"/g, '&quot;');
}

function stripBr(s: string) {
  return (s || '')
    .replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function prettifyLane(name: string) {
  return name
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================================
// MODAL DETALHADO - MANTIDO EXATAMENTE IGUAL À SUA PRINT
// ============================================================================
export function buildDataContent(row: RaciRow | null, fallbackLabel: string, nodeType: string) {
  if (!row) return `<div class='rubeus-card'><div class='val'>${esc(stripBr(fallbackLabel))}</div></div>`;
  const parts = [];

  if (row.descricao) parts.push(`<div class='etapa-descricao'>${esc(row.descricao)}</div>`);

  const raciRows = [];
  if (row.responsavel) raciRows.push(`<div class='rubeus-row'><span class='rubeus-badge bg-red'>Responsável</span><span class='val'>${esc(row.responsavel)}</span></div>`);
  if (row.aprovador) raciRows.push(`<div class='rubeus-row'><span class='rubeus-badge bg-green'>Aprovador</span><span class='val'>${esc(row.aprovador)}</span></div>`);
  if (row.consultado) raciRows.push(`<div class='rubeus-row'><span class='rubeus-badge bg-yellow'>Consultado</span><span class='val'>${esc(row.consultado)}</span></div>`);
  if (row.informado) raciRows.push(`<div class='rubeus-row'><span class='rubeus-badge bg-blue'>Informado</span><span class='val'>${esc(row.informado)}</span></div>`);
  if (raciRows.length) parts.push(`<div class='rubeus-card'>${raciRows.join('')}</div>`);

  const metaRows = [];
  if (row.departamento) metaRows.push(`<div class='rubeus-row'><span class='rubeus-badge bg-gray'>Departamento</span><span class='val'>${esc(row.departamento)}</span></div>`);
  if (row.sistema) metaRows.push(`<div class='rubeus-row'><span class='rubeus-badge bg-gray'>Sistema/Ferramenta</span><span class='val'>${esc(row.sistema)}</span></div>`);
  if (row.entregavel) metaRows.push(`<div class='rubeus-row'><span class='rubeus-badge bg-gray'>Entregável</span><span class='val'>${esc(row.entregavel)}</span></div>`);
  if (row.sla) metaRows.push(`<div class='rubeus-row'><span class='rubeus-badge bg-gray'>SLA (Prazo)</span><span class='val'>${esc(row.sla)}</span></div>`);
  if (metaRows.length) parts.push(`<div class='rubeus-card'>${metaRows.join('')}</div>`);

  if (row.instrucoes) {
    parts.push(`
      <div class='rubeus-card teal-card'>
        <div class='instr-content'>${esc(row.instrucoes)}</div>
        <div class='instr-icon'>
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </div>
      </div>
    `);
  }
  return parts.join('') || `<div class='rubeus-card'><div class='val'>${esc(stripBr(fallbackLabel))}</div></div>`;
}

// ============================================================================
// LÓGICA DE ROTAS - O LADO DE SAÍDA E ENTRADA
// ============================================================================
export function inferSides(from: LaidOutNode, to: LaidOutNode, label: string, isDropDown: boolean): { s: string; e: string } {
  const isDiamondSource = from.type === 'diamond';
  const lbl = (label || '').trim().toLowerCase();
  const isNo = lbl === 'não' || lbl === 'nao' || lbl === 'no';
  const isSim = lbl === 'sim' || lbl === 'yes';
  let s: string; let e: string;

  if (isDiamondSource) {
    if (isSim) s = 'right'; else if (isNo) s = 'bottom'; else s = to.col > from.col ? 'right' : 'bottom';
  } else {
    if (to.col > from.col) s = 'right'; else if (to.col < from.col) s = 'left'; else if (to.row < from.row) s = 'left'; else s = 'bottom';
  }

  if (isNo || to.laneIdx > from.laneIdx || (to.row > from.row && to.col === from.col)) e = 'top';
  else if (to.col < from.col || (to.row < from.row && to.col === from.col)) e = 'left'; else e = 'left';

  return { s, e };
}

// ============================================================================
// GERAÇÃO DO HTML FINAL - COM ROTEAMENTO INTELIGENTE ("RODOVIAS")
// ============================================================================
export function generateHtml(
  graph: Graph,
  layout: ReturnType<typeof import('./layout').layoutGraph>,
  raci: Record<string, RaciRow>,
  customProcessTitle?: string
): string {
  const title = (customProcessTitle && customProcessTitle.trim()) || 'Fluxograma Interativo';
  const fileName = title.replace(/[^A-Za-z0-9_\-]+/g, '_') + '.html';

  const lanesHtml = layout.lanes.map((l, i) => {
      const altBg = i % 2 === 1 ? 'background-color: rgba(233,236,239,0.95);' : '';
      const noBorder = i === layout.lanes.length - 1 ? 'border-bottom: none;' : '';
      return `<div class="swimlane" style="top: ${l.top}px; height: ${l.height}px; ${noBorder}"><div class="lane-label" style="${altBg}">${esc(prettifyLane(l.name))}</div></div>`;
    }).join('\n');

  const nodesHtml = Object.values(layout.nodes).map((n) => {
      const row = (n.etapa && raci[n.etapa]) || null;
      const dataTitle = n.label.replace(/<br>/g, ' '); 
      const labelHtml = esc(n.label.replace(/<br>/g, '\u0001BR\u0001')).replace(/\u0001BR\u0001/g, '<br>');
      const cls = n.type === 'diamond' ? 'node diamond pink' : n.type === 'oval' ? 'node oval blue' : 'node rect blue';
      const inner = n.type === 'diamond' ? `<div class="content">${labelHtml}</div>` : labelHtml;
      return `<div class="${cls}" id="${esc(n.id)}" style="left: ${n.x}px; top: ${n.y}px; width: ${n.w}px; height: ${n.h}px;" data-title="${attr(dataTitle)}" data-content="${attr(buildDataContent(row, n.label, n.type))}">${inner}</div>`;
    }).join('\n');

  const validEdges = graph.edges.filter((e) => layout.nodes[e.from] && layout.nodes[e.to] && !(layout.dropDowns.has(e.from) && layout.endNodes.has(e.to)));

  const edgeSpecs = validEdges.map((e) => {
    const a = layout.nodes[e.from];
    const b = layout.nodes[e.to];
    const isDrop = layout.dropDowns.has(b.id) && a.type === 'diamond';
    const { s, e: ee } = inferSides(a, b, e.label || '', isDrop);
    return { from: a.id, to: b.id, s, e: ee, label: e.label || '', hasArrow: e.hasArrow };
  });

  const safeEdgeSpecs = encodeURIComponent(JSON.stringify(edgeSpecs));

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
body, html { margin:0; padding:0; width:100%; height:100%; overflow:hidden; font-family:'Poppins', sans-serif; background-color:#f4f5f7; user-select:none; }
.process-title { position:fixed; top:15px; left:50%; transform:translateX(-50%); background:#fff; padding:12px 25px; border-radius:30px; box-shadow:0 4px 15px rgba(0,0,0,0.1); font-size:16px; font-weight:700; color:#1e293b; z-index:100; border:1px solid #e2e8f0; }
#viewport { width:100vw; height:100vh; cursor:grab; position:relative; }
#viewport:active { cursor:grabbing; }
#canvas { position:absolute; transform-origin:0 0; width:${layout.width}px; height:${layout.height}px; background-color:#fff; box-shadow:0 0 20px rgba(0,0,0,0.05); margin-top:60px; }
.swimlane { width:100%; border-bottom:2px solid #a0a0a0; position:absolute; left:0; box-sizing:border-box; background:linear-gradient(to right,#fbfbfb,#fff); }
.lane-label { width:50px; height:100%; border-right:2px solid #a0a0a0; background-color:rgba(240,242,245,0.95); backdrop-filter:blur(3px); writing-mode:vertical-rl; transform:rotate(180deg); display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:13px; color:#333; position:absolute; top:0; left:0; z-index:20; box-shadow:2px 0 10px rgba(0,0,0,0.1); padding:8px 0; }

.edge-label { position:absolute; transform:translate(-50%,-50%); padding:4px 10px; border-radius:12px; font-size:12px; font-weight:700; text-transform:uppercase; z-index:6; background:#fff; border:1px solid #e2e8f0; color:#64748b; box-shadow:0 2px 4px rgba(0,0,0,0.05); pointer-events:none; }
.edge-label.sim { border-color:#ccfbf1; color:#00948a; background:#f0fdfa; }
.edge-label.nao { border-color:#fecaca; color:#e11d48; background:#fff1f2; }

.node { position:absolute; cursor:pointer; display:flex; align-items:center; justify-content:center; text-align:center; font-size:12px; font-weight:600; box-shadow:2px 2px 6px rgba(0,0,0,0.15); transition:box-shadow 0.2s, transform 0.2s; z-index:10; box-sizing:border-box; padding:5px; line-height:1.25; }
.node:hover { box-shadow:4px 4px 15px rgba(0,0,0,0.3); transform:translateY(-2px); }
.rect { border-radius:8px; }
.oval { border-radius:50%; }
.blue { background-color:#f8fafc; border:2px solid #00948a; color:#0f172a; }
.pink { background-color:#fff1f2; border:2px solid #e11d48; color:#880e4f; }
.diamond { transform:rotate(45deg); padding:0; }
.diamond .content { transform:rotate(-45deg); width:135%; height:135%; display:flex; align-items:center; justify-content:center; padding:6px; box-sizing:border-box; }
.diamond:hover { transform:rotate(45deg) scale(1.05); }

/* CSS DO MODAL */
#info-modal { display:none; position:fixed; z-index:1000; left:0; top:0; width:100%; height:100%; background-color:rgba(15, 23, 42, 0.5); backdrop-filter: blur(4px); align-items:center; justify-content:center; opacity:0; transition:opacity 0.2s ease; }
#info-modal.show { display:flex; opacity:1; }
.modal-content { background-color:#f4f6f9; padding:0; border-radius:24px; width:90%; max-width:650px; max-height:90vh; overflow-y:auto; box-shadow:0 15px 40px rgba(0,0,0,0.2); border:none; position:relative; }
.modal-body-wrapper { padding: 40px; }

.close-btn { position:absolute; top:24px; right:24px; color:#64748b; background:#e2e8f0; width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:20px; font-weight:bold; cursor:pointer; transition:all 0.2s; line-height:1; z-index:10; border: none;}
.close-btn:hover { background:#cbd5e1; color:#1e293b; transform:scale(1.05); }

#modal-title { color:#1e293b; font-size:1.4rem; margin-top:0; margin-bottom:8px; font-weight:700; letter-spacing: -0.5px; line-height: 1.3; padding-right: 40px;}
.etapa-descricao { font-size: 15px; color: #64748b; margin-bottom: 24px; line-height: 1.6; font-weight: 400;}

.rubeus-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 24px; margin-bottom: 20px; display: flex; flex-direction: column; gap: 16px; box-shadow: 0 4px 15px rgba(0,0,0,0.02); }
.rubeus-row { display: flex; align-items: center; gap: 20px; }
.rubeus-badge { display: inline-block; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 700; color: #ffffff; text-align: center; min-width: 170px; flex-shrink: 0; box-shadow: 0 2px 4px rgba(0,0,0,0.05); text-transform: uppercase; letter-spacing: 0.5px;}
.bg-red { background-color: #ef4444; }
.bg-green { background-color: #22c55e; }
.bg-yellow { background-color: #eab308; }
.bg-blue { background-color: #3b82f6; }
.bg-gray { background-color: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; box-shadow: none; }
.val { font-size: 15px; font-weight: 500; color: #334155; line-height: 1.4; flex: 1;}

.teal-card { background: #e0f2f1; border: 1px solid #b2dfdb; flex-direction: row; align-items: center; justify-content: space-between; }
.instr-content { font-size: 14px; font-weight: 500; line-height: 1.6; color: #0f766e; flex: 1; padding-right: 20px;}
.instr-icon { background: #ffffff; width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #00948a; flex-shrink: 0; box-shadow: 0 2px 6px rgba(0,0,0,0.08); }

.toolbar { position:fixed; top:15px; right:15px; display:flex; gap:8px; z-index:101; }
.tb-btn { background:#fff; border:1px solid #e2e8f0; border-radius:50px; padding:10px 20px; cursor:pointer; font-weight:600; font-size:14px; box-shadow:0 4px 10px rgba(0,0,0,0.08); transition:all 0.2s; font-family:'Poppins', sans-serif;}
.tb-btn:hover { border-color:#00948a; color:#00948a; transform: translateY(-2px);}
body.edit-mode .node { cursor:move !important; }
body.edit-mode .node:hover { transform:none; box-shadow:0 0 0 3px #00948a; }

.modal-content::-webkit-scrollbar { width: 8px; }
.modal-content::-webkit-scrollbar-track { background: transparent; }
.modal-content::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 8px; }
.modal-content::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
</style>
</head>
<body>
  <div class="process-title">${esc(title)}</div>
  <div class="toolbar">
    <button id="btn-edit" class="tb-btn">✏️ Editar Layout</button>
    <button id="btn-reset" class="tb-btn" style="display:none">↺ Resetar Posições</button>
    <button id="btn-download" class="tb-btn" style="display:none">💾 Baixar Final</button>
  </div>
  <div id="viewport">
    <div id="canvas">
${lanesHtml}
      <svg id="svg-layer" width="${layout.width}" height="${layout.height}" style="position:absolute; top:0; left:0; pointer-events:none; z-index:5;">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" /></marker>
          <marker id="arrow-sim" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#00948a" /></marker>
          <marker id="arrow-nao" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#e11d48" /></marker>
        </defs>
      </svg>
      <div id="label-layer" style="position:absolute; top:0; left:0; width:${layout.width}px; height:${layout.height}px; pointer-events:none; z-index:6;"></div>
${nodesHtml}
    </div>
  </div>
  <div id="info-modal">
    <div class="modal-content">
      <span class="close-btn">&times;</span>
      <div class="modal-body-wrapper">
        <h2 id="modal-title"></h2>
        <div id="modal-body"></div>
      </div>
    </div>
  </div>
<script>
(function(){
  var EDGE_SPECS = JSON.parse(decodeURIComponent("${safeEdgeSpecs}"));
  var FILE_NAME = "${fileName}";

  var viewport = document.getElementById('viewport'), canvas = document.getElementById('canvas');
  var scale = 0.75, pointX = 30, pointY = 20, panning = false, isDragging = false, startX=0, startY=0;
  function setTransform(){
    canvas.style.transform = 'translate('+pointX+'px,'+pointY+'px) scale('+scale+')';
    var visibleLeft = Math.max(0, -pointX / scale);
    document.querySelectorAll('.lane-label').forEach(function(l){ l.style.left = visibleLeft+'px'; });
  }
  setTransform();
  viewport.addEventListener('mousedown', function(e){ if(e.target.closest('.node') || e.target.closest('.modal-content')) return; e.preventDefault(); startX = e.clientX - pointX; startY = e.clientY - pointY; panning = true; isDragging = false; });
  viewport.addEventListener('mousemove', function(e){ if(!panning) return; isDragging = true; pointX = e.clientX - startX; pointY = e.clientY - startY; setTransform(); });
  viewport.addEventListener('mouseup', function(){ panning = false; });
  viewport.addEventListener('mouseleave', function(){ panning = false; });
  viewport.addEventListener('wheel', function(e){
    e.preventDefault();
    var xs = (e.clientX - pointX)/scale, ys = (e.clientY - pointY)/scale;
    if((e.wheelDelta || -e.deltaY) > 0) scale*=1.1; else scale/=1.1;
    scale = Math.max(0.2, Math.min(scale, 3));
    pointX = e.clientX - xs*scale; pointY = e.clientY - ys*scale; setTransform();
  }, { passive: false });

  var modal = document.getElementById('info-modal');
  document.querySelector('.close-btn').addEventListener('click', function(){ modal.classList.remove('show'); });
  window.addEventListener('click', function(e){ if(e.target===modal) modal.classList.remove('show'); });
  
  document.querySelectorAll('.node').forEach(function(node){
    node.addEventListener('mousedown', function(){ isDragging = false; });
    node.addEventListener('click', function(){
      if(isDragging || document.body.classList.contains('edit-mode')) return;
      document.getElementById('modal-title').innerText = this.getAttribute('data-title');
      document.getElementById('modal-body').innerHTML = this.getAttribute('data-content');
      modal.classList.add('show');
    });
  });

  function getEdgePoint(id, side){
    var el = document.getElementById(id); if(!el) return {x:0,y:0};
    var r = { left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight };
    r.cx = r.left + r.width/2; r.cy = r.top + r.height/2;
    if(side==='top') return {x:r.cx, y:r.top};
    if(side==='bottom') return {x:r.cx, y:r.top + r.height};
    if(side==='left') return {x:r.left, y:r.cy};
    return {x:r.left + r.width, y:r.cy};
  }
  
  // ==========================================================
  // NOVA LÓGICA DE ROTEAMENTO: CALHAS E RODOVIAS PARALELAS
  // ==========================================================
  function drawLine(id1, id2, s, e, text, hasArrow, edgeIndex) {
    var p1 = getEdgePoint(id1, s), p2 = getEdgePoint(id2, e);
    var t = (text || '').toLowerCase();
    var cls = (t === 'sim' || t === 'yes') ? 'sim' : (t === 'nao' || t === 'não' || t === 'no') ? 'nao' : 'normal';
    var color = cls === 'sim' ? '#00948a' : cls === 'nao' ? '#e11d48' : '#64748b';
    var d = 'M ' + p1.x + ' ' + p1.y + ' ';
    
    // Calcula um "afastamento" caso haja várias linhas no mesmo caminho (0, 8, 16, 24px)
    var shift = ((edgeIndex || 0) % 5) * 8;
    
    var lx, ly;
    var labelOffset = 35; 
    if (s === 'right') { lx = p1.x + labelOffset; ly = p1.y; }
    else if (s === 'bottom') { lx = p1.x; ly = p1.y + labelOffset; }
    else if (s === 'left') { lx = p1.x - labelOffset; ly = p1.y; }
    else if (s === 'top') { lx = p1.x; ly = p1.y - labelOffset; }
    else { lx = p1.x; ly = p1.y; }
    
    // Roteamento inteligente sempre forçando as linhas a passarem pelos "Gutters" (Margens)
    if (s === 'right' && e === 'left') { 
        var mx = p1.x + 25 + shift; // Cai na margem direita
        d += 'L ' + mx + ' ' + p1.y + ' L ' + mx + ' ' + p2.y + ' L ' + p2.x + ' ' + p2.y; 
    }
    else if (s === 'bottom' && e === 'top') { 
        var my = p1.y + 25 + shift; // Cai na margem de baixo
        d += 'L ' + p1.x + ' ' + my + ' L ' + p2.x + ' ' + my + ' L ' + p2.x + ' ' + p2.y; 
    }
    else if (s === 'bottom' && e === 'left') { 
        if(p2.y <= p1.y + 20) { 
            var mx0 = p2.x - 25 - shift; // Dá a volta por trás
            var my0 = p1.y + 25 + shift;
            d += 'L ' + p1.x + ' ' + my0 + ' L ' + mx0 + ' ' + my0 + ' L ' + mx0 + ' ' + p2.y + ' L ' + p2.x + ' ' + p2.y;
        } else {
            var my1 = p1.y + 25 + shift;
            d += 'L ' + p1.x + ' ' + my1 + ' L ' + (p2.x - 25 - shift) + ' ' + my1 + ' L ' + (p2.x - 25 - shift) + ' ' + p2.y + ' L ' + p2.x + ' ' + p2.y; 
        }
    }
    else if (s === 'right' && e === 'right') { 
        var mx2 = Math.max(p1.x, p2.x) + 25 + shift; 
        d += 'L ' + mx2 + ' ' + p1.y + ' L ' + mx2 + ' ' + p2.y + ' L ' + p2.x + ' ' + p2.y; 
    }
    else if (s === 'left' && e === 'left') { 
        var mx3 = Math.min(p1.x, p2.x) - 25 - shift; 
        d += 'L ' + mx3 + ' ' + p1.y + ' L ' + mx3 + ' ' + p2.y + ' L ' + p2.x + ' ' + p2.y; 
    }
    else if (s === 'right' && e === 'top') { 
        var mx4 = p1.x + 25 + shift;
        var my4 = p2.y - 25 - shift;
        d += 'L ' + mx4 + ' ' + p1.y + ' L ' + mx4 + ' ' + my4 + ' L ' + p2.x + ' ' + my4 + ' L ' + p2.x + ' ' + p2.y;
    }
    else if (s === 'bottom' && e === 'right') {
        var my5 = p1.y + 25 + shift;
        var mx5 = p2.x + 25 + shift;
        d += 'L ' + p1.x + ' ' + my5 + ' L ' + mx5 + ' ' + my5 + ' L ' + mx5 + ' ' + p2.y + ' L ' + p2.x + ' ' + p2.y;
    }
    else { 
        d += 'L ' + p1.x + ' ' + p2.y + ' L ' + p2.x + ' ' + p2.y; 
    }

    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d); 
    path.setAttribute('fill', 'none'); 
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', cls === 'normal' ? '2' : '2.5');
    
    if (hasArrow) {
      path.setAttribute('marker-end', 'url(#arrow' + (cls === 'normal' ? '' : '-' + cls) + ')');
    }
    
    if (cls === 'nao') path.setAttribute('stroke-dasharray', '6,4');
    document.getElementById('svg-layer').appendChild(path);

    if (text) {
        var lbl = document.createElement('div');
        lbl.className = 'edge-label ' + cls;
        lbl.innerText = text;
        lbl.style.left = lx + 'px';
        lbl.style.top = ly + 'px';
        document.getElementById('label-layer').appendChild(lbl);
    }
  }

  function redrawEdges(){
    var svg = document.getElementById('svg-layer'), defs = svg.querySelector('defs');
    while(svg.firstChild) svg.removeChild(svg.firstChild);
    if(defs) svg.appendChild(defs);
    
    var lblLayer = document.getElementById('label-layer');
    if(lblLayer) lblLayer.innerHTML = '';
    
    // Passando o INDEX do loop para a função drawLine (Garante rodovias paralelas)
    EDGE_SPECS.forEach(function(spec, idx){ drawLine(spec.from, spec.to, spec.s, spec.e, spec.label, spec.hasArrow, idx); });
  }
  redrawEdges();

  var editMode = false, dragNode=null, sx=0, sy=0, sl=0, st=0;
  var origPos = {};
  document.querySelectorAll('.node').forEach(function(n){
    origPos[n.id] = { l: n.style.left, t: n.style.top };
  });

  document.getElementById('btn-edit').addEventListener('click', function(){
    editMode = !editMode; document.body.classList.toggle('edit-mode', editMode);
    this.innerText = editMode ? '✓ Concluir' : '✏️ Editar Layout';
    document.getElementById('btn-reset').style.display = editMode ? 'block' : 'none';
  });

  document.getElementById('btn-reset').addEventListener('click', function(){
    document.querySelectorAll('.node').forEach(function(n){
      if(origPos[n.id]){ n.style.left = origPos[n.id].l; n.style.top = origPos[n.id].t; }
    });
    redrawEdges();
  });

  document.querySelectorAll('.node').forEach(function(n){
    n.addEventListener('mousedown', function(ev){ if(!editMode) return; dragNode=n; sx=ev.clientX; sy=ev.clientY; sl=parseFloat(n.style.left); st=parseFloat(n.style.top); });
  });
  window.addEventListener('mousemove', function(ev){ if(dragNode){ dragNode.style.left=(sl+(ev.clientX-sx)/scale)+'px'; dragNode.style.top=(st+(ev.clientY-sy)/scale)+'px'; redrawEdges(); }});
  window.addEventListener('mouseup', function(){ dragNode=null; });
  
  document.getElementById('btn-download').addEventListener('click', function(){
    var clone = document.documentElement.cloneNode(true);
    var svg = clone.querySelector('#svg-layer'); if(svg) svg.innerHTML = '<defs>'+svg.querySelector('defs').innerHTML+'</defs>';
    clone.querySelector('body').classList.remove('edit-mode');
    var tb = clone.querySelector('.toolbar'); if(tb) tb.remove();
    var a = document.createElement('a'); 
    a.href = URL.createObjectURL(new Blob(['<!DOCTYPE html>\\n'+clone.outerHTML], {type:'text/html'}));
    a.download = FILE_NAME; 
    a.click();
  });
})();
</script></body></html>`;
}