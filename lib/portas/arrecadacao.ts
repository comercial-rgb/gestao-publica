import { cliente, PortaSemBancoError } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";
import {
  arrecadadoPorEntidade,
  listarArrecadacoes,
  listarNaturezasPrevistas,
  type ArrecadacaoNaLista,
} from "../../modules/m04-receita/consultas";
import { atribuirEntidadeAArrecadacao } from "../../modules/m04-receita/atribuicao-de-entidade";
import type { AtoDoFormulario } from "./entidades-contabeis";
import { criarM04Deps } from "../../modules/m04-receita/adapter-prisma";
import { registrarArrecadacao } from "../../modules/m04-receita/servico";
import { arrecadarQuitandoReconhecimento } from "../../modules/m04-receita/arrecadacao-vinculada";
import { exigirContaDaReceita } from "../../modules/m04-receita/conta-da-receita";
import { arrecadarIngressoDaOperacaoDeCredito, arrecadarRecebendoDividaAtiva } from "../../modules/m10-patrimonial/adapter-m04";
import {
  roteiroArrecadacao,
  roteiroArrecadacaoDistribuida,
} from "../../modules/m01-core-contabil/roteiros";
import { consolidarPorNatureza } from "../../modules/m04-receita/distribuicao";
import { toMoney } from "../../packages/contracts/index";
import {
  exigirNaturezaDaFonte,
  listarNaturezasDeclaradas,
} from "../../modules/m01-core-contabil/natureza-da-fonte";

/**
 * PORTA — ARRECADAÇÃO (TR 4.59). **SÓ LEITURA.**
 *
 * A escrita depende do roteiro contábil, que não existe em produção — bloqueio nomeado
 * em `./empenho.ts` (pendência **7.2-roteiro-pcasp**).
 *
 * ⚠️ **NÃO HÁ RECORTE POR UG, E ISSO NÃO É LACUNA DESTA TELA.** A receita é do ENTE
 * (CF art. 167, IV): a `ReceitaArrecadada` tem natureza e fonte, e NÃO tem unidade
 * orçamentária — a Secretaria de Saúde não "possui" o IPTU que entrou. O `servico.ts`
 * do M04 é explícito sobre isso. O seletor de UG do cabeçalho não afeta esta página, e
 * é correto que não afete: filtrar receita por UG ensinaria ao usuário um conceito que
 * a Constituição não tem. A vinculação por FONTE é outra coisa, e ela existe.
 */

export { PortaSemBancoError };

/** Uma guia como a TELA a consome — dinheiro em `string`. */
export interface ArrecadacaoDaTela {
  readonly id: string;
  readonly dataArrecadacao: Date;
  readonly numeroReceita: string;
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
  readonly fonteCodigo: string;
  /** V16/C30 — as fontes e os valores, quando a guia reparte. VAZIA na guia de fonte única. */
  readonly fontes: readonly { readonly codigo: string; readonly valor: string }[];
  readonly coCodigo: string | null;
  readonly tipo: string;
  readonly valor: string;
  /** +1 arrecada, −1 anula — o que a linha faz com o total. */
  readonly sinal: 1 | -1;
  readonly anulacaoDeId: string | null;
  readonly criadoPor: string;
}

export interface ArrecadacaoDoPeriodo {
  readonly linhas: readonly ArrecadacaoDaTela[];
  /** Σ (sinal × valor) — a receita realizada LÍQUIDA do período. */
  readonly total: string;
}

/**
 * As guias de um exercício (e, opcionalmente, de um período dentro dele).
 *
 * ⚠️ A ANULAÇÃO É LINHA, com sinal −1. O registro é append-only: a guia anulada
 * continua na lista e a anulação aparece ao lado. Esconder as duas faria a tela exibir
 * um total que nenhuma linha visível explica.
 */
export async function lerArrecadacoes(p: {
  readonly exercicio: number;
  readonly inicio?: Date | undefined;
  readonly fim?: Date | undefined;
  readonly naturezaCodigo?: string | undefined;
}): Promise<ArrecadacaoDoPeriodo> {
  const { linhas, total } = await listarArrecadacoes(cliente(), {
    exercicio: p.exercicio,
    ...(p.naturezaCodigo !== undefined ? { naturezaCodigo: p.naturezaCodigo } : {}),
    ...(p.inicio !== undefined ? { inicio: p.inicio } : {}),
    ...(p.fim !== undefined ? { fim: p.fim } : {}),
  });
  return { linhas: linhas.map(paraTela), total: total.toFixed(2) };
}

