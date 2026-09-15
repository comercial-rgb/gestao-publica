import { z } from "zod";
import { Decimal, sumMoney, toMoney, zMoney } from "../../packages/contracts/index.js";
import { diaCivil, diaCivilBr, inicioDoDiaCivil } from "../../packages/datas/index.js";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { execucaoPorContrato, empenhadoLiquidoPorContrato } from "../m05-despesa/consultas.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { pessoaDoUsuario } from "../m16-travamento/servico-pessoa-do-usuario.js";
import { gravarAnexoNaTransacao } from "../m22-documentos/anexos.js";
import { designacaoVigenteEm } from "../m33-folha/certificacao.js";
import { estaVigente, valorAtualizado, vigenciaFim, diasAteVencimento, type MovimentoDoContrato } from "./dominio.js";
import { gravarMedicaoNaTransacao } from "./medicoes.js";
import { conferenciaDoPeriodoPorItens } from "./regime-de-medicao.js";
import { aditivosPorItensDoContrato, historicosDosItens, novoPrecoDentroDoPeriodo, quantidadeParaComprometerDesde, versaoNoDia } from "./versoes-dos-itens.js";

/**
 * ═══ M11 — O CONTRATO ACOMPANHADO (V7 M2.1; Lei 14.133/2021, arts. 117 e 140) ═══
 *
 * GESTOR e FISCAL são DESIGNAÇÕES do contrato — pessoa e usuário conferidos pelo vínculo do M16, ato e
 * vigência derivada (a mesma `designacaoVigenteEm` da folha). Ter a AÇÃO no perfil não basta: o ato
 * de fiscal exige designação de FISCAL vigente NAQUELE contrato, e o de gestor, a de GESTOR. Outro
 * setor com a mesma permissão e sem designação é recusado com o motivo.
 *
 * O que cada papel faz aqui:
 *   · quem tem `DESIGNAR_NO_CONTRATO` designa e revoga (fato próprio, nunca UPDATE);
 *   · o GESTOR programa a fiscalização (ordem/agenda) para um fiscal do contrato e resolve as
 *     ocorrências encaminhadas a ele;
 *   · o FISCAL registra ocorrência com evidências (M22) e mede por itens — e a medição continua sendo
 *     a `MedicaoDeObra` do M11, com os mesmos guards (período e teto do contrato) e a mesma aprovação
 *     por OUTRA pessoa antes da liquidação.
 *
 * ⚠️ PROGRESSO FÍSICO NÃO É PAGAMENTO. O dossiê mostra a quantidade medida por item (física) separada
 * do empenhado, liquidado e pago (financeiro, do M05). Nenhum dos dois é derivado do outro.
 * ⚠️ CONTRATO FORA DE VIGÊNCIA não recebe agenda, ocorrência nem medição nova com data fora dela.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const zDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A data é um DIA civil AAAA-MM-DD.");
const hoje = (): string => diaCivil(new Date());

export interface ContratoLido {
  readonly id: string;
  readonly numeroContrato: string;
  readonly valorVigente: Decimal;
  readonly inicio: Date;
  readonly fim: Date;
}

/** O contrato sob o trinco (posto 5), com valor vigente e fim de vigência derivados. Reusado pela ordem de serviço. */
export async function contratoTravado(tx: Tx, contratoId: string): Promise<ContratoLido> {
  await travar(tx, "Contrato", [contratoId]);
  const c = await tx.contrato.findUnique({
    where: { id: contratoId },
    select: { id: true, numeroContrato: true, valorInicial: true, vigenciaInicio: true, vigenciaFimInicial: true, movimentos: { select: { tipo: true, valor: true, dias: true } } },
  });
  if (c === null) throw new Error(`Contrato ${contratoId} não existe. Nada foi gravado.`);
  const movs = c.movimentos.map((m) => ({ tipo: m.tipo, valor: m.valor === null ? null : toMoney(m.valor.toFixed(2)), dias: m.dias })) as readonly MovimentoDoContrato[];
  return { id: c.id, numeroContrato: c.numeroContrato, valorVigente: valorAtualizado(toMoney(c.valorInicial.toFixed(2)), movs), inicio: c.vigenciaInicio, fim: vigenciaFim(c.vigenciaFimInicial, movs) };
}

export function exigirContratoVigente(c: ContratoLido, dia: string, oQue: string): void {
  if (!estaVigente(c.inicio, c.fim, inicioDoDiaCivil(dia))) {
    throw new Error(
      `CONTRATO-FORA-DE-VIGENCIA: o contrato ${c.numeroContrato} vigora de ${diaCivilBr(c.inicio)} a ${diaCivilBr(c.fim)}, e ${oQue} em ${dia.split("-").reverse().join("/")} ` +
        `está fora dela. Execução fora da vigência exige prorrogação ANTES (aditivo de prazo). Nada foi gravado.`
    );
  }
}

