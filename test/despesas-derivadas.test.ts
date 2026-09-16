import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Decimal, toMoney } from "../packages/contracts/index.js";
import { diaCivil, fimDoDiaCivil, inicioDoDiaCivil } from "../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { criarFichaDeTeste } from "./ficha-teste.js";
import { limparBanco } from "./limpar-banco.js";
import { criarM05DepsComContratos } from "../modules/m11-licitacoes/adapter-m05.js";
import { roteiroEmpenho, roteiroLiquidacao, roteiroPagamento } from "../modules/m05-despesa/dominio.js";
import { anularEmpenho, empenhar } from "../modules/m05-despesa/servico.js";
import { anularEmpenhoParcial, estornarAnulacaoParcial } from "../modules/m05-despesa/anulacao-parcial.js";
import { liquidar, pagar } from "../modules/m05-despesa/servico-bloco2.js";
import type { M05Deps } from "../modules/m05-despesa/ports.js";
import { liquido, listarDespesasPublicas } from "../lib/portas/despesas-publicas.js";
import { derivadasDe, totaisDerivados } from "../lib/portas/despesas-derivadas.js";

/**
 * ═══ O ESTADO DERIVADO DA DESPESA, CONFERIDO CONTRA A RÉGUA DO DOMÍNIO (V10 T3 · N2) ═══
 *
 * A consulta pública passou a derivar empenhado/liquidado/pago **em SQL**, para que o filtro de
 * fase, a contagem, a paginação, os totais e o CSV falem do mesmo conjunto. Isso criou uma
 * SEGUNDA implementação da aritmética de `packages/estornaveis`.
 *
 * ⚠️ É EXATAMENTE POR ISSO QUE ESTE ARQUIVO EXISTE. "Parser se testa contra implementação
 * independente": o SQL é conferido contra a função do domínio, sobre as MESMAS linhas. Usar o
 * próprio SQL para conferir o próprio SQL passaria com qualquer interpretação errada consistente.
 *
 * ⚠️ FIXTURE N=2 EM TODA REGRA DE CONJUNTO: dois empenhos por fase, duas anulações parciais no
 * mesmo empenho, duas páginas, dois empenhos com o mesmo valor (para a paginação estável).
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => prisma.$disconnect());

const POR = "contabilidade@cg.pb.gov.br";
const CNPJ = "12345678000199";
const FONTE = "fnt-500";
const dia = (d: number): string => diaCivil(new Date(Date.now() + d * 86_400_000));

const CAIXA = "1.1.1.1.2.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const VPD = "3.3.2.1.1.01.00";
const C_DISP = "6.2.2.1.1.00.00";
const C_EMP = "6.2.2.1.3.01.00";
const C_LIQ = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";
const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: C_DISP, creditoEmpenhado: C_EMP });
const R_LIQUIDACAO = roteiroLiquidacao({ variacaoDiminutiva: VPD, obrigacaoAPagar: FORNECEDOR, creditoEmpenhado: C_EMP, creditoLiquidado: C_LIQ });
const R_PAGAMENTO = roteiroPagamento({ obrigacaoAPagar: FORNECEDOR, disponibilidade: CAIXA, creditoLiquidado: C_LIQ, creditoPago: C_PAGO });

let deps: M05Deps;

beforeEach(async () => {
  await limparBanco(prisma);
  deps = criarM05DepsComContratos(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-vpd", codigo: VPD, nome: "VPD", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-disp", codigo: C_DISP, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: C_EMP, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-liq", codigo: C_LIQ, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-pago", codigo: C_PAGO, nome: "Crédito Pago", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.createMany({
    data: [
      { id: "uo-01", codigo: "01001", descricao: "Saúde", orgaoId: "org-01" },
      { id: "uo-02", codigo: "01002", descricao: "Educação", orgaoId: "org-01" },
    ],
  });
  await prisma.funcao.create({ data: { id: "fun-10", codigo: "10", nome: "Saúde" } });
  await prisma.subfuncao.create({ data: { id: "sub-301", codigo: "301", nome: "Atenção básica" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0010", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2010", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd-39", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços" } });
  await prisma.fonteRecurso.create({ data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await prisma.contaBancaria.create({ data: { id: "cb1", codigo: "CC-001", descricao: "Movimento", fonteId: FONTE } });
  const base = { exercicio: 2026, orgaoId: "org-01", funcaoId: "fun-10", subfuncaoId: "sub-301", programaId: "prg", acaoId: "aca", fonteId: FONTE, naturezaDespesaId: "nd-39", valorDotado: "9000000.00" };
  await criarFichaDeTeste(prisma, { ...base, id: "ficha-a", numero: 1, unidadeOrcId: "uo-01" });
  await criarFichaDeTeste(prisma, { ...base, id: "ficha-b", numero: 2, unidadeOrcId: "uo-02" });
  await prisma.pessoa.create({ data: { documento: CNPJ, tipo: "JURIDICA", criadoPor: POR, versoes: { create: { nome: "Serviços Técnicos Beta Ltda", criadoPor: POR } } } });
}, 180_000);

const empenho = (fichaId: string, numero: string, valor: string, diasAtras = 20) =>
  empenhar(
    { fichaId, numero, tipo: "GLOBAL", valor, data: inicioDoDiaCivil(dia(-diasAtras)), credorCpfCnpj: CNPJ, historico: `Despesa do empenho ${numero}`, categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR },
    R_EMPENHO,
    deps
  );

/** O líquido de uma cadeia, pela régua do DOMÍNIO — a implementação independente. */
async function liquidosPeloDominio(empenhoId: string): Promise<{ empenhado: string; liquidado: string; pago: string }> {
  const e = await prisma.empenho.findUniqueOrThrow({
    where: { id: empenhoId },
    select: {
      id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true,
      estornos: { select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true } },
      anulacoesParciais: {
        select: {
          id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true,
          // ⚠️ OS ESTORNOS DAS PARCIAIS ENTRAM AQUI, e a projeção antiga não os carregava —
          // ver o cabeçalho de `despesas-derivadas.ts`. Sem eles, a régua do domínio também
          // erraria, e o teste compararia dois erros iguais.
          estornos: { select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true } },
        },
      },
      liquidacoes: {
        select: {
          id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true,
          estornos: { select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true } },
          anulacoesParciais: { select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true } },
          pagamentos: {
            select: {
              id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true,
              estornos: { select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true } },
              anulacoesParciais: { select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true } },
            },
          },
        },
      },
    },
  });
  const cadeiaEmpenho = [
    { id: e.id, valor: e.valor, estornoDeId: e.estornoDeId, anulacaoParcialDeId: e.anulacaoParcialDeId },
    ...e.estornos,
    ...e.anulacoesParciais.map((p) => ({ id: p.id, valor: p.valor, estornoDeId: p.estornoDeId, anulacaoParcialDeId: p.anulacaoParcialDeId })),
    ...e.anulacoesParciais.flatMap((p) => p.estornos),
  ];
  const liquidacoes = e.liquidacoes.flatMap((l) => [
    { id: l.id, valor: l.valor, estornoDeId: l.estornoDeId, anulacaoParcialDeId: l.anulacaoParcialDeId },
    ...l.estornos, ...l.anulacoesParciais,
  ]);
  const pagamentos = e.liquidacoes.flatMap((l) =>
    l.pagamentos.flatMap((p) => [
      { id: p.id, valor: p.valor, estornoDeId: p.estornoDeId, anulacaoParcialDeId: p.anulacaoParcialDeId },
      ...p.estornos, ...p.anulacoesParciais,
    ])
  );
  const adaptar = (ls: readonly { id: string; valor: { toFixed(n: number): string }; estornoDeId: string | null; anulacaoParcialDeId: string | null }[]) =>
    ls.map((l) => ({ id: l.id, valor: l.valor, estornoDeId: l.estornoDeId, anulacaoParcialDeId: l.anulacaoParcialDeId }));
  return {
    empenhado: toMoney(liquido(adaptar(cadeiaEmpenho))).toFixed(2),
    liquidado: toMoney(liquido(adaptar(liquidacoes))).toFixed(2),
    pago: toMoney(liquido(adaptar(pagamentos))).toFixed(2),
  };
}

