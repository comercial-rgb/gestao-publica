import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";

/**
 * V32 — O ROTEIRO DE PRECATÓRIO E DE CONVÊNIO DECLARADO PELO ENTE.
 *
 * ⚠️ O QUE ISTO FECHA. `RoteiroPrecatorio` e `RoteiroConvenio` existiam, fail-closed, e só os testes os
 * escreviam: numa instalação limpa, inscrever, atualizar e cancelar precatório, e aprovar, glosar e
 * devolver convênio, eram recusados — e a recusa mandava "cadastrar o roteiro" num lugar que não existia.
 *
 * ⚠️ NENHUMA CONTA NO CÓDIGO. O contador escolhe as contas do plano carregado, com fundamento. O serviço só
 * confere o que tornaria o lançamento impossível ou enganoso: a conta existe, é analítica, débito ≠ crédito,
 * e as duas são do SUBSISTEMA em que o movimento lança (precatório no patrimonial, classes 1 a 4; convênio
 * no de controle, classes 7 e 8) — sem isso o lançamento seria recusado no ato, longe da causa.
 *
 * ⚠️ APPEND-ONLY. Uma versão nova vale para os próximos movimentos; os lançados guardam as contas que usaram.
 * A tabela antiga segue valendo enquanto não houver declaração (`roteiroPatrimonialVigente` cai nela).
 */

export type FamiliaDoRoteiro = "PRECATORIO" | "CONVENIO" | "ADIANTAMENTO" | "PERDAS_DIVIDA_ATIVA" | "APROPRIACAO_PESSOAL" | "MULTA_DE_TRANSITO" | "CONTRATO";

interface DefinicaoDaFamilia {
  readonly rotulo: string;
  readonly subsistema: "PATRIMONIAL" | "CONTROLE";
  readonly classes: readonly string[];
  readonly chaves: readonly { readonly chave: string; readonly rotulo: string }[];
}

