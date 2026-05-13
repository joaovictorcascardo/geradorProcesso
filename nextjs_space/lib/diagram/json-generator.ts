// Importa as tipagens e dependências das suas outras libs
import { LaidOutNode } from './layout';
import { Graph } from './mermaid-parser';
import { RaciRow } from './csv-parser';
// Importa a sua função que sabe calcular os lados das linhas
import { inferSides } from './html-generator'; 

export function generateProcessJson(
  graph: Graph,
  layout: ReturnType<typeof import('./layout').layoutGraph>,
  raci: Record<string, RaciRow>,
  customProcessTitle?: string
) {
  // 1. Mapeia as Raias (Swimlanes)
  const raias = layout.lanes.map(l => ({
    nome: l.name.replace(/_/g, ' ').trim(),
    geometria: { top: l.top, height: l.height }
  }));

  // 2. Mapeia os Nodos com Coordenadas + RACI embutido
  const nodos = Object.values(layout.nodes).map(n => {
    const rowDados = (n.etapa && raci[n.etapa]) || null;
    
    return {
      id: n.id,
      etapa: n.etapa || "",
      label: n.label.replace(/<br\s*\/?\s*>/gi, ' '),
      tipo: n.type, // 'rect', 'diamond' ou 'oval'
      geometria: { x: n.x, y: n.y, w: n.w, h: n.h },
      dados_raci: rowDados ? {
        descricao: rowDados.descricao,
        responsavel: rowDados.responsavel,
        aprovador: rowDados.aprovador,
        consultado: rowDados.consultado,
        informado: rowDados.informado,
        departamento: rowDados.departamento,
        sistema: rowDados.sistema,
        entregavel: rowDados.entregavel,
        sla: rowDados.sla,
        instrucoes: rowDados.instrucoes
      } : null
    };
  });

  // 3. Mapeia as Linhas/Conexões (Edges)
  const validEdges = graph.edges.filter((e) => layout.nodes[e.from] && layout.nodes[e.to] && !(layout.dropDowns.has(e.from) && layout.endNodes.has(e.to)));
  
  const conexoes = validEdges.map(e => {
    const a = layout.nodes[e.from];
    const b = layout.nodes[e.to];
    const isDrop = layout.dropDowns.has(b.id) && a.type === 'diamond';
    const { s, e: ee } = inferSides(a, b, e.label || '', isDrop);
    
    return {
      origem: a.id,
      destino: b.id,
      label: e.label || '',
      tem_seta: e.hasArrow,
      ancoragem: { saida: s, entrada: ee }
    };
  });

  // 4. Monta o Payload Final
  return JSON.stringify({
    metadados: {
      titulo: customProcessTitle || 'Fluxograma',
      canvas: { width: layout.width, height: layout.height }
    },
    raias,
    nodos,
    conexoes
  });
}