import "dotenv/config";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { cadastrarEntidadeContabil } from "../../modules/m01-core-contabil/entidade-contabil.js";
import { declararRoteiroPatrimonial } from "../../modules/m01-core-contabil/roteiro-patrimonial-declarado.js";
import { cadastrarUnidadeGestora, vincularUnidadeOrcamentariaAUg } from "../../modules/m01-core-contabil/unidade-gestora.js";
import { carregarQddDaLoa, carregarReceitaDaLoa, lerQdd, lerReceitaDaLoa } from "../../modules/m02-planejamento/carga-da-loa.js";
import { carregarTabelaDeFontes } from "../../modules/m02-planejamento/fontes-oficiais.js";
import { descricaoOficialDaNatureza, lerEmentarioDaReceita } from "../../modules/m04-receita/ementario-oficial.js";
import { abrirExercicio } from "../../modules/m08-restos-a-pagar/exercicio.js";
import { meioDiaCivil } from "../../packages/datas/index.js";

/**
 * V35 (onda A2) — A CONFIGURAÇÃO DO EXERCÍCIO DE 2026 DE ESPERANÇA/PB, depois de `esperanca-instalar-base.ts`.
 *
 * Tudo vem de fonte pública versionada no repositório, e cada passo diz de onde:
 *   1. exercício 2026 aberto;
 *   2. seeds normativos aprovados na auditoria da V35 (classificações da Portaria 42/1999 e 163/2001, linhas dos
 *      demonstrativos derivadas do PCASP, roteiro orçamentário e o roteiro de encerramento 2.3.7.1.1.01.00);
 *   3. fontes e CO pela tabela oficial da STN 2026;
 *   4. as entidades contábeis do ente (Decreto Federal 10.540/2020, art. 1º: o SIAFIC é único e abrange todos os
 *      poderes e órgãos) — Prefeitura, Câmara, FUNPREVE e PROCON, com o CNPJ que os dados abertos do TCE-PB mostram e
 *      a Lei 613/2025 como o ato que as nomeia no orçamento (o ato de criação de cada uma não foi obtido);
 *   5. as UGs do Tribunal, escrituradas aqui, vigentes neste sistema desde 01/01/2026 (o primeiro exercício
 *      escriturado nele — não é a data de criação, que os dados abertos não trazem); o consórcio fica de fora;
 *   6. a LOA 2026 (QDD e receita) extraída da Lei 613/2025 e conferida contra os totais dela;
 *   7. o vínculo de cada unidade orçamentária com a UG, como o município declarou ao Tribunal em 2026;
 *   8. o roteiro do adiantamento nas contas do plano do TCE-PB (7.9.1.2.1.00.00 e 8.9.1.2.1.01.00).
 *
 * Idempotente: cada passo confere o que já existe e não regrava. Só roda em banco `gestao_publica_esperanca*`.
 *
 * Uso: DATABASE_URL=<banco de Esperança> CARGA_POR=<usuário que responde> npx tsx scripts/implantacao/esperanca-configurar-exercicio.ts
 */

const RAIZ = resolve(import.meta.dirname, "../..");
const url = process.env["DATABASE_URL"] ?? "";
const banco = /\/([^/?]+)(\?|$)/.exec(url)?.[1] ?? "";
if (!banco.startsWith("gestao_publica_esperanca")) {
  console.error(`Recusado: o banco "${banco}" não é de Esperança.`);
  process.exit(2);
}
const por = process.env["CARGA_POR"] ?? "";
if (por === "") {
  console.error("Informe CARGA_POR (o usuário que responde pela configuração).");
  process.exit(2);
}
const prisma = criarPrismaClient(url);
const feito: string[] = [];
const falta: string[] = [];
const ler = (rel: string): string => readFileSync(resolve(RAIZ, rel), "utf8");
const csv = (rel: string): string[][] => ler(rel).replace(/^﻿/, "").split(/\r?\n/).slice(1).filter((l) => l.trim() !== "").map((l) => l.split(";"));

