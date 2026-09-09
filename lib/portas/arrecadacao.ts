import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import {
  listarArrecadacoes,
  listarNaturezasPrevistas,
  type ArrecadacaoNaLista,
} from "../../modules/m04-receita/consultas";
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
const CONTA_DISPONIBILIDADE = "1.1.1.1.1.00.00";
const CONTA_VPA = "4.1.1.2.1.01.00";

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
}): Promise<string> {
  return comEscritaAutenticada("REGISTRAR_ARRECADACAO", async (criadoPor) => {
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
        criadoPor,
      },
      roteiroArrecadacao({
        disponibilidade: CONTA_DISPONIBILIDADE,
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
