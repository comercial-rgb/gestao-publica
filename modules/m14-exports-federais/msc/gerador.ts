import { toMoney, type Money } from "../../../packages/contracts/index.js";
import type { PrismaClient } from "../../../prisma/generated/client/client.js";
// ═══ TODA soma vem do M01 — o dono do razão. Zero aritmética nova. ═══
import {
  somasPorConta,
  somasPorContaELancamento,
  type FiltroDeNatureza,
  type SomasDaConta,
  type SomasDaContaPorLancamento,
} from "../../m01-core-contabil/adapter-prisma.js";
import {
  conferirM1,
  conferirM2,
  conferirM4,
  liquidoComSinal,
  naturezaDoValor,
  parsearCompetencia,
  valorDoSaldo,
  type Competencia,
  type LinhaMsc,
  type PendenciaMsc,
  type ResultadoMsc,
  type TipoMsc,
  type TipoValor,
} from "./dominio.js";
import {
  resolverDimensoes,
  SEM_DIMENSOES,
  type Dimensoes,
} from "./resolver.js";

/**
 * M14 — O MOTOR DA MSC. LEITURA PURA (TR 7.34).
 *
 * ═══ ZERO ESCRITA, ZERO ARITMÉTICA — E O TESTE RODA O GREP ═══
 * Nenhuma linha da matriz é materializada. A MSC é DERIVADA do razão a cada geração —
 * e é isso que garante que o arquivo enviado à União possa ser REPRODUZIDO amanhã, byte
 * a byte, por quem auditar. Uma tabela de "MSC enviada" seria a segunda verdade sobre o
 * que o razão diz, e o dia em que divergisse ninguém saberia qual das duas o TCE viu.
 *
 * ═══ O CORTE É A `dataTransacao` — A DATA DO FATO ═══
 * Nunca `criadoEm`. Um lançamento de julho digitado em setembro pertence a JULHO, e a
 * MSC de julho tem de mostrá-lo. Publicar por data de digitação faria o mesmo mês ter
 * dois valores diferentes conforme o dia em que o arquivo fosse gerado.
 */

/** O client OU uma transação dele. */
export type Leitor = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

const ZERO: SomasBrutasDaConta = { debito: toMoney("0.00"), credito: toMoney("0.00") };

interface SomasBrutasDaConta {
  readonly debito: Money;
  readonly credito: Money;
}

/**
 * ⚠️ OS TRÊS RECORTES, E O QUE CADA MSC EXCLUI.
 *
 * A MSC **agregada** (mensal) NÃO leva o encerramento DO SEU EXERCÍCIO: ele não é fato
 * novo — só transfere o resultado do ano para o patrimônio líquido e enterra o orçamento
 * que acabou. Misturá-lo ao movimento do mês faria dezembro parecer ter arrecadado o
 * resultado inteiro do ano.
 *
 * A MSC de **encerramento** (o 13º mês) é feita EXATAMENTE do contrário: ela parte do
 * saldo SEM encerramento (que é o ending da agregada de dezembro — a identidade M3) e o
 * seu `period_change` é SÓ o encerramento. As duas juntas contam o ano inteiro, sem
 * contar nada duas vezes.
 *
 * ═══ ⚠️⚠️ "DO SEU EXERCÍCIO" É A PALAVRA QUE FALTAVA — E ELA VALIA UM ANO INTEIRO ═══
 *
 * O filtro era `excluir: ENCERRAMENTO`, sem recorte de tempo: ele descartava o
 * encerramento de TODOS os anos, para sempre. E aí, na MSC de JANEIRO de E+1 — cujo
 * `beginning_balance` é "tudo até 31/12/E" —, o encerramento de E era jogado fora.
 * Janeiro abria com a receita do ano morto ressuscitada, o resultado acumulado ausente
 * do patrimônio líquido e a dotação enterrada de volta no orçamento novo. O ente
 * publicaria à União um exercício que começa onde o anterior NÃO terminou.
 *
 * O encerramento de um ano ANTERIOR não é um fato pendente de nada: ele JÁ É SALDO. O
 * `beginning` de qualquer mês o inclui, como inclui qualquer outro fato velho.
 *
 * Por isso o corte é `excluirDesde: 1º de janeiro do ano da competência`. Ele lê-se:
 * *"o encerramento QUE AINDA NÃO ACONTECEU para este recorte sai; o que já é história
 * fica"*. E o `period_change` da de encerramento ganha `desde` pelo mesmo motivo — sem
 * ele, a matriz de encerramento de E+1 traria, como movimento do 13º mês, o encerramento
 * de E também.
 *
 * ⚠️ NÃO MUDA UM LITERAL DE 2026: dentro de um único exercício, o encerramento (datado
 * de 31/12) já cai fora de todo recorte anterior a dezembro POR DATA. Este corte só
 * aparece quando o segundo exercício existe — e é por isso que a suíte não o pegava.
 *
 * A identidade que nasce disto é a **M5** (ver o domínio): o `beginning` da agregada de
 * janeiro de E+1 É o `ending` da MSC de encerramento de E. A costura entre os ANOS.
 */