const LEI_613 = "Lei Ordinária 613, de 19/12/2025 (LOA 2026 de Esperança)";
const INICIO = "2026-01-01";
const VIGENCIA =
  `Vigente neste sistema desde ${INICIO}, o primeiro exercício escriturado nele (não é a data de criação da UG, que os ` +
  "dados abertos do TCE-PB não trazem). Código e nome: docs/oficial/tce-pb/esperanca-078/LEIA-ME.md.";

const ENTIDADES = [
  {
    codigo: "PM", ug: "201078", nome: "Prefeitura Municipal de Esperança", cnpj: "08993909000108", tipoManad: "01", natureza: "PREFEITURA_OU_SECRETARIA" as const,
    dispositivo: "art. 1º", citacao: "Art. 1º Esta Lei estima a receita e fixa a despesa do Município de Esperança-PB, para o exercício financeiro de 2026 (Prefeitura Municipal de Esperança, Poder Executivo).",
    evidenciaCnpj: "SNC (snc.cultura.gov.br/adesao/detalhar/2506004) e credor nas despesas de 2026 nos dados abertos do TCE-PB",
  },
  {
    codigo: "CM", ug: "101078", nome: "Câmara Municipal de Esperança", cnpj: "12671806000190", tipoManad: "02", natureza: "CAMARA_MUNICIPAL" as const,
    dispositivo: "art. 3º", citacao: "Art. 3º A Despesa será realizada [...] DESPESAS POR UNIDADE ORÇAMENTÁRIA: CÂMARA MUNICIPAL (unidade 1001 do QDD) — Câmara Municipal de Esperança.",
    evidenciaCnpj: "credor da própria UG 101078 (folha e tributos) nas despesas de 2022 a 2025 dos dados abertos do TCE-PB",
  },
  {
    codigo: "FPS", ug: "601078", nome: "Fundo de Previdência Social dos Servidores do Município de Esperança - FUNPREVE", cnpj: "08683333000174", tipoManad: "07", natureza: "AUTARQUIA_PREVIDENCIARIA" as const,
    dispositivo: "art. 4º", citacao: "Art. 4º O orçamento do Fundo de Previdência dos Servidores do Município de Esperança - FUNPREVE, está estimado no valor previsto no anexo (Fundo de Previdência Social dos Servidores do Município de Esperança - FUNPREVE).",
    evidenciaCnpj: "credor nas despesas de 2026 da Prefeitura nos dados abertos do TCE-PB; autarquia segundo o expediente do Quinzenário Oficial nº 206",
  },
  {
    codigo: "PROC", ug: "301078", nome: "Autarquia Municipal de Proteção e Defesa do Consumidor - PROCON", cnpj: "42236150000149", tipoManad: "06", natureza: "AUTARQUIA" as const,
    dispositivo: "art. 3º", citacao: "Art. 3º A Despesa será realizada [...] DESPESAS POR UNIDADE ORÇAMENTÁRIA: PROCON MUNICIPAL (unidade 2015 do QDD) — Autarquia Municipal de Proteção e Defesa do Consumidor - PROCON.",
    evidenciaCnpj: "credor nas despesas de 2026 da Prefeitura nos dados abertos do TCE-PB; autarquia segundo o expediente do Quinzenário Oficial nº 206",
  },
] as const;

function seed(arquivo: string, args: readonly string[] = []): void {
  execFileSync(process.platform === "win32" ? "npx.cmd" : "npx", ["tsx", `prisma/seed/${arquivo}`, ...args], {
    cwd: RAIZ, stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, SEED_IDENTIDADE: por },
  });
}

async function exercicio(): Promise<void> {
  if ((await prisma.exercicio.findUnique({ where: { ano: 2026 }, select: { id: true } })) !== null) feito.push("Exercício 2026 já aberto.");
  else {
    await abrirExercicio(prisma, { ano: 2026, criadoPor: por });
    feito.push("Exercício 2026 aberto.");
  }
}

