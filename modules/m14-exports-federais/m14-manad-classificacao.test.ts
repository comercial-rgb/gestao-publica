import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import {
  ClassificacaoDoManadInvalidaError,
  classificarAcaoParaOManad,
  classificarNaturezaDespesaParaOManad,
  classificarNaturezaReceitaParaOManad,
  classificarUnidadeParaOManad,
} from "./classificacao-do-manad.js";

/**
 * A CLASSIFICAÇÃO DO CADASTRO PARA O MANAD (V22) — os quatro serviços que escrevem as colunas que o
 * gerador exige (e que até aqui nada escrevia).
 *
 * - N=2 em cada grupo: classificar um não classifica o vizinho;
 * - a reclassificação devolve o valor anterior (é cadastro, e a correção é o caso normal);
 * - fora do rol é recusado nomeando o rol, e NADA é gravado;
 * - a negativa de acesso afirma o MOTIVO (o perfil vizinho não tem a ação), e nada é gravado.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "contabilidade@cg.pb.gov.br";
const SO_CONSULTA = "consulta.manad@teste.local";

interface Cadastro {
  readonly unidades: readonly [string, string];
  readonly acoes: readonly [string, string];
  readonly despesas: readonly [string, string];
  readonly receitas: readonly [string, string];
}

async function recusa(p: Promise<unknown>): Promise<Error> {
  const e = await p.then(
    () => null,
    (x: unknown) => x
  );
  expect(e, "a operação deveria ter sido recusada").toBeInstanceOf(Error);
  return e as Error;
}

let c: Cadastro;

beforeEach(async () => {
  await limparBanco(prisma);
  const orgao = await prisma.orgao.create({ data: { codigo: "02", nome: "Secretaria de Teste" }, select: { id: true } });
  const u1 = await prisma.unidadeOrcamentaria.create({ data: { codigo: "02001", descricao: "Gabinete", orgaoId: orgao.id }, select: { id: true } });
  const u2 = await prisma.unidadeOrcamentaria.create({ data: { codigo: "02002", descricao: "Fundo de Saúde", orgaoId: orgao.id }, select: { id: true } });
  const a1 = await prisma.acao.create({ data: { codigo: "2001", descricao: "Manutenção", tipo: "ATIVIDADE" }, select: { id: true } });
  const a2 = await prisma.acao.create({ data: { codigo: "2002", descricao: "Benefícios previdenciários", tipo: "ATIVIDADE" }, select: { id: true } });
  const nd = (cod: string, d: string) =>
    prisma.naturezaDespesa.create({
      data: { codCategoria: cod[0]!, codNatureza: cod[1]!, codModalidade: cod.slice(2, 4), codElemento: cod.slice(4, 6), codigoCompleto: cod, descricao: d },
      select: { id: true },
    });
  const d1 = await nd("339030", "Material de consumo");
  const d2 = await nd("339039", "Outros serviços de terceiros - PJ");
  const r1 = await prisma.naturezaReceita.create({ data: { codigo: "11180111", descricao: "IPTU - Principal" }, select: { id: true } });
  const r2 = await prisma.naturezaReceita.create({ data: { codigo: "11180231", descricao: "ISSQN - Principal" }, select: { id: true } });
  c = { unidades: [u1.id, u2.id], acoes: [a1.id, a2.id], despesas: [d1.id, d2.id], receitas: [r1.id, r2.id] };

  const perfil = await prisma.perfil.create({
    data: {
      nome: "SO-CONSULTA-MANAD",
      descricao: "Vizinho: lê a contabilidade e não classifica o cadastro.",
      criadoPor: "SEED",
      permissoes: { create: [{ acao: "CONSULTAR_CONTABILIDADE", criadoPor: "SEED" }] },
    },
    select: { id: true },
  });
  const u = await prisma.usuario.create({ data: { identificador: SO_CONSULTA, nome: SO_CONSULTA, criadoPor: "SEED" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: "SEED" } });
});

describe("classificação do cadastro para o MANAD", () => {
  it("N=2 unidades: classifica uma, a vizinha segue pendente; reclassificar devolve o anterior", async () => {
    expect(await classificarUnidadeParaOManad(prisma, { unidadeId: c.unidades[1], tipo: "04", criadoPor: POR })).toEqual({ anterior: null, atual: "04" });
    const [u1, u2] = await Promise.all(c.unidades.map((id) => prisma.unidadeOrcamentaria.findUniqueOrThrow({ where: { id }, select: { tipoManad: true } })));
    expect([u1!.tipoManad, u2!.tipoManad]).toEqual([null, "04"]);
    expect(await classificarUnidadeParaOManad(prisma, { unidadeId: c.unidades[1], tipo: "12", criadoPor: POR })).toEqual({ anterior: "04", atual: "12" });
  });

  it("N=2 ações: 01 (RPPS) numa, 02 (Demais) na outra", async () => {
    await classificarAcaoParaOManad(prisma, { acaoId: c.acoes[0], tipo: "02", criadoPor: POR });
    await classificarAcaoParaOManad(prisma, { acaoId: c.acoes[1], tipo: "01", criadoPor: POR });
    const t = await prisma.acao.findMany({ where: { id: { in: [...c.acoes] } }, orderBy: { codigo: "asc" }, select: { tipoManad: true } });
    expect(t.map((x) => x.tipoManad)).toEqual(["02", "01"]);
  });

  it("N=2 naturezas de despesa e de receita: tipo de conta e nível gravados juntos, só na escolhida", async () => {
    expect(await classificarNaturezaDespesaParaOManad(prisma, { naturezaId: c.despesas[0], tipoDeConta: "A", nivel: "6", criadoPor: POR })).toEqual({ anterior: null, atual: "A/6" });
    expect(await classificarNaturezaReceitaParaOManad(prisma, { naturezaId: c.receitas[1], tipoDeConta: "A", nivel: 8, criadoPor: POR })).toEqual({ anterior: null, atual: "A/8" });
    const d = await prisma.naturezaDespesa.findMany({ where: { id: { in: [...c.despesas] } }, orderBy: { codigoCompleto: "asc" }, select: { indTipoContaManad: true, nivelContaManad: true } });
    const r = await prisma.naturezaReceita.findMany({ where: { id: { in: [...c.receitas] } }, orderBy: { codigo: "asc" }, select: { indTipoContaManad: true, nivelContaManad: true } });
    expect(d).toEqual([{ indTipoContaManad: "A", nivelContaManad: 6 }, { indTipoContaManad: null, nivelContaManad: null }]);
    expect(r).toEqual([{ indTipoContaManad: null, nivelContaManad: null }, { indTipoContaManad: "A", nivelContaManad: 8 }]);
  });

  it("NEGATIVO: fora do rol é recusado nomeando o rol — e nada é gravado", async () => {
    const e1 = await recusa(classificarUnidadeParaOManad(prisma, { unidadeId: c.unidades[0], tipo: "13", criadoPor: POR }));
    expect(e1).toBeInstanceOf(ClassificacaoDoManadInvalidaError);
    expect(e1.message).toMatch(/Tipo de unidade inválido: "13".*01 \(Prefeitura\).*12 \(Outras\)/);
    const e2 = await recusa(classificarAcaoParaOManad(prisma, { acaoId: c.acoes[0], tipo: "03", criadoPor: POR }));
    expect(e2.message).toMatch(/Tipo da ação inválido: "03".*01 \(RPPS\), 02 \(Demais\)/);
    const e3 = await recusa(classificarNaturezaDespesaParaOManad(prisma, { naturezaId: c.despesas[0], tipoDeConta: "A", nivel: "0", criadoPor: POR }));
    expect(e3.message).toMatch(/Nível da conta inválido: "0"/);
    const e4 = await recusa(classificarNaturezaReceitaParaOManad(prisma, { naturezaId: c.receitas[0], tipoDeConta: "X", nivel: "3", criadoPor: POR }));
    expect(e4.message).toMatch(/Tipo de conta inválido: "X".*A \(Analítica\), S \(Sintética\)/);
    expect((await prisma.unidadeOrcamentaria.findUniqueOrThrow({ where: { id: c.unidades[0] } })).tipoManad).toBeNull();
    expect((await prisma.acao.findUniqueOrThrow({ where: { id: c.acoes[0] } })).tipoManad).toBeNull();
    expect((await prisma.naturezaDespesa.findUniqueOrThrow({ where: { id: c.despesas[0] } })).nivelContaManad).toBeNull();
    expect((await prisma.naturezaReceita.findUniqueOrThrow({ where: { id: c.receitas[0] } })).indTipoContaManad).toBeNull();
  });

  it("NEGATIVO: o perfil vizinho (só consulta) é recusado por NÃO TER A AÇÃO — e nada é gravado", async () => {
    const e = await recusa(classificarUnidadeParaOManad(prisma, { unidadeId: c.unidades[0], tipo: "01", criadoPor: SO_CONSULTA }));
    expect(e.message).toMatch(/^ACESSO NEGADO: o usuário "consulta.manad@teste.local" não tem permissão para CADASTRAR_ENTIDADE_CONTABIL no escopo do ENTE/);
    const e2 = await recusa(classificarNaturezaDespesaParaOManad(prisma, { naturezaId: c.despesas[0], tipoDeConta: "A", nivel: "6", criadoPor: SO_CONSULTA }));
    expect(e2.message).toMatch(/nenhum dos perfis dele concede CADASTRAR_ENTIDADE_CONTABIL/);
    expect((await prisma.unidadeOrcamentaria.findUniqueOrThrow({ where: { id: c.unidades[0] } })).tipoManad).toBeNull();
    expect((await prisma.naturezaDespesa.findUniqueOrThrow({ where: { id: c.despesas[0] } })).indTipoContaManad).toBeNull();
  });
});
