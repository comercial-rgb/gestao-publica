import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { declararPercentualDePerda } from "../m10-patrimonial/ajuste-de-perdas.js";
import { notasExplicativas, redigirNotaExplicativa, retirarNotaExplicativa } from "./notas-explicativas.js";

/**
 * V35 C2 — NOTAS EXPLICATIVAS ÀS DCASP (MCASP 11ª ed., Parte V, item 8). Superfície de documento sobre cadastro;
 * a regra que importa é a versão vigente (append-only) e a pendência dos temas obrigatórios.
 *
 * Fixture: ente cadastrado; duas classes de bens (uma com parâmetro de 120 meses e 10% residual, outra sem
 * parâmetro); percentual de perda tributária de 62,5% em 2026.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "contabilidade@cg.pb.gov.br";
const SEM_PODER = "estagiario.rh@cg.pb.gov.br";
const TEXTO = "Texto da nota com conteúdo suficiente para informar o leitor.";

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.exercicio.create({ data: { ano: 2026, criadoPor: "TESTE" } });
  await prisma.enteConfig.create({ data: { id: "unico", codigoIbge: "2506004", poderOrgao: "10131", nome: "Município de Teste", cnpj: "01612345000199", uf: "PB", tribunalCodigo: "TCE-PB", tribunalUf: "PB", planoContasSeed: "pcasp-federal", conferidoPor: POR, conferidoEm: new Date("2026-01-05T12:00:00Z") } });
  const conta = await prisma.contaPcasp.create({ data: { codigo: "1.2.3.1.1.01.00", nome: "BENS MÓVEIS", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true }, select: { id: true } });
  await prisma.classeDeBens.create({ data: { id: "c1", codigo: "01", descricao: "Veículos", especie: "MOVEL", contaContabilAtivoId: conta.id, criadoPor: POR } });
  await prisma.classeDeBens.create({ data: { id: "c2", codigo: "02", descricao: "Mobiliário", especie: "MOVEL", contaContabilAtivoId: conta.id, criadoPor: POR } });
  await prisma.parametroAtualizacaoClasse.create({ data: { classeDeBensId: "c1", metodo: "DEPRECIACAO", vidaUtilMeses: 120, percentualResidual: "0.100000", criadoPor: POR } });
}

const nota = (over: Partial<Parameters<typeof redigirNotaExplicativa>[1]> = {}) =>
  redigirNotaExplicativa(prisma, { exercicio: 2026, secao: "OUTRAS_INFORMACOES", demonstracao: "BALANCO_PATRIMONIAL", ordem: 1, titulo: "Passivos contingentes", texto: TEXTO, criadoPor: POR, ...over });

describe("M12 — notas explicativas", () => {
  beforeEach(semear);

  it("t1: a versão vigente substitui a anterior, a retirada some do documento, e a numeração é corrida pelas seções", async () => {
    expect(await nota({ titulo: "Passivos contingentes", ordem: 2 })).toEqual({ chave: "NE-1", versao: 1 });
    expect(await nota({ titulo: "Compromissos contratuais", ordem: 1 })).toEqual({ chave: "NE-2", versao: 1 });
    expect(await nota({ chave: "NE-1", titulo: "Passivos contingentes (revista)", ordem: 2, texto: "Primeiro parágrafo revisto da nota.\n\nSegundo parágrafo." })).toEqual({ chave: "NE-1", versao: 2 });
    await nota({ chave: "FORMA_JURIDICA_E_DOMICILIO", secao: "INFORMACOES_GERAIS", demonstracao: "CONJUNTO", titulo: "Forma jurídica e domicílio" });
    await nota({ titulo: "A retirar", ordem: 3 });
    expect(await retirarNotaExplicativa(prisma, { exercicio: 2026, chave: "NE-3", criadoPor: POR })).toEqual({ versao: 2 });

    const doc = await notasExplicativas(prisma, { exercicio: 2026 });
    const resumo = doc.secoes.map((s) => [s.secao, s.notas.map((n) => [n.numero, n.chave, n.origem])]);
    expect(resumo).toEqual([
      ["INFORMACOES_GERAIS", [[1, "SISTEMA:IDENTIFICACAO", "SISTEMA"], [2, "FORMA_JURIDICA_E_DOMICILIO", "REDIGIDA"]]],
      ["POLITICAS_CONTABEIS", [[3, "SISTEMA:DEPRECIACAO", "SISTEMA"]]],
      ["DETALHAMENTO", []],
      ["OUTRAS_INFORMACOES", [[4, "NE-2", "REDIGIDA"], [5, "NE-1", "REDIGIDA"]]],
    ]);
    const ne1 = doc.secoes[3]!.notas[1]!;
    expect(ne1).toMatchObject({ titulo: "Passivos contingentes (revista)", texto: ["Primeiro parágrafo revisto da nota.", "Segundo parágrafo."], referencia: "Versão 2" });
    // o histórico fica: a versão 1 e a retirada continuam gravadas
    expect(await prisma.notaExplicativa.count({ where: { exercicio: 2026 } })).toBe(6);
    // quatro temas obrigatórios ainda sem nota; o redigido saiu da lista
    expect(doc.temasPendentes.map((t) => t.chave)).toEqual(["NATUREZA_DAS_OPERACOES", "LEGISLACAO", "DECLARACAO_DE_CONFORMIDADE", "BASES_DE_MENSURACAO"]);
  });

  it("t2: o que o sistema já sabe entra com a origem: identificação, depreciação por classe e metodologia da perda", async () => {
    await declararPercentualDePerda(prisma, { exercicio: 2026, origem: "TRIBUTARIA", percentual: "62.5", metodologia: "Média dos recebimentos dos três últimos exercícios sobre o saldo inscrito.", criadoPor: POR });
    const doc = await notasExplicativas(prisma, { exercicio: 2026 });
    const [gerais, politicas] = doc.secoes;
    expect(gerais!.notas[0]!.texto[0]).toBe("Município de Teste. CNPJ 01612345000199; código IBGE 2506004; UF PB.");
    expect(politicas!.notas.map((n) => n.chave)).toEqual(["SISTEMA:DEPRECIACAO", "SISTEMA:PERDAS_DA_DIVIDA_ATIVA"]);
    expect(politicas!.notas[0]!.texto.slice(1)).toEqual([
      "01 Veículos: depreciação pelo método das quotas constantes mensais, vida útil de 120 meses, valor residual de 10%.",
      "02 Mobiliário: sem parâmetro de vida útil cadastrado; a classe não é atualizada.",
    ]);
    expect(politicas!.notas[1]!.texto).toEqual(["Dívida ativa tributária: perda esperada de 62,5% do saldo. Média dos recebimentos dos três últimos exercícios sobre o saldo inscrito."]);
  });

  it("t3: recusas com o motivo, e nada gravado", async () => {
    await expect(nota({ chave: "BASES_DE_MENSURACAO", secao: "OUTRAS_INFORMACOES" })).rejects.toThrow(/pertence à seção "Resumo das políticas contábeis significativas".*8\.2\.1/);
    await expect(nota({ chave: "NE-9" })).rejects.toThrow(/Não há nota "NE-9" em 2026 para revisar/);
    await expect(nota({ exercicio: 2027 })).rejects.toThrow(/exercício 2027 não está cadastrado/);
    await expect(nota({ criadoPor: SEM_PODER })).rejects.toThrow(/CADASTRAR_LINHA_DEMONSTRATIVO/);
    await expect(retirarNotaExplicativa(prisma, { exercicio: 2026, chave: "NE-1", criadoPor: POR })).rejects.toThrow(/Não há nota "NE-1"/);
    expect(await prisma.notaExplicativa.count()).toBe(0);
    await nota();
    await retirarNotaExplicativa(prisma, { exercicio: 2026, chave: "NE-1", criadoPor: POR });
    await expect(retirarNotaExplicativa(prisma, { exercicio: 2026, chave: "NE-1", criadoPor: POR })).rejects.toThrow(/já está retirada/);
    await expect(retirarNotaExplicativa(prisma, { exercicio: 2026, chave: "NE-1", criadoPor: SEM_PODER })).rejects.toThrow(/CADASTRAR_LINHA_DEMONSTRATIVO/);
    expect(await prisma.notaExplicativa.count()).toBe(2);
  });
});
