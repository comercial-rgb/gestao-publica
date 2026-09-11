import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import {
  roteiroArrecadacao,
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
} from "../m01-core-contabil/roteiros.js";
import { semearPcasp } from "../../prisma/seed/pcasp.js";
import { diferimentoFundeb, janelaDoDiferimento } from "./mde-diferimento.js";

/**
 * MDE — DIFERIMENTO DO ART. 25, §3º (Lei 14.113/2020).
 *
 * ⚠️ TODAS AS CONTAS FEITAS À MÃO, ANTES DO CÓDIGO.
 *
 * ═══ ⚠️ A FIXTURE É COMBINADA, E ERA O TRABALHO DESTA SESSÃO ═══
 * Ela tem de fechar para DOIS leitores ao mesmo tempo: o `anexo8` (que traz o recebido e
 * o aplicado do FUNDEB) e o `rgfAnexo5` (que traz a disponibilidade da fonte, e cuja
 * amarração S1 do `superavit-por-fonte` DERRUBA se houver dinheiro sem fato de origem).
 * Por isso usa o PLANO DE PRODUÇÃO (`semearPcasp`) e os roteiros do M01 — não os
 * legados do M05, que não movem a DDR e cujas contas são inventadas por fixture.
 *
 * ═══ O CENÁRIO (2026, fonte FUNDEB 540) ═══
 *   recebido = 250.000 (retorno) + 30.000 (VAAF) + 15.000 (VAAT) + 5.000 (rend.)
 *            = 300.000
 *   despesa  = empenha 280.000 · liquida 280.000 · paga 275.000
 *   aplicado = 280.000        (6º bimestre → o acompanhamento é a EMPENHADA)
 *   não aplicado = 300.000 − 280.000 =  20.000
 *   limite       = 10% × 300.000     =  30.000   ⇒ 20.000 ≤ 30.000, NÃO estoura
 *
 * ═══ O OUTRO CAMINHO (Anexo 5, fonte 540, corte 31/12) ═══
 *   (a) caixa bruta ....... 300.000 − 275.000 = 25.000
 *   (c) RP liq. do exerc. .. 280.000 − 275.000 =  5.000
 *   (b) (d) (e) ............................... 0
 *   (f) = 25.000 − 5.000 ...................... 20.000
 *   (g) RPNP inscritos ........................ 0
 *   (i) = 20.000
 *
 * ═══ R-DIF: 20.000 ≤ 20.000 ✓ — e a álgebra diz por que BATE EXATO ═══
 * Com o empenhado todo liquidado e sem RP:
 *   (i) = (arrecadado − pago) − (liquidado − pago) = arrecadado − liquidado
 * ...que é o próprio não aplicado. Os dois caminhos são o mesmo dinheiro visto de dois
 * subsistemas — e é isso que a identidade prova. Ver `SOBRE_R_DIF`: é ≤, não ==, e é
 * informativo, não guard (os cortes dos dois anexos só coincidem em 31/12).
 *
 * ═══ t2 — ESTOURO ═══
 *   despesa 250.000 ⇒ não aplicado = 50.000 > limite 30.000
 *   excesso = 50.000 − 30.000 = 20.000. O número SAI COMO É: truncar ao teto esconderia
 *   a glosa de quem a fiscaliza.
 *
 * ═══ t3 — A JANELA ═══
 *   paga 5.000 em 15/03/2027 (o que faltava da liquidação de 2026)
 *   pago bruto até 30/04/2027 = 280.000 · até 31/12/2026 = 275.000
 *   janela = 280.000 − 275.000 = 5.000
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "orcamento@cg.pb.gov.br"; // usuário de fixtures (ADMIN — pode tudo do censo)
const FONTE_FUNDEB = "540";
const FICHA = "ficha-fundeb";
const CREDOR = "12345678000199";

// As naturezas de receita do FUNDEB (os 4 papéis do bloco 1).
const N_RETORNO = "17510151";
const N_VAAF = "17520151";
const N_VAAT = "17530151";
const N_REND = "13210051";

// ⚠️ OS ROTEIROS DE PRODUÇÃO (M01) — ver o cabeçalho: a fixture legada do M05 não
// serviria, porque o Anexo 5 exige que o caixa tenha origem em fato com fonte.
const R_ARREC = roteiroArrecadacao({
  disponibilidade: "1.1.1.1.1.00.00",
  variacaoAumentativa: "4.1.1.2.1.01.00",
});
const R_EMP = roteiroEmpenho();
const R_LIQ = roteiroLiquidacao({ codElemento: "39", obrigacaoAPagar: "2.1.3.1.1.00.00" });
const R_PAG = roteiroPagamento({
  obrigacaoAPagar: "2.1.3.1.1.00.00",
  disponibilidade: "1.1.1.1.1.00.00",
});

let m04: ReturnType<typeof criarM04Deps>;
let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await semearPcasp(prisma); // o plano de PRODUÇÃO
  m04 = criarM04Deps(prisma);
  deps = criarM05Deps(prisma);

  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "Ensino Fundamental" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2012", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: { id: "nd-prof", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Profissionais da educação" },
  });
  await prisma.naturezaReceita.createMany({
    data: [
      { id: "nr-retorno", codigo: N_RETORNO, descricao: "FUNDEB retorno" },
      { id: "nr-vaaf", codigo: N_VAAF, descricao: "VAAF" },
      { id: "nr-vaat", codigo: N_VAAT, descricao: "VAAT" },
      { id: "nr-rend", codigo: N_REND, descricao: "Rendimentos FUNDEB" },
    ],
  });
  await prisma.fonteRecurso.create({
    data: { id: "fnt-540", codigo: FONTE_FUNDEB, descricao: "FUNDEB", codigoTce: "540" },
  });
  await prisma.contaBancaria.create({
    data: { id: "cb-540", codigo: "CC-540", descricao: "FUNDEB", fonteId: "fnt-540" },
  });
  for (const ano of [2026, 2027]) {
    await prisma.exercicio.upsert({ where: { ano }, update: {}, create: { ano, criadoPor: "TESTE" } });
  }

  await prisma.deParaFundebReceita.createMany({
    data: [
      { naturezaCodigo: N_RETORNO, papel: "RETORNO", criadoPor: "T" },
      { naturezaCodigo: N_VAAF, papel: "VAAF", criadoPor: "T" },
      { naturezaCodigo: N_VAAT, papel: "VAAT", criadoPor: "T" },
      { naturezaCodigo: N_REND, papel: "RENDIMENTOS", criadoPor: "T" },
    ],
  });
  await prisma.deParaFonteClasseEducacao.create({
    data: { fonteCodigo: FONTE_FUNDEB, classe: "FUNDEB", criadoPor: "T" },
  });

  await criarFichaDeTeste(prisma, {
    id: FICHA, exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd-prof", fonteId: "fnt-540", valorDotado: "1000000.00",
  });
}

async function arrecadar(natureza: string, valor: string, guia: string): Promise<void> {
  await registrarArrecadacao(
    {
      exercicio: 2026, naturezaReceita: natureza, fonte: FONTE_FUNDEB, valor,
      dataArrecadacao: new Date("2026-01-20T12:00:00Z"), numeroReceita: guia, criadoPor: POR,
    },
    R_ARREC,
    m04
  );
}

/** O recebido do FUNDEB: 250 + 30 + 15 + 5 = 300.000. */
async function receberFundeb(): Promise<void> {
  await arrecadar(N_RETORNO, "250000.00", "G-RET");
  await arrecadar(N_VAAF, "30000.00", "G-VAAF");
  await arrecadar(N_VAAT, "15000.00", "G-VAAT");
  await arrecadar(N_REND, "5000.00", "G-REND");
}