async function seeds(): Promise<void> {
  seed("m02-seed-oficial.ts");
  feito.push("Funções, subfunções e naturezas comuns da Portaria 42/1999 e 163/2001 (seed oficial).");
  if ((await prisma.linhaDemonstrativo.count()) === 0) {
    seed("m12-linhas-demonstrativos.ts");
    feito.push("Linhas dos Anexos 14 e 15 derivadas do PCASP carregado.");
  } else feito.push("Linhas dos demonstrativos já existiam (o seed não roda de novo: apagaria ajuste do ente).");
  if ((await prisma.roteiroOrcamentario.count()) === 0) {
    seed("roteiro-orcamentario.ts");
    feito.push("Roteiro orçamentário (dotação inicial, suplementar, realocação) pelas contas analíticas do PCASP.");
  } else feito.push("Roteiro orçamentário já existia (o seed não roda de novo: sobrescreveria decisão do ente).");
  if ((await prisma.roteiroEncerramento.count()) === 0) {
    seed("roteiro-encerramento.ts");
    feito.push("Roteiro de encerramento: resultado acumulado em 2.3.7.1.1.01.00.");
  } else feito.push("Roteiro de encerramento já existia.");
}

/**
 * Os sete roteiros que o seed deixa recusados por pedirem uma ESCOLHA entre analíticas do plano. Decididos pela
 * estrutura do PCASP do TCE-PB 2025 (o nome e o ramo de cada analítica), com o fundamento gravado em cada um:
 *   · crédito especial e extraordinário ABERTO → `.01` ("... ABERTOS"); REABERTO → `.02` ("... REABERTOS"). A `.03`
 *     ("REABERTOS - SUPLEMENTAÇÃO") é a suplementação de um crédito já reaberto, outro fato;
 *   · a anulação de dotação → `5.2.2.1.9.04.00`, o cancelamento sob CANCELAMENTO/REMANEJAMENTO DE DOTAÇÃO, ao lado
 *     das alterações de QDD e de LOA. A homônima `5.2.2.1.3.09.00` é a visão POR FONTE (sob DOTAÇÃO ADICIONAL POR
 *     FONTE), que este sistema não escritura no roteiro por tipo — lançar a redução nela misturaria as duas visões;
 *   · a reserva de dotação (indicação de recurso antes do empenho, Lei 14.133 art. 150) → `6.2.2.1.2.02.00` CRÉDITO
 *     PRÉ-EMPENHADO. O BLOQUEIO (`.01.00`) é a limitação de empenho (LRF art. 9º), outro fato.
 */
