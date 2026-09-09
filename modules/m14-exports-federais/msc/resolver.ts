import type { PrismaClient } from "../../../prisma/generated/client/client.js";
import type { NaturezaLancamento } from "../../m01-core-contabil/adapter-prisma.js";

/**
 * M14 — O RESOLVER DE DIMENSÕES. LEITURA PURA.
 *
 * ═══ O PROBLEMA, E A DECISÃO DE 46dfd5d ═══
 * A MSC exige que o saldo de cada conta seja QUEBRADO por dimensão: fonte de recurso
 * (FR), natureza da receita (NR), natureza da despesa (ND), funcional. E a
 * `PartidaContabil` **não carrega nenhuma delas** — só `fichaId`.
 *
 * A saída óbvia seria uma coluna `fonteId` na partida. O dimensionamento do bloco 1
 * mostrou o preço: 25 pontos de lançamento em 11 arquivos, mais um BACKFILL — e sem o
 * backfill um `null` de fonte é indistinguível de "ninguém preencheu".
 *
 * A saída escolhida: **a dimensão já existe no FATO**, e o vínculo lançamento→fato é
 * recuperável por consulta (as relações 1-1 `lancamentoId @unique` do M04/M05, e as 1-N
 * dos movimentos do M07/M08/M10). Este arquivo CAMINHA esse vínculo. Zero coluna, zero
 * backfill, zero migração — e é o mesmo padrão do `superavitPorFonte` (M12), que já soma
 * por fonte pelos FATOS justamente porque *"o razão não tem fonte"*.
 *
 * ═══ TRÊS DESFECHOS, E ELES SÃO DIFERENTES ═══
 *   RESOLVIDO ................. a dimensão saiu do fato.
 *   SEM_DIMENSAO_POR_DESIGN ... o fato NÃO TEM dimensão, e isso está certo.
 *   NAO_RESOLVIDO ............. o fato tem dimensão e o caminho não chegou nela.
 *
 * Confundir os dois últimos é o erro que este arquivo existe para não cometer: tratar a
 * apuração do resultado como "pendência" encheria o relatório de falso-positivo — e *a
 * pendência que grita por tudo não denuncia nada*.
 */

/** O client OU uma transação dele. */
export type Leitor = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export interface Dimensoes {
  /** IC "FR" — código da fonte de recurso (3 dígitos, texto). */
  readonly fonte: string | null;
  /** IC "NR" — natureza da receita (8 dígitos). `null` = não se aplica (é despesa). */
  readonly naturezaReceita: string | null;
  /** IC "ND" — natureza da despesa (6 dígitos). `null` = não se aplica (é receita). */
  readonly naturezaDespesa: string | null;
  /**
   * IC "FUNCIONAL" — função (2) + subfunção (3).
   *
   * ⚠️ PENDÊNCIA DECLARADA: os fatos oficiais colados neste bloco dizem "FUNCIONAL
   * (função/subfunção)" mas NÃO trazem o código nem o formato exato da IC no leiaute.
   * Concatenar função+subfunção (5 dígitos) é a leitura natural — e é uma ESCOLHA, não
   * um dado. CONFERIR contra o leiaute da STN antes do primeiro envio. Ver MODULO.md.
   */
  readonly funcional: string | null;
  /**
   * IC "AI" — o ANO DE INSCRIÇÃO do resto a pagar. `null` = não se aplica (o fato não
   * é um movimento de RP), e isso NÃO é pendência.
   *
   * ═══ POR QUE ELA CUSTOU ZERO COLUNA ═══
   * A pergunta que a STN faz é: *"esse saldo de restos a pagar é de QUE exercício?"* — e
   * a resposta já está no banco desde o M08: `InscricaoRestosAPagar.exercicioOrigem`,
   * gravado no encerramento do ano que empenhou. O caminho lançamento -> fato existe e é
   * o MESMO que já traz a fonte: `movimentosRestos -> inscricao`. Acrescentar uma coluna
   * `anoInscricao` na partida criaria uma SEGUNDA verdade sobre o mesmo ano — e o dia em
   * que ela divergisse, o RP de 2026 apareceria como de 2027 num arquivo fiscal.
   *
   * ⚠️ E ELA SÓ EXISTE ONDE HÁ MOVIMENTO DE RP. A INSCRIÇÃO em si **não tem lançamento
   * contábil** (o M08 a grava só em `InscricaoRestosAPagar` — o RP tem razão próprio).
   * Logo a AI aparece quando o RP se MOVE: quando é liquidado, pago ou cancelado. É a
   * verdade que o sistema tem — e é toda ela.
   *
   * ⚠️ TEXTO, NUNCA NÚMERO. Como toda IC (ver o `serializarMscCsv`): um ano que vira
   * `Number` perde o zero à esquerda que o leiaute possa exigir e deixa de casar com a
   * tabela da STN.
   */
  readonly anoInscricaoRp: string | null;
}

