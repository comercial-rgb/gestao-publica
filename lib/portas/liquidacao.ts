import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import {
  listarLiquidacoes,
  naturezaDoEmpenho,
  type LiquidacaoNaLista,
} from "../../modules/m05-despesa/consultas";
import { criarM05Deps } from "../../modules/m05-despesa/adapter-prisma";
import { liquidar } from "../../modules/m05-despesa/servico-bloco2";
import {
  CONTA_ESTOQUE,
  contrapartidaDaLiquidacao,
  roteiroLiquidacao,
} from "../../modules/m01-core-contabil/roteiros";

/**
 * PORTA — LIQUIDAÇÕES (TR 5.21).
 *
 * ⚠️ O ATESTO EXISTE PELA METADE, e isto é dado, não opinião: `responsavelAtesto` é
 * coluna do `model Liquidacao` e é OBRIGATÓRIO no `zLiquidarInput` (`min(1)`) — por
 * isso o form o exige. Já a **data do atesto** NÃO existe no domínio: o `Liquidacao`
 * tem `data` (a da liquidação) e os campos de NF, e nada mais. Coluna nova é decisão de
 * domínio. Pendência nomeada: **5.21.6-data-atesto**.
 */

export { PortaSemBancoError };

/** A obrigação que a liquidação faz nascer. Vem do ATO — o credor pode não ser fornecedor. */
const CONTA_FORNECEDORES = "2.1.3.1.1.00.00";

/**
 * Erro NOMEADO: a liquidação de material está bloqueada, e não é limitação da tela.
 *
 * ═══ ⚠️ O FURO QUE ISTO IMPEDE ═══
 * O rol do M01 diz elemento 30 (material de consumo) → ESTOQUE: a despesa incorrida não
 * some, ela vira ativo. Está certo. Mas o estoque tem DONO, e é o M10: quem cria o
 * `MovimentoAlmoxarifado` é `registrarEntradaAlmoxarifado`, um ato à parte, com classe
 * de material e quantidade.
 *
 * Se esta porta liquidasse material, o razão debitaria o Almoxarifado e **nenhum
 * movimento nasceria para explicá-lo**. `conferirAlmoxarifadoContraRazao` passaria a
 * acusar divergência para sempre — estoque no razão sem entrada que o justifique. É
 * exatamente o furo que o `AoAnularLiquidacaoPort` existe para não deixar acontecer na
 * anulação, criado do outro lado.
 *
 * Liquidar material e dar entrada no almoxarifado é UM ato, e ele é do domínio — não
 * dá para montá-lo aqui empilhando duas chamadas: se a segunda falhar, a primeira já
 * gravou, e o furo aparece do mesmo jeito.
 *
 * Pendência: **LIQUIDACAO-MATERIAL-ALMOXARIFADO**.
 */
export class LiquidacaoDeMaterialBloqueadaError extends Error {
  constructor(codElemento: string, natureza: string) {
    super(
      `LIQUIDAÇÃO DE MATERIAL AINDA NÃO TEM TELA: o empenho é do elemento ${codElemento} ` +
        `(${natureza}), e material de consumo não vira despesa — vira ESTOQUE (ativo). ` +
        `Mas a entrada no almoxarifado é ato do M10 (classe de material e quantidade), e ` +
        `liquidar sem ela deixaria o razão com estoque que nenhum movimento explica: a ` +
        `amarração razão × almoxarifado passaria a acusar divergência para sempre. Os dois ` +
        `são UM ato, e ele é do domínio. Pendência LIQUIDACAO-MATERIAL-ALMOXARIFADO. ` +
        `Nada foi gravado.`
    );
    this.name = "LiquidacaoDeMaterialBloqueadaError";
  }
}

