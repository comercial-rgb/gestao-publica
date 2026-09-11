import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ═══ QUANDO O PASSO DE FUSO PRECISA RODAR ═══
 *
 * `test:fuso` é a suíte INTEIRA de novo, com `TZ=Pacific/Kiritimati`. Ele custa o mesmo que
 * `test:tudo` — nas medições desta máquina, entre 673 s e 908 s. Rodar os dois em todo
 * portão dobra o custo do passo mais caro, e um portão que custa 30 minutos passa a ser
 * rodado no fim do dia em vez de durante o trabalho.
 *
 * ⚠️ É AGENDAMENTO, NÃO RIGOR. Nada deixa de rodar: a condição abaixo obriga o fuso sempre
 * que o diff toca alguma coisa que lê relógio, E o portão de fechamento do lote o roda
 * incondicionalmente. O que se evita é pagá-lo por um lote que só mexeu em tela.
 *
 * ⚠️ E A CONDIÇÃO LÊ O DIFF, NÃO A OPINIÃO DE QUEM RODA. "Eu acho que não mexi em data" é
 * exatamente o julgamento que erra — o lote da apresentação do ENT03c estimava ~10 sítios
 * de data e a medição achou 44. Quem decide aqui é o conteúdo dos arquivos que mudaram.
 */

