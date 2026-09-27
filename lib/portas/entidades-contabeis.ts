import {
  cadastrarEntidadeContabil,
  declararTitularDaContaBancaria,
  entidadesContabeis,
  publicarVersaoDaEntidadeContabil,
  titularVigenteDaConta,
  type EntidadeNaLista,
} from "../../modules/m01-core-contabil/entidade-contabil.js";
import {
  CODIGOS_TIPO_MANAD,
  TIPO_MANAD,
} from "../../modules/m01-core-contabil/tipo-manad.js";
import {
  rotuloDoAto,
  TIPOS_DE_ATO,
  type TipoDeAtoDeclarado,
} from "../../modules/m01-core-contabil/ato-declarado.js";
import { cliente } from "./cliente";
import {
  acrescentarFonteAoRol as acrescentarNoRolDoDominio,
  removerFonteDoRol as removerDoRolDoDominio,
} from "../../modules/m09-tesouraria/rol-de-fontes";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/**
 * ═══ A ENTIDADE CONTÁBIL NA TELA (V11 V9) ═══
 *
 * ⚠️ NENHUMA REGRA AQUI. O rol MANAD, a régua do ato e a versão vigente são do domínio, dentro
 * da transação. Esta porta resolve a sessão, traduz para a tela e devolve a mensagem que o
 * domínio escreveu — ela não reescreve recusa nenhuma, porque a recusa do domínio é a que nomeia
 * o motivo e o que fazer.
 *
 * ⚠️ O `agora` VEM DAQUI, e é `new Date()` de verdade. O domínio recebe o instante por parâmetro
 * para poder ser testado em qualquer data; quem tem o relógio é a borda.
 */

export interface EntidadeNaTela extends EntidadeNaLista {
  /** Quantas contas bancárias têm ESTA entidade como titular vigente. */
  readonly contas: number;
}

/** O vocabulário do formulário — o rol oficial, nunca dois dígitos de cabeça. */
export const TIPOS_DE_ENTIDADE: readonly { readonly codigo: string; readonly rotulo: string }[] =
  CODIGOS_TIPO_MANAD.map((c) => ({ codigo: c, rotulo: TIPO_MANAD[c]! }));

export const TIPOS_DE_ATO_NA_TELA: readonly { readonly codigo: TipoDeAtoDeclarado; readonly rotulo: string }[] =
  (Object.keys(TIPOS_DE_ATO) as TipoDeAtoDeclarado[]).map((c) => ({ codigo: c, rotulo: TIPOS_DE_ATO[c] }));

export async function lerEntidadesContabeis(): Promise<readonly EntidadeNaTela[]> {
  await exigirLeituraDoEnte("CONSULTAR_CONTABILIDADE");
  const prisma = cliente();
  const linhas = await entidadesContabeis(prisma);

  /**
   * ⚠️ A CONTAGEM DE CONTAS ENTRA PORQUE ELA MUDA O QUE A PESSOA ENTENDE. Uma entidade sem conta
   * bancária nenhuma não vai receber carimbo em guia alguma — ela existe no cadastro e não
   * aparece em consulta de arrecadação. Sem este número, quem cadastrou a entidade e não a vê na
   * consulta conclui que o sistema está errado, quando o que falta é declarar a conta dela.
   */
  const contagem = new Map<string, number>();
  for (const e of linhas) {
    const n = await prisma.contaBancaria.count({
      where: { declaracoesDeTitular: { some: { entidadeId: e.id } } },
    });
    contagem.set(e.id, n);
  }
  return linhas.map((e) => ({ ...e, contas: contagem.get(e.id) ?? 0 }));
}

export interface ContaComTitularNaTela {
  readonly id: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly fonteCodigo: string;
  /**
   * V16 (TR 5.10.2.6) — as fontes que esta conta COMPORTA. Quando o rol não foi declarado, a
   * lista traz a fonte PADRÃO com a ressalva escrita: é o que o guard do movimento admite, e a
   * tela não pode prometer mais do que o servidor aceita.
   */
  readonly fontesDoRol: readonly { readonly codigo: string; readonly descricao: string }[];
  /** `false` = o rol não foi declarado e vale o fallback da fonte padrão. */
  readonly rolDeclarado: boolean;
  /** `null` = ainda não declarada. A tela NOMEIA a consequência disso. */
  readonly titularNome: string | null;
  readonly titularCodigo: string | null;
  readonly versao: number | null;
  readonly ato: string | null;
  /** A identificação bancária, quando cadastrada — é o segundo ancoradouro do ato. */
  readonly identificacaoBancaria: string | null;
}

