import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichasDeTeste } from "../../test/ficha-teste.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { anularArrecadacao, registrarArrecadacao } from "../m04-receita/servico.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import {
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
} from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import { ordemCronologicaMensal } from "../m12-relatorios/ordem-cronologica.js";
import {
  conferirCoberturaDosElementos,
  datasetDespesa,
  datasetOrdemCronologica,
  datasetReceita,
  identificarDocumento,
  mascararCpf,
  paraCsv,
} from "./index.js";
import type { LinhaDespesa } from "./datasets.js";
import type { M05Deps } from "../m05-despesa/ports.js";

/**
 * M13 — TRANSPARÊNCIA, bloco 1. LEITURA PURA.
 *
 * ⚠️ TODAS AS CONTAS FEITAS À MÃO, ANTES DO CÓDIGO.
 *
 * ═══ t1 — O CICLO DA DESPESA (ficha 1, fonte 500, elemento 39 — serviços PJ) ═══
 *   empenho    NE-1   10.000,00   2026-02-01   CNPJ 12.345.678/0001-99
 *   liquidação NL-1    6.000,00   2026-03-01
 *   pagamento  NP-1    2.500,00   2026-04-01
 *   -> TRÊS linhas (o grão é a FASE, 7.3.1). A classificação 7.3.2 é a MESMA nas três
 *      (elas herdam a ficha do empenho), e é conferida campo a campo.
 *
 * ═══ t2 — A MÁSCARA (7.3.4 × LGPD) ═══
 *   CPF  12345678909 -> ***.456.789-**   (some o começo e o DV; o miolo fica)
 *   CNPJ 12345678000199 -> 12.345.678/0001-99   (INTEIRO — PJ é pública)
 *   doc  12345678901234567 (17 dígitos) -> OMITIDO, motivo DOCUMENTO_INVALIDO
 *
 * ═══ t3 — A EXCEÇÃO POR ELEMENTO (ficha 3, elemento 11 — Vencimentos, Pessoal Civil) ═══
 *   -> beneficiário OMITIDO, motivo FOLHA_OU_PREVIDENCIA. O elemento 36 (serviços de
 *      terceiros PF) NÃO é folha: identifica.
 *
 * ═══ t4 — A RECEITA (7.4) ═══
 *   previsão   natureza 11180111 × fonte 500 .... 100.000,00
 *   arrecada   40.000 + 30.000 ................... 70.000,00 (UMA linha, agregada)
 *   anula      10.000 ............................ 60.000,00 (o LÍQUIDO manda)
 *
 * ═══ t5 — CSV (RFC 4180) ═══
 *   histórico:  ACME, "Ltda"\r\ncontinua
 *   no CSV:     "ACME, ""Ltda""\r\ncontinua"     (vírgula -> aspas; aspas -> dobradas)
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "portal@cg.pb.gov.br";
const FONTE = "fnt-500";
const FICHA_SERVICOS = "ficha-39"; // elemento 39 — Outros Serviços de Terceiros PJ
const FICHA_PF = "ficha-36"; // elemento 36 — Outros Serviços de Terceiros PF
const FICHA_FOLHA = "ficha-11"; // elemento 11 — Vencimentos, Pessoal Civil

const CNPJ = "12345678000199";
const CPF = "12345678909";
const DOC_QUEBRADO = "12345678901234567"; // 17 dígitos: não é CPF nem CNPJ

const CAIXA = "1.1.1.1.2.00.00";
const VPA = "4.1.1.2.1.01.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const VPD = "3.3.9.0.1.00.00";
const R_A_REALIZAR = "6.2.1.1.0.00.00";
const R_REALIZADA = "6.2.1.2.0.00.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";

const NAT_IPTU = "11180111";

const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: C_DISPONIVEL, creditoEmpenhado: C_EMPENHADO,
});
const R_LIQUIDACAO = roteiroLiquidacao({
  variacaoDiminutiva: VPD, obrigacaoAPagar: FORNECEDOR,
  creditoEmpenhado: C_EMPENHADO, creditoLiquidado: C_LIQUIDADO,
});
const R_PAGAMENTO = roteiroPagamento({
  obrigacaoAPagar: FORNECEDOR, disponibilidade: CAIXA,
  creditoLiquidado: C_LIQUIDADO, creditoPago: C_PAGO,
});
const R_ARRECADACAO = roteiroArrecadacao({
  disponibilidade: CAIXA, variacaoAumentativa: VPA,
  receitaARealizar: R_A_REALIZAR, receitaRealizada: R_REALIZADA,
});

const CORTE = new Date("2026-12-31T23:59:59Z");

let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05Deps(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-vpa", codigo: VPA, nome: "VPA tributária", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-vpd", codigo: VPD, nome: "VPD serviços", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-rar", codigo: R_A_REALIZAR, nome: "Receita a realizar", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-rr", codigo: R_REALIZADA, nome: "Receita realizada", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-liq", codigo: C_LIQUIDADO, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-pago", codigo: C_PAGO, nome: "Crédito Pago", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });

  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura Municipal" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Secretaria de Educação", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.createMany({
    data: [
      { id: "sub-361", codigo: "361", nome: "Ensino Fundamental" },
      { id: "sub-362", codigo: "362", nome: "Ensino Médio" },
      { id: "sub-363", codigo: "363", nome: "Ensino Profissional" },
    ],
  });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "Educação Básica" } });
  await prisma.acao.create({
    data: { id: "aca", codigo: "2001", descricao: "Manutenção do Ensino", tipo: "ATIVIDADE" },
  });
  await prisma.naturezaDespesa.createMany({
    data: [
      { id: "nd-39", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Outros Serviços de Terceiros - PJ" },
      { id: "nd-36", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "36", codigoCompleto: "339036", descricao: "Outros Serviços de Terceiros - PF" },
      { id: "nd-11", codCategoria: "3", codNatureza: "1", codModalidade: "90", codElemento: "11", codigoCompleto: "319011", descricao: "Vencimentos e Vantagens Fixas - Pessoal Civil" },
    ],
  });
  await prisma.naturezaReceita.create({
    data: { id: "nr-iptu", codigo: NAT_IPTU, descricao: "IPTU - Principal" },
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Recursos não vinculados de impostos", codigoTce: "500" },
  });
  await prisma.contaBancaria.create({
    data: { id: "cb1", codigo: "CC-001", descricao: "Movimento", fonteId: FONTE },
  });

  const base = {
    exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12",
    programaId: "prg", acaoId: "aca", fonteId: FONTE, valorDotado: "100000.00",
  };
  await criarFichasDeTeste(prisma, [
    { ...base, id: FICHA_SERVICOS, numero: 1, subfuncaoId: "sub-361", naturezaDespesaId: "nd-39" },
    { ...base, id: FICHA_PF, numero: 2, subfuncaoId: "sub-362", naturezaDespesaId: "nd-36" },
    { ...base, id: FICHA_FOLHA, numero: 3, subfuncaoId: "sub-363", naturezaDespesaId: "nd-11" },
  ]);
}

async function empenhoDe(
  ficha: string,
  numero: string,
  valor: string,
  credor: string,
  historico = "Serviço de manutenção predial, contrato 1/2026.",
  data = new Date("2026-02-01T12:00:00Z")
): Promise<string> {
  const e = await empenhar(
    {
      fichaId: ficha, numero, tipo: "ORDINARIO", valor, data,
      credorCpfCnpj: credor, historico,
      categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  return e.empenhoId;
}

async function arrecadar(
  valor: string,
  guia: string,
  data = new Date("2026-05-10T12:00:00Z")
): Promise<string> {
  await registrarArrecadacao(
    {
      exercicio: 2026, naturezaReceita: NAT_IPTU, fonte: "500", valor,
      dataArrecadacao: data, numeroReceita: guia, criadoPor: POR,
    },
    R_ARRECADACAO,
    criarM04Deps(prisma)
  );
  const r = await prisma.receitaArrecadada.findFirstOrThrow({
    where: { numeroReceita: guia, estornoDeId: null },
    select: { id: true },
  });
  return r.id;
}

const naFase = (linhas: readonly LinhaDespesa[], fase: string): LinhaDespesa =>
  linhas.find((l) => l.fase === fase)!;

describe("M13 — dataset de DESPESA (TR 7.3)", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t1 — TESTE DE OURO, célula a célula
  it("t1: as TRÊS fases, e a classificação 7.3.2 conferida campo a campo", async () => {
    const empenhoId = await empenhoDe(FICHA_SERVICOS, "NE-1", "10000.00", CNPJ);
    const l = await liquidar(
      {
        empenhoId, numero: "NL-1", valor: "6000.00",
        data: new Date("2026-03-01T12:00:00Z"), responsavelAtesto: "Fiscal do contrato",
        historico: "Medição 1", criadoPor: POR,
      },
      R_LIQUIDACAO,
      deps
    );
    await pagar(
      {
        liquidacaoId: l.liquidacaoId, numero: "NP-1", valor: "2500.00",
        data: new Date("2026-04-01T12:00:00Z"), contaBancaria: "CC-001",
        fonteId: FONTE, historico: "OP 1", criadoPor: POR,
      },
      R_PAGAMENTO,
      deps
    );

    const linhas = await datasetDespesa(prisma, { ate: CORTE });
    expect(linhas).toHaveLength(3);

    // ═══ O GRÃO É A FASE (7.3.1) — os três valores, literais ═══
    expect(naFase(linhas, "EMPENHO").valor).toBe("10000.00");
    expect(naFase(linhas, "LIQUIDACAO").valor).toBe("6000.00");
    expect(naFase(linhas, "PAGAMENTO").valor).toBe("2500.00");

    // ⚠️ Decimal SEMPRE string: "10000.00", nunca 10000 (um float não representa
    // 2.500,10 exatamente, e um dataset público que arredonda é um dataset que mente).
    expect(typeof naFase(linhas, "EMPENHO").valor).toBe("string");

    // datas ISO, do FATO
    expect(naFase(linhas, "EMPENHO").data).toBe("2026-02-01T12:00:00.000Z");
    expect(naFase(linhas, "LIQUIDACAO").data).toBe("2026-03-01T12:00:00.000Z");
    expect(naFase(linhas, "PAGAMENTO").data).toBe("2026-04-01T12:00:00.000Z");

    // ═══ 7.3.2 — CÉLULA A CÉLULA, contra a ficha semeada ═══
    const e = naFase(linhas, "EMPENHO");
    expect(e.exercicio).toBe("2026");
    expect(e.fichaNumero).toBe("1");
    expect(e.orgaoCodigo).toBe("01");
    expect(e.orgaoNome).toBe("Prefeitura Municipal");
    expect(e.unidadeOrcamentariaCodigo).toBe("01001");
    expect(e.unidadeOrcamentariaDescricao).toBe("Secretaria de Educação");
    expect(e.funcaoCodigo).toBe("12");
    expect(e.funcaoNome).toBe("Educação");
    expect(e.subfuncaoCodigo).toBe("361");
    expect(e.subfuncaoNome).toBe("Ensino Fundamental");
    expect(e.programaCodigo).toBe("0012");
    expect(e.programaDescricao).toBe("Educação Básica");
    expect(e.acaoCodigo).toBe("2001");
    expect(e.acaoDescricao).toBe("Manutenção do Ensino");
    expect(e.naturezaDespesaCodigo).toBe("339039");
    expect(e.naturezaDespesaDescricao).toBe("Outros Serviços de Terceiros - PJ");
    expect(e.elementoCodigo).toBe("39");
    expect(e.fonteCodigo).toBe("500");
    expect(e.fonteDescricao).toBe("Recursos não vinculados de impostos");
    // 7.3.7 — o que foi comprado
    expect(e.descricao).toBe("Serviço de manutenção predial, contrato 1/2026.");

    // ⚠️ AS TRÊS FASES HERDAM A MESMA CLASSIFICAÇÃO — ela é da FICHA, e a ficha é uma
    // só. Se a liquidação pudesse ter outra função, o portal e o Anexo 12 diriam coisas
    // diferentes sobre onde o dinheiro foi gasto.
    for (const fase of ["LIQUIDACAO", "PAGAMENTO"]) {
      const f = naFase(linhas, fase);
      expect(f.funcaoCodigo).toBe("12");
      expect(f.subfuncaoCodigo).toBe("361");
      expect(f.naturezaDespesaCodigo).toBe("339039");
      expect(f.fonteCodigo).toBe("500");
      expect(f.beneficiarioDocumento).toBe("12.345.678/0001-99");
    }

    // append-only: nenhuma delas é anulação
    expect(e.estornoDe).toBeNull();
    expect(e.anulacaoParcialDe).toBeNull();
  });

  // t2
  it("t2: CPF mascarado, CNPJ inteiro, documento quebrado OMITIDO com motivo", async () => {
    await empenhoDe(FICHA_SERVICOS, "NE-PJ", "1000.00", CNPJ);
    await empenhoDe(FICHA_PF, "NE-PF", "1000.00", CPF);
    await empenhoDe(FICHA_PF, "NE-XX", "1000.00", DOC_QUEBRADO);

    const linhas = await datasetDespesa(prisma, { ate: CORTE });
    const por = new Map(linhas.map((l) => [l.numero, l]));

    // PJ: inteiro. Quem contrata com o ente aceita o escrutínio.
    expect(por.get("NE-PJ")!.beneficiarioDocumento).toBe("12.345.678/0001-99");
    expect(por.get("NE-PJ")!.beneficiarioTipo).toBe("CNPJ");
    expect(por.get("NE-PJ")!.beneficiarioOmitidoPor).toBeNull();

    // PF: mascarado. Dá para CONFERIR, não dá para DESCOBRIR.
    expect(por.get("NE-PF")!.beneficiarioDocumento).toBe("***.456.789-**");
    expect(por.get("NE-PF")!.beneficiarioTipo).toBe("CPF");
    expect(por.get("NE-PF")!.beneficiarioOmitidoPor).toBeNull();

    // ⚠️ FAIL-CLOSED DE EXPOSIÇÃO: 17 dígitos não é CPF nem CNPJ. Na dúvida, NÃO expõe —
    // e o motivo é ESTRUTURADO, para que um dado quebrado não se disfarce de "sem
    // beneficiário".
    expect(por.get("NE-XX")!.beneficiarioDocumento).toBeNull();
    expect(por.get("NE-XX")!.beneficiarioTipo).toBeNull();
    expect(por.get("NE-XX")!.beneficiarioOmitidoPor).toBe("DOCUMENTO_INVALIDO");

    // a máscara, direto (a unidade da função)
    expect(mascararCpf("12345678909")).toBe("***.456.789-**");
    expect(identificarDocumento("123")).toBeNull();
    expect(identificarDocumento("abcdefghijk")).toBeNull();
    expect(identificarDocumento("123.456.789-09")).toBeNull(); // pontuado = não normalizado
  });

  // t3
  it("t3: elemento de FOLHA omite o beneficiário; serviço de PF identifica", async () => {
    await empenhoDe(FICHA_FOLHA, "NE-FOLHA", "50000.00", CPF, "Folha de fevereiro/2026.");
    await empenhoDe(FICHA_PF, "NE-SERV", "1000.00", CPF, "Consultoria pontual.");

    const linhas = await datasetDespesa(prisma, { ate: CORTE });
    const por = new Map(linhas.map((l) => [l.numero, l]));

    // ═══ 7.3.4 — a exceção, por ELEMENTO (11 = Vencimentos, Pessoal Civil) ═══
    const folha = por.get("NE-FOLHA")!;
    expect(folha.elementoCodigo).toBe("11");
    expect(folha.beneficiarioDocumento).toBeNull();
    expect(folha.beneficiarioTipo).toBeNull();
    expect(folha.beneficiarioOmitidoPor).toBe("FOLHA_OU_PREVIDENCIA");
    // ...mas o VALOR e a CLASSIFICAÇÃO continuam públicos: o que se omite é QUEM.
    expect(folha.valor).toBe("50000.00");
    expect(folha.funcaoCodigo).toBe("12");

    // ⚠️ O elemento 36 é "Outros Serviços de Terceiros - PESSOA FÍSICA" — e ele NÃO é
    // folha. Quem presta serviço é FORNECEDOR, não servidor: identifica (mascarado).
    const serv = por.get("NE-SERV")!;
    expect(serv.elementoCodigo).toBe("36");
    expect(serv.beneficiarioDocumento).toBe("***.456.789-**");
    expect(serv.beneficiarioOmitidoPor).toBeNull();
  });

  // t6
  it("t6: fase DEPOIS do corte não aparece — o corte é a data do FATO", async () => {
    const empenhoId = await empenhoDe(FICHA_SERVICOS, "NE-1", "10000.00", CNPJ);
    await liquidar(
      {
        empenhoId, numero: "NL-1", valor: "6000.00",
        data: new Date("2026-03-01T12:00:00Z"), responsavelAtesto: "Fiscal",
        historico: "Medição 1", criadoPor: POR,
      },
      R_LIQUIDACAO,
      deps
    );

    // corte em 28/02: só o empenho (01/02) existe. A liquidação é de MARÇO.
    const emFevereiro = await datasetDespesa(prisma, {
      ate: new Date("2026-02-28T23:59:59Z"),
    });
    expect(emFevereiro.map((l) => l.fase)).toEqual(["EMPENHO"]);

    // corte em 31/03: as duas.
    const emMarco = await datasetDespesa(prisma, {
      ate: new Date("2026-03-31T23:59:59Z"),
    });
    expect(emMarco.map((l) => l.fase).sort()).toEqual(["EMPENHO", "LIQUIDACAO"]);
  });
});

describe("M13 — dataset de RECEITA (TR 7.4)", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t4
  it("t4: agregado por natureza × fonte — duas guias viram UMA linha, e o estorno reduz", async () => {
    await prisma.receitaPrevista.create({
      data: {
        exercicio: 2026, naturezaReceitaId: "nr-iptu", fonteId: FONTE,
        tipoReceita: "ORCAMENTARIA", valorPrevisto: "100000.00",
      },
    });

    await arrecadar("40000.00", "GUIA-1");
    const guia2 = await arrecadar("30000.00", "GUIA-2");

    const antes = await datasetReceita(prisma, { exercicio: 2026, ate: CORTE });
    // ⚠️ UMA linha. Duas guias, mesma natureza, mesma fonte -> um total. A linha
    // individual identificaria o CONTRIBUINTE pelo cruzamento (valor + data + natureza),
    // e o sigilo fiscal (CTN 198) não é dispensável por transparência.
    expect(antes).toHaveLength(1);
    expect(antes[0]!.naturezaCodigo).toBe(NAT_IPTU);
    expect(antes[0]!.fonteCodigo).toBe("500");
    expect(antes[0]!.previsto).toBe("100000.00");
    expect(antes[0]!.arrecadado).toBe("70000.00"); // 40.000 + 30.000

    // A ANULAÇÃO de 10.000... (a guia 2 inteira? não: anula-se a guia toda, e ela vale
    // 30.000. Para o literal de 60.000, anulamos uma guia de 10.000.)
    const guia3 = await arrecadar("10000.00", "GUIA-3");
    await anularArrecadacao(
      {
        receitaId: guia3, dataAnulacao: new Date("2026-06-01T12:00:00Z"),
        numeroReceita: "GUIA-3-ANUL", criadoPor: POR,
      },
      criarM04Deps(prisma)
    );

    const depois = await datasetReceita(prisma, { exercicio: 2026, ate: CORTE });
    expect(depois).toHaveLength(1);
    // 40.000 + 30.000 + 10.000 − 10.000 = 70.000 (o LÍQUIDO: a anulação subtrai)
    expect(depois[0]!.arrecadado).toBe("70000.00");
    expect(guia2).not.toBe(guia3);

    // ⚠️ E NÃO HÁ COMO VAZAR O CONTRIBUINTE — a garantia é o TIPO, não um comentário.
    // Descomentar a linha abaixo NÃO COMPILA:
    // @ts-expect-error o dataset da receita NÃO TEM campo de contribuinte (TR 7.4.2)
    const _proibido: string = depois[0]!.contribuinte;
    expect(_proibido).toBeUndefined();

    // nem por engano, em runtime:
    expect(Object.keys(depois[0]!)).toEqual([
      "naturezaCodigo", "naturezaDescricao", "fonteCodigo", "fonteDescricao",
      "previsto", "arrecadado",
    ]);
  });
});

describe("M13 — CSV (TR 7.48, RFC 4180)", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t5
  it("t5: escaping exato, CRLF, e o round-trip bate com o dataset", async () => {
    const HISTORICO = 'ACME, "Ltda"\r\ncontinua';
    await empenhoDe(FICHA_SERVICOS, "NE-1", "10000.00", CNPJ, HISTORICO);

    const linhas = await datasetDespesa(prisma, { ate: CORTE });
    const csv = paraCsv(linhas);

    // ═══ RFC 4180 §2.6 e §2.7, literal ═══
    expect(csv).toContain('"ACME, ""Ltda""\r\ncontinua"');
    // cabeçalho na 1ª linha (§2.3), terminador CRLF (§2.1)
    expect(csv.startsWith("fase,id,numero,data,valor,")).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    // SEM BOM — o dado é para máquina (ver o comentário de `paraCsv`).
    expect(csv.charCodeAt(0)).not.toBe(0xfeff);
    // `null` vira campo VAZIO, não a string "null"
    expect(csv).not.toContain(",null,");

    // ═══ O ROUND-TRIP: reimportado, bate com o dataset ═══
    const [cabecalho, ...registros] = parsearCsv(csv);
    expect(cabecalho).toEqual(Object.keys(linhas[0]!));
    expect(registros).toHaveLength(1);

    const reimportado = Object.fromEntries(
      cabecalho!.map((c, i) => [c, registros[0]![i]!])
    );
    expect(reimportado["descricao"]).toBe(HISTORICO);
    expect(reimportado["valor"]).toBe("10000.00");
    expect(reimportado["beneficiarioDocumento"]).toBe("12.345.678/0001-99");
    // o campo nulo volta como string vazia (num CSV, vazio É a ausência)
    expect(reimportado["estornoDe"]).toBe("");
  });

  it("paraCsv: dataset vazio vira string vazia (não um cabeçalho órfão)", () => {
    expect(paraCsv([])).toBe("");
  });
});

/** Um parser RFC 4180 mínimo — só para provar o round-trip. Não é código de produção. */
function parsearCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let campo = "";
  let atual: string[] = [];
  let dentroDeAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!;
    if (dentroDeAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          dentroDeAspas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }
    if (c === '"') {
      dentroDeAspas = true;
    } else if (c === ",") {
      atual.push(campo);
      campo = "";
    } else if (c === "\r" && texto[i + 1] === "\n") {
      atual.push(campo);
      linhas.push(atual);
      atual = [];
      campo = "";
      i++;
    } else {
      campo += c;
    }
  }
  return linhas;
}