/** A designação do USUÁRIO neste contrato, no papel, vigente no dia — ou a recusa nomeada. */
export async function exigirDesignacao(tx: Tx, contrato: Pick<ContratoLido, "id" | "numeroContrato">, usuario: string, papel: "GESTOR" | "FISCAL" | "RECEBEDOR_DEFINITIVO", dia: string): Promise<{ readonly id: string }> {
  const ds = await tx.designacaoNoContrato.findMany({
    where: { contratoId: contrato.id, papel, usuario: { identificador: usuario } },
    select: { id: true, vigenciaInicio: true, vigenciaFim: true, revogacao: { select: { dataEfeito: true } } },
  });
  const quando = inicioDoDiaCivil(dia);
  const vigente = ds.find((d) => designacaoVigenteEm(d, quando) && designacaoVigenteEm(d, inicioDoDiaCivil(hoje())));
  if (vigente === undefined) {
    throw new Error(
      `SEM-DESIGNACAO-DE-${papel}: ${usuario} não tem designação de ${papel === "RECEBEDOR_DEFINITIVO" ? "RECEBEDOR DEFINITIVO" : papel} vigente no contrato ${contrato.numeroContrato} ` +
        `(no dia do ato e hoje). A permissão do perfil não basta: o art. 117 pede quem foi especialmente designado para ESTE contrato. Nada foi gravado.`
    );
  }
  return { id: vigente.id };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGNAR E REVOGAR
// ═══════════════════════════════════════════════════════════════════════════════

export const zDesignarNoContrato = z.object({
  contratoId: z.string().min(1),
  papel: z.enum(["GESTOR", "FISCAL", "RECEBEDOR_DEFINITIVO"]),
  usuarioIdentificador: z.string().min(1),
  atoDesignacao: z.string().trim().min(3),
  vigenciaInicio: zDia,
  vigenciaFim: zDia.optional(),
  criadoPor: z.string().min(1),
});
export type DesignarNoContratoInput = z.input<typeof zDesignarNoContrato>;

export async function designarNoContrato(prisma: PrismaClient, input: DesignarNoContratoInput): Promise<{ readonly designacaoId: string }> {
  const d = zDesignarNoContrato.parse(input);
  if (d.vigenciaFim !== undefined && d.vigenciaFim < d.vigenciaInicio) throw new Error("VIGENCIA-INVERTIDA: o fim da designação é anterior ao início. Nada foi gravado.");
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.designarNoContrato, "ENTE");
    const c = await contratoTravado(tx, d.contratoId);
    const usuario = await tx.usuario.findUnique({ where: { identificador: d.usuarioIdentificador }, select: { id: true, ativo: true } });
    if (usuario === null) throw new Error(`Usuário ${d.usuarioIdentificador} não existe. Nada foi gravado.`);
    if (!usuario.ativo) throw new Error(`USUARIO-DESATIVADO: ${d.usuarioIdentificador} está desativado e não pratica ato nenhum. Nada foi gravado.`);
    const pessoa = await pessoaDoUsuario(tx, d.usuarioIdentificador);
    if (pessoa === null) {
      throw new Error(`USUARIO-SEM-PESSOA: a conta ${d.usuarioIdentificador} não está vinculada a uma pessoa do cadastro. O art. 117 designa uma PESSOA; vincule a conta antes. Nada foi gravado.`);
    }
    if (diaCivil(c.fim) < d.vigenciaInicio || (d.vigenciaFim ?? diaCivil(c.fim)) < diaCivil(c.inicio)) {
      throw new Error(`DESIGNACAO-FORA-DA-VIGENCIA-DO-CONTRATO: o contrato ${c.numeroContrato} vigora de ${diaCivilBr(c.inicio)} a ${diaCivilBr(c.fim)}; a designação não encontra dia dentro dela. Nada foi gravado.`);
    }
    // ⚠️ SEGREGAÇÃO, nos dois sentidos e no período que se sobrepõe:
    //   · GESTOR × FISCAL — o gestor resolve o que o fiscal registra; as duas mãos na mesma pessoa apagariam o controle;
    //   · FISCAL × RECEBEDOR DEFINITIVO — o art. 140 separa quem recebe provisoriamente (quem acompanha e fiscaliza)
    //     de quem recebe definitivamente (servidor ou comissão designada). Gestor e recebedor podem acumular: a lei
    //     não os separa.
    const conflitantes: readonly ("GESTOR" | "FISCAL" | "RECEBEDOR_DEFINITIVO")[] =
      d.papel === "GESTOR" ? ["FISCAL"] : d.papel === "FISCAL" ? ["GESTOR", "RECEBEDOR_DEFINITIVO"] : ["FISCAL"];
    const doOutro = await tx.designacaoNoContrato.findMany({
      where: { contratoId: c.id, papel: { in: [...conflitantes] }, usuarioId: usuario.id },
      select: { papel: true, vigenciaInicio: true, vigenciaFim: true, revogacao: { select: { dataEfeito: true } } },
    });
    const fimNovo = d.vigenciaFim ?? "9999-12-31";
    const conflito = doOutro.find((o) => {
      const fimO = o.revogacao !== null ? diaCivil(new Date(o.revogacao.dataEfeito.getTime() - 86_400_000)) : o.vigenciaFim === null ? "9999-12-31" : diaCivil(o.vigenciaFim);
      return diaCivil(o.vigenciaInicio) <= fimNovo && d.vigenciaInicio <= fimO;
    });
    if (conflito !== undefined) {
      const par = [d.papel, conflito.papel].sort().join("-");
      if (par === "FISCAL-RECEBEDOR_DEFINITIVO") {
        throw new Error(`ACUMULO-DE-FISCAL-E-RECEBEDOR: ${d.usuarioIdentificador} já é ${conflito.papel === "FISCAL" ? "FISCAL" : "RECEBEDOR DEFINITIVO"} do contrato ${c.numeroContrato} em período que se sobrepõe. Quem recebe provisoriamente não recebe definitivamente o mesmo objeto (art. 140, I). Nada foi gravado.`);
      }
      throw new Error(`ACUMULO-DE-GESTOR-E-FISCAL: ${d.usuarioIdentificador} já é ${conflito.papel} do contrato ${c.numeroContrato} em período que se sobrepõe. Quem gere não fiscaliza o mesmo contrato. Nada foi gravado.`);
    }
    const r = await tx.designacaoNoContrato.create({
      data: {
        contratoId: c.id, papel: d.papel, pessoaId: pessoa.pessoaId, usuarioId: usuario.id, atoDesignacao: d.atoDesignacao,
        vigenciaInicio: inicioDoDiaCivil(d.vigenciaInicio), vigenciaFim: d.vigenciaFim === undefined ? null : inicioDoDiaCivil(d.vigenciaFim), criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { designacaoId: r.id };
  });
}

export const zRevogarDesignacaoNoContrato = z.object({ designacaoId: z.string().min(1), dataEfeito: zDia, motivo: z.string().trim().min(5), criadoPor: z.string().min(1) });
export type RevogarDesignacaoNoContratoInput = z.input<typeof zRevogarDesignacaoNoContrato>;

/** Revogar é fato: os atos praticados sob a designação antes do efeito continuam com lastro. */
export async function revogarDesignacaoNoContrato(prisma: PrismaClient, input: RevogarDesignacaoNoContratoInput): Promise<{ readonly revogacaoId: string }> {
  const d = zRevogarDesignacaoNoContrato.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.revogarDesignacaoNoContrato, "ENTE");
      const des = await tx.designacaoNoContrato.findUnique({ where: { id: d.designacaoId }, select: { id: true, contratoId: true, vigenciaInicio: true, revogacao: { select: { id: true } } } });
      if (des === null) throw new Error(`Designação ${d.designacaoId} não existe. Nada foi gravado.`);
      await travar(tx, "Contrato", [des.contratoId]);
      if (des.revogacao !== null) throw new Error("DESIGNACAO-JA-REVOGADA: esta designação já foi revogada. Nada foi gravado.");
      if (d.dataEfeito < diaCivil(des.vigenciaInicio)) throw new Error("REVOGACAO-ANTES-DO-INICIO: o efeito é anterior ao início da designação — isso a apagaria em vez de encerrá-la. Nada foi gravado.");
      const r = await tx.revogacaoDeDesignacaoNoContrato.create({ data: { designacaoId: des.id, dataEfeito: inicioDoDiaCivil(d.dataEfeito), motivo: d.motivo, criadoPor: d.criadoPor }, select: { id: true } });
      return { revogacaoId: r.id };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new Error("DESIGNACAO-JA-REVOGADA: outra revogação foi gravada no mesmo instante. Nada foi gravado.");
    throw e;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ITENS
// ═══════════════════════════════════════════════════════════════════════════════

const zQuantidade = z.string().trim().regex(/^\d+(\.\d{1,4})?$/, "Quantidade com até 4 casas, ponto decimal.");

export const zCadastrarItemDoContrato = z.object({
  contratoId: z.string().min(1),
  descricao: z.string().trim().min(3),
  unidade: z.string().trim().min(1),
  quantidade: zQuantidade,
  valorUnitario: zQuantidade,
  criadoPor: z.string().min(1),
});
export type CadastrarItemDoContratoInput = z.input<typeof zCadastrarItemDoContrato>;

/** O ITEM — numerado em sequência sob o trinco do contrato; a soma dos itens não passa do valor vigente. */
export async function cadastrarItemDoContrato(prisma: PrismaClient, input: CadastrarItemDoContratoInput): Promise<{ readonly itemId: string; readonly numero: number }> {
  const d = zCadastrarItemDoContrato.parse(input);
  if (new Decimal(d.quantidade).lte(0)) throw new Error("QUANTIDADE-INVALIDA: a quantidade contratada precisa ser maior que zero. Nada foi gravado.");
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarItemDoContrato, "ENTE");
    const c = await contratoTravado(tx, d.contratoId);
    const itens = await tx.itemDoContrato.findMany({ where: { contratoId: c.id }, select: { numero: true, quantidade: true, valorUnitario: true, alteracoesPorAditivo: { where: { inclusao: true }, select: { id: true } } } });
    // V7 M2 U5 — o valor dos itens é o original MAIS as variações dos aditivos por itens vivos: a mesma grandeza que o
    // valor vigente do contrato recebeu pelos movimentos desses aditivos.
    const aditivos = await tx.aditivoPorItensDoContrato.findMany({ where: { contratoId: c.id, estorno: { is: null } }, select: { variacao: true } });
    const totalItens = sumMoney([...itens.filter((i) => i.alteracoesPorAditivo.length === 0).map((i) => toMoney(new Decimal(i.quantidade.toFixed(4)).times(i.valorUnitario.toFixed(4)))), ...aditivos.map((a) => toMoney(a.variacao.toFixed(2))), toMoney(new Decimal(d.quantidade).times(d.valorUnitario))]);
    if (totalItens.gt(c.valorVigente)) {
      throw new Error(`ITENS-ACIMA-DO-CONTRATO: os itens somariam ${totalItens.toFixed(2)} contra o valor vigente de ${c.valorVigente.toFixed(2)} do contrato ${c.numeroContrato}. Nada foi gravado.`);
    }
    const numero = Math.max(0, ...itens.map((i) => i.numero)) + 1;
    const r = await tx.itemDoContrato.create({ data: { contratoId: c.id, numero, descricao: d.descricao, unidade: d.unidade, quantidade: d.quantidade, valorUnitario: d.valorUnitario, criadoPor: d.criadoPor }, select: { id: true } });
    return { itemId: r.id, numero };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENDA, OCORRÊNCIA E RESOLUÇÃO
// ═══════════════════════════════════════════════════════════════════════════════

export const zProgramarFiscalizacao = z.object({
  contratoId: z.string().min(1),
  fiscalDesignacaoId: z.string().min(1),
  dataPrevista: zDia,
  objetivo: z.string().trim().min(10),
  criadoPor: z.string().min(1),
});
export type ProgramarFiscalizacaoInput = z.input<typeof zProgramarFiscalizacao>;

export async function programarFiscalizacao(prisma: PrismaClient, input: ProgramarFiscalizacaoInput): Promise<{ readonly ordemId: string; readonly numero: number }> {
  const d = zProgramarFiscalizacao.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.programarFiscalizacao, "ENTE");
    const c = await contratoTravado(tx, d.contratoId);
    const gestor = await exigirDesignacao(tx, c, d.criadoPor, "GESTOR", hoje());
    exigirContratoVigente(c, d.dataPrevista, "a fiscalização programada");
    const fiscal = await tx.designacaoNoContrato.findUnique({ where: { id: d.fiscalDesignacaoId }, select: { id: true, contratoId: true, papel: true, vigenciaInicio: true, vigenciaFim: true, revogacao: { select: { dataEfeito: true } } } });
    if (fiscal === null || fiscal.contratoId !== c.id || fiscal.papel !== "FISCAL") throw new Error("FISCAL-DE-OUTRO-CONTRATO: a designação escolhida não é de FISCAL deste contrato. Nada foi gravado.");
    if (!designacaoVigenteEm(fiscal, inicioDoDiaCivil(d.dataPrevista))) throw new Error("FISCAL-SEM-VIGENCIA-NA-DATA: a designação do fiscal não estará vigente na data prevista. Nada foi gravado.");
    const ultima = await tx.ordemDeFiscalizacao.findFirst({ where: { contratoId: c.id }, orderBy: { numero: "desc" }, select: { numero: true } });
    const numero = (ultima?.numero ?? 0) + 1;
    const r = await tx.ordemDeFiscalizacao.create({ data: { contratoId: c.id, numero, dataPrevista: inicioDoDiaCivil(d.dataPrevista), objetivo: d.objetivo, gestorDesignacaoId: gestor.id, fiscalDesignacaoId: fiscal.id, criadoPor: d.criadoPor }, select: { id: true } });
    return { ordemId: r.id, numero };
  });
}

