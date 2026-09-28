import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import {
  criarAcaoPpa,
  criarAreaTematica,
  criarEixoEstruturante,
  criarIndicadorPrograma,
  criarLdo,
  criarMetaAnualLdo,
  criarPlanoPlurianual,
  criarPrevisaoReceitaPpa,
  criarPrioridadeLdo,
  criarProgramaPpa,
  criarPublicoAlvo,
  criarReceitaAnteriorPpa,
} from "../../modules/m02b-plurianual/servico.js";
import { registrarAtoDeAlteracaoDoPlanejamento } from "../../modules/m02b-plurianual/servico-alteracao.js";
import { criarM02Deps } from "../../modules/m02-planejamento/adapter-prisma.js";
import { criarFicha } from "../../modules/m02-planejamento/servico.js";
import { criarDecreto, criarLei, executarCredito } from "../../modules/m03-creditos/index.js";
import { criarM03DepsAmarrado } from "../../modules/m12-relatorios/adapter-m03.js";
import { publicarRoteiroOrcamentario } from "../../modules/m05-despesa/servico-roteiro-orcamentario.js";
import { declararNaturezaDaFonte, exigirNaturezaDaFonte, naturezaVigenteDaFonte } from "../../modules/m01-core-contabil/natureza-da-fonte.js";
import {
  CONTA_FORNECEDORES_A_PAGAR,
  roteiroArrecadacao,
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
} from "../../modules/m01-core-contabil/roteiros.js";
import { criarM04Deps } from "../../modules/m04-receita/adapter-prisma.js";
import { registrarArrecadacao } from "../../modules/m04-receita/servico.js";
import { empenhar } from "../../modules/m05-despesa/servico.js";
import { liquidar, pagar } from "../../modules/m05-despesa/servico-bloco2.js";
import { criarM05Deps } from "../../modules/m05-despesa/adapter-prisma.js";
import { criarM05DepsComContratos } from "../../modules/m11-licitacoes/adapter-m05.js";
import { criarM05DepsComAlmoxarifado } from "../../modules/m10-patrimonial/adapter-m05-almox.js";
import { calcularDvDoCnpj, documentoTemDigitoValido } from "../../packages/documento/index.js";
import { toMoney } from "../../packages/contracts/index.js";
import { meioDiaCivil } from "../../packages/datas/index.js";

/**
 * DADOS DE DEMONSTRAÇÃO DOS DEMONSTRATIVOS — PPA, LDO, uma lei alteradora do PPA, fichas de
 * educação, saúde e pessoal com crédito especial, arrecadação de IPTU, ITBI e ISS e a execução
 * (empenho → liquidação → pagamento) nas fichas de educação e saúde.
 *
 * Tudo passa pelos SERVIÇOS DE DOMÍNIO que as telas chamam — a mesma autorização, os mesmos
 * guards, o mesmo Zod. Nada de insert cru. Recusa de serviço é registrada com o motivo, e o
 * script segue com o que não depende dela.
 *
 * SÓ CÓDIGOS QUE JÁ EXISTEM NO BANCO: órgão/UO, função, subfunção, programa, ação, natureza de
 * despesa, natureza de receita e fonte são LIDOS; nenhum é criado aqui. Onde o catálogo do banco
 * não tem o que o demonstrativo precisa, o relatório final diz o que falta — não se inventa.
 *
 * ⚠️ AS NATUREZAS DOS IMPOSTOS (11180111 IPTU, 11180141 ITBI, 11180231 ISSQN) vêm do ementário do
 * ente, cadastrado pela tela `/receita/naturezas` com os rótulos do extrato oficial
 * (`prisma/seed/dados/depara-impostos.test.ts`). Sem elas no banco, a guia é RECUSADA com o motivo —
 * o script não as cria. São esses códigos que os de-paras da base de impostos (Anexos 3, 8 e 12)
 * leem; a 11130211 do catálogo antigo não está em nenhum de-para.
 *
 * PARAMETRIZAÇÃO DE DEMONSTRAÇÃO (o que o ente faria na tela, feito pelo serviço da tela, com
 * fundamento — o mesmo regime de `parametrizar-demonstracao.ts`):
 *   · natureza da fonte 500 → ORDINARIOS (`/contabilidade/natureza-das-fontes`);
 *   · roteiro do CRÉDITO ADICIONAL ESPECIAL ABERTO → D 5.2.2.1.2.02.01 / C 6.2.2.1.1.00.00
 *     (`/contabilidade/roteiros-orcamentarios`).
 *
 * Idempotente: cada item é procurado pela chave natural (ano do plano, exercício da LDO, número
 * do ato, número da ficha, número da lei/decreto, número da guia, número do empenho/liquidação/
 * pagamento) antes de ser criado. Rodar duas vezes não duplica nada.
 *
 * Só roda contra o banco `gestao_publica_local`.
 *
 * Uso: npx tsx scripts/demonstracao/semear-demonstrativos.ts
 */

const BANCO_PERMITIDO = "gestao_publica_local";
const AUTOR = "admin@cg.pb.gov.br";
const EXERCICIO = 2026;