function recortes(
  tipo: TipoMsc,
  c: Competencia
): Record<
  TipoValor,
  { readonly desde?: Date; readonly ate: Date; readonly natureza: FiltroDeNatureza }
> {
  /** 1º de janeiro do ano DA COMPETÊNCIA — o divisor entre "o meu encerramento" e "a história". */
  const inicioDoExercicio = new Date(Date.UTC(c.ano, 0, 1, 0, 0, 0, 0));

  const SEM_O_MEU_ENCERRAMENTO: FiltroDeNatureza = {
    excluir: ["ENCERRAMENTO"],
    excluirDesde: inicioDoExercicio,
  };
  const TUDO: FiltroDeNatureza = {};

  if (tipo === "AGREGADA") {
    return {
      beginning_balance: {
        ate: c.anteriorAoInicio,
        natureza: SEM_O_MEU_ENCERRAMENTO,
      },
      period_change: {
        desde: c.inicio,
        ate: c.fim,
        natureza: SEM_O_MEU_ENCERRAMENTO,
      },
      ending_balance: { ate: c.fim, natureza: SEM_O_MEU_ENCERRAMENTO },
    };
  }

  // ENCERRAMENTO: o beginning é TODO o exercício SEM o encerramento DELE (== ending da
  // agregada de dezembro); o movimento é SÓ o encerramento DESTE ano (daí o `desde`); o
  // ending é tudo.
  return {
    beginning_balance: { ate: c.fim, natureza: SEM_O_MEU_ENCERRAMENTO },
    period_change: {
      desde: inicioDoExercicio,
      ate: c.fim,
      natureza: { apenas: ["ENCERRAMENTO"] },
    },
    ending_balance: { ate: c.fim, natureza: TUDO },
  };
}

const TIPOS_VALOR: readonly TipoValor[] = [
  "beginning_balance",
  "period_change",
  "ending_balance",
];

/**
 * A IC "FP" — 1 = Financeiro, 2 = Permanente.
 *
 * ⚠️ MESMA FONTE DO ANEXO 14: o `indicadorSuperavit` de cada conta do plano. Derivar o
 * FP de outro lugar (do código da conta, de uma tabela paralela) criaria uma segunda
 * classificação do mesmo ativo — e o dia em que ela divergisse, o superávit financeiro
 * publicado no Anexo 14 e o publicado na MSC diriam coisas diferentes sobre o MESMO
 * dinheiro, para dois órgãos de controle diferentes.
 *
 * ⚠️ E ELA SÓ SE APLICA AO ATIVO E AO PASSIVO (classes 1 e 2). "Financeiro ou
 * permanente" é uma pergunta sobre um SALDO PATRIMONIAL — uma VPD (classe 3) não é nem
 * um nem outro, e uma conta de controle (5 a 8) muito menos. Exigir FP delas encheria o
 * relatório de pendências falsas, e a pendência que grita por tudo não denuncia nada.
 */