/** O que caracteriza um arquivo sensível a relógio. Uma lista, um lugar. */
const CONSTRUTOS_DE_RELOGIO: readonly RegExp[] = [
  /\bnew\s+Date\s*\(/,
  /\bDate\s*\.\s*(?:now|UTC|parse)\s*\(/,
  /\bget(?:UTC)?(?:FullYear|Month|Date|Hours|Day)\s*\(/,
  /\btoISOString\s*\(/,
  /\btoLocale(?:Date|Time)?String\s*\(/,
  /\bIntl\s*\.\s*DateTimeFormat\b/,
  // Os helpers do núcleo e o vocabulário do domínio que carrega eixo temporal.
  /\b(?:diaCivil|meioDiaCivil|compararPorDiaCivil|diferencaEmDiasCivis|somarDiasCivis|competenciaCivil)\b/,
  /\b(?:competencia|exercicio|vigencia|validade|periodoAberto|dataMovimento|ateDia|ateData)\b/i,
  // O relógio falso da suíte: um fixture que congela o tempo é, por definição, sensível.
  /\bvi\s*\.\s*(?:setSystemTime|useFakeTimers)\b/,
];

/**
 * Caminhos que obrigam o fuso pelo que SÃO, independentemente do conteúdo — inclusive
 * quando o diff os APAGA, caso em que não há conteúdo para ler.
 */
const CAMINHOS_QUE_OBRIGAM: readonly RegExp[] = [
  /^packages\/datas\//,
  /^test\/data-civil\.test\.ts$/,
  /^test\/periodo-fechado\.test\.ts$/,
  // As janelas de relatório: RREO e RGF recortam por período, e o recorte é o defeito.
  /^modules\/m12-relatorios\//,
  // O próprio decisor e o portão que o usa.
  /^scripts\/fuso-do-diff\.ts$/,
  /^scripts\/portao\.ts$/,
];

export interface DecisaoDeFuso {
  readonly roda: boolean;
  /** Frase pronta para o relatório do portão — em português, dizendo o que decidiu. */
  readonly porque: string;
  /** Os arquivos que obrigaram o fuso. Vazio quando ele é pulado. */
  readonly gatilhos: readonly string[];
}

export interface EntradaDaDecisao {
  /** Caminhos relativos, com "/", já unidos entre commits e área de trabalho. */
  readonly arquivos: readonly string[];
  /** Lê o conteúdo atual; devolve `null` para arquivo apagado ou ilegível. */
  readonly ler: (arquivo: string) => string | null;
  /** O portão que fecha o lote roda o fuso sempre. */
  readonly fimDeLote: boolean;
  /** `null` quando não foi possível determinar o diff — e aí o fuso roda. */
  readonly diffConhecido: boolean;
}

const CODIGO = /\.(?:tsx?|mts|cts|jsx?|mjs)$/;

export function decidirFuso(e: EntradaDaDecisao): DecisaoDeFuso {
  if (e.fimDeLote) {
    return {
      roda: true,
      porque: "portão de fechamento do lote — o fuso roda sempre aqui",
      gatilhos: [],
    };
  }

  // ⚠️ FALHA PARA O LADO DE RODAR. Se o diff não pôde ser lido (sem baseline, git ausente,
  // árvore recém-clonada), a resposta é o passo caro, não o silêncio. Um agendamento que
  // erra para o lado de pular vira, na prática, um passo que nunca roda.
  if (!e.diffConhecido) {
    return {
      roda: true,
      porque: "o diff não pôde ser determinado — na dúvida, roda",
      gatilhos: [],
    };
  }

  const gatilhos: string[] = [];
  for (const a of e.arquivos) {
    if (CAMINHOS_QUE_OBRIGAM.some((r) => r.test(a))) {
      gatilhos.push(a);
      continue;
    }
    if (!CODIGO.test(a)) continue;
    const conteudo = e.ler(a);
    if (conteudo === null) continue;
    if (CONSTRUTOS_DE_RELOGIO.some((r) => r.test(conteudo))) gatilhos.push(a);
  }

  if (gatilhos.length > 0) {
    const amostra = gatilhos.slice(0, 3).join(", ");
    const resto = gatilhos.length > 3 ? ` e mais ${gatilhos.length - 3}` : "";
    return {
      roda: true,
      porque: `o diff toca leitura de relógio: ${amostra}${resto}`,
      gatilhos,
    };
  }

  return {
    roda: false,
    porque:
      e.arquivos.length === 0
        ? "nada mudou desde o último portão verde"
        : `nenhum dos ${e.arquivos.length} arquivos do diff lê relógio`,
    gatilhos: [],
  };
}

/**
 * ═══ O DIFF QUE O AGENDAMENTO ENXERGA ═══
 *
 * O que mudou desde o último portão VERDE, unido ao que ainda não foi commitado.
 *
 * ⚠️ DESDE O ÚLTIMO VERDE, E NÃO DESDE O ÚLTIMO COMMIT. Um lote de cinco commits em que o
 * terceiro mexeu em `packages/datas` precisa do fuso no portão do quinto — olhar só o
 * commit da vez perderia a mudança que já está atrás, e ela nunca seria medida sob relógio
 * deslocado.
 *
 * ⚠️ E MORA AQUI, E NÃO NO `portao.ts`, PARA PODER SER TESTADO. `portao.ts` executa o
 * portão inteiro ao ser importado; uma função presa lá dentro só poderia ser conferida
 * rodando os dez passos, o que é o mesmo que não ser conferida.
 */
export function diffDoRepositorio(
  raiz: string,
  marcaDoUltimoVerde: string,
  fimDeLote: boolean
): EntradaDaDecisao {
  const ler = (arquivo: string): string | null => {
    try {
      return readFileSync(join(raiz, arquivo), "utf8");
    } catch {
      return null; // apagado no diff — o caminho ainda decide por si
    }
  };

  const git = (args: readonly string[]): string | null => {
    const r = spawnSync("git", [...args], { cwd: raiz, encoding: "utf8" });
    return r.status === 0 ? (r.stdout ?? "") : null;
  };

  let base: string | null;
  try {
    base = readFileSync(marcaDoUltimoVerde, "utf8").trim();
  } catch {
    base = null;
  }

  const naoCommitado = git(["status", "--porcelain", "-z"]);
  const desdeOVerde =
    base === null || base === "" ? null : git(["diff", "--name-only", `${base}..HEAD`]);

  if (naoCommitado === null || desdeOVerde === null) {
    // Sem marca (primeiro portão), marca apontando para commit que sumiu (rebase, reset),
    // ou git indisponível. Em todos, a resposta é o passo caro.
    return { arquivos: [], ler, fimDeLote, diffConhecido: false };
  }

  return {
    arquivos: unirCaminhos(desdeOVerde, naoCommitado),
    ler,
    fimDeLote,
    diffConhecido: true,
  };
}

/**
 * Une a saída de `git diff --name-only` com a de `git status --porcelain -z`.
 *
 * ⚠️ O `-z` NÃO É DETALHE. Sem ele, caminho com espaço vem entre aspas e caminho com
 * acento vem escapado em octal — e este repositório tem rota `app/(areas)/...` e nomes
 * acentuados em `docs/`. O separador NUL é o único que não precisa de desescape.
 */
export function unirCaminhos(diffNomes: string, statusPorcelain: string): readonly string[] {
  const arquivos = new Set<string>();
  for (const l of diffNomes.split("\n")) {
    const t = l.trim();
    if (t !== "") arquivos.add(t);
  }
  for (const reg of statusPorcelain.split("\0")) {
    // Cada registro é `XY <caminho>`; os dois primeiros chars são o estado e o terceiro o
    // espaço. Um registro curto demais é lixo de borda e não um caminho.
    if (reg.length < 4) continue;
    arquivos.add(reg.slice(3));
  }
  return [...arquivos].sort();
}