export const FAMILIAS_DE_ROTEIRO: Readonly<Record<FamiliaDoRoteiro, DefinicaoDaFamilia>> = {
  PRECATORIO: {
    rotulo: "Precatórios",
    subsistema: "PATRIMONIAL",
    classes: ["1", "2", "3", "4"],
    chaves: [
      { chave: "INSCRICAO", rotulo: "Inscrição do precatório (reconhecimento do passivo)" },
      { chave: "ATUALIZACAO", rotulo: "Atualização (juros e correção do período)" },
      { chave: "CANCELAMENTO", rotulo: "Cancelamento por decisão judicial" },
    ],
  },
  CONVENIO: {
    rotulo: "Convênios",
    subsistema: "CONTROLE",
    classes: ["7", "8"],
    chaves: [
      { chave: "PRESTACAO_APROVADA/CONCEDENTE", rotulo: "Prestação de contas aprovada — o ente concede" },
      { chave: "GLOSA/CONCEDENTE", rotulo: "Glosa — o ente concede" },
      { chave: "DEVOLUCAO/CONCEDENTE", rotulo: "Devolução — o ente concede" },
      { chave: "PRESTACAO_APROVADA/CONVENENTE", rotulo: "Prestação de contas aprovada — o ente recebe" },
      { chave: "GLOSA/CONVENENTE", rotulo: "Glosa — o ente recebe" },
      { chave: "DEVOLUCAO/CONVENENTE", rotulo: "Devolução — o ente recebe" },
    ],
  },
  // V32 — as contas de controle dos empenhos que geram adiantamento: lançadas na concessão, baixadas na aprovação.
  ADIANTAMENTO: {
    rotulo: "Diárias e suprimento de fundos",
    subsistema: "CONTROLE",
    classes: ["7", "8"],
    chaves: [
      { chave: "CONCESSAO/DIARIA", rotulo: "Concessão de diária (responsabilidade a comprovar)" },
      { chave: "BAIXA/DIARIA", rotulo: "Prestação de contas da diária aprovada" },
      { chave: "CONCESSAO/SUPRIMENTO_DE_FUNDOS", rotulo: "Concessão de suprimento de fundos (responsabilidade a comprovar)" },
      { chave: "BAIXA/SUPRIMENTO_DE_FUNDOS", rotulo: "Prestação de contas do suprimento aprovada" },
    ],
  },
  // V35 — o ajuste para perdas da dívida ativa (MCASP 11ª ed., Parte III, 5.2.5): constituição D VPD 3.6.1.7 / C retificadora
  // (1.1.2.9 curto prazo ou 1.2.1.1.1.99 longo prazo); reversão D retificadora / C VPA 4.9.7.2.
  PERDAS_DIVIDA_ATIVA: {
    rotulo: "Ajuste para perdas da dívida ativa",
    subsistema: "PATRIMONIAL",
    classes: ["1", "3", "4"],
    chaves: [
      { chave: "CONSTITUICAO/TRIBUTARIA", rotulo: "Constituição ou aumento do ajuste — dívida ativa tributária" },
      { chave: "REVERSAO/TRIBUTARIA", rotulo: "Reversão do ajuste — dívida ativa tributária" },
      { chave: "CONSTITUICAO/NAO_TRIBUTARIA", rotulo: "Constituição ou aumento do ajuste — dívida ativa não tributária" },
      { chave: "REVERSAO/NAO_TRIBUTARIA", rotulo: "Reversão do ajuste — dívida ativa não tributária" },
    ],
  },
  // V35 — a apropriação mensal do 13º e das férias (MCASP 11ª ed., Parte II, item 18): D VPD 3.1.1 / C pessoal a pagar 2.1.1.1.
  APROPRIACAO_PESSOAL: {
    rotulo: "Apropriação mensal do 13º e das férias",
    subsistema: "PATRIMONIAL",
    classes: ["2", "3"],
    chaves: [
      { chave: "APROPRIACAO/DECIMO_TERCEIRO", rotulo: "Duodécimo do 13º salário (VPD contra pessoal a pagar)" },
      { chave: "APROPRIACAO/FERIAS", rotulo: "Duodécimo das férias e do abono constitucional (VPD contra férias a pagar)" },
      // V35 — os encargos patronais sobre o 13º e as férias (MCASP 18.3): D VPD 3.1.2 / C encargos sociais a pagar 2.1.1.4 (P).
      { chave: "APROPRIACAO/ENCARGOS_DECIMO_TERCEIRO", rotulo: "Encargos patronais sobre o 13º apropriado (VPD contra encargos a pagar)" },
      { chave: "APROPRIACAO/ENCARGOS_FERIAS", rotulo: "Encargos patronais sobre as férias apropriadas (VPD contra encargos a pagar)" },
    ],
  },
  // V36 — o controle das multas de trânsito dos veículos da frota (modules/m36-frota/multas.ts): lançado no registro da
  // notificação, baixado quando a multa é paga, ressarcida, cancelada ou anulada por registro indevido.
  MULTA_DE_TRANSITO: {
    rotulo: "Multas de trânsito",
    subsistema: "CONTROLE",
    classes: ["7", "8"],
    chaves: [
      { chave: "REGISTRO", rotulo: "Registro da multa de trânsito notificada (controle até a baixa)" },
      { chave: "BAIXA", rotulo: "Baixa da multa (paga, ressarcida pelo infrator, cancelada ou registro indevido)" },
    ],
  },
  // V39-031 (AUD-118 a 121) — o controle dos contratos no subsistema de controle. As CHAVES são os fatos que o M11 já
  // registra (o contrato cadastrado com o valor inicial, o aditivo de acréscimo e o de supressão, e a execução que a
  // liquidação da parcela baixa). As CONTAS são do contador, do plano carregado, com fundamento: nenhuma vem do código.
  // O estorno de um movimento NÃO tem chave: ele inverte as contas do lançamento original, nunca relê a versão vigente.
  CONTRATO: {
    rotulo: "Controle de contratos",
    subsistema: "CONTROLE",
    classes: ["7", "8"],
    chaves: [
      { chave: "REGISTRO", rotulo: "Registro do contrato pelo valor inicial (a executar)" },
      { chave: "ACRESCIMO", rotulo: "Aditivo de acréscimo de valor" },
      { chave: "SUPRESSAO", rotulo: "Aditivo de supressão de valor" },
      { chave: "EXECUCAO", rotulo: "Execução do contrato (baixa do a executar pela liquidação)" },
    ],
  },
};

type TxDeLeitura = Pick<PrismaClient, "roteiroPatrimonialDeclarado" | "contaPcasp">;

export interface RoteiroResolvido {
  readonly contaDebito: { readonly id: string };
  readonly contaCredito: { readonly id: string };
  readonly historicoPadrao: string;
  /** V39-R2 (R2-008) — a versão declarada que resolveu o roteiro: o fato que lança a guarda. */
  readonly versao: number;
}