/** A liquidação como a TELA a consome — dinheiro em `string`. */
export interface LiquidacaoDaTela {
  readonly id: string;
  readonly numero: string;
  readonly data: Date;
  readonly responsavelAtesto: string;
  readonly valor: string;
  readonly liquidadoLiquido: string;
  readonly pago: string;
  readonly saldoAPagar: string;
  readonly anulado: boolean;
  readonly empenhoId: string;
  readonly empenhoNumero: string;
  readonly credorCpfCnpj: string;
  readonly fonteCodigo: string;
}

/** As liquidações do exercício (e da unidade, quando houver), com o empenho de origem. */
export async function listarLiquidacoesDaExecucao(p: {
  readonly exercicio: number;
  readonly unidadeCodigo?: string | undefined;
}): Promise<readonly LiquidacaoDaTela[]> {
  const linhas = await listarLiquidacoes(cliente(), {
    exercicio: p.exercicio,
    ...(p.unidadeCodigo !== undefined ? { unidadeCodigo: p.unidadeCodigo } : {}),
  });
  return linhas.map(paraTela);
}

/**
 * LIQUIDAR — escrita autenticada. O marco de exigibilidade do art. 141.
 *
 * ⚠️ A PORTA RESOLVE A NATUREZA E ENCAMINHA; QUEM ESCOLHE A CONTA É O M01. A pergunta
 * "a despesa virou o quê?" é respondida pelo `roteiroLiquidacao(codElemento)` — VPD,
 * estoque ou baixa de passivo. Um elemento fora do rol {30, 39, 71} derruba no domínio,
 * nomeando o elemento e a pendência MAPA-ELEMENTO-CONTA, e o erro sobe INTEIRO para a
 * tela. A UI não esconde nem contorna: um `default: VPD` aqui faria o empenho de um
 * computador virar despesa, e o lançamento fecharia.
 *
 * ⚠️ O material (30) é barrado ANTES do domínio — ver `LiquidacaoDeMaterialBloqueadaError`.
 */
export async function registrarLiquidacao(input: {
  readonly empenhoId: string;
  readonly numero: string;
  readonly valor: string;
  readonly data: Date;
  readonly responsavelAtesto: string;
  readonly historico: string;
}): Promise<string> {
  const prisma = cliente();

  const natureza = await naturezaDoEmpenho(prisma, input.empenhoId);
  if (natureza === null) {
    throw new Error(`Empenho ${input.empenhoId} não encontrado.`);
  }

  // ⚠️ ANTES da sessão e da escrita: é uma recusa de DESENHO, não de permissão. Gastar
  // um RegistroDeOperacao com ela diria que alguém tentou fazer algo proibido, quando o
  // que houve foi o sistema ainda não saber fazer.
  if (contrapartidaDaLiquidacao(natureza.codElemento) === CONTA_ESTOQUE) {
    throw new LiquidacaoDeMaterialBloqueadaError(
      natureza.codElemento,
      natureza.descricao
    );
  }

  return comEscritaAutenticada("LIQUIDAR", async (criadoPor) => {
    const r = await liquidar(
      { ...input, criadoPor },
      roteiroLiquidacao({
        codElemento: natureza.codElemento,
        obrigacaoAPagar: CONTA_FORNECEDORES,
      }),
      criarM05Deps(prisma)
    );
    return r.liquidacaoId;
  });
}

function paraTela(l: LiquidacaoNaLista): LiquidacaoDaTela {
  return {
    id: l.id,
    numero: l.numero,
    data: l.data,
    responsavelAtesto: l.responsavelAtesto,
    valor: l.valor.toFixed(2),
    liquidadoLiquido: l.liquidadoLiquido.toFixed(2),
    pago: l.pago.toFixed(2),
    saldoAPagar: l.saldoAPagar.toFixed(2),
    anulado: l.anulado,
    empenhoId: l.empenhoId,
    empenhoNumero: l.empenhoNumero,
    credorCpfCnpj: l.credorCpfCnpj,
    fonteCodigo: l.fonteCodigo,
  };
}
