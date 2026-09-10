import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { roteiroEmpenho, roteiroLiquidacao, roteiroPagamento } from "./dominio.js";
import { empenhar, reservarDotacao, saldosCorrentesDaFicha } from "./servico.js";
import { liquidar, pagar } from "./servico-bloco2.js";
import type { M05Deps } from "./ports.js";
import { criarM05DepsComContratos } from "../m11-licitacoes/adapter-m05.js";
import {
  cadastrarContrato,
  cadastrarProcesso,
  homologarProcesso,
} from "../m11-licitacoes/contratos.js";

/**
 * M05 — A CORRIDA DO SALDO DA FICHA.
 *
 * ═══ O BUG ═══
 * `totaisPorTipo` → `exigirSaldo` → grava. Sob READ COMMITTED, duas transações
 * concorrentes leem o razão no MESMO estado, as duas veem disponível, e as DUAS
 * gravam. Nenhum guard erra; o saldo estoura. É a corrida que o M11 tinha no
 * contrato (fechada em e0e7e9f) e que a ficha carregava calada.
 *
 * ═══ OS LITERAIS ═══
 * Ficha dotada em ......... 100.000,00
 * Dois empenhos de ........  60.000,00  (60.000 + 60.000 = 120.000 > 100.000)
 * ⟹ EXATAMENTE UM grava, sempre. E Σ empenhado <= dotado, sempre.
 *
 * ⚠️ ESTE TESTE FALHA SEM O `FOR UPDATE` — é ele que prova o fix, não o código.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "despesa@cg.pb.gov.br";
const FICHA = "ficha-1";
const FONTE = "fnt-500";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: C_DISPONIVEL,
  creditoEmpenhado: C_EMPENHADO,
});
const CAIXA = "1.1.1.1.2.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const VPD = "3.3.2.1.1.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";
const R_LIQUIDACAO = roteiroLiquidacao({
  variacaoDiminutiva: VPD, obrigacaoAPagar: FORNECEDOR,
  creditoEmpenhado: C_EMPENHADO, creditoLiquidado: C_LIQUIDADO,
});
const R_PAGAMENTO = roteiroPagamento({
  obrigacaoAPagar: FORNECEDOR, disponibilidade: CAIXA,
  creditoLiquidado: C_LIQUIDADO, creditoPago: C_PAGO,
});
const RODADAS = 5;
const DATA = new Date("2026-02-01T12:00:00Z");

let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05DepsComContratos(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-liq", codigo: C_LIQUIDADO, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-pago", codigo: C_PAGO, nome: "Crédito Pago", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-vpd", codigo: VPD, nome: "VPD", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "EF" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "Serviços",
    },
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  await prisma.contaBancaria.create({
    data: { id: "cb1", codigo: "CC-001", descricao: "Movimento", fonteId: FONTE },
  });
  // ⚠️ DOTAÇÃO DE 100.000 — o gargalo do teste.
  await criarFichaDeTeste(prisma, {
    id: FICHA, exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd", fonteId: FONTE, valorDotado: "100000.00",
  });
}

const empenho = (numero: string, valor: string, contratoId?: string) => ({
  fichaId: FICHA,
  ...(contratoId !== undefined ? { contratoId } : {}),
  numero,
  tipo: "ORDINARIO" as const,
  valor,
  data: DATA,
  credorCpfCnpj: "12345678000199",
  historico: `empenho ${numero}`,
  categoriaOrdemCronologica: "PRESTACAO_SERVICOS" as const,
  criadoPor: POR,
});

/** Σ dos empenhos VIVOS da ficha — o SUM, nunca o cache. */
async function empenhadoDaFicha(): Promise<number> {
  const empenhos = await prisma.empenho.findMany({
    where: { fichaId: FICHA, estornoDeId: null },
    select: { valor: true },
  });
  return empenhos.reduce((acc, e) => acc + Number(e.valor), 0);
}