/**
 * O roteiro DECLARADO vigente para (família, chave), já com os ids das contas — ou `null` se não houver
 * declaração (aí o chamador cai na tabela antiga, e na recusa se ela também não tiver).
 */
export async function roteiroPatrimonialVigente(tx: TxDeLeitura, familia: FamiliaDoRoteiro, chave: string): Promise<RoteiroResolvido | null> {
  const r = await tx.roteiroPatrimonialDeclarado.findFirst({
    where: { familia, chave },
    orderBy: { versao: "desc" },
    select: { contaDebitoCodigo: true, contaCreditoCodigo: true, historicoPadrao: true, versao: true },
  });
  if (r === null) return null;
  const contas = await tx.contaPcasp.findMany({ where: { codigo: { in: [r.contaDebitoCodigo, r.contaCreditoCodigo] } }, select: { id: true, codigo: true } });
  const id = (codigo: string): string => {
    const c = contas.find((x) => x.codigo === codigo);
    if (c === undefined) throw new Error(`A conta ${codigo} do roteiro declarado de ${familia} (${chave}) não está mais no plano carregado. Declare o roteiro de novo. Nada foi gravado.`);
    return c.id;
  };
  return { contaDebito: { id: id(r.contaDebitoCodigo) }, contaCredito: { id: id(r.contaCreditoCodigo) }, historicoPadrao: r.historicoPadrao, versao: r.versao };
}

export interface RoteiroNaLista {
  readonly familia: FamiliaDoRoteiro;
  readonly chave: string;
  readonly rotulo: string;
  readonly contaDebitoCodigo: string | null;
  readonly contaCreditoCodigo: string | null;
  readonly historicoPadrao: string | null;
  readonly fundamento: string | null;
  readonly versao: number | null;
  readonly criadoPor: string | null;
  /** DECLARADO pela tela; ANTERIOR na tabela antiga (seed ou carga); PENDENTE: o movimento é recusado. */
  readonly situacao: "DECLARADO" | "ANTERIOR" | "PENDENTE";
}

/** Todos os movimentos que precisam de roteiro, com o que vale hoje para cada um. Leitura pura. */
export async function listarRoteirosPatrimoniais(prisma: PrismaClient): Promise<readonly RoteiroNaLista[]> {
  const [declarados, precatorio, convenio] = await Promise.all([
    prisma.roteiroPatrimonialDeclarado.findMany({
      orderBy: [{ familia: "asc" }, { chave: "asc" }, { versao: "desc" }],
      select: { familia: true, chave: true, contaDebitoCodigo: true, contaCreditoCodigo: true, historicoPadrao: true, fundamento: true, versao: true, criadoPor: true },
    }),
    prisma.roteiroPrecatorio.findMany({ select: { tipo: true, historicoPadrao: true, contaDebito: { select: { codigo: true } }, contaCredito: { select: { codigo: true } } } }),
    prisma.roteiroConvenio.findMany({ select: { tipo: true, papelDoEnte: true, historicoPadrao: true, contaDebito: { select: { codigo: true } }, contaCredito: { select: { codigo: true } } } }),
  ]);
  const anteriores = new Map<string, { d: string; c: string; h: string }>([
    ...precatorio.map((r) => [`PRECATORIO|${r.tipo}`, { d: r.contaDebito.codigo, c: r.contaCredito.codigo, h: r.historicoPadrao }] as const),
    ...convenio.map((r) => [`CONVENIO|${r.tipo}/${r.papelDoEnte}`, { d: r.contaDebito.codigo, c: r.contaCredito.codigo, h: r.historicoPadrao }] as const),
  ]);
  const linhas: RoteiroNaLista[] = [];
  for (const familia of Object.keys(FAMILIAS_DE_ROTEIRO) as FamiliaDoRoteiro[]) {
    for (const { chave, rotulo } of FAMILIAS_DE_ROTEIRO[familia].chaves) {
      const dec = declarados.find((x) => x.familia === familia && x.chave === chave);
      const ant = anteriores.get(`${familia}|${chave}`);
      linhas.push(
        dec !== undefined
          ? { familia, chave, rotulo, contaDebitoCodigo: dec.contaDebitoCodigo, contaCreditoCodigo: dec.contaCreditoCodigo, historicoPadrao: dec.historicoPadrao, fundamento: dec.fundamento, versao: dec.versao, criadoPor: dec.criadoPor, situacao: "DECLARADO" }
          : ant !== undefined
            ? { familia, chave, rotulo, contaDebitoCodigo: ant.d, contaCreditoCodigo: ant.c, historicoPadrao: ant.h, fundamento: null, versao: null, criadoPor: null, situacao: "ANTERIOR" }
            : { familia, chave, rotulo, contaDebitoCodigo: null, contaCreditoCodigo: null, historicoPadrao: null, fundamento: null, versao: null, criadoPor: null, situacao: "PENDENTE" }
      );
    }
  }
  return linhas;
}