/**
 * AS CONTAS COM O TITULAR VIGENTE DE CADA UMA.
 *
 * ⚠️ AS CONTAS SEM TITULAR APARECEM, E NO TOPO NÃO — NA MESMA LISTA. Separá-las numa aba
 * "pendências" faria a maioria das instalações abrir a tela e ver uma lista vazia de titulares,
 * como se não houvesse nada a fazer. Elas aparecem com a consequência escrita ao lado: as guias
 * que entram nelas ficam NÃO ATRIBUÍDAS.
 */
/**
 * O ROL DE FONTES DA CONTA — os dois atos (TR 5.10.2.6, pendência `ROL-DE-FONTES-UI` fechada).
 *
 * ⚠️ A AUTORIZAÇÃO É PRÓPRIA (`GERIR_ROL_DE_FONTES_DA_CONTA`) e não acompanha a do titular: o
 * titular diz de QUEM é a conta; o rol diz que RECURSO ela abriga, e é ele que o guard do
 * movimento consulta. As recusas (a última fonte não sai, a padrão não sai, repetida não entra)
 * são do domínio, e a mensagem delas sobe inteira.
 */
export async function acrescentarFonteAoRol(p: {
  readonly contaCodigo: string;
  readonly fonteCodigo: string;
}): Promise<string> {
  const r = await comEscritaAutenticada("GERIR_ROL_DE_FONTES_DA_CONTA", (criadoPor) =>
    acrescentarNoRolDoDominio(cliente(), { ...p, criadoPor })
  );
  return `A conta ${r.codigoDaConta} passa a comportar as fontes ${r.fontes.join(", ")}.`;
}

export async function removerFonteDoRolDaConta(p: {
  readonly contaCodigo: string;
  readonly fonteCodigo: string;
}): Promise<string> {
  const r = await comEscritaAutenticada("GERIR_ROL_DE_FONTES_DA_CONTA", (criadoPor) =>
    removerDoRolDoDominio(cliente(), { ...p, criadoPor })
  );
  return `A conta ${r.codigoDaConta} passa a comportar as fontes ${r.fontes.join(", ")}.`;
}

export async function lerContasComTitular(): Promise<readonly ContaComTitularNaTela[]> {
  await exigirLeituraDoEnte("CONSULTAR_FINANCEIRO");
  const prisma = cliente();
  const contas = await prisma.contaBancaria.findMany({
    orderBy: { codigo: "asc" },
    select: {
      id: true, codigo: true, descricao: true, banco: true, agencia: true, conta: true,
      fonte: { select: { codigo: true } },
      // V16 (TR 5.10.2.6) — o ROL de fontes da conta. Rol vazio cai para a fonte PADRÃO, a mesma
      // regra do guard do movimento: a tela não pode prometer mais do que o servidor aceita.
      fontesPermitidas: {
        orderBy: { fonte: { codigo: "asc" } },
        select: { fonte: { select: { codigo: true, descricao: true } } },
      },
      declaracoesDeTitular: {
        orderBy: { versao: "desc" },
        take: 1,
        select: {
          versao: true, atoTipo: true, atoNumero: true, atoAno: true, atoDispositivo: true,
          entidade: {
            select: {
              codigo: true,
              versoes: { orderBy: { versao: "desc" }, take: 1, select: { nome: true } },
            },
          },
        },
      },
    },
  });

  return contas.map((c) => {
    const d = c.declaracoesDeTitular[0];
    const identificacao =
      c.banco !== null && c.agencia !== null && c.conta !== null
        ? `banco ${c.banco}, agência ${c.agencia}, conta ${c.conta}`
        : null;
    const rol =
      c.fontesPermitidas.length > 0
        ? c.fontesPermitidas.map((f) => ({ codigo: f.fonte.codigo, descricao: f.fonte.descricao }))
        : [{ codigo: c.fonte.codigo, descricao: "(fonte padrão — o rol não foi declarado)" }];
    if (d === undefined) {
      return {
        id: c.id, codigo: c.codigo, descricao: c.descricao, fonteCodigo: c.fonte.codigo,
        fontesDoRol: rol,
        rolDeclarado: c.fontesPermitidas.length > 0,
        titularNome: null, titularCodigo: null, versao: null, ato: null,
        identificacaoBancaria: identificacao,
      };
    }
    return {
      id: c.id,
      codigo: c.codigo,
      descricao: c.descricao,
      fonteCodigo: c.fonte.codigo,
      fontesDoRol: rol,
      rolDeclarado: c.fontesPermitidas.length > 0,
      titularNome: d.entidade.versoes[0]?.nome ?? d.entidade.codigo,
      titularCodigo: d.entidade.codigo,
      versao: d.versao,
      ato: rotuloDoAto({
        atoTipo: d.atoTipo,
        atoNumero: d.atoNumero,
        atoAno: d.atoAno,
        atoDispositivo: d.atoDispositivo,
        atoCitacao: "",
      }),
      identificacaoBancaria: identificacao,
    };
  });
}