/**
 * ⚠️ AS DUAS CONTAS PATRIMONIAIS DA ARRECADAÇÃO — e por que ficam aqui, por ora.
 *
 * A VPA da receita depende da NATUREZA dela (impostos, taxas, transferências…), e o
 * plano mínimo tem uma só: `4.1.1.2.1.01.00` (VPA — Impostos). Pendência irmã do
 * MAPA-ELEMENTO-CONTA: **MAPA-NATUREZA-CONTA**, que o xlsx PCASP Estendido fecha.
 *
 * ⚠️ E O M04 ARRECADA NO **CAIXA** (`1.1.1.1.1`), enquanto o M05 paga por **Bancos**
 * (`1.1.1.1.2`) — a divergência anotada no seed. As duas contas existem no plano
 * porque as duas fixtures rodam; o ente tem um caixa e um banco, e uma das duas está
 * no lugar errado. Chutar aqui faria o Balanço Financeiro somar dois saldos que são o
 * mesmo dinheiro. Pendência PCASP-COMPLETO.
 */
// ⚠️ A CONTA DE DISPONIBILIDADE NÃO É MAIS CONSTANTE (V6 P1.2): ela é a conta contábil da CONTA
// BANCÁRIA que a guia declara — vem do cadastro, fail-closed.
// ⚠️ V28 — E A VPA TAMBÉM: ela vinha de uma constante ("4.1.1.2.1.01.00", que no plano do TCE-PB é a VPA do
// ITR) e agora sai da declaração do ente por natureza de receita (`exigirContaDaReceita`, M04), lida antes
// de gravar. Fecha `VPA-CONSTANTE-NA-PORTA`.

/** As contas bancárias que uma guia pode declarar — com a fonte e a conta contábil (a que tem). */
export interface ContaBancariaParaGuia {
  readonly codigo: string;
  readonly descricao: string;
  readonly fonteCodigo: string;
  readonly contaContabil: string | null;
}

export async function lerContasBancariasParaGuia(): Promise<readonly ContaBancariaParaGuia[]> {
  const contas = await cliente().contaBancaria.findMany({
    orderBy: { codigo: "asc" },
    select: { codigo: true, descricao: true, fonte: { select: { codigo: true } }, contaContabil: { select: { codigo: true } } },
  });
  return contas.map((c) => ({ codigo: c.codigo, descricao: c.descricao, fonteCodigo: c.fonte.codigo, contaContabil: c.contaContabil?.codigo ?? null }));
}

/**
 * REGISTRAR A GUIA — escrita autenticada.
 *
 * ⚠️ SEM UG, e não é lacuna: a receita é do ENTE (CF art. 167, IV). O `criadoPor` é o
 * usuário real; o recorte é exercício + natureza + fonte.
 *
 * O domínio exige `numeroReceita` e que o ANO da `dataArrecadacao` case com o
 * `exercicio` — os dois erros sobem com a mensagem que ele escreveu.
 */
