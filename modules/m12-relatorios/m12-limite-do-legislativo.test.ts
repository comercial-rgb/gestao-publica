import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { apurarLimiteDoLegislativo, declararParametroDoLimiteDoLegislativo, faixaDaPopulacao } from "./limite-do-legislativo.js";

/**
 * ═══ O LIMITE DO ART. 29-A — CONTAS À MÃO ═══
 *
 * População 32.599 (IBGE, Esperança 2025) → inciso I, 7%. Base declarada 1.000.000,00 → limite 70.000,00. A LOA da
 * Câmara fixa 120.000,00, acima do limite: o devido no ano é 70.000,00 e o duodécimo, 70.000 / 12 = 5.833,33.
 * Repasses: 5.833,33 em 15/01 (em dia) e 5.833,33 em 25/02 (depois do dia 20). Até 28/02: janeiro em dia, fevereiro
 * não; repassado 11.666,66.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
const POR = "m12@cg.pb.gov.br";
const D = (iso: string): Date => new Date(`${iso}T12:00:00-03:00`);

describe("m12 — o limite do repasse ao Legislativo (CF 29-A)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: a faixa pelo número de habitantes, nas bordas", () => {
    expect([32599, 100000, 100001, 300001, 8000000, 8000001].map((n) => faixaDaPopulacao(n).inciso)).toEqual(["I", "I", "II", "III", "V", "VI"]);
    expect(faixaDaPopulacao(32599).percentual).toBe("7.0");
  });

  describe("contra banco", () => {
    beforeEach(async () => {
      await limparBanco(prisma);
      await prisma.exercicio.create({ data: { ano: 2026, criadoPor: "TESTE" } });
      await prisma.contaPcasp.createMany({
        data: [
          { id: "c-vpd", codigo: "3.5.1.1.1.00.00", nome: "Transferências concedidas", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
          { id: "c-vpa", codigo: "4.5.1.1.1.00.00", nome: "Transferências recebidas", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
        ],
      });
      await prisma.unidadeGestora.createMany({
        data: [
          { id: "ug-pm", codigoTce: "201078", nome: "Prefeitura", naturezaJuridica: "PREFEITURA_OU_SECRETARIA", vigenteDesde: D("2026-01-01"), fundamento: "teste de limite", criadoPor: "TESTE" },
          { id: "ug-cm", codigoTce: "101078", nome: "Câmara", naturezaJuridica: "CAMARA_MUNICIPAL", vigenteDesde: D("2026-01-01"), fundamento: "teste de limite", criadoPor: "TESTE" },
        ],
      });
      await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Legislativo" } });
      await prisma.unidadeOrcamentaria.create({ data: { id: "uo-cm", codigo: "01001", descricao: "Câmara", orgaoId: "org-01" } });
      await prisma.vinculoDaUnidadeOrcamentariaComUg.create({ data: { unidadeOrcId: "uo-cm", ugId: "ug-cm", vigenteDesde: D("2026-01-01"), fundamento: "teste de limite", criadoPor: "TESTE" } });
      await prisma.funcao.create({ data: { id: "f01", codigo: "01", nome: "Legislativa" } });
      await prisma.subfuncao.create({ data: { id: "s031", codigo: "031", nome: "Ação legislativa" } });
      await prisma.programa.create({ data: { id: "p1", codigo: "1001", descricao: "Legislativo" } });
      await prisma.acao.create({ data: { id: "a1", codigo: "2001", descricao: "Manutenção", tipo: "ATIVIDADE" } });
      await prisma.naturezaDespesa.create({ data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços" } });
      await prisma.fonteRecurso.create({ data: { id: "f500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
      await criarFichaDeTeste(prisma, { id: "ficha-cm", numero: 1, exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-cm", funcaoId: "f01", subfuncaoId: "s031", programaId: "p1", acaoId: "a1", fonteId: "f500", naturezaDespesaId: "nd", valorDotado: "120000.00" });
      const cont = await prisma.contabilizacaoDaTransferenciaEntreUgs.create({ data: { tipo: "DUODECIMO", contaConcedidaId: "c-vpd", contaRecebidaId: "c-vpa", vigenteDesde: D("2026-01-01"), fundamento: "teste de limite", criadoPor: "TESTE" }, select: { id: true } });
      // o lado concedido escriturado (o banco exige ao menos um lado com lançamento e conta): um lançamento de apoio
      await prisma.contaPcasp.create({ data: { id: "c-banco", codigo: "1.1.1.1.1.19.00", nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true } });
      await prisma.contaBancaria.create({ data: { id: "cb-pm", codigo: "CC-PM", descricao: "Movimento", fonteId: "f500", contaContabilId: "c-banco" } });
      let n = 0;
      for (const [dia, valor] of [["2026-01-15", "5833.33"], ["2026-02-25", "5833.33"]] as const) {
        const l = await prisma.lancamentoContabil.create({ data: { numeroControle: `DUO-${String(++n)}`, dataTransacao: D(dia), historico: "Duodécimo", origemTipo: "TRANSFERENCIA_ENTRE_UGS_CONCEDIDA", criadoPor: "TESTE" }, select: { id: true } });
        await prisma.transferenciaEntreUgs.create({ data: { tipo: "DUODECIMO", ugOrigemId: "ug-pm", ugDestinoId: "ug-cm", valor, data: D(dia), vinculo: "500", contabilizacaoId: cont.id, contaOrigemId: "cb-pm", lancamentoConcedidaId: l.id, criadoPor: "TESTE" } });
      }
    }, 120000);

    it("t2: limite, LOA contida no limite, duodécimo, dia 20 e os alertas — com a base declarada", async () => {
      await declararParametroDoLimiteDoLegislativo(prisma, { exercicio: 2026, populacao: 32599, fontePopulacao: "IBGE, estimativa 2025, tabela 6579", baseDeclarada: "1000000.00", documentoDaBase: "Receitas de 2025 dos dados abertos do TCE-PB", criadoPor: POR });
      const a = await apurarLimiteDoLegislativo(prisma, { exercicio: 2026, ate: D("2026-02-28") });
      expect([a.inciso, a.percentual, a.origemDaBase, a.base, a.limiteAnual, a.dotacaoDaCamaraNaLoa, a.devidoNoAno, a.duodecimo]).toEqual(["I", "7.0", "DECLARADA", "1000000.00", "70000.00", "120000.00", "70000.00", "5833.33"]);
      expect(a.meses.map((m) => [m.mes, m.repassadoAteDia20, m.repassadoNoMes, m.emDia])).toEqual([[1, "5833.33", "5833.33", true], [2, "0.00", "5833.33", false]]);
      expect(a.repassadoNoAno).toBe("11666.66");
      expect(a.alertas.join(" | ")).toMatch(/Mês 02: até o dia 20 foram repassados 0\.00 de 5833\.33[\s\S]*A LOA fixou 120000\.00 para a Câmara, acima do limite de 70000\.00/);
    });

    it("t3: sem a população declarada, recusa dizendo o que falta; base sem documento é recusada antes de gravar", async () => {
      await expect(apurarLimiteDoLegislativo(prisma, { exercicio: 2026, ate: D("2026-02-28") })).rejects.toThrow(/população de 2026 não foi declarada/);
      await expect(declararParametroDoLimiteDoLegislativo(prisma, { exercicio: 2026, populacao: 32599, fontePopulacao: "IBGE, estimativa 2025, tabela 6579", baseDeclarada: "1000000.00", documentoDaBase: null, criadoPor: POR })).rejects.toThrow(/vêm juntos/);
      expect(await prisma.parametroDoLimiteDoLegislativo.count()).toBe(0);
    });
  });
});
