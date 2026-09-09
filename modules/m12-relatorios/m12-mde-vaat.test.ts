import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar } from "../m05-despesa/servico-bloco2.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import {
  roteiroArrecadacao,
  roteiroEmpenho,
  roteiroLiquidacao,
} from "../m01-core-contabil/roteiros.js";
import { semearPcasp } from "../../prisma/seed/pcasp.js";
import { bloco2Mde } from "./mde-vaat.js";

/**
 * MDE — BLOCO 2: VAAT (arts. 27 e 28), áreas de atuação e RP × lastro.
 *
 * ⚠️ TODAS AS CONTAS FEITAS À MÃO, ANTES DO CÓDIGO.
 *
 * ⚠️ A FIXTURE É A DA 7.6-a ESTENDIDA: plano de PRODUÇÃO (`semearPcasp`) + roteiros do
 * M01, porque o bloco 2 consome o `rgfAnexo5` (F4) e a amarração S1 do
 * `superavit-por-fonte` derruba se houver dinheiro sem fato de origem.
 *
 * ═══ O CENÁRIO (2026, 6º bimestre → acompanhamento pela EMPENHADA) ═══
 * FONTES: 540 = FUNDEB · 541 = VAAT
 *
 * RECEITA:
 *   retorno FUNDEB (fonte 540) ......... 250.000
 *   complementação VAAT (fonte 541) .... 100.000
 *   ⇒ (6) recebido do FUNDEB = 350.000 · (6.3) VAAT = 100.000
 *
 * DESPESA (todas na fonte 541, classe VAAT, função 12):
 *   capital   — natureza 449052 (codCategoria "4"), subfunção 361 ..... 12.000
 *   infantil  — natureza 339039 (codCategoria "3"), subfunção 365 ..... 40.000
 *   admin     — natureza 339039, subfunção 122 (NÃO é área de ensino) .. 8.000
 *
 * ═══ t1 — VAAT CAPITAL (art. 27): ABAIXO DOS 15% ═══
 *   12.000 / 100.000 = 12,00%  <  15%  ⇒ atingiu = false
 *   ⚠️ O número sai como é. Truncar ou arredondar para 15% esconderia a glosa.
 *
 * ═══ t2 — VAAT EDUCAÇÃO INFANTIL (art. 28): APURA, NÃO COMPARA ═══
 *   40.000 / 100.000 = 40,00% — e `minimo` é `null`, `atingiu` é `null`.
 *   Os 50% do art. 28 são da distribuição GLOBAL; a obrigação do ente é o IEI dele,
 *   publicado pelo Executivo Federal. Sem o IEI, comparar seria inventar a obrigação.
 *
 * ═══ t3 — ÁREAS: o que nenhuma área identifica NÃO é dividido ═══
 *   INFANTIL 40.000 · FUNDAMENTAL 12.000 · demais 0 · naoRateado = 8.000
 *   Σ áreas (52.000) + naoRateado (8.000) = 60.000 = a despesa VAAT inteira.
 *
 * ═══ t4 — RP × LASTRO ═══
 *   sem RP inscrito: semLastro = 0,00 em todas as fontes.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "orcamento@cg.pb.gov.br"; // usuário de fixtures (ADMIN)
const F_FUNDEB = "540";
const F_VAAT = "541";
const CREDOR = "12345678000199";

const N_RETORNO = "17510151";
const N_VAAT = "17530151";

const R_ARREC = roteiroArrecadacao({
  disponibilidade: "1.1.1.1.1.00.00",
  variacaoAumentativa: "4.1.1.2.1.01.00",
});
const R_EMP = roteiroEmpenho();
const R_LIQ = roteiroLiquidacao({ codElemento: "39", obrigacaoAPagar: "2.1.3.1.1.00.00" });

let m04: ReturnType<typeof criarM04Deps>;
let deps: M05Deps;
let seq = 0;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await semearPcasp(prisma);
  m04 = criarM04Deps(prisma);
  deps = criarM05Deps(prisma);
  seq = 0;

  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.createMany({
    data: [
      { id: "sub-361", codigo: "361", nome: "Ensino Fundamental" },
      { id: "sub-365", codigo: "365", nome: "Educação Infantil" },
      { id: "sub-122", codigo: "122", nome: "Administração Geral" },
    ],
  });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2012", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.createMany({
    data: [
      // ⚠️ codCategoria "4" = CAPITAL — é este dígito que o art. 27 pergunta.
      { id: "nd-cap", codCategoria: "4", codNatureza: "4", codModalidade: "90", codElemento: "52", codigoCompleto: "449052", descricao: "Equipamentos" },
      { id: "nd-cor", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços" },
    ],
  });
  await prisma.naturezaReceita.createMany({
    data: [
      { id: "nr-retorno", codigo: N_RETORNO, descricao: "FUNDEB retorno" },
      { id: "nr-vaat", codigo: N_VAAT, descricao: "Complementação VAAT" },
    ],
  });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: "fnt-540", codigo: F_FUNDEB, descricao: "FUNDEB", codigoTce: "540" },
      { id: "fnt-541", codigo: F_VAAT, descricao: "FUNDEB — complementação VAAT", codigoTce: "541" },
    ],
  });
  await prisma.contaBancaria.createMany({
    data: [
      { id: "cb-540", codigo: "CC-540", descricao: "FUNDEB", fonteId: "fnt-540" },
      { id: "cb-541", codigo: "CC-541", descricao: "VAAT", fonteId: "fnt-541" },
    ],
  });
  await prisma.exercicio.upsert({ where: { ano: 2026 }, update: {}, create: { ano: 2026, criadoPor: "TESTE" } });

  await prisma.deParaFundebReceita.createMany({
    data: [
      { naturezaCodigo: N_RETORNO, papel: "RETORNO", criadoPor: "T" },
      { naturezaCodigo: N_VAAT, papel: "VAAT", criadoPor: "T" },
    ],
  });
  // ⚠️ AS DUAS CLASSES: o fail-closed do bloco 1 derruba fonte de educação sem classe.
  await prisma.deParaFonteClasseEducacao.createMany({
    data: [
      { fonteCodigo: F_FUNDEB, classe: "FUNDEB", criadoPor: "T" },
      { fonteCodigo: F_VAAT, classe: "VAAT", criadoPor: "T" },
    ],
  });
}

async function arrecadar(natureza: string, fonte: string, valor: string, guia: string): Promise<void> {
  await registrarArrecadacao(
    {
      exercicio: 2026, naturezaReceita: natureza, fonte, valor,
      dataArrecadacao: new Date("2026-01-20T12:00:00Z"), numeroReceita: guia, criadoPor: POR,
    },
    R_ARREC,
    m04
  );
}

/** Uma despesa de educação: cria a ficha (fonte × subfunção × natureza), empenha e liquida. */
async function gastar(
  fonteId: string, subfuncaoId: string, naturezaDespesaId: string, valor: string
): Promise<void> {
  const fichaId = `ficha-${++seq}`;
  await criarFichaDeTeste(prisma, {
    id: fichaId, exercicio: 2026, numero: seq, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-12", subfuncaoId, programaId: "prg", acaoId: "aca",
    naturezaDespesaId, fonteId, valorDotado: "1000000.00",
  });
  const e = await empenhar(
    {
      fichaId, numero: `NE-${seq}`, tipo: "ORDINARIO", valor,
      data: new Date("2026-02-01T12:00:00Z"), credorCpfCnpj: CREDOR,
      historico: "educação", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR,
    },
    R_EMP,
    deps
  );
  await liquidar(
    {
      empenhoId: e.empenhoId, numero: `NL-${seq}`, valor,
      data: new Date("2026-03-01T12:00:00Z"), responsavelAtesto: "F",
      historico: "l", criadoPor: POR,
    },
    R_LIQ,
    deps
  );
}

