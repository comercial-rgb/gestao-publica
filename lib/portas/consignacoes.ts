import {
  cadastrarTipoDeConsignacao,
  decisaoVigente,
  desativarTipoDeConsignacao,
  redefinirContaDaConsignacao,
} from "../../modules/m07-extraorcamentario/servico-tipos-de-consignacao.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/**
 * ═══ O CADASTRO DOS TIPOS DE CONSIGNAÇÃO NA TELA (V11 V8.3) ═══
 *
 * ⚠️ ESTA PORTA EXISTE PARA FECHAR `CONSIGNACAO-CONTA-SINTETICA`, e não escolhendo a conta — o que
 * seria inventar classificação contábil — mas dando ao ente o LUGAR de escolher. Até aqui
 * `TipoConsignacao` só nascia por seed e por teste: o sistema exigia uma decisão que ninguém podia
 * tomar, e em instalação limpa a retenção não existia.
 *
 * ⚠️ NENHUMA REGRA AQUI. Conta analítica, conta de passivo, fundamento e o histórico append-only
 * são do domínio, dentro da transação.
 */

export interface TipoDeConsignacaoNaTela {
  readonly id: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly ativo: boolean;
  readonly contaCodigo: string | null;
  readonly contaNome: string | null;
  readonly fundamento: string | null;
  readonly decididoPor: string | null;
  /** `true` quando o tipo é anterior ao cadastro (veio do seed) e ainda não tem decisão do ente. */
  readonly semDecisao: boolean;
  readonly movimentos: number;
}

/**
 * Os tipos com a decisão VIGENTE de cada um.
 *
 * ⚠️ A CONTAGEM DE MOVIMENTOS ENTRA porque ela muda o que a pessoa pode fazer: desativar um tipo
 * com movimento não apaga dívida nenhuma, e quem vai desativar precisa saber que ainda há saldo a
 * repassar. Escondê-la faria a decisão parecer sem consequência.
 */
export async function lerTiposDeConsignacao(): Promise<readonly TipoDeConsignacaoNaTela[]> {
  await exigirLeituraDoEnte("CONSULTAR_FINANCEIRO");
  const prisma = cliente();

  const tipos = await prisma.tipoConsignacao.findMany({
    orderBy: { codigo: "asc" },
    select: {
      id: true,
      codigo: true,
      descricao: true,
      ativo: true,
      contaPassivo: { select: { codigo: true, nome: true } },
      _count: { select: { movimentos: true } },
      decisoes: {
        orderBy: { criadoEm: "desc" },
        take: 1,
        select: {
          ativo: true,
          fundamento: true,
          criadoPor: true,
          contaPassivo: { select: { codigo: true, nome: true } },
        },
      },
    },
  });

  return tipos.map((t) => {
    const v = t.decisoes[0];
    // ⚠️ SEM DECISÃO CAI PARA A COLUNA — a mesma regra de `exigirTipoAtivo`. Duas leituras com
    // critérios diferentes fariam a tela mostrar uma conta e a retenção usar outra.
    const conta = v === undefined ? t.contaPassivo : v.contaPassivo;
    return {
      id: t.id,
      codigo: t.codigo,
      descricao: t.descricao,
      ativo: v?.ativo ?? t.ativo,
      contaCodigo: conta?.codigo ?? null,
      contaNome: conta?.nome ?? null,
      fundamento: v?.fundamento ?? null,
      decididoPor: v?.criadoPor ?? null,
      semDecisao: v === undefined,
      movimentos: t._count.movimentos,
    };
  });
}

/** O histórico de decisões de um tipo — é ele que responde "desde quando ia para esta conta?". */
export async function lerHistoricoDaConsignacao(
  tipoId: string
): Promise<readonly { readonly conta: string | null; readonly ativo: boolean; readonly fundamento: string; readonly por: string; readonly em: Date }[]> {
  await exigirLeituraDoEnte("CONSULTAR_FINANCEIRO");
  const linhas = await cliente().decisaoDoTipoDeConsignacao.findMany({
    where: { tipoId },
    orderBy: { criadoEm: "desc" },
    select: { ativo: true, fundamento: true, criadoPor: true, criadoEm: true, contaPassivo: { select: { codigo: true } } },
  });
  return linhas.map((l) => ({
    conta: l.contaPassivo?.codigo ?? null,
    ativo: l.ativo,
    fundamento: l.fundamento,
    por: l.criadoPor,
    em: l.criadoEm,
  }));
}

/**
 * As analíticas de PASSIVO do plano, para a escolha.
 *
 * ⚠️ SÓ ANALÍTICAS DO GRUPO 2, e é o descritor recortando em vez de despejar o plano inteiro: um
 * `select` com as nove mil contas do PCASP seria um formulário bonito e inútil, e ainda ofereceria
 * sintéticas que a gravação recusa.
 */
export async function lerContasDePassivo(): Promise<readonly { readonly codigo: string; readonly nome: string }[]> {
  await exigirLeituraDoEnte("CONSULTAR_FINANCEIRO");
  return cliente().contaPcasp.findMany({
    where: { analitica: true, codigo: { startsWith: "2." } },
    orderBy: { codigo: "asc" },
    select: { codigo: true, nome: true },
  });
}

export async function cadastrarConsignacao(input: {
  readonly codigo: string;
  readonly descricao: string;
  readonly contaPassivoCodigo: string;
  readonly fundamento: string;
}): Promise<string> {
  await comEscritaAutenticada("GERIR_TIPOS_DE_CONSIGNACAO", (criadoPor) =>
    cadastrarTipoDeConsignacao(cliente(), { ...input, criadoPor })
  );
  return `Consignação ${input.codigo} cadastrada, com o passivo em ${input.contaPassivoCodigo}. A retenção dela passa a aparecer no pagamento.`;
}

export async function redefinirConsignacao(input: {
  readonly tipoId: string;
  readonly contaPassivoCodigo: string;
  readonly fundamento: string;
}): Promise<string> {
  const r = await comEscritaAutenticada("GERIR_TIPOS_DE_CONSIGNACAO", (criadoPor) =>
    redefinirContaDaConsignacao(cliente(), { ...input, criadoPor })
  );
  return (
    `Passivo redefinido para ${input.contaPassivoCodigo}` +
    (r.anterior === null ? "." : `, no lugar de ${r.anterior}.`) +
    " O que já foi retido continua no passivo em que foi escriturado — a decisão vale para o que vier."
  );
}

export async function desativarConsignacao(input: { readonly tipoId: string; readonly fundamento: string }): Promise<string> {
  await comEscritaAutenticada("GERIR_TIPOS_DE_CONSIGNACAO", (criadoPor) =>
    desativarTipoDeConsignacao(cliente(), { ...input, criadoPor })
  );
  return "Consignação desativada: ela deixa de ser oferecida na retenção. O saldo já devido ao consignatário continua, e continua a repassar.";
}

export { decisaoVigente };
