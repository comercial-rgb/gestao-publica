import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { diaCivil } from "../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { vincularPessoaAoUsuario } from "../modules/m16-travamento/servico-pessoa-do-usuario.js";
import { ComandoEmConflitoError, ComandoJaConcluidoError, criarRegistroDeOperacaoPrisma, comOperacaoRegistrada } from "../modules/m16-travamento/operacao.js";
import { cadastrarItemDoContrato, designarNoContrato, registrarMedicaoPorItens } from "../modules/m11-licitacoes/fiscalizacao.js";
import { registrarMedicao } from "../modules/m11-licitacoes/medicoes.js";
import { configurarRegimeDeMedicao } from "../modules/m11-licitacoes/regime-de-medicao.js";

/**
 * ═══ A UNICIDADE DA MEDIÇÃO (V7 M2 U0.2 — ME01, ME02, ME04, ME05 e a concorrência pelo saldo) ═══
 *
 * O ACHADO: a medição por itens recusava QUALQUER sobreposição de período na obra, herdada da medição por valor; o
 * percurso passou a procurar "o dia livre". A pergunta certa é o que identifica a parcela. Esperado, definido ANTES:
 *   ME01 — mesma chave e mesmo conteúdo: UM efeito; a repetição (inclusive concorrente) não mede de novo;
 *   ME02 — mesma chave e outro conteúdo: conflito, nenhuma segunda medição;
 *   ME03 — mesma parcela com outra chave: o SALDO recusa (a parcela explícita da ordem de serviço vem no U1/U2);
 *   ME04 — duas parcelas distintas no MESMO dia e contrato: passam, e o saldo por item fica certo;
 *   ME05 — contrato com período indivisível configurado: sobreposição recusada NOMEANDO o fundamento, só nele;
 *   concorrência — duas medições pela última unidade do item: uma passa, a outra recusa pelo item;
 *   medição só por valor — o período continua conferido, agora na obra DENTRO do contrato; e o teto soma o contrato
 *   inteiro (antes somava só a obra: duas obras do mesmo contrato mediam acima do valor vigente).
 * Cenário sintético: item A (visita, 10 × R$ 100,00) e item B (hora, 20 × R$ 50,00) — R$ 2.000,00 — em dois
 * contratos independentes na mesma data (CT-A e CT-B).
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const ADMIN = "contratos.admin@teste.local";
const FISCAL = "fiscal.unico@teste.local";
const dia = (d: number): string => diaCivil(new Date(Date.now() + d * 86_400_000));
const ONTEM = dia(-1);
const itens: Record<string, { a: string; b: string }> = {};

async function conta(identificador: string, acoes: readonly string[], documento?: string): Promise<void> {
  const p = await prisma.perfil.create({ data: { nome: `P-${identificador}`, descricao: "teste", criadoPor: "SEED", permissoes: { create: acoes.map((acao) => ({ acao: acao as never, criadoPor: "SEED" })) } }, select: { id: true } });
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "SEED" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
  if (documento !== undefined) {
    await prisma.pessoa.create({ data: { documento, tipo: "FISICA", criadoPor: "SEED", versoes: { create: { nome: identificador, criadoPor: "SEED" } } } });
    await vincularPessoaAoUsuario(prisma, { usuarioId: u.id, documento, motivo: "Conferido pelo documento.", criadoPor: "SEED" });
  }
}

beforeEach(async () => {
  await limparBanco(prisma);
  await conta(ADMIN, ["DESIGNAR_NO_CONTRATO", "CADASTRAR_ITEM_DO_CONTRATO", "CONFIGURAR_EXECUCAO_DO_CONTRATO", "REGISTRAR_MEDICAO_DE_OBRA"]);
  await conta(FISCAL, ["REGISTRAR_MEDICAO_DE_OBRA"], "52998224725");
  await prisma.orgao.create({ data: { id: "org", codigo: "01", nome: "Prefeitura" } });
  await prisma.processoLicitatorio.create({ data: { id: "proc", numeroProcesso: "2026/0400", modalidade: "PREGAO_ELETRONICO", objeto: "Serviços mensuráveis", valorLicitado: "4000.00", criadoPor: "SEED" } });
  for (const [id, numero, obra] of [["ctr-a", "CT-A", "obra-a"], ["ctr-b", "CT-B", "obra-b"]] as const) {
    await prisma.contrato.create({ data: { id, numeroContrato: numero, processoId: "proc", contratadoDocumento: "12345678000199", contratadoNome: "Serviços Beta", valorInicial: "2000.00", vigenciaInicio: new Date(`${dia(-60)}T15:00:00Z`), vigenciaFimInicial: new Date(`${dia(60)}T15:00:00Z`), categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: "SEED" } });
    await prisma.obra.create({ data: { id: obra, identificador: `OB-${numero}`, descricao: `Serviço ${numero}`, tipoObraServico: "PAVIMENTACAO_ASFALTICA", orgaoId: "org", criadoPor: "SEED" } });
    itens[id] = {
      a: (await cadastrarItemDoContrato(prisma, { contratoId: id, descricao: "Visita técnica", unidade: "visita", quantidade: "10", valorUnitario: "100", criadoPor: ADMIN })).itemId,
      b: (await cadastrarItemDoContrato(prisma, { contratoId: id, descricao: "Hora técnica", unidade: "hora", quantidade: "20", valorUnitario: "50", criadoPor: ADMIN })).itemId,
    };
    await designarNoContrato(prisma, { contratoId: id, papel: "FISCAL", usuarioIdentificador: FISCAL, atoDesignacao: `Portaria ${numero}`, vigenciaInicio: dia(-30), criadoPor: ADMIN });
  }
}, 120_000);

const medir = (contrato: "ctr-a" | "ctr-b", numero: number, de: string, ate: string, pedidos: { item: "a" | "b"; quantidade: string }[]) =>
  registrarMedicaoPorItens(prisma, {
    obraId: contrato === "ctr-a" ? "obra-a" : "obra-b", contratoId: contrato, numero, diaInicio: de, diaFim: ate,
    itens: pedidos.map((p) => ({ itemId: itens[contrato]![p.item], quantidade: p.quantidade })), responsavelTecnico: "Eng. Marta Nunes", registroProfissional: "CREA-PB 123456", criadoPor: FISCAL,
  });

/** As quantidades medidas de um item, lidas pela medição por itens (o modelo aninhado não é nomeado por código). */
async function medidasDoItem(itemId: string): Promise<string[]> {
  const ms = await prisma.medicaoPorItens.findMany({ select: { itens: { where: { itemId }, select: { quantidade: true } } } });
  return ms.flatMap((m) => m.itens.map((i) => i.quantidade.toFixed(0))).sort();
}