async function roteirosPendentes(): Promise<void> {
  const { publicarRoteiroOrcamentario } = await import("../../modules/m05-despesa/servico-roteiro-orcamentario.js");
  const DISPONIVEL = "6.2.2.1.1.00.00";
  const BASE = "PCASP do TCE-PB 2025 (Pcasp_2025.xlsx), V35:";
  const decisoes = [
    { tipo: "CREDITO_ADICIONAL", tipoCredito: "ESPECIAL", abertura: "ABERTO", d: "5.2.2.1.2.02.01", c: DISPONIVEL, f: `${BASE} 5.2.2.1.2.02.01 CRÉDITOS ESPECIAIS ABERTOS recebe o crédito especial aberto no exercício (CF art. 167, § 2º).` },
    { tipo: "CREDITO_ADICIONAL", tipoCredito: "ESPECIAL", abertura: "REABERTO", d: "5.2.2.1.2.02.02", c: DISPONIVEL, f: `${BASE} 5.2.2.1.2.02.02 CRÉDITOS ESPECIAIS REABERTOS recebe a reabertura do art. 167, § 2º; a .03 é a suplementação de crédito já reaberto.` },
    { tipo: "CREDITO_ADICIONAL", tipoCredito: "EXTRAORDINARIO", abertura: "ABERTO", d: "5.2.2.1.2.03.01", c: DISPONIVEL, f: `${BASE} 5.2.2.1.2.03.01 CRÉDITOS EXTRAORDINÁRIOS ABERTOS recebe o crédito extraordinário aberto no exercício (CF art. 167, § 3º).` },
    { tipo: "CREDITO_ADICIONAL", tipoCredito: "EXTRAORDINARIO", abertura: "REABERTO", d: "5.2.2.1.2.03.02", c: DISPONIVEL, f: `${BASE} 5.2.2.1.2.03.02 CRÉDITOS EXTRAORDINÁRIOS REABERTOS recebe a reabertura do art. 167, § 2º; a .03 é a suplementação de crédito já reaberto.` },
    { tipo: "ANULACAO_CREDITO", d: DISPONIVEL, c: "5.2.2.1.9.04.00", f: `${BASE} a redução de dotação é cancelamento: 5.2.2.1.9.04.00 (-) CANCELAMENTO DE DOTAÇÕES, sob CANCELAMENTO/REMANEJAMENTO DE DOTAÇÃO. A homônima 5.2.2.1.3.09.00 é a visão por fonte, que este roteiro não escritura.` },
    { tipo: "RESERVA", d: DISPONIVEL, c: "6.2.2.1.2.02.00", f: `${BASE} a reserva de dotação antes do empenho (Lei 14.133, art. 150) é 6.2.2.1.2.02.00 CREDITO PRE-EMPENHADO; o bloqueio (.01) é a limitação de empenho.` },
    { tipo: "RESERVA_LIBERADA", d: "6.2.2.1.2.02.00", c: DISPONIVEL, f: `${BASE} a liberação da reserva devolve o pré-empenhado (6.2.2.1.2.02.00) ao crédito disponível — o inverso exato da reserva.` },
  ] as const;
  let publicados = 0;
  for (const r of decisoes) {
    const ja = await prisma.roteiroOrcamentario.findFirst({
      where: { tipo: r.tipo, tipoCredito: "tipoCredito" in r ? r.tipoCredito : null, abertura: "abertura" in r ? r.abertura : null },
      select: { contaDebito: { select: { codigo: true, analitica: true } }, contaCredito: { select: { codigo: true, analitica: true } } },
    });
    if (ja !== null && ja.contaDebito.analitica && ja.contaCredito.analitica) continue;
    await publicarRoteiroOrcamentario(prisma, {
      tipo: r.tipo, tipoCredito: "tipoCredito" in r ? r.tipoCredito : null, abertura: "abertura" in r ? r.abertura : null,
      contaDebitoCodigo: r.d, contaCreditoCodigo: r.c, fundamento: r.f, criadoPor: por,
    });
    publicados++;
  }
  feito.push(`Roteiros orçamentários decididos pelo PCASP (crédito especial e extraordinário, anulação e reserva): ${String(publicados)} publicados.`);
}

async function fontes(): Promise<void> {
  const r = await carregarTabelaDeFontes(prisma, {
    conteudo: readFileSync(resolve(RAIZ, "docs/oficial/stn-sof/fonte-ou-destinacao-de-recursos-2026.xlsx")),
    origem: "STN, Fonte ou Destinação de Recursos 2026, sha256 271c9771c4e0e020bdad393a3552777c9253a120b920fdbf6950546483331071",
    criadoPor: por,
  });
  feito.push(`Fontes: ${String(r.fontesCriadas.length)} criadas, ${String(r.fontesJaExistentes)} já existiam; ${String(r.cosCriados.length)} CO; ${String(r.naturezasDeclaradas.length)} naturezas pelo bloco da STN.`);
  if (r.fontesDivergentes.length > 0) falta.push(`Fontes com nome diferente da tabela, mantidas: ${r.fontesDivergentes.map((d) => d.codigo).join(", ")}.`);
}