export const zEvidencia = z.object({ nomeOriginal: z.string().min(1), mimeType: z.string().min(1), conteudo: z.instanceof(Uint8Array) });

export const zRegistrarOcorrencia = z.object({
  contratoId: z.string().min(1),
  ordemId: z.string().min(1).optional(),
  data: zDia,
  tipo: z.enum(["CONFORMIDADE", "NAO_CONFORMIDADE", "ATRASO", "IMPEDIMENTO", "OUTRO"]),
  descricao: z.string().trim().min(10),
  encaminhamento: z.enum(["NENHUM", "GESTOR"]),
  evidencias: z.array(zEvidencia).max(10).default([]),
  criadoPor: z.string().min(1),
});
export type RegistrarOcorrenciaInput = z.input<typeof zRegistrarOcorrencia>;

/**
 * A OCORRÊNCIA DO FISCAL — com a designação de FISCAL vigente no dia do fato e hoje, data não futura,
 * contrato vigente no dia, ordem (se houver) deste contrato e deste fiscal. As evidências gravam pelo
 * M22 na mesma transação: se um arquivo for recusado, a ocorrência não fica sem ele.
 */
export async function registrarOcorrencia(prisma: PrismaClient, input: RegistrarOcorrenciaInput): Promise<{ readonly ocorrenciaId: string; readonly numero: number; readonly evidencias: number }> {
  const d = zRegistrarOcorrencia.parse(input);
  if (d.data > hoje()) throw new Error("OCORRENCIA-NO-FUTURO: a ocorrência registra o que o fiscal viu; a data não pode ser posterior a hoje. Nada foi gravado.");
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarOcorrencia, "ENTE");
    const c = await contratoTravado(tx, d.contratoId);
    const fiscal = await exigirDesignacao(tx, c, d.criadoPor, "FISCAL", d.data);
    exigirContratoVigente(c, d.data, "a ocorrência");
    if (d.ordemId !== undefined) {
      const o = await tx.ordemDeFiscalizacao.findUnique({ where: { id: d.ordemId }, select: { contratoId: true, fiscalDesignacao: { select: { usuario: { select: { identificador: true } } } } } });
      if (o === null || o.contratoId !== c.id) throw new Error("ORDEM-DE-OUTRO-CONTRATO: a ordem de fiscalização informada não é deste contrato. Nada foi gravado.");
      if (o.fiscalDesignacao.usuario.identificador !== d.criadoPor) throw new Error("ORDEM-DE-OUTRO-FISCAL: esta ordem foi dirigida a outro fiscal. Nada foi gravado.");
    }
    const ultima = await tx.ocorrenciaDeFiscalizacao.findFirst({ where: { contratoId: c.id }, orderBy: { numero: "desc" }, select: { numero: true } });
    const numero = (ultima?.numero ?? 0) + 1;
    const r = await tx.ocorrenciaDeFiscalizacao.create({
      data: { contratoId: c.id, numero, ordemId: d.ordemId ?? null, designacaoId: fiscal.id, data: inicioDoDiaCivil(d.data), tipo: d.tipo, descricao: d.descricao, encaminhamento: d.encaminhamento, criadoPor: d.criadoPor },
      select: { id: true },
    });
    for (const ev of d.evidencias) {
      await gravarAnexoNaTransacao(tx, { nomeOriginal: ev.nomeOriginal, mimeType: ev.mimeType, conteudo: ev.conteudo, origem: "UPLOAD", ocorrenciaDeFiscalizacaoId: r.id, criadoPor: d.criadoPor });
    }
    return { ocorrenciaId: r.id, numero, evidencias: d.evidencias.length };
  });
}

