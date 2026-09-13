import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import {
  listarLiquidacoes,
  naturezaDoEmpenho,
  type LiquidacaoNaLista,
} from "../../modules/m05-despesa/consultas";
// ⚠️ A FÁBRICA COM O ALMOXARIFADO LIGADO, e não a simples. Liquidar material passou a
// exigir o port do M10 dentro da transação (ENT06 item 2); com `criarM05Deps` puro, toda
// liquidação de elemento de material seria recusada — fail-closed, e corretamente.
import { criarM05DepsComAlmoxarifado } from "../../modules/m10-patrimonial/adapter-m05-almox";
import { liquidar } from "../../modules/m05-despesa/servico-bloco2";
// ⚠️ `CONTA_ESTOQUE` e `contrapartidaDaLiquidacao` SAÍRAM DAQUI junto com a recusa: quem
// decide se a liquidação é de material é o adapter, dentro da transação, pela mesma régua.
// Deixá-los importados manteria nesta porta a aparência de uma decisão que ela não toma mais.
import { elementoDebitaEstoque, roteiroLiquidacao } from "../../modules/m01-core-contabil/roteiros";

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
  /**
   * M10 (ENT06 item 2) — AS ENTRADAS NO ALMOXARIFADO, quando a despesa é de material.
   *
   * ⚠️ ELAS ATRAVESSAM ESTA PORTA SEM QUE ELA DECIDA NADA. Quem exige é o adapter, pelo
   * elemento lido DENTRO da transação — a porta que decidisse por antecipação seria a
   * recusa antiga com outro nome, e erraria no dia em que o rol de elementos mudasse.
   *
   * Dinheiro em `string`, como todo valor que vem da tela: a conversão para `Decimal` é do
   * domínio (`zLiquidarInput`), nunca da interface.
   */
  readonly entradasDeMaterial?: readonly {
    readonly classeDeMaterialId: string;
    readonly valor: string;
    readonly fisica?: {
      readonly materialId: string;
      readonly depositoId: string;
      readonly quantidade: string;
      readonly valorUnitario: string;
      readonly unidadeDeMedidaId?: string | undefined;
      readonly loteIdentificacao?: string | undefined;
      readonly loteValidade?: Date | undefined;
      readonly recebimentoDeItemId?: string | undefined;
    } | undefined;
  }[] | undefined;
}): Promise<string> {
  const prisma = cliente();

  const natureza = await naturezaDoEmpenho(prisma, input.empenhoId);
  if (natureza === null) {
    throw new Error(`Empenho ${input.empenhoId} não encontrado.`);
  }

  // ⚠️ A RECUSA DE MATERIAL CAIU NO ENT06 ITEM 2, e o que a substituiu é mais forte: a
  // liquidação de material e a entrada no almoxarifado passaram a ser UM ato, dentro da
  // mesma transação (`AoLiquidarMaterialPort`). Quem cobra a entrada agora é o adapter,
  // pelo elemento lido DENTRO da transação — não esta porta, por antecipação.
  //
  // `LiquidacaoDeMaterialBloqueadaError` continua exportada: ela é o nome que a pendência
  // `LIQUIDACAO-MATERIAL-ALMOXARIFADO` teve enquanto durou, e há registro que a cita.

  // ⚠️ A LISTA SAI DO `input` POR DESESTRUTURAÇÃO, e não por spread condicional. Com
  // `...input` seguido de um spread condicional, o ramo FALSO continua carregando a
  // propriedade `readonly` do tipo original — o objeto resultante fica com a lista imutável
  // e o schema do domínio, que recebe array mutável, recusa. Tirá-la daqui resolve na raiz.
  const { entradasDeMaterial, ...resto } = input;

  return comEscritaAutenticada("LIQUIDAR", async (criadoPor) => {
    const r = await liquidar(
      {
        ...resto,
        criadoPor,
        // ⚠️ CÓPIA MUTÁVEL NA BORDA. O contrato desta porta é `readonly` — quem a chama não
        // deve poder alterar a lista depois de entregá-la —, e o tipo de entrada do Zod é
        // array mutável. Afrouxar a assinatura pública para agradar ao schema trocaria uma
        // garantia por uma conveniência; a adaptação fica aqui, que é a fronteira.
        ...(entradasDeMaterial !== undefined
          ? { entradasDeMaterial: entradasDeMaterial.map((e) => ({ ...e })) }
          : {}),
      },
      roteiroLiquidacao({
        codElemento: natureza.codElemento,
        obrigacaoAPagar: CONTA_FORNECEDORES,
      }),
      criarM05DepsComAlmoxarifado(prisma)
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

/**
 * V4 (§6) — AS OPÇÕES DAS ENTRADAS DE MATERIAL da tela de liquidação: as classes ativas (com a
 * conta que declaram), os materiais ativos (com a classe e se controlam lote) e os depósitos
 * ativos. Só leitura; o domínio confere tudo de novo dentro da transação.
 */
export interface OpcoesDasEntradasDeMaterial {
  readonly classes: readonly { readonly id: string; readonly rotulo: string; readonly contaCodigo: string }[];
  readonly materiais: readonly { readonly id: string; readonly rotulo: string; readonly classeDeMaterialId: string; readonly controlaLote: boolean }[];
  readonly depositos: readonly { readonly id: string; readonly rotulo: string }[];
}

export async function opcoesDasEntradasDeMaterial(): Promise<OpcoesDasEntradasDeMaterial> {
  const prisma = cliente();
  const [classes, materiais, depositos] = await Promise.all([
    prisma.classeDeMaterial.findMany({ where: { ativa: true }, select: { id: true, codigo: true, descricao: true, contaContabil: { select: { codigo: true } } }, orderBy: { codigo: "asc" }, take: 500 }),
    prisma.material.findMany({ where: { ativo: true }, select: { id: true, codigo: true, descricaoSucinta: true, classeDeMaterialId: true, controlaLote: true }, orderBy: { codigo: "asc" }, take: 2000 }),
    prisma.deposito.findMany({ where: { ativo: true }, select: { id: true, codigo: true, nome: true }, orderBy: { codigo: "asc" }, take: 300 }),
  ]);
  return {
    classes: classes.map((c) => ({ id: c.id, rotulo: `${c.codigo} — ${c.descricao}`, contaCodigo: c.contaContabil.codigo })),
    materiais: materiais.map((m) => ({ id: m.id, rotulo: `${m.codigo} — ${m.descricaoSucinta}`, classeDeMaterialId: m.classeDeMaterialId, controlaLote: m.controlaLote })),
    depositos: depositos.map((d) => ({ id: d.id, rotulo: `${d.codigo} — ${d.nome}` })),
  };
}

/** V4 (§6): o elemento da natureza liquida em ESTOQUE? — a mesma régua do adapter, para a tela avisar antes. */
export function empenhoEhDeMaterial(naturezaCodigo: string): boolean {
  return elementoDebitaEstoque(naturezaCodigo.slice(-2));
}