export const SEM_DIMENSOES: Dimensoes = {
  fonte: null,
  naturezaReceita: null,
  naturezaDespesa: null,
  funcional: null,
  anoInscricaoRp: null,
};

export type Resolucao =
  | {
      readonly tipo: "RESOLVIDO";
      /** Que fato respondeu — vai para a mensagem de pendência e para o debug. */
      readonly fato: string;
      readonly dimensoes: Dimensoes;
    }
  | { readonly tipo: "SEM_DIMENSAO_POR_DESIGN"; readonly motivo: string }
  | { readonly tipo: "NAO_RESOLVIDO"; readonly motivo: string };

/**
 * ⚠️ O RECORD EXAUSTIVO — E ELE É SOBRE A **NATUREZA DO LANÇAMENTO**, NÃO SOBRE O
 * `origemTipo`.
 *
 * O `origemTipo` é uma STRING LIVRE, e metade dos seus valores é montada em tempo de
 * execução (`${original.tipo}_ESTORNADO`, `PATRIMONIAL_${d.tipo}`). Um Record sobre ele
 * seria uma lista que envelheceria no dia seguinte, sem o compilador avisar — e a
 * garantia que se quer aqui é justamente essa: **um tipo novo NÃO COMPILA sem que
 * alguém diga se ele tem dimensão.**
 *
 * A `NaturezaLancamento` (`NORMAL | ENCERRAMENTO`) É um enum fechado, e é exatamente
 * ela que separa os dois mundos: o ENCERRAMENTO não é um fato novo — ele TRANSFERE o
 * resultado do exercício para o patrimônio líquido. Não tem fonte, não tem natureza de
 * receita, não tem função. E isso não é um furo: é o que ele É.
 */
export const DIMENSAO_DA_NATUREZA: Record<
  NaturezaLancamento,
  "TEM_DIMENSAO" | "SEM_DIMENSAO_POR_DESIGN"
> = {
  NORMAL: "TEM_DIMENSAO",
  ENCERRAMENTO: "SEM_DIMENSAO_POR_DESIGN",
};

const MOTIVO_ENCERRAMENTO =
  "Lançamento de ENCERRAMENTO: ele não é um fato novo — apenas transfere o resultado " +
  "do exercício para o patrimônio líquido. Não tem fonte de recurso, nem natureza de " +
  "receita, nem função. A ausência de dimensão aqui é CORRETA, e por isso ela NÃO é " +
  "pendência: tratá-la como uma encheria o relatório de falso-positivo.";

