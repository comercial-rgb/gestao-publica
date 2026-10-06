import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { cadastrarContaBancaria, contasContabeisDeDisponibilidade, type CadastrarContaBancariaInput } from "./cadastro-de-conta.js";
import { exigirFonteNoRolDaConta } from "../m05-despesa/guard-fonte.js";

/**
 * O CADASTRO DA CONTA BANCÁRIA NOVA (V36, TR 5.10.2.6).
 *
 * ⚠️ O EFEITO É CONFERIDO NO GUARD DE FONTE, não só na tabela: a conta nova tem de aceitar a fonte
 * padrão e recusar outra pelo mesmo `exigirFonteNoRolDaConta` que o pagamento e a arrecadação usam.
 * E cada recusa afirma o MOTIVO e que nada foi gravado.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "tesouraria@cg.pb.gov.br";
const SEM_PERMISSAO = "so-consulta-financeiro@cg.pb.gov.br";

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.fonteRecurso.createMany({
    data: [
      { id: "f500", codigo: "500", descricao: "Nao vinculados", codigoTce: "500" },
      { id: "f540", codigo: "540", descricao: "FUNDEB", codigoTce: "540" },
    ],
  });
  await prisma.contaPcasp.createMany({
    data: [
      { codigo: "1.1.1.0.0.00.00", nome: "Caixa e Equivalentes de Caixa", naturezaSaldo: "DEVEDORA", nivel: 3, analitica: false },
      { codigo: "1.1.1.1.1.19.00", nome: "Bancos conta movimento - demais contas", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true },
      { codigo: "1.1.1.1.1.50.00", nome: "Aplicacoes financeiras de liquidez imediata", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true },
      { codigo: "1.1.2.1.1.01.00", nome: "Creditos tributarios a receber", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true },
    ],
  });
  const leitor = await prisma.perfil.create({
    data: { nome: "SO_CONSULTA_FINANCEIRO", descricao: "so consulta", criadoPor: POR, permissoes: { create: [{ acao: "CONSULTAR_FINANCEIRO", criadoPor: POR }] } },
    select: { id: true },
  });
  const u = await prisma.usuario.create({ data: { identificador: SEM_PERMISSAO, nome: SEM_PERMISSAO, criadoPor: POR }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: leitor.id, criadoPor: POR } });
}

const BASE: CadastrarContaBancariaInput = {
  codigo: "CC-FPM",
  descricao: "FPM - movimento",
  fonteCodigo: "500",
  contaContabilCodigo: "1.1.1.1.1.19.00",
  banco: "001",
  agencia: "1234",
  digitoAgencia: "5",
  conta: "67890",
  digitoConta: "x",
  criadoPor: POR,
};

async function recusa(input: Partial<CadastrarContaBancariaInput>): Promise<string> {
  try {
    await cadastrarContaBancaria(prisma, { ...BASE, ...input });
    return "gravou";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function guard(codigo: string, fonteId: string): Promise<string> {
  try {
    await exigirFonteNoRolDaConta(prisma, { codigo }, fonteId, "o teste");
    return "aceita";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

describe("M09 V36 — o cadastro da conta bancária nova", () => {
  beforeEach(async () => {
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: duas contas cadastradas, cada uma com a sua conta contábil, a sua fonte e o rol nascendo com ela", async () => {
    await cadastrarContaBancaria(prisma, BASE);
    await cadastrarContaBancaria(prisma, {
      ...BASE, codigo: "CC-FUNDEB", descricao: "FUNDEB", fonteCodigo: "540", contaContabilCodigo: "1.1.1.1.1.50.00", conta: "11111", digitoConta: "",
    });

    const contas = await prisma.contaBancaria.findMany({
      orderBy: { codigo: "asc" },
      select: {
        codigo: true, banco: true, agencia: true, digitoAgencia: true, conta: true, digitoConta: true,
        fonte: { select: { codigo: true } }, contaContabil: { select: { codigo: true } },
        fontesPermitidas: { select: { fonte: { select: { codigo: true } } } },
      },
    });
    expect(contas.map((c) => [c.codigo, c.fonte.codigo, c.contaContabil?.codigo, c.fontesPermitidas.map((f) => f.fonte.codigo).join(",")])).toEqual([
      ["CC-FPM", "500", "1.1.1.1.1.19.00", "500"],
      ["CC-FUNDEB", "540", "1.1.1.1.1.50.00", "540"],
    ]);
    // Dígito em maiúscula; dígito vazio vira nulo, não texto vazio.
    expect(contas[0]?.digitoConta).toBe("X");
    expect(contas[1]?.digitoConta).toBeNull();

    // O efeito, no guard que o pagamento usa: cada conta aceita a sua fonte e recusa a da outra.
    expect(await guard("CC-FPM", "f500")).toBe("aceita");
    expect(await guard("CC-FPM", "f540")).toMatch(/FONTE FORA DO ROL/);
    expect(await guard("CC-FUNDEB", "f540")).toBe("aceita");
    expect(await guard("CC-FUNDEB", "f500")).toMatch(/FONTE FORA DO ROL/);
  });

  it("t2: conta contábil fora do grupo 1.1.1, sintética ou inexistente é recusada com o motivo", async () => {
    expect(await recusa({ contaContabilCodigo: "1.1.2.1.1.01.00" })).toMatch(/não é de caixa e equivalentes de caixa \(grupo 1\.1\.1[\s\S]*Nada foi gravado/);
    expect(await recusa({ contaContabilCodigo: "1.1.1.0.0.00.00" })).toMatch(/é sintética e não recebe lançamento[\s\S]*Nada foi gravado/);
    expect(await recusa({ contaContabilCodigo: "9.9.9" })).toMatch(/não está no plano de contas/);
    expect(await prisma.contaBancaria.count()).toBe(0);
  });

  it("t3: código repetido e a mesma conta física sob outro código são recusados", async () => {
    await cadastrarContaBancaria(prisma, BASE);
    expect(await recusa({ conta: "22222" })).toMatch(/Já existe uma conta bancária com o código CC-FPM/);
    expect(await recusa({ codigo: "CC-OUTRA" })).toMatch(/agência 1234, conta 67890 já está cadastrada como CC-FPM/);
    // A mesma agência e conta em OUTRO banco é outra conta.
    await cadastrarContaBancaria(prisma, { ...BASE, codigo: "CC-CEF", banco: "104" });
    expect(await prisma.contaBancaria.count()).toBe(2);
  });

  it("t4: fonte fora do cadastro e identificação bancária malformada são recusadas", async () => {
    expect(await recusa({ fonteCodigo: "999" })).toMatch(/fonte 999 não está no cadastro/);
    expect(await recusa({ banco: "1" })).toMatch(/Banco: o código de 3 dígitos/);
    expect(await recusa({ agencia: "12-3" })).toMatch(/Agência: só dígitos/);
    expect(await recusa({ digitoConta: "123" })).toMatch(/dígito verificador/);
    expect(await prisma.contaBancaria.count()).toBe(0);
  });

  it("t5: quem só consulta o financeiro não cadastra — e o motivo nomeia a ação", async () => {
    expect(await recusa({ criadoPor: SEM_PERMISSAO })).toMatch(/ACESSO NEGADO[\s\S]*CADASTRAR_CONTA_BANCARIA/);
    expect(await prisma.contaBancaria.count()).toBe(0);
  });

  it("t6: a lista de escolha traz só as analíticas do grupo 1.1.1", async () => {
    expect((await contasContabeisDeDisponibilidade(prisma)).map((c) => c.codigo)).toEqual(["1.1.1.1.1.19.00", "1.1.1.1.1.50.00"]);
  });
});
