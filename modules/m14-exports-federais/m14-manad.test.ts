import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { toMoney } from "../../packages/contracts/index.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import {
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
} from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import { anularEmpenhoParcial } from "../m05-despesa/anulacao-parcial.js";
import { abrirExercicio } from "../m08-restos-a-pagar/exercicio.js";
import { encerrarExercicioComRestos } from "../m08-restos-a-pagar/encerramento.js";
import {
  roteiroCancelamentoRestos,
  roteiroPagamentoRestos,
} from "../m08-restos-a-pagar/dominio.js";
import { cancelarRestosAPagar, pagarRestosAPagar } from "../m08-restos-a-pagar/restos.js";
import { cadastrarObra } from "../m11-licitacoes/obras.js";
import {
  conferirN2,
  conferirN2Rp,
  conferirN3,
  exigirLatin1,
  gerarManad,
  serializarLinha,
  TIP_ORIG_RECURSO,
  type LinhaManad,
} from "./index.js";
import type { M05Deps } from "../m05-despesa/ports.js";

/**
 * M14 — MANAD (TR 7.36). IN MPS/SRP 12/2006, leiaute v1.0.0.2 (COD_VER = 003).
 *
 * ⚠️ TODAS AS LINHAS FEITAS À MÃO, ANTES DO CÓDIGO, a partir do LEIAUTE OFICIAL — campo a
 * campo, na ordem do manual. Nada foi copiado da saída do programa.
 *
 * ═══ O CICLO DE 2026 (t1) ═══
 *   ficha 1: órgão 01 · unidade 01001 · função 12 · subfunção 361 · programa 0012
 *            ação 2001 · natureza 339039 · fonte 500 · LOA 2.000.000
 *
 *   15/07  empenho NE-1        6.000,00   credor 12345678000199 (PJ)
 *   20/07  anulação parcial    1.000,00   ANE-1   -> empenhado líquido 5.000,00
 *   25/07  liquidação NL-1     5.000,00
 *   30/07  pagamento NP-1      2.500,00   (parcial)
 *
 * ⚠️ A ORDEM É ESTA, E NÃO OUTRA. O `anularEmpenhoParcial` (TR 5.35) é guardado pelo
 * SALDO A LIQUIDAR: anular 1.000 DEPOIS de liquidar os 6.000 inteiros deixaria despesa
 * reconhecida sem empenho que a cubra, e o M05 recusa — com razão. Não se des-empenha o
 * que já virou obrigação.
 *
 * ═══ AS DUAS LINHAS L050, LITERAIS (o coração do t1) ═══
 * A ordem dos campos é a do leiaute:
 *   REG|COD_ORG|COD_UN_ORC|COD_FUN|COD_SUBFUN|COD_PROGR|COD_SUBPROGR|COD_PROJ_ATIV_OE|
 *   COD_CTA_DESP|COD_REC_VINC|COD_CONT_REC|NM_EMP|DT_EMP|VL_EMP|IND_DEB_CRED|COD_CREDOR|
 *   HIST_EMP
 *
 *   L050|01|01001|12|361|0012||2001|339039|500||NE-1/2026.1|15072026|6000,00|D|12345678000199|servicos de TI
 *   L050|01|01001|12|361|0012||2001|339039|500||NE-1/2026.1|20072026|1000,00|C|12345678000199|reducao de escopo
 *
 *   ⚠️ COD_SUBPROGR e COD_CONT_REC saem VAZIOS (||) — 3.1.9. O subprograma foi EXTINTO
 *     pela Portaria STN 42/1999; a conta corrente do recurso vinculado não é modelada.
 *   ⚠️ A ANULAÇÃO CARREGA O **MESMO** NM_EMP DO EMPENHO. É isso que faz o D e o C se
 *     encontrarem: a Receita soma por NM_EMP, e 6.000 − 1.000 = 5.000 é o saldo.
 *   ⚠️ E O COD_CREDOR DELA É O DO EMPENHO — a linha de anulação parcial do M05 grava o
 *     SENTINELA "ANULACAO_PARCIAL" no `credorCpfCnpj`, e copiá-lo poria essa string no
 *     arquivo da Receita.
 *
 * ═══ N2 / N3, À MÃO ═══
 *   Σ L050 (D − C) da ficha 1 = 6.000 − 1.000 = 5.000,00
 *   empenhado líquido do M05  = 5.000,00   ✓ N2
 *   L250.VL_EMPENHADO         = 5.000,00   ✓ N3
 *   L250.VL_LIQUIDADO         = 5.000,00 · L250.VL_PAGO = 2.500,00
 *
 * ═══ BLOCO K (t7) ═══
 *   K001|1   (sem dados — a folha é o TR 7.10, que não existe)
 *   K990|2   (K001 + K990, "inclusive")
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "manad@cg.pb.gov.br";
const FONTE = "fnt-500";
const FICHA = "ficha-1";
const IBGE = "2504009";
const CNPJ_ENTE = "08993917000146";
const CREDOR_PJ = "12345678000199";

const CAIXA = "1.1.1.1.2.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const VPD = "3.3.9.0.1.00.00";
const VPA = "4.1.1.2.1.01.00";
const R_A_REALIZAR = "6.2.1.1.0.00.00";
const R_REALIZADA = "6.2.1.2.0.00.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";

const NAT_IPTU = "11180111";

const R_ARRECADACAO = roteiroArrecadacao({
  disponibilidade: CAIXA, variacaoAumentativa: VPA,
  receitaARealizar: R_A_REALIZAR, receitaRealizada: R_REALIZADA,
});
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

const PERIODO_2026 = {
  dtInicio: new Date(Date.UTC(2026, 0, 1)),
  dtFim: new Date(Date.UTC(2026, 11, 31)),
  codFinalidade: "62" as const,
};

let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05Deps(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-vpd", codigo: VPD, nome: "VPD", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-vpa", codigo: VPA, nome: "VPA", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-rar", codigo: R_A_REALIZAR, nome: "Receita a realizar", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-rr", codigo: R_REALIZADA, nome: "Receita realizada", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-liq", codigo: C_LIQUIDADO, nome: "Crédito liquidado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-pago", codigo: C_PAGO, nome: "Crédito pago", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });

  // ═══ O REGISTRO 0000 — o ente, com os campos do MANAD ═══
  await prisma.enteConfig.create({
    data: {
      id: "unico",
      codigoIbge: IBGE,
      poderOrgao: "01",
      nome: "Município de Campina Grande",
      cnpj: CNPJ_ENTE,
      uf: "PB",
      indCentralizacao: "0",
      inscricaoMunicipal: "123456",
      tribunalCodigo: "TCE-PB",
      tribunalUf: "PB",
      planoContasSeed: "pcasp-federal",
      conferidoPor: "contabilidade@cg.pb.gov.br",
      conferidoEm: new Date("2026-01-05T12:00:00Z"),
    },
  });
  // ═══ 0050 e 0100 ═══
  await prisma.manadContabilista.create({
    data: {
      nome: "Maria de Assunção",
      cpf: "11122233344",
      crc: "PB012345/O5",
      dtInicio: new Date(Date.UTC(2026, 0, 1)),
      uf: "PB",
      conferidoPor: "contabilidade@cg.pb.gov.br",
      conferidoEm: new Date("2026-01-05T12:00:00Z"),
    },
  });
  await prisma.manadEmpresaGeradora.create({
    data: {
      empresaOuTecnico: "SIAFIC Campina Grande",
      cargo: "Analista de sistemas",
      dtInicioServico: new Date(Date.UTC(2026, 0, 1)),
      cnpj: CNPJ_ENTE,
      conferidoPor: "contabilidade@cg.pb.gov.br",
      conferidoEm: new Date("2026-01-05T12:00:00Z"),
    },
  });

  // ═══ Os cadastros, COM os parâmetros do MANAD ═══
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: {
      id: "uo-01", codigo: "01001", descricao: "Secretaria de Educação", orgaoId: "org-01",
      // TIP_UN_ORC 03 = Secretaria de Educação. É POR UNIDADE — ver o schema.
      tipoManad: "03",
      cnpjManad: CNPJ_ENTE,
    },
  });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "Ensino Fundamental" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "Educação básica" } });
  await prisma.acao.create({
    // TIP_PROJ_ATIV_OE 02 = demais projetos/atividades (não é RPPS).
    data: { id: "aca", codigo: "2001", descricao: "Manutenção do ensino", tipo: "ATIVIDADE", tipoManad: "02" },
  });
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "Servicos de terceiros PJ",
      indTipoContaManad: "A", nivelContaManad: 4,
    },
  });
  await prisma.naturezaReceita.create({
    data: {
      id: "nr", codigo: NAT_IPTU, descricao: "IPTU",
      indTipoContaManad: "A", nivelContaManad: 6,
    },
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  await prisma.contaBancaria.create({
    data: { id: "cb1", codigo: "CC-001", descricao: "Movimento", fonteId: FONTE, contaContabilId: "c-caixa" },
  });

  await criarFichaDeTeste(prisma, {
    id: FICHA, exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd", fonteId: FONTE, valorDotado: "2000000.00",
  });
}

/** O ciclo do cabeçalho. */
async function ciclo2026(): Promise<{ empenhoId: string; liquidacaoId: string }> {
  const e = await empenhar(
    {
      fichaId: FICHA, numero: "NE-1", tipo: "ORDINARIO", valor: "6000.00",
      data: new Date("2026-07-15T12:00:00Z"), credorCpfCnpj: CREDOR_PJ,
      historico: "servicos de TI", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
      criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );

  await anularEmpenhoParcial(
    {
      originalId: e.empenhoId, numero: "ANE-1", valor: "1000.00",
      data: new Date("2026-07-20T12:00:00Z"), motivo: "reducao de escopo",
      criadoPor: POR,
    },
    deps
  );

  const l = await liquidar(
    {
      empenhoId: e.empenhoId, numero: "NL-1", valor: "5000.00",
      data: new Date("2026-07-25T12:00:00Z"), responsavelAtesto: "Fiscal",
      historico: "medicao 1", criadoPor: POR,
    },
    R_LIQUIDACAO,
    deps
  );

  await pagar(
    {
      liquidacaoId: l.liquidacaoId, numero: "NP-1", valor: "2500.00",
      data: new Date("2026-07-30T12:00:00Z"), contaBancaria: "CC-001",
      fonteId: FONTE, historico: "OP parcial", criadoPor: POR,
    },
    R_PAGAMENTO,
    deps
  );

  return { empenhoId: e.empenhoId, liquidacaoId: l.liquidacaoId };
}

const linhasDe = (r: { linhas: readonly LinhaManad[] }, reg: string): readonly LinhaManad[] =>
  r.linhas.filter((l) => l.reg === reg);

const textoDe = (r: { linhas: readonly LinhaManad[] }, reg: string): readonly string[] =>
  linhasDe(r, reg).map(serializarLinha);

describe("M14 — MANAD (TR 7.36)", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t1 — O TESTE DE OURO: as linhas literais do cabeçalho.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t1: ciclo real -> arquivo completo; L050 com DOIS registros do MESMO empenho (D 6.000, C 1.000)", async () => {
    await ciclo2026();
    const manad = await gerarManad(prisma, PERIODO_2026);

    // ⚠️ AS DUAS LINHAS, LITERAIS — pipes, vírgulas, campos vazios e tudo.
    expect(textoDe(manad, "L050")).toEqual([
      "L050|01|01001|12|361|0012||2001|339039|500||NE-1/2026.1|15072026|6000,00|D|12345678000199|servicos de TI",
      "L050|01|01001|12|361|0012||2001|339039|500||NE-1/2026.1|20072026|1000,00|C|12345678000199|reducao de escopo",
    ]);

    // L100 e L150 — o NM_EMP é o MESMO, e é ele que costura os três registros.
    expect(textoDe(manad, "L100")).toEqual([
      "L100|NE-1/2026.1|NE-1-NL-1/2026.1|25072026|5000,00|D|medicao 1",
    ]);
    // O par PATRIMONIAL do L150 (escolha declarada, passo 0(b)): D fornecedor / C caixa.
    //
    // ⚠️ E AS CONTAS SAEM **SEM OS PONTOS**. CTA_DEBITO/CTA_CREDITO são campos NUMÉRICOS
    // (tipo N no leiaute); o código do PCASP no repositório é pontuado ("2.1.3.1.1.00.00")
    // porque o ponto é APRESENTAÇÃO. A conta é a sequência de dígitos — 213110000 é o
    // fornecedor, 111120000 é o caixa. É a mesma conversão de borda da vírgula decimal.
    expect(textoDe(manad, "L150")).toEqual([
      "L150|NE-1/2026.1|NE-1-NL-1-NP-1/2026.1|30072026|2500,00|D|OP parcial|" +
        "213110000|0101001|111120000|0101001",
    ]);

    // ⚠️ O BALANCETE DA DESPESA — e os literais que a N3 amarra.
    // dotação 100.000 · sem créditos · empenhado 5.000 · liquidado 5.000 · pago 2.500
    expect(textoDe(manad, "L250")).toEqual([
      "L250|2026|01|01001|12|361|0012||2001||339039|500|2000000,00||0,00|0,00|0,00|0,00|||" +
        "5000,00|5000,00|2500,00|",
    ]);

    // Os cadastros REFERENCIADOS — um de cada, e nenhum a mais.
    expect(textoDe(manad, "L350")).toEqual(["L350|2026|01|Prefeitura"]);
    expect(textoDe(manad, "L400")).toEqual([
      `L400|2026|01|01001|Secretaria de Educação|03|${CNPJ_ENTE}`,
    ]);
    expect(textoDe(manad, "L650")).toEqual([
      "L650|2026|2001|Manutenção do ensino|02",
    ]);
    expect(textoDe(manad, "L700")).toEqual([
      "L700|2026|339039|Servicos de terceiros PJ|A|4",
    ]);
    // ⚠️ ZERO L600: o SUBPROGRAMA foi extinto pela Portaria STN 42/1999.
    expect(linhasDe(manad, "L600")).toHaveLength(0);
    // ⚠️ ZERO L800 — mas NÃO por falta de módulo (o TR 4.50 existe agora): é que ESTE
    // empenho não é de obra (elemento 39). Sem obra no cenário, sem linha e SEM pendência.
    expect(linhasDe(manad, "L800")).toHaveLength(0);
    expect(manad.pendencias.some((p) => p.registro === "L800")).toBe(false);

    // O fornecedor: PJ (tipo 2), com CNPJ preenchido e CPF vazio.
    expect(textoDe(manad, "L750")).toEqual([
      `L750|2026|${CREDOR_PJ}||2|${CREDOR_PJ}|||||||`,
    ]);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t2 — N1 / N2 / N3, e a mutação de cada uma.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t2: N1 (contagens), N2 (arquivo × M05) e N3 (L250 × L050) fecham — e cada mutação acusa", async () => {
    await ciclo2026();
    const manad = await gerarManad(prisma, PERIODO_2026);

    // ── N1: SEGUNDA CONTAGEM, INDEPENDENTE. O teste NÃO reusa a do gerador. ──
    const conta = (reg: string): number => linhasDe(manad, reg).length;
    const campo = (reg: string, i: number): string =>
      linhasDe(manad, reg)[0]!.campos[i]!;

    const idx = manad.linhas.map((l) => l.reg);
    const bloco0 = idx.filter((r) => r.startsWith("0")).length;
    const blocoK = idx.filter((r) => r.startsWith("K")).length;
    const blocoL = idx.filter((r) => r.startsWith("L")).length;
    const bloco9 = idx.filter((r) => r.startsWith("9")).length;

    expect(campo("0990", 0)).toBe(String(bloco0)); // "inclusive" — o 0990 conta a si
    expect(campo("K990", 0)).toBe(String(blocoK));
    expect(campo("L990", 0)).toBe(String(blocoL));
    expect(campo("9990", 0)).toBe(String(bloco9));
    expect(campo("9999", 0)).toBe(String(manad.linhas.length));

    // ⚠️ E CADA 9900 CONTA UM TIPO DE VERDADE — inclusive os do próprio bloco 9.
    for (const l of linhasDe(manad, "9900")) {
      const tipo = l.campos[0]!;
      expect(l.campos[1], `9900 do tipo ${tipo}`).toBe(String(conta(tipo)));
    }
    // o 9900 conta a si mesmo, e o número bate com quantos 9900 existem
    const l9900 = linhasDe(manad, "9900").find((l) => l.campos[0] === "9900")!;
    expect(l9900.campos[1]).toBe(String(conta("9900")));

    // ── N2 / N3 — os dados que o gerador usou, refeitos à mão ──
    const l050 = [
      { fichaId: FICHA, valor: toMoney("6000.00"), indDebCred: "D" as const },
      { fichaId: FICHA, valor: toMoney("1000.00"), indDebCred: "C" as const },
    ];
    // ⚠️ A N2 É COMPOSTA: empenhado líquido do M05 MENOS o cancelado de RP do M08. Sem
    // cancelamento no cenário, a parcela é zero — e o compilador EXIGE que ela seja dita.
    const doM05 = [
      { fichaId: FICHA, liquido: toMoney("5000.00"), canceladoRp: toMoney("0.00") },
    ];
    const l250 = [{ fichaId: FICHA, empenhado: toMoney("5000.00") }];

    expect(() => conferirN2(l050, doM05)).not.toThrow();
    expect(() => conferirN3(l250, l050)).not.toThrow();

    // ⚠️ MUTAÇÃO DA N2 — o gerador PERDE o registro de anulação (o "C"). O arquivo
    // continuaria bem-formado: pipes certos, contagens fechando, validador aceitando. E
    // o empenho iria à Receita valendo 6.000 quando vale 5.000.
    expect(() => conferirN2([l050[0]!], doM05)).toThrow(/N2 NÃO FECHA na ficha/);
    expect(() => conferirN2([l050[0]!], doM05)).toThrow(/6000\.00.*5000\.00/s);

    // ⚠️ MUTAÇÃO DA N2 — o gerador troca o sinal: emite a anulação como "D".
    const sinalTrocado = [l050[0]!, { ...l050[1]!, indDebCred: "D" as const }];
    expect(() => conferirN2(sinalTrocado, doM05)).toThrow(/N2 NÃO FECHA/);

    // ⚠️ MUTAÇÃO DA N3 — o balancete diverge do detalhe DENTRO do mesmo arquivo.
    expect(() =>
      conferirN3([{ fichaId: FICHA, empenhado: toMoney("6000.00") }], l050)
    ).toThrow(/N3 NÃO FECHA na ficha/);

    // ── restauradas: as originais seguem fechando ──
    expect(() => conferirN2(l050, doM05)).not.toThrow();
    expect(() => conferirN3(l250, l050)).not.toThrow();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t3 — O FORMATO. O oposto da MSC, campo a campo.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t3: vírgula decimal, ddmmaaaa, campo vazio ||, SEM pipe final, e o arquivo em Latin-1", async () => {
    await ciclo2026();

    // Um valor com milhar: 1.129.989,99 — SEM separador de milhar, COM vírgula.
    await empenhar(
      {
        fichaId: FICHA, numero: "NE-2", tipo: "ORDINARIO", valor: "1129989.99",
        data: new Date("2026-07-01T12:00:00Z"), credorCpfCnpj: CREDOR_PJ,
        historico: "compra grande", categoriaOrdemCronologica: "FORNECIMENTO_BENS",
        criadoPor: POR,
      },
      R_EMPENHO,
      deps
    );

    const manad = await gerarManad(prisma, PERIODO_2026);
    const l050 = textoDe(manad, "L050");

    const grande = l050.find((l) => l.includes("NE-2"))!;
    expect(grande).toContain("|1129989,99|"); // ⚠️ VÍRGULA, sem milhar
    expect(grande).not.toContain("1.129.989"); // e NUNCA o formato brasileiro de milhar
    expect(grande).toContain("|01072026|"); // ⚠️ ddmmaaaa
    expect(grande).toContain("|0012||2001|"); // ⚠️ COD_SUBPROGR vazio: ||

    // ⚠️ SEM DELIMITADOR EXTRA AO FIM — e a invariante certa é a CONTAGEM DE CAMPOS.
    //
    // A tentação é testar `!linha.endsWith("|")`. Isso está ERRADO, e o 0050 prova: um
    // contabilista sem e-mail termina a linha em "|", porque o campo EMAIL existe no
    // leiaute e está VAZIO (3.1.9). Aparar aquele pipe apagaria um campo — e a linha
    // passaria a ter 17 campos onde o leiaute exige 18.
    //
    // O que a regra proíbe é o delimitador A MAIS (o clássico `map(c => c + "|")`), e é
    // isso que a contagem pega.
    for (const l of manad.linhas) {
      const texto = serializarLinha(l);
      expect(texto.split("|"), `linha ${l.reg}`).toHaveLength(1 + l.campos.length);
      expect(texto.slice(0, 4)).toBe(l.reg); // 4 primeiros chars = o código do registro
    }
    // E há de fato linha terminando em pipe — o 0050 sem e-mail. É CORRETO.
    const l0050 = manad.linhas.filter((l) => l.reg === "0050").map(serializarLinha)[0]!;
    expect(l0050.endsWith("|")).toBe(true);
    expect(l0050.split("|")).toHaveLength(18); // REG + 17 campos, como o leiaute manda

    // ═══ O ARQUIVO É LATIN-1, E O BYTE PROVA ═══
    // "Secretaria de Educação" (L400) e "Manutenção do ensino" (L650) têm "ç" e "ã".
    const bytes = manad.arquivo;
    // Em Latin-1, "ç" é UM byte: 0xE7. Em UTF-8 seriam DOIS (0xC3 0xA7).
    expect(bytes.includes(Buffer.from([0xe7]))).toBe(true);
    expect(bytes.includes(Buffer.from([0xc3, 0xa7]))).toBe(false);
    // e o texto volta inteiro quando lido como Latin-1
    expect(bytes.toString("latin1")).toContain("Secretaria de Educação");
    expect(bytes.toString("latin1")).toContain("Manutenção do ensino");

    // ⚠️ FAIL-CLOSED DE CODIFICAÇÃO: o que NÃO cabe em Latin-1 derruba a geração,
    // nomeando o caractere, o registro e o campo. Nada de transliteração silenciosa.
    expect(() =>
      exigirLatin1("Prefeitura — Gabinete", { registro: "L350", campo: "NOME_ORG" })
    ).toThrow(/CARACTERE FORA DO ISO 8859-1 no registro L350, campo NOME_ORG/);
    expect(() =>
      exigirLatin1("Prefeitura — Gabinete", { registro: "L350", campo: "NOME_ORG" })
    ).toThrow(/U\+2014/); // o travessão, nomeado pelo ponto de código
    // ...e o "ç" e o "ã" PASSAM: eles CABEM em Latin-1. Transliterá-los seria o erro.
    expect(exigirLatin1("Educação", { registro: "L400", campo: "NOM_UN_ORC" })).toBe(
      "Educação"
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t4 — RESTOS A PAGAR (orientações a/b).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t4: pagamento de RP do exercício anterior sai no L150, e o empenho de origem no L050", async () => {
    // 2026: empenha e liquida, NÃO paga -> vira RP PROCESSADO.
    const e = await empenhar(
      {
        fichaId: FICHA, numero: "NE-RP", tipo: "ORDINARIO", valor: "4000.00",
        data: new Date("2026-03-01T12:00:00Z"), credorCpfCnpj: CREDOR_PJ,
        historico: "servico de 2026", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
        criadoPor: POR,
      },
      R_EMPENHO,
      deps
    );
    const l = await liquidar(
      {
        empenhoId: e.empenhoId, numero: "NL-RP", valor: "4000.00",
        data: new Date("2026-04-01T12:00:00Z"), responsavelAtesto: "Fiscal",
        historico: "medicao de 2026", criadoPor: POR,
      },
      R_LIQUIDACAO,
      deps
    );

    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
    await abrirExercicio(prisma, { ano: 2027, criadoPor: POR }).catch(() => null);

    // 2027: paga o RP.
    await pagarRestosAPagar(
      prisma,
      {
        liquidacaoId: l.liquidacaoId, numero: "NP-RP", valor: "4000.00",
        data: new Date("2027-02-10T12:00:00Z"), contaBancaria: "CC-001",
        fonteId: FONTE, historico: "pagamento de RP de 2026", criadoPor: POR,
      },
      roteiroPagamentoRestos({
        restosAPagarProcessados: FORNECEDOR,
        disponibilidade: CAIXA,
      })
    );

    // O MANAD de 2027.
    const manad = await gerarManad(prisma, {
      dtInicio: new Date(Date.UTC(2027, 0, 1)),
      dtFim: new Date(Date.UTC(2027, 11, 31)),
      codFinalidade: "62",
    });

    // ⚠️ ORIENTAÇÃO (b): o EMPENHO DE ORIGEM entra no L050 do exercício em que o RP se
    // move — pelo VALOR ORIGINAL. Sem ele, o L150 apontaria para um NM_EMP inexistente.
    expect(textoDe(manad, "L050")).toEqual([
      "L050|01|01001|12|361|0012||2001|339039|500||NE-RP/2026.1|01032026|4000,00|D|" +
        `${CREDOR_PJ}|servico de 2026`,
    ]);

    // ⚠️ ORIENTAÇÃO (a): o PAGAMENTO do RP sai no L150 — e de graça, porque o M08 grava
    // um `Pagamento` de verdade, pendurado no mesmo empenho. O NM_EMP costura os dois.
    const l150 = textoDe(manad, "L150");
    expect(l150).toHaveLength(1);
    expect(l150[0]).toContain("|NE-RP/2026.1|");
    expect(l150[0]).toContain("|10022027|4000,00|D|pagamento de RP de 2026|");

    // ⚠️ E O L250 DE 2027 NÃO TEM A FICHA DE 2026 — o RP não é despesa do ano novo.
    // A ficha de 2026 não aparece no balancete de 2027 (não há ficha de 2027 aqui).
    expect(linhasDe(manad, "L250")).toHaveLength(0);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t5 — L300: o Record EXAUSTIVO da origem do recurso.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t5: decreto por SUPERÁVIT -> TIP_ORIG_RECURSO=1; por EXCESSO -> 2 (o Record, provado)", () => {
    // O Record é PURO — provado sem banco, e é o ponto: uma origem nova NÃO COMPILA
    // até alguém dizer que código do manual ela é.
    expect(TIP_ORIG_RECURSO.SUPERAVIT_FINANCEIRO).toBe("1");
    expect(TIP_ORIG_RECURSO.EXCESSO_ARRECADACAO).toBe("2");
    expect(TIP_ORIG_RECURSO.OPERACAO_CREDITO).toBe("3");
    // ⚠️ A ANULAÇÃO É **5** (Reduções Orçamentárias) — não 3, não 4.
    expect(TIP_ORIG_RECURSO.ANULACAO).toBe("5");

    // ⚠️ E O CÓDIGO **4** (Auxílios e Convênios) NÃO TEM ORIGEM NOSSA. As quatro origens
    // do M03 estão todas mapeadas, e nenhuma delas é convênio — no repositório, um
    // convênio entra como RECEITA e vira excesso ou superávit.
    expect(Object.values(TIP_ORIG_RECURSO)).not.toContain("4");
    expect(Object.keys(TIP_ORIG_RECURSO).sort()).toEqual([
      "ANULACAO",
      "EXCESSO_ARRECADACAO",
      "OPERACAO_CREDITO",
      "SUPERAVIT_FINANCEIRO",
    ]);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t6 — L750: o nome vem do contrato; sem contrato, vazio + pendência NOMEADA.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t6: credor SEM contrato sai com NOM_FORNECEDOR vazio — e a pendência é nomeada, com tamanho", async () => {
    await ciclo2026();
    const manad = await gerarManad(prisma, PERIODO_2026);

    // Sem contrato no M11: o nome NÃO existe no repositório. Vazio (3.1.9), nunca inventado.
    expect(textoDe(manad, "L750")).toEqual([
      `L750|2026|${CREDOR_PJ}||2|${CREDOR_PJ}|||||||`,
    ]);

    const p = manad.pendencias.find((x) => x.registro === "L750")!;
    expect(p).toBeDefined();
    expect(p.quantidade).toBe(1); // ⚠️ A PENDÊNCIA TEM TAMANHO: 1 credor sem nome.
    expect(p.motivo).toMatch(/NOM_FORNECEDOR sai VAZIO/);
    expect(p.motivo).toMatch(/CADASTRO DE CREDORES/);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t7 — O BLOCO K: só a abertura.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t7: bloco K sai com K001|1 (sem dados) e K990|2 — exatos", async () => {
    await ciclo2026();
    const manad = await gerarManad(prisma, PERIODO_2026);

    // ⚠️ IND_MOV = 1 -> "SEM dados". A folha é o TR 7.10, que NÃO existe no repositório.
    // Declarar 0 ("com dados") e não emitir nada seria mentir sobre o conteúdo do arquivo.
    expect(textoDe(manad, "K001")).toEqual(["K001|1"]);
    // K990 conta de K001 a K990, INCLUSIVE -> 2.
    expect(textoDe(manad, "K990")).toEqual(["K990|2"]);

    // ⚠️ E O BLOCO I NÃO EXISTE — nem vazio. Ele é a escrituração de pessoa jurídica de
    // Direito PRIVADO; um município não o tem.
    expect(manad.linhas.some((l) => l.reg.startsWith("I"))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// BLOCO NOVO — cancelamento de RP no L050, e o L800 (obras, TR 4.50)
// ═══════════════════════════════════════════════════════════════════════════
//
// ═══ O CENÁRIO DO RP (t1/t2) ═══
//   2026  empenho NE-RP  5.000,00  (elemento 39, sem obra)  · liquidação NÃO acontece
//         -> encerramento inscreve RP NÃO PROCESSADO de 5.000,00
//   2027  CANCELAMENTO de 2.000,00 em 10/03/2027 (a data do FATO)
//
//   ⚠️ NO ARQUIVO DE **2027**, o L050 tem DUAS linhas do MESMO NM_EMP:
//     L050|...|NE-RP/2026.1|01032026|5000,00|D|...   <- orientação (b): VALOR ORIGINAL
//     L050|...|NE-RP/2026.1|10032027|2000,00|C|...   <- orientação (c): o cancelamento
//   A Receita soma por NM_EMP: 5.000 − 2.000 = 3.000 é o que resta da obrigação.
//
//   ⚠️ NO ARQUIVO DE **2026**, o cancelamento NÃO aparece: ele é fato de 2027. O corte é
//   pela data do FATO (a `dataTransacao` do lançamento), nunca pelo `criadoEm`.
//
// ═══ AS SUB-IDENTIDADES (N2-RP), À MÃO ═══
//   D no arquivo   5.000,00  ==  valor do Empenho de origem (M05)     ✓
//   Σ C no arquivo 2.000,00  ==  cancelado do M08 no corte            ✓
//
// ═══ O L800 (t4) ═══
//   obra OB-2026-001 · PAVIMENTACAO_ASFALTICA (tipo 05) · CEI 123456789012
//   empenho NE-OB 100.000,00 na ficha de obra (elemento 51, natureza 449051)
//
//   L800|2026|449051|12345678000199|NE-OB/2026.9|05|123456789012|Pavimentação da Av. Brasil
//
//   Campos: REG|EXERCICIO|COD_CTA_DESP|COD_FORNECEDOR|NM_EMP|TIP_OBRA_SERVICO|CEI|DESC

const FICHA_OBRA = "ficha-obra";

/** A ficha de OBRA (elemento 51) — só o cenário do L800 precisa dela. */
async function semearFichaDeObra(): Promise<void> {
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd-obra", codCategoria: "4", codNatureza: "4", codModalidade: "90",
      codElemento: "51", codigoCompleto: "449051", descricao: "Obras e Instalações",
      indTipoContaManad: "A", nivelContaManad: 4,
    },
  });
  await criarFichaDeTeste(prisma, {
    id: FICHA_OBRA, exercicio: 2026, numero: 9, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd-obra", fonteId: FONTE, valorDotado: "2000000.00",
  });
}

/** 2026: empenha 5.000 e NÃO liquida -> vira RP NÃO PROCESSADO. */
async function rpDe2026(): Promise<string> {
  const e = await empenhar(
    {
      fichaId: FICHA, numero: "NE-RP", tipo: "ORDINARIO", valor: "5000.00",
      data: new Date("2026-03-01T12:00:00Z"), credorCpfCnpj: CREDOR_PJ,
      historico: "servico de 2026", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
      criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
  await abrirExercicio(prisma, { ano: 2027, criadoPor: POR }).catch(() => null);
  return e.empenhoId;
}

const PERIODO_2027 = {
  dtInicio: new Date(Date.UTC(2027, 0, 1)),
  dtFim: new Date(Date.UTC(2027, 11, 31)),
  codFinalidade: "62" as const,
};

describe("M14 — MANAD: cancelamento de RP e obras (L800)", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t1 — O CANCELAMENTO DE RP VIRA UM "C" NO L050.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t1: RP cancelado em 2027 -> L050 D 5.000 (valor original) + C 2.000 (data do FATO); 2026 NÃO o carrega", async () => {
    await rpDe2026();

    const inscricao = await prisma.inscricaoRestosAPagar.findFirstOrThrow({
      select: { id: true, tipo: true, valorInscrito: true },
    });
    expect(inscricao.tipo).toBe("NAO_PROCESSADO");
    expect(inscricao.valorInscrito.toFixed(2)).toBe("5000.00");

    await cancelarRestosAPagar(
      prisma,
      {
        inscricaoId: inscricao.id,
        valor: "2000.00",
        motivo: "obra descontinuada por decisao do gestor",
        // ⚠️ A DATA DO FATO. Ela vai para a `dataTransacao` do lançamento — e é DELA que
        // o MANAD tira o DT_EMP do registro "C". O `criadoEm` (a digitação) é hoje.
        data: new Date("2027-03-10T12:00:00Z"),
        criadoPor: POR,
      },
      roteiroCancelamentoRestos({
        restosAPagar: FORNECEDOR,
        variacaoAumentativa: VPA,
      })
    );

    // ═══ O ARQUIVO DE 2027 — as DUAS linhas do mesmo NM_EMP ═══
    const m2027 = await gerarManad(prisma, PERIODO_2027);
    const l050 = textoDe(m2027, "L050");
    expect(l050).toHaveLength(2);

    // orientação (b): o empenho de origem, pelo VALOR ORIGINAL
    expect(l050[0]).toBe(
      "L050|01|01001|12|361|0012||2001|339039|500||NE-RP/2026.1|01032026|5000,00|D|" +
        `${CREDOR_PJ}|servico de 2026`
    );
    // ⚠️ orientação (c): o CANCELAMENTO — "C-anulação, cancelamento", literal do manual.
    // A DATA é a do FATO (10/03/2027), o NM_EMP é o da RAIZ e o credor também.
    expect(l050[1]).toBe(
      "L050|01|01001|12|361|0012||2001|339039|500||NE-RP/2026.1|10032027|2000,00|C|" +
        `${CREDOR_PJ}|Cancelamento de RP NAO_PROCESSADO: obra descontinuada por decisao do gestor`
    );

    // ⚠️ E A PENDÊNCIA DE cae5f45 MORREU: o cancelamento tem casa agora.
    expect(
      m2027.pendencias.some((p) => p.motivo.includes("DECISÃO DE LEIAUTE"))
    ).toBe(false);

    // ═══ O ARQUIVO DE 2026 NÃO CARREGA O CANCELAMENTO — o corte é pela data do FATO ═══
    const m2026 = await gerarManad(prisma, PERIODO_2026);
    const l050de2026 = textoDe(m2026, "L050");
    expect(l050de2026).toHaveLength(1); // só o empenho
    expect(l050de2026[0]).toContain("|5000,00|D|");
    expect(l050de2026.some((l) => l.includes("|C|"))).toBe(false);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t2 — A N2 COMPOSTA e as SUB-IDENTIDADES do RP.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t2: N2 composta e N2-RP acusam o cancelamento OMITIDO — nomeando a diferença de 2.000", () => {
    // ── A N2 COMPOSTA: o cancelamento SUBTRAI do lado dos donos ──
    //
    // ⚠️ ELE NÃO É UM `Empenho`. O `somaLiquidaEstornaveis` do M05 não o vê — e era por
    // isso que, em cae5f45, emitir o cancelamento QUEBRARIA a N2. A cura não foi afrouxar
    // a identidade: foi COMPÔ-LA, trazendo o cancelado do seu dono (o M08).
    const l050ComCancelamento = [
      { fichaId: FICHA, valor: toMoney("5000.00"), indDebCred: "D" as const },
      { fichaId: FICHA, valor: toMoney("2000.00"), indDebCred: "C" as const },
    ];
    const donos = [
      {
        fichaId: FICHA,
        liquido: toMoney("5000.00"), // M05: o empenho, nunca anulado
        canceladoRp: toMoney("2000.00"), // M08: o cancelamento de RP no corte
      },
    ];
    // 5.000 − 2.000 = 3.000, dos dois lados.
    expect(() => conferirN2(l050ComCancelamento, donos)).not.toThrow();

    // ⚠️ MUTAÇÃO: o gerador OMITE o cancelamento do arquivo. Ele continuaria bem-formado —
    // e a Receita veria uma obrigação de 5.000 que na verdade vale 3.000.
    expect(() => conferirN2([l050ComCancelamento[0]!], donos)).toThrow(
      /N2 NÃO FECHA na ficha/
    );
    expect(() => conferirN2([l050ComCancelamento[0]!], donos)).toThrow(
      /Diferença: -2000\.00/
    );
    // ...e a mensagem MOSTRA AS DUAS PARCELAS, para que se saiba QUAL delas divergiu.
    expect(() => conferirN2([l050ComCancelamento[0]!], donos)).toThrow(
      /empenhado líquido do M05 5000\.00 − cancelado de RP do M08 2000\.00/
    );

    // ── AS SUB-IDENTIDADES DO RP (orientação (b)) ──
    const rpOk = [
      {
        empenhoId: "e1",
        nmEmp: "NE-RP/2026.1",
        debitoNoArquivo: toMoney("5000.00"),
        valorOriginal: toMoney("5000.00"),
        creditosNoArquivo: toMoney("2000.00"),
        canceladoDoM08: toMoney("2000.00"),
      },
    ];
    expect(() => conferirN2Rp(rpOk)).not.toThrow();

    // ⚠️ O RP carregado por um valor que NÃO é o original (a orientação (b) exige o original)
    expect(() =>
      conferirN2Rp([{ ...rpOk[0]!, debitoNoArquivo: toMoney("3000.00") }])
    ).toThrow(/N2-RP NÃO FECHA \(valor original\) no empenho NE-RP\/2026\.1/);

    // ⚠️ O cancelamento que o M08 conhece e o arquivo NÃO emitiu.
    expect(() =>
      conferirN2Rp([{ ...rpOk[0]!, creditosNoArquivo: toMoney("0.00") }])
    ).toThrow(/N2-RP NÃO FECHA \(cancelamentos\).*Diferença: 2000\.00/s);

    // ── restauradas ──
    expect(() => conferirN2(l050ComCancelamento, donos)).not.toThrow();
    expect(() => conferirN2Rp(rpOk)).not.toThrow();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t4 — L800 OURO: a linha literal.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t4: obra tipo 05 com CEI -> linha L800 literal; obra SEM CEI -> campo || e pendência viva", async () => {
    await semearFichaDeObra();

    const { obraId } = await cadastrarObra(prisma, {
      identificador: "OB-2026-001",
      descricao: "Pavimentação da Av. Brasil",
      tipoObraServico: "PAVIMENTACAO_ASFALTICA", // tipo 05 do rol da IN 100/2003
      cei: "123456789012",
      criadoPor: POR,
    });

    await empenhar(
      {
        fichaId: FICHA_OBRA, numero: "NE-OB", tipo: "ORDINARIO", valor: "100000.00",
        data: new Date("2026-05-10T12:00:00Z"), credorCpfCnpj: CREDOR_PJ,
        historico: "pavimentacao", categoriaOrdemCronologica: "REALIZACAO_OBRAS",
        obraId,
        criadoPor: POR,
      },
      R_EMPENHO,
      deps
    );

    const manad = await gerarManad(prisma, PERIODO_2026);

    // ⚠️ A LINHA DO L800 — o registro que a AFPS vem procurar no MANAD.
    expect(textoDe(manad, "L800")).toEqual([
      "L800|2026|449051|12345678000199|NE-OB/2026.9|05|123456789012|Pavimentação da Av. Brasil",
    ]);
    // Com CEI, ZERO pendência de L800.
    expect(manad.pendencias.some((p) => p.registro === "L800")).toBe(false);

    // ═══ A MESMA OBRA, SEM CEI ═══
    await prisma.obra.update({ where: { id: obraId }, data: { cei: null } });
    const semCei = await gerarManad(prisma, PERIODO_2026);

    // ⚠️ O CAMPO SAI VAZIO (3.1.9) E A LINHA SAI MESMO ASSIM. Uma obra existe ANTES da
    // matrícula — derrubar a geração obrigaria o ente a INVENTAR um CEI, e um CEI
    // inventado num arquivo da Receita é infinitamente pior que um campo vazio.
    expect(textoDe(semCei, "L800")).toEqual([
      "L800|2026|449051|12345678000199|NE-OB/2026.9|05||Pavimentação da Av. Brasil",
    ]);
    // A contagem de campos continua EXATA: REG + 7 campos.
    const linha = linhasDe(semCei, "L800")[0]!;
    expect(serializarLinha(linha).split("|")).toHaveLength(8);

    // ...e a PENDÊNCIA VIVA sai junto, com o nome da obra.
    const p = semCei.pendencias.find((x) => x.registro === "L800")!;
    expect(p).toBeDefined();
    expect(p.quantidade).toBe(1);
    expect(p.motivo).toMatch(/OB-2026-001/);
    expect(p.motivo).toMatch(/retenção previdenciária à obra/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// t8 — a invariante do módulo (sem banco)
// ═══════════════════════════════════════════════════════════════════════════
describe("M14 — MANAD: as invariantes do módulo", () => {
  it("t8: ZERO escrita e ZERO SUM bruto no gerador do MANAD (o grep roda aqui)", () => {
    const raiz = join(fileURLToPath(new URL(".", import.meta.url)), "manad");
    const arquivos = readdirSync(raiz)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => join(raiz, f));
    expect(arquivos.length).toBeGreaterThan(0);

    // Um export fiscal que GRAVA pode corromper o que envia à Receita — e o MANAD tem de
    // poder ser REPRODUZIDO amanhã, dos fatos, byte a byte.
    const ESCRITA = /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/;
    // Um export que SOMA por conta própria diverge do balanço. Toda soma vem do DONO
    // (`somaLiquidaEstornaveis`, packages/estornaveis).
    const SUM_BRUTO = /\.(aggregate|groupBy)\(|_sum/;

    for (const f of arquivos) {
      const efetivo = readFileSync(f, "utf8")
        .split("\n")
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join("\n");
      expect(ESCRITA.test(efetivo), `${f} tem ESCRITA`).toBe(false);
      expect(SUM_BRUTO.test(efetivo), `${f} tem SUM bruto`).toBe(false);
    }
  });
});
