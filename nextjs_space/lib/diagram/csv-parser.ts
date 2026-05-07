export interface RaciRow {
  etapa: string;
  descricao: string;
  instrucoes: string;
  responsavel: string;
  aprovador: string;
  consultado: string;
  informado: string;
  departamento: string;
  sistema: string;
  entregavel: string;
  sla: string;
  processo: string;
}

function cleanCell(s: string): string {
  const t = (s || '').replace(/\uFEFF/g, '').trim();
  if (!t || t.toLowerCase() === 'nan' || t === '-') return '';
  return t;
}

// RFC-4180-ish CSV row parser. Handles quoted values containing commas, newlines, and escaped quotes ("").
function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

// Joins continuation lines that occur inside quoted CSV fields.
function normalizeCsvLines(text: string): string[] {
  const raw = text.replace(/\uFEFF/g, '').split(/\r?\n/);
  const out: string[] = [];
  let buf = '';
  let openQuotes = 0;
  for (const line of raw) {
    if (buf.length === 0) {
      buf = line;
    } else {
      buf += '\n' + line;
    }
    // Count unescaped quotes
    let count = 0;
    for (let i = 0; i < buf.length; i++) {
      if (buf[i] === '"') {
        if (buf[i + 1] === '"') {
          i++;
          continue;
        }
        count++;
      }
    }
    openQuotes = count % 2;
    if (openQuotes === 0) {
      out.push(buf);
      buf = '';
    }
  }
  if (buf) out.push(buf);
  return out.filter((l) => l.length > 0);
}

function splitMarkdownRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

function normalizeHeader(h: string): string {
  return (h || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function detectFormat(text: string): 'markdown' | 'csv' {
  // Markdown table requires at least one row that starts and ends with '|' or has many '|'
  const head = text.split(/\r?\n/).find((l) => l.trim().length > 0) || '';
  const pipes = (head.match(/\|/g) || []).length;
  const commas = (head.match(/,/g) || []).length;
  if (pipes >= 3 && pipes >= commas) return 'markdown';
  return 'csv';
}

export function parseRaciCsv(text: string): Record<string, RaciRow> {
  if (!text || !text.trim()) return {};
  const fmt = detectFormat(text);
  const rowParser = fmt === 'csv' ? parseCsvRow : splitMarkdownRow;

  let rows: string[][] = [];
  if (fmt === 'csv') {
    const logicalLines = normalizeCsvLines(text);
    rows = logicalLines.map(parseCsvRow);
  } else {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).filter((l) => l.includes('|'));
    rows = lines
      .filter((l) => !/^\|?[\s:|-]+\|?$/.test(l))
      .map(splitMarkdownRow);
  }
  if (rows.length < 2) return {};

  const header = rows[0].map(normalizeHeader);
  const findIdx = (...cands: string[]): number => {
    for (const c of cands) {
      const i = header.findIndex((h) => h.includes(c));
      if (i >= 0) return i;
    }
    return -1;
  };
  const idx = {
    processo: findIdx('processos rubeus', 'processo'),
    etapa: findIdx('etapa'),
    descricao: findIdx('descrição', 'descricao'),
    instrucoes: findIdx('instruções', 'instrucoes'),
    r: findIdx('responsável', 'responsavel'),
    a: findIdx('aprovador'),
    c: findIdx('consultado'),
    i: findIdx('informado'),
    dep: findIdx('departamento'),
    sis: findIdx('ferramenta', 'sistema'),
    ent: findIdx('entregável', 'entregavel'),
    sla: findIdx('prazo', 'sla'),
  };

  const result: Record<string, RaciRow> = {};
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    if (!cells || cells.length < 2) continue;
    const get = (n: number) => (n >= 0 ? cleanCell(cells[n] ?? '') : '');
    const etapa = get(idx.etapa);
    if (!etapa) continue;
    if (!/^PR-\d+/i.test(etapa) && !/^[A-Za-z]+-\d+/.test(etapa)) {
      // Skip rows whose 'etapa' isn't a code (e.g., headings)
      continue;
    }
    result[etapa] = {
      etapa,
      processo: get(idx.processo),
      descricao: get(idx.descricao),
      instrucoes: get(idx.instrucoes),
      responsavel: get(idx.r),
      aprovador: get(idx.a),
      consultado: get(idx.c),
      informado: get(idx.i),
      departamento: get(idx.dep),
      sistema: get(idx.sis),
      entregavel: get(idx.ent),
      sla: get(idx.sla),
    };
  }
  return result;
}

// Try to infer a process title (e.g., "PR-001") from the CSV processo column or etapa codes.
export function inferProcessCode(rows: Record<string, RaciRow>): string {
  const items = Object.values(rows);
  if (items.length === 0) return '';
  // 'processo' often looks like 'PR-001 (https://www.notion.so/PR-001-...)'
  for (const r of items) {
    const m = (r.processo || '').match(/(PR-\d+)/);
    if (m) return m[1];
  }
  for (const r of items) {
    const m = (r.etapa || '').match(/(PR-\d+)/);
    if (m) return m[1];
  }
  return '';
}