const porta = criarRegistroDeOperacaoPrisma(prisma);
const envelope = <T>(chave: string, fingerprint: string, ato: () => Promise<T>) =>
  comOperacaoRegistrada(porta, { usuarioIdent: FISCAL, acao: "REGISTRAR_MEDICAO_DE_OBRA", chave, fingerprint, revalidar: async () => {} }, ato);

describe("a mesma intenção (o comando)", () => {
  it("ME01: mesma chave e mesmo conteúdo — um efeito, também sob concorrência; ME02: mesma chave com outro conteúdo — conflito", async () => {
    const r1 = await envelope("chave-me01", "conteudo-1", () => medir("ctr-a", 1, ONTEM, ONTEM, [{ item: "a", quantidade: "6" }, { item: "b", quantidade: "8" }]));
    expect(r1.valorMedido).toBe("1000.00");
    await expect(envelope("chave-me01", "conteudo-1", () => medir("ctr-a", 2, ONTEM, ONTEM, [{ item: "a", quantidade: "6" }, { item: "b", quantidade: "8" }]))).rejects.toBeInstanceOf(ComandoJaConcluidoError);
    await expect(envelope("chave-me01", "conteudo-2", () => medir("ctr-a", 2, ONTEM, ONTEM, [{ item: "b", quantidade: "1" }]))).rejects.toBeInstanceOf(ComandoEmConflitoError);
    // Concorrência: a mesma chave nova disparada duas vezes ao mesmo tempo.
    const corrida = await Promise.allSettled([1, 2].map(() => envelope("chave-concorrente", "conteudo-3", () => medir("ctr-a", 3, dia(-2), dia(-2), [{ item: "b", quantidade: "2" }]))));
    expect(corrida.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.medicaoDeObra.count({ where: { contratoId: "ctr-a" } })).toBe(2);
    expect(await medidasDoItem(itens["ctr-a"]!.b)).toEqual(["2", "8"]);
  });
});

