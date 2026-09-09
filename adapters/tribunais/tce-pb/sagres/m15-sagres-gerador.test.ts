import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../../../test/banco.js";
import { limparBanco } from "../../../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../../../test/ficha-teste.js";
import { transferirEntreContas } from "../../../../modules/m09-tesouraria/transferencia.js";
import { gerarCadastroContaBancaria, gerarDotacao, gerarMovimentacaoEntreContas, gerarSaldoMensal } from "./gerador.js";

/**
 * S1 — o gerador contra o BANCO REAL (Prisma de teste, Docker pg-siafic). Prova que a Dotacao
 * é lida da FichaOrcamentaria e serializada byte a byte — "arquivo real gerado do banco" (DoD),
 * não fixture. A serialização em si (Empenhos/Liquidacao/Dotacao) é coberta byte a byte no golden
 * puro (m15-sagres.test.ts); aqui a prova é a LEITURA + nomenclatura + contagem.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const UG = "999001"; // UG POC fictícia (não é dado real)

async function semearDominioEFicha(): Promise<void> {
  await limparBanco(prisma);
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura POC" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "02001", descricao: "Secretaria de Financas", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administracao" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm Geral" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0001", descricao: "Gestao" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "Manutencao", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material de consumo" },
  });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Recursos Ordinarios", codigoTce: "500" } });

  await criarFichaDeTeste(prisma, {
    id: "ficha-poc", exercicio: 2026, numero: 1,
    orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04", subfuncaoId: "sub-122",
    programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd", fonteId: "fnt-500",
    exercicioFonte: 1, valorDotado: "150000.00",
  });
}

describe("gerador SAGRES × banco real — Dotacao", () => {
  beforeEach(semearDominioEFicha);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("lê a FichaOrcamentaria e gera o registro Dotacao byte a byte (o mesmo do golden puro)", async () => {
    const arq = await gerarDotacao(prisma, { codUnidadeGestora: UG, exercicio: 2026, competencia: new Date(Date.UTC(2026, 0, 31)) });

    expect(arq.registros).toBe(1);
    expect(arq.nome).toBe("999001012026Dotacao.txt"); // [codUG][mmaaaa][Nome].txt

    const esperadoRegistro = [
      "999001", "2026", "02001", "04", "122", "0001", "2001", "000000",
      "3", "3", "90", "30", "1", "500", "0000000150000,00", "000000",
    ].join("");
    // O arquivo é o registro + CRLF, em UTF-8.
    expect(arq.conteudo.toString("utf8")).toBe(esperadoRegistro + "\r\n");
    expect(arq.conteudo.length).toBe(66 + 2);
  });

  it("UG/exercício sem fichas → arquivo vazio (0 registros), não erro", async () => {
    const arq = await gerarDotacao(prisma, { codUnidadeGestora: UG, exercicio: 2099, competencia: new Date(Date.UTC(2099, 0, 31)) });
    expect(arq.registros).toBe(0);
    expect(arq.conteudo.length).toBe(0);
  });
});

describe("gerador SAGRES × banco real — CadastroContaBancaria + SaldoMensal (a tripla e o SUM)", () => {
  const CNPJ = "12345678000199";
  async function semearConta(): Promise<void> {
    await limparBanco(prisma);
    await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Ordinarios", codigoTce: "500" } });
    await prisma.contaBancaria.create({
      data: {
        id: "cb-poc", codigo: "CC-POC", descricao: "Conta Movimento POC", fonteId: "fnt-500",
        banco: "001", agencia: "1234", digitoAgencia: "0", conta: "12345", digitoConta: "6",
      },
    });
    // Extrato com 2 lançamentos → saldo = 8000 − 3000 = 5000.
    await prisma.extratoBancario.create({
      data: {
        id: "ext-1", contaBancariaId: "cb-poc", arquivoHash: "hash-poc-1",
        periodoInicio: new Date(Date.UTC(2026, 6, 1)), periodoFim: new Date(Date.UTC(2026, 6, 31)), importadoPor: "TESTE",
      },
    });
    await prisma.lancamentoExtrato.createMany({
      data: [
        { extratoId: "ext-1", contaBancariaId: "cb-poc", fitid: "F1", dataPostagem: new Date(Date.UTC(2026, 6, 10)), valor: "8000.00", natureza: "CREDITO", memo: "deposito", linhaHash: "h1" },
        { extratoId: "ext-1", contaBancariaId: "cb-poc", fitid: "F2", dataPostagem: new Date(Date.UTC(2026, 6, 20)), valor: "3000.00", natureza: "DEBITO", memo: "saque", linhaHash: "h2" },
      ],
    });
  }

  beforeEach(semearConta);

  it("CadastroContaBancaria: lê a tripla e monta conta/agência com dígito", async () => {
    const arq = await gerarCadastroContaBancaria(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ, dia: new Date(Date.UTC(2026, 6, 15)) });
    expect(arq.registros).toBe(1);
    expect(arq.nome).toBe("99900115072026CadastroContaBancaria.txt");
    const esperado = [
      "999001", "123456".padEnd(13, " "), "1", "001", "12340".padEnd(6, " "),
      "Conta Movimento POC".padEnd(60, " "), "1", CNPJ,
    ].join("");
    expect(arq.conteudo.toString("utf8")).toBe(esperado + "\r\n");
  });

  it("SaldoMensal: calcula o saldo por SUM do extrato (8000 − 3000 = 5000)", async () => {
    const arq = await gerarSaldoMensal(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ, competencia: new Date(Date.UTC(2026, 6, 31)) });
    expect(arq.registros).toBe(1);
    expect(arq.nome).toBe("999001072026SaldoMensal.txt");
    const esperado = [
      "999001", "123456".padEnd(13, " "), "12340".padEnd(6, " "), "001",
      "0000000005000,00", "1", CNPJ,
    ].join("");
    expect(arq.conteudo.toString("utf8")).toBe(esperado + "\r\n");
  });

  it("conta SEM a tripla → FAIL-CLOSED nomeando a conta (não gera linha torta)", async () => {
    await prisma.contaBancaria.create({ data: { id: "cb-sem", codigo: "CC-SEM", descricao: "Sem tripla", fonteId: "fnt-500" } });
    await expect(gerarCadastroContaBancaria(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ, dia: new Date(Date.UTC(2026, 6, 15)) }))
      .rejects.toThrow(/não tem a identificação bancária/);
  });
});

describe("gerador SAGRES × banco real — MovimentacaoEntreContas (o fato-transferência da F1)", () => {
  async function semearTransferencia(): Promise<void> {
    await limparBanco(prisma);
    await prisma.contaPcasp.create({ data: { id: "c-bancos", codigo: "1.1.1.1.2.00.00", nome: "Bancos Conta Movimento", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" } });
    await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Ordinarios", codigoTce: "500" } });
    await prisma.contaBancaria.createMany({
      data: [
        { id: "cb-a", codigo: "CC-A", descricao: "Conta A", fonteId: "fnt-500", contaContabilId: "c-bancos", banco: "001", agencia: "1234", digitoAgencia: "0", conta: "11111", digitoConta: "1" },
        { id: "cb-b", codigo: "CC-B", descricao: "Conta B", fonteId: "fnt-500", contaContabilId: "c-bancos", banco: "001", agencia: "5678", digitoAgencia: "0", conta: "22222", digitoConta: "2" },
      ],
    });
    await transferirEntreContas(prisma, {
      contaOrigemId: "cb-a", contaDestinoId: "cb-b", valor: "2500.00",
      data: new Date(Date.UTC(2026, 6, 15)), codigo: "TRF0001", historico: "transferência POC", criadoPor: "tesouraria@cg.pb.gov.br",
    });
  }
  beforeEach(semearTransferencia);

  it("lê a TransferenciaEntreContas e monta o registro §4.59 (larguras assimétricas)", async () => {
    const arq = await gerarMovimentacaoEntreContas(prisma, { codUnidadeGestora: UG, dia: new Date(Date.UTC(2026, 6, 15)) });
    expect(arq.registros).toBe(1);
    expect(arq.nome).toBe("99900115072026MovimentacaoEntreContasBancarias.txt");
    const esperado = [
      "999001", "001", "12340".padEnd(6, " "), "111111".padEnd(14, " "), "1",
      "001", "56780".padEnd(6, " "), "222222".padEnd(13, " "), "1",
      "0000000002500,00", "15072026", "TRF0001",
    ].join("");
    expect(arq.conteudo.toString("utf8")).toBe(esperado + "\r\n");
  });
});

describe("invariante — o gerador é LEITURA PURA", () => {
  it("gerador.ts não contém escrita (create/update/delete/upsert) nem aritmética própria (aggregate)", () => {
    const fonte = readFileSync(fileURLToPath(new URL("./gerador.ts", import.meta.url)), "utf8");
    for (const proibido of [".create(", ".createMany(", ".update(", ".updateMany(", ".delete(", ".deleteMany(", ".upsert(", ".aggregate(", "_sum"]) {
      expect(fonte.includes(proibido), `gerador não pode conter ${proibido}`).toBe(false);
    }
  });
});
