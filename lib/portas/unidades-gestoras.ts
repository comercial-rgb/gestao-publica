import {
  cadastrarUnidadeGestora,
  encerrarUnidadeGestora,
  ugVigenteNoDia,
  type CadastrarUnidadeGestoraInput,
} from "../../modules/m01-core-contabil/unidade-gestora.js";
import { diaCivilBr } from "../../packages/datas/index.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/**
 * V26 — AS UNIDADES GESTORAS DO ENTE, na tela. As regras (código do Tribunal, uma UG vigente por entidade, vigência)
 * são do domínio (`modules/m01-core-contabil/unidade-gestora.ts`).
 */

export const ROTULO_DA_NATUREZA_DA_UG: Readonly<Record<string, string>> = {
  CAMARA_MUNICIPAL: "Câmara Municipal",
  PREFEITURA_OU_SECRETARIA: "Prefeitura ou secretaria",
  AUTARQUIA: "Autarquia",
  FUNDACAO: "Fundação",
  SOCIEDADE_DE_ECONOMIA_MISTA: "Sociedade de economia mista",
  FUNDO: "Fundo",
  EMPRESA_PUBLICA: "Empresa pública",
  AUTARQUIA_PREVIDENCIARIA: "Autarquia previdenciária",
  FUNDO_PREVIDENCIARIO: "Fundo previdenciário",
};

export interface UgNaTela {
  readonly id: string;
  readonly codigo: string;
  readonly nome: string;
  readonly natureza: string;
  readonly escrituracao: string;
  readonly desde: string;
  readonly ate: string | null;
  readonly vigente: boolean;
  readonly fundamento: string;
}

export async function lerUnidadesGestoras(): Promise<{
  readonly ugs: readonly UgNaTela[];
  readonly entidades: readonly { readonly id: string; readonly rotulo: string }[];
}> {
  await exigirLeituraDoEnte("CONSULTAR_CONTABILIDADE");
  const prisma = cliente();
  const [ugs, entidades] = await Promise.all([
    prisma.unidadeGestora.findMany({
      orderBy: { codigoTce: "asc" },
      select: { id: true, codigoTce: true, nome: true, naturezaJuridica: true, vigenteDesde: true, fundamento: true, encerramento: { select: { vigenteAte: true, ato: true } }, entidadeContabil: { select: { codigo: true } } },
    }),
    prisma.entidadeContabil.findMany({ orderBy: { codigo: "asc" }, select: { id: true, codigo: true, versoes: { orderBy: { versao: "desc" }, take: 1, select: { nome: true } } } }),
  ]);
  const hoje = new Date();
  return {
    ugs: ugs.map((u) => ({
      id: u.id,
      codigo: u.codigoTce,
      nome: u.nome,
      natureza: ROTULO_DA_NATUREZA_DA_UG[u.naturezaJuridica] ?? u.naturezaJuridica,
      escrituracao: u.entidadeContabil === null ? "Escriturada fora deste sistema" : `Escriturada aqui (entidade ${u.entidadeContabil.codigo})`,
      desde: diaCivilBr(u.vigenteDesde),
      ate: u.encerramento === null ? null : `${diaCivilBr(u.encerramento.vigenteAte)} (${u.encerramento.ato})`,
      vigente: ugVigenteNoDia(u, hoje),
      fundamento: u.fundamento,
    })),
    entidades: entidades.map((e) => ({ id: e.id, rotulo: `${e.codigo} — ${e.versoes[0]?.nome ?? ""}` })),
  };
}

export async function cadastrarUgPelaTela(input: Omit<CadastrarUnidadeGestoraInput, "criadoPor">): Promise<string> {
  await comEscritaAutenticada("CADASTRAR_ENTIDADE_CONTABIL", (criadoPor) => cadastrarUnidadeGestora(cliente(), { ...input, criadoPor }));
  return `Unidade gestora ${input.codigoTce} cadastrada.`;
}

export async function encerrarUgPelaTela(input: { readonly ugId: string; readonly vigenteAte: Date; readonly ato: string }): Promise<string> {
  await comEscritaAutenticada("CADASTRAR_ENTIDADE_CONTABIL", (criadoPor) => encerrarUnidadeGestora(cliente(), { ...input, criadoPor }));
  return "Unidade gestora encerrada a partir do dia seguinte ao informado.";
}
