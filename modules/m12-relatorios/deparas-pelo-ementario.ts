import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";

/**
 * ═══ OS DE-PARAS DA LRF A PARTIR DO EMENTÁRIO OFICIAL DE 2026 (V35, onda B8) ═══
 *
 * Os seeds dos de-paras do RCL (Anexo 3), da base de impostos (Anexos 8 e 12) e das receitas do FUNDEB (Anexo 8)
 * listavam códigos de ementários antigos (IPTU 11180111, FPM 17210151…) que não existem no ementário da STN de 2026
 * — o da LOA de Esperança traz IPTU 11125001 e FPM 17115111. Com eles, quase toda receita real caía em "Outras", e a
 * RCL, a MDE e o mínimo da saúde saíam errados sem recusa.
 *
 * O MDF 15ª ed. define cada linha pelo conceito (o IPTU inclui principal, multas, juros e dívida ativa do imposto), e
 * no ementário de 2026 esse conceito é exatamente o que fica sob um AGREGADOR. Então a regra aqui é o prefixo do
 * agregador oficial (7 dígitos: categoria, origem, espécie e os desdobramentos — o 8º, o Tipo, fica livre). O gerador
 * aplica as regras às naturezas CADASTRADAS do ente e grava só o que falta; o que o ente já mapeou não é tocado.
 *
 * As classes de fonte seguem a tabela de fontes da STN 2026 (blocos e códigos), não o seed de demonstração.
 */

export interface RegraPorPrefixo {
  readonly prefixo: string;
  readonly chave: string;
  readonly agregador: string;
}

/** RCL (Anexo 3), base de impostos (Anexos 8 e 12): a MESMA identidade por agregador. */
export const REGRAS_IMPOSTOS_E_TRANSFERENCIAS: readonly RegraPorPrefixo[] = [
  { prefixo: "1112500", chave: "IPTU", agregador: "11125000 Imposto sobre a Propriedade Predial e Territorial Urbana" },
  { prefixo: "1112530", chave: "ITBI", agregador: "11125300 Impostos sobre Transmissão Inter Vivos" },
  { prefixo: "1114511", chave: "ISS", agregador: "11145110 Imposto sobre Serviços de Qualquer Natureza - ISSQN" },
  // Município só arrecada IR pelo art. 158, I, da CF (o retido na fonte sobre o que ele paga): toda a espécie 1.1.1.3.0
  // (pessoa física, jurídica e retido) é IRRF aqui — Esperança, por exemplo, classifica-o em 11130101 (IRPF).
  { prefixo: "11130", chave: "IRRF", agregador: "11130000 Imposto sobre a Renda e Proventos de Qualquer Natureza (art. 158, I)" },
  { prefixo: "1711511", chave: "FPM", agregador: "17115110 Cota-Parte do FPM - Cota Mensal" },
  { prefixo: "1711512", chave: "FPM_COMPLEMENTACAO", agregador: "17115120 Cota-Parte do FPM - 1% dezembro" },
  { prefixo: "1711513", chave: "FPM_COMPLEMENTACAO", agregador: "17115130 Cota-Parte do FPM - 1% julho" },
  { prefixo: "1711520", chave: "ITR", agregador: "17115200 Cota-Parte do ITR" },
  { prefixo: "1711550", chave: "IOF_OURO", agregador: "17115500 Cota-Parte do IOF-Ouro" },
  { prefixo: "1721500", chave: "ICMS", agregador: "17215000 Cota-Parte do ICMS" },
  { prefixo: "1721510", chave: "IPVA", agregador: "17215100 Cota-Parte do IPVA" },
  { prefixo: "1721520", chave: "IPI_EXPORTACAO", agregador: "17215200 Cota-Parte do IPI - Municípios" },
];

/** As chaves do Anexo 3 têm nomes próprios para duas destas (o motor do Anexo 3 já as rotula assim). */
/** `null`: a linha não é nomeada no Anexo 3 e a natureza cai no fail-open "Outras — Transferências" do próprio motor. */
const CHAVE_NO_ANEXO_3: Readonly<Record<string, string | null>> = { IPI_EXPORTACAO: "LC61", FPM_COMPLEMENTACAO: "FPM", IOF_OURO: null };

/** Receitas do FUNDEB (Anexo 8, linha 6): o retorno e as complementações da União. */
export const REGRAS_FUNDEB: readonly { readonly prefixo: string; readonly papel: string; readonly agregador: string }[] = [
  { prefixo: "1751500", papel: "RETORNO", agregador: "17515000 Transferências de Recursos do FUNDEB" },
  { prefixo: "1758011", papel: "RETORNO", agregador: "17580110 Transferências de Recursos do FUNDEB (multigovernamentais)" },
  { prefixo: "1715510", papel: "VAAF", agregador: "17155100 Complementação da União ao Fundeb – VAAF" },
  { prefixo: "1715502", papel: "VAAF", agregador: "17155020 Complementação da União ao Fundeb – VAAF" },
  { prefixo: "1715500", papel: "VAAT", agregador: "17155000 Complementação da União ao Fundeb – VAAT" },
  { prefixo: "1715501", papel: "VAAT", agregador: "17155010 Complementação da União ao Fundeb – VAAT" },
];