export const zResolverOcorrencia = z.object({ ocorrenciaId: z.string().min(1), texto: z.string().trim().min(10), criadoPor: z.string().min(1) });
export type ResolverOcorrenciaInput = z.input<typeof zResolverOcorrencia>;

/** O ENCAMINHAMENTO DO GESTOR — só ocorrência encaminhada a ele, uma resolução por ocorrência. */
export async function resolverOcorrencia(prisma: PrismaClient, input: ResolverOcorrenciaInput): Promise<{ readonly resolucaoId: string }> {
  const d = zResolverOcorrencia.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.resolverOcorrencia, "ENTE");
      const o = await tx.ocorrenciaDeFiscalizacao.findUnique({ where: { id: d.ocorrenciaId }, select: { id: true, numero: true, contratoId: true, encaminhamento: true, resolucao: { select: { id: true } } } });
      if (o === null) throw new Error(`Ocorrência ${d.ocorrenciaId} não existe. Nada foi gravado.`);
      const c = await contratoTravado(tx, o.contratoId);
      const gestor = await exigirDesignacao(tx, c, d.criadoPor, "GESTOR", hoje());
      if (o.encaminhamento !== "GESTOR") throw new Error(`OCORRENCIA-SEM-ENCAMINHAMENTO: a ocorrência nº ${o.numero} foi registrada sem encaminhamento ao gestor. Nada foi gravado.`);
      if (o.resolucao !== null) throw new Error(`OCORRENCIA-JA-RESOLVIDA: a ocorrência nº ${o.numero} já tem resolução. Nada foi gravado.`);
      const r = await tx.resolucaoDeOcorrencia.create({ data: { ocorrenciaId: o.id, designacaoId: gestor.id, texto: d.texto, criadoPor: d.criadoPor }, select: { id: true } });
      return { resolucaoId: r.id };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new Error("OCORRENCIA-JA-RESOLVIDA: outra resolução foi gravada no mesmo instante. Nada foi gravado.");
    throw e;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MEDIÇÃO POR ITENS
// ═══════════════════════════════════════════════════════════════════════════════

