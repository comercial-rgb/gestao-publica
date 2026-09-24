import { cliente, PortaSemBancoError } from "./cliente";
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
import { roteiroArrecadacao } from "../../modules/m01-core-contabil/roteiros";

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
}): Promise<ArrecadacaoDoPeriodo> {
  const { linhas, total } = await listarArrecadacoes(cliente(), {
    exercicio: p.exercicio,
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
// BANCÁRIA que a guia declara — vem do cadastro, fail-closed. A VPA continua constante aqui
// (pendência `VPA-CONSTANTE-NA-PORTA`: o roteiro por natureza de receita ainda não vem de tabela).
const CONTA_VPA = "4.1.1.2.1.01.00";

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
}): Promise<string> {
  return comEscritaAutenticada("REGISTRAR_ARRECADACAO", async (criadoPor) => {
    // A perna de disponibilidade É a conta contábil da conta bancária declarada — do cadastro.
    const conta = await cliente().contaBancaria.findUnique({
      where: { codigo: input.contaBancaria },
      select: { codigo: true, contaContabil: { select: { codigo: true } } },
    });
    if (conta === null) throw new Error(`Conta bancária ${input.contaBancaria} não cadastrada. Escolha a conta que recebeu o dinheiro. Nada foi gravado.`);
    if (conta.contaContabil === null) {
      throw new Error(`A conta bancária ${conta.codigo} não tem conta contábil mapeada; a guia não sabe em que conta do razão o dinheiro entrou. Parametrize o mapeamento antes. Nada foi gravado.`);
    }
    const r = await registrarArrecadacao(
      {
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
      },
      roteiroArrecadacao({
        disponibilidade: conta.contaContabil.codigo,
        variacaoAumentativa: CONTA_VPA,
      }),
      criarM04Deps(cliente())
    );
    return r.receitaId;
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
