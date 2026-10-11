import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A VARREDURA DAS ESCRITAS MUTÁVEIS do código de produção, para as guardas do censo de escrita do papel de runtime
 * (`upsert-no-censo-de-escrita.test.ts` e `update-no-censo-de-escrita.test.ts`). Módulo comum, e NÃO um arquivo de teste:
 * importar um `.test.ts` registraria os testes dele de novo no importador.
 *
 * O LEITOR DE CHAVES lê o objeto literal de \`data\`/\`update\` sem executar nada: tira os comentários, aceita chave entre
 * aspas e, num espalhamento condicional \`...(c ? { coluna } : {})\`, lê as colunas dos objetos de dentro. Espalhamento
 * de uma variável (\`...dados\`) não se lê estaticamente e vira \`<...dados>\` — a guarda acusa, e a correção é escrever as
 * colunas. `varredura-de-escrita.test.ts` prova cada um desses casos com trechos sintéticos.
 */

const RAIZES = ["modules", "lib", "app", "adapters"];

function arquivos(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) {
      if (nome === "node_modules" || nome === "generated") continue;
      saida.push(...arquivos(p));
    } else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.tsx?$/.test(nome)) saida.push(p);
  }
  return saida;
}

export function arquivosDeProducao(): string[] {
  return RAIZES.flatMap((r) => arquivos(r));
}

/** O texto entre a chave que abre em `inicio` e a que a fecha. */
export function blocoDaChave(texto: string, inicio: number): string {
  let nivel = 0;
  for (let i = inicio; i < texto.length; i += 1) {
    if (texto[i] === "{") nivel += 1;
    else if (texto[i] === "}") {
      nivel -= 1;
      if (nivel === 0) return texto.slice(inicio + 1, i);
    }
  }
  return "";
}

/** Tira comentários de linha e de bloco (o suficiente para objeto literal: não há `//` dentro das chaves lidas). */
function semComentarios(t: string): string {
  return t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
}

/** Os segmentos de primeiro nível de um objeto literal, separados por vírgula. */
function segmentosDoTopo(conteudo: string): string[] {
  const segmentos: string[] = [];
  let nivel = 0;
  let atual = "";
  for (const c of conteudo) {
    if ("{([".includes(c)) nivel += 1;
    else if ("})]".includes(c)) nivel -= 1;
    if (nivel === 0 && c === ",") {
      segmentos.push(atual);
      atual = "";
    } else atual += c;
  }
  segmentos.push(atual);
  return segmentos.map((s) => s.trim()).filter((s) => s !== "");
}

/** As colunas de um objeto literal (o conteúdo entre as chaves). */
export function colunasDoObjeto(conteudo: string): string[] {
  const colunas: string[] = [];
  for (const seg of segmentosDoTopo(semComentarios(conteudo))) {
    if (seg.startsWith("...")) {
      const resto = seg.slice(3).trim();
      if (resto.includes("{")) {
        // espalhamento condicional: as colunas dos objetos literais de dentro
        for (let i = resto.indexOf("{"); i >= 0; i = resto.indexOf("{", i + 1)) {
          const dentro = blocoDaChave(resto, i);
          colunas.push(...colunasDoObjeto(dentro));
          i += dentro.length + 1;
        }
      } else colunas.push(`<...${resto}>`);
      continue;
    }
    const k = /^["']?([A-Za-z_]\w*)["']?\s*(?::|$)/.exec(seg)?.[1];
    if (k !== undefined) colunas.push(k);
  }
  return [...new Set(colunas)];
}

export interface EscritaMutavel {
  readonly onde: string;
  readonly modelo: string;
  readonly op: "update" | "delete" | "upsert";
  readonly colunas: readonly string[];
}

/** Lê as escritas mutáveis de um texto de código (para a varredura e para a prova com trechos sintéticos). */
export function escritasDoTexto(t: string, arquivo = "trecho"): EscritaMutavel[] {
  const achados: EscritaMutavel[] = [];
  for (const m of t.matchAll(/\.([a-z]\w+)\.(update|updateMany|delete|deleteMany|upsert)\(\s*\{/g)) {
    const modelo = (m[1] ?? "").charAt(0).toUpperCase() + (m[1] ?? "").slice(1);
    const onde = `${arquivo}:${String(t.slice(0, m.index).split("\n").length)}`;
    const op = m[2] ?? "";
    if (op.startsWith("delete")) {
      achados.push({ onde, modelo, op: "delete", colunas: [] });
      continue;
    }
    const corpo = blocoDaChave(t, (m.index ?? 0) + m[0].length - 1);
    const chave = op === "upsert" ? "update" : "data";
    const dt = new RegExp(`(^|[\\s,{])${chave}:\\s*\\{`, "m").exec(corpo);
    if (dt === null) {
      // `data: variavel` não se lê; o upsert sem `update` não atualiza coluna nenhuma.
      if (op !== "upsert") achados.push({ onde, modelo, op: "update", colunas: ["<data não literal>"] });
      continue;
    }
    const colunas = colunasDoObjeto(blocoDaChave(corpo, dt.index + dt[0].length - 1));
    if (op === "upsert" && colunas.length === 0) continue;
    achados.push({ onde, modelo, op: op === "upsert" ? "upsert" : "update", colunas });
  }
  return achados;
}

export function escritasMutaveis(): EscritaMutavel[] {
  return arquivosDeProducao().flatMap((arq) => escritasDoTexto(readFileSync(arq, "utf8"), arq));
}