export const zRegistrarMedicaoPorItens = z.object({
  obraId: z.string().min(1),
  contratoId: z.string().min(1),
  numero: z.number().int().min(1),
  diaInicio: zDia,
  diaFim: zDia,
  itens: z.array(z.object({ itemId: z.string().min(1), quantidade: zQuantidade })).min(1),
  responsavelTecnico: z.string().trim().min(3),
  registroProfissional: z.string().trim().min(3),
  criadoPor: z.string().min(1),
});
export type RegistrarMedicaoPorItensInput = z.input<typeof zRegistrarMedicaoPorItens>;

/**
 * MEDIR POR ITENS — o fiscal designado informa QUANTIDADES; o valor sai de quantidade × unitário
 * contratado (em Decimal, arredondado a centavos por item). Por item, o acumulado medido não passa da
 * quantidade contratada — é ESSA a identidade da parcela: repetir a mesma parcela esgota o saldo e é recusado por
 * ele. O período só é conferido se o contrato configurar regime indivisível (V7 M2 U0.2, `regime-de-medicao.ts`);
 * o teto do valor vigente vale sempre. Uma parcela PARCIAL de um item é permitida — o resto continua a medir.
 */
export async function registrarMedicaoPorItens(prisma: PrismaClient, input: RegistrarMedicaoPorItensInput): Promise<{ readonly medicaoId: string; readonly valorMedido: string; readonly acumulado: string }> {
  const d = zRegistrarMedicaoPorItens.parse(input);
  const ids = d.itens.map((i) => i.itemId);
  if (new Set(ids).size !== ids.length) throw new Error("ITEM-REPETIDO: cada item entra uma vez na medição. Nada foi gravado.");
  if (d.itens.some((i) => new Decimal(i.quantidade).lte(0))) throw new Error("QUANTIDADE-INVALIDA: a quantidade medida precisa ser maior que zero. Nada foi gravado.");
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarMedicaoPorItens, "ENTE");
    const c = await contratoTravado(tx, d.contratoId);
    // ⚠️ A MEDIÇÃO É ATO PRATICADO HOJE sobre um período (que pode ser anterior à designação — o fiscal que
    // assume mede o que o antecessor deixou): exige-se a designação vigente HOJE. A ocorrência é diferente:
    // ela afirma o que o fiscal VIU no dia do fato, e por isso exige a designação naquele dia.
    const fiscal = await exigirDesignacao(tx, c, d.criadoPor, "FISCAL", hoje());
    exigirContratoVigente(c, d.diaInicio, "o início da medição");
    exigirContratoVigente(c, d.diaFim, "o fim da medição");
    const historicos = await historicosDosItens(tx, { ids });
    const itens = await tx.itemDoContrato.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, numero: true, contratoId: true, descricao: true, medidos: { select: { quantidade: true } },
        // V7 M2 U1 — o autorizado nas ordens de serviço emitidas também compromete o item: os dois caminhos não consomem o
        // mesmo saldo.
        itensDeOrdemDeServico: { where: { ordem: { emissao: { isNot: null } } }, select: { quantidade: true, cancelamentos: { select: { quantidade: true } } } },
      },
    });
    const linhas = d.itens.map((pedido) => {
      const item = itens.find((i) => i.id === pedido.itemId);
      if (item === undefined || item.contratoId !== c.id) throw new Error(`ITEM-DE-OUTRO-CONTRATO: o item ${pedido.itemId} não é do contrato ${c.numeroContrato}. Nada foi gravado.`);
      const autorizadoEmOrdens = item.itensDeOrdemDeServico.reduce((t, o) => t.plus(o.quantidade.toFixed(4)).minus(o.cancelamentos.reduce((u, x) => u.plus(x.quantidade.toFixed(4)), new Decimal(0))), new Decimal(0));
      const jaMedido = item.medidos.reduce((t, m) => t.plus(m.quantidade.toFixed(4)), new Decimal(0)).plus(autorizadoEmOrdens);
      const novo = jaMedido.plus(pedido.quantidade);
      // V7 M2 U5 — contratado e unitário pelas versões do item (aditivo por itens), como na medição da ordem.
      const h = historicos.get(item.id)!;
      const contratado = quantidadeParaComprometerDesde(h, d.diaInicio);
      const novoPreco = novoPrecoDentroDoPeriodo(h, d.diaInicio, d.diaFim);
      if (novoPreco !== null) {
        throw new Error(`PERIODO-ATRAVESSA-NOVO-PRECO: o item ${item.numero} (${item.descricao}) passa a R$ ${novoPreco.valorUnitario.toFixed(4)} em ${novoPreco.desde!.split("-").reverse().join("/")} pelo aditivo nº ${novoPreco.numeroAditivo}, dentro do período medido. Meça em dois períodos. Nada foi gravado.`);
      }
      if (novo.gt(contratado)) {
        throw new Error(
          `ITEM-ACIMA-DO-CONTRATADO: o item ${item.numero} (${item.descricao}) tem ${contratado.toFixed(4)} contratado(s), já comprometeu ${jaMedido.toFixed(4)} (medido ou autorizado em ordem de serviço) e esta medição levaria a ${novo.toFixed(4)}. ` +
            `Quantidade acima do contratado exige aditivo antes. Nada foi gravado.`
        );
      }
      return { itemId: item.id, quantidade: pedido.quantidade, valor: toMoney(new Decimal(pedido.quantidade).times(versaoNoDia(h, d.diaInicio).valorUnitario)) };
    });
    const valorMedido = sumMoney(linhas.map((l) => l.valor));
    const periodo = await conferenciaDoPeriodoPorItens(tx, c.id, d.diaInicio);
    const m = await gravarMedicaoNaTransacao(tx, {
      obraId: d.obraId, contratoId: d.contratoId, numero: d.numero, diaInicio: d.diaInicio, diaFim: d.diaFim,
      valorMedido: zMoney.parse(valorMedido.toFixed(2)), responsavelTecnico: d.responsavelTecnico, registroProfissional: d.registroProfissional, criadoPor: d.criadoPor,
    }, periodo);
    await tx.medicaoPorItens.create({
      data: { medicaoId: m.medicaoId, designacaoId: fiscal.id, criadoPor: d.criadoPor, itens: { create: linhas.map((l) => ({ itemId: l.itemId, quantidade: l.quantidade, valor: l.valor.toFixed(2) })) } },
    });
    return { medicaoId: m.medicaoId, valorMedido: valorMedido.toFixed(2), acumulado: m.acumulado };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// LEITURAS — o dossiê (interno) e a projeção pública