export async function registrarGuia(input: {
  readonly exercicio: number;
  readonly naturezaReceita: string;
  readonly fonte: string;
  readonly co?: string | undefined;
  readonly exercicioFonte: 1 | 2;
  readonly valor: string;
  readonly dataArrecadacao: Date;
  readonly numeroReceita: string;
  /** V6 P1.2 — o CÓDIGO da conta bancária que recebeu o dinheiro. Obrigatório pela tela. */
  readonly contaBancaria: string;
  /**
   * V28 — o crédito JÁ LANÇADO que esta guia quita. Presente, a contrapartida é o crédito a
   * receber da origem, e a VPA não se repete; ausente, é a guia comum (receita sem lançamento).
   */
  readonly reconhecimentoId?: string | undefined;
  /** V32 — a dívida ativa que esta guia RECEBE (a guia inteira baixa o crédito inscrito). */
  readonly dividaAtivaId?: string | undefined;
  /** V32 — a operação de crédito (dívida fundada) cujo INGRESSO esta guia registra. */
  readonly dividaFundadaId?: string | undefined;
}): Promise<string> {
  const vinculos = [input.reconhecimentoId, input.dividaAtivaId, input.dividaFundadaId].filter((v) => v !== undefined && v !== "");
  if (vinculos.length > 1) {
    throw new Error("Uma guia quita um crédito lançado, OU recebe uma dívida ativa, OU registra o ingresso de uma operação de crédito — escolha só um. Nada foi gravado.");
  }
  return comEscritaAutenticada("REGISTRAR_ARRECADACAO", async (criadoPor) => {
    // A perna de disponibilidade É a conta contábil da conta bancária declarada — do cadastro.
    const conta = await cliente().contaBancaria.findUnique({
      where: { codigo: input.contaBancaria },
      select: { codigo: true, contaContabil: { select: { codigo: true } } },
    });
    if (conta === null) throw new Error(`Conta bancária ${input.contaBancaria} não cadastrada. Escolha a conta que recebeu o dinheiro. Nada foi gravado.`);
    // ⚠️ RESOLVIDA ANTES DE GRAVAR QUALQUER COISA. "Efeito colateral antes da operação
    // guardada envenena a tentativa seguinte": se a natureza fosse conferida depois de a guia
    // existir, uma fonte não classificada deixaria registro impossível de processar.
    const natureza = await exigirNaturezaDaFonte(cliente(), input.fonte);
    if (conta.contaContabil === null) {
      throw new Error(`A conta bancária ${conta.codigo} não tem conta contábil mapeada; a guia não sabe em que conta do razão o dinheiro entrou. Parametrize o mapeamento antes. Nada foi gravado.`);
    }
    const daGuia = {
      exercicio: input.exercicio,
      naturezaReceita: input.naturezaReceita,
      fonte: input.fonte,
      ...(input.co !== undefined && input.co !== "" ? { co: input.co } : {}),
      exercicioFonte: input.exercicioFonte,
      valor: input.valor,
      dataArrecadacao: input.dataArrecadacao,
      numeroReceita: input.numeroReceita,
      contaBancaria: conta.codigo,
      criadoPor,
    };
    if (input.reconhecimentoId !== undefined && input.reconhecimentoId !== "") {
      const q = await arrecadarQuitandoReconhecimento(cliente(), {
        arrecadacao: daGuia,
        disponibilidade: conta.contaContabil.codigo,
        naturezaDaFonte: natureza.natureza,
        reconhecimentoId: input.reconhecimentoId,
      });
      return q.receitaId;
    }
    if (input.dividaAtivaId !== undefined && input.dividaAtivaId !== "") {
      const d = await arrecadarRecebendoDividaAtiva(cliente(), {
        arrecadacao: daGuia,
        disponibilidade: conta.contaContabil.codigo,
        naturezaDaFonte: natureza.natureza,
        dividaAtivaId: input.dividaAtivaId,
      });
      return d.receitaId;
    }
    if (input.dividaFundadaId !== undefined && input.dividaFundadaId !== "") {
      const d = await arrecadarIngressoDaOperacaoDeCredito(cliente(), {
        arrecadacao: daGuia,
        disponibilidade: conta.contaContabil.codigo,
        naturezaDaFonte: natureza.natureza,
        dividaId: input.dividaFundadaId,
        motivo: `Ingresso pela guia ${input.numeroReceita}`,
      });
      return d.receitaId;
    }
    // A VPA só existe na guia comum (na que quita crédito lançado a receita já foi reconhecida); lida ainda antes de gravar.
    const vpa = await exigirContaDaReceita(cliente(), input.naturezaReceita);
    const r = await registrarArrecadacao(
      daGuia,
      roteiroArrecadacao({
        disponibilidade: conta.contaContabil.codigo,
        variacaoAumentativa: vpa.contaVpaCodigo,
        // ⚠️ V11 V9.3 — A PERNA DE CLASSE 7 SAI DA DECLARAÇÃO DO ENTE, e a recusa vem ANTES de
        // qualquer escrita. `exigirNaturezaDaFonte` nomeia a fonte que falta classificar; o que
        // ela NUNCA faz é supor uma natureza para a guia passar.
        naturezaDaFonte: natureza.natureza,
      }),
      criarM04Deps(cliente())
    );
    return r.receitaId;
  });
}

