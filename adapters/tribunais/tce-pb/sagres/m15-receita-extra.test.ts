import "dotenv/config";
import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../../../test/banco.js";
import { limparBanco } from "../../../../test/limpar-banco.js";
import { semearSagresPoc } from "../../../../prisma/seed/sagres-poc.js";
import { importarPlanoDoTribunal, lerContasDoPlano, planoVigenteDoTribunal } from "./plano-do-tribunal.js";
import { gerarEstornoReceitaExtraOuRecusa, gerarReceitaExtraOuRecusa, lerFatosDespesaExtra } from "./gerador.js";
import { estornarMovimentoExtra, registrarDispendioExtra, registrarIngressoExtra } from "../../../../modules/m07-extraorcamentario/extraorcamentario.js";
import { roteiroDispendioExtra, roteiroIngressoExtra } from "../../../../modules/m07-extraorcamentario/dominio.js";

/**
 * V23 — O PLANO DE CONTAS DO TRIBUNAL E A RECEITA EXTRA (SAGRES §5.28, §4.19, §4.21, §4.20).
 *
 * ⚠️ O PARSER CONFERIDO CONTRA UMA MEDIDA INDEPENDENTE: as contagens abaixo foram medidas pelo auxiliar
 * de pesquisa com outro leitor de planilha (relatório `docs/oficial/V23-RELATORIO-DE-FONTES.md`, item 8):
 * 2024 → 42 contas exigem retenção e 68 exigem receita extra; 2025 → nenhuma. Se o nosso leitor errar a
 * recomposição das linhas quebradas ou a leitura das colunas, estas contagens não batem.
 *
 * Sobre a massa POC: ISS 500 retido no pagamento 3 (14/09), na conta 2.1.8.8.1.02.00 — que na tabela de
 * 2024 do Tribunal é "GARANTIAS" e EXIGE retenção e receita extra (218810200 | 1 | 1).
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const UG = "999001";
const CNPJ = "12345678000195";
const POR = "m05@cg.pb.gov.br";
const PCASP_2025 = readFileSync("docs/oficial/tce-pb/Pcasp_2025.xlsx");
const D = (mes: number, dia: number): Date => new Date(Date.UTC(2026, mes - 1, dia, 12, 0, 0));
const FUNDAMENTO = "A página do Tribunal para 2026 aponta a planilha de 2025, cujas exigências de 2025 estão zeradas; usa-se a tabela de 2024 (teste).";

describe("V23 — a planilha do Tribunal", () => {
  it("conta as exigências de cada ano como a medida independente (2024: 42 e 68; 2025: nenhuma)", () => {
    const c2024 = lerContasDoPlano(PCASP_2025, 2024);
    expect(c2024.filter((c) => c.exigeRetencao)).toHaveLength(42);
    expect(c2024.filter((c) => c.exigeReceitaExtra)).toHaveLength(68);
    const c2025 = lerContasDoPlano(PCASP_2025, 2025);
    expect(c2025.some((c) => c.exigeRetencao || c.exigeReceitaExtra)).toBe(false);
    expect(c2024.find((c) => c.codigo === "218810200")).toMatchObject({ exigeRetencao: true, exigeReceitaExtra: true });
    expect(c2024.find((c) => c.codigo === "218810401")).toMatchObject({ exigeRetencao: false, exigeReceitaExtra: true });
  });

  it("recusa ano sem linhas e cabeçalho que não é o do Tribunal", () => {
    expect(() => lerContasDoPlano(PCASP_2025, 2026)).toThrow(/não tem linhas de 2026/);
    expect(() => lerContasDoPlano(readFileSync("docs/oficial/tce-pb/relacao_elemento_subelemento_2026.xlsx"), 2024)).toThrow(/cabeçalho/);
  });
});

describe("V23 — receita extra e estorno de receita extra", () => {
  beforeEach(async () => {
    await limparBanco(prisma);
    await semearSagresPoc(prisma, { criadoPor: POR });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const importar2024 = (): Promise<unknown> =>
    importarPlanoDoTribunal(prisma, { exercicio: 2026, anoDaTabela: 2024, arquivoNome: "Pcasp_2025.xlsx", conteudo: PCASP_2025, fundamento: FUNDAMENTO, criadoPor: POR });
  const receita = (dia: Date) => gerarReceitaExtraOuRecusa(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ, codFonteRecursoExtra: "869", dia });

  it("sem o plano do exercício, o arquivo fica fora com o motivo; o dia sem ingresso sai vazio", async () => {
    const r = await receita(D(9, 14));
    expect("recusa" in r && r.recusa).toMatch(/plano de contas do Tribunal para 2026 não foi importado/);
    const vazio = await receita(D(9, 15));
    expect("arquivo" in vazio && vazio.arquivo.registros).toBe(0);
  });

  it("com o plano: a retenção sai com a conta, o CNPJ do credor e o vínculo com a retenção, nas posições", async () => {
    await importar2024();
    const vig = await planoVigenteDoTribunal(prisma, 2026);
    expect(vig?.anoDaTabela).toBe(2024);
    const r = await receita(D(9, 14));
    if (!("arquivo" in r)) throw new Error(r.recusa);
    const l = r.arquivo.conteudo.toString("utf8").split("\r\n").filter((x) => x !== "");
    expect(l).toHaveLength(1);
    const x = l[0]!;
    expect(x.length).toBe(643);
    expect(x.slice(6, 13)).toBe("0000001"); //          numero 7-13
    expect(x.slice(13, 22)).toBe("218810200"); //       codContaContabil 14-22
    expect(x.slice(22, 30)).toBe("14092026"); //        data 23-30
    expect(x.slice(30, 44)).toBe(CNPJ); //              cpfCnpjFornecedor 31-44 — o credor do empenho
    expect(x.slice(71, 87)).toBe("0000000000500,00"); // valor 72-87
    expect(x.slice(587, 595)).toBe("10000014"); //      codReceitaExtra 588-595 — Consignações
    expect(x.slice(595, 599)).toBe("2026"); //          exercicio 596-599
    expect(x.slice(599, 605)).toBe(UG); //              UG da retenção 600-605
    expect(x.slice(610, 614)).toBe("2026"); //          ano do empenho 611-614
    expect(x.slice(614, 621)).toBe("0000003"); //       numEmpenho 615-621
    expect(x.slice(621, 628)).toBe("0000003"); //       numPagamento 622-628
    expect(x.slice(628, 629)).toBe("1"); //             tipoRetencao 629 — ISS
  });

  it("ingresso avulso numa conta que não exige retenção: vínculo em espaços; sem CPF/CNPJ o arquivo é recusado", async () => {
    await importar2024();
    const fonte = (await prisma.movimentoExtraorcamentario.findFirstOrThrow({ where: { tipo: "DISPENDIO" }, select: { fonteId: true } })).fonteId!;
    await prisma.contaPcasp.createMany({
      data: [{ codigo: "2.1.8.8.1.04.01", nome: "Depositos e caucoes", naturezaSaldo: "CREDORA", nivel: 7, analitica: true, indicadorSuperavit: "F" }],
      skipDuplicates: true,
    });
    const caucao = await prisma.tipoConsignacao.upsert({ where: { codigo: "CAUCAO" }, update: {}, create: { codigo: "CAUCAO", descricao: "Caução", criadoPor: POR } });
    const rot = roteiroIngressoExtra({ disponibilidade: "1.1.1.1.1.19.00", consignacaoAPagar: "2.1.8.8.1.04.01" });
    await registrarIngressoExtra(prisma, { tipoConsignacaoId: caucao.id, credorConsignatario: "Construtora X", documentoDoContribuinte: "11.222.333/0001-81", contaBancaria: "CC-POC-A", fonteId: fonte, valor: "1000.00", data: D(9, 16), historico: "Caucao do contrato", criadoPor: POR }, rot);
    const ok = await receita(D(9, 16));
    if (!("arquivo" in ok)) throw new Error(ok.recusa);
    const x = ok.arquivo.conteudo.toString("utf8").split("\r\n")[0]!;
    expect(x.slice(13, 22)).toBe("218810401");
    expect(x.slice(30, 44)).toBe("11222333000181");
    expect(x.slice(587, 595)).toBe("10000016"); // Depósitos
    expect(x.slice(599, 629)).toBe(" ".repeat(30)); // vínculo não exigido → espaços

    await expect(
      registrarIngressoExtra(prisma, { tipoConsignacaoId: caucao.id, credorConsignatario: "Empresa Y Ltda", documentoDoContribuinte: "11.222.333/0001-00", contaBancaria: "CC-POC-A", fonteId: fonte, valor: "10.00", data: D(9, 17), historico: "Caucao sem documento", criadoPor: POR }, rot)
    ).rejects.toThrow(/não é válido/);
    await registrarIngressoExtra(prisma, { tipoConsignacaoId: caucao.id, credorConsignatario: "Sem documento", contaBancaria: "CC-POC-A", fonteId: fonte, valor: "10.00", data: D(9, 17), historico: "Caucao sem documento", criadoPor: POR }, rot);
    const r = await receita(D(9, 17));
    expect("recusa" in r && r.recusa).toMatch(/sem o CPF\/CNPJ de quem entregou/);
  });

  it("o recolhimento na conta que exige receita extra: sem dizer qual retenção quita, recusa; com UMA, aponta o número dela", async () => {
    await importar2024();
    await expect(lerFatosDespesaExtra(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ, codFonteRecursoExtra: "869", dia: D(9, 20) })).rejects.toThrow(
      /manda relacionar a UMA receita extra, e ele compõe 0 retenção/
    );
    const ing = await prisma.movimentoExtraorcamentario.findFirstOrThrow({ where: { tipo: "INGRESSO", pagamentoId: { not: null } }, select: { id: true, fonteId: true, tipoConsignacaoId: true } });
    await registrarDispendioExtra(
      prisma,
      { tipoConsignacaoId: ing.tipoConsignacaoId, credorConsignatario: "Municipio de Campina Grande", contaBancaria: "CC-POC-A", fonteId: (await prisma.movimentoExtraorcamentario.findFirstOrThrow({ where: { tipo: "DISPENDIO" }, select: { fonteId: true } })).fonteId!, valor: "100.00", data: D(9, 21), historico: "Recolhimento do saldo", criadoPor: POR, alocacoes: [{ ingressoId: ing.id, valor: "100.00" }] },
      roteiroDispendioExtra({ consignacaoAPagar: "2.1.8.8.1.02.00", disponibilidade: "1.1.1.1.1.19.00" })
    );
    const f = await lerFatosDespesaExtra(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ, codFonteRecursoExtra: "869", dia: D(9, 21) });
    expect(f.map((d) => d.receitaExtra)).toEqual([{ codUnidadeGestora: UG, exercicio: 2026, numero: "1" }]);
  });

  it("o estorno do ingresso aponta a receita extra estornada pelo número dela", async () => {
    await importar2024();
    const fonte = (await prisma.movimentoExtraorcamentario.findFirstOrThrow({ where: { tipo: "DISPENDIO" }, select: { fonteId: true } })).fonteId!;
    const caucao = await prisma.tipoConsignacao.upsert({ where: { codigo: "CAUCAO" }, update: {}, create: { codigo: "CAUCAO", descricao: "Caução", criadoPor: POR } });
    const { movimentoId } = await registrarIngressoExtra(
      prisma,
      { tipoConsignacaoId: caucao.id, credorConsignatario: "Construtora X", documentoDoContribuinte: "11222333000181", contaBancaria: "CC-POC-A", fonteId: fonte, valor: "300.00", data: D(9, 16), historico: "Caucao", criadoPor: POR },
      roteiroIngressoExtra({ disponibilidade: "1.1.1.1.1.19.00", consignacaoAPagar: "2.1.8.8.1.02.00" })
    );
    await estornarMovimentoExtra(prisma, { movimentoId, data: D(9, 18), motivo: "Caucao registrada em duplicidade", criadoPor: POR });
    const r = await gerarEstornoReceitaExtraOuRecusa(prisma, { codUnidadeGestora: UG, dia: D(9, 18) });
    if (!("arquivo" in r)) throw new Error(r.recusa);
    const x = r.arquivo.conteudo.toString("utf8").split("\r\n")[0]!;
    expect(x.length).toBe(305);
    expect(x.slice(6, 13)).toBe("0000002"); // a caução é o 2º ingresso do exercício (o 1º é a retenção de 14/09)
    expect(x.slice(13, 20)).toBe("0000001");
    expect(x.slice(44, 299).trimEnd()).toBe("Caucao registrada em duplicidade");
  });
});