// ═══════════════════════════════════════════════════════════════════════════════

export interface ItemAcompanhado {
  readonly id: string;
  readonly numero: number;
  readonly descricao: string;
  readonly unidade: string;
  readonly quantidade: string;
  readonly valorUnitario: string;
  readonly medido: string;
  /** Quantidade ainda a medir (contratado − medido). */
  readonly aMedir: string;
  /** Percentual FÍSICO (medido / contratado), uma casa. Não é financeiro. */
  readonly percentualFisico: string;
}

export interface DesignacaoAcompanhada {
  readonly id: string;
  readonly papel: "GESTOR" | "FISCAL" | "RECEBEDOR_DEFINITIVO";
  readonly nome: string;
  readonly usuario: string;
  readonly ato: string;
  readonly inicio: string;
  readonly fim: string | null;
  readonly revogadaEm: string | null;
  readonly vigenteHoje: boolean;
}

export type VisaoDoContrato = "FISCALIZACAO" | "FINANCEIRA";

export interface AcompanhamentoDoContrato {
  /** Qual projeção foi lida. Na FINANCEIRA, agenda e ocorrências nem são consultadas (listas vazias). */
  readonly visao: VisaoDoContrato;
  readonly contrato: { readonly id: string; readonly numero: string; readonly objeto: string | null; readonly contratado: string; readonly inicio: string; readonly fim: string; readonly diasAteOFim: number; readonly vigenteHoje: boolean };
  readonly financeiro: { readonly valorVigente: string; readonly empenhado: string; readonly saldoAEmpenhar: string; readonly liquidado: string; readonly pago: string };
  readonly fisico: { readonly itens: readonly ItemAcompanhado[]; readonly medidoTotal: string };
  readonly designacoes: readonly DesignacaoAcompanhada[];
  readonly ordens: readonly { readonly id: string; readonly numero: number; readonly dataPrevista: string; readonly objetivo: string; readonly fiscal: string; readonly ocorrencias: number }[];
  readonly ocorrencias: readonly { readonly id: string; readonly numero: number; readonly data: string; readonly tipo: string; readonly descricao: string; readonly encaminhamento: string; readonly fiscal: string; readonly ordem: number | null; readonly evidencias: readonly { readonly id: string; readonly nome: string }[]; readonly resolucao: { readonly texto: string; readonly gestor: string; readonly em: string } | null }[];
  readonly medicoes: readonly { readonly id: string; readonly numero: number; readonly obra: string; readonly periodo: string; readonly valor: string; readonly aprovada: boolean; readonly porItens: boolean }[];
  /** V7 M2 U0.2 — o regime de período das medições por itens, com fundamento (mais recente primeiro). */
  readonly regimesDeMedicao: readonly { readonly regime: "PERIODO_LIVRE" | "PERIODO_INDIVISIVEL"; readonly fundamento: string; readonly desde: string; readonly por: string }[];
}

const pct1 = (parte: Decimal, todo: Decimal): string => (todo.isZero() ? "0,0" : parte.times(100).dividedBy(todo).toDecimalPlaces(1, Decimal.ROUND_HALF_UP).toFixed(1).replace(".", ","));

/**
 * O DOSSIÊ INTERNO — leitura. QUEM lê e EM QUAL VISÃO é decidido antes, por `alcanceNoContrato`
 * (acesso-da-fiscalizacao.ts). Na visão FINANCEIRA a agenda e as ocorrências (com as evidências) NÃO são lidas do
 * banco: a projeção não depende de a tela esquecer de mostrar.
 */