async function cenario(): Promise<void> {
  await arrecadar(N_RETORNO, F_FUNDEB, "250000.00", "G-RET");
  await arrecadar(N_VAAT, F_VAAT, "100000.00", "G-VAAT");
  await gastar("fnt-541", "sub-361", "nd-cap", "12000.00"); // capital
  await gastar("fnt-541", "sub-365", "nd-cor", "40000.00"); // infantil
  await gastar("fnt-541", "sub-122", "nd-cor", "8000.00"); // não identificável
}

describe("M12 — MDE bloco 2: VAAT, áreas e RP × lastro", () => {
  beforeEach(async () => {
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: VAAT capital (art. 27) — 12% contra um mínimo de 15%, e o número sai como é", async () => {
    await cenario();
    const b2 = await bloco2Mde(prisma, { exercicio: 2026, bimestre: 6 });

    expect(b2.vaatCapital.base).toBe("100000.00");
    expect(b2.vaatCapital.aplicado).toBe("12000.00");
    expect(b2.vaatCapital.percentual).toBe("12.00");
    expect(b2.vaatCapital.minimo).toBe("15.00");
    // ⚠️ ABAIXO do mínimo. O relatório acusa; não arredonda para o teto.
    expect(b2.vaatCapital.atingiu).toBe(false);
    expect(b2.vaatCapital.interruptor).toBeNull();
  });

  it("t2: VAAT infantil (art. 28) — APURA 40%, e NÃO compara: falta o IEI do município", async () => {
    await cenario();
    const b2 = await bloco2Mde(prisma, { exercicio: 2026, bimestre: 6 });

    expect(b2.vaatEducacaoInfantil.aplicado).toBe("40000.00");
    expect(b2.vaatEducacaoInfantil.percentual).toBe("40.00");

    // ⚠️ O CORAÇÃO DESTE TESTE: sem IEI, `minimo` e `atingiu` são `null`. Comparar contra
    // os 50% do art. 28 reprovaria um ente que cumpriu o IEI dele — aqueles 50% são da
    // distribuição GLOBAL da complementação, não da obrigação do município.
    expect(b2.vaatEducacaoInfantil.minimo).toBeNull();
    expect(b2.vaatEducacaoInfantil.atingiu).toBeNull();
    expect(b2.vaatEducacaoInfantil.interruptor).toBe("IEI-MUNICIPIO");
    expect(b2.notas.some((n) => n.includes("art. 28, § único"))).toBe(true);
  });

  it("t3: ÁREAS — o não identificável fica em coluna própria, jamais dividido", async () => {
    await cenario();
    const b2 = await bloco2Mde(prisma, { exercicio: 2026, bimestre: 6 });

    const area = (chave: string) => b2.areas.find((a) => a.chave === chave)!;
    expect(area("INFANTIL").despesa).toBe("40000.00");
    expect(area("FUNDAMENTAL").despesa).toBe("12000.00");
    expect(area("MEDIO").despesa).toBe("0.00");

    // ⚠️ A subfunção 122 (administração) não é área de ensino. Sem MATRICULAS-POR-AREA,
    // ela NÃO é rateada — fica visível, e ninguém a confunde com aplicação numa área.
    expect(b2.naoRateado).toBe("8000.00");

    // Σ áreas + não rateado = a despesa de educação inteira (52.000 + 8.000).
    const somaAreas = b2.areas.reduce((s, a) => s + Number(a.despesa), 0);
    expect(somaAreas).toBe(52000);
    expect(somaAreas + Number(b2.naoRateado)).toBe(60000);

    expect(b2.notas.some((n) => n.includes("DESDOBRAMENTO-CRECHE-PRE-ESCOLA"))).toBe(true);
  });

  it("t4: RP × lastro — sem RP inscrito, nada sem lastro; e o confronto é POR FONTE", async () => {
    await cenario();
    const b2 = await bloco2Mde(prisma, { exercicio: 2026, bimestre: 6 });

    // As duas fontes de educação aparecem — e só elas.
    expect(b2.rpPorFonte.map((r) => r.fonte).sort()).toEqual(["540", "541"]);
    expect(b2.rpPorFonte.find((r) => r.fonte === "541")!.classe).toBe("VAAT");

    for (const r of b2.rpPorFonte) {
      expect(r.restosAPagar).toBe("0.00");
      expect(r.semLastro).toBe("0.00");
    }
    expect(b2.rpSemLastroTotal).toBe("0.00");
  });

  it("t5: SEM VAAT no exercício — o mínimo não se aplica, e 0% NÃO é a resposta", async () => {
    // Só o retorno; nenhuma complementação-VAAT.
    await arrecadar(N_RETORNO, F_FUNDEB, "250000.00", "G-RET");

    const b2 = await bloco2Mde(prisma, { exercicio: 2026, bimestre: 6 });

    // ⚠️ `percentual: null`, não "0.00". Sem complementação não há mínimo a cumprir —
    // exibir 0% diria que o ente descumpriu algo que não lhe foi imposto. E é a divisão
    // por zero que produziria esse 0%.
    expect(b2.vaatCapital.base).toBe("0.00");
    expect(b2.vaatCapital.percentual).toBeNull();
    expect(b2.vaatCapital.atingiu).toBeNull();
    expect(b2.vaatCapital.interruptor).toBe("SEM-VAAT-NO-EXERCICIO");
  });
});
