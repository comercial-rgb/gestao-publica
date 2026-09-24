import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { centroDeCustoVigenteEm, funcaoVigenteEm, type EventoDoVinculo } from "./dominio.js";
import {
  admitirServidor,
  cadastrarCargo,
  cadastrarFuncao,
  cadastrarLotacao,
  cadastrarServidor,
  registrarMovimentacao,
} from "./servico.js";

/**
 * ═══ A FUNÇÃO E O CENTRO DE CUSTO, COM BANCO — TR 5.12.50 (V11 V9.4) ═══
 *
 * O arquivo irmão (`m32-funcao-e-centro-de-custo.test.ts`) prova as DERIVAÇÕES, puras. Este prova
 * o que só o banco pode dizer: que os CHECK existem **e acusam**, que o caso de uso recusa a
 * dispensa órfã, e que o crachá é cobrado nas duas direções.
 *
 * ⚠️ OS CHECK SÃO PROVADOS PELO EFEITO, NÃO PELA PAPELADA. Ler `pg_constraint` diria que eles
 * existem — e um CHECK pode existir com a condição errada e nunca recusar nada. Aqui cada um
 * recebe a linha que ele deve barrar, gravada DIRETO pelo Prisma (que não conhece CHECK), e o que
 * se afirma é a recusa do Postgres.
 *
 * ⚠️ E O ATOR NEGATIVO NASCE FORA DO CENSO de `test/usuarios-teste.ts`. Toda identidade de lá é
 * ADMIN com `TODAS_AS_ACOES`: reusar uma daqui daria ou colisão no `@@unique`, ou um teste que
 * "passa" com o ator autorizado o tempo todo. O ator abaixo tem uma ação VIZINHA e não a vigiada —
 * é o que separa "recusou porque não tem ESTA ação" de "recusou porque não tem ação nenhuma".
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "contabilidade@cg.pb.gov.br";
const D = (a: number, m: number, d: number): Date => new Date(Date.UTC(a, m - 1, d, 12, 0, 0));

beforeEach(async () => {
  await limparBanco(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function cenario(): Promise<{
  readonly vinculoId: string;
  readonly funcaoDiretora: string;
  readonly funcaoCoordenadora: string;
  readonly setorEducacao: string;
  readonly setorSaude: string;
}> {
  const { cargoId } = await cadastrarCargo(prisma, {
    codigo: "PROF-I", denominacao: "Professor Nivel I", tipo: "EFETIVO", vagasFixadas: 5,
    leiAutorizativa: "Lei Municipal 1.234/2010", dataPublicacaoLei: D(2010, 5, 1), criadoPor: POR,
  });
  const { lotacaoId } = await cadastrarLotacao(prisma, { codigo: "SEDUC", nome: "Secretaria de Educacao", criadoPor: POR });

  // ⚠️ N=2 nas duas dimensões: uma função só nunca revela um filtro que ignora o identificador,
  // e um centro de custo só nunca revela uma derivação que devolve "o único que existe".
  const { funcaoId: funcaoDiretora } = await cadastrarFuncao(prisma, {
    codigo: "FG-DIR", denominacao: "Direcao de Escola",
    leiAutorizativa: "Lei Municipal 2.000/2015", dataPublicacaoLei: D(2015, 3, 1), criadoPor: POR,
  });
  const { funcaoId: funcaoCoordenadora } = await cadastrarFuncao(prisma, {
    codigo: "FG-COORD", denominacao: "Coordenacao Pedagogica",
    leiAutorizativa: "Lei Municipal 2.000/2015", dataPublicacaoLei: D(2015, 3, 1), criadoPor: POR,
  });

  // O centro de custo é o `Setor` do M21 — cadastro que já existia, e que exige unidade orçamentária.
  await prisma.orgao.create({ data: { id: "org-1", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.createMany({
    data: [
      { id: "uo-educ", codigo: "01001", descricao: "Educacao", orgaoId: "org-1" },
      { id: "uo-saude", codigo: "01002", descricao: "Saude", orgaoId: "org-1" },
    ],
  });
  await prisma.setor.createMany({
    data: [
      { id: "setor-educ", codigo: "CC-EDU", nome: "Centro de custo Educacao", unidadeOrcId: "uo-educ", criadoPor: POR },
      { id: "setor-saude", codigo: "CC-SAU", nome: "Centro de custo Saude", unidadeOrcId: "uo-saude", criadoPor: POR },
    ],
  });

  const pessoa = await prisma.pessoa.create({
    data: { documento: "11122233344", tipo: "FISICA", criadoPor: POR, versoes: { create: { nome: "Maria de Teste", criadoPor: POR } } },
    select: { id: true },
  });
  const { servidorId } = await cadastrarServidor(prisma, {
    pessoaId: pessoa.id, dataNascimento: D(1985, 7, 20), sexo: "FEMININO", criadoPor: POR,
  });
  const { vinculoId } = await admitirServidor(prisma, {
    servidorId, matricula: "1001", tipo: "EFETIVO", regimeJuridico: "Estatutario",
    dataAdmissao: D(2020, 2, 1), cargoId, lotacaoId, salarioBase: "3000.00", criadoPor: POR,
  });
  return { vinculoId, funcaoDiretora, funcaoCoordenadora, setorEducacao: "setor-educ", setorSaude: "setor-saude" };
}

async function eventosDe(vinculoId: string): Promise<readonly EventoDoVinculo[]> {
  const es = await prisma.historicoVinculo.findMany({
    where: { vinculoId },
    orderBy: [{ data: "asc" }, { criadoEm: "asc" }],
    select: { data: true, criadoEm: true, tipo: true, cargoId: true, lotacaoId: true, funcaoId: true, centroDeCustoId: true },
  });
  return es.map((e) => ({
    data: e.data, criadoEm: e.criadoEm, tipo: e.tipo, cargoId: e.cargoId, lotacaoId: e.lotacaoId,
    salarioBase: null, funcaoId: e.funcaoId, centroDeCustoId: e.centroDeCustoId,
  }));
}

describe("a função exercida, de ponta a ponta", () => {
  it("1. designa, deriva na data, dispensa e encerra — e a redesignação é outra função (N=2)", async () => {
    const c = await cenario();
    await registrarMovimentacao(prisma, { vinculoId: c.vinculoId, tipo: "DESIGNACAO_FUNCAO", data: D(2022, 3, 1), motivo: "Portaria 10/2022", funcaoId: c.funcaoDiretora, criadoPor: POR });
    await registrarMovimentacao(prisma, { vinculoId: c.vinculoId, tipo: "DISPENSA_FUNCAO", data: D(2024, 6, 30), motivo: "Portaria 40/2024", criadoPor: POR });
    await registrarMovimentacao(prisma, { vinculoId: c.vinculoId, tipo: "DESIGNACAO_FUNCAO", data: D(2025, 1, 15), motivo: "Portaria 3/2025", funcaoId: c.funcaoCoordenadora, criadoPor: POR });

    const evs = await eventosDe(c.vinculoId);
    expect(funcaoVigenteEm(evs, D(2021, 12, 31))).toBeNull();
    expect(funcaoVigenteEm(evs, D(2023, 8, 1))).toBe(c.funcaoDiretora);
    expect(funcaoVigenteEm(evs, D(2024, 7, 1))).toBeNull();
    expect(funcaoVigenteEm(evs, D(2025, 6, 1))).toBe(c.funcaoCoordenadora);
  });

  it("2. ⚠️ A DISPENSA ÓRFÃ É RECUSADA, E A RECUSA DIZ O MOTIVO — não grava ato sem efeito", async () => {
    const c = await cenario();
    await expect(
      registrarMovimentacao(prisma, { vinculoId: c.vinculoId, tipo: "DISPENSA_FUNCAO", data: D(2023, 5, 1), motivo: "sem designacao anterior", criadoPor: POR })
    ).rejects.toThrow(/DISPENSA-SEM-FUNCAO-VIGENTE/);

    // ⚠️ E NADA FOI GRAVADO — "recusou" e "recusou sem deixar lixo" são afirmações diferentes.
    const dispensas = await prisma.historicoVinculo.count({ where: { vinculoId: c.vinculoId, tipo: "DISPENSA_FUNCAO" } });
    expect(dispensas).toBe(0);
  });

  it("3. ⚠️ A DISPENSA É CONFERIDA NA DATA DO EFEITO, não hoje — retroativa antes da designação recusa", async () => {
    const c = await cenario();
    await registrarMovimentacao(prisma, { vinculoId: c.vinculoId, tipo: "DESIGNACAO_FUNCAO", data: D(2024, 1, 1), motivo: "Portaria 1/2024", funcaoId: c.funcaoDiretora, criadoPor: POR });
    // Havia função HOJE, mas não em 2023: perguntar por hoje aceitaria uma dispensa que não encerra nada.
    await expect(
      registrarMovimentacao(prisma, { vinculoId: c.vinculoId, tipo: "DISPENSA_FUNCAO", data: D(2023, 6, 1), motivo: "retroativa demais", criadoPor: POR })
    ).rejects.toThrow(/DISPENSA-SEM-FUNCAO-VIGENTE/);
    // E a mesma dispensa DEPOIS da designação passa.
    await registrarMovimentacao(prisma, { vinculoId: c.vinculoId, tipo: "DISPENSA_FUNCAO", data: D(2024, 8, 1), motivo: "Portaria 30/2024", criadoPor: POR });
    expect(funcaoVigenteEm(await eventosDe(c.vinculoId), D(2024, 9, 1))).toBeNull();
  });
});

describe("o centro de custo — o `Setor` do M21, com vigência pelo vínculo", () => {
  it("4. ⚠️ O CENTRO DE CUSTO DE MAIO NÃO É O DE HOJE — mudar em agosto não reescreve maio", async () => {
    const c = await cenario();
    await registrarMovimentacao(prisma, { vinculoId: c.vinculoId, tipo: "MUDANCA_CENTRO_DE_CUSTO", data: D(2025, 1, 1), motivo: "apropriacao inicial", centroDeCustoId: c.setorEducacao, criadoPor: POR });
    await registrarMovimentacao(prisma, { vinculoId: c.vinculoId, tipo: "MUDANCA_CENTRO_DE_CUSTO", data: D(2025, 8, 1), motivo: "cessao a Saude", centroDeCustoId: c.setorSaude, criadoPor: POR });

    const evs = await eventosDe(c.vinculoId);
    expect(centroDeCustoVigenteEm(evs, D(2025, 5, 31))).toBe(c.setorEducacao);
    expect(centroDeCustoVigenteEm(evs, D(2025, 9, 30))).toBe(c.setorSaude);
  });

  it("5. vínculo sem evento de centro de custo devolve nulo — e é o estado de todo vínculo legado", async () => {
    const c = await cenario();
    expect(centroDeCustoVigenteEm(await eventosDe(c.vinculoId), D(2026, 1, 1))).toBeNull();
  });

  it("6. setor DESATIVADO é recusado com motivo — quem recusa é o ato, não a leitura", async () => {
    const c = await cenario();
    await prisma.setor.update({ where: { id: c.setorSaude }, data: { ativo: false } });
    await expect(
      registrarMovimentacao(prisma, { vinculoId: c.vinculoId, tipo: "MUDANCA_CENTRO_DE_CUSTO", data: D(2025, 8, 1), motivo: "para setor morto", centroDeCustoId: c.setorSaude, criadoPor: POR })
    ).rejects.toThrow(/CENTRO-DE-CUSTO-INATIVO/);
  });
});

describe("⚠️ OS TRÊS CHECK, PROVADOS PELO EFEITO — cada um recebe a linha que deve barrar", () => {
  it("7. `ck_historico_vinculo_funcao` é BICONDICIONAL: designação sem função NÃO grava", async () => {
    const c = await cenario();
    await expect(
      prisma.historicoVinculo.create({ data: { vinculoId: c.vinculoId, data: D(2024, 1, 1), tipo: "DESIGNACAO_FUNCAO", motivo: "sem funcao", criadoPor: POR } })
    ).rejects.toThrow(/ck_historico_vinculo_funcao/);
  });

  it("8. …e a outra metade: DISPENSA COM função não grava — senão a ficha mostraria as duas iguais", async () => {
    const c = await cenario();
    await expect(
      prisma.historicoVinculo.create({ data: { vinculoId: c.vinculoId, data: D(2024, 1, 1), tipo: "DISPENSA_FUNCAO", funcaoId: c.funcaoDiretora, motivo: "dispensa com funcao", criadoPor: POR } })
    ).rejects.toThrow(/ck_historico_vinculo_funcao/);
  });

  it("9. …e NENHUM outro tipo traz função — falha fechada para o próximo tipo de evento", async () => {
    const c = await cenario();
    await expect(
      prisma.historicoVinculo.create({ data: { vinculoId: c.vinculoId, data: D(2024, 1, 1), tipo: "AFASTAMENTO", funcaoId: c.funcaoDiretora, motivo: "afastamento com funcao", criadoPor: POR } })
    ).rejects.toThrow(/ck_historico_vinculo_funcao/);
  });

  it("10. `ck_historico_vinculo_centro_de_custo` — um AFASTAMENTO não reapropria despesa", async () => {
    const c = await cenario();
    await expect(
      prisma.historicoVinculo.create({ data: { vinculoId: c.vinculoId, data: D(2024, 1, 1), tipo: "AFASTAMENTO", centroDeCustoId: c.setorEducacao, motivo: "afastamento que muda custo", criadoPor: POR } })
    ).rejects.toThrow(/ck_historico_vinculo_centro_de_custo/);
  });

  it("11. `ck_historico_vinculo_centro_de_custo_exigido` — a mudança SEM destino não muda nada", async () => {
    const c = await cenario();
    await expect(
      prisma.historicoVinculo.create({ data: { vinculoId: c.vinculoId, data: D(2024, 1, 1), tipo: "MUDANCA_CENTRO_DE_CUSTO", motivo: "sem destino", criadoPor: POR } })
    ).rejects.toThrow(/ck_historico_vinculo_centro_de_custo_exigido/);
  });

  it("12. e a ADMISSÃO PODE trazer centro de custo — é o que torna a migration aditiva", async () => {
    const c = await cenario();
    const admissao = await prisma.historicoVinculo.findFirst({ where: { vinculoId: c.vinculoId, tipo: "ADMISSAO" }, select: { id: true } });
    await expect(
      prisma.historicoVinculo.update({ where: { id: admissao!.id }, data: { centroDeCustoId: c.setorEducacao } })
    ).resolves.toBeTruthy();
  });
});

describe("o crachá de `cadastrarFuncao`, nas duas direções", () => {
  it("13. ⚠️ NEGATIVA E POSITIVA PAREADAS, com ator FORA do censo e ação VIZINHA", async () => {
    // Sem `CADASTRAR_CARGO`, mas COM uma ação vizinha do mesmo módulo: a recusa que se vê é
    // "não tem ESTA ação", não "não tem ação nenhuma".
    const perfil = await prisma.perfil.create({
      data: {
        nome: "SO_ADMITE", descricao: "Admite, nao cria estrutura", criadoPor: "TESTE",
        permissoes: { create: [{ acao: "ADMITIR_SERVIDOR", criadoPor: "TESTE" }] },
      },
      select: { id: true },
    });
    const usuario = await prisma.usuario.create({
      data: { identificador: "so.admite.funcao@teste.local", nome: "So Admite", criadoPor: "TESTE" },
      select: { id: true },
    });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: usuario.id, perfilId: perfil.id, criadoPor: "TESTE" } });

    const entrada = {
      codigo: "FG-NOVA", denominacao: "Funcao nova",
      leiAutorizativa: "Lei 9/2026", dataPublicacaoLei: D(2026, 1, 1),
    };

    // NEGATIVA — e nada gravado.
    await expect(cadastrarFuncao(prisma, { ...entrada, criadoPor: "so.admite.funcao@teste.local" })).rejects.toThrow();
    expect(await prisma.funcaoDePessoal.count({ where: { codigo: "FG-NOVA" } })).toBe(0);

    // ⚠️ POSITIVA SOBRE O MESMO CENÁRIO. Sem ela, um `throw` incondicional no caminho guardado
    // deixaria a negativa verde com a funcionalidade quebrada para todo mundo.
    await cadastrarFuncao(prisma, { ...entrada, criadoPor: POR });
    expect(await prisma.funcaoDePessoal.count({ where: { codigo: "FG-NOVA" } })).toBe(1);
  });

  it("14. função EXTINTA antes da data do ato é recusada — vigente NA DATA, não hoje", async () => {
    const c = await cenario();
    const { funcaoId } = await cadastrarFuncao(prisma, {
      codigo: "FG-VELHA", denominacao: "Funcao extinta",
      leiAutorizativa: "Lei 1/2000", dataPublicacaoLei: D(2000, 1, 1),
      dataExtincao: D(2020, 1, 1), leiExtincao: "Lei 5/2019", criadoPor: POR,
    });
    await expect(
      registrarMovimentacao(prisma, { vinculoId: c.vinculoId, tipo: "DESIGNACAO_FUNCAO", data: D(2023, 1, 1), motivo: "para funcao extinta", funcaoId, criadoPor: POR })
    ).rejects.toThrow(/FUNCAO-EXTINTA/);
  });
});
