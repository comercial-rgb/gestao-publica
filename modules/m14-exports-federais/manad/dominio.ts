import { toMoney, type Money } from "../../../packages/contracts/index.js";

/**
 * M14 — MANAD (Manual Normativo de Arquivos Digitais). DOMÍNIO PURO (sem I/O).
 *
 * TR 7.36. IN MPS/SRP 12/2006; leiaute v1.0.0.2 (COD_VER = 003), mantido pela
 * v1.0.0.3 / ADE Cofis 44/2020.
 *
 * ═══ ⚠️ O MANAD É O OPOSTO DA MSC, CAMPO A CAMPO — E ISSO NÃO É DETALHE ═══
 * Os dois arquivos saem do MESMO razão, para DOIS órgãos, e quase tudo que é verdade num
 * é erro no outro:
 *
 *                        MSC (SICONFI/STN)        MANAD (RFB/AFPS)
 *   codificação          UTF-8                    ISO 8859-1 (Latin-1)
 *   decimal              PONTO    "1129989.99"    VÍRGULA  "1129989,99"
 *   separador            vírgula (CSV)            pipe  |
 *   fim de linha         CRLF, com campo final    SEM pipe ao fim da linha
 *   campo vazio          ,,                       ||
 *
 * ⚠️ E É POR ISSO QUE A CONVERSÃO MORA NA BORDA, E SÓ NELA. Dentro do sistema, dinheiro é
 * `Money` (decimal.js) e serializa com PONTO — que é o formato de máquina. Quem "consertar"
 * o `toMoney` para vírgula quebra a MSC; quem exportar a MSC com vírgula tem o arquivo
 * rejeitado pela STN. Os dois formatos coexistem porque nenhum dos dois vaza do seu
 * serializador. Ver `serializarMscCsv` no `msc/dominio.ts` — o irmão gêmeo e oposto deste
 * arquivo.
 */

// ═══════════════════════════════════════════════════════════════════════════
// A BORDA: ONDE O DADO VIRA CAMPO
// ═══════════════════════════════════════════════════════════════════════════

/** Onde estamos — para que TODO erro de formatação nomeie registro e campo. */
export interface Onde {
  readonly registro: string;
  readonly campo: string;
}

/**
 * ⚠️ LATIN-1 FAIL-CLOSED — E POR QUE NÃO SE TRANSLITERA EM SILÊNCIO.
 *
 * O MANAD é ISO 8859-1. Um caractere fora dela (emoji, travessão "—", aspas curvas "",
 * "≠") NÃO TEM representação: o `Buffer.from(s, "latin1")` o troca por lixo, sem avisar.
 *
 * A tentação é transliterar ("—" -> "-", "ç" -> "c"). NÃO. Duas razões:
 *   · o "ç" e o "ã" CABEM em Latin-1 — transliterar destruiria acentuação VÁLIDA, e o
 *     nome do credor iria à Receita deformado;
 *   · o que NÃO cabe é sinal de dado sujo (alguém colou de um editor de texto rico). Um
 *     arquivo fiscal não conserta dado sujo — ele o DENUNCIA, com o nome do campo.
 *
 * Então: cabe em Latin-1, passa; não cabe, a geração INTEIRA cai, nomeando o caractere,
 * o ponto de código, o registro e o campo. Quem lê o erro sabe exatamente o que corrigir.
 */
export function exigirLatin1(valor: string, onde: Onde): string {
  // O round-trip é o teste: o que não cabe volta diferente.
  const volta = Buffer.from(valor, "latin1").toString("latin1");
  if (volta === valor) return valor;

  const fora = [...valor].filter(
    (c) => c.codePointAt(0)! > 0xff || Buffer.from(c, "latin1").toString("latin1") !== c
  );
  const lista = [...new Set(fora)]
    .map((c) => `"${c}" (U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")})`)
    .join(", ");

  throw new Error(
    `MANAD — CARACTERE FORA DO ISO 8859-1 no registro ${onde.registro}, campo ` +
      `${onde.campo}: ${lista}. O arquivo do MANAD é Latin-1 (item 3.1) e este ` +
      `caractere NÃO tem representação nele — gravá-lo produziria lixo silencioso no ` +
      `arquivo que vai à Receita.\n` +
      `O gerador NÃO TRANSLITERA: "ç" e "ã" CABEM em Latin-1, e trocá-los deformaria ` +
      `acentuação válida. O que não cabe é dado sujo (texto colado de editor rico, com ` +
      `travessão "—" ou aspas curvas ""). Corrija o CADASTRO. Valor recebido: ` +
      `"${valor}".`
  );
}

