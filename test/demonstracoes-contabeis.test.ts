import "dotenv/config";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import {
  contasDeDisponibilidade,
  gerarBalancoFinanceiro,
  gerarBalancoPatrimonial,
  RolDeDisponibilidadeAusenteError,
} from "../lib/portas/demonstrativos.js";

/**
 * A PORTA DAS DEMONSTRAÇÕES CONTÁBEIS — o rol de disponibilidades e as duas respostas à sua
 * ausência.
 *
 * O que está sob teste NÃO é a aritmética dos demonstrativos (ela é do M12 e já tem os seus
 * testes): é a decisão nova desta borda — de onde sai o rol de contas de caixa, e o que cada
 * demonstração faz quando ele não existe. Foi aqui que a escolha foi feita, então é aqui que ela
 * precisa de prova.
 *
 * ⚠️ FIXTURE N=2 EM TODO CASO DE CONJUNTO. Com uma conta bancária só, "distinto" e "ordenado"
 * passam por vacuidade: qualquer implementação errada devolve a lista de um elemento certa. As
 * duas contas que apontam para a MESMA conta contábil são o caso que separa um `map` de um `Set`.
 */
const prisma = criarPrismaDeTeste();

/**
 * ⚠️ `limparBanco` UMA VEZ, e não a cada teste — e a razão é medida, não estética.
 *
 * Ele limpa e ressemeia as 427 tabelas do schema. Nesta máquina (8 GB, swap perto do teto
 * quando outra coisa pesada corre em paralelo) isso passou de 10 s e estourou o `hookTimeout`
 * padrão do Vitest em CINCO testes seguidos — um resultado que se LÊ como "a porta não
 * respondeu" e manda procurar defeito no lugar errado. Não é defeito da porta nem dele.
 *
 * O `beforeEach` abaixo apaga só as quatro tabelas que estes testes escrevem. Elas são a
 * fixture inteira: a porta não lê nada além disso.
 */
beforeAll(async () => {
  await exigirBanco(prisma);
  await limparBanco(prisma);
}, 300_000);

beforeEach(async () => {
  // Ordem imposta pela FK: a conta bancária aponta para a fonte e para a conta do PCASP.
  await prisma.contaBancaria.deleteMany();
  await prisma.fonteRecurso.deleteMany();
  await prisma.contaPcasp.deleteMany();
  await prisma.exercicio.deleteMany();
});

/**
 * Duas contas do PCASP para as contas bancárias amarrarem, e uma fonte.
 *
 * ⚠️ `indicadorSuperavit` FICA NULO, de propósito. O seed oficial do PCASP é explícito: o
 * atributo F/P não vem no arquivo da STN e uma letra chutada classificaria errado o superávit
 * financeiro. Nada nas asserções abaixo depende dele — o que está sob teste é a DERIVAÇÃO DO ROL
 * a partir do cadastro de contas bancárias, e para isso os códigos são identificadores. Semear
 * "F" aqui seria inventar classificação normativa dentro de uma fixture para nada.
 */
async function semearPlanoEFonte(): Promise<void> {
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-bco", codigo: "1.1.1.1.1.02.00", nome: "Bancos conta movimento", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: true },
      { id: "c-cxa", codigo: "1.1.1.1.1.01.00", nome: "Caixa", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: true },
    ],
  });
  await prisma.fonteRecurso.create({
    data: { id: "f-500", codigo: "500", descricao: "Recursos ordinários", codigoTce: "500" },
  });
}