function exigirBancoPermitido(): string {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") throw new Error("DATABASE_URL ausente. Nada foi gravado.");
  let nome: string;
  try {
    nome = new URL(url).pathname.replace(/^\//, "");
  } catch {
    throw new Error("DATABASE_URL ilegível. Nada foi gravado.");
  }
  if (nome !== BANCO_PERMITIDO) {
    throw new Error(
      `Recusado: este script só semeia o banco "${BANCO_PERMITIDO}", e o DATABASE_URL aponta ` +
        `para "${nome}". Nada foi gravado.`
    );
  }
  return url;
}

/** O mesmo cálculo do semeador da execução da despesa: o credor é o que ele cadastrou. */
function cnpjComDv(raiz12: string): string {
  const doc = raiz12 + calcularDvDoCnpj(raiz12);
  if (!documentoTemDigitoValido(doc)) throw new Error(`CNPJ gerado sem DV válido: ${doc}`);
  return doc;
}

const CREDOR = {
  construtora: cnpjComDv("286405170001"),
  grafica: cnpjComDv("447028160001"),
  clinica: cnpjComDv("264719830001"),
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRO DO QUE ACONTECEU
// ═══════════════════════════════════════════════════════════════════════════

const criados: string[] = [];
const existentes: string[] = [];
const recusados: string[] = [];

async function passo(rotulo: string, fn: () => Promise<"criado" | "existente" | string>): Promise<void> {
  try {
    const r = await fn();
    if (r === "criado") criados.push(rotulo);
    else if (r === "existente") existentes.push(rotulo);
    else recusados.push(`${rotulo}: ${r}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    recusados.push(`${rotulo}: ${msg.replace(/\s+/g, " ").slice(0, 600)}`);
  }
}

const dia = (s: string): Date => meioDiaCivil(s);

// ═══════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const url = exigirBancoPermitido();
  const prisma = criarPrismaClient(url);

  try {
    // ── Catálogo existente: tudo LIDO, nada criado ────────────────────────────
    const programa = await prisma.programa.findUnique({ where: { codigo: "0001" }, select: { id: true } });
    const acao = await prisma.acao.findUnique({ where: { codigo: "2001" }, select: { id: true } });
    const uo = await prisma.unidadeOrcamentaria.findUnique({ where: { codigo: "01001" }, select: { id: true } });
    const fonte = await prisma.fonteRecurso.findUnique({ where: { codigo: "500" }, select: { id: true } });
    const natReceita = await prisma.naturezaReceita.findUnique({ where: { codigo: "11130211" }, select: { id: true } });
    const funcao = async (c: string) => (await prisma.funcao.findUnique({ where: { codigo: c }, select: { id: true } }))?.id;
    const subfuncao = async (c: string) => (await prisma.subfuncao.findUnique({ where: { codigo: c }, select: { id: true } }))?.id;
    if (programa === null || acao === null || uo === null || fonte === null || natReceita === null) {
      throw new Error("Catálogo mínimo ausente (programa 0001, ação 2001, UO 01001, fonte 500 ou natureza 11130211). Nada foi gravado.");
    }
    const [f04, f10, f12, s122, s301, s361] = await Promise.all([
      funcao("04"), funcao("10"), funcao("12"), subfuncao("122"), subfuncao("301"), subfuncao("361"),
    ]);
    if ([f04, f10, f12, s122, s301, s361].some((x) => x === undefined)) {
      throw new Error("Função 04/10/12 ou subfunção 122/301/361 ausente do banco. Nada foi gravado.");
    }

    // ══ 1. PARAMETRIZAÇÃO DE DEMONSTRAÇÃO (pelo serviço da tela, com fundamento) ══
    await passo("Natureza da fonte 500 declarada ORDINARIOS", async () => {
      const v = await naturezaVigenteDaFonte(prisma, "500");
      if (v !== null && v.natureza === "ORDINARIOS") return "existente";
      await declararNaturezaDaFonte(prisma, {
        fonteCodigo: "500",
        natureza: "ORDINARIOS",
        fundamento:
          "Fonte 500 - Recursos não vinculados de impostos: recurso livre, sem vinculação legal a " +
          "finalidade específica (Portaria STN 710/2021, grupo das fontes não vinculadas). " +
          "Declaração do ambiente de demonstração, feita pelo serviço da tela de natureza das fontes.",
        criadoPor: AUTOR,
      });
      return "criado";
    });

    await passo("Roteiro do crédito especial aberto (D 5.2.2.1.2.02.01 / C 6.2.2.1.1.00.00)", async () => {
      const v = await prisma.roteiroOrcamentario.findFirst({
        where: { tipo: "CREDITO_ADICIONAL", tipoCredito: "ESPECIAL", abertura: "ABERTO" },
        orderBy: { versao: "desc" },
        select: { contaDebito: { select: { codigo: true } }, contaCredito: { select: { codigo: true } } },
      });
      if (v !== null && v.contaDebito.codigo === "5.2.2.1.2.02.01" && v.contaCredito.codigo === "6.2.2.1.1.00.00") return "existente";
      await publicarRoteiroOrcamentario(prisma, {
        tipo: "CREDITO_ADICIONAL",
        tipoCredito: "ESPECIAL",
        abertura: "ABERTO",
        contaDebitoCodigo: "5.2.2.1.2.02.01",
        contaCreditoCodigo: "6.2.2.1.1.00.00",
        fundamento:
          "Crédito especial aberto no exercício da lei (Lei 4.320/1964 art. 41, II; CF art. 167 § 2º): " +
          "a dotação adicional entra em 5.2.2.1.2.02.01 CRÉDITOS ESPECIAIS ABERTOS, do plano oficial " +
          "carregado, e o crédito fica disponível em 6.2.2.1.1 - o par do suplementar já publicado. " +
          "Configuração do ambiente de demonstração.",
        criadoPor: AUTOR,
      });
      return "criado";
    });

    // ══ 2. PPA 2026–2029 ════════════════════════════════════════════════════════
    const estrutura = {
      eixo: { codigo: "E01", descricao: "Gestão pública eficiente e desenvolvimento social" },
      areas: [
        { codigo: "AT01", descricao: "Educação básica de qualidade" },
        { codigo: "AT02", descricao: "Saúde na atenção básica" },
        { codigo: "AT03", descricao: "Modernização da gestão" },
      ],
      publico: { codigo: "PA01", descricao: "População do município" },
    };
    let eixoId: string | undefined;
    await passo(`Eixo ${estrutura.eixo.codigo}`, async () => {
      const e = await prisma.eixoEstruturante.findFirst({ where: { codigo: estrutura.eixo.codigo }, select: { id: true } });
      if (e !== null) { eixoId = e.id; return "existente"; }
      eixoId = (await criarEixoEstruturante(prisma, { ...estrutura.eixo, criadoPor: AUTOR })).eixoId;
      return "criado";
    });
    const areaId = new Map<string, string>();
    for (const a of estrutura.areas) {
      await passo(`Área temática ${a.codigo}`, async () => {
        const e = await prisma.areaTematica.findFirst({ where: { codigo: a.codigo }, select: { id: true } });
        if (e !== null) { areaId.set(a.codigo, e.id); return "existente"; }
        if (eixoId === undefined) return "eixo indisponível";
        areaId.set(a.codigo, (await criarAreaTematica(prisma, { ...a, eixoId, criadoPor: AUTOR })).areaTematicaId);
        return "criado";
      });
    }
    let publicoId: string | undefined;
    await passo(`Público-alvo ${estrutura.publico.codigo}`, async () => {
      const e = await prisma.publicoAlvo.findFirst({ where: { codigo: estrutura.publico.codigo }, select: { id: true } });
      if (e !== null) { publicoId = e.id; return "existente"; }
      publicoId = (await criarPublicoAlvo(prisma, { ...estrutura.publico, criadoPor: AUTOR })).publicoAlvoId;
      return "criado";
    });

    let planoId: string | undefined;
    await passo("PPA 2026–2029 (Lei nº 1.482/2025)", async () => {
      const e = await prisma.planoPlurianual.findUnique({ where: { anoInicio: 2026 }, select: { id: true } });
      if (e !== null) { planoId = e.id; return "existente"; }
      planoId = (await criarPlanoPlurianual(prisma, {
        anoInicio: 2026, anoFim: 2029, leiRef: "Lei Municipal nº 1.482, de 18 de dezembro de 2025",
        dataPublicacao: dia("2025-12-19"), criadoPor: AUTOR,
      })).planoId;
      return "criado";
    });

    let programaPpaId: string | undefined;
    await passo("Programa 0001 no PPA (R$ 2.900.000,00 no quadriênio)", async () => {
      if (planoId === undefined) return "plano indisponível";
      const e = await prisma.programaPpa.findUnique({ where: { planoId_programaId: { planoId, programaId: programa.id } }, select: { id: true } });
      if (e !== null) { programaPpaId = e.id; return "existente"; }
      const area = areaId.get("AT03");
      if (area === undefined) return "área temática indisponível";
      programaPpaId = (await criarProgramaPpa(prisma, {
        planoId, programaId: programa.id, areaTematicaId: area,
        ...(publicoId !== undefined ? { publicoAlvoId: publicoId } : {}),
        estrategia: "Manter os serviços administrativos que dão suporte às secretarias de educação, saúde e administração, com contratação por licitação e controle da execução.",
        valorPrevisto: "2900000.00", criadoPor: AUTOR,
      })).programaPpaId;
      return "criado";
    });

    let acaoPpaId: string | undefined;
    await passo("Ação 2001 no programa do PPA (meta financeira R$ 2.640.000,00)", async () => {
      if (programaPpaId === undefined) return "programa do PPA indisponível";
      const e = await prisma.acaoPpa.findUnique({ where: { programaPpaId_acaoId: { programaPpaId, acaoId: acao.id } }, select: { id: true } });
      if (e !== null) { acaoPpaId = e.id; return "existente"; }
      acaoPpaId = (await criarAcaoPpa(prisma, {
        programaPpaId, acaoId: acao.id, unidadeExecutoraId: uo.id, funcaoId: f04!, subfuncaoId: s122!,
        produto: "Unidade administrativa mantida", unidadeMedida: "unidade", regiaoAtendida: "Todo o município",
        metaFisica: "12", metaFinanceira: "2640000.00", criadoPor: AUTOR,
      })).acaoPpaId;
      return "criado";
    });

    const INDICADORES = [
      { descricao: "Processos de contratação concluídos no prazo", unidadeMedida: "percentual", situacaoInicial: "68", situacaoModificada: "85" },
      { descricao: "Tempo médio de pagamento a fornecedores", unidadeMedida: "dias", situacaoInicial: "38", situacaoModificada: "25" },
    ];
    for (const i of INDICADORES) {
      await passo(`Indicador "${i.descricao}"`, async () => {
        if (programaPpaId === undefined) return "programa do PPA indisponível";
        const e = await prisma.indicadorPrograma.findFirst({ where: { programaPpaId, descricao: i.descricao }, select: { id: true } });
        if (e !== null) return "existente";
        await criarIndicadorPrograma(prisma, { programaPpaId, ...i, criadoPor: AUTOR });
        return "criado";
      });
    }

    // Previsão da receita no quadriênio: a mesma natureza e fonte da LOA (11130211/500).
    const PREVISOES = [
      { ano: 2026, valor: "150000.00" }, { ano: 2027, valor: "158000.00" },
      { ano: 2028, valor: "166000.00" }, { ano: 2029, valor: "175000.00" },
    ];
    const previsaoId = new Map<number, string>();
    for (const p of PREVISOES) {
      await passo(`Previsão de receita do PPA ${p.ano} (11130211/500, R$ ${p.valor})`, async () => {
        if (planoId === undefined) return "plano indisponível";
        const e = await prisma.previsaoReceitaPpa.findUnique({
          where: { planoId_naturezaReceitaId_fonteId_ano: { planoId, naturezaReceitaId: natReceita.id, fonteId: fonte.id, ano: p.ano } },
          select: { id: true },
        });
        if (e !== null) { previsaoId.set(p.ano, e.id); return "existente"; }
        previsaoId.set(p.ano, (await criarPrevisaoReceitaPpa(prisma, {
          planoId, naturezaReceitaId: natReceita.id, fonteId: fonte.id, ano: p.ano, valor: p.valor, criadoPor: AUTOR,
        })).previsaoId);
        return "criado";
      });
    }
    for (const r of [{ ano: 2024, valor: "128400.00" }, { ano: 2025, valor: "139750.00" }]) {
      await passo(`Série histórica ${r.ano} (11130211, R$ ${r.valor})`, async () => {
        if (planoId === undefined) return "plano indisponível";
        const e = await prisma.receitaAnteriorPpa.findUnique({
          where: { planoId_naturezaReceitaId_ano: { planoId, naturezaReceitaId: natReceita.id, ano: r.ano } },
          select: { id: true },
        });
        if (e !== null) return "existente";
        await criarReceitaAnteriorPpa(prisma, { planoId, naturezaReceitaId: natReceita.id, ano: r.ano, valor: r.valor, criadoPor: AUTOR });
        return "criado";
      });
    }

    // ── A lei que altera o PPA: o original fica, o vigente é original + ajustes ──
    await passo("Lei nº 1.519/2026 alterando o PPA (programa +150.000,00; ação +150.000,00; previsão 2027 +12.000,00)", async () => {
      if (planoId === undefined || programaPpaId === undefined || acaoPpaId === undefined) return "peça ou linhas do PPA indisponíveis";
      const e = await prisma.atoDeAlteracaoDoPlanejamento.findUnique({
        where: { planoId_ano_numero: { planoId, ano: 2026, numero: "1.519" } },
        select: { id: true },
      });
      if (e !== null) return "existente";
      const prev2027 = previsaoId.get(2027);
      if (prev2027 === undefined) return "previsão de 2027 indisponível";
      await registrarAtoDeAlteracaoDoPlanejamento(prisma, {
        peca: "PPA", pecaId: planoId, numero: "1.519", ano: 2026,
        data: dia("2026-06-15"), dataPublicacao: dia("2026-06-16"),
        fundamento: "Revisão do PPA 2026–2029 para reforçar a manutenção dos serviços administrativos e atualizar a projeção do IPTU após o recadastramento imobiliário.",
        itens: [
          { alvo: "PROGRAMA_PPA", alvoId: programaPpaId, grandeza: "valorPrevisto", valorAjuste: "150000.00", justificativa: "Ampliação da manutenção administrativa no quadriênio." },
          { alvo: "ACAO_PPA", alvoId: acaoPpaId, grandeza: "metaFinanceira", valorAjuste: "150000.00", justificativa: "Reforço da ação 2001." },
          { alvo: "PREVISAO_RECEITA_PPA", alvoId: prev2027, grandeza: "valor", valorAjuste: "12000.00", justificativa: "Efeito do recadastramento imobiliário sobre o IPTU." },
        ],
        criadoPor: AUTOR,
      });
      return "criado";
    });

    // ══ 3. LDO 2026 ═════════════════════════════════════════════════════════════
    let ldoId: string | undefined;
    await passo("LDO 2026 (sancionada em 14/07/2025)", async () => {
      const e = await prisma.leiDiretrizesOrcamentarias.findFirst({ where: { exercicio: 2026 }, select: { id: true } });
      if (e !== null) { ldoId = e.id; return "existente"; }
      ldoId = (await criarLdo(prisma, {
        exercicio: 2026, inicioVigencia: dia("2026-01-01"), fimVigencia: dia("2026-12-31"),
        dataEnvioLegislativo: dia("2025-04-15"), dataDevolucaoExecutivo: dia("2025-07-03"),
        numeroProtocolo: "PL 027/2025", dataSancao: dia("2025-07-14"), criadoPor: AUTOR,
      })).ldoId;
      return "criado";
    });
    const PRIORIDADES = [
      { descricaoAcao: "Manutenção preventiva das escolas municipais", produto: "Escola mantida", unidadeMedida: "unidade", meta: "24", comAcao: false },
      { descricaoAcao: "Exames e consultas especializadas para a atenção básica", produto: "Procedimento realizado", unidadeMedida: "procedimento", meta: "3600", comAcao: false },
      { descricaoAcao: "Manutenção dos serviços administrativos", produto: "Unidade administrativa mantida", unidadeMedida: "unidade", meta: "12", comAcao: true },
    ];
    for (const p of PRIORIDADES) {
      await passo(`Prioridade da LDO "${p.descricaoAcao}"`, async () => {
        if (ldoId === undefined) return "LDO indisponível";
        const e = await prisma.prioridadeLdo.findFirst({ where: { ldoId, descricaoAcao: p.descricaoAcao }, select: { id: true } });
        if (e !== null) return "existente";
        await criarPrioridadeLdo(prisma, {
          ldoId, ...(p.comAcao ? { acaoId: acao.id } : {}), descricaoAcao: p.descricaoAcao,
          produto: p.produto, unidadeMedida: p.unidadeMedida, meta: p.meta, criadoPor: AUTOR,
        });
        return "criado";
      });
    }
    const METAS = [
      { ano: 2026, receitaTotal: "660000.00", receitaPrimaria: "655000.00", despesaTotal: "660000.00", despesaPrimaria: "648000.00", resultadoNominal: "4500.00", dividaPublicaConsolidada: "120000.00", dividaConsolidadaLiquida: "85000.00" },
      { ano: 2027, receitaTotal: "690000.00", receitaPrimaria: "684500.00", despesaTotal: "690000.00", despesaPrimaria: "676000.00", resultadoNominal: "5200.00", dividaPublicaConsolidada: "110000.00", dividaConsolidadaLiquida: "76000.00" },
      { ano: 2028, receitaTotal: "720000.00", receitaPrimaria: "714000.00", despesaTotal: "720000.00", despesaPrimaria: "704500.00", resultadoNominal: "6000.00", dividaPublicaConsolidada: "100000.00", dividaConsolidadaLiquida: "66000.00" },
    ];
    for (const m of METAS) {
      await passo(`Meta anual da LDO ${m.ano}`, async () => {
        if (ldoId === undefined) return "LDO indisponível";
        const e = await prisma.metaAnualLdo.findUnique({ where: { ldoId_ano: { ldoId, ano: m.ano } }, select: { id: true } });
        if (e !== null) return "existente";
        await criarMetaAnualLdo(prisma, {
          ldoId, ...m, receitaPrimariaPpp: "0.00", despesaPrimariaPpp: "0.00", impactoSaldoPpp: "0.00", criadoPor: AUTOR,
        });
        return "criado";
      });
    }

    // ══ 4. FICHAS (como a tela: nascem sem dotação) + CRÉDITO ESPECIAL ═══════════
    const FICHAS = [
      { numero: 101, funcao: "12", subfuncao: "361", natureza: "339039", rotulo: "Educação — ensino fundamental, serviços de terceiros PJ", credito: "150000.00" },
      { numero: 102, funcao: "10", subfuncao: "301", natureza: "339039", rotulo: "Saúde — atenção básica, serviços de terceiros PJ", credito: "100000.00" },
      { numero: 103, funcao: "12", subfuncao: "361", natureza: "319011", rotulo: "Educação — vencimentos e vantagens fixas (pessoal civil)", credito: "50000.00" },
    ];
    const fichaId = new Map<number, string>();
    const m02 = criarM02Deps(prisma);
    for (const f of FICHAS) {
      await passo(`Ficha ${f.numero}/${EXERCICIO} ${f.rotulo}`, async () => {
        const e = await prisma.fichaOrcamentaria.findUnique({ where: { exercicio_numero: { exercicio: EXERCICIO, numero: f.numero } }, select: { id: true } });
        if (e !== null) { fichaId.set(f.numero, e.id); return "existente"; }
        const id = await criarFicha({
          exercicio: EXERCICIO, numero: f.numero, exercicioFonte: 1, valorDotado: "0.00", criadoPor: AUTOR,
          classificacao: {
            orgao: "01", unidadeOrc: "01001", funcao: f.funcao, subfuncao: f.subfuncao,
            programa: "0001", acao: "2001", naturezaDespesa: f.natureza, fonte: "500",
          },
        }, m02);
        fichaId.set(f.numero, id);
        return "criado";
      });
    }

    const m03 = criarM03DepsAmarrado(prisma);
    let leiId: string | undefined;
    await passo("Lei de crédito especial nº 1.497/2026 (R$ 300.000,00)", async () => {
      const e = await prisma.leiCredito.findUnique({ where: { ano_numero: { ano: 2026, numero: "1.497" } }, select: { id: true } });
      if (e !== null) { leiId = e.id; return "existente"; }
      leiId = await criarLei({
        numero: "1.497", ano: 2026, tipoCredito: "ESPECIAL", valorAutorizado: "300000.00",
        dataPublicacao: dia("2026-02-20"), criadoPor: AUTOR,
      }, m03);
      return "criado";
    });
    let decretoId: string | undefined;
    await passo("Decreto nº 0015/2026 (crédito especial por anulação da ficha 2)", async () => {
      const e = await prisma.decretoCredito.findUnique({ where: { ano_numero: { ano: 2026, numero: "0015" } }, select: { id: true } });
      if (e !== null) { decretoId = e.id; return "existente"; }
      if (leiId === undefined) return "lei indisponível";
      decretoId = await criarDecreto({ leiId, numero: "0015", ano: 2026, data: dia("2026-02-27"), origemRecurso: "ANULACAO", criadoPor: AUTOR }, m03);
      return "criado";
    });
    await passo("Movimentos do decreto 0015/2026 (anula R$ 300.000,00 da ficha 2; abre 101/102/103)", async () => {
      if (decretoId === undefined) return "decreto indisponível";
      const ja = await prisma.itemCredito.count({ where: { decretoId } });
      if (ja > 0) return "existente";
      const ids = FICHAS.map((f) => fichaId.get(f.numero));
      if (ids.some((x) => x === undefined)) return "fichas indisponíveis";
      await executarCredito({
        decretoId,
        itens: [
          { fichaId: "ac-ficha-reexec", tipo: "ANULACAO", valor: "300000.00", fonteId: fonte.id },
          ...FICHAS.map((f) => ({ fichaId: fichaId.get(f.numero)!, tipo: "SUPLEMENTACAO" as const, valor: f.credito, fonteId: fonte.id })),
        ],
        criadoPor: AUTOR,
      }, m03);
      return "criado";
    });

    // ══ 5. ARRECADAÇÃO E EXECUÇÃO — em ordem de data (a fila do art. 141 é por data) ══
    const conta = await prisma.contaBancaria.findUnique({
      where: { codigo: "CC-500-01" },
      select: { codigo: true, contaContabil: { select: { codigo: true } } },
    });
    if (conta?.contaContabil === null || conta === null) throw new Error("Conta CC-500-01 sem conta contábil mapeada.");
    const disponibilidade = conta.contaContabil.codigo;
    const m04 = criarM04Deps(prisma);
    const m05Empenho = criarM05DepsComContratos(prisma);
    const m05Liquidacao = criarM05DepsComAlmoxarifado(prisma);
    const m05Pagamento = criarM05Deps(prisma);
    // A VPA da guia é a que a porta da tela usa (`lib/portas/arrecadacao.ts`, CONTA_VPA).
    const CONTA_VPA_DA_TELA = "4.1.1.2.1.01.00";

    type Evento =
      | { readonly tipo: "guia"; readonly data: string; readonly numero: string; readonly valor: string; readonly natureza?: string; readonly imposto?: string }
      | { readonly tipo: "empenho"; readonly data: string; readonly ficha: number; readonly numero: string; readonly modalidade: "ORDINARIO" | "GLOBAL" | "ESTIMATIVO"; readonly valor: string; readonly credor: string; readonly historico: string }
      | { readonly tipo: "liquidacao"; readonly data: string; readonly ficha: number; readonly empenho: string; readonly numero: string; readonly valor: string; readonly nf: string; readonly historico: string }
      | { readonly tipo: "pagamento"; readonly data: string; readonly ficha: number; readonly empenho: string; readonly liquidacao: string; readonly numero: string; readonly valor: string; readonly historico: string };

    const EVENTOS: Evento[] = [
      // IPTU — natureza 11130211, fonte 500 (a única natureza de receita do catálogo do banco)
      { tipo: "guia", data: "2026-02-27", numero: "IPTU-2026-02", valor: "58640.25" },
      { tipo: "guia", data: "2026-03-31", numero: "IPTU-2026-03", valor: "31275.80" },
      { tipo: "guia", data: "2026-04-30", numero: "IPTU-2026-04", valor: "16410.35" },
      { tipo: "guia", data: "2026-05-29", numero: "IPTU-2026-05", valor: "11902.60" },
      { tipo: "guia", data: "2026-06-30", numero: "IPTU-2026-06", valor: "9318.45" },
      { tipo: "guia", data: "2026-07-31", numero: "IPTU-2026-07", valor: "7466.90" },
      { tipo: "guia", data: "2026-08-31", numero: "IPTU-2026-08", valor: "6235.15" },
      // Impostos municipais nas naturezas do ementário oficial (fonte 500) — base de impostos dos
      // Anexos 3 (RCL), 8 (MDE) e 12 (ASPS). Um pouco em cada bimestre até o 5º, antes de 28/09.
      { tipo: "guia", data: "2026-03-31", numero: "GUIA-IPTU-2026-03", valor: "18450.00", natureza: "11180111", imposto: "IPTU" },
      { tipo: "guia", data: "2026-07-15", numero: "GUIA-IPTU-2026-07", valor: "9820.40", natureza: "11180111", imposto: "IPTU" },
      { tipo: "guia", data: "2026-09-10", numero: "GUIA-IPTU-2026-09", valor: "3215.30", natureza: "11180111", imposto: "IPTU" },
      { tipo: "guia", data: "2026-05-20", numero: "GUIA-ITBI-2026-05", valor: "6300.00", natureza: "11180141", imposto: "ITBI" },
      { tipo: "guia", data: "2026-08-18", numero: "GUIA-ITBI-2026-08", valor: "4150.75", natureza: "11180141", imposto: "ITBI" },
      { tipo: "guia", data: "2026-04-10", numero: "GUIA-ISS-2026-04", valor: "12735.60", natureza: "11180231", imposto: "ISSQN" },
      { tipo: "guia", data: "2026-07-10", numero: "GUIA-ISS-2026-07", valor: "11980.20", natureza: "11180231", imposto: "ISSQN" },
      { tipo: "guia", data: "2026-09-15", numero: "GUIA-ISS-2026-09", valor: "13402.90", natureza: "11180231", imposto: "ISSQN" },
      // Educação — ficha 101
      { tipo: "empenho", data: "2026-03-10", ficha: 101, numero: "2026NE000101", modalidade: "ORDINARIO", valor: "32000.00", credor: CREDOR.construtora, historico: "Manutenção predial preventiva das escolas municipais - 1º semestre de 2026" },
      { tipo: "liquidacao", data: "2026-04-15", ficha: 101, empenho: "2026NE000101", numero: "2026NL000101", valor: "32000.00", nf: "1187", historico: "Serviços de manutenção predial das escolas executados e atestados - NF 1187" },
      { tipo: "pagamento", data: "2026-04-24", ficha: 101, empenho: "2026NE000101", liquidacao: "2026NL000101", numero: "2026OB000101", valor: "32000.00", historico: "Pagamento da NF 1187 - manutenção predial das escolas" },
      { tipo: "empenho", data: "2026-05-05", ficha: 101, numero: "2026NE000102", modalidade: "ORDINARIO", valor: "18750.00", credor: CREDOR.grafica, historico: "Impressão de material didático complementar para o ensino fundamental" },
      { tipo: "liquidacao", data: "2026-05-28", ficha: 101, empenho: "2026NE000102", numero: "2026NL000102", valor: "18750.00", nf: "5521", historico: "Material didático impresso entregue às escolas - NF 5521" },
      { tipo: "pagamento", data: "2026-06-05", ficha: 101, empenho: "2026NE000102", liquidacao: "2026NL000102", numero: "2026OB000102", valor: "18750.00", historico: "Pagamento da NF 5521 - material didático impresso" },
      { tipo: "empenho", data: "2026-07-01", ficha: 101, numero: "2026NE000103", modalidade: "GLOBAL", valor: "36000.00", credor: CREDOR.construtora, historico: "Reparos em unidades escolares - 2º semestre de 2026" },
      { tipo: "liquidacao", data: "2026-08-14", ficha: 101, empenho: "2026NE000103", numero: "2026NL000103", valor: "18000.00", nf: "1243", historico: "1ª medição dos reparos nas unidades escolares - NF 1243" },
      { tipo: "pagamento", data: "2026-08-24", ficha: 101, empenho: "2026NE000103", liquidacao: "2026NL000103", numero: "2026OB000103", valor: "18000.00", historico: "Pagamento da NF 1243 - reparos nas unidades escolares" },
      // Saúde — ficha 102
      { tipo: "empenho", data: "2026-03-12", ficha: 102, numero: "2026NE000201", modalidade: "ESTIMATIVO", valor: "30000.00", credor: CREDOR.clinica, historico: "Exames laboratoriais complementares para as unidades básicas de saúde - 2026" },
      { tipo: "liquidacao", data: "2026-04-20", ficha: 102, empenho: "2026NE000201", numero: "2026NL000201", valor: "11400.00", nf: "3310", historico: "Exames realizados em março e abril - NF 3310" },
      { tipo: "pagamento", data: "2026-04-29", ficha: 102, empenho: "2026NE000201", liquidacao: "2026NL000201", numero: "2026OB000201", valor: "11400.00", historico: "Pagamento da NF 3310 - exames laboratoriais" },
      { tipo: "liquidacao", data: "2026-06-18", ficha: 102, empenho: "2026NE000201", numero: "2026NL000202", valor: "9975.00", nf: "3398", historico: "Exames realizados em maio e junho - NF 3398" },
      { tipo: "pagamento", data: "2026-06-26", ficha: 102, empenho: "2026NE000201", liquidacao: "2026NL000202", numero: "2026OB000202", valor: "9975.00", historico: "Pagamento da NF 3398 - exames laboratoriais" },
      { tipo: "empenho", data: "2026-07-06", ficha: 102, numero: "2026NE000202", modalidade: "ORDINARIO", valor: "16500.00", credor: CREDOR.clinica, historico: "Consultas especializadas em cardiologia e ortopedia para a atenção básica" },
      { tipo: "liquidacao", data: "2026-08-20", ficha: 102, empenho: "2026NE000202", numero: "2026NL000203", valor: "16500.00", nf: "3452", historico: "Consultas especializadas realizadas em julho e agosto - NF 3452" },
      { tipo: "pagamento", data: "2026-09-01", ficha: 102, empenho: "2026NE000202", liquidacao: "2026NL000203", numero: "2026OB000203", valor: "16500.00", historico: "Pagamento da NF 3452 - consultas especializadas" },
    ];
    const ORDEM_NO_DIA = { guia: 0, empenho: 1, liquidacao: 2, pagamento: 3 } as const;
    const ordenados = [...EVENTOS].sort((a, b) => a.data.localeCompare(b.data) || ORDEM_NO_DIA[a.tipo] - ORDEM_NO_DIA[b.tipo]);

    const buscarEmpenho = async (ficha: number, numero: string) => {
      const fid = fichaId.get(ficha);
      if (fid === undefined) return null;
      return prisma.empenho.findUnique({ where: { fichaId_numero: { fichaId: fid, numero } }, select: { id: true } });
    };

    for (const ev of ordenados) {
      if (ev.tipo === "guia") {
        const naturezaDaGuia = ev.natureza ?? "11130211";
        await passo(`Guia ${ev.numero} de ${ev.data} (${ev.imposto ?? "IPTU"} ${naturezaDaGuia}/500, R$ ${ev.valor})`, async () => {
          const e = await prisma.receitaArrecadada.findFirst({ where: { exercicio: EXERCICIO, numeroReceita: ev.numero }, select: { id: true } });
          if (e !== null) return "existente";
          const noEmentario = await prisma.naturezaReceita.findUnique({ where: { codigo: naturezaDaGuia }, select: { id: true } });
          if (noEmentario === null) return `natureza ${naturezaDaGuia} ausente do ementário — cadastre em /receita/naturezas`;
          const natureza = await exigirNaturezaDaFonte(prisma, "500");
          await registrarArrecadacao(
            {
              exercicio: EXERCICIO, naturezaReceita: naturezaDaGuia, fonte: "500", exercicioFonte: 1,
              valor: ev.valor, dataArrecadacao: dia(ev.data), numeroReceita: ev.numero,
              contaBancaria: conta.codigo, criadoPor: AUTOR,
            },
            roteiroArrecadacao({ disponibilidade, variacaoAumentativa: CONTA_VPA_DA_TELA, naturezaDaFonte: natureza.natureza }),
            m04
          );
          return "criado";
        });
      } else if (ev.tipo === "empenho") {
        await passo(`Empenho ${ev.numero} de ${ev.data} na ficha ${ev.ficha} (${ev.modalidade}, R$ ${ev.valor})`, async () => {
          const fid = fichaId.get(ev.ficha);
          if (fid === undefined) return "ficha indisponível";
          if ((await buscarEmpenho(ev.ficha, ev.numero)) !== null) return "existente";
          await empenhar(
            {
              fichaId: fid, numero: ev.numero, tipo: ev.modalidade, valor: ev.valor, data: dia(ev.data),
              credorCpfCnpj: ev.credor, historico: ev.historico, categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: AUTOR,
            },
            roteiroEmpenho(),
            m05Empenho
          );
          return "criado";
        });
      } else if (ev.tipo === "liquidacao") {
        await passo(`Liquidação ${ev.numero} de ${ev.data} (empenho ${ev.empenho}, R$ ${ev.valor})`, async () => {
          const emp = await buscarEmpenho(ev.ficha, ev.empenho);
          if (emp === null) return "empenho indisponível";
          const e = await prisma.liquidacao.findUnique({ where: { empenhoId_numero: { empenhoId: emp.id, numero: ev.numero } }, select: { id: true } });
          if (e !== null) return "existente";
          await liquidar(
            {
              empenhoId: emp.id, numero: ev.numero, valor: ev.valor, data: dia(ev.data),
              responsavelAtesto: "Fiscal do contrato da secretaria", notaFiscalNum: ev.nf, notaFiscalSerie: "1",
              notaFiscalData: dia(ev.data), notaFiscalValor: ev.valor, historico: ev.historico, criadoPor: AUTOR,
            },
            // Elemento 39: o rol fechado de `roteiros.ts` liquida em VPD de serviços de terceiros.
            roteiroLiquidacao({ codElemento: "39", obrigacaoAPagar: CONTA_FORNECEDORES_A_PAGAR }),
            m05Liquidacao
          );
          return "criado";
        });
      } else {
        await passo(`Pagamento ${ev.numero} de ${ev.data} (liquidação ${ev.liquidacao}, R$ ${ev.valor})`, async () => {
          const emp = await buscarEmpenho(ev.ficha, ev.empenho);
          if (emp === null) return "empenho indisponível";
          const liq = await prisma.liquidacao.findUnique({ where: { empenhoId_numero: { empenhoId: emp.id, numero: ev.liquidacao } }, select: { id: true } });
          if (liq === null) return "liquidação indisponível";
          const e = await prisma.pagamento.findUnique({ where: { liquidacaoId_numero: { liquidacaoId: liq.id, numero: ev.numero } }, select: { id: true } });
          if (e !== null) return "existente";
          await pagar(
            {
              liquidacaoId: liq.id, numero: ev.numero, valor: ev.valor, data: dia(ev.data),
              contaBancaria: conta.codigo, fonteId: fonte.id, historico: ev.historico, criadoPor: AUTOR,
            },
            roteiroPagamento({ obrigacaoAPagar: CONTA_FORNECEDORES_A_PAGAR, disponibilidade }),
            m05Pagamento
          );
          return "criado";
        });
      }
    }

    // ══ 6. PESSOAL — a ficha 103 existe e tem crédito; a EXECUÇÃO não passa pelo caminho comum ══
    // Tentativa real, pela mesma função que a porta da liquidação usa: o elemento 11 não tem
    // roteiro no rol fechado (a VPD de pessoal é decisão do ente por grupo de empenho da folha).
    await passo("Liquidação de pessoal (elemento 11) pelo caminho comum da despesa", async () => {
      roteiroLiquidacao({ codElemento: "11", obrigacaoAPagar: CONTA_FORNECEDORES_A_PAGAR });
      return "o rol aceitou o elemento 11 — conferir antes de liquidar";
    });

    // ── Conferência de leitura: de-paras que os anexos exigem para a fonte 500 ──
    const [asps, mde, basesImposto] = await Promise.all([
      prisma.deParaFonteClasseAsps.findUnique({ where: { fonteCodigo: "500" }, select: { classe: true } }),
      prisma.deParaFonteClasseEducacao.findUnique({ where: { fonteCodigo: "500" }, select: { classe: true } }),
      prisma.deParaBaseImpostoAsps.findUnique({ where: { naturezaCodigo: "11130211" }, select: { chave: true } }),
    ]);
    console.log(`[de-para] fonte 500 → ASPS: ${asps?.classe ?? "NÃO MAPEADA"}; → educação: ${mde?.classe ?? "NÃO MAPEADA"}`);
    console.log(`[de-para] natureza 11130211 na base de impostos: ${basesImposto?.chave ?? "NÃO MAPEADA (fora do ementário oficial do repositório)"}`);

    const saldos = await prisma.fichaOrcamentaria.findMany({
      where: { exercicio: EXERCICIO },
      orderBy: { numero: "asc" },
      select: { numero: true, saldoAutorizado: true, saldoEmpenhado: true, saldoDisponivel: true },
    });
    for (const s of saldos) {
      console.log(`[ficha ${s.numero}] autorizado ${s.saldoAutorizado.toFixed(2)} · empenhado ${s.saldoEmpenhado.toFixed(2)} · disponível ${s.saldoDisponivel.toFixed(2)}`);
    }
    const arrecadado = (await prisma.receitaArrecadada.findMany({ where: { exercicio: EXERCICIO, numeroReceita: { startsWith: "IPTU-2026-" } }, select: { valor: true } }))
      .reduce((s, r) => s.plus(r.valor.toFixed(2)), toMoney("0"));
    console.log(`[receita] IPTU arrecadado pelas guias deste script: ${arrecadado.toFixed(2)}`);
    for (const codigo of ["11180111", "11180141", "11180231"]) {
      const [chave, total] = await Promise.all([
        prisma.deParaBaseImpostoAsps.findUnique({ where: { naturezaCodigo: codigo }, select: { chave: true } }),
        prisma.receitaArrecadada.findMany({ where: { exercicio: EXERCICIO, tipo: "ARRECADACAO", naturezaReceita: { codigo } }, select: { valor: true } }),
      ]);
      const soma = total.reduce((s, r) => s.plus(r.valor.toFixed(2)), toMoney("0"));
      console.log(`[receita] ${codigo} (base de impostos: ${chave?.chave ?? "NÃO MAPEADA"}) arrecadado em ${EXERCICIO}: ${soma.toFixed(2)}`);
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\nCriados (${criados.length}):`);
  for (const c of criados) console.log(`  + ${c}`);
  console.log(`Já existentes (${existentes.length}):`);
  for (const c of existentes) console.log(`  = ${c}`);
  console.log(`Recusados (${recusados.length}):`);
  for (const c of recusados) console.log(`  ! ${c}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