/**
 * ⚠️ A RECUSA. Duas fontes candidatas para o MESMO lançamento = o resolver PARA.
 *
 * O caso real existe: um PAGAMENTO COM RETENÇÃO tem DOIS caminhos até a fonte — a
 * coluna `Pagamento.fonteId` e a conta bancária de cada `MovimentoExtraorcamentario`
 * pendurado no mesmo lançamento (a retenção é uma perna do MESMO lançamento composto).
 * Hoje eles concordam por construção: a retenção usa a conta do pagamento, e o guard da
 * TR 5.23 exige que a fonte do pagamento seja a da conta.
 *
 * Mas "concordam por construção" é uma frase que envelhece. Se um dia divergirem, o
 * resolver NÃO ESCOLHE — ele recusa, nomeando o lançamento, as duas fontes e os dois
 * caminhos. Escolher seria mandar à União um FR inventado, e um FR errado num arquivo
 * fiscal é dinheiro carimbado no lugar errado.
 */
function exigirFonteUnica(
  lancamentoId: string,
  candidatas: readonly { readonly fonte: string; readonly caminho: string }[]
): string | null {
  const distintas = [...new Set(candidatas.map((c) => c.fonte))];
  if (distintas.length === 0) return null;
  if (distintas.length === 1) return distintas[0]!;

  throw new Error(
    `MSC — FONTE AMBÍGUA no lançamento ${lancamentoId}: os caminhos até o fato dão ` +
      `fontes DIFERENTES — ` +
      candidatas.map((c) => `${c.caminho} -> ${c.fonte}`).join(" ; ") +
      `. O resolver NÃO ESCOLHE: um FR inventado num arquivo fiscal é dinheiro ` +
      `carimbado no lugar errado. Uma operação tem UMA fonte — se este lançamento tem ` +
      `duas, o erro está no FATO que o gerou.`
  );
}

/**
 * ⚠️ A MESMA RECUSA, PARA O ANO DE INSCRIÇÃO — e o caso dela é REAL, não hipotético.
 *
 * Um pagamento de RP pode, em tese, baixar mais de uma inscrição no MESMO lançamento (o
 * `MovimentoRestosAPagar` é 1-N no lançamento, como o movimento extraorçamentário). Se
 * essas inscrições forem de exercícios DIFERENTES, não existe UM ano de inscrição para
 * aquela linha — e escolher um deles mandaria à União um RP de 2025 carimbado como 2026.
 *
 * O resolver não escolhe: ele PARA, nomeando o lançamento e os anos. Se um lançamento
 * mistura dois exercícios de inscrição, o erro está no FATO que o gerou.
 */
function exigirAnoUnico(
  lancamentoId: string,
  anos: readonly number[]
): string | null {
  const distintos = [...new Set(anos)];
  if (distintos.length === 0) return null;
  if (distintos.length === 1) return String(distintos[0]!);

  throw new Error(
    `MSC — ANO DE INSCRIÇÃO AMBÍGUO no lançamento ${lancamentoId}: ele baixa restos a ` +
      `pagar inscritos em exercícios DIFERENTES (${distintos.sort().join(", ")}). A IC ` +
      `"AI" diz de QUE ano é aquele saldo — e um lançamento que mistura dois anos não ` +
      `tem resposta. O resolver NÃO ESCOLHE: um RP de um ano carimbado com o de outro é ` +
      `dívida antiga publicada como nova.`
  );
}

/** função (2) + subfunção (3) — ver a pendência declarada em `Dimensoes.funcional`. */
function funcionalDaFicha(f: {
  readonly funcao: { readonly codigo: string };
  readonly subfuncao: { readonly codigo: string };
}): string {
  return `${f.funcao.codigo}${f.subfuncao.codigo}`;
}

/**
 * A FICHA É A ORIGEM DE TRÊS DIMENSÕES DE UMA VEZ (e sem join inventado): ela carrega
 * `fonteId`, `naturezaDespesaId`, `funcaoId` e `subfuncaoId` como FKs próprias. É a
 * MESMA cadeia que o Anexo 12 e o portal (M13) percorrem — por isso os três não podem
 * discordar sobre em que função o dinheiro foi gasto.
 */