/** De quem é uma conta HOJE — a mesma projeção que a arrecadação usa para carimbar. */
export async function lerTitularVigente(contaBancariaId: string): Promise<{
  readonly nome: string;
  readonly codigo: string;
} | null> {
  await exigirLeituraDoEnte("CONSULTAR_FINANCEIRO");
  const t = await titularVigenteDaConta(cliente(), contaBancariaId);
  return t === null ? null : { nome: t.nome, codigo: t.codigo };
}

// ── ESCRITAS ────────────────────────────────────────────────────────────────────────────────

export interface AtoDoFormulario {
  readonly atoTipo: TipoDeAtoDeclarado;
  readonly atoNumero: string;
  readonly atoAno: number;
  readonly atoDispositivo: string;
  readonly atoCitacao: string;
}

export async function cadastrarEntidade(input: {
  readonly codigo: string;
  readonly nome: string;
  readonly cnpj?: string | undefined;
  readonly tipoManad: string;
  readonly ato: AtoDoFormulario;
}): Promise<string> {
  return comEscritaAutenticada("CADASTRAR_ENTIDADE_CONTABIL", async (criadoPor) => {
    const r = await cadastrarEntidadeContabil(
      cliente(),
      {
        codigo: input.codigo,
        nome: input.nome,
        ...(input.cnpj !== undefined && input.cnpj !== "" ? { cnpj: input.cnpj } : {}),
        tipoManad: input.tipoManad,
        ...input.ato,
        criadoPor,
      },
      new Date()
    );
    return r.entidadeId;
  });
}

export async function publicarVersaoDaEntidade(input: {
  readonly entidadeId: string;
  readonly nome: string;
  readonly cnpj?: string | undefined;
  readonly tipoManad: string;
  readonly ato: AtoDoFormulario;
}): Promise<number> {
  return comEscritaAutenticada("CADASTRAR_ENTIDADE_CONTABIL", async (criadoPor) => {
    const r = await publicarVersaoDaEntidadeContabil(
      cliente(),
      {
        entidadeId: input.entidadeId,
        nome: input.nome,
        ...(input.cnpj !== undefined && input.cnpj !== "" ? { cnpj: input.cnpj } : {}),
        tipoManad: input.tipoManad,
        ...input.ato,
        criadoPor,
      },
      new Date()
    );
    return r.versao;
  });
}

export async function declararTitular(input: {
  readonly contaBancariaId: string;
  readonly entidadeId: string;
  readonly ato: AtoDoFormulario;
}): Promise<number> {
  return comEscritaAutenticada("DECLARAR_TITULAR_DA_CONTA_BANCARIA", async (criadoPor) => {
    const r = await declararTitularDaContaBancaria(
      cliente(),
      {
        contaBancariaId: input.contaBancariaId,
        entidadeId: input.entidadeId,
        ...input.ato,
        criadoPor,
      },
      new Date()
    );
    return r.versao;
  });
}