/**
 * REGISTRAR A GUIA **REPARTIDA ENTRE FONTES** — V16/C30.
 *
 * ⚠️ MESMO ATO, MESMA AUTORIZAÇÃO DE BASE (`REGISTRAR_ARRECADACAO`), MESMA PERSISTÊNCIA. O que
 * muda é que a guia traz N parcelas por fonte em vez de uma fonte só. A autorização EXTRA
 * (`DISTRIBUIR_RECEITA_FORA_DA_PREVISAO`) é cobrada pelo serviço, e SÓ quando alguma parcela cai
 * em fonte que a LOA não prevê para aquela natureza — ver `resolverDistribuicao` (M04).
 *
 * ⚠️ A NATUREZA DE CADA FONTE VEM DO CADASTRO DO ENTE, uma por parcela, fail-closed
 * (`exigirNaturezaDaFonte`). É ela que escolhe a conta de classe 7 da fatia. A tela nunca a
 * oferece e este código nunca a supõe: fonte sem natureza declarada RECUSA nomeando a fonte e o
 * caminho do cadastro.
 *
 * ⚠️ A FONTE DA GUIA É A DA **PRIMEIRA PARCELA**, e isso é declaração, não sorteio.
 * `ReceitaArrecadada.fonteId` é `NOT NULL` e continua existindo como a fonte padrão da guia (o
 * papel que a ADR da conta multifonte deu à `ContaBancaria.fonteId`). Depois desta unidade nenhum
 * número POR FONTE sai dela — os sete leitores leem a parcela —, mas a coluna tem de dizer
 * alguma coisa, e o que ela diz é a fonte que o operador declarou primeiro, rotulada na tela. Uma
 * regra do tipo "a maior parcela" seria uma escolha nossa com cara de dado.
 */
export async function registrarGuiaDistribuida(input: {
  readonly exercicio: number;
  readonly naturezaReceita: string;
  readonly co?: string | undefined;
  readonly valor: string;
  readonly dataArrecadacao: Date;
  readonly numeroReceita: string;
  readonly contaBancaria: string;
  readonly parcelas: readonly {
    readonly fonte: string;
    readonly exercicioFonte: 1 | 2;
    readonly valor: string;
    readonly fundamento?: string | undefined;
  }[];
}): Promise<string> {
  return comEscritaAutenticada("REGISTRAR_ARRECADACAO", async (criadoPor) => {
    if (input.parcelas.length === 0) {
      throw new Error(
        "Informe ao menos uma fonte e o valor que entrou nela. Nada foi gravado."
      );
    }
    const conta = await cliente().contaBancaria.findUnique({
      where: { codigo: input.contaBancaria },
      select: { codigo: true, contaContabil: { select: { codigo: true } } },
    });
    if (conta === null) {
      throw new Error(
        `Conta bancária ${input.contaBancaria} não cadastrada. Escolha a conta que recebeu o dinheiro. Nada foi gravado.`
      );
    }
    if (conta.contaContabil === null) {
      throw new Error(
        `A conta bancária ${conta.codigo} não tem conta contábil mapeada; a guia não sabe em que conta do razão o dinheiro entrou. Parametrize o mapeamento antes. Nada foi gravado.`
      );
    }

    // ⚠️ TODAS AS NATUREZAS ANTES DE QUALQUER ESCRITA. Uma fonte não classificada derruba aqui,
    // com o nome dela — e não depois de a guia existir.
    const parcelas = [];
    for (const parcela of input.parcelas) {
      const natureza = await exigirNaturezaDaFonte(cliente(), parcela.fonte);
      parcelas.push({
        fonte: parcela.fonte,
        exercicioFonte: parcela.exercicioFonte,
        valor: parcela.valor,
        naturezaDaFonte: natureza.natureza,
        ...(parcela.fundamento !== undefined && parcela.fundamento !== ""
          ? { fundamento: parcela.fundamento }
          : {}),
      });
    }

    const vpa = await exigirContaDaReceita(cliente(), input.naturezaReceita);
    const r = await registrarArrecadacao(
      {
        exercicio: input.exercicio,
        naturezaReceita: input.naturezaReceita,
        // Ver o cabeçalho: a fonte da guia é a da primeira parcela declarada.
        fonte: parcelas[0]!.fonte,
        ...(input.co !== undefined && input.co !== "" ? { co: input.co } : {}),
        exercicioFonte: parcelas[0]!.exercicioFonte,
        valor: input.valor,
        dataArrecadacao: input.dataArrecadacao,
        numeroReceita: input.numeroReceita,
        contaBancaria: conta.codigo,
        distribuicao: parcelas,
        criadoPor,
      },
      roteiroArrecadacaoDistribuida({
        disponibilidade: conta.contaContabil.codigo,
        variacaoAumentativa: vpa.contaVpaCodigo,
        // Uma perna de classe 7 por NATUREZA, não por fonte: o PCASP particiona 7.2.1.1 por
        // natureza, e duas fontes vinculadas debitam a mesma conta.
        porNaturezaDaFonte: consolidarPorNatureza(
          parcelas.map((x) => ({
            natureza: x.naturezaDaFonte,
            valor: toMoney(x.valor),
          })),
          (x) => x.natureza
        ),
      }),
      criarM04Deps(cliente())
    );
    return r.receitaId;
  });
}