const arredondar = (bruto: string): string => toMoney(new Decimal(bruto)).toFixed(2);

// ════════════════════════════════════════════════════════════════════════════
// D1 — SQL × DOMÍNIO
// ════════════════════════════════════════════════════════════════════════════

describe("D1 — o SQL e a régua do domínio dão o MESMO número", () => {
  it("cadeia completa, anulação total, anulação parcial e parcial estornada", async () => {
    // (a) empenho liquidado e pago em parte
    const a = await empenho("ficha-a", "2026NE000100", "1000.00");
    const la = await liquidar({ empenhoId: a.empenhoId, numero: "2026NL000100", valor: "800.00", data: inicioDoDiaCivil(dia(-10)), responsavelAtesto: "Chefe do setor", historico: "Liquidação", criadoPor: POR }, R_LIQUIDACAO, deps);
    await pagar({ liquidacaoId: la.liquidacaoId, numero: "2026NP000100", valor: "300.00", data: inicioDoDiaCivil(dia(-5)), contaBancaria: "CC-001", fonteId: FONTE, historico: "Pagamento", criadoPor: POR }, R_PAGAMENTO, deps);

    // (b) empenho anulado TOTALMENTE
    const b = await empenho("ficha-a", "2026NE000200", "2000.00");
    await anularEmpenho({ empenhoId: b.empenhoId, numero: "2026NE000200A", data: inicioDoDiaCivil(dia(-9)), historico: "Anulado por engano na classificação", criadoPor: POR }, deps);

    // (c) empenho com DUAS anulações parciais — N=2 dentro do mesmo empenho
    const c = await empenho("ficha-b", "2026NE000300", "5000.00");
    await anularEmpenhoParcial({ originalId: c.empenhoId, numero: "2026NE000300A", valor: "1000.00", data: inicioDoDiaCivil(dia(-8)), motivo: "Redução do saldo não utilizado do empenho", criadoPor: POR }, deps);
    await anularEmpenhoParcial({ originalId: c.empenhoId, numero: "2026NE000300B", valor: "500.00", data: inicioDoDiaCivil(dia(-7)), motivo: "Segunda redução do saldo do empenho", criadoPor: POR }, deps);

    // (d) ⚠️ O CASO QUE A PROJEÇÃO ANTIGA ERRAVA: uma anulação parcial que é ela própria
    // ESTORNADA. Ela volta a não subtrair nada — e o empenho volta ao valor cheio. A projeção
    // em TypeScript carregava as parciais do empenho, mas não os estornos DELAS (que apontam
    // para a parcial, não para o empenho), e por isso continuava descontando.
    const d = await empenho("ficha-b", "2026NE000400", "900.00");
    const parcialDeD = await anularEmpenhoParcial({ originalId: d.empenhoId, numero: "2026NE000400A", valor: "400.00", data: inicioDoDiaCivil(dia(-6)), motivo: "Redução lançada por engano no empenho", criadoPor: POR }, deps);
    await estornarAnulacaoParcial(
      { anulacaoId: parcialDeD.anulacaoId, numero: "2026NE000400AE", data: inicioDoDiaCivil(dia(-5)), motivo: "A redução foi lançada por engano e se desfaz", criadoPor: POR, nivel: "EMPENHO" },
      deps
    );

    for (const id of [a.empenhoId, b.empenhoId, c.empenhoId, d.empenhoId]) {
      const doDominio = await liquidosPeloDominio(id);
      const doSql = (await derivadasDe(prisma, [id])).get(id)!;
      expect(
        { empenhado: arredondar(doSql.empenhado), liquidado: arredondar(doSql.liquidado), pago: arredondar(doSql.pago) },
        `o SQL e a régua do domínio divergiram no empenho ${id}`
      ).toEqual(doDominio);
    }

    // E os números, ditos por extenso, para que a divergência não passe por "os dois erraram igual":
    const sql = await derivadasDe(prisma, [a.empenhoId, b.empenhoId, c.empenhoId, d.empenhoId]);
    expect(arredondar(sql.get(a.empenhoId)!.empenhado)).toBe("1000.00");
    expect(arredondar(sql.get(a.empenhoId)!.liquidado)).toBe("800.00");
    expect(arredondar(sql.get(a.empenhoId)!.pago)).toBe("300.00");
    expect(arredondar(sql.get(b.empenhoId)!.empenhado), "anulado TOTALMENTE vale zero").toBe("0.00");
    expect(arredondar(sql.get(c.empenhoId)!.empenhado), "5.000 − 1.000 − 500").toBe("3500.00");
    expect(
      arredondar(sql.get(d.empenhoId)!.empenhado),
      "a anulação parcial ESTORNADA continuou subtraindo — ela deixou de estar viva e não reduz mais nada"
    ).toBe("900.00");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// D2 — A FASE FILTRA O CONJUNTO, NÃO A PÁGINA
// ════════════════════════════════════════════════════════════════════════════

describe("D2 — o filtro de fase vale para o recorte inteiro", () => {
  it("⚠️ um resultado relevante DEPOIS da primeira página é encontrado", async () => {
    // Cinco empenhos "Empenhada" e, no fim da ordem, DOIS "Paga". Com o filtro aplicado sobre a
    // página (porPagina=3), a busca por "Paga" na página 1 devolveria ZERO — e o cidadão
    // concluiria que o município não pagou nada.
    for (let i = 1; i <= 5; i++) {
      await empenho("ficha-a", `2026NE00010${i}`, "100.00", 30 - i);
    }
    for (const [n, dias] of [["2026NE000201", 2], ["2026NE000202", 1]] as const) {
      const e = await empenho("ficha-b", n, "700.00", dias);
      const l = await liquidar({ empenhoId: e.empenhoId, numero: `${n}L`, valor: "700.00", data: inicioDoDiaCivil(dia(-1)), responsavelAtesto: "Chefe do setor", historico: "Liquidação", criadoPor: POR }, R_LIQUIDACAO, deps);
      await pagar({ liquidacaoId: l.liquidacaoId, numero: `${n}P`, valor: "700.00", data: inicioDoDiaCivil(dia(-1)), contaBancaria: "CC-001", fonteId: FONTE, historico: "Pagamento", criadoPor: POR }, R_PAGAMENTO, deps);
    }

    const pagas = await listarDespesasPublicas({ fase: "Paga", porPagina: 3, pagina: 1, ordem: "data", direcao: "asc" });
    expect(pagas.total, "a contagem tem de ser a do CONJUNTO filtrado, não a de todos os empenhos").toBe(2);
    expect(pagas.paginas).toBe(1);
    expect(pagas.linhas.map((l) => l.numero).sort()).toEqual(["2026NE000201", "2026NE000202"]);
    expect(pagas.totais.pago, "os totais acompanham o filtro de fase").toBe("1400.00");
    // ⚠️ E O EMPENHADO DO RECORTE FILTRADO é o dos dois pagos, não o dos sete.
    expect(pagas.totais.empenhado).toBe("1400.00");

    const empenhadas = await listarDespesasPublicas({ fase: "Empenhada", porPagina: 3, pagina: 1 });
    expect(empenhadas.total).toBe(5);
    expect(empenhadas.paginas).toBe(2);
    expect(empenhadas.totais.empenhado).toBe("500.00");

    // Sem filtro, o conjunto inteiro.
    expect((await listarDespesasPublicas({})).total).toBe(7);
  });

  it("a fase ANULADA acha o empenho anulado, e ele não aparece nas outras", async () => {
    const a = await empenho("ficha-a", "2026NE000100", "1000.00");
    await anularEmpenho({ empenhoId: a.empenhoId, numero: "2026NE000100A", data: inicioDoDiaCivil(dia(-9)), historico: "Anulado por engano na classificação", criadoPor: POR }, deps);
    await empenho("ficha-b", "2026NE000200", "400.00");

    const anuladas = await listarDespesasPublicas({ fase: "Anulada" });
    expect(anuladas.total).toBe(1);
    expect(anuladas.linhas[0]?.numero).toBe("2026NE000100");
    expect(anuladas.totais.empenhado).toBe("0.00");

    const empenhadas = await listarDespesasPublicas({ fase: "Empenhada" });
    expect(empenhadas.total).toBe(1);
    expect(empenhadas.linhas[0]?.numero).toBe("2026NE000200");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// D3 — OS TOTAIS ACIMA DO ANTIGO TETO
// ════════════════════════════════════════════════════════════════════════════

describe("D3 — mais de 2.000 empenhos, com total esperado independente", () => {
  it("⚠️ o total sai, e bate com a conta feita fora do motor", async () => {
    /**
     * A fixture é construída por `createMany` — é fixture, não caminho de usuário: 2.100 empenhos
     * pelo serviço levariam minutos e o que se afirma aqui é a AGREGAÇÃO, não o serviço.
     *
     * ⚠️ O VALOR ESPERADO É CALCULADO FORA DO MOTOR: 2.100 empenhos de R$ 13,37 =
     * R$ 28.077,00. Perguntar ao próprio SQL quanto ele somou provaria só que ele soma
     * consistentemente a mesma coisa errada.
     */
    const QUANTOS = 2100;
    const VALOR = "13.37";
    const lancamentos = Array.from({ length: QUANTOS }, (_, i) => ({
      id: `lc-${i}`,
      numeroControle: `LC-${i}`,
      dataTransacao: inicioDoDiaCivil(dia(-15)),
      historico: "Empenho sintético do teste de agregação",
      origemTipo: "EMPENHO",
      criadoPor: POR,
    }));
    await prisma.lancamentoContabil.createMany({ data: lancamentos });
    await prisma.empenho.createMany({
      data: Array.from({ length: QUANTOS }, (_, i) => ({
        id: `emp-${i}`,
        fichaId: "ficha-a",
        numero: `2026NE${String(i).padStart(6, "0")}`,
        tipo: "GLOBAL" as const,
        valor: VALOR,
        data: inicioDoDiaCivil(dia(-15)),
        credorCpfCnpj: CNPJ,
        historico: "Empenho sintético do teste de agregação",
        categoriaOrdemCronologica: "FORNECIMENTO_BENS" as const,
        lancamentoId: `lc-${i}`,
        criadoPor: POR,
      })),
    });

    const esperado = toMoney(new Decimal(VALOR).times(QUANTOS)).toFixed(2);
    expect(esperado, "a conta de fora: 2.100 × 13,37").toBe("28077.00");

    const p = await listarDespesasPublicas({ porPagina: 25, pagina: 1 });
    expect(p.total).toBe(QUANTOS);
    expect(
      p.totais.empenhado,
      "o rodapé desistiu acima de dois mil empenhos — e o total do exercício é o número que o cidadão veio buscar"
    ).toBe(esperado);
    expect(p.totais.liquidado).toBe("0.00");
    expect(p.totais.pago).toBe("0.00");

    // E o agregado direto, pelo mesmo caminho que a porta usa.
    const t = await totaisDerivados(prisma, {});
    expect(arredondar(t.empenhado)).toBe(esperado);
    expect(t.total).toBe(QUANTOS);
  }, 180_000);
});

// ════════════════════════════════════════════════════════════════════════════
// D4 — PAGINAÇÃO ESTÁVEL E RECONCILIAÇÃO
// ════════════════════════════════════════════════════════════════════════════

describe("D4 — a paginação é estável e as páginas reconstroem o conjunto", () => {
  it("⚠️ 400 empenhos com o MESMO valor e a MESMA data não se repetem nem somem entre páginas", async () => {
    /**
     * ⚠️ A ESCALA AQUI É O TESTE. Com seis linhas, o Postgres ordena tudo de uma vez e a ordem
     * entre iguais sai a mesma em toda página — o defeito existiria e o teste ficaria verde. Foi
     * medido: removendo o desempate `b.id ASC` do SQL, a versão com seis linhas passava.
     *
     * Com quatrocentas linhas iguais e `LIMIT/OFFSET` pequenos, o plano vira *top-N heapsort*, e
     * a ordem entre empatados deixa de ser a mesma a cada página: uma linha aparece duas vezes
     * enquanto outra desaparece, em silêncio. É esse o defeito, e é assim que ele se manifesta.
     */
    const QUANTOS = 400;
    await prisma.lancamentoContabil.createMany({
      data: Array.from({ length: QUANTOS }, (_, i) => ({
        id: `lc-est-${i}`, numeroControle: `LC-EST-${i}`, dataTransacao: inicioDoDiaCivil(dia(-12)),
        historico: "Empenho sintético do teste de paginação", origemTipo: "EMPENHO", criadoPor: POR,
      })),
    });
    await prisma.empenho.createMany({
      data: Array.from({ length: QUANTOS }, (_, i) => ({
        id: `emp-est-${i}`, fichaId: "ficha-a", numero: `2026NE${String(i).padStart(6, "0")}`,
        tipo: "GLOBAL" as const, valor: "250.00", data: inicioDoDiaCivil(dia(-12)),
        credorCpfCnpj: CNPJ, historico: "Empenho sintético do teste de paginação",
        categoriaOrdemCronologica: "FORNECIMENTO_BENS" as const, lancamentoId: `lc-est-${i}`, criadoPor: POR,
      })),
    });

    const POR_PAGINA = 20;
    const vistos: string[] = [];
    for (let p = 1; p <= QUANTOS / POR_PAGINA; p++) {
      const pagina = await listarDespesasPublicas({ porPagina: POR_PAGINA, pagina: p, ordem: "valor", direcao: "desc" });
      vistos.push(...pagina.linhas.map((l) => l.numero));
    }
    expect(vistos).toHaveLength(QUANTOS);
    expect(
      new Set(vistos).size,
      "alguma linha apareceu em duas páginas (e outra sumiu): a ordenação não tem desempate determinístico"
    ).toBe(QUANTOS);
  }, 120_000);

  it("a soma das páginas é igual ao total do recorte — lista, contagem e totais reconciliam", async () => {
    const valores = ["100.00", "250.00", "375.50", "1000.00", "12.34"];
    for (const [i, v] of valores.entries()) await empenho(i % 2 === 0 ? "ficha-a" : "ficha-b", `2026NE00040${i}`, v, 20 - i);

    const esperado = toMoney(valores.reduce((t, v) => t.plus(new Decimal(v)), new Decimal(0))).toFixed(2);
    expect(esperado, "a conta de fora").toBe("1737.84");

    const recorte = await listarDespesasPublicas({ porPagina: 2, pagina: 1 });
    expect(recorte.total).toBe(5);
    expect(recorte.totais.empenhado).toBe(esperado);

    let somaDasPaginas = new Decimal(0);
    for (let p = 1; p <= recorte.paginas; p++) {
      const pagina = await listarDespesasPublicas({ porPagina: 2, pagina: p });
      for (const l of pagina.linhas) somaDasPaginas = somaDasPaginas.plus(new Decimal(l.empenhado));
    }
    expect(
      toMoney(somaDasPaginas).toFixed(2),
      "as linhas paginadas não somam o total do rodapé — o rodapé e a lista falam de conjuntos diferentes"
    ).toBe(esperado);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// D5 — O DIA CIVIL NAS BORDAS DO PERÍODO
// ════════════════════════════════════════════════════════════════════════════

describe("D5 — as bordas do período são do DIA CIVIL do ente", () => {
  it("⚠️ o empenho das 22h do último dia do mês fica DENTRO do mês", async () => {
    // Em UTC−3, 22h do dia 31 é 01h do dia 1º em UTC. Uma borda escrita com `T23:59:59Z`
    // deixaria este empenho FORA do mês — e traria de volta parte do dia 28.
    const e = await prisma.lancamentoContabil.create({
      data: { id: "lc-borda", numeroControle: "LC-BORDA", dataTransacao: new Date("2026-04-01T01:00:00Z"), historico: "Borda", origemTipo: "EMPENHO", criadoPor: POR },
      select: { id: true },
    });
    await prisma.empenho.create({
      data: {
        id: "emp-borda", fichaId: "ficha-a", numero: "2026NE009999", tipo: "GLOBAL", valor: "77.00",
        // 2026-03-31 22:00 em São Paulo = 2026-04-01 01:00 UTC.
        data: new Date("2026-04-01T01:00:00Z"),
        credorCpfCnpj: CNPJ, historico: "Empenho na borda do mês",
        categoriaOrdemCronologica: "FORNECIMENTO_BENS", lancamentoId: e.id, criadoPor: POR,
      },
    });

    const marco = await listarDespesasPublicas({ de: "2026-03-01", ate: "2026-03-31" });
    expect(
      marco.total,
      "o empenho das 22h do dia 31 caiu fora de março — a borda foi escrita em UTC, não no dia civil do ente"
    ).toBe(1);
    expect(marco.totais.empenhado).toBe("77.00");

    const abril = await listarDespesasPublicas({ de: "2026-04-01", ate: "2026-04-30" });
    expect(abril.total, "e ele NÃO pode aparecer também em abril").toBe(0);

    // A régua é a mesma que o resto do repositório usa.
    expect(inicioDoDiaCivil("2026-03-01").toISOString()).toBe("2026-03-01T03:00:00.000Z");
    expect(fimDoDiaCivil("2026-03-31").toISOString()).toBe("2026-04-01T02:59:59.999Z");
  });
});
