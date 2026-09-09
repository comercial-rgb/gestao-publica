import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { toMoney } from "../../packages/contracts/index.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { saldoDdrPorFonte } from "../m01-core-contabil/consultas.js";
import {
  roteiroArrecadacao,
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
} from "../m01-core-contabil/roteiros.js";
import { semearPcasp } from "../../prisma/seed/pcasp.js";
import { rgfAnexo5 } from "./rgf-anexo5.js";

/**
 * RGF — ANEXO 5: DISPONIBILIDADE DE CAIXA E RESTOS A PAGAR (LRF art. 55, III, "a").
 *
 * ⚠️ TODAS AS CONTAS FEITAS À MÃO, ANTES DO CÓDIGO.
 *
 * ═══ O CENÁRIO (2026), DUAS FONTES ═══
 * FONTE 500 (não vinculada) — sobra caixa:
 *   arrecada  50.000
 *   empenha   20.000 → liquida 12.000 → paga 5.000
 *   (a) caixa bruta ......... 50.000 − 5.000 =  45.000
 *   (b) RP liq. anteriores ..                        0   (não há exercício anterior)
 *   (c) RP liq. do exercício  12.000 − 5.000 =   7.000
 *   (d) RP não liq. anter. ..                        0
 *   (e) demais obrigações ...                        0   (sem retenção)
 *   (f) = 45.000 − 7.000 ....................... 38.000
 *   (g) RPNP inscritos ......................... 0
 *   (i) = 38.000 ............................... 38.000   SUFICIENTE
 *
 * FONTE 540 (FUNDEB) — INSUFICIENTE, e é o caso que importa:
 *   arrecada  10.000
 *   empenha   30.000 → liquida 25.000 → paga 4.000
 *   (a) caixa bruta ......... 10.000 − 4.000 =   6.000
 *   (c) RP liq. do exercício  25.000 − 4.000 =  21.000
 *   (f) = 6.000 − 21.000 ...................... −15.000   INSUFICIÊNCIA
 *   (g) RPNP inscritos (fixture) ...............  5.000
 *   (i) = −15.000 − 5.000 ..................... −20.000   INSUFICIÊNCIA
 *
 * ⚠️ E É POR ISSO QUE NÃO EXISTE TOTAL QUE SALVE: somadas, as duas fontes dão
 * 51.000 de caixa e (i) = 18.000 — "positivo". Mas o FUNDEB está furado em 20.000, e o
 * superávit da fonte livre NÃO o socorre: aquele dinheiro é carimbado. A regra da STN é
 * POR VINCULAÇÃO, e o t3 prova que o relatório aponta a fonte, não o total.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "orcamento@cg.pb.gov.br";
const F500 = "fnt-500";
const F540 = "fnt-540";
const FICHA_500 = "ficha-500";
const FICHA_540 = "ficha-540";
const CREDOR = "12345678000199";
const CORTE = new Date("2026-12-31T23:59:59Z");

const R_EMP = roteiroEmpenho();
const R_LIQ = roteiroLiquidacao({ codElemento: "39", obrigacaoAPagar: "2.1.3.1.1.00.00" });
const R_PAG = roteiroPagamento({
  obrigacaoAPagar: "2.1.3.1.1.00.00",
  disponibilidade: "1.1.1.1.1.00.00",
});
const R_ARR = roteiroArrecadacao({
  disponibilidade: "1.1.1.1.1.00.00",
  variacaoAumentativa: "4.1.1.2.1.01.00",
});

let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await semearPcasp(prisma);

  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Administração", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: { id: "nd39", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ" },
  });
  await prisma.naturezaReceita.create({
    data: { id: "nr-iptu", codigo: "11121101", descricao: "IPTU" },
  });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: F500, codigo: "500", descricao: "Não vinculados", codigoTce: "500" },
      { id: F540, codigo: "540", descricao: "FUNDEB", codigoTce: "540" },
    ],
  });
  await prisma.contaBancaria.createMany({
    data: [
      { id: "cb1", codigo: "CC-001", descricao: "Livre", fonteId: F500 },
      { id: "cb2", codigo: "CC-002", descricao: "FUNDEB", fonteId: F540 },
    ],
  });

  const base = {
    exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd39", valorDotado: "500000.00",
  };
  await criarFichaDeTeste(prisma, { ...base, id: FICHA_500, numero: 1, fonteId: F500 });
  await criarFichaDeTeste(prisma, { ...base, id: FICHA_540, numero: 2, fonteId: F540 });

  deps = criarM05Deps(prisma);
}

async function arrecada(valor: string, fonte: string, n: string): Promise<void> {
  await registrarArrecadacao(
    {
      exercicio: 2026, naturezaReceita: "11121101", fonte, exercicioFonte: 1,
      valor, dataArrecadacao: new Date("2026-01-10T12:00:00Z"),
      numeroReceita: `2026RC${n}`, criadoPor: POR,
    },
    R_ARR,
    criarM04Deps(prisma)
  );
}

/** empenha → liquida → paga, na ficha da fonte. Devolve o empenhoId. */
async function executa(
  ficha: string, conta: string, fonteId: string, n: string,
  emp: string, liq: string, pag: string
): Promise<string> {
  const e = await empenhar(
    {
      fichaId: ficha, numero: `NE-${n}`, tipo: "ORDINARIO", valor: emp,
      data: new Date("2026-02-01T12:00:00Z"), credorCpfCnpj: CREDOR,
      historico: "serviços", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
      criadoPor: POR,
    },
    R_EMP,
    deps
  );
  const l = await liquidar(
    {
      empenhoId: e.empenhoId, numero: `NL-${n}`, valor: liq,
      data: new Date("2026-03-01T12:00:00Z"), responsavelAtesto: "Fulano",
      historico: "liquidação", criadoPor: POR,
    },
    R_LIQ,
    deps
  );
  await pagar(
    {
      liquidacaoId: l.liquidacaoId, numero: `NP-${n}`, valor: pag,
      data: new Date("2026-04-01T12:00:00Z"), contaBancaria: conta,
      fonteId, historico: "pagamento", criadoPor: POR,
    },
    R_PAG,
    deps
  );
  return e.empenhoId;
}

