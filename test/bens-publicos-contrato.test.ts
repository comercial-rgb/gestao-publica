import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import {
  CAMPOS_NUNCA_PUBLICOS,
  CAMPOS_PUBLICOS,
  bemPublico,
  listarBensPublicos,
} from "../lib/portas/bens-publicos.js";
import { registrarMovimentoDeGestao } from "../modules/m10-patrimonial/gestao-do-bem.js";

/**
 * ═══ O CONTRATO DA CONSULTA PÚBLICA DE BENS (V9 N2) ═══
 *
 * ⚠️ ESTE ARQUIVO É DE NEGAÇÃO, E A NEGAÇÃO AFIRMA O MOTIVO. "A tela não mostra o responsável"
 * é compatível com o servidor entregando o nome e o CPF do servidor no mesmo objeto, esperando
 * que ninguém olhe — e olhar, numa página pública, é ver o HTML. O que se afirma aqui é que o
 * DADO NÃO SAI DA PORTA.
 *
 * FIXTURE N=2 em tudo que só se manifesta em conjunto: dois bens, duas localizações (uma
 * divulgável e uma reservada), duas pessoas responsáveis. Com um bem só, "a localização
 * reservada não aparece" passaria por vacuidade — não haveria a divulgável para provar que a
 * porta sabe distinguir, e um `publicavel = false` cravado passaria no teste.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "patrimonio@cg.pb.gov.br";
const CPF_RESPONSAVEL = "11144477735";
const NOME_RESPONSAVEL = "Marta Nogueira da Silva";
const LOCAL_RESERVADO = "Cofre da Tesouraria, subsolo";
const LOCAL_DIVULGAVEL = "Escola Municipal Central";
/** O conteúdo da etiqueta física — deliberadamente SEM relação com o tombamento. */
const ETIQUETA_SECRETA = "ETQ-9F3A21";

let bemAberto = "";
let bemReservado = "";

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.create({
    data: { id: "c-pub", codigo: "1.2.3.1.1.01.00", nome: "Bens moveis", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: true, indicadorSuperavit: "P" },
  });
  await prisma.classeDeBens.createMany({
    data: [
      { id: "cl-inf", codigo: "1.2.3.1.1.04", descricao: "Equipamentos de informática", especie: "MOVEL", contaContabilAtivoId: "c-pub", criadoPor: POR },
      { id: "cl-mob", codigo: "1.2.3.1.1.02", descricao: "Móveis e utensílios", especie: "MOVEL", contaContabilAtivoId: "c-pub", criadoPor: POR },
    ],
  });

  const a = await prisma.bemPatrimonial.create({
    data: {
      numeroTombamento: "PUB-0001",
      descricao: "Computador de mesa",
      classeDeBensId: "cl-inf",
      dataAquisicao: new Date("2026-02-10T12:00:00Z"),
      // ⚠️ O CÓDIGO DE BARRAS É DIFERENTE DO TOMBAMENTO NESTA FIXTURE, e isso é o ponto.
      // Com `codigoDeBarras === numeroTombamento`, buscar pela etiqueta e achar o bem não
      // distingue "a busca alcança o código de barras" de "a busca alcança o tombamento" — e o
      // teste passaria com a porta vazando. Medido: com os dois iguais, a mutação que põe
      // `codigoDeBarras` no WHERE da busca pública passou verde.
      codigoDeBarras: ETIQUETA_SECRETA,
      criadoPor: POR,
    },
    select: { id: true },
  });
  const b = await prisma.bemPatrimonial.create({
    data: { numeroTombamento: "PUB-0002", descricao: "Cofre de aço", classeDeBensId: "cl-mob", dataAquisicao: new Date("2026-05-20T12:00:00Z"), criadoPor: POR },
    select: { id: true },
  });
  bemAberto = a.id;
  bemReservado = b.id;

  const aberto = await prisma.localizacaoFisica.create({
    data: { codigo: "ESC-01", descricao: LOCAL_DIVULGAVEL, publicavelNaTransparencia: true, criadoPor: POR },
    select: { id: true },
  });
  const reservado = await prisma.localizacaoFisica.create({
    // Sem passar o campo: o padrão do banco é `false`. É assim que uma localização recém-criada
    // chega ao sistema, e é o caso que precisa estar coberto.
    data: { codigo: "TES-SUB", descricao: LOCAL_RESERVADO, criadoPor: POR },
    select: { id: true },
  });

  const pessoa = await prisma.pessoa.create({
    data: { documento: CPF_RESPONSAVEL, tipo: "FISICA", criadoPor: POR, versoes: { create: { nome: NOME_RESPONSAVEL, criadoPor: POR } } },
    select: { id: true },
  });

  const em = (dia: string): Date => new Date(`2026-06-${dia}T12:00:00Z`);
  await registrarMovimentoDeGestao(prisma, { bemId: bemAberto, tipo: "LOCALIZACAO", localizacaoId: aberto.id, dataMovimento: em("01"), motivo: "fixture", criadoPor: POR });
  await registrarMovimentoDeGestao(prisma, { bemId: bemAberto, tipo: "RESPONSAVEL", responsavelId: pessoa.id, dataMovimento: em("02"), motivo: "fixture", criadoPor: POR });
  await registrarMovimentoDeGestao(prisma, { bemId: bemAberto, tipo: "SITUACAO", situacao: "EM_USO", dataMovimento: em("03"), motivo: "fixture", criadoPor: POR });
  await registrarMovimentoDeGestao(prisma, { bemId: bemReservado, tipo: "LOCALIZACAO", localizacaoId: reservado.id, dataMovimento: em("01"), motivo: "fixture", criadoPor: POR });
  await registrarMovimentoDeGestao(prisma, { bemId: bemReservado, tipo: "RESPONSAVEL", responsavelId: pessoa.id, dataMovimento: em("02"), motivo: "fixture", criadoPor: POR });
}