describe("a parcela e o saldo (a regra de negócio)", () => {
  it("ME04: duas parcelas DISTINTAS no mesmo dia e no mesmo contrato passam, com o saldo por item certo — sem mudar a data", async () => {
    await expect(medir("ctr-a", 1, ONTEM, ONTEM, [{ item: "a", quantidade: "2" }])).resolves.toMatchObject({ valorMedido: "200.00" });
    await expect(medir("ctr-a", 2, ONTEM, ONTEM, [{ item: "b", quantidade: "3" }])).resolves.toMatchObject({ valorMedido: "150.00", acumulado: "350.00" });
    expect([await medidasDoItem(itens["ctr-a"]!.a), await medidasDoItem(itens["ctr-a"]!.b)]).toEqual([["2"], ["3"]]);
  });

  it("ME03 (pelo saldo): a mesma quantidade já medida não se mede de novo com outra chave — a recusa nomeia o item", async () => {
    await medir("ctr-a", 1, ONTEM, ONTEM, [{ item: "a", quantidade: "10" }]);
    await expect(envelope("outra-chave", "outro-conteudo", () => medir("ctr-a", 2, ONTEM, ONTEM, [{ item: "a", quantidade: "10" }]))).rejects.toThrow(/ITEM-ACIMA-DO-CONTRATADO: o item 1 \(Visita técnica\)/);
    expect(await prisma.medicaoDeObra.count({ where: { contratoId: "ctr-a" } })).toBe(1);
  });

  it("ME05: período indivisível configurado no CT-B recusa a sobreposição nomeando o fundamento — o CT-A, no mesmo dia, continua livre", async () => {
    await expect(configurarRegimeDeMedicao(prisma, { contratoId: "ctr-b", regime: "PERIODO_INDIVISIVEL", fundamento: "Cláusula 8.1 — medição mensal fechada", vigenciaInicio: dia(-10), criadoPor: FISCAL })).rejects.toThrow(/CONFIGURAR_EXECUCAO_DO_CONTRATO/);
    await configurarRegimeDeMedicao(prisma, { contratoId: "ctr-b", regime: "PERIODO_INDIVISIVEL", fundamento: "Cláusula 8.1 — medição mensal fechada", vigenciaInicio: dia(-10), criadoPor: ADMIN });
    await medir("ctr-b", 1, dia(-5), ONTEM, [{ item: "a", quantidade: "1" }]);
    await expect(medir("ctr-b", 2, ONTEM, ONTEM, [{ item: "b", quantidade: "1" }])).rejects.toThrow(/PERÍODO SOBREPOSTO na obra OB-CT-B \(período indivisível configurado no contrato — Cláusula 8\.1/);
    // Antes da vigência do regime, o período não é conferido (a versão anterior — nenhuma — vale).
    await expect(medir("ctr-b", 3, dia(-20), dia(-15), [{ item: "b", quantidade: "1" }])).resolves.toMatchObject({ valorMedido: "50.00" });
    await expect(medir("ctr-b", 4, dia(-20), dia(-15), [{ item: "b", quantidade: "1" }])).resolves.toMatchObject({ valorMedido: "50.00" });
    // O outro contrato, no mesmo período, não herda a regra.
    await medir("ctr-a", 1, dia(-5), ONTEM, [{ item: "a", quantidade: "1" }]);
    await expect(medir("ctr-a", 2, ONTEM, ONTEM, [{ item: "b", quantidade: "1" }])).resolves.toMatchObject({ valorMedido: "50.00" });
  });

  it("concorrência: duas medições pela ÚLTIMA visita do item — uma passa, a outra recusa pelo item, e o saldo nunca fica negativo", async () => {
    await medir("ctr-a", 1, dia(-3), dia(-3), [{ item: "a", quantidade: "9" }]);
    const r = await Promise.allSettled([2, 3].map((n) => medir("ctr-a", n, ONTEM, ONTEM, [{ item: "a", quantidade: "1" }])));
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(String((r.find((x) => x.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/ITEM-ACIMA-DO-CONTRATADO/);
    expect(await medidasDoItem(itens["ctr-a"]!.a)).toEqual(["1", "9"]);
  });
});

describe("a medição só por valor", () => {
  it("o período é conferido na obra DENTRO do contrato; outro contrato mede a mesma obra no mesmo período; o teto soma o contrato inteiro", async () => {
    await registrarMedicao(prisma, { obraId: "obra-a", contratoId: "ctr-a", numero: 1, diaInicio: dia(-10), diaFim: dia(-5), valorMedido: "1200.00", responsavelTecnico: "Eng. Marta", registroProfissional: "CREA 1", criadoPor: ADMIN });
    await expect(registrarMedicao(prisma, { obraId: "obra-a", contratoId: "ctr-a", numero: 2, diaInicio: dia(-5), diaFim: dia(-4), valorMedido: "10.00", responsavelTecnico: "Eng. Marta", registroProfissional: "CREA 1", criadoPor: ADMIN })).rejects.toThrow(/PERÍODO SOBREPOSTO na obra OB-CT-A \(medição só por valor/);
    // O contrato de supervisão (CT-B) mede a mesma obra, no mesmo período: outro serviço.
    await expect(registrarMedicao(prisma, { obraId: "obra-a", contratoId: "ctr-b", numero: 2, diaInicio: dia(-10), diaFim: dia(-5), valorMedido: "300.00", responsavelTecnico: "Eng. Paulo", registroProfissional: "CREA 2", criadoPor: ADMIN })).resolves.toMatchObject({ acumulado: "300.00" });
    // CT-A em OUTRA obra: 1.200 já medidos + 900 = 2.100 > 2.000. Antes, o teto somava só a obra e aceitava.
    await expect(registrarMedicao(prisma, { obraId: "obra-b", contratoId: "ctr-a", numero: 1, diaInicio: dia(-10), diaFim: dia(-5), valorMedido: "900.00", responsavelTecnico: "Eng. Marta", registroProfissional: "CREA 1", criadoPor: ADMIN })).rejects.toThrow(/MEDIÇÃO ACIMA DO CONTRATADO no contrato CT-A: acumulado ficaria 2100\.00/);
  });
});
