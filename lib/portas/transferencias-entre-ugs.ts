import {
  conciliacaoDasTransferenciasEntreUgs,
  definirContabilizacaoDaTransferenciaEntreUgs,
  estornarTransferenciaEntreUgs,
  registrarTransferenciaEntreUgs,
  ROTULO_DA_TRANSFERENCIA_ENTRE_UGS,
  type RegistrarTransferenciaEntreUgsInput,
  type TipoDeTransferenciaEntreUgs,
} from "../../modules/m09-tesouraria/transferencia-entre-ugs.js";
import { diaCivilBr } from "../../packages/datas/index.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/**
 * V26 — TRANSFERÊNCIAS FINANCEIRAS ENTRE UNIDADES GESTORAS, na tela: as contas decididas por tipo, o registro, o
 * estorno e a conciliação. As regras são do domínio (`modules/m09-tesouraria/transferencia-entre-ugs.ts`).
 *
 * ⚠️ O RECORTE DAS LISTAS: as contas do plano oferecidas são só as analíticas de transferência intragovernamental
 * (3.5.1 e 4.5.1 com o 5º nível 2); as contas bancárias, só as com a conta contábil mapeada. Uma lista de todo o plano
 * seria um formulário bonito e inútil.
 */

export { ROTULO_DA_TRANSFERENCIA_ENTRE_UGS };

const SITUACAO: Record<string, string> = {
  DOIS_LADOS_AQUI: "Os dois lados escriturados aqui",
  RECEBIMENTO_SEM_CONFIRMACAO: "Recebimento na outra unidade sem confirmação",
  CONCESSAO_SEM_CONFIRMACAO: "Concessão pela outra unidade sem confirmação",
};

export async function lerTransferenciasEntreUgs(p: { readonly de: Date; readonly ate: Date }) {
  await exigirLeituraDoEnte("CONSULTAR_FINANCEIRO");
  const prisma = cliente();
  const [contabilizacoes, ugs, contasPlano, contasBanco, conciliacao] = await Promise.all([
    prisma.contabilizacaoDaTransferenciaEntreUgs.findMany({
      orderBy: [{ tipo: "asc" }, { vigenteDesde: "desc" }],
      select: { id: true, tipo: true, vigenteDesde: true, fundamento: true, contaConcedida: { select: { codigo: true, nome: true } }, contaRecebida: { select: { codigo: true, nome: true } } },
    }),
    prisma.unidadeGestora.findMany({ where: { encerramento: null }, orderBy: { codigoTce: "asc" }, select: { id: true, codigoTce: true, nome: true, entidadeContabilId: true } }),
    prisma.contaPcasp.findMany({ where: { analitica: true, OR: [{ codigo: { startsWith: "3.5.1." } }, { codigo: { startsWith: "4.5.1." } }] }, orderBy: { codigo: "asc" }, select: { codigo: true, nome: true } }),
    prisma.contaBancaria.findMany({ where: { contaContabilId: { not: null } }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, descricao: true } }),
    conciliacaoDasTransferenciasEntreUgs(prisma, p),
  ]);
  const intra = contasPlano.filter((c) => c.codigo.split(".")[4] === "2");
  return {
    contabilizacoes: contabilizacoes.map((c) => ({
      id: c.id,
      tipo: ROTULO_DA_TRANSFERENCIA_ENTRE_UGS[c.tipo as TipoDeTransferenciaEntreUgs],
      desde: diaCivilBr(c.vigenteDesde),
      concedida: `${c.contaConcedida.codigo} ${c.contaConcedida.nome}`,
      recebida: `${c.contaRecebida.codigo} ${c.contaRecebida.nome}`,
      fundamento: c.fundamento,
    })),
    ugs: ugs.map((u) => ({ id: u.id, rotulo: `${u.codigoTce} — ${u.nome}${u.entidadeContabilId === null ? " (de fora)" : ""}` })),
    vpds: intra.filter((c) => c.codigo.startsWith("3.5.1.")).map((c) => ({ codigo: c.codigo, rotulo: `${c.codigo} ${c.nome}` })),
    vpas: intra.filter((c) => c.codigo.startsWith("4.5.1.")).map((c) => ({ codigo: c.codigo, rotulo: `${c.codigo} ${c.nome}` })),
    contasBancarias: contasBanco.map((c) => ({ id: c.id, rotulo: `${c.codigo} — ${c.descricao}` })),
    linhas: conciliacao.linhas.map((l) => ({
      id: l.id,
      data: diaCivilBr(l.data),
      tipo: ROTULO_DA_TRANSFERENCIA_ENTRE_UGS[l.tipo],
      origem: l.origem,
      destino: l.destino,
      valor: l.valor,
      estorno: l.estorno,
      estornada: l.estornada,
      situacao: SITUACAO[l.situacao] ?? l.situacao,
      ladoSemConfirmacao: l.situacao !== "DOIS_LADOS_AQUI",
      lancamentoConcedidaId: l.lancamentoConcedidaId,
      lancamentoRecebidaId: l.lancamentoRecebidaId,
    })),
    liquidoPorPar: conciliacao.liquidoPorPar,
  };
}

export async function definirContabilizacaoPelaTela(input: {
  readonly tipo: TipoDeTransferenciaEntreUgs;
  readonly contaConcedidaCodigo: string;
  readonly contaRecebidaCodigo: string;
  readonly vigenteDesde: Date;
  readonly fundamento: string;
}): Promise<string> {
  await comEscritaAutenticada("PARAMETRIZAR_ROTEIRO_ORCAMENTARIO", (criadoPor) => definirContabilizacaoDaTransferenciaEntreUgs(cliente(), { ...input, criadoPor }));
  return `Contas de ${ROTULO_DA_TRANSFERENCIA_ENTRE_UGS[input.tipo].toLowerCase()} decididas a partir de ${diaCivilBr(input.vigenteDesde)}.`;
}

export async function registrarTransferenciaPelaTela(input: Omit<RegistrarTransferenciaEntreUgsInput, "criadoPor">): Promise<string> {
  await comEscritaAutenticada("TRANSFERIR_ENTRE_CONTAS", (criadoPor) => registrarTransferenciaEntreUgs(cliente(), { ...input, criadoPor }));
  return "Transferência registrada e contabilizada.";
}

export async function estornarTransferenciaPelaTela(input: { readonly transferenciaId: string; readonly data: Date; readonly motivo: string }): Promise<string> {
  await comEscritaAutenticada("ESTORNAR_MOVIMENTO_BANCARIO", (criadoPor) => estornarTransferenciaEntreUgs(cliente(), { ...input, criadoPor }));
  return "Transferência estornada.";
}
