'use client';

import { useState, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
    const iframeDoc = previewRef.current?.contentWindow?.document || previewRef.current?.contentDocument;
    if (iframeDoc) {
      const btnInterno = iframeDoc.getElementById('btn-download');
      if (btnInterno) {
        btnInterno.click();
        return; 
      }
    }
  }

  function handleOpenInNewTab() {
    if (!generated?.html) return;
    const blob = new Blob([generated.html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
          @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
          
          .font-poppins { 
            font-family: 'Poppins', sans-serif !important; 
          }

          .custom-file-upload {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 12px 24px;
            cursor: pointer;
            background: #e0f2f1;
            color: #00948a;
            border-radius: 50px;
            font-weight: 600;
            font-size: 14px;
            transition: all 0.2s ease;
            border: 1px solid transparent;
            width: 100%;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
          }

          .custom-file-upload:hover { 
            background: #ccfbf1; 
            border-color: #00948a;
            transform: translateY(-1px);
          }

          .input-rubeus {
            border-radius: 50px;
            border: 1px solid #e2e8f0;
            padding: 14px 25px;
            width: 100%;
            outline: none;
            font-family: 'Poppins', sans-serif;
            transition: all 0.2s;
            background: white;
          }

          .input-rubeus:focus { 
            border-color: #00948a; 
            box-shadow: 0 0 0 3px rgba(0, 148, 138, 0.1); 
          }

          .hero-curve {
            border-bottom-left-radius: 50% 40px; 
            border-bottom-right-radius: 50% 40px;
          }
        `
      }} />

      <div className="min-h-screen bg-[#cacaca59] font-poppins pb-12">
        
        {/* Header no estilo Hero da Rubeus */}
        <div className="bg-[#00948a] pt-14 pb-28 text-center text-white relative z-10 shadow-lg hero-curve">
          <div className="flex items-center justify-center gap-3 mb-5">
            <div className="bg-white p-3 rounded-2xl shadow-xl">
              <Workflow className="w-9 h-9 text-[#00948a]" />
            </div>
          </div>
          <h1 className="text-4xl font-bold mb-3 tracking-tight">Gerador de Fluxogramas</h1>
          <p className="text-white/90 text-lg max-w-xl mx-auto font-light">
            Crie visualizações interativas de processos com o padrão visual Rubeus.
          </p>
        </div>

        <div className="max-w-[1100px] mx-auto px-6 -mt-14 relative z-20">
          
          <div className="grid md:grid-cols-2 gap-8 mb-8">
            {/* Card Matriz RACI */}
            <Card className="p-8 border-none shadow-xl bg-white" style={{ borderRadius: '24px' }}>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-[#e0f2f1] text-[#00948a] rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
                  <FileSpreadsheet className="w-7 h-7" />
                </div>
                <div>
                  <Label className="text-lg font-bold text-[#1e293b] block">Matriz RACI</Label>
                  <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Arquivo .CSV</span>
                </div>
              </div>
              
              <label className="custom-file-upload">
                <input type="file" accept=".csv" onChange={(e) => handleFile(e, 'csv')} className="hidden" />
                <Upload className="w-5 h-5 mr-2" /> 
                {csvName ? 'Trocar Arquivo' : 'Selecionar Matriz'}
              </label>
              
              {csvName && (
                <div className="mt-4 flex items-center gap-3 px-4 py-3 bg-[#f0fdfa] rounded-xl text-[#00948a] text-sm font-semibold border border-[#ccfbf1]">
                  <CheckCircle2 className="w-5 h-5 shrink-0" /> 
                  <span className="truncate">{csvName}</span>
                </div>
              )}
            </Card>

            {/* Card Mermaid TXT */}
            <Card className="p-8 border-none shadow-xl bg-white" style={{ borderRadius: '24px' }}>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-[#f1f5f9] text-[#1e293b] rounded-2xl flex items-center justify-center shrink-0 shadow-inner">
                  <FileText className="w-7 h-7" />
                </div>
                <div>
                  <Label className="text-lg font-bold text-[#1e293b] block">Diagrama Mermaid</Label>
                  <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Arquivo .TXT</span>
                </div>
              </div>

              <label className="custom-file-upload" style={{ background: '#f1f5f9', color: '#1e293b' }}>
                <input type="file" accept=".txt" onChange={(e) => handleFile(e, 'mermaid')} className="hidden" />
                <Upload className="w-5 h-5 mr-2" /> 
                {mermaidName ? 'Trocar Arquivo' : 'Selecionar Diagrama'}
              </label>

              {mermaidName && (
                <div className="mt-4 flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-xl text-slate-600 text-sm font-semibold border border-slate-200">
                  <CheckCircle2 className="w-5 h-5 text-[#00948a] shrink-0" /> 
                  <span className="truncate">{mermaidName}</span>
                </div>
              )}
            </Card>
          </div>

          {/* Input de Título */}
          <Card className="p-8 mb-8 border-none shadow-lg bg-white" style={{ borderRadius: '24px' }}>
            <Label className="text-base font-bold text-[#1e293b] mb-4 block">
              Título Personalizado do Processo
            </Label>
            <input
              placeholder="Ex.: PR-001 - Fluxo de Atendimento"
              value={processName}
              onChange={(e) => setProcessName(e.target.value)}
              className="input-rubeus shadow-inner"
            />
          </Card>

          {/* Mensagem de Erro */}
          {errorMsg && (
            <div className="flex items-start gap-3 bg-[#fef2f2] border border-[#fecaca] text-[#b91c1c] p-5 mb-8 shadow-md rounded-2xl">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <span className="text-[15px] font-semibold">{errorMsg}</span>
            </div>
          )}

          {/* Área de Preview */}
          {generated && (
            <Card className="p-8 border-none shadow-2xl bg-white" style={{ borderRadius: '28px' }}>
              <div className="flex flex-wrap items-center justify-between gap-5 mb-8 pb-4 border-b border-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#e0f2f1] rounded-full flex items-center justify-center">
                    <Eye className="w-5 h-5 text-[#00948a]" />
                  </div>
                  <span className="font-bold text-[#1e293b] text-xl">Visualização</span>
                </div>
                
                <div className="flex gap-4">
                  <Button 
                    onClick={handleOpenInNewTab} 
                    variant="outline" 
                    className="rounded-full border-slate-200 text-slate-600 font-bold px-7 h-12 hover:bg-slate-50 transition-all"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" /> Tela Cheia
                  </Button>
                  <Button 
                    onClick={handleDownload} 
                    className="rounded-full bg-[#00948a] hover:bg-[#007970] text-white font-bold px-10 h-12 shadow-xl shadow-[#00948a]/30 transition-all transform hover:scale-105 active:scale-95"
                  >
                    <Download className="w-4 h-4 mr-2" /> Baixar HTML Final
                  </Button>
                </div>
              </div>
              
              <div className="w-full overflow-hidden border border-slate-100 bg-slate-50 rounded-3xl relative shadow-inner" style={{ height: '70vh' }}>
                <iframe 
                  ref={previewRef} 
                  srcDoc={generated.html} 
                  className="w-full h-full" 
                  sandbox="allow-scripts allow-same-origin allow-downloads" 
                />
              </div>

              <div className="flex justify-center gap-6 mt-6">
                <div className="flex flex-col items-center">
                   <span className="text-2xl font-bold text-[#182236]">{generated.nodeCount}</span>
                   <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Nós</span>
                </div>
                <div className="w-[1px] h-8 bg-slate-100 self-center"></div>
                <div className="flex flex-col items-center">
                   <span className="text-2xl font-bold text-[#182236]">{generated.edgeCount}</span>
                   <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Arestas</span>
                </div>
                <div className="w-[1px] h-8 bg-slate-100 self-center"></div>
                <div className="flex flex-col items-center">
                   <span className="text-2xl font-bold text-[#182236]">{generated.raciCount}</span>
                   <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Lógicas</span>
                </div>
              </div>
            </Card>
          )}

          {/* Estado Vazio */}
          {!generated && !errorMsg && (
            <div className="text-center py-24 mt-8 bg-white/60 backdrop-blur-sm border-2 border-dashed border-slate-200 rounded-[32px]">
              <div className="w-24 h-24 bg-white shadow-lg rounded-full flex items-center justify-center mx-auto mb-6">
                <Upload className="w-10 h-10 text-slate-300" />
              </div>
              <h3 className="text-2xl font-bold text-[#1e293b] mb-2">Aguardando Documentos</h3>
              <p className="text-[16px] text-[#64748b] max-w-sm mx-auto">
                Insira os arquivos de Matriz e Diagrama acima para processar o fluxograma.
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}