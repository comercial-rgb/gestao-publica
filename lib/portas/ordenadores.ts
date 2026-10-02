import {
  declararResponsavelSiafic,
  designarOrdenador,
  encerrarDesignacaoDeOrdenador,
  type DeclararResponsavelSiaficInput,
  type DesignarOrdenadorInput,
} from "../../modules/m05-despesa/ordenador.js";
import { vigenteNoCorte } from "../../modules/m02-planejamento/declaracao-da-unidade.js";
import { diaCivilBr } from "../../packages/datas/index.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/**
 * V26 — ORDENADORES DE DESPESA E RESPONSÁVEL PELO SISTEMA, na tela. As regras (CPF, tamanhos, escopo, vigência,
 * ambiguidade) são do domínio (`modules/m05-despesa/ordenador.ts`).
 */

export interface DesignacaoNaTela {
  readonly id: string;
  readonly cpf: string;
  readonly nome: string;
  readonly escopo: string;
  readonly ato: string;
  readonly desde: string;
  readonly ate: string | null;
  readonly atoDoFim: string | null;
}

const ATO: Record<string, string> = { NOMEACAO: "Nomeação", DELEGACAO: "Delegação", SUBSTITUICAO: "Substituição" };

export async function lerOrdenadoresEResponsavel(): Promise<{
  readonly designacoes: readonly DesignacaoNaTela[];
  readonly unidades: readonly { readonly id: string; readonly rotulo: string }[];
  readonly responsavel: { readonly modalidade: string; readonly empresa: string; readonly sistema: string; readonly tecnico: string; readonly desde: string; readonly fundamento: string } | null;
}> {
  await exigirLeituraDoEnte("CONSULTAR_DESPESA");
  const prisma = cliente();
  const [ds, us, rs] = await Promise.all([
    prisma.designacaoDeOrdenador.findMany({
      orderBy: [{ vigenteDesde: "desc" }],
      select: { id: true, cpf: true, nome: true, escopo: true, tipoDoAto: true, ato: true, vigenteDesde: true, unidadeOrc: { select: { codigo: true, descricao: true } }, encerramento: { select: { vigenteAte: true, ato: true } } },
    }),
    prisma.unidadeOrcamentaria.findMany({ orderBy: { codigo: "asc" }, select: { id: true, codigo: true, descricao: true } }),
    prisma.declaracaoDoResponsavelSiafic.findMany(),
  ]);
  const v = vigenteNoCorte(rs, new Date());
  return {
    designacoes: ds.map((d) => ({
      id: d.id,
      cpf: d.cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4"),
      nome: d.nome,
      escopo: d.escopo === "ENTE" ? "Toda a despesa" : `Unidade ${d.unidadeOrc?.codigo ?? ""} ${d.unidadeOrc?.descricao ?? ""}`,
      ato: `${ATO[d.tipoDoAto] ?? d.tipoDoAto}: ${d.ato}`,
      desde: diaCivilBr(d.vigenteDesde),
      ate: d.encerramento === null ? null : diaCivilBr(d.encerramento.vigenteAte),
      atoDoFim: d.encerramento?.ato ?? null,
    })),
    unidades: us.map((u) => ({ id: u.id, rotulo: `${u.codigo} — ${u.descricao}` })),
    responsavel:
      v === null
        ? null
        : {
            modalidade: v.modalidade === "TERCEIRIZADA" ? "Manutenção terceirizada" : "Manutenção pela própria prefeitura",
            empresa: `${v.nomeEmpresa} (${v.cnpjEmpresa}) · ${v.emailEmpresa}`,
            sistema: v.denominacaoSiafic,
            tecnico: `${v.nomeResponsavelTecnico} · ${v.emailResponsavelTecnico}`,
            desde: diaCivilBr(v.vigenteDesde),
            fundamento: v.fundamento,
          },
  };
}

export async function designarOrdenadorPelaTela(input: Omit<DesignarOrdenadorInput, "criadoPor">): Promise<string> {
  await comEscritaAutenticada("DECLARAR_DADOS_DA_UNIDADE_ORCAMENTARIA", (criadoPor) => designarOrdenador(cliente(), { ...input, criadoPor }));
  return `Ordenador ${input.nome} designado. Os empenhos a partir da data levam o CPF dele.`;
}

export async function encerrarDesignacaoPelaTela(input: { readonly designacaoId: string; readonly vigenteAte: Date; readonly ato: string }): Promise<string> {
  await comEscritaAutenticada("DECLARAR_DADOS_DA_UNIDADE_ORCAMENTARIA", (criadoPor) => encerrarDesignacaoDeOrdenador(cliente(), { ...input, criadoPor }));
  return "Designação encerrada. Os empenhos depois da data deixam de levar este ordenador.";
}

export async function declararResponsavelPelaTela(input: Omit<DeclararResponsavelSiaficInput, "criadoPor">): Promise<string> {
  await comEscritaAutenticada("CADASTRAR_ENTIDADE_CONTABIL", (criadoPor) => declararResponsavelSiafic(cliente(), { ...input, criadoPor }));
  return "Responsável pelo sistema declarado. Ele vai no balancete de janeiro de cada exercício.";
}