async function cenario(): Promise<{ e500: string; e540: string }> {
  await arrecada("50000.00", "500", "000001");
  await arrecada("10000.00", "540", "000002");
  const e500 = await executa(FICHA_500, "CC-001", F500, "500", "20000.00", "12000.00", "5000.00");
  const e540 = await executa(FICHA_540, "CC-002", F540, "540", "30000.00", "25000.00", "4000.00");
  return { e500, e540 };
}

const linha = (a: Awaited<ReturnType<typeof rgfAnexo5>>, fonte: string) =>
  a.linhas.find((l) => l.fonte === fonte)!;

describe("M12 — RGF Anexo 5 (disponibilidade de caixa e RP)", () => {
  beforeEach(async () => {
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: as colunas, valor a valor — e a fonte 540 acusa INSUFICIÊNCIA", async () => {
    await cenario();
    const a5 = await rgfAnexo5(prisma, { exercicio: 2026, corte: CORTE });

    const l500 = linha(a5, "500");
    expect(l500.vinculado).toBe(false); // não vinculada, bloco separado
    expect(l500.disponibilidadeBruta).toBe("45000.00");
    expect(l500.rpLiquidadosDoExercicio).toBe("7000.00");
    expect(l500.rpLiquidadosAnteriores).toBe("0.00");
    expect(l500.rpNaoLiquidadosAnteriores).toBe("0.00");
    expect(l500.disponibilidadeLiquidaAntes).toBe("38000.00");
    expect(l500.disponibilidadeLiquidaDepois).toBe("38000.00");
    expect(l500.insuficiente).toBe(false);

    const l540 = linha(a5, "540");
    expect(l540.vinculado).toBe(true);
    expect(l540.disponibilidadeBruta).toBe("6000.00");
    expect(l540.rpLiquidadosDoExercicio).toBe("21000.00");
    // ⚠️ NEGATIVO, e o relatório NÃO o esconde: é a Nota 1 oficial.
    expect(l540.disponibilidadeLiquidaAntes).toBe("-15000.00");
    expect(l540.insuficiente).toBe(true);
    expect(a5.fontesInsuficientes).toEqual(["540"]);
  });

  it("t2 (R1): a identidade fecha por linha — f = a−(b+c+d+e) e i = f−g", async () => {
    await cenario();
    const a5 = await rgfAnexo5(prisma, { exercicio: 2026, corte: CORTE });

    for (const l of a5.linhas) {
      const a = toMoney(l.disponibilidadeBruta);
      const soma = toMoney(l.rpLiquidadosAnteriores)
        .plus(l.rpLiquidadosDoExercicio)
        .plus(l.rpNaoLiquidadosAnteriores)
        .plus(l.demaisObrigacoes);
      expect(l.disponibilidadeLiquidaAntes).toBe(toMoney(a.minus(soma)).toFixed(2));

      const f = toMoney(l.disponibilidadeLiquidaAntes);
      expect(l.disponibilidadeLiquidaDepois).toBe(
        toMoney(f.minus(toMoney(l.rpnpInscritosNoExercicio))).toFixed(2)
      );
    }
  });

  it("t3 (a regra da STN): o total é POSITIVO e o FUNDEB está furado — por isso é por fonte", async () => {
    await cenario();
    const a5 = await rgfAnexo5(prisma, { exercicio: 2026, corte: CORTE });

    // Σ caixa = 45.000 + 6.000 = 51.000; Σ (i) = 38.000 + (−15.000) = 23.000.
    expect(a5.totalBruta).toBe("51000.00");
    expect(a5.totalLiquidaDepois).toBe("23000.00");

    // ⚠️ O TOTAL É POSITIVO E MENTE. O ente NÃO pode inscrever RPNP no FUNDEB: aquele
    // dinheiro é carimbado, e o superávit da fonte livre não o socorre. É por isso que
    // o anexo é POR VINCULAÇÃO e que `fontesInsuficientes` existe — quem lê só o total
    // conclui exatamente o contrário do que a norma diz.
    expect(toMoney(a5.totalLiquidaDepois).greaterThan(0)).toBe(true);
    expect(a5.fontesInsuficientes).toContain("540");
  });

  it("t4 (R2): a disponibilidade bate com a DDR — dois subsistemas, uma realidade", async () => {
    await cenario();
    const a5 = await rgfAnexo5(prisma, { exercicio: 2026, corte: CORTE });
    const ddr = await saldoDdrPorFonte(prisma, { exercicio: 2026 });

    // ⚠️ DOIS CAMINHOS INDEPENDENTES ATÉ O MESMO DINHEIRO:
    //   Anexo 5 (a)  = FATOS patrimoniais   (arrecadado − pago, M04/M05)
    //   DDR `total`  = CONTROLE (classe 7/8) (o que entrou sob controle)
    // O `total` da DDR é o ARRECADADO da fonte (só a arrecadação o move). Se os dois
    // discordassem, um dos subsistemas estaria mentindo — e o razão fecharia mesmo
    // assim, porque cada um fecha sozinho.
    const d500 = ddr.find((d) => d.fonteCodigo === "500")!;
    expect(d500.total.toFixed(2)).toBe("50000.00");
    // (a) = arrecadado − pago  ⇒  arrecadado = (a) + pago
    expect(toMoney(a5.linhas.find((l) => l.fonte === "500")!.disponibilidadeBruta).plus("5000.00").toFixed(2))
      .toBe(d500.total.toFixed(2));

    const d540 = ddr.find((d) => d.fonteCodigo === "540")!;
    expect(toMoney(a5.linhas.find((l) => l.fonte === "540")!.disponibilidadeBruta).plus("4000.00").toFixed(2))
      .toBe(d540.total.toFixed(2));

    // E a DDR também vê o FUNDEB comprometido além do que entrou.
    expect(d540.disponivel.lessThan(0)).toBe(true);
  });

  it("t5 (R3/R4): (g) e (b)/(d) vêm do M08 — por exercicioOrigem e por fonte", async () => {
    const { e540 } = await cenario();

    // Inscrição de RPNP de 2026 na fonte 540 (o que se pretende inscrever).
    await prisma.inscricaoRestosAPagar.create({
      data: {
        empenhoId: e540, exercicioOrigem: 2026, tipo: "NAO_PROCESSADO",
        valorInscrito: "5000.00", criadoPor: POR,
      },
    });

    const a5 = await rgfAnexo5(prisma, { exercicio: 2026, corte: CORTE });
    const l540 = linha(a5, "540");

    // R3: (g) == Σ inscrições NAO_PROCESSADO de exercicioOrigem 2026, por fonte.
    expect(l540.rpnpInscritosNoExercicio).toBe("5000.00");
    // (i) = −15.000 − 5.000
    expect(l540.disponibilidadeLiquidaDepois).toBe("-20000.00");
    // A fonte 500 não inscreveu nada.
    expect(linha(a5, "500").rpnpInscritosNoExercicio).toBe("0.00");

    // ⚠️ R4: (b) e (d) são de exercícios ANTERIORES — a inscrição de 2026 NÃO entra
    // neles no relatório de 2026. Confundir os dois faria o RPNP que está sendo
    // inscrito ser descontado DUAS vezes: uma em (d) e outra em (g).
    expect(l540.rpLiquidadosAnteriores).toBe("0.00");
    expect(l540.rpNaoLiquidadosAnteriores).toBe("0.00");
  });

  it("t6: o interruptor CANCELADOS-POR-INSUFICIENCIA é zero NOMEADO — o M08 não tem o motivo", async () => {
    await cenario();
    const a5 = await rgfAnexo5(prisma, { exercicio: 2026, corte: CORTE });

    // ⚠️ NÃO É "ainda não implementado": o M08 grava `motivo String?` de texto livre.
    // Inferir "insuficiência" dali seria adivinhar a intenção de quem cancelou — e
    // carimbar de ilegal um cancelamento que pode ter sido por objeto não entregue.
    for (const l of a5.linhas) {
      expect(l.empenhosCanceladosPorInsuficiencia).toBe("0.00");
    }
  });

});