const FICHA_DIMENSOES = {
  select: {
    fonte: { select: { codigo: true } },
    naturezaDespesa: { select: { codigoCompleto: true } },
    funcao: { select: { codigo: true } },
    subfuncao: { select: { codigo: true } },
  },
} as const;

type FichaLida = {
  readonly fonte: { readonly codigo: string };
  readonly naturezaDespesa: { readonly codigoCompleto: string };
  readonly funcao: { readonly codigo: string };
  readonly subfuncao: { readonly codigo: string };
};

function daDespesa(ficha: FichaLida): Dimensoes {
  return {
    fonte: ficha.fonte.codigo,
    // ⚠️ NÃO É PENDÊNCIA: uma despesa não TEM natureza de receita. `null` aqui é a
    // resposta certa, e o gerador não emite a IC — não a emite EM BRANCO.
    naturezaReceita: null,
    naturezaDespesa: ficha.naturezaDespesa.codigoCompleto,
    funcional: funcionalDaFicha(ficha),
    // Uma despesa do exercício CORRENTE não é resto a pagar de ano nenhum. Quem carimba
    // a AI é o braço do M08, abaixo — e só ele.
    anoInscricaoRp: null,
  };
}

/**
 * A DESPESA DE UM RESTO A PAGAR: a mesma da ficha do empenho que a originou, MAIS o ano
 * em que ela foi inscrita. O empenho já nasceu carimbado com a fonte, a natureza e a
 * funcional do ano que fechou — o RP não reclassifica nada, ele só ATRAVESSA.
 */
function doRestoAPagar(ficha: FichaLida, exercicioOrigem: number): Dimensoes {
  return { ...daDespesa(ficha), anoInscricaoRp: String(exercicioOrigem) };
}

/**
 * RESOLVE OS LANÇAMENTOS EM LOTE — uma consulta, todos os braços.
 *
 * O `include` traz TODAS as relações 1-1 e 1-N de uma vez. Resolver um a um faria N+1
 * consultas por conta, e a MSC de um município tem dezenas de milhares de lançamentos.
 */
