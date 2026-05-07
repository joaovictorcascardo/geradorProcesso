'use client';

import { useState, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Upload,
  Download,
  FileText,
  FileSpreadsheet,
  Eye,
  AlertCircle,
  CheckCircle2,
  Workflow,
  ExternalLink,
} from 'lucide-react';
import { parseMermaid } from '@/lib/diagram/mermaid-parser';
import { parseRaciCsv, inferProcessCode } from '@/lib/diagram/csv-parser';
import { layoutGraph } from '@/lib/diagram/layout';
import { generateHtml } from '@/lib/diagram/html-generator';

export default function Home() {
  const [csvText, setCsvText] = useState<string>('');
  const [mermaidText, setMermaidText] = useState<string>('');
  const [csvName, setCsvName] = useState<string>('');
  const [mermaidName, setMermaidName] = useState<string>('');
  const [processName, setProcessName] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const previewRef = useRef<HTMLIFrameElement>(null);

  const generated = useMemo(() => {
    setErrorMsg('');
    if (!mermaidText || !csvText) return null;
    try {
      const graph = parseMermaid(mermaidText);
      const raci = parseRaciCsv(csvText);
      const nodeCount = Object.keys(graph?.nodes ?? {}).length;
      if (nodeCount === 0) {
        setErrorMsg('Nenhum nó encontrado no arquivo Mermaid. Verifique a sintaxe.');
        return null;
      }
      if (Object.keys(raci).length === 0) {
        setErrorMsg(
          'Não foi possível ler nenhuma linha válida do CSV. Confira se contém a coluna “Etapa” com códigos no padrão PR-XXX-NN.'
        );
      }
      const layout = layoutGraph(graph);
      const procCode = inferProcessCode(raci);
      const effectiveTitle = processName || (procCode ? `${procCode} - Fluxograma Interativo` : '');
      const html = generateHtml(graph, layout, raci, effectiveTitle);
      return {
        html,
        nodeCount,
        edgeCount: graph.edges.length,
        raciCount: Object.keys(raci).length,
        procCode,
        laneCount: layout.lanes.length,
        dropDownCount: layout.dropDowns.size,
      };
    } catch (err: any) {
      setErrorMsg('Erro ao gerar HTML: ' + (err?.message ?? 'desconhecido'));
      return null;
    }
  }, [csvText, mermaidText, processName]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>, kind: 'csv' | 'mermaid') {
    const file = e?.target?.files?.[0];
    if (!file) return;
    const text = await file.text();
    if (kind === 'csv') {
      setCsvText(text);
      setCsvName(file.name);
    } else {
      setMermaidText(text);
      setMermaidName(file.name);
    }
  }

  function handleDownload() {
    if (!generated?.html) return;
    const blob = new Blob([generated.html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const baseName = (processName && processName.trim()) || generated.procCode || 'fluxograma';
    a.download = baseName.replace(/[^A-Za-z0-9_\-]+/g, '_') + '.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function handleOpenInNewTab() {
    if (!generated?.html) return;
    const blob = new Blob([generated.html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  const previewSrc = generated?.html
    ? 'data:text/html;charset=utf-8,' + encodeURIComponent(generated.html)
    : '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-[1200px] mx-auto px-6 py-10">
        <header className="text-center mb-10">
          <div className="inline-flex items-center gap-3 mb-3">
            <Workflow className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-slate-800">
              Gerador de <span className="text-blue-600">Fluxogramas</span> Interativos
            </h1>
          </div>
          <p className="text-slate-600">
            Envie a matriz RACI (CSV) e o diagrama Mermaid (TXT) para gerar um HTML auto-contido com pan, zoom e modais.
          </p>
        </header>

        <div className="grid md:grid-cols-2 gap-5 mb-6">
          <Card className="p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-3">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              <Label className="text-base font-semibold">Matriz RACI (CSV)</Label>
            </div>
            <Input
              type="file"
              accept=".csv,.txt,text/csv"
              onChange={(e) => handleFile(e, 'csv')}
            />
            {csvName && (
              <p className="text-sm text-emerald-700 mt-2 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> {csvName}
              </p>
            )}
            <p className="text-xs text-slate-500 mt-2">
              Aceita o CSV exportado do Notion (separado por vírgula com aspas) ou tabela Markdown.
            </p>
          </Card>

          <Card className="p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-5 h-5 text-violet-600" />
              <Label className="text-base font-semibold">Diagrama Mermaid (TXT)</Label>
            </div>
            <Input
              type="file"
              accept=".txt,.mmd,.md,text/plain"
              onChange={(e) => handleFile(e, 'mermaid')}
            />
            {mermaidName && (
              <p className="text-sm text-violet-700 mt-2 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> {mermaidName}
              </p>
            )}
            <p className="text-xs text-slate-500 mt-2">
              Suporta <code>flowchart LR</code>, <code>subgraph</code>, nós <code>[ ]</code>, <code>{'{ }'}</code>, <code>(( ))</code> e arestas <code>--&gt;</code> com rótulos.
            </p>
          </Card>
        </div>

        <Card className="p-6 mb-6 shadow-sm">
          <Label htmlFor="procName" className="text-sm font-semibold mb-2 block">
            Título do processo (opcional — será inferido do CSV se vazio)
          </Label>
          <Input
            id="procName"
            placeholder="Ex.: PR-001 - PROCESSO DE TRIAGEM DE NOVAS DEMANDAS"
            value={processName}
            onChange={(e) => setProcessName(e?.target?.value ?? '')}
          />
        </Card>

        {errorMsg && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-6">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
            <span className="text-sm">{errorMsg}</span>
          </div>
        )}

        {generated && (
          <Card className="p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2 text-sm text-slate-600 flex-wrap">
                <span className="flex items-center gap-1">
                  <Eye className="w-4 h-4 text-blue-600" /> Preview
                </span>
                <span className="px-2 py-1 rounded-md bg-blue-50 text-blue-700 font-medium">
                  {generated.nodeCount} nós
                </span>
                <span className="px-2 py-1 rounded-md bg-violet-50 text-violet-700 font-medium">
                  {generated.edgeCount} arestas
                </span>
                <span className="px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 font-medium">
                  {generated.raciCount} linhas RACI
                </span>
                <span className="px-2 py-1 rounded-md bg-amber-50 text-amber-700 font-medium">
                  {generated.laneCount} raias
                </span>
                {generated.dropDownCount > 0 && (
                  <span className="px-2 py-1 rounded-md bg-rose-50 text-rose-700 font-medium">
                    {generated.dropDownCount} desvios
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button onClick={handleOpenInNewTab} variant="outline" className="gap-2">
                  <ExternalLink className="w-4 h-4" /> Abrir em nova aba
                </Button>
                <Button onClick={handleDownload} className="gap-2">
                  <Download className="w-4 h-4" /> Baixar HTML
                </Button>
              </div>
            </div>
            <div
              className="w-full rounded-lg overflow-hidden border border-slate-200 bg-white"
              style={{ height: '70vh' }}
            >
              <iframe
                ref={previewRef}
                src={previewSrc}
                title="preview"
                className="w-full h-full"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
          </Card>
        )}

        {!generated && !errorMsg && (
          <div className="text-center text-slate-500 py-12">
            <Upload className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p>Carregue os dois arquivos para visualizar o fluxograma.</p>
          </div>
        )}
      </div>
    </div>
  );
}