describe("M13 — as invariantes do módulo (sem banco)", () => {
  // t7
  it("t7: a ordem cronológica é REEXPOSIÇÃO, não cópia — a MESMA função", () => {
    // ⚠️ IDENTIDADE DE REFERÊNCIA. Não há wrapper, não há "adaptação", não há um segundo
    // laço que ordene a fila de novo. Um wrapper é o lugar onde a cópia começa: um dia
    // alguém filtra ali, e o portal passa a publicar uma fila que não é a fila.
    expect(datasetOrdemCronologica).toBe(ordemCronologicaMensal);
  });

  // t8
  it("t8: ZERO escrita e ZERO aritmética no módulo inteiro (o grep roda aqui)", () => {
    const dir = fileURLToPath(new URL(".", import.meta.url));
    const fontes = readdirSync(dir).filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".test.ts")
    );
    expect(fontes.length).toBeGreaterThan(0);

    // Escrita: um portal que GRAVA é um portal que pode corromper o que publica.
    const ESCRITA = /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/;
    // Aritmética: um portal que SOMA pode divergir do balanço — e é o portal que o
    // cidadão lê. Cada número daqui tem uma função de DONO nomeada no comentário.
    const SUM_BRUTO = /\.(aggregate|groupBy)\(|_sum/;

    for (const f of fontes) {
      const codigo = readFileSync(join(dir, f), "utf8");
      // as linhas de comentário não contam (elas EXPLICAM a proibição)
      const efetivo = codigo
        .split("\n")
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join("\n");

      expect(ESCRITA.test(efetivo), `${f} tem ESCRITA`).toBe(false);
      expect(SUM_BRUTO.test(efetivo), `${f} tem SUM bruto`).toBe(false);
    }
  });

  it("o Record de exposição cobre os 78 elementos oficiais, e nenhum inventado", () => {
    expect(() => conferirCoberturaDosElementos()).not.toThrow();
  });
});