export async function acompanhamentoDoContrato(prisma: Tx, contratoId: string, visao: VisaoDoContrato): Promise<AcompanhamentoDoContrato | null> {
  const c = await prisma.contrato.findUnique({
    where: { id: contratoId },
    select: {
      id: true, numeroContrato: true, objeto: true, contratadoNome: true, valorInicial: true, vigenciaInicio: true, vigenciaFimInicial: true,
      movimentos: { select: { tipo: true, valor: true, dias: true } },
      itens: { orderBy: { numero: "asc" }, select: { id: true, numero: true, descricao: true, unidade: true, quantidade: true, valorUnitario: true, medidos: { select: { quantidade: true } } } },
      designacoes: { orderBy: [{ papel: "asc" }, { vigenciaInicio: "asc" }], select: { id: true, papel: true, atoDesignacao: true, vigenciaInicio: true, vigenciaFim: true, revogacao: { select: { dataEfeito: true } }, usuario: { select: { identificador: true } }, pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } } },
      medicoes: { orderBy: { criadoEm: "desc" }, select: { id: true, numero: true, periodoInicio: true, periodoFim: true, valorMedido: true, aprovadaEm: true, aprovacao: { select: { id: true } }, obra: { select: { identificador: true } }, porItens: { select: { id: true } } } },
      regimesDeMedicao: { orderBy: { vigenciaInicio: "desc" }, select: { regime: true, fundamento: true, vigenciaInicio: true, criadoPor: true } },
    },
  });
  if (c === null) return null;
  const movs = c.movimentos.map((m) => ({ tipo: m.tipo, valor: m.valor === null ? null : toMoney(m.valor.toFixed(2)), dias: m.dias })) as readonly MovimentoDoContrato[];
  const valorVigente = valorAtualizado(toMoney(c.valorInicial.toFixed(2)), movs);
  const fim = vigenciaFim(c.vigenciaFimInicial, movs);
  const agora = new Date();
  const fiscalizacao = visao === "FISCALIZACAO";
  const [empenhado, execucao, ordensDeFiscalizacao, ocorrencias] = await Promise.all([
    empenhadoLiquidoPorContrato(prisma, c.id),
    execucaoPorContrato(prisma, c.id),
    fiscalizacao
      ? prisma.ordemDeFiscalizacao.findMany({ where: { contratoId: c.id }, orderBy: { numero: "desc" }, select: { id: true, numero: true, dataPrevista: true, objetivo: true, fiscalDesignacao: { select: { usuario: { select: { identificador: true } } } }, _count: { select: { ocorrencias: true } } } })
      : Promise.resolve([]),
    fiscalizacao
      ? prisma.ocorrenciaDeFiscalizacao.findMany({ where: { contratoId: c.id }, orderBy: { numero: "desc" }, select: { id: true, numero: true, data: true, tipo: true, descricao: true, encaminhamento: true, ordem: { select: { numero: true } }, designacao: { select: { usuario: { select: { identificador: true } } } }, evidencias: { select: { id: true, nomeOriginal: true } }, resolucao: { select: { texto: true, criadoEm: true, designacao: { select: { usuario: { select: { identificador: true } } } } } } } })
      : Promise.resolve([]),
  ]);
  // V7 M2 U5 — quantidade e unitário VIGENTES HOJE, pelas versões dos aditivos por itens.
  const historicos = await historicosDosItens(prisma, { contratoId: c.id });
  const itens = c.itens.map((i) => {
    const medido = i.medidos.reduce((t, m) => t.plus(m.quantidade.toFixed(4)), new Decimal(0));
    const v = versaoNoDia(historicos.get(i.id)!, hoje());
    return { id: i.id, numero: i.numero, descricao: i.descricao, unidade: i.unidade, quantidade: v.quantidade.toFixed(4), valorUnitario: v.valorUnitario.toFixed(4), medido: medido.toFixed(4), aMedir: v.quantidade.minus(medido).toFixed(4), percentualFisico: pct1(medido, v.quantidade) };
  });
  return {
    visao,
    contrato: { id: c.id, numero: c.numeroContrato, objeto: c.objeto, contratado: c.contratadoNome, inicio: diaCivilBr(c.vigenciaInicio), fim: diaCivilBr(fim), diasAteOFim: diasAteVencimento(fim, agora), vigenteHoje: estaVigente(c.vigenciaInicio, fim, agora) },
    financeiro: { valorVigente: valorVigente.toFixed(2), empenhado: empenhado.toFixed(2), saldoAEmpenhar: toMoney(valorVigente.minus(empenhado)).toFixed(2), liquidado: execucao.liquidado.toFixed(2), pago: execucao.pago.toFixed(2) },
    fisico: { itens, medidoTotal: sumMoney(c.medicoes.map((m) => m.valorMedido.toFixed(2))).toFixed(2) },
    designacoes: c.designacoes.map((d) => ({
      id: d.id, papel: d.papel, nome: d.pessoa.versoes[0]?.nome ?? d.pessoa.documento, usuario: d.usuario.identificador, ato: d.atoDesignacao,
      inicio: diaCivilBr(d.vigenciaInicio), fim: d.vigenciaFim === null ? null : diaCivilBr(d.vigenciaFim), revogadaEm: d.revogacao === null ? null : diaCivilBr(d.revogacao.dataEfeito), vigenteHoje: designacaoVigenteEm(d, agora),
    })),
    ordens: ordensDeFiscalizacao.map((o) => ({ id: o.id, numero: o.numero, dataPrevista: diaCivilBr(o.dataPrevista), objetivo: o.objetivo, fiscal: o.fiscalDesignacao.usuario.identificador, ocorrencias: o._count.ocorrencias })),
    ocorrencias: ocorrencias.map((o) => ({
      id: o.id, numero: o.numero, data: diaCivilBr(o.data), tipo: o.tipo, descricao: o.descricao, encaminhamento: o.encaminhamento, fiscal: o.designacao.usuario.identificador, ordem: o.ordem?.numero ?? null,
      evidencias: o.evidencias.map((e) => ({ id: e.id, nome: e.nomeOriginal })),
      resolucao: o.resolucao === null ? null : { texto: o.resolucao.texto, gestor: o.resolucao.designacao.usuario.identificador, em: diaCivilBr(o.resolucao.criadoEm) },
    })),
    medicoes: c.medicoes.map((m) => ({ id: m.id, numero: m.numero, obra: m.obra.identificador, periodo: `${diaCivilBr(m.periodoInicio)} a ${diaCivilBr(m.periodoFim)}`, valor: m.valorMedido.toFixed(2), aprovada: m.aprovadaEm !== null || m.aprovacao !== null, porItens: m.porItens !== null })),
    regimesDeMedicao: c.regimesDeMedicao.map((r) => ({ regime: r.regime, fundamento: r.fundamento, desde: diaCivilBr(r.vigenciaInicio), por: r.criadoPor })),
  };
}

export interface ProjecaoPublicaDoContrato {
  readonly numero: string;
  readonly objeto: string | null;
  readonly contratado: string;
  readonly vigencia: { readonly inicio: string; readonly fim: string };
  readonly valorInicial: string;
  readonly valorVigente: string;
  readonly aditivos: readonly { readonly numero: string | null; readonly tipo: string; readonly data: string; readonly valor: string | null; readonly dias: number | null }[];
  /** V7 M2 U5 — os aditivos por itens: termo, vigência, fundamento, variação e as quantidades/unitários antes e depois. */
  readonly aditivosPorItens: readonly {
    readonly numero: string; readonly assinatura: string; readonly vigenciaInicio: string; readonly fundamento: string; readonly variacao: string; readonly estornado: boolean;
    readonly itens: readonly { readonly item: number; readonly descricao: string; readonly unidade: string; readonly quantidadeAnterior: string; readonly quantidade: string; readonly valorUnitarioAnterior: string; readonly valorUnitario: string; readonly variacao: string }[];
  }[];
  readonly responsaveis: readonly { readonly papel: "GESTOR" | "FISCAL" | "RECEBEDOR_DEFINITIVO"; readonly nome: string; readonly ato: string; readonly desde: string }[];
  readonly execucaoFisica: readonly { readonly item: number; readonly descricao: string; readonly unidade: string; readonly contratado: string; readonly medidoAprovado: string; readonly percentual: string }[];
  readonly medicoesAprovadas: { readonly quantidade: number; readonly valor: string };
  /**
   * V7 M2 U4 — a execução por ordens de serviço EMITIDAS: número, período autorizado, valor autorizado e o recebido em
   * definitivo. Não sai: rascunho, medição não recebida, controvérsia, verificações, termos, conta ou documento de pessoa.
   */
  readonly execucaoPorOrdens: { readonly ordens: readonly { readonly numero: string; readonly periodo: string; readonly autorizado: string; readonly recebido: string }[]; readonly autorizado: string; readonly recebido: string };
}

