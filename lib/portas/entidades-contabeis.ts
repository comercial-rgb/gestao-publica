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
export async function lerContasComTitular(): Promise<readonly ContaComTitularNaTela[]> {
  await exigirLeituraDoEnte("CONSULTAR_FINANCEIRO");
  const prisma = cliente();
  const contas = await prisma.contaBancaria.findMany({
    orderBy: { codigo: "asc" },
    select: {
      id: true, codigo: true, descricao: true, banco: true, agencia: true, conta: true,
      fonte: { select: { codigo: true } },
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
    if (d === undefined) {
      return {
        id: c.id, codigo: c.codigo, descricao: c.descricao, fonteCodigo: c.fonte.codigo,
        titularNome: null, titularCodigo: null, versao: null, ato: null,
        identificacaoBancaria: identificacao,
      };
    }
    return {
      id: c.id,
      codigo: c.codigo,
      descricao: c.descricao,
      fonteCodigo: c.fonte.codigo,
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