export const zDeclararRoteiroPatrimonial = z.object({
  // V39 — o rol vem do mapa: uma família nova no mapa entra aqui sem segunda lista para esquecer.
  familia: z.enum(Object.keys(FAMILIAS_DE_ROTEIRO) as [FamiliaDoRoteiro, ...FamiliaDoRoteiro[]]),
  chave: z.string().trim().min(1, "Escolha o movimento."),
  contaDebitoCodigo: z.string().trim().min(1, "Escolha a conta debitada."),
  contaCreditoCodigo: z.string().trim().min(1, "Escolha a conta creditada."),
  historicoPadrao: z.string().trim().min(5, "Escreva o histórico que acompanha o lançamento.").max(200),
  fundamento: z.string().trim().min(20, "Diga POR QUE — citando a norma, o ato do ente ou a orientação do tribunal.").max(500),
  criadoPor: z.string().min(1),
});

export async function declararRoteiroPatrimonial(
  prisma: PrismaClient,
  input: z.input<typeof zDeclararRoteiroPatrimonial>
): Promise<{ readonly versao: number }> {
  const d = zDeclararRoteiroPatrimonial.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.declararRoteiroPatrimonial, "ENTE");
    const familia = FAMILIAS_DE_ROTEIRO[d.familia];
    if (!familia.chaves.some((c) => c.chave === d.chave)) {
      throw new Error(`O movimento "${d.chave}" não existe em ${familia.rotulo}. Escolha um da lista. Nada foi gravado.`);
    }
    if (d.contaDebitoCodigo === d.contaCreditoCodigo) {
      throw new Error(`A conta debitada e a creditada são a mesma (${d.contaDebitoCodigo}); o lançamento não moveria nada. Nada foi gravado.`);
    }
    for (const [lado, codigo] of [["debitada", d.contaDebitoCodigo], ["creditada", d.contaCreditoCodigo]] as const) {
      const conta = await tx.contaPcasp.findUnique({ where: { codigo }, select: { codigo: true, nome: true, analitica: true } });
      if (conta === null) throw new Error(`A conta ${lado} ${codigo} não está no plano de contas carregado. Nada foi gravado.`);
      if (!conta.analitica) throw new Error(`A conta ${lado} ${conta.codigo} (${conta.nome}) é sintética; o razão lança só em conta analítica. Nada foi gravado.`);
      if (!familia.classes.includes(conta.codigo.charAt(0))) {
        throw new Error(
          `A conta ${lado} ${conta.codigo} (${conta.nome}) não é do subsistema ${familia.subsistema === "PATRIMONIAL" ? "patrimonial (classes 1 a 4)" : "de controle (classes 7 e 8)"}, ` +
            `em que o movimento de ${familia.rotulo.toLowerCase()} lança. Nada foi gravado.`
        );
      }
    }
    const vigente = await tx.roteiroPatrimonialDeclarado.findFirst({
      where: { familia: d.familia, chave: d.chave },
      orderBy: { versao: "desc" },
      select: { contaDebitoCodigo: true, contaCreditoCodigo: true, historicoPadrao: true, versao: true },
    });
    if (vigente !== null && vigente.contaDebitoCodigo === d.contaDebitoCodigo && vigente.contaCreditoCodigo === d.contaCreditoCodigo && vigente.historicoPadrao === d.historicoPadrao) {
      throw new Error(`O roteiro de ${d.chave} já é este (versão ${String(vigente.versao)}). Nada foi gravado.`);
    }
    const r = await tx.roteiroPatrimonialDeclarado.create({
      data: {
        familia: d.familia, chave: d.chave, contaDebitoCodigo: d.contaDebitoCodigo, contaCreditoCodigo: d.contaCreditoCodigo,
        historicoPadrao: d.historicoPadrao, fundamento: d.fundamento, versao: (vigente?.versao ?? 0) + 1, criadoPor: d.criadoPor,
      },
      select: { versao: true },
    });
    return { versao: r.versao };
  });
}