async function entidadesEUgs(): Promise<void> {
  for (const e of ENTIDADES) {
    let ent = await prisma.entidadeContabil.findFirst({ where: { codigo: e.codigo }, select: { id: true } });
    if (ent === null) {
      const r = await cadastrarEntidadeContabil(
        prisma,
        { codigo: e.codigo, nome: e.nome, cnpj: e.cnpj, tipoManad: e.tipoManad, atoTipo: "LEI", atoNumero: "613", atoAno: 2025, atoDispositivo: e.dispositivo, atoCitacao: e.citacao, criadoPor: por },
        new Date()
      );
      ent = { id: r.entidadeId };
      feito.push(`Entidade ${e.codigo} cadastrada: ${e.nome}, CNPJ ${e.cnpj} (${e.evidenciaCnpj}).`);
    } else feito.push(`Entidade ${e.codigo} já cadastrada.`);
    const ug = await prisma.unidadeGestora.findUnique({ where: { codigoTce: e.ug }, select: { id: true, entidadeContabilId: true } });
    if (ug === null) {
      await cadastrarUnidadeGestora(prisma, {
        codigoTce: e.ug, nome: e.nome, cnpj: e.cnpj, naturezaJuridica: e.natureza, entidadeContabilId: ent.id,
        vigenteDesde: meioDiaCivil(INICIO), fundamento: `${VIGENCIA} Escriturada neste sistema: Decreto Federal 10.540/2020, art. 1º (SIAFIC único do ente).`, criadoPor: por,
      });
      feito.push(`UG ${e.ug} cadastrada, escriturada aqui, desde ${INICIO}.`);
    } else if (ug.entidadeContabilId === null) {
      falta.push(`UG ${e.ug} já existe como escriturada fora deste sistema: ligar à entidade ${e.codigo} exige nova declaração na tela de unidades gestoras.`);
    } else feito.push(`UG ${e.ug} já cadastrada.`);
  }
  falta.push("Consórcio Irmã Luciana (UG 701078): pessoa jurídica própria, escriturada fora deste sistema — não cadastrado.");
}

async function loa(): Promise<void> {
  const orgaos = new Map(csv("docs/oficial/esperanca-pb/orgaos-2026-DERIVADO.csv").map((l) => [l[0]!, l[1]!]));
  const programas = new Map(csv("docs/oficial/esperanca-pb/programas-2026-DERIVADO.csv").map((l) => [l[0]!, l[1]!]));
  const d = await carregarQddDaLoa(prisma, { exercicio: 2026, linhas: lerQdd(ler("docs/oficial/esperanca-pb/qdd-2026-DERIVADO.csv")), orgaos, programas, criadoPor: por });
  feito.push(`QDD 2026: ${String(d.fichasCriadas)} fichas criadas (${d.totalCarregado}), ${String(d.fichasJaExistentes)} já existiam; estrutura nova ${JSON.stringify(d.cadastrados)}.`);
  if (d.divergentes.length > 0) falta.push(`Fichas divergentes da lei (não alteradas): ${d.divergentes.join("; ")}.`);
  const ementario = lerEmentarioDaReceita(readFileSync(resolve(RAIZ, "docs/oficial/stn-sof/ementario-2026/ementario-receita-tabela-de-codigos-2026.xlsx")));
  const r = await carregarReceitaDaLoa(prisma, {
    exercicio: 2026, linhas: lerReceitaDaLoa(ler("docs/oficial/esperanca-pb/receita-prevista-2026-DERIVADO.csv")),
    descricaoOficial: (c) => descricaoOficialDaNatureza(c, ementario), documento: `${LEI_613}, Anexo II`, criadoPor: por,
  });
  feito.push(`Receita 2026: ${String(r.previsoesCriadas)} previsões criadas, ${String(r.previsoesJaExistentes)} já existiam; ${String(r.naturezasCadastradas)} naturezas pelo ementário; bruto ${r.totalBruto}, deduções ${r.totalDeducoes}.`);
  if (r.semValor.length > 0) feito.push(`Linhas da lei com valor zero, não previstas: ${r.semValor.join(", ")}.`);
  if (r.divergentes.length > 0) falta.push(`Previsões divergentes da lei (não alteradas): ${r.divergentes.join("; ")}.`);
}