/** Uma fonte do rol de uma conta bancária, para a tela da guia repartida. */
export interface FonteDaContaParaGuia {
  readonly codigo: string;
  readonly descricao: string;
}

/** Uma conta bancária COM o rol de fontes que ela comporta (TR 5.10.2.6). */
export interface ContaComRolParaGuia {
  readonly codigo: string;
  readonly descricao: string;
  readonly contaContabil: string | null;
  /**
   * ⚠️ O ROL, e não a fonte padrão. É ele que manda no guard desde a
   * `ADR-conta-bancaria-com-varias-fontes`; a tela mostra o que a conta comporta para que a
   * pessoa não descubra o limite pela recusa. Rol vazio cai para a fonte padrão — a mesma regra
   * do guard, para a tela não prometer mais do que o servidor aceita.
   */
  readonly fontes: readonly FonteDaContaParaGuia[];
}

export async function lerContasComRolDeFontes(): Promise<readonly ContaComRolParaGuia[]> {
  await exigirLeituraDoEnte("CONSULTAR_RECEITA");
  const contas = await cliente().contaBancaria.findMany({
    orderBy: { codigo: "asc" },
    select: {
      codigo: true,
      descricao: true,
      contaContabil: { select: { codigo: true } },
      fonte: { select: { codigo: true, descricao: true } },
      fontesPermitidas: {
        orderBy: { fonte: { codigo: "asc" } },
        select: { fonte: { select: { codigo: true, descricao: true } } },
      },
    },
  });
  return contas.map((c) => ({
    codigo: c.codigo,
    descricao: c.descricao,
    contaContabil: c.contaContabil?.codigo ?? null,
    fontes:
      c.fontesPermitidas.length > 0
        ? c.fontesPermitidas.map((f) => f.fonte)
        : [c.fonte],
  }));
}

/** O que a LOA prevê para uma natureza: uma linha por fonte, com o previsto. */
export interface FontePrevistaDaNatureza {
  readonly fonteCodigo: string;
  readonly fonteDescricao: string;
  readonly exercicioFonte: 1 | 2;
  readonly valorPrevisto: string;
}

/**
 * AS FONTES QUE A LOA PREVÊ PARA A NATUREZA — o "conforme LOA" do C30, na tela.
 *
 * ⚠️ ORIENTA, NÃO RESTRINGE. A tela oferece estas fontes porque é nelas que a receita foi
 * prevista; arrecadar em OUTRA continua possível — é receita além do previsto, que existe e é
 * legítima —, e o formulário tem uma linha própria para isso, que cobra o motivo escrito. Fechar
 * a lista ensinaria que só se arrecada o que foi previsto, o que é falso.
 */
export async function lerFontesPrevistasDaNatureza(p: {
  readonly exercicio: number;
  readonly naturezaCodigo: string;
}): Promise<readonly FontePrevistaDaNatureza[]> {
  await exigirLeituraDoEnte("CONSULTAR_RECEITA");
  const previstas = await cliente().receitaPrevista.findMany({
    where: { exercicio: p.exercicio, naturezaReceita: { codigo: p.naturezaCodigo } },
    orderBy: [{ fonte: { codigo: "asc" } }, { exercicioFonte: "asc" }],
    select: {
      exercicioFonte: true,
      valorPrevisto: true,
      fonte: { select: { codigo: true, descricao: true } },
    },
  });
  // A LOA prevê a mesma (fonte, exercícioFonte) em mais de um `tipoReceita`; aqui a pergunta é
  // "quanto esta fonte foi prevista", então as linhas somam.
  const por = new Map<string, FontePrevistaDaNatureza>();
  for (const r of previstas) {
    const chave = `${r.fonte.codigo}|${String(r.exercicioFonte)}`;
    const antes = por.get(chave);
    por.set(chave, {
      fonteCodigo: r.fonte.codigo,
      fonteDescricao: r.fonte.descricao,
      exercicioFonte: r.exercicioFonte === 2 ? 2 : 1,
      valorPrevisto: (
        Number(antes?.valorPrevisto ?? "0") + Number(r.valorPrevisto.toFixed(2))
      ).toFixed(2),
    });
  }
  return [...por.values()];
}