const FP_POR_INDICADOR: Record<"F" | "P", string> = { F: "1", P: "2" };

function exigeFp(codigo: string): boolean {
  const classe = codigo.charAt(0);
  return classe === "1" || classe === "2";
}

/** `null` = sem Anexo II para esta conta -> emite tudo que derivou. */
function filtrar(d: Dimensoes, permitidas: ReadonlySet<string> | null): Dimensoes {
  if (permitidas === null) return d;
  return {
    fonte: permitidas.has("FR") ? d.fonte : null,
    naturezaReceita: permitidas.has("NR") ? d.naturezaReceita : null,
    naturezaDespesa: permitidas.has("ND") ? d.naturezaDespesa : null,
    funcional: permitidas.has("FUNCIONAL") ? d.funcional : null,
    anoInscricaoRp: permitidas.has("AI") ? d.anoInscricaoRp : null,
  };
}

export async function gerarMsc(
  leitor: Leitor,
  competencia: string,
  tipo: TipoMsc
): Promise<ResultadoMsc> {
  const c = parsearCompetencia(competencia);

  // ═══ A CONFIG DO ENTE — semeada, conferida por humano, NUNCA hardcode ═══
  const ente = await leitor.enteConfig.findUnique({ where: { id: "unico" } });
  if (ente === null) {
    throw new Error(
      `MSC — a configuração do ente NÃO está semeada (EnteConfig "unico"). O código ` +
        `IBGE e o Poder/Órgão entram em TODA linha do arquivo: sem eles, a MSC seria ` +
        `enviada à União em nome de ninguém. Semeie a config — e confira o código IBGE ` +
        `contra a tabela oficial antes.`
    );
  }
  const instituicao = `${ente.codigoIbge}EX`;

  const janelas = recortes(tipo, c);

  // As três leituras, do DONO do razão. Recorte pela `dataTransacao` — a data do FATO.
  const ler = (tv: TipoValor): Promise<readonly SomasDaConta[]> => {
    const j = janelas[tv];
    return somasPorConta(leitor, {
      ...(j.desde !== undefined ? { desde: j.desde } : {}),
      ate: j.ate,
      campoData: "dataTransacao",
      natureza: j.natureza,
    });
  };
  // ⚠️ E O GRÃO FINO — por conta E POR LANÇAMENTO. É ele que permite quebrar o saldo
  // pelas DIMENSÕES, que não estão na partida e sim no FATO. O grão GROSSO continua
  // existindo, e é ele que a M4 usa para conferir o fino: somado de volta, o detalhe TEM
  // de reconstituir o total.
  const lerFino = (
    tv: TipoValor
  ): Promise<readonly SomasDaContaPorLancamento[]> => {
    const j = janelas[tv];
    return somasPorContaELancamento(leitor, {
      ...(j.desde !== undefined ? { desde: j.desde } : {}),
      ate: j.ate,
      campoData: "dataTransacao",
      natureza: j.natureza,
    });
  };

  const [beg, chg, end, begF, chgF, endF] = await Promise.all([
    ler("beginning_balance"),
    ler("period_change"),
    ler("ending_balance"),
    lerFino("beginning_balance"),
    lerFino("period_change"),
    lerFino("ending_balance"),
  ]);

  const porTipo: Record<TipoValor, ReadonlyMap<string, SomasBrutasDaConta>> = {
    beginning_balance: new Map(beg.map((s) => [s.codigo, s])),
    period_change: new Map(chg.map((s) => [s.codigo, s])),
    ending_balance: new Map(end.map((s) => [s.codigo, s])),
  };
  const finoPorTipo: Record<TipoValor, readonly SomasDaContaPorLancamento[]> = {
    beginning_balance: begF,
    period_change: chgF,
    ending_balance: endF,
  };

  // ═══ O RESOLVER — o vínculo lançamento -> fato -> dimensão ═══
  const idsDosLancamentos = [
    ...new Set([...begF, ...chgF, ...endF].map((s) => s.lancamentoId)),
  ];
  const resolucoes = await resolverDimensoes(leitor, idsDosLancamentos);

  // TODA conta que apareceu em QUALQUER recorte entra. A conta que zerou no mês continua
  // na matriz: uma conta que some do arquivo é uma conta que a STN vai procurar.
  const codigos = new Set<string>([
    ...beg.map((s) => s.codigo),
    ...chg.map((s) => s.codigo),
    ...end.map((s) => s.codigo),
  ]);

  const contas = await leitor.contaPcasp.findMany({
    where: { codigo: { in: [...codigos] } },
    select: {
      codigo: true,
      naturezaSaldo: true,
      analitica: true,
      indicadorSuperavit: true,
    },
  });
  const contaPorCodigo = new Map(contas.map((x) => [x.codigo, x]));

  // A matriz conta × IC exigida (Anexo II). Nasce VAZIA — ver o schema.
  const icsExigidas = await leitor.icExigidaPorConta.findMany({
    select: { prefixoConta: true, ic: true },
  });

  const linhas: LinhaMsc[] = [];
  const pendencias: PendenciaMsc[] = [];
  const jaPendente = new Set<string>();

  // ⚠️ A CHAVE INCLUI O LANÇAMENTO — e é o que dá TAMANHO à pendência. Deduplicar só por
  // (conta, IC) colapsaria 300 lançamentos órfãos numa linha só, e o relatório diria
  // "falta FR nesta conta" sem dizer QUANTO falta. A mesma conta aparece uma vez POR
  // LANÇAMENTO não resolvido — e nos três tipos de valor ela é o MESMO lançamento, por
  // isso a chave não leva o tipo.
  const anotar = (p: PendenciaMsc): void => {
    const chave = `${p.conta}|${p.ic}|${p.lancamentoId ?? "-"}`;
    if (jaPendente.has(chave)) return;
    jaPendente.add(chave);
    pendencias.push(p);
  };

  for (const codigo of [...codigos].sort()) {
    const conta = contaPorCodigo.get(codigo);
    if (conta === undefined) {
      // FAIL-CLOSED: há partida numa conta que o plano não conhece. Isso é base
      // quebrada, e um arquivo fiscal não a maquia.
      throw new Error(
        `MSC — a conta ${codigo} tem partidas no razão mas NÃO existe no plano. Um ` +
          `export para a União não publica classificação quebrada.`
      );
    }

    // ⚠️ "ÚLTIMO NÍVEL" = ANALÍTICA. É o mesmo conceito, e o repositório já o tem: só a
    // conta analítica recebe partida (o M01 recusa partida em sintética). Recontar a
    // hierarquia aqui — "conta sem filhas" — seria uma segunda definição da mesma coisa,
    // e ela divergiria no dia em que alguém criasse uma folha sintética por engano.
    if (!conta.analitica) {
      throw new Error(
        `MSC — a conta SINTÉTICA ${codigo} tem partidas no razão. A MSC é por conta de ` +
          `ÚLTIMO NÍVEL, e o razão nunca deveria ter aceitado esta partida.`
      );
    }

    // ─── IC FP ───
    let icFP: string | null = null;
    if (exigeFp(codigo)) {
      if (conta.indicadorSuperavit === null) {
        anotar({
          conta: codigo,
          ic: "FP",
          motivo:
            `A conta não tem 'indicadorSuperavit' no plano — e sem ele não há como ` +
            `dizer se ela é FINANCEIRA (1) ou PERMANENTE (2). A linha SAI sem a IC FP: ` +
            `um arquivo que não existe não entrega nada, e uma linha omitida em silêncio ` +
            `derruba o balancete sem dizer por quê. É a MESMA fonte do Anexo 14 — se ela ` +
            `falta aqui, o superávit financeiro daquele relatório também está cego para ` +
            `esta conta.`,
        });
      } else {
        icFP = FP_POR_INDICADOR[conta.indicadorSuperavit];
      }
    }

    // ═══ A MATRIZ DO ANEXO II — E A ESCOLHA DECLARADA DE UM ANEXO II QUE NÃO TEMOS ═══
    //
    // ⚠️ QUAIS ICs CADA CONTA LEVA É O ANEXO II DA MSC, e ele é DADO OFICIAL que NÃO está
    // no repositório. Inventá-lo — decidir por conta própria que "a conta de caixa leva
    // FR mas não NR" — seria fabricar a norma.
    //
    // A `IcExigidaPorConta` é o INTERRUPTOR, e ela tem dois estados:
    //
    //   VAZIA (hoje)  -> o gerador emite TODA IC que conseguir derivar do fato. É o
    //                    máximo de informação verdadeira que se pode dizer sem o Anexo II.
    //                    ⚠️ ISSO É MAIS DETALHE DO QUE O LEIAUTE PEDIRÁ: uma conta de
    //                    caixa movimentada por uma receita sai com NR, e o Anexo II
    //                    provavelmente não a exige ali. A informação é VERDADEIRA (aquele
    //                    saldo veio DAQUELA natureza) — mas o grão é mais fino do que o
    //                    esperado, e o arquivo NÃO deve ir à STN assim sem conferência.
    //
    //   POVOADA       -> ela RESTRINGE: a conta emite exatamente as ICs listadas, e os
    //                    grupos COLAPSAM sozinhos (a chave de agrupamento passa a ignorar
    //                    as dimensões não exigidas). Nada no código muda — é um INSERT,
    //                    como os roteiros contábeis.
    //
    // E a IC exigida que o gerador NÃO sabe derivar vira PENDÊNCIA NOMEADA: o arquivo
    // sai, o furo sai junto. Ver MODULO.md.
    const exigidasDaConta = icsExigidas
      .filter((e) => codigo.startsWith(e.prefixoConta))
      .map((e) => e.ic);
    const permitidas: ReadonlySet<string> | null =
      exigidasDaConta.length > 0 ? new Set(exigidasDaConta) : null;

    for (const ic of exigidasDaConta) {
      const derivavel =
        ic === "PO" ||
        (ic === "FP" && icFP !== null) ||
        ic === "FR" ||
        ic === "NR" ||
        ic === "ND" ||
        ic === "FUNCIONAL" ||
        // ⚠️ A "AI" ENTROU NESTE BLOCO — o resolver a tira da inscrição de RP.
        ic === "AI";
      if (derivavel) continue;
      anotar({
        conta: codigo,
        ic,
        motivo:
          `O Anexo II exige a IC "${ic}" para esta conta, e o resolver NÃO sabe derivá-la ` +
          `de fato nenhum. A linha sai sem ela — e esta pendência é o pedido formal do ` +
          `vínculo (a "CO" segue sem caminho até um fato).`,
      });
    }

    for (const tv of TIPOS_VALOR) {
      const doFino = finoPorTipo[tv].filter((s) => s.codigo === codigo);

      // ═══ AGRUPA POR COMBINAÇÃO DE DIMENSÕES ═══
      // Uma conta de caixa alimentada por DUAS fontes rende DUAS linhas. É esse o grão
      // da MSC com ICs — e é por isso que o detalhamento vem do grão FINO.
      const grupos = new Map<
        string,
        { readonly dim: Dimensoes; debito: Money; credito: Money }
      >();

      for (const s of doFino) {
        const r = resolucoes.get(s.lancamentoId);
        let dim: Dimensoes = SEM_DIMENSOES;

        if (r?.tipo === "RESOLVIDO") {
          dim = r.dimensoes;
        } else if (r?.tipo === "NAO_RESOLVIDO") {
          // ⚠️ A PENDÊNCIA É CONTÁVEL: ela sai POR CONTA **e** POR LANÇAMENTO. Saber que
          // "existe pendência de FR" não serve de nada; saber que ela vale 12 lançamentos
          // numa conta e 4.000 noutra é o que faz alguém consertar o vínculo.
          anotar({
            conta: codigo,
            ic: "FR",
            lancamentoId: s.lancamentoId,
            motivo: r.motivo,
          });
        }
        // SEM_DIMENSAO_POR_DESIGN cai aqui SEM anotar nada — e é o ponto: a apuração do
        // resultado não tem fonte, e isso está CERTO. Tratá-la como pendência encheria o
        // relatório de falso-positivo (ver o Record `DIMENSAO_DA_NATUREZA`).

        // ⚠️ A RESTRIÇÃO DO ANEXO II ACONTECE ANTES DO AGRUPAMENTO — e é por isso que os
        // grupos COLAPSAM sozinhos quando a tabela é povoada: duas linhas que só diferiam
        // numa IC não exigida viram uma.
        const dimEmitida = filtrar(dim, permitidas);

        const chave = `${dimEmitida.fonte}|${dimEmitida.naturezaReceita}|${dimEmitida.naturezaDespesa}|${dimEmitida.funcional}|${dimEmitida.anoInscricaoRp}`;
        const acc = grupos.get(chave) ?? {
          dim: dimEmitida,
          debito: toMoney("0.00"),
          credito: toMoney("0.00"),
        };
        acc.debito = toMoney(acc.debito.plus(s.debito));
        acc.credito = toMoney(acc.credito.plus(s.credito));
        grupos.set(chave, acc);
      }

      // A conta SEM lançamento nenhum neste recorte (ex.: o beginning de um mês em que
      // ela ainda não existia) continua na matriz, com valor zero e SEM ICs de fato.
      if (grupos.size === 0) {
        linhas.push({
          instituicao,
          periodo: c.rotulo,
          conta: codigo,
          tipoValor: tv,
          naturezaValor: naturezaDoValor(ZERO, conta.naturezaSaldo),
          valor: "0.00",
          icPO: ente.poderOrgao,
          icFP,
          icFR: null,
          icNR: null,
          icND: null,
          icFUNCIONAL: null,
          icAI: null,
        });
        continue;
      }

      for (const g of [...grupos.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
        const somas = { debito: g[1].debito, credito: g[1].credito };
        linhas.push({
          instituicao,
          periodo: c.rotulo,
          conta: codigo,
          tipoValor: tv,
          naturezaValor: naturezaDoValor(somas, conta.naturezaSaldo),
          valor: valorDoSaldo(somas).toFixed(2),
          icPO: ente.poderOrgao,
          icFP,
          icFR: g[1].dim.fonte,
          icNR: g[1].dim.naturezaReceita,
          icND: g[1].dim.naturezaDespesa,
          icFUNCIONAL: g[1].dim.funcional,
          icAI: g[1].dim.anoInscricaoRp,
        });
      }
    }
  }

  // ═══ AS IDENTIDADES RODAM AQUI, ANTES DE O ARQUIVO EXISTIR ═══
  // Um arquivo que não fecha não deve chegar à União. Elas nomeiam a diferença.
  conferirM1(linhas);
  conferirM2(linhas);

  // M4 — o grão FINO, somado de volta, TEM de reconstituir o grosso. A dimensão reparte
  // o dinheiro; ela não o cria nem o some.
  const totais = new Map<string, Money>();
  for (const tv of TIPOS_VALOR) {
    for (const codigo of codigos) {
      const somas = porTipo[tv].get(codigo) ?? ZERO;
      totais.set(`${codigo}|${tv}`, liquidoComSinal(somas));
    }
  }
  conferirM4(linhas, totais);

  return { instituicao, periodo: c.rotulo, tipo, linhas, pendencias };
}