async function vinculos(): Promise<void> {
  const linhas = csv("docs/oficial/tce-pb/esperanca-078/unidades-orcamentarias-2026-DERIVADO.csv");
  const declarado = new Map(linhas.map((l) => [l[1]!, l[0]!]));
  // A reserva de contingência (02019) não tem empenho, logo não aparece no que o município declarou: é do órgão 02,
  // a administração direta do Executivo, cuja UG é a Prefeitura.
  declarado.set("02019", "201078");
  const ugs = new Map((await prisma.unidadeGestora.findMany({ select: { id: true, codigoTce: true } })).map((u) => [u.codigoTce, u.id]));
  const uos = await prisma.unidadeOrcamentaria.findMany({ select: { id: true, codigo: true } });
  let novos = 0;
  for (const uo of uos) {
    const ug = declarado.get(uo.codigo);
    if (ug === undefined || !ugs.has(ug)) {
      falta.push(`Unidade ${uo.codigo} sem UG declarada ao Tribunal em 2026.`);
      continue;
    }
    const fundamento =
      uo.codigo === "02019"
        ? "Reserva de contingência do órgão 02 (Executivo) na Lei 613/2025; sem empenho, não aparece nos dados do Tribunal: é da administração direta (Prefeitura)."
        : `Declarado pelo município ao TCE-PB nos empenhos de 2026 (dados abertos, despesas-2026.zip): unidade ${uo.codigo} na UG ${ug}. docs/oficial/tce-pb/esperanca-078/unidades-orcamentarias-2026-DERIVADO.csv.`;
    const r = await vincularUnidadeOrcamentariaAUg(prisma, { unidadeOrcId: uo.id, ugId: ugs.get(ug)!, vigenteDesde: meioDiaCivil(INICIO), fundamento, criadoPor: por });
    if (!r.repetido) novos++;
  }
  feito.push(`Vínculos unidade → UG: ${String(novos)} novos, de ${String(uos.length)} unidades.`);
}

async function adiantamento(): Promise<void> {
  const FUNDAMENTO =
    "PCASP do TCE-PB 2025 (Pcasp_2025.xlsx): 7.9.1.2.1.00.00 Controle de adiantamentos/suprimentos de fundos concedidos (devedora) e 8.9.1.2.1.01.00 Adiantamentos concedidos a comprovar (credora); Lei 4.320, arts. 68 e 69.";
  const existentes = await prisma.roteiroPatrimonialDeclarado.findMany({ where: { familia: "ADIANTAMENTO" }, select: { chave: true } });
  const tem = new Set(existentes.map((e) => e.chave));
  for (const especie of ["DIARIA", "SUPRIMENTO_DE_FUNDOS"]) {
    if (!tem.has(`CONCESSAO/${especie}`)) {
      await declararRoteiroPatrimonial(prisma, { familia: "ADIANTAMENTO", chave: `CONCESSAO/${especie}`, contaDebitoCodigo: "7.9.1.2.1.00.00", contaCreditoCodigo: "8.9.1.2.1.01.00", historicoPadrao: "Adiantamento concedido a comprovar", fundamento: FUNDAMENTO, criadoPor: por });
    }
    if (!tem.has(`BAIXA/${especie}`)) {
      await declararRoteiroPatrimonial(prisma, { familia: "ADIANTAMENTO", chave: `BAIXA/${especie}`, contaDebitoCodigo: "8.9.1.2.1.01.00", contaCreditoCodigo: "7.9.1.2.1.00.00", historicoPadrao: "Adiantamento comprovado", fundamento: FUNDAMENTO, criadoPor: por });
    }
  }
  feito.push("Roteiro do adiantamento (diária e suprimento: concessão e baixa) declarado nas contas do PCASP.");
}

try {
  await exercicio();
  await seeds();
  await roteirosPendentes();
  await fontes();
  await entidadesEUgs();
  await loa();
  await vinculos();
  await adiantamento();
  console.log("Feito:");
  for (const f of feito) console.log(`  - ${f}`);
  console.log("Falta:");
  for (const f of falta) console.log(`  - ${f}`);
} catch (e) {
  console.log("Feito até a falha:");
  for (const f of feito) console.log(`  - ${f}`);
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