/** Todas as fontes do cadastro — para a linha da fonte que a LOA não previu. */
export async function lerTodasAsFontes(): Promise<readonly FonteDaContaParaGuia[]> {
  await exigirLeituraDoEnte("CONSULTAR_RECEITA");
  return cliente().fonteRecurso.findMany({
    orderBy: { codigo: "asc" },
    select: { codigo: true, descricao: true },
  });
}

function paraTela(a: ArrecadacaoNaLista): ArrecadacaoDaTela {
  return {
    id: a.id,
    dataArrecadacao: a.dataArrecadacao,
    numeroReceita: a.numeroReceita,
    naturezaCodigo: a.naturezaCodigo,
    naturezaDescricao: a.naturezaDescricao,
    fonteCodigo: a.fonteCodigo,
    fontes: a.fontes.map((f) => ({ codigo: f.codigo, valor: f.valor.toFixed(2) })),
    coCodigo: a.coCodigo,
    tipo: a.tipo,
    valor: a.valor.toFixed(2),
    sinal: a.sinal,
    anulacaoDeId: a.anulacaoDeId,
    criadoPor: a.criadoPor,
  };
}

/** O rol da LOA — as naturezas previstas do exercício. O vocabulário da arrecadação. */
export interface NaturezaDaTela {
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
  readonly fonteCodigo: string;
  readonly tipoReceita: string;
  readonly valorPrevisto: string;
}