/** Toda string que sai da porta, achatada — é onde um dado vazado realmente aparece. */
function textoInteiro(v: unknown): string {
  return JSON.stringify(v);
}

describe("a consulta pública de bens não entrega dado pessoal", () => {
  beforeEach(semear);

  it("a lista traz os dois bens e NENHUM campo fora do contrato público", async () => {
    const p = await listarBensPublicos();
    expect(p.total).toBe(2);

    for (const linha of p.linhas) {
      const chaves = Object.keys(linha).sort();
      expect(
        chaves,
        `a projeção pública ganhou campo fora do contrato. O contrato é ` +
          `CAMPOS_PUBLICOS em lib/portas/bens-publicos.ts — campo novo no modelo interno NÃO ` +
          `entra aqui por tabela.`
      ).toEqual([...CAMPOS_PUBLICOS].sort());
    }
  });

  it("o nome e o CPF do responsável NÃO saem — nem no objeto, nem em nenhuma string dele", async () => {
    const p = await listarBensPublicos();
    const bruto = textoInteiro(p);

    expect(
      bruto.includes(NOME_RESPONSAVEL),
      `o nome do servidor responsável saiu na consulta pública. A tela pode não exibi-lo; o ` +
        `dado chegou ao navegador assim mesmo, e numa página pública "chegou ao navegador" ` +
        `é "foi publicado".`
    ).toBe(false);
    expect(bruto.includes(CPF_RESPONSAVEL), "o CPF do responsável saiu na consulta pública").toBe(false);

    for (const proibido of CAMPOS_NUNCA_PUBLICOS) {
      expect(bruto.includes(`"${proibido}"`), `o campo "${proibido}" apareceu na projeção pública`).toBe(false);
    }
  });

  it("o código de barras da etiqueta não sai, e não se descobre pela busca", async () => {
    const p = await listarBensPublicos();
    expect(textoInteiro(p).includes('"codigoDeBarras"')).toBe(false);

    // ⚠️ A SEGUNDA METADE É A QUE IMPORTA. Tirar o campo da resposta e deixá-lo BUSCÁVEL
    // permitiria confirmar a etiqueta de qualquer bem por tentativa — o mesmo vazamento por
    // outra porta, e um oráculo de sim/não é tudo de que esse ataque precisa.
    //
    // ⚠️ E ESTA ASSERÇÃO SÓ VALE PORQUE A ETIQUETA NÃO É O TOMBAMENTO. Ver a fixture: com os
    // dois iguais, a mutação que acrescenta `codigoDeBarras` ao WHERE passava verde.
    const porEtiqueta = await listarBensPublicos({ q: ETIQUETA_SECRETA });
    expect(
      porEtiqueta.total,
      `a busca pública encontrou um bem pelo CONTEÚDO DA ETIQUETA (${ETIQUETA_SECRETA}). O campo ` +
        `não sai na resposta, mas a busca virou um oráculo que confirma qualquer código por ` +
        `tentativa.`
    ).toBe(0);
  });

  it("a localização reservada não aparece; a divulgável aparece — e o bem continua na lista", async () => {
    const p = await listarBensPublicos();
    const aberto = p.linhas.find((l) => l.numeroTombamento === "PUB-0001");
    const reservado = p.linhas.find((l) => l.numeroTombamento === "PUB-0002");

    expect(aberto?.localizacaoDivulgada, "a localização declarada divulgável foi escondida").toBe(true);
    expect(aberto?.localizacao).toBe(LOCAL_DIVULGAVEL);

    expect(
      reservado?.localizacaoDivulgada,
      `a localização de acesso restrito foi publicada. O padrão da coluna é false justamente ` +
        `para que uma localização recém-cadastrada não vaze antes de alguém decidir.`
    ).toBe(false);
    expect(reservado?.localizacao).toBeNull();
    expect(textoInteiro(p).includes(LOCAL_RESERVADO), "o texto da localização reservada saiu assim mesmo").toBe(false);

    // ⚠️ E O BEM CONTINUA PÚBLICO. Esconder o bem inteiro seria a correção fácil e errada: o
    // patrimônio é público; o que é reservado é o LUGAR.
    expect(reservado?.descricao).toBe("Cofre de aço");
  });

  it("o detalhe segue o mesmo contrato, e o valor contábil vem com data de referência", async () => {
    const d = await bemPublico(bemReservado);
    expect(d).not.toBeNull();
    const bruto = textoInteiro(d);
    expect(bruto.includes(NOME_RESPONSAVEL)).toBe(false);
    expect(bruto.includes(CPF_RESPONSAVEL)).toBe(false);
    expect(bruto.includes(LOCAL_RESERVADO)).toBe(false);

    expect(
      d?.dataDeReferencia,
      "o valor contábil veio sem a data em que vale. Depreciação e reavaliação mudam o número, " +
        "e quem confere amanhã acharia divergência onde houve só passagem do tempo."
    ).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it("um identificador inexistente devolve nulo — não um bem qualquer", async () => {
    expect(await bemPublico("cqqqqqqqqqqqqqqqqqqqqqqqq")).toBeNull();
  });
});

describe("os filtros e a paginação da consulta pública", () => {
  beforeEach(semear);

  it("filtra por ano de aquisição pelo dia CIVIL do ente", async () => {
    expect((await listarBensPublicos({ anoAquisicao: "2026" })).total).toBe(2);
    expect((await listarBensPublicos({ anoAquisicao: "2025" })).total).toBe(0);
  });

  it("filtra por situação, e 'sem registro' é diferente de 'todas'", async () => {
    expect((await listarBensPublicos({ situacao: "EM_USO" })).total).toBe(1);
    // O cofre não recebeu movimento de SITUACAO: ele é o "sem registro".
    const sem = await listarBensPublicos({ situacao: "SEM_REGISTRO" });
    expect(sem.total).toBe(1);
    expect(sem.linhas[0]?.numeroTombamento).toBe("PUB-0002");
  });

  it("pagina NO SERVIDOR: a página 2 traz o outro bem, e o total continua dois", async () => {
    const p1 = await listarBensPublicos({ porPagina: 1, pagina: 1 });
    const p2 = await listarBensPublicos({ porPagina: 1, pagina: 2 });
    expect(p1.total).toBe(2);
    expect(p1.paginas).toBe(2);
    expect(p1.linhas).toHaveLength(1);
    expect(p2.linhas).toHaveLength(1);
    expect(
      p1.linhas[0]?.id === p2.linhas[0]?.id,
      "as duas páginas trouxeram o MESMO bem — a paginação não está no banco"
    ).toBe(false);
  });

  it("a busca alcança tombamento e descrição", async () => {
    expect((await listarBensPublicos({ q: "Computador" })).total).toBe(1);
    expect((await listarBensPublicos({ q: "PUB-0002" })).total).toBe(1);
    expect((await listarBensPublicos({ q: "inexistente" })).total).toBe(0);
  });
});