export async function resolverDimensoes(
  leitor: Leitor,
  lancamentoIds: readonly string[]
): Promise<ReadonlyMap<string, Resolucao>> {
  if (lancamentoIds.length === 0) return new Map();

  const lancamentos = await leitor.lancamentoContabil.findMany({
    where: { id: { in: [...lancamentoIds] } },
    select: {
      id: true,
      natureza: true,
      origemTipo: true,

      // ── M02: a ficha, na PRÓPRIA partida. É por aqui que a DOTAÇÃO se resolve.
      partidas: { select: { ficha: FICHA_DIMENSOES } },

      // ── M04: a arrecadação (1-1). A anulação é OUTRA linha, com a MESMA fonte e a
      //    MESMA natureza — o `anularArrecadacao` as copia.
      receita: {
        select: {
          fonte: { select: { codigo: true } },
          naturezaReceita: { select: { codigo: true } },
        },
      },

      // ── M05: as três fases (1-1). A liquidação e o pagamento chegam à ficha PELO
      //    empenho — a classificação é de quem AUTORIZOU a despesa.
      empenho: { select: { ficha: FICHA_DIMENSOES } },
      liquidacao: { select: { empenho: { select: { ficha: FICHA_DIMENSOES } } } },
      pagamento: {
        select: {
          fonte: { select: { codigo: true } },
          liquidacao: { select: { empenho: { select: { ficha: FICHA_DIMENSOES } } } },
        },
      },

      // ── M07: a retenção. Ela NÃO tem ficha: a fonte é a do CAIXA em que o dinheiro de
      //    terceiro está parado (a conta bancária) — a mesma leitura do
      //    `extraorcamentarioPorFonte`. N movimentos podem pendurar-se no MESMO
      //    lançamento (o pagamento composto), e é daí que nasce a checagem de ambiguidade.
      movimentosExtra: {
        select: { contaBancaria: { select: { fonte: { select: { codigo: true } } } } },
      },

      // ── M08: os restos a pagar. A cadeia é inscrição -> empenho -> ficha; o empenho já
      //    nasceu carimbado com a fonte da dotação do ano que fechou.
      //
      //    ⚠️ E É A MESMA CADEIA QUE DÁ A IC "AI": o `exercicioOrigem` da inscrição É o
      //    ano de inscrição do RP. Zero coluna nova — o dado está no fato desde o M08.
      movimentosRestos: {
        select: {
          inscricao: {
            select: {
              exercicioOrigem: true,
              empenho: { select: { ficha: FICHA_DIMENSOES } },
            },
          },
        },
      },

      // ── M10: os movimentos patrimoniais. A dimensão vem de QUEM os originou — a
      //    liquidação (almoxarifado, aquisição) ou a receita (alienação, dívida).
      movimentosPatrimoniais: {
        select: {
          liquidacao: { select: { empenho: { select: { ficha: FICHA_DIMENSOES } } } },
          receitaArrecadada: {
            select: {
              fonte: { select: { codigo: true } },
              naturezaReceita: { select: { codigo: true } },
            },
          },
        },
      },
      movimentosAlmoxarifado: {
        select: {
          liquidacao: { select: { empenho: { select: { ficha: FICHA_DIMENSOES } } } },
        },
      },
      movimentosDivida: {
        select: {
          receitaArrecadada: {
            select: {
              fonte: { select: { codigo: true } },
              naturezaReceita: { select: { codigo: true } },
            },
          },
        },
      },
      movimentosDividaAtiva: {
        select: {
          receitaArrecadada: {
            select: {
              fonte: { select: { codigo: true } },
              naturezaReceita: { select: { codigo: true } },
            },
          },
        },
      },
    },
  });

  const resolucoes = new Map<string, Resolucao>();

  for (const l of lancamentos) {
    // ⚠️ NULO LÊ-SE NORMAL. A coluna `natureza` entrou aditiva, sem backfill — todo
    // lançamento anterior à apuração tem `null`, e ele É normal. A mesma armadilha dos
    // três valores que o `filtroDoLancamento` do M01 resolve no SQL.
    const natureza: NaturezaLancamento = l.natureza ?? "NORMAL";

    if (DIMENSAO_DA_NATUREZA[natureza] === "SEM_DIMENSAO_POR_DESIGN") {
      resolucoes.set(l.id, {
        tipo: "SEM_DIMENSAO_POR_DESIGN",
        motivo: MOTIVO_ENCERRAMENTO,
      });
      continue;
    }

    const candidatas: { fonte: string; caminho: string }[] = [];
    let dimensoes: Dimensoes = SEM_DIMENSOES;
    let fato: string | null = null;

    // ─── RECEITA (M04) ───
    if (l.receita !== null) {
      fato = "ReceitaArrecadada";
      candidatas.push({ fonte: l.receita.fonte.codigo, caminho: "receita.fonte" });
      dimensoes = {
        fonte: l.receita.fonte.codigo,
        naturezaReceita: l.receita.naturezaReceita.codigo,
        // Uma receita não TEM natureza de despesa, nem função, nem ano de inscrição de
        // resto a pagar — `null` é a resposta, não uma pendência.
        naturezaDespesa: null,
        funcional: null,
        anoInscricaoRp: null,
      };
    }

    // ─── DESPESA (M05) — empenho, liquidação, pagamento ───
    const fichaDaDespesa: FichaLida | null =
      l.empenho?.ficha ??
      l.liquidacao?.empenho.ficha ??
      l.pagamento?.liquidacao.empenho.ficha ??
      null;

    if (fichaDaDespesa !== null) {
      fato =
        l.empenho !== null
          ? "Empenho"
          : l.liquidacao !== null
            ? "Liquidacao"
            : "Pagamento";
      candidatas.push({
        fonte: fichaDaDespesa.fonte.codigo,
        caminho: "despesa -> empenho -> ficha.fonte",
      });
      dimensoes = daDespesa(fichaDaDespesa);
    }

    // ⚠️ O PAGAMENTO TEM FONTE PRÓPRIA — e ela é uma SEGUNDA candidata, de propósito.
    // O guard de b05ce06 garante que ela é a da ficha; se um dia não for, a recusa
    // abaixo é quem denuncia. (E ela vale mais do que o guard: o guard protege a
    // gravação; isto protege o que se PUBLICA.)
    if (l.pagamento !== null) {
      candidatas.push({
        fonte: l.pagamento.fonte.codigo,
        caminho: "pagamento.fonte",
      });
    }

    // ─── EXTRAORÇAMENTÁRIO (M07) ───
    for (const m of l.movimentosExtra) {
      candidatas.push({
        fonte: m.contaBancaria.fonte.codigo,
        caminho: "movimentoExtra -> contaBancaria.fonte",
      });
      if (fato === null) {
        fato = "MovimentoExtraorcamentario";
        dimensoes = {
          fonte: m.contaBancaria.fonte.codigo,
          // A consignação não é receita orçamentária nem despesa: é dinheiro de
          // terceiro parado no caixa. Nem NR, nem ND, nem função — nem RP.
          naturezaReceita: null,
          naturezaDespesa: null,
          funcional: null,
          anoInscricaoRp: null,
        };
      }
    }

    // ─── RESTOS A PAGAR (M08) — e é DAQUI que sai a IC "AI" ───
    //
    // ⚠️ A "AI" NÃO DISPUTA COM OS OUTROS BRAÇOS — ELA SE SOMA A ELES. E isso não é
    // detalhe de estilo: é o que faz a IC existir.
    //
    // O pagamento de um RP grava um `Pagamento` (o M08 cria um, para a ordem cronológica
    // e para a conciliação) — e por isso o braço do M05 acima JÁ RESPONDEU quando este
    // aqui roda, com `fato = "Pagamento"`. Se a AI só fosse carimbada "quando ninguém
    // mais respondeu" (o padrão `if (fato === null)` dos outros braços), ela seria
    // silenciosamente descartada em TODO pagamento de resto a pagar — ou seja, em
    // exatamente o único lugar onde ela existe.
    //
    // As dimensões que os dois caminhos dão são as MESMAS (inscrição -> empenho -> ficha
    // é o mesmo empenho de pagamento -> liquidação -> empenho). O que só este braço sabe
    // é o ANO. Então ele acrescenta o ano, e deixa o resto como está.
    const anosDeInscricao: number[] = [];
    for (const m of l.movimentosRestos) {
      const f = m.inscricao.empenho.ficha;
      anosDeInscricao.push(m.inscricao.exercicioOrigem);
      candidatas.push({
        fonte: f.fonte.codigo,
        caminho: "movimentoRP -> inscrição -> empenho -> ficha.fonte",
      });
      if (fato === null) {
        fato = "MovimentoRestosAPagar";
        dimensoes = doRestoAPagar(f, m.inscricao.exercicioOrigem);
      }
    }

    // ─── PATRIMONIAIS (M10) — herdam de quem os originou ───
    const patrimoniais = [
      ...l.movimentosPatrimoniais.map((m) => ({
        ficha: m.liquidacao?.empenho.ficha ?? null,
        receita: m.receitaArrecadada,
        caminho: "movimentoPatrimonial",
      })),
      ...l.movimentosAlmoxarifado.map((m) => ({
        ficha: m.liquidacao?.empenho.ficha ?? null,
        receita: null,
        caminho: "movimentoAlmoxarifado -> liquidação -> empenho -> ficha.fonte",
      })),
      ...l.movimentosDivida.map((m) => ({
        ficha: null,
        receita: m.receitaArrecadada,
        caminho: "movimentoDivida -> receita.fonte",
      })),
      ...l.movimentosDividaAtiva.map((m) => ({
        ficha: null,
        receita: m.receitaArrecadada,
        caminho: "movimentoDividaAtiva -> receita.fonte",
      })),
    ];

    for (const p of patrimoniais) {
      if (p.ficha !== null) {
        candidatas.push({ fonte: p.ficha.fonte.codigo, caminho: p.caminho });
        if (fato === null) {
          fato = "MovimentoPatrimonial (por liquidação)";
          dimensoes = daDespesa(p.ficha);
        }
      } else if (p.receita !== null) {
        candidatas.push({ fonte: p.receita.fonte.codigo, caminho: p.caminho });
        if (fato === null) {
          fato = "MovimentoPatrimonial (por receita)";
          dimensoes = {
            fonte: p.receita.fonte.codigo,
            naturezaReceita: p.receita.naturezaReceita.codigo,
            naturezaDespesa: null,
            funcional: null,
            anoInscricaoRp: null,
          };
        }
      }
    }

    // ─── A FICHA NA PARTIDA (M02) — o braço da DOTAÇÃO ───
    //
    // ⚠️ ESTE BRAÇO NASCEU COM A DOTAÇÃO NO RAZÃO. O lançamento da LOA (e o do crédito
    // adicional, e o da reserva) NÃO tem fato 1-1 pendurado nele: o "fato" é o
    // `MovimentoDotacao`, e ele não aponta para o lançamento. Sem este braço, TODA ficha
    // do ente viraria uma pendência de FR no primeiro dia do exercício.
    //
    // Mas a dimensão está lá, e é a mais direta de todas: a PARTIDA carrega `fichaId` (o
    // aditivo do M02 ao M01), e a ficha É a classificação — fonte, natureza da despesa,
    // função e subfunção. Nenhum join inventado; a mesma cadeia do Anexo 12 e do portal.
    const fichasDasPartidas = [
      ...new Set(
        l.partidas.map((pt) => pt.ficha).filter((f): f is FichaLida => f !== null)
      ),
    ];
    for (const f of fichasDasPartidas) {
      candidatas.push({ fonte: f.fonte.codigo, caminho: "partida.ficha.fonte" });
      if (fato === null) {
        fato = "MovimentoDotacao (pela ficha da partida)";
        dimensoes = daDespesa(f);
      }
    }

    // A RECUSA roda SEMPRE — mesmo quando um braço já respondeu. É o ponto: o segundo
    // caminho existe para CONFERIR o primeiro, não para ser ignorado.
    const fonteUnica = exigirFonteUnica(l.id, candidatas);
    const anoDeInscricao = exigirAnoUnico(l.id, anosDeInscricao);

    if (fato === null || fonteUnica === null) {
      resolucoes.set(l.id, {
        tipo: "NAO_RESOLVIDO",
        motivo:
          `Lançamento NORMAL (origem "${l.origemTipo}") sem caminho até um fato com ` +
          `dimensão. O razão não carrega fonte de recurso — ela vive no FATO, e este ` +
          `lançamento não está pendurado em nenhum que a tenha (provisões matemáticas, ` +
          `entrada avulsa de bem, doação e ajuste direto caem aqui). A linha da MSC SAI ` +
          `sem as ICs, e esta pendência é o pedido formal do vínculo.`,
      });
      continue;
    }

    resolucoes.set(l.id, {
      tipo: "RESOLVIDO",
      fato,
      dimensoes: {
        ...dimensoes,
        fonte: fonteUnica,
        // ⚠️ O ANO SOBREPÕE — ver o braço do M08. `null` quando não há movimento de RP:
        // um fato que não é resto a pagar não tem ano de inscrição, e isso é a resposta.
        anoInscricaoRp: anoDeInscricao,
      },
    });
  }

  return resolucoes;
}