/** Máximo dos campos alfanuméricos comuns (item 3.1). */
const MAX_ALFA = 255;

/**
 * PSLM — "Preenchimento Sem Limite Máximo". Os campos de histórico e descrição livre
 * (HIST_EMP, HIST_LIQUID, HIST_PGTO, DESC_TIP_FORN, DESC_SERV_OBRA) escapam do teto de
 * 255. É o próprio manual que os excetua; o Record abaixo é essa exceção, e ela é
 * FECHADA — um campo novo não entra em PSLM por engano.
 */
export const CAMPOS_PSLM: ReadonlySet<string> = new Set([
  "HIST_EMP",
  "HIST_LIQUID",
  "HIST_PGTO",
  "HIST_LCTO",
  "DESC_TIP_FORN",
  "DESC_SERV_OBRA",
]);

/**
 * ⚠️ O PIPE É O DELIMITADOR — E POR ISSO ELE NÃO PODE ESTAR DENTRO DE UM CAMPO.
 *
 * O MANAD não tem aspas nem escape (ao contrário do CSV da MSC, que tem os dois). Um "|"
 * no histórico de um empenho PARTE A LINHA em dois campos, e o arquivo inteiro
 * desalinha — silenciosamente, porque o validador só vê "campos demais".
 */
function exigirSemPipe(valor: string, onde: Onde): void {
  if (!valor.includes("|")) return;
  throw new Error(
    `MANAD — PIPE ("|") DENTRO DO CAMPO no registro ${onde.registro}, campo ` +
      `${onde.campo}: "${valor}". O pipe é o DELIMITADOR do leiaute e não há escape ` +
      `nem aspas (o MANAD não é CSV). Um pipe aqui PARTE a linha e desalinha o arquivo ` +
      `inteiro. Corrija o cadastro.`
  );
}

/** Campo alfanumérico (tipo C). Latin-1, sem pipe, e o teto de 255 (salvo PSLM). */
export function alfa(
  valor: string | null | undefined,
  onde: Onde
): string {
  if (valor === null || valor === undefined) return "";
  const v = valor.trim();
  if (v === "") return "";

  exigirSemPipe(v, onde);
  exigirLatin1(v, onde);

  if (!CAMPOS_PSLM.has(onde.campo) && v.length > MAX_ALFA) {
    throw new Error(
      `MANAD — campo alfanumérico ACIMA DE ${MAX_ALFA} no registro ${onde.registro}, ` +
        `campo ${onde.campo}: ${v.length} caracteres. Só os campos PSLM ` +
        `(${[...CAMPOS_PSLM].join(", ")}) escapam do teto — e este não é um deles.`
    );
  }
  return v;
}

/**
 * Campo numérico de TAMANHO FIXO, com zeros à esquerda e SEM máscara — CNPJ (14), CPF
 * (11), CEP (8), COD_MUN (7), CEI (12), NIT (11).
 *
 * ⚠️ ZEROS À ESQUERDA SOBREVIVEM PORQUE ISTO É TEXTO. Um CNPJ que passa por `Number`
 * perde o zero da frente e deixa de existir na base da Receita. Mesma lição do IC da MSC.
 */
export function numeroFixo(
  valor: string | null | undefined,
  tamanho: number,
  onde: Onde
): string {
  if (valor === null || valor === undefined) return "";
  const so = valor.replace(/\D/g, "");
  if (so === "") return "";

  if (so.length > tamanho) {
    throw new Error(
      `MANAD — número LONGO DEMAIS no registro ${onde.registro}, campo ${onde.campo}: ` +
        `"${valor}" tem ${so.length} dígitos e o leiaute reserva ${tamanho}.`
    );
  }
  return so.padStart(tamanho, "0");
}