/** Classe da fonte para a saúde (Anexo 12) pela tabela de fontes da STN 2026. */
export function classeAspsDaFonte(fonte: string): string {
  const n = Number(fonte);
  if (n >= 500 && n <= 502) return "PROPRIOS";
  if ((n >= 600 && n <= 605) || n === 621 || n === 622) return "SUS";
  if (n === 634) return "OPERACAO_CREDITO";
  return "OUTROS";
}

/** Classe da fonte para a educação (Anexo 8) pela tabela de fontes da STN 2026. */
export function classeEducacaoDaFonte(fonte: string): string {
  const n = Number(fonte);
  if (n >= 500 && n <= 502) return "IMPOSTOS_MDE";
  if (n === 542) return "VAAT";
  if (n >= 540 && n <= 546) return "FUNDEB";
  return "OUTRAS";
}

export function regraDaNatureza(codigo: string): RegraPorPrefixo | null {
  return REGRAS_IMPOSTOS_E_TRANSFERENCIAS.find((r) => codigo.startsWith(r.prefixo)) ?? null;
}

export interface ResultadoDosDeParas {
  readonly rcl: number;
  readonly baseImpostos: number;
  readonly fundeb: number;
  readonly fontesAsps: number;
  readonly fontesEducacao: number;
}

/**
 * Aplica as regras às naturezas e fontes CADASTRADAS e grava só o que falta. Idempotente; não toca o que existe.
 * Só a receita principal entra no de-para do Anexo 3 (o motor dele é principal-only por desenho); a base de impostos
 * recebe os quatro tipos (o motor dela separa pelo 8º dígito).
 */
export async function gerarDeParasDaLrf(prisma: PrismaClient, input: { readonly criadoPor: string }): Promise<ResultadoDosDeParas> {
  await autorizarNo(prisma, input.criadoPor, ACAO_DO_SERVICO.gerarDeParasDaLrf, "ENTE");
  const por = input.criadoPor;
  const [naturezas, fontes, jaRcl, jaBase, jaFundeb, jaAsps, jaEdu] = await Promise.all([
    prisma.naturezaReceita.findMany({ select: { codigo: true } }),
    prisma.fonteRecurso.findMany({ select: { codigo: true } }),
    prisma.deParaRclAnexo3.findMany({ select: { naturezaCodigo: true } }),
    prisma.deParaBaseImpostoAsps.findMany({ select: { naturezaCodigo: true } }),
    prisma.deParaFundebReceita.findMany({ select: { naturezaCodigo: true } }),
    prisma.deParaFonteClasseAsps.findMany({ select: { fonteCodigo: true } }),
    prisma.deParaFonteClasseEducacao.findMany({ select: { fonteCodigo: true } }),
  ]);
  const tem = (xs: readonly { naturezaCodigo: string }[]): Set<string> => new Set(xs.map((x) => x.naturezaCodigo));
  const [tRcl, tBase, tFundeb] = [tem(jaRcl), tem(jaBase), tem(jaFundeb)];
  const tAsps = new Set(jaAsps.map((x) => x.fonteCodigo));
  const tEdu = new Set(jaEdu.map((x) => x.fonteCodigo));
  const r = { rcl: 0, baseImpostos: 0, fundeb: 0, fontesAsps: 0, fontesEducacao: 0 };
  for (const { codigo } of naturezas) {
    if (!/^\d{8}$/.test(codigo)) continue;
    const regra = regraDaNatureza(codigo);
    if (regra !== null) {
      if (!tBase.has(codigo)) {
        await prisma.deParaBaseImpostoAsps.create({ data: { naturezaCodigo: codigo, chave: regra.chave, criadoPor: por } });
        r.baseImpostos++;
      }
      const chaveRcl = regra.chave in CHAVE_NO_ANEXO_3 ? CHAVE_NO_ANEXO_3[regra.chave]! : regra.chave;
      if (codigo.endsWith("1") && chaveRcl !== null && !tRcl.has(codigo)) {
        await prisma.deParaRclAnexo3.create({ data: { naturezaCodigo: codigo, chaveLinha: chaveRcl, tipo: "corrente", criadoPor: por } });
        r.rcl++;
      }
    }
    const f = REGRAS_FUNDEB.find((x) => codigo.startsWith(x.prefixo));
    if (f !== undefined && !tFundeb.has(codigo)) {
      await prisma.deParaFundebReceita.create({ data: { naturezaCodigo: codigo, papel: f.papel, criadoPor: por } });
      r.fundeb++;
    }
  }
  for (const { codigo } of fontes) {
    if (!tAsps.has(codigo)) {
      await prisma.deParaFonteClasseAsps.create({ data: { fonteCodigo: codigo, classe: classeAspsDaFonte(codigo), criadoPor: por } });
      r.fontesAsps++;
    }
    if (!tEdu.has(codigo)) {
      await prisma.deParaFonteClasseEducacao.create({ data: { fonteCodigo: codigo, classe: classeEducacaoDaFonte(codigo), criadoPor: por } });
      r.fontesEducacao++;
    }
  }
  return r;
}