/** empenha → liquida → paga na ficha do FUNDEB. Devolve a liquidacaoId (para a janela). */
async function gastar(empenhado: string, liquidado: string, pago: string): Promise<string> {
  const e = await empenhar(
    {
      fichaId: FICHA, numero: "NE-1", tipo: "ORDINARIO", valor: empenhado,
      data: new Date("2026-02-01T12:00:00Z"), credorCpfCnpj: CREDOR,
      historico: "profissionais da educação", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
      criadoPor: POR,
    },
    R_EMP,
    deps
  );
  const l = await liquidar(
    {
      empenhoId: e.empenhoId, numero: "NL-1", valor: liquidado,
      data: new Date("2026-03-01T12:00:00Z"), responsavelAtesto: "Fulano",
      historico: "folha", criadoPor: POR,
    },
    R_LIQ,
    deps
  );
  await pagar(
    {
      liquidacaoId: l.liquidacaoId, numero: "NP-1", valor: pago,
      data: new Date("2026-04-01T12:00:00Z"), contaBancaria: "CC-540",
      fonteId: "fnt-540", historico: "pagamento", criadoPor: POR,
    },
    R_PAG,
    deps
  );
  return l.liquidacaoId;
}

describe("M12 — MDE: o diferimento do art. 25, §3º", () => {
  beforeEach(async () => {
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: o cenário — não aplicado 20.000 dentro do limite de 30.000, e a R-DIF fecha", async () => {
    await receberFundeb();
    await gastar("280000.00", "280000.00", "275000.00");

    const d = await diferimentoFundeb(prisma, { exercicio: 2026 });

    expect(d.recebido).toBe("300000.00");
    expect(d.aplicado).toBe("280000.00"); // 6º bimestre → EMPENHADA
    expect(d.naoAplicado).toBe("20000.00");
    expect(d.limite).toBe("30000.00");
    expect(d.estourou).toBe(false);
    expect(d.excesso).toBe("0.00");
    expect(d.fontesFundeb).toEqual(["540"]);

    // ⚠️ R-DIF: os dois caminhos batem EXATO — ver o cabeçalho. (i) do Anexo 5 = 20.000.
    expect(d.disponibilidadeLiquida).toBe("20000.00");
    expect(d.lastreado).toBe(true);

    // A janela ainda não teve movimento: `null`, não 0,00.
    expect(d.aplicadoNaJanela).toBeNull();
  });

  it("t2: ESTOURO — o número sai como é, o motor NÃO trunca ao teto", async () => {
    await receberFundeb();
    // aplica só 250.000 ⇒ não aplicado 50.000, contra um teto de 30.000.
    await gastar("250000.00", "250000.00", "245000.00");

    const d = await diferimentoFundeb(prisma, { exercicio: 2026 });

    expect(d.naoAplicado).toBe("50000.00");
    expect(d.limite).toBe("30000.00");
    expect(d.estourou).toBe(true);
    // ⚠️ 50.000 − 30.000. Se o motor truncasse, `naoAplicado` viria "30000.00" e a
    // glosa de 20.000 sumiria exatamente do relatório que existe para mostrá-la.
    expect(d.excesso).toBe("20000.00");
    expect(d.naoAplicado).not.toBe(d.limite);

    // A R-DIF continua fechando: (a) 300.000−245.000 = 55.000; (c) 250.000−245.000 = 5.000
    // ⇒ (i) = 50.000. O dinheiro ESTÁ lá — o que a norma proíbe é diferir tudo isso.
    expect(d.disponibilidadeLiquida).toBe("50000.00");
    expect(d.lastreado).toBe(true);
  });

  it("t3: a JANELA — o pago entre 01/01 e 30/04 do seguinte, pela data do FATO", async () => {
    await receberFundeb();
    const liquidacaoId = await gastar("280000.00", "280000.00", "275000.00");

    // O que faltava da liquidação de 2026, pago DENTRO da janela.
    await pagar(
      {
        liquidacaoId, numero: "NP-2", valor: "5000.00",
        data: new Date("2027-03-15T12:00:00Z"), contaBancaria: "CC-540",
        fonteId: "fnt-540", historico: "diferido — art. 25 §3º", criadoPor: POR,
      },
      R_PAG,
      deps
    );

    const d = await diferimentoFundeb(prisma, { exercicio: 2026 });
    // pago bruto até 30/04/2027 (280.000) − até 31/12/2026 (275.000)
    expect(d.aplicadoNaJanela).toBe("5000.00");

    // ⚠️ O DIFERIMENTO DE 2026 NÃO MUDA: ele é o retrato de 31/12, e o pagamento de
    // março de 2027 é o USO do diferido — não uma correção retroativa do exercício.
    expect(d.naoAplicado).toBe("20000.00");
  });

  it("t4: fora da janela NÃO conta — 01/05 já é exercício corrente, não diferimento", async () => {
    await receberFundeb();
    const liquidacaoId = await gastar("280000.00", "280000.00", "275000.00");

    const { fim } = janelaDoDiferimento(2026);
    // 30/04/2027 às 23:59:59.999 CIVIS — o último instante de abril PARA O ENTE, que em
    // Greenwich já é 01/05 às 02:59:59.999. A janela do art. 25, §3º acaba no fim de
    // abril do ente: com o corte em UTC, as três últimas horas de 30/04 caíam fora do
    // diferimento e passavam a contar no exercício corrente.
    expect(fim.toISOString()).toBe("2027-05-01T02:59:59.999Z");

    // UM DIA depois do fim da janela.
    await pagar(
      {
        liquidacaoId, numero: "NP-2", valor: "5000.00",
        data: new Date("2027-05-01T12:00:00Z"), contaBancaria: "CC-540",
        fonteId: "fnt-540", historico: "fora da janela", criadoPor: POR,
      },
      R_PAG,
      deps
    );

    const d = await diferimentoFundeb(prisma, { exercicio: 2026 });
    // ⚠️ `null`, não 5.000: o §3º dá o 1º QUADRIMESTRE, e 01/05 está fora. O pagamento
    // aconteceu — mas não como uso do diferido de 2026.
    expect(d.aplicadoNaJanela).toBeNull();
  });
});