/** Campo numérico SEM tamanho fixo (códigos de classificação, contagens). */
export function numero(valor: string | number | null | undefined, onde: Onde): string {
  if (valor === null || valor === undefined) return "";
  const v = String(valor).trim();
  if (v === "") return "";
  if (!/^\d+$/.test(v)) {
    throw new Error(
      `MANAD — campo NUMÉRICO com caractere não-dígito no registro ${onde.registro}, ` +
        `campo ${onde.campo}: "${v}".`
    );
  }
  return v;
}

/**
 * ⚠️ O DECIMAL COM **VÍRGULA** — a conversão de borda, e ela acontece SÓ AQUI.
 *
 * Sem separador de milhar. `Money.toFixed(2)` dá "1129989.99" (formato de máquina, com
 * PONTO); o MANAD quer "1129989,99". A troca é textual, no último instante — nunca no
 * `Money`, que é compartilhado com a MSC (que quer PONTO) e com o razão inteiro.
 */
export function valor(v: Money | null | undefined): string {
  if (v === null || v === undefined) return "";
  return v.toFixed(2).replace(".", ",");
}

/** Data no formato ddmmaaaa. Sempre UTC — a data do FATO, nunca o fuso de quem gera. */
export function data(d: Date | null | undefined): string {
  if (d === null || d === undefined) return "";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const aaaa = String(d.getUTCFullYear());
  return `${dd}${mm}${aaaa}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// A LINHA
// ═══════════════════════════════════════════════════════════════════════════

export interface LinhaManad {
  /** O tipo do registro — os 4 primeiros caracteres da linha. */
  readonly reg: string;
  /** Os campos APÓS o REG, na ordem do leiaute. */
  readonly campos: readonly string[];
}

/**
 * ⚠️ SEM PIPE AO FIM DA LINHA (item 3.1) — e a regra quer dizer uma coisa PRECISA.
 *
 * O `join("|")` é o certo: `["0000","X"].join("|")` dá "0000|X". O que NÃO se pode fazer é
 * `campos.map(c => c + "|").join("")`, que dá "0000|X|" — um DELIMITADOR A MAIS, e portanto
 * um campo vazio EXTRA no fim. A Receita conta os campos por posição: um a mais desloca
 * tudo e a linha é rejeitada.
 *
 * ⚠️ MAS UMA LINHA CUJO ÚLTIMO CAMPO É LEGITIMAMENTE VAZIO **TERMINA EM PIPE** — e isso é
 * CORRETO, não uma violação. O 0050 de um contabilista sem e-mail acaba em "|", porque o
 * campo EMAIL existe no leiaute e está vazio (3.1.9). "Aparar" esse pipe para satisfazer a
 * regra ao pé da letra APAGARIA um campo — e a linha passaria a ter 17 campos onde o
 * leiaute exige 18.
 *
 * A regra é "não acrescente delimitador depois do último campo", não "a linha não pode
 * terminar com pipe". A invariante testável, e a que o teste confere, é a CONTAGEM DE
 * CAMPOS: `linha.split("|").length === 1 + campos.length`.
 */
export function serializarLinha(l: LinhaManad): string {
  return [l.reg, ...l.campos].join("|");
}

/**
 * O ARQUIVO, em BYTES Latin-1.
 *
 * ⚠️ DEVOLVE `Buffer`, NÃO `string` — de propósito. Uma `string` em JavaScript é UTF-16,
 * e o momento em que ela vira bytes é o momento em que a codificação acontece. Quem
 * gravasse a string com o default do Node (UTF-8) produziria um arquivo com "ç" em DOIS
 * bytes — e a Receita leria lixo. Ao devolver `Buffer` já em Latin-1, não existe caminho
 * em que o chamador erre a codificação: a decisão já foi tomada aqui.
 */
export function serializarManad(linhas: readonly LinhaManad[]): Buffer {
  const texto = linhas.map((l) => serializarLinha(l) + "\r\n").join("");
  return Buffer.from(texto, "latin1");
}

// ═══════════════════════════════════════════════════════════════════════════
// OS RECORDS EXAUSTIVOS — códigos do manual, e nada mais
// ═══════════════════════════════════════════════════════════════════════════

export type TipoCreditoRepo = "SUPLEMENTAR" | "ESPECIAL" | "EXTRAORDINARIO";
export type OrigemRecursoRepo =
  | "ANULACAO"
  | "SUPERAVIT_FINANCEIRO"
  | "EXCESSO_ARRECADACAO"
  | "OPERACAO_CREDITO";

/** L300 campo 06 — 1-Suplementar / 2-Especial / 3-Extraordinário. */
export const TIP_CRED_ADICIONAL: Record<TipoCreditoRepo, string> = {
  SUPLEMENTAR: "1",
  ESPECIAL: "2",
  EXTRAORDINARIO: "3",
};

/**
 * L300 campo 07 — a ORIGEM do recurso. Record EXAUSTIVO sobre o enum do M03: uma origem
 * NOVA não compila até alguém dizer que código do manual ela é.
 *
 * Códigos do manual: 1-Superávit Financeiro · 2-Excesso de Arrecadação · 3-Operações de
 * Crédito · 4-Auxílios e Convênios · 5-Reduções Orçamentárias.
 *
 * ⚠️ O CÓDIGO **4** (Auxílios e Convênios) NÃO TEM ORIGEM CORRESPONDENTE NO M03 — e isso
 * é FATO, não esquecimento. O `OrigemRecurso` do repositório tem quatro valores, e
 * nenhum deles é "auxílio/convênio": um convênio, aqui, entra como receita (M04) e vira
 * EXCESSO_ARRECADACAO ou SUPERAVIT_FINANCEIRO. Se um dia o M03 ganhar uma origem própria
 * de convênio, ela cai neste Record e o compilador exige o "4".
 *
 * ⚠️ E A `ANULACAO` VIRA **5** (Reduções Orçamentárias), não 4 nem 3: um crédito aberto
 * por anulação de outra dotação é, na linguagem do manual, financiado por REDUÇÃO.
 */
export const TIP_ORIG_RECURSO: Record<OrigemRecursoRepo, string> = {
  SUPERAVIT_FINANCEIRO: "1",
  EXCESSO_ARRECADACAO: "2",
  OPERACAO_CREDITO: "3",
  ANULACAO: "5",
};

/** O mínimo que um fato append-only precisa ter para o sinal ser decidido. */
export interface FatoAppendOnly {
  readonly id: string;
  readonly estornoDeId: string | null;
  readonly anulacaoParcialDeId?: string | null | undefined;
}

/**
 * IND_DEB_CRED (L050/L100/L150) — e ele sai da ANATOMIA APPEND-ONLY, não de um campo.
 *
 * O manual diz: **D** = originário (e parcial, e reforço); **C** = anulação, cancelamento.
 * No repositório, cada movimento é UMA LINHA, e é isso que faz o append-only encaixar
 * direto na orientação (c) do manual: nada de "valor líquido" numa linha só — o D e o C
 * saem lado a lado, e a diferença É o saldo.
 *
 * ═══ ⚠️ E O SINAL É RECURSIVO. ESTE É O ERRO QUE A N2 EXISTE PARA PEGAR ═══
 * A leitura ingênua — "tem `estornoDeId`? então é C" — está ERRADA, e ela quebra num caso
 * REAL do repositório: o **estorno de uma anulação parcial** (TR 5.35).
 *
 *   empenho E = 6.000            -> originário                    -> D 6.000
 *   anulação parcial P = 1.000   -> reduz E                       -> C 1.000
 *   estorno de P                 -> DESFAZ a redução, RESTAURA E  -> **D** 1.000
 *
 * Aquele estorno tem `estornoDeId != null`, e a regra ingênua o emitiria como **C** — o
 * empenho sairia no arquivo valendo 4.000 quando vale 6.000. O arquivo continuaria
 * bem-formado, as contagens fechariam, o validador da Receita aceitaria. E estaria errado.
 *
 * O sinal de um estorno é o **OPOSTO do sinal daquilo que ele estorna**. Por isso a função
 * caminha a cadeia: um estorno de estorno volta a ser D, e assim por diante. É a MESMA
 * semântica do `somaLiquidaEstornaveis` (packages/estornaveis) — e é justamente por serem
 * a mesma semântica por dois caminhos que a N2 pode confrontá-los.
 */
export function sinalDoFato(
  fato: FatoAppendOnly,
  porId: ReadonlyMap<string, FatoAppendOnly>
): 1 | -1 {
  if (fato.estornoDeId !== null) {
    const alvo = porId.get(fato.estornoDeId);
    if (alvo === undefined) {
      throw new Error(
        `MANAD — fato ${fato.id} estorna ${fato.estornoDeId}, que NÃO está no conjunto ` +
          `lido. O sinal (D/C) de um estorno é o OPOSTO do sinal do que ele estorna — ` +
          `sem o alvo, não há como sabê-lo, e chutar "C" emitiria o estorno de uma ` +
          `anulação parcial como se ele reduzisse o empenho (quando ele o RESTAURA).`
      );
    }
    return sinalDoFato(alvo, porId) === 1 ? -1 : 1;
  }
  if ((fato.anulacaoParcialDeId ?? null) !== null) return -1;
  return 1;
}

export function indDebCred(
  fato: FatoAppendOnly,
  porId: ReadonlyMap<string, FatoAppendOnly>
): "D" | "C" {
  return sinalDoFato(fato, porId) === 1 ? "D" : "C";
}

// ═══════════════════════════════════════════════════════════════════════════
// AS IDENTIDADES — auto-executáveis, e elas NOMEIAM a diferença
// ═══════════════════════════════════════════════════════════════════════════

/**
 * N1 — TODA CONTAGEM É DERIVADA DAS LINHAS REAIS.
 *
 * 0990, K990, L990, 9990, 9999 e cada 9900 contam o que o gerador DE FATO emitiu — nunca
 * um número que alguém somou de cabeça enquanto escrevia o builder. Esta função É a
 * contagem; o teste a confere por um segundo caminho, independente.
 *
 * ⚠️ QTD_LIN_0 = "todos os registros entre o primeiro 0000 e o 0990, INCLUSIVE" (o manual
 * é literal, e o "inclusive" é o que se erra). O mesmo vale para K, L e 9.
 */
export function contarBloco(
  linhas: readonly LinhaManad[],
  pertence: (reg: string) => boolean
): number {
  return linhas.filter((l) => pertence(l.reg)).length;
}

/** Quantos registros de CADA tipo — a base do 9900, e ela sai das linhas. */
export function contarPorTipo(
  linhas: readonly LinhaManad[]
): ReadonlyMap<string, number> {
  const m = new Map<string, number>();
  for (const l of linhas) m.set(l.reg, (m.get(l.reg) ?? 0) + 1);
  return m;
}

export interface SaldoDeEmpenhoPorFicha {
  readonly fichaId: string;
  /** Empenhado líquido do M05 (`somaLiquidaEstornaveis` sobre os empenhos da ficha). */
  readonly liquido: Money;
  /**
   * ⚠️ O CANCELAMENTO DE RP DO **PERÍODO**, do M08 — e ele é a segunda parcela da N2.
   *
   * Zero quando a ficha é do exercício corrente e nada dela virou RP; > 0 quando um RP
   * daquela ficha foi cancelado no exercício que o arquivo declara.
   */
  readonly canceladoRp: Money;
}

/**
 * N2 (COMPOSTA) — Σ(L050 D − C) POR FICHA == empenhadoLíquido(M05) − canceladosRP(M08).
 *
 * ⚠️ A IDENTIDADE QUE PEGA O DRIFT DO GERADOR, e ela é a mais valiosa do bloco. Os dois
 * lados calculam O MESMO NÚMERO por CAMINHOS INDEPENDENTES:
 *   · o esquerdo lê as LINHAS QUE VÃO NO ARQUIVO (o que a Receita vai ver);
 *   · o direito vem dos DONOS — `somaLiquidaEstornaveis` (M05) e o cancelado do M08.
 *
 * Se o gerador esquecer um registro de anulação, emitir "D" onde era "C", pular uma
 * anulação parcial ou **omitir um cancelamento de RP**, o arquivo continua BEM-FORMADO —
 * os pipes estão lá, as contagens fecham, o validador da Receita aceita. E o número está
 * errado. **Só a confrontação de duas fontes pega lançamento que não existe.**
 *
 * ═══ ⚠️ POR QUE ELA VIROU COMPOSTA — E POR QUE O CANCELAMENTO **SUBTRAI** ═══
 * O cancelamento de RP agora sai no L050 como um "C" (orientação (c) do manual, que nomeia
 * "cancelamento" na própria descrição do IND_DEB_CRED). Só que ele **não é um `Empenho`**:
 * é um `MovimentoRestosAPagar`, e por isso o `somaLiquidaEstornaveis` do M05 **não o vê**.
 *
 * O lado esquerdo passou a ter uma parcela que o lado direito não tinha — e era
 * exatamente por isso que, em cae5f45, o cancelamento ficou de FORA do arquivo: emiti-lo
 * teria quebrado a N2. A cura não é afrouxar a identidade; é **compô-la**, trazendo o
 * cancelamento do seu dono (o M08) para o lado direito. A identidade fica MAIS forte, não
 * menos: agora ela amarra dois módulos em vez de um.
 */
export function conferirN2(
  l050: readonly {
    readonly fichaId: string;
    readonly valor: Money;
    readonly indDebCred: "D" | "C";
  }[],
  dosDonos: readonly SaldoDeEmpenhoPorFicha[]
): void {
  const doArquivo = new Map<string, Money>();
  for (const r of l050) {
    const acc = doArquivo.get(r.fichaId) ?? toMoney("0.00");
    doArquivo.set(
      r.fichaId,
      r.indDebCred === "D" ? toMoney(acc.plus(r.valor)) : toMoney(acc.minus(r.valor))
    );
  }

  const esperado = new Map(
    dosDonos.map((s) => [s.fichaId, toMoney(s.liquido.minus(s.canceladoRp))])
  );
  const parcelas = new Map(dosDonos.map((s) => [s.fichaId, s]));

  for (const fichaId of new Set([...doArquivo.keys(), ...esperado.keys()])) {
    const a = doArquivo.get(fichaId) ?? toMoney("0.00");
    const d = esperado.get(fichaId) ?? toMoney("0.00");
    if (!a.equals(d)) {
      const p = parcelas.get(fichaId);
      const detalhe =
        p === undefined
          ? ""
          : ` (empenhado líquido do M05 ${p.liquido.toFixed(2)} − cancelado de RP do M08 ` +
            `${p.canceladoRp.toFixed(2)})`;
      throw new Error(
        `MANAD — N2 NÃO FECHA na ficha ${fichaId}: os registros L050 do ARQUIVO somam ` +
          `${a.toFixed(2)} (D − C), mas os DONOS dizem ${d.toFixed(2)}${detalhe}. ` +
          `Diferença: ${toMoney(d.minus(a)).toFixed(2)}. Os dois lados são o MESMO ` +
          `número por caminhos independentes — se discordam, o gerador perdeu (ou ` +
          `inventou) um movimento, e o arquivo iria à Receita bem-formado e MENTINDO.`
      );
    }
  }
}

/**
 * N2-RP — AS SUB-IDENTIDADES DO RESTO A PAGAR CARREGADO (orientação (b) do manual).
 *
 * Um empenho de exercício ANTERIOR entra no arquivo pelo VALOR ORIGINAL (um "D"), e os
 * cancelamentos daquele RP no período entram como "C". As duas pontas têm dono:
 *
 *   D  ==  o valor do `Empenho` de origem  (o M05 é o dono, e ele não muda mais)
 *   ΣC ==  o cancelado do M08 NO CORTE      (o `MovimentoRestosAPagar` é o dono)
 *
 * A N2 principal NÃO cobre isto: ela é por FICHA DO EXERCÍCIO CORRENTE, e a ficha de um RP
 * é de OUTRO exercício. Sem estas duas, o RP carregado seria a única parte do arquivo sem
 * confrontação — justamente a parte que atravessa anos e onde o erro é mais caro.
 */
export function conferirN2Rp(
  porEmpenho: readonly {
    readonly empenhoId: string;
    readonly nmEmp: string;
    /** O "D" que o arquivo emitiu. */
    readonly debitoNoArquivo: Money;
    /** O valor do `Empenho` de origem (M05). */
    readonly valorOriginal: Money;
    /** Σ dos "C" que o arquivo emitiu. */
    readonly creditosNoArquivo: Money;
    /** O cancelado do M08, no corte do período. */
    readonly canceladoDoM08: Money;
  }[]
): void {
  for (const e of porEmpenho) {
    if (!e.debitoNoArquivo.equals(e.valorOriginal)) {
      throw new Error(
        `MANAD — N2-RP NÃO FECHA (valor original) no empenho ${e.nmEmp}: o arquivo o ` +
          `emitiu por ${e.debitoNoArquivo.toFixed(2)}, mas o empenho de origem vale ` +
          `${e.valorOriginal.toFixed(2)}. Diferença: ` +
          `${toMoney(e.valorOriginal.minus(e.debitoNoArquivo)).toFixed(2)}. A orientação ` +
          `(b) manda carregar o RP pelo VALOR ORIGINAL — o empenho de 2025 não muda ` +
          `porque o ano virou.`
      );
    }
    if (!e.creditosNoArquivo.equals(e.canceladoDoM08)) {
      throw new Error(
        `MANAD — N2-RP NÃO FECHA (cancelamentos) no empenho ${e.nmEmp}: o arquivo emitiu ` +
          `${e.creditosNoArquivo.toFixed(2)} em registros "C", mas o M08 diz que ` +
          `${e.canceladoDoM08.toFixed(2)} foram cancelados no período. Diferença: ` +
          `${toMoney(e.canceladoDoM08.minus(e.creditosNoArquivo)).toFixed(2)}. Um ` +
          `cancelamento que não sai no arquivo é uma obrigação que a Receita continua ` +
          `vendo como viva.`
      );
    }
  }
}

/**
 * N3 — L250.VL_EMPENHADO == Σ(L050 D − C) DA FICHA. O cruzamento INTRA-ARQUIVO.
 *
 * A N2 amarra o arquivo ao banco. A N3 amarra o arquivo A SI MESMO: o balancete da
 * despesa (L250) e o detalhe dos empenhos (L050) são duas VISTAS do mesmo fato, e a
 * Receita as confronta. Se elas discordarem entre si, nem é preciso o banco para saber
 * que há erro — e é melhor descobrir aqui do que na intimação.
 */
export function conferirN3(
  l250: readonly { readonly fichaId: string; readonly empenhado: Money }[],
  l050: readonly {
    readonly fichaId: string;
    readonly valor: Money;
    readonly indDebCred: "D" | "C";
  }[]
): void {
  const detalhe = new Map<string, Money>();
  for (const r of l050) {
    const acc = detalhe.get(r.fichaId) ?? toMoney("0.00");
    detalhe.set(
      r.fichaId,
      r.indDebCred === "D" ? toMoney(acc.plus(r.valor)) : toMoney(acc.minus(r.valor))
    );
  }

  for (const linha of l250) {
    const soma = detalhe.get(linha.fichaId) ?? toMoney("0.00");
    if (!linha.empenhado.equals(soma)) {
      throw new Error(
        `MANAD — N3 NÃO FECHA na ficha ${linha.fichaId}: o L250 declara VL_EMPENHADO ` +
          `${linha.empenhado.toFixed(2)}, mas os registros L050 da MESMA ficha somam ` +
          `${soma.toFixed(2)} (D − C). Diferença: ` +
          `${toMoney(linha.empenhado.minus(soma)).toFixed(2)}. O balancete e o detalhe ` +
          `são duas vistas do MESMO fato dentro do MESMO arquivo — a Receita as ` +
          `confronta, e elas não podem discordar.`
      );
    }
  }
}