describe("o rol de contas de disponibilidade vem do cadastro, não do código", () => {
  it("DUAS contas bancárias na MESMA conta contábil rendem UM código no rol", async () => {
    await semearPlanoEFonte();
    await prisma.contaBancaria.createMany({
      data: [
        { id: "cb-1", codigo: "CC-001", descricao: "Movimento A", fonteId: "f-500", contaContabilId: "c-bco" },
        { id: "cb-2", codigo: "CC-002", descricao: "Movimento B", fonteId: "f-500", contaContabilId: "c-bco" },
      ],
    });

    const rol = await contasDeDisponibilidade();

    // O rol é de CONTAS CONTÁBEIS, não de contas bancárias: duas bancárias na mesma contábil não
    // podem fazer o motor somar o caixa daquela conta duas vezes.
    expect(rol).toEqual(["1.1.1.1.1.02.00"]);
  });

  it("ordena por código e IGNORA a conta bancária sem conta contábil informada", async () => {
    await semearPlanoEFonte();
    await prisma.contaBancaria.createMany({
      data: [
        { id: "cb-1", codigo: "CC-001", descricao: "Movimento", fonteId: "f-500", contaContabilId: "c-bco" },
        { id: "cb-2", codigo: "CC-002", descricao: "Caixa", fonteId: "f-500", contaContabilId: "c-cxa" },
        // Sem `contaContabilId`: o operador ainda não informou. Não entra no rol, e não vira
        // uma entrada vazia que o motor tentaria casar com uma conta do razão.
        { id: "cb-3", codigo: "CC-003", descricao: "Sem amarração", fonteId: "f-500" },
      ],
    });

    const rol = await contasDeDisponibilidade();

    // ⚠️ AS DUAS ASSERÇÕES SÃO DIFERENTES. A primeira aceitaria qualquer ordem; a segunda é a que
    // acusa a falta do `.sort()`. A conta `...02.00` foi inserida ANTES da `...01.00` justamente
    // para que a ordem física do banco contrarie a ordem pedida — sem isso, o teste passaria com
    // um `findMany` sem ordenação nenhuma.
    expect([...rol].sort()).toEqual(["1.1.1.1.1.01.00", "1.1.1.1.1.02.00"]);
    expect(rol).toEqual(["1.1.1.1.1.01.00", "1.1.1.1.1.02.00"]);
  });

  it("sem NENHUMA conta bancária amarrada, o rol é vazio — e não um palpite", async () => {
    await semearPlanoEFonte();
    await prisma.contaBancaria.create({
      data: { id: "cb-1", codigo: "CC-001", descricao: "Sem amarração", fonteId: "f-500" },
    });

    expect(await contasDeDisponibilidade()).toEqual([]);
  });
});

describe("a ausência do rol: o Financeiro RECUSA, o Patrimonial DEGRADA", () => {
  it("o Balanço Financeiro recusa NOMEANDO o que falta e onde informar", async () => {
    await semearPlanoEFonte();
    await prisma.exercicio.create({ data: { ano: 2026 } });
    await prisma.contaBancaria.create({
      data: { id: "cb-1", codigo: "CC-001", descricao: "Sem amarração", fonteId: "f-500" },
    });

    // ⚠️ TESTE DE NEGAÇÃO QUE AFIRMA O MOTIVO. "Não emitiu" é compatível com o motor ter emitido
    // um Anexo 13 com saldo em espécie zerado — que é exatamente o defeito que esta recusa evita.
    const erro = await gerarBalancoFinanceiro({ exercicio: 2026 }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(RolDeDisponibilidadeAusenteError);
    expect((erro as Error).message).toContain("conta contábil");
    expect((erro as Error).message).toContain("Contas bancárias");
  });

  it("o Balanço Patrimonial sai sem o quadro por fonte, em vez de não sair", async () => {
    await semearPlanoEFonte();
    await prisma.contaBancaria.create({
      data: { id: "cb-1", codigo: "CC-001", descricao: "Sem amarração", fonteId: "f-500" },
    });

    const bp = await gerarBalancoPatrimonial({ corte: new Date("2026-12-31T12:00:00Z") });

    // A ASSIMETRIA É O COMPORTAMENTO: o balanço inteiro não depende do rol — só o quadro por
    // fonte depende. Recusar o balanço todo esconderia ativo, passivo e PL já apurados.
    expect(bp.superavitPorFonte).toBeNull();
    expect(bp.relatorio).toBe("ANEXO 14 — BALANÇO PATRIMONIAL");
  });

  it("COM o rol, o quadro por fonte deixa de ser nulo", async () => {
    await semearPlanoEFonte();
    await prisma.contaBancaria.createMany({
      data: [
        { id: "cb-1", codigo: "CC-001", descricao: "Movimento", fonteId: "f-500", contaContabilId: "c-bco" },
        { id: "cb-2", codigo: "CC-002", descricao: "Caixa", fonteId: "f-500", contaContabilId: "c-cxa" },
      ],
    });

    const bp = await gerarBalancoPatrimonial({ corte: new Date("2026-12-31T12:00:00Z") });

    // O par do caso anterior: sem ele, "veio null" não distingue "o rol faltou" de "o quadro
    // nunca sai".
    expect(bp.superavitPorFonte).not.toBeNull();
  });
});