export async function lerNaturezasPrevistas(p: {
  readonly exercicio: number;
}): Promise<readonly NaturezaDaTela[]> {
  const linhas = await listarNaturezasPrevistas(cliente(), {
    exercicio: p.exercicio,
  });
  return linhas.map((n) => ({
    naturezaCodigo: n.naturezaCodigo,
    naturezaDescricao: n.naturezaDescricao,
    fonteCodigo: n.fonteCodigo,
    tipoReceita: n.tipoReceita,
    valorPrevisto: n.valorPrevisto.toFixed(2),
  }));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// V11 V9 — O RECORTE POR ENTIDADE TITULAR
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ E AGORA A TELA TEM UM RECORTE QUE NÃO É UG — e o cabeçalho deste arquivo continua valendo
 * inteiro. A receita não tem unidade orçamentária, e continua não tendo: o que ela passou a ter
 * é a ENTIDADE CONTÁBIL titular, que é outra coisa. UG é a estrutura da DESPESA (a Secretaria de
 * Saúde não "possui" o IPTU); entidade é quem tem balancete próprio (a autarquia possui, sim, a
 * taxa que ela arrecada). O seletor de UG do cabeçalho continua sem efeito aqui.
 */
/** Quanto da linha veio por cada caminho. Dinheiro sai daqui como string formatada. */
export interface ParcelaDaProcedenciaNaTela {
  readonly arrecadado: string;
  readonly guias: number;
}

export interface LinhaPorEntidadeNaTela {
  readonly entidadeId: string | null;
  readonly codigo: string | null;
  readonly nome: string;
  readonly arrecadado: string;
  readonly guias: number;
  /**
   * ⚠️ A PROCEDÊNCIA ATRAVESSA A PORTA (V11 V9.2). O total por entidade soma dois caminhos —
   * o que veio identificado na origem e o que o ente atribuiu depois, por ato. A porta não
   * funde os dois: quem confere de fora pergunta "como o ente sabe disso", e a resposta se
   * perde numa soma muda. `naOrigem + porAtribuicao == arrecadado`, conferido no domínio.
   */
  readonly naOrigem: ParcelaDaProcedenciaNaTela;
  readonly porAtribuicao: ParcelaDaProcedenciaNaTela;
}

export interface ArrecadadoPorEntidadeNaTela {
  readonly linhas: readonly LinhaPorEntidadeNaTela[];
  /** ⚠️ LINHA PRÓPRIA. Nunca somada nas entidades, nunca escondida. */
  readonly naoAtribuido: LinhaPorEntidadeNaTela;
  readonly total: string;
}

export async function lerArrecadadoPorEntidade(p: {
  readonly exercicio: number;
}): Promise<ArrecadadoPorEntidadeNaTela> {
  const r = await arrecadadoPorEntidade(cliente(), { exercicio: p.exercicio });
  const paraTelaParcela = (x: {
    readonly arrecadado: { toFixed(n: number): string };
    readonly guias: number;
  }): ParcelaDaProcedenciaNaTela => ({ arrecadado: x.arrecadado.toFixed(2), guias: x.guias });
  const paraTelaLinha = (l: {
    readonly entidadeId: string | null;
    readonly codigo: string | null;
    readonly nome: string;
    readonly arrecadado: { toFixed(n: number): string };
    readonly guias: number;
    readonly naOrigem: { readonly arrecadado: { toFixed(n: number): string }; readonly guias: number };
    readonly porAtribuicao: { readonly arrecadado: { toFixed(n: number): string }; readonly guias: number };
  }): LinhaPorEntidadeNaTela => ({
    entidadeId: l.entidadeId,
    codigo: l.codigo,
    nome: l.nome,
    arrecadado: l.arrecadado.toFixed(2),
    guias: l.guias,
    naOrigem: paraTelaParcela(l.naOrigem),
    porAtribuicao: paraTelaParcela(l.porAtribuicao),
  });
  return {
    linhas: r.linhas.map(paraTelaLinha),
    naoAtribuido: paraTelaLinha(r.naoAtribuido),
    total: r.total.toFixed(2),
  };
}

/** As guias NÃO ATRIBUÍDAS do exercício — a fila de retificação, com o que decidir em cada uma. */
export interface GuiaSemEntidadeNaTela {
  readonly id: string;
  readonly numeroReceita: string;
  readonly dataArrecadacao: Date;
  readonly valor: string;
  readonly fonteCodigo: string;
  /** A conta em que entrou, quando a guia a declara — é por ela que o titular se resolveria. */
  readonly contaCodigo: string | null;
  /**
   * ⚠️ O QUE FAZER, POR GUIA. "A conta CC-X não tem titular declarado" manda a pessoa para
   * Tesouraria; "esta guia não declara conta" manda para a atribuição direta. São caminhos
   * diferentes, e uma mensagem só para os dois faria metade das pessoas ir ao lugar errado.
   */
  readonly caminho: "DECLARAR_TITULAR_DA_CONTA" | "ATRIBUIR_DIRETO";
}

export async function lerGuiasSemEntidade(p: {
  readonly exercicio: number;
}): Promise<readonly GuiaSemEntidadeNaTela[]> {
  const guias = await cliente().receitaArrecadada.findMany({
    where: {
      exercicio: p.exercicio,
      tipo: "ARRECADACAO",
      entidadeTitularId: null,
      atribuicaoDeEntidade: null,
      // A guia já anulada não é fila de trabalho: não há entrada a atribuir.
      estornoDeId: null,
      estornos: { none: {} },
    },
    orderBy: { dataArrecadacao: "asc" },
    select: {
      id: true, numeroReceita: true, dataArrecadacao: true, valor: true,
      fonte: { select: { codigo: true } },
      contaBancaria: { select: { codigo: true } },
    },
  });
  return guias.map((g) => ({
    id: g.id,
    numeroReceita: g.numeroReceita,
    dataArrecadacao: g.dataArrecadacao,
    valor: g.valor.toFixed(2),
    fonteCodigo: g.fonte.codigo,
    contaCodigo: g.contaBancaria?.codigo ?? null,
    caminho: g.contaBancaria === null ? "ATRIBUIR_DIRETO" : "DECLARAR_TITULAR_DA_CONTA",
  }));
}

/** ATRIBUIR a entidade a uma guia do legado — escrita autenticada, ato conferido no domínio. */
export async function atribuirEntidade(input: {
  readonly receitaArrecadadaId: string;
  readonly entidadeId: string;
  readonly motivo: string;
  readonly ato: AtoDoFormulario;
}): Promise<string> {
  return comEscritaAutenticada("ATRIBUIR_ENTIDADE_A_ARRECADACAO", async (criadoPor) => {
    const r = await atribuirEntidadeAArrecadacao(
      cliente(),
      {
        receitaArrecadadaId: input.receitaArrecadadaId,
        entidadeId: input.entidadeId,
        motivo: input.motivo,
        ...input.ato,
        criadoPor,
      },
      new Date()
    );
    return r.atribuicaoId;
  });
}