describe("M05 — concorrência no saldo da ficha", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t1
  it("t1: dois empenhos concorrentes de 60.000 numa ficha de 100.000 — UM só grava", async () => {
    for (let i = 0; i < RODADAS; i++) {
      await semear();

      const r = await Promise.allSettled([
        empenhar(empenho("NE-A", "60000.00"), R_EMPENHO, deps),
        empenhar(empenho("NE-B", "60000.00"), R_EMPENHO, deps),
      ]);

      const ok = r.filter((x) => x.status === "fulfilled");
      const falhou = r.filter((x) => x.status === "rejected");

      // ⚠️ EXATAMENTE UM. Sem o lock, os dois leem disponível 100.000 e os dois
      // gravam — 120.000 empenhados numa dotação de 100.000.
      expect(ok).toHaveLength(1);
      expect(falhou).toHaveLength(1);
      expect(String((falhou[0] as PromiseRejectedResult).reason)).toMatch(
        /Saldo insuficiente na ficha/
      );

      // O SELECT que prova: Σ empenhado <= dotado, SEMPRE.
      expect(await empenhadoDaFicha()).toBe(60000);
      expect(await prisma.empenho.count({ where: { fichaId: FICHA } })).toBe(1);

      // e o cache (recalculado sob o lock) conta a mesma história do SUM
      const s = await saldosCorrentesDaFicha(FICHA, deps);
      expect(s.empenhado.toFixed(2)).toBe("60000.00");
      expect(s.disponivel.toFixed(2)).toBe("40000.00");
    }
  }, 60_000);

  // t2
  it("t2: RESERVA × EMPENHO concorrentes na mesma ficha — a soma dos dois não estoura", async () => {
    for (let i = 0; i < RODADAS; i++) {
      await semear();

      // Reserva de 60.000 e empenho DIRETO de 60.000: os dois consomem o MESMO
      // disponível (a reserva o retém, o empenho direto o gasta). Juntos: 120.000.
      const r = await Promise.allSettled([
        reservarDotacao(
          { fichaId: FICHA, valor: "60000.00", historico: "reserva", criadoPor: POR },
          deps
        ),
        empenhar(empenho("NE-A", "60000.00"), R_EMPENHO, deps),
      ]);

      const ok = r.filter((x) => x.status === "fulfilled");
      expect(ok).toHaveLength(1);
      expect(
        String((r.filter((x) => x.status === "rejected")[0] as PromiseRejectedResult).reason)
      ).toMatch(/Saldo insuficiente na ficha/);

      // reservado + empenhado <= dotado (100.000), sempre
      const s = await saldosCorrentesDaFicha(FICHA, deps);
      const consumido = Number(s.reservado.toFixed(2)) + Number(s.empenhado.toFixed(2));
      expect(consumido).toBe(60000);
      expect(consumido).toBeLessThanOrEqual(100000);
    }
  }, 60_000);

  // t4 — A CORRIDA DA LIQUIDAÇÃO (o achado do 8d71e2b)
  it("t4: dois pagamentos de 600 contra uma liquidação de 1.000 — UM só grava", async () => {
    for (let i = 0; i < RODADAS; i++) {
      await semear();

      const e = await empenhar(empenho("NE-1", "1000.00"), R_EMPENHO, deps);
      const l = await liquidar(
        {
          empenhoId: e.empenhoId, numero: "NL-1", valor: "1000.00",
          data: new Date("2026-02-10T12:00:00Z"), responsavelAtesto: "Fulano",
          historico: "liquidação", criadoPor: POR,
        },
        R_LIQUIDACAO,
        deps
      );

      // 600 + 600 = 1.200 > 1.000. Cada um cabe sozinho; juntos, não.
      const pagamento = (numero: string) =>
        pagar(
          {
            liquidacaoId: l.liquidacaoId, numero, valor: "600.00",
            data: new Date("2026-03-01T12:00:00Z"), contaBancaria: "CC-001",
            fonteId: FONTE, historico: "pagamento parcial", criadoPor: POR,
          },
          R_PAGAMENTO,
          deps
        );

      const r = await Promise.allSettled([pagamento("NP-A"), pagamento("NP-B")]);
      const ok = r.filter((x) => x.status === "fulfilled");
      const falhou = r.filter((x) => x.status === "rejected");

      // ⚠️ EXATAMENTE UM. Sem o lock na liquidação, os dois leem "já pago = 0", os
      // dois veem que 600 cabe em 1.000, e os dois gravam: 1.200 pagos sobre 1.000
      // liquidados — o ente paga ao fornecedor mais do que reconheceu dever.
      expect(ok).toHaveLength(1);
      expect(String((falhou[0] as PromiseRejectedResult).reason)).toMatch(
        /Pagamento excede a liquidação/
      );

      const pagos = await prisma.pagamento.findMany({
        where: { liquidacaoId: l.liquidacaoId, estornoDeId: null },
        select: { valor: true },
      });
      expect(pagos.reduce((a, p) => a + Number(p.valor), 0)).toBe(600);
    }
  }, 60_000);

  // t3
  it("t3: FICHA + CONTRATO — os dois locks, na ordem documentada, sem deadlock", async () => {
    for (let i = 0; i < RODADAS; i++) {
      await semear();

      const { processoId } = await cadastrarProcesso(prisma, {
        numeroProcesso: `PREG-${i}/2025`,
        modalidade: "PREGAO_ELETRONICO",
        objeto: "Prestação de serviços continuados de manutenção",
        valorLicitado: "100000.00",
        criadoPor: POR,
      });
      await homologarProcesso(prisma, {
        processoId, data: new Date("2025-12-01T12:00:00Z"), criadoPor: POR,
      });
      // ⚠️ O GARGALO É O CONTRATO (80.000), não a ficha (100.000): dois empenhos de
      // 50.000 cabem na ficha, mas NÃO cabem no contrato.
      const { contratoId } = await cadastrarContrato(prisma, {
        numeroContrato: `CT-${i}/2026`,
        processoId,
        contratadoDocumento: "12345678000199",
        contratadoNome: "Manutec LTDA",
        valorInicial: "80000.00",
        vigenciaInicio: new Date("2026-01-01T00:00:00Z"),
        vigenciaFimInicial: new Date("2026-12-31T23:59:59Z"),
        categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
        criadoPor: POR,
      });

      const r = await Promise.allSettled([
        empenhar(empenho("NE-A", "50000.00", contratoId), R_EMPENHO, deps),
        empenhar(empenho("NE-B", "50000.00", contratoId), R_EMPENHO, deps),
      ]);

      const ok = r.filter((x) => x.status === "fulfilled");
      const falhou = r.filter((x) => x.status === "rejected");

      // Nenhum deadlock (os dois travam FICHA → CONTRATO, sempre na mesma ordem) e
      // o gargalo do contrato é quem reprova.
      expect(ok).toHaveLength(1);
      expect(String((falhou[0] as PromiseRejectedResult).reason)).toMatch(
        /SALDO DO CONTRATO INSUFICIENTE/
      );
      expect(await prisma.empenho.count({ where: { contratoId } })).toBe(1);
      // a ficha, que aguentaria os dois, ficou com um só — o contrato é o teto
      expect(await empenhadoDaFicha()).toBe(50000);
    }
  }, 90_000);
});
