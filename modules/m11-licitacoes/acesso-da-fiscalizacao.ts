import { z } from "zod";
import { diaCivil, inicioDoDiaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { pessoaDoUsuario } from "../m16-travamento/servico-pessoa-do-usuario.js";
import { designacaoVigenteEm, type DesignacaoParaVigencia } from "../m33-folha/certificacao.js";

/**
 * ═══ M11 — QUEM ALCANÇA O CONTRATO, E EM QUAL PROJEÇÃO (V7 M2, U0.1) ═══
 *
 * O DEFEITO QUE ISTO FECHA: o dossiê do contrato acompanhado (agenda, ocorrências, evidências) era lido por
 * qualquer um com `CONSULTAR_LICITACOES`, e a evidência de fiscalização se baixava pela mesma leitura. O TR pede
 * o contrário (5.21.16: "apenas fiscais e gestores do próprio contrato possam acessá-lo"; 5.21.17: os
 * administradores da fiscalização acessam qualquer contrato).
 *
 * TRÊS PROJEÇÕES, e uma não herda a regra da outra:
 *   · FISCALIZAÇÃO — o dossiê privado (agenda, ocorrências e evidências, conferências, termos). Alcança quem tem
 *     designação VIGENTE HOJE naquele contrato (gestor, fiscal ou recebedor definitivo) ou uma definição vigente de
 *     administrador da fiscalização. Revogar tira o alcance atual; os atos anteriores continuam com o autor e a
 *     designação usada, e o SUCESSOR designado vê o histórico do contrato (o alcance é do contrato, não do autor).
 *   · FINANCEIRA — o que a contabilidade e a tesouraria precisam para empenhar, liquidar e pagar: contrato, itens e
 *     saldos, ordens, valores medidos, aceitos e liquidados e os termos que lastreiam a liquidação. Alcança quem lê
 *     licitações ou despesa, ou pratica empenho, liquidação ou pagamento. NÃO leva ocorrência nem evidência.
 *   · PÚBLICA — a do domínio (`projecaoPublicaDoContrato`), escolhida campo a campo, sem sessão.
 *
 * ⚠️ PERMISSÃO GLOBAL DE OUTRA ÁREA NÃO É ADMINISTRAÇÃO DA FISCALIZAÇÃO. E ter a ação de DEFINIR administrador não
 * dá o alcance: o administrador da plataforma que precisa ver o dossiê define a si mesmo, com ato — e isso fica.
 *
 * ⚠️ É DECISÃO PURA sobre fatos lidos (`decidirAlcance`): a mesma para página, anexo, PDF e comando, e provada por
 * mutação sem banco.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export type PapelNoContrato = "GESTOR" | "FISCAL" | "RECEBEDOR_DEFINITIVO";

export type CodigoDoAlcance =
  | "USUARIO-INATIVO"
  | "DESIGNADO-NO-CONTRATO"
  | "ADMINISTRADOR-DA-FISCALIZACAO"
  | "SEM-DESIGNACAO-VIGENTE";

/** As ações que dão a projeção FINANCEIRA — ler licitações ou despesa, ou praticar a cadeia da despesa. */
export const ACOES_DA_PROJECAO_FINANCEIRA = ["CONSULTAR_LICITACOES", "CONSULTAR_DESPESA", "EMPENHAR", "LIQUIDAR", "PAGAR"] as const;

export interface FatosDoAlcance {
  readonly ativo: boolean;
  readonly designacoes: readonly (DesignacaoParaVigencia & { readonly papel: PapelNoContrato })[];
  readonly administracoes: readonly DesignacaoParaVigencia[];
  /** Tem alguma das `ACOES_DA_PROJECAO_FINANCEIRA`, em qualquer escopo. */
  readonly acaoFinanceira: boolean;
}

export interface AlcanceNoContrato {
  readonly fiscalizacao: boolean;
  readonly financeira: boolean;
  readonly codigo: CodigoDoAlcance;
  /** Os papéis vigentes hoje neste contrato (vazio para o administrador sem designação). */
  readonly papeis: readonly PapelNoContrato[];
  readonly motivo: string;
}

export function decidirAlcance(f: FatosDoAlcance, agora: Date): AlcanceNoContrato {
  if (!f.ativo) {
    return { fiscalizacao: false, financeira: false, codigo: "USUARIO-INATIVO", papeis: [], motivo: "A conta não existe ou está desativada." };
  }
  const papeis = [...new Set(f.designacoes.filter((d) => designacaoVigenteEm(d, agora)).map((d) => d.papel))].sort();
  if (papeis.length > 0) {
    return { fiscalizacao: true, financeira: f.acaoFinanceira, codigo: "DESIGNADO-NO-CONTRATO", papeis, motivo: `Designação vigente neste contrato: ${papeis.join(", ").toLowerCase()}.` };
  }
  if (f.administracoes.some((a) => designacaoVigenteEm(a, agora))) {
    return { fiscalizacao: true, financeira: f.acaoFinanceira, codigo: "ADMINISTRADOR-DA-FISCALIZACAO", papeis: [], motivo: "Definição vigente de administrador da fiscalização de contratos." };
  }
  return {
    fiscalizacao: false,
    financeira: f.acaoFinanceira,
    codigo: "SEM-DESIGNACAO-VIGENTE",
    papeis: [],
    motivo: "A fiscalização deste contrato é visível a quem está designado nele (gestor, fiscal ou recebedor) ou foi definido administrador da fiscalização.",
  };
}

/** Os fatos do alcance, lidos na transação (ou fora dela, numa leitura). */
export async function alcanceNoContrato(tx: Tx, usuarioIdent: string, contratoId: string, agora: Date = new Date()): Promise<AlcanceNoContrato> {
  const u = await tx.usuario.findUnique({
    where: { identificador: usuarioIdent },
    select: {
      ativo: true,
      designacoesNoContrato: { where: { contratoId }, select: { papel: true, vigenciaInicio: true, vigenciaFim: true, revogacao: { select: { dataEfeito: true } } } },
      administracoesDaFiscalizacao: { select: { vigenciaInicio: true, vigenciaFim: true, revogacao: { select: { dataEfeito: true } } } },
      vinculos: { select: { perfil: { select: { permissoes: { where: { acao: { in: [...ACOES_DA_PROJECAO_FINANCEIRA] } }, select: { id: true }, take: 1 } } } } },
    },
  });
  if (u === null) return decidirAlcance({ ativo: false, designacoes: [], administracoes: [], acaoFinanceira: false }, agora);
  return decidirAlcance(
    {
      ativo: u.ativo,
      designacoes: u.designacoesNoContrato.map((d) => ({ ...d, papel: d.papel as PapelNoContrato })),
      administracoes: u.administracoesDaFiscalizacao,
      acaoFinanceira: u.vinculos.some((v) => v.perfil.permissoes.length > 0),
    },
    agora
  );
}

/**
 * OS CONTRATOS NA VISÃO DE FISCALIZAÇÃO DO USUÁRIO — os de designação vigente hoje; todos, para o administrador
 * da fiscalização vigente. É o recorte da lista "minhas fiscalizações": nenhum contrato fora dele aparece, nem
 * como contagem.
 */
export async function contratosNoAlcanceDaFiscalizacao(tx: Tx, usuarioIdent: string, agora: Date = new Date()): Promise<{ readonly todos: boolean; readonly ids: readonly string[] }> {
  const u = await tx.usuario.findUnique({
    where: { identificador: usuarioIdent },
    select: {
      ativo: true,
      designacoesNoContrato: { select: { contratoId: true, vigenciaInicio: true, vigenciaFim: true, revogacao: { select: { dataEfeito: true } } } },
      administracoesDaFiscalizacao: { select: { vigenciaInicio: true, vigenciaFim: true, revogacao: { select: { dataEfeito: true } } } },
    },
  });
  if (u === null || !u.ativo) return { todos: false, ids: [] };
  if (u.administracoesDaFiscalizacao.some((a) => designacaoVigenteEm(a, agora))) return { todos: true, ids: [] };
  return { todos: false, ids: [...new Set(u.designacoesNoContrato.filter((d) => designacaoVigenteEm(d, agora)).map((d) => d.contratoId))] };
}

const zDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A data é um DIA civil AAAA-MM-DD.");

export const zDefinirAdministradorDaFiscalizacao = z.object({
  usuarioIdentificador: z.string().min(1),
  atoDesignacao: z.string().trim().min(3),
  vigenciaInicio: zDia,
  vigenciaFim: zDia.optional(),
  criadoPor: z.string().min(1),
});
export type DefinirAdministradorDaFiscalizacaoInput = z.input<typeof zDefinirAdministradorDaFiscalizacao>;

/** DEFINIR o administrador da fiscalização (5.21.17) — pessoa do vínculo, ato e vigência; fato com autor. */
export async function definirAdministradorDaFiscalizacao(prisma: PrismaClient, input: DefinirAdministradorDaFiscalizacaoInput): Promise<{ readonly administradorId: string }> {
  const d = zDefinirAdministradorDaFiscalizacao.parse(input);
  if (d.vigenciaFim !== undefined && d.vigenciaFim < d.vigenciaInicio) throw new Error("VIGENCIA-INVERTIDA: o fim da definição é anterior ao início. Nada foi gravado.");
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.definirAdministradorDaFiscalizacao, "ENTE");
    const usuario = await tx.usuario.findUnique({ where: { identificador: d.usuarioIdentificador }, select: { id: true, ativo: true } });
    if (usuario === null) throw new Error(`Usuário ${d.usuarioIdentificador} não existe. Nada foi gravado.`);
    if (!usuario.ativo) throw new Error(`USUARIO-DESATIVADO: ${d.usuarioIdentificador} está desativado. Nada foi gravado.`);
    const pessoa = await pessoaDoUsuario(tx, d.usuarioIdentificador);
    if (pessoa === null) throw new Error(`USUARIO-SEM-PESSOA: a conta ${d.usuarioIdentificador} não está vinculada a uma pessoa do cadastro; a definição nomeia uma pessoa. Nada foi gravado.`);
    const r = await tx.administradorDaFiscalizacao.create({
      data: {
        usuarioId: usuario.id, pessoaId: pessoa.pessoaId, atoDesignacao: d.atoDesignacao,
        vigenciaInicio: inicioDoDiaCivil(d.vigenciaInicio), vigenciaFim: d.vigenciaFim === undefined ? null : inicioDoDiaCivil(d.vigenciaFim), criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { administradorId: r.id };
  });
}

export const zRevogarAdministradorDaFiscalizacao = z.object({ administradorId: z.string().min(1), dataEfeito: zDia, motivo: z.string().trim().min(5), criadoPor: z.string().min(1) });
export type RevogarAdministradorDaFiscalizacaoInput = z.input<typeof zRevogarAdministradorDaFiscalizacao>;

/** Revogar é fato: o alcance cessa no efeito; o que foi feito antes continua com o autor. */
export async function revogarAdministradorDaFiscalizacao(prisma: PrismaClient, input: RevogarAdministradorDaFiscalizacaoInput): Promise<{ readonly revogacaoId: string }> {
  const d = zRevogarAdministradorDaFiscalizacao.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.revogarAdministradorDaFiscalizacao, "ENTE");
      const a = await tx.administradorDaFiscalizacao.findUnique({ where: { id: d.administradorId }, select: { id: true, vigenciaInicio: true, revogacao: { select: { id: true } } } });
      if (a === null) throw new Error(`Definição ${d.administradorId} não existe. Nada foi gravado.`);
      if (a.revogacao !== null) throw new Error("DEFINICAO-JA-REVOGADA: esta definição de administrador já foi revogada. Nada foi gravado.");
      if (d.dataEfeito < diaCivil(a.vigenciaInicio)) throw new Error("REVOGACAO-ANTES-DO-INICIO: o efeito é anterior ao início da definição. Nada foi gravado.");
      const r = await tx.revogacaoDeAdministradorDaFiscalizacao.create({ data: { administradorId: a.id, dataEfeito: inicioDoDiaCivil(d.dataEfeito), motivo: d.motivo, criadoPor: d.criadoPor }, select: { id: true } });
      return { revogacaoId: r.id };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new Error("DEFINICAO-JA-REVOGADA: outra revogação foi gravada no mesmo instante. Nada foi gravado.");
    throw e;
  }
}