/**
 * A PROJEÇÃO PÚBLICA — o que o visitante vê, escolhido campo a campo: identificação, vigência, valores,
 * aditivos, os responsáveis VIGENTES (nome e ato, sem conta nem documento), a execução física pelas
 * medições APROVADAS. Não sai: ocorrência, evidência, agenda, usuário, CPF, medição não aprovada.
 */
export async function projecaoPublicaDoContrato(prisma: Tx, contratoId: string): Promise<ProjecaoPublicaDoContrato | null> {
  const c = await prisma.contrato.findUnique({
    where: { id: contratoId },
    select: {
      numeroContrato: true, objeto: true, contratadoNome: true, valorInicial: true, vigenciaInicio: true, vigenciaFimInicial: true,
      movimentos: { orderBy: { data: "asc" }, select: { tipo: true, valor: true, dias: true, data: true, numeroAditivo: true } },
      designacoes: { select: { papel: true, atoDesignacao: true, vigenciaInicio: true, vigenciaFim: true, revogacao: { select: { dataEfeito: true } }, pessoa: { select: { versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } } },
      itens: { orderBy: { numero: "asc" }, select: { id: true, numero: true, descricao: true, unidade: true, quantidade: true, medidos: { where: { medicaoPorItens: { medicao: { OR: [{ aprovadaEm: { not: null } }, { aprovacao: { isNot: null } }] } } }, select: { quantidade: true } } } },
      medicoes: { where: { OR: [{ aprovadaEm: { not: null } }, { aprovacao: { isNot: null } }] }, select: { valorMedido: true } },
      ordensDeServico: {
        where: { emissao: { isNot: null }, descarte: null },
        orderBy: { numero: "asc" },
        select: {
          numero: true, ano: true, fimPrevisto: true, emissao: { select: { inicioAutorizado: true } },
          itens: { select: { quantidade: true, valorUnitario: true, cancelamentos: { select: { quantidade: true } } } },
          medicoes: { select: { recebimentosDefinitivos: { select: { itens: { select: { valor: true } } } } } },
        },
      },
    },
  });
  if (c === null) return null;
  const movs = c.movimentos.map((m) => ({ tipo: m.tipo, valor: m.valor === null ? null : toMoney(m.valor.toFixed(2)), dias: m.dias })) as readonly MovimentoDoContrato[];
  const agora = new Date();
  const historicos = await historicosDosItens(prisma, { contratoId });
  const aditivosPorItens = (await aditivosPorItensDoContrato(prisma, contratoId)).map((a) => ({
    numero: a.numeroAditivo, assinatura: a.dataAssinatura.split("-").reverse().join("/"), vigenciaInicio: a.vigenciaInicio.split("-").reverse().join("/"), fundamento: a.fundamento,
    variacao: a.variacao, estornado: a.estornado !== null, itens: a.itens,
  }));
  return {
    numero: c.numeroContrato, objeto: c.objeto, contratado: c.contratadoNome,
    aditivosPorItens,
    vigencia: { inicio: diaCivilBr(c.vigenciaInicio), fim: diaCivilBr(vigenciaFim(c.vigenciaFimInicial, movs)) },
    valorInicial: c.valorInicial.toFixed(2), valorVigente: valorAtualizado(toMoney(c.valorInicial.toFixed(2)), movs).toFixed(2),
    aditivos: c.movimentos.map((m) => ({ numero: m.numeroAditivo, tipo: m.tipo, data: diaCivilBr(m.data), valor: m.valor === null ? null : m.valor.toFixed(2), dias: m.dias })),
    responsaveis: c.designacoes.filter((d) => designacaoVigenteEm(d, agora)).map((d) => ({ papel: d.papel, nome: d.pessoa.versoes[0]?.nome ?? "não informado", ato: d.atoDesignacao, desde: diaCivilBr(d.vigenciaInicio) })),
    execucaoFisica: c.itens.map((i) => {
      const medido = i.medidos.reduce((t, m) => t.plus(m.quantidade.toFixed(4)), new Decimal(0));
      const contratado = versaoNoDia(historicos.get(i.id)!, hoje()).quantidade;
      return { item: i.numero, descricao: i.descricao, unidade: i.unidade, contratado: contratado.toFixed(4), medidoAprovado: medido.toFixed(4), percentual: pct1(medido, contratado) };
    }),
    medicoesAprovadas: { quantidade: c.medicoes.length, valor: sumMoney(c.medicoes.map((m) => m.valorMedido.toFixed(2))).toFixed(2) },
    execucaoPorOrdens: (() => {
      const ordens = c.ordensDeServico.map((o) => {
        const autorizado = sumMoney(o.itens.map((i) => toMoney(new Decimal(i.quantidade.toFixed(4)).minus(i.cancelamentos.reduce((t, x) => t.plus(x.quantidade.toFixed(4)), new Decimal(0))).times(i.valorUnitario.toFixed(4)))));
        const recebido = sumMoney(o.medicoes.flatMap((m) => m.recebimentosDefinitivos.flatMap((r) => r.itens.map((x) => x.valor.toFixed(2)))));
        return { numero: `${o.numero}/${o.ano}`, periodo: `${o.emissao === null ? "" : diaCivilBr(o.emissao.inicioAutorizado)} a ${diaCivilBr(o.fimPrevisto)}`, autorizado: autorizado.toFixed(2), recebido: recebido.toFixed(2) };
      });
      return { ordens, autorizado: sumMoney(ordens.map((o) => o.autorizado)).toFixed(2), recebido: sumMoney(ordens.map((o) => o.recebido)).toFixed(2) };
    })(),
  };
}
