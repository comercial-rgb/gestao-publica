import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { diaCivil, inicioDoDiaCivil } from "../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { vincularPessoaAoUsuario } from "../modules/m16-travamento/servico-pessoa-do-usuario.js";
import {
  alcanceNoContrato,
  contratosNoAlcanceDaFiscalizacao,
  decidirAlcance,
  definirAdministradorDaFiscalizacao,
  revogarAdministradorDaFiscalizacao,
} from "../modules/m11-licitacoes/acesso-da-fiscalizacao.js";
import { acompanhamentoDoContrato, designarNoContrato, registrarOcorrencia, revogarDesignacaoNoContrato } from "../modules/m11-licitacoes/fiscalizacao.js";

/**
 * ═══ QUEM ALCANÇA O CONTRATO, E EM QUAL PROJEÇÃO (V7 M2 U0.1 — AC01 a AC06) ═══
 *
 * Resultado esperado DEFINIDO ANTES do código, pelo critério de aceite:
 *   AC01 — o fiscal designado alcança a fiscalização do contrato; outra conta com as MESMAS ações e sem designação não;
 *   AC02 — permissão GLOBAL de outra área (empenhar, liquidar, ler licitações) não é administração da fiscalização:
 *          dá a projeção financeira, e a financeira não lê agenda nem ocorrência;
 *   AC03 — quem tem o poder de DEFINIR administrador não alcança por isso; definido (com ato), alcança qualquer
 *          contrato; revogado com efeito hoje, deixa de alcançar;
 *   AC04 — o operador financeiro sem designação recebe a projeção financeira, sem ocorrência;
 *   AC06 — designação revogada entre a tela e o comando: o servidor recusa, e nenhuma linha nem arquivo é gravado.
 *   E a segregação do recebedor definitivo com o fiscal, nos dois sentidos.
 * Contratos N=2 (A e B) para que "todos" e "só o meu" sejam distinguíveis.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const ADMIN = "plataforma.admin@teste.local";
const FISCAL = "fiscal.a@teste.local";
const OUTRO = "fiscal.nao.designado@teste.local";
const FINANCEIRO = "tesouraria@teste.local";
const RECEBEDOR = "recebedor@teste.local";
const dia = (d: number): string => diaCivil(new Date(Date.now() + d * 86_400_000));
const HOJE = dia(0);

async function conta(identificador: string, acoes: readonly string[], documento?: string): Promise<void> {
  const p = await prisma.perfil.create({ data: { nome: `P-${identificador}`, descricao: "teste", criadoPor: "SEED", permissoes: { create: acoes.map((acao) => ({ acao: acao as never, criadoPor: "SEED" })) } }, select: { id: true } });
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "SEED" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
  if (documento !== undefined) {
    await prisma.pessoa.create({ data: { documento, tipo: "FISICA", criadoPor: "SEED", versoes: { create: { nome: identificador, criadoPor: "SEED" } } } });
    await vincularPessoaAoUsuario(prisma, { usuarioId: u.id, documento, motivo: "Conferido pelo documento.", criadoPor: "SEED" });
  }
}

const ATOS_DO_FISCAL = ["REGISTRAR_OCORRENCIA_DE_FISCALIZACAO", "REGISTRAR_MEDICAO_DE_OBRA", "CONSULTAR_LICITACOES"];
let fiscalA = "";

beforeEach(async () => {
  await limparBanco(prisma);
  // A conta da plataforma tem ações de TODAS as áreas pedidas, inclusive o poder de definir — e nenhuma designação.
  await conta(ADMIN, ["DESIGNAR_NO_CONTRATO", "DEFINIR_ADMINISTRADOR_DA_FISCALIZACAO", "CONSULTAR_LICITACOES", "EMPENHAR", "LIQUIDAR", "PAGAR", "CONCEDER_ACAO_A_PERFIL"], "11144477735");
  await conta(FISCAL, ATOS_DO_FISCAL, "52998224725");
  await conta(OUTRO, ATOS_DO_FISCAL, "39053344705");
  await conta(FINANCEIRO, ["LIQUIDAR"]);
  await conta(RECEBEDOR, ["CONSULTAR_LICITACOES"], "86288366757");
  await prisma.processoLicitatorio.create({ data: { id: "proc", numeroProcesso: "2026/0300", modalidade: "PREGAO_ELETRONICO", objeto: "Serviços", valorLicitado: "10000.00", criadoPor: "SEED" } });
  for (const [id, numero] of [["ctr-a", "CT-A"], ["ctr-b", "CT-B"]] as const) {
    await prisma.contrato.create({ data: { id, numeroContrato: numero, processoId: "proc", contratadoDocumento: "12345678000199", contratadoNome: "Serviços Beta", valorInicial: "2000.00", vigenciaInicio: new Date(`${dia(-100)}T15:00:00Z`), vigenciaFimInicial: new Date(`${dia(100)}T15:00:00Z`), categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: "SEED" } });
  }
  fiscalA = (await designarNoContrato(prisma, { contratoId: "ctr-a", papel: "FISCAL", usuarioIdentificador: FISCAL, atoDesignacao: "Portaria 31/2026", vigenciaInicio: dia(-30), criadoPor: ADMIN })).designacaoId;
  await registrarOcorrencia(prisma, { contratoId: "ctr-a", data: dia(-2), tipo: "NAO_CONFORMIDADE", descricao: "Relato interno de fiscalização que não é público", encaminhamento: "NENHUM", criadoPor: FISCAL });
}, 120_000);

describe("a decisão pura (provada por mutação: ver o checkpoint)", () => {
  const vig = (ini: number, fim: number | null, rev: number | null) => ({ vigenciaInicio: inicioDoDiaCivil(dia(ini)), vigenciaFim: fim === null ? null : inicioDoDiaCivil(dia(fim)), revogacao: rev === null ? null : { dataEfeito: inicioDoDiaCivil(dia(rev)) } });
  const agora = new Date();
  it("designação vigente dá fiscalização; revogada com efeito hoje não; administrador vigente dá; vencido não; conta inativa nada", () => {
    expect(decidirAlcance({ ativo: true, designacoes: [{ ...vig(-5, null, null), papel: "FISCAL" }], administracoes: [], acaoFinanceira: false }, agora)).toMatchObject({ fiscalizacao: true, codigo: "DESIGNADO-NO-CONTRATO", papeis: ["FISCAL"], financeira: false });
    expect(decidirAlcance({ ativo: true, designacoes: [{ ...vig(-5, null, 0), papel: "FISCAL" }], administracoes: [], acaoFinanceira: true }, agora)).toMatchObject({ fiscalizacao: false, codigo: "SEM-DESIGNACAO-VIGENTE", financeira: true });
    expect(decidirAlcance({ ativo: true, designacoes: [], administracoes: [vig(-5, 5, null)], acaoFinanceira: false }, agora)).toMatchObject({ fiscalizacao: true, codigo: "ADMINISTRADOR-DA-FISCALIZACAO" });
    expect(decidirAlcance({ ativo: true, designacoes: [], administracoes: [vig(-50, -1, null)], acaoFinanceira: false }, agora)).toMatchObject({ fiscalizacao: false, codigo: "SEM-DESIGNACAO-VIGENTE" });
    expect(decidirAlcance({ ativo: false, designacoes: [{ ...vig(-5, null, null), papel: "GESTOR" }], administracoes: [vig(-5, null, null)], acaoFinanceira: true }, agora)).toMatchObject({ fiscalizacao: false, financeira: false, codigo: "USUARIO-INATIVO" });
  });
});

describe("as projeções no banco", () => {
  it("AC01: o fiscal designado alcança; outra conta com as mesmas ações e sem designação só recebe a financeira", async () => {
    expect(await alcanceNoContrato(prisma, FISCAL, "ctr-a")).toMatchObject({ fiscalizacao: true, papeis: ["FISCAL"] });
    const outro = await alcanceNoContrato(prisma, OUTRO, "ctr-a");
    expect(outro).toMatchObject({ fiscalizacao: false, financeira: true, codigo: "SEM-DESIGNACAO-VIGENTE" });
    expect(outro.motivo).toMatch(/designado nele/);
    // O fiscal de A não alcança B.
    expect((await alcanceNoContrato(prisma, FISCAL, "ctr-b")).fiscalizacao).toBe(false);
    expect(await contratosNoAlcanceDaFiscalizacao(prisma, FISCAL)).toEqual({ todos: false, ids: ["ctr-a"] });
    expect(await contratosNoAlcanceDaFiscalizacao(prisma, OUTRO)).toEqual({ todos: false, ids: [] });
  });

  it("AC02/AC04: permissão global de outra área e o operador financeiro recebem a projeção FINANCEIRA — e ela não lê agenda nem ocorrência", async () => {
    expect(await alcanceNoContrato(prisma, ADMIN, "ctr-a")).toMatchObject({ fiscalizacao: false, financeira: true, codigo: "SEM-DESIGNACAO-VIGENTE" });
    expect(await alcanceNoContrato(prisma, FINANCEIRO, "ctr-a")).toMatchObject({ fiscalizacao: false, financeira: true });
    const financeira = await acompanhamentoDoContrato(prisma, "ctr-a", "FINANCEIRA");
    expect(financeira?.visao).toBe("FINANCEIRA");
    expect(financeira?.ocorrencias).toEqual([]);
    expect(financeira?.ordens).toEqual([]);
    expect(JSON.stringify(financeira)).not.toContain("Relato interno");
    // A de fiscalização lê a mesma ocorrência — a diferença não é "não havia".
    expect((await acompanhamentoDoContrato(prisma, "ctr-a", "FISCALIZACAO"))?.ocorrencias).toHaveLength(1);
  });

  it("AC03: o poder de DEFINIR não dá alcance; definido, alcança os dois contratos; revogado hoje, deixa de alcançar", async () => {
    expect((await alcanceNoContrato(prisma, ADMIN, "ctr-b")).fiscalizacao).toBe(false);
    // Sem o poder de definir, a recusa nomeia a ação.
    await expect(definirAdministradorDaFiscalizacao(prisma, { usuarioIdentificador: FISCAL, atoDesignacao: "Portaria 40/2026", vigenciaInicio: HOJE, criadoPor: FISCAL })).rejects.toThrow(/DEFINIR_ADMINISTRADOR_DA_FISCALIZACAO/);
    // Conta sem pessoa vinculada não é definida.
    await expect(definirAdministradorDaFiscalizacao(prisma, { usuarioIdentificador: FINANCEIRO, atoDesignacao: "Portaria 41/2026", vigenciaInicio: HOJE, criadoPor: ADMIN })).rejects.toThrow(/USUARIO-SEM-PESSOA/);
    const def = await definirAdministradorDaFiscalizacao(prisma, { usuarioIdentificador: ADMIN, atoDesignacao: "Portaria 42/2026", vigenciaInicio: HOJE, criadoPor: ADMIN });
    expect(await alcanceNoContrato(prisma, ADMIN, "ctr-a")).toMatchObject({ fiscalizacao: true, codigo: "ADMINISTRADOR-DA-FISCALIZACAO" });
    expect((await alcanceNoContrato(prisma, ADMIN, "ctr-b")).fiscalizacao).toBe(true);
    expect(await contratosNoAlcanceDaFiscalizacao(prisma, ADMIN)).toEqual({ todos: true, ids: [] });
    await revogarAdministradorDaFiscalizacao(prisma, { administradorId: def.administradorId, dataEfeito: HOJE, motivo: "Encerrada a função", criadoPor: ADMIN });
    await expect(revogarAdministradorDaFiscalizacao(prisma, { administradorId: def.administradorId, dataEfeito: HOJE, motivo: "Segunda revogação", criadoPor: ADMIN })).rejects.toThrow(/DEFINICAO-JA-REVOGADA/);
    expect((await alcanceNoContrato(prisma, ADMIN, "ctr-b")).fiscalizacao).toBe(false);
    // O fato continua: a definição e a revogação existem.
    expect(await prisma.administradorDaFiscalizacao.count()).toBe(1);
    expect(await prisma.revogacaoDeAdministradorDaFiscalizacao.count()).toBe(1);
  });

  it("AC06: revogada a designação depois de a tela abrir, o comando recusa — nenhuma ocorrência, nenhum anexo", async () => {
    const telaAberta = await alcanceNoContrato(prisma, FISCAL, "ctr-a");
    expect(telaAberta.fiscalizacao).toBe(true);
    await revogarDesignacaoNoContrato(prisma, { designacaoId: fiscalA, dataEfeito: HOJE, motivo: "Substituído por outro servidor", criadoPor: ADMIN });
    const [ocorrencias, anexos] = [await prisma.ocorrenciaDeFiscalizacao.count(), await prisma.anexo.count()];
    await expect(
      registrarOcorrencia(prisma, { contratoId: "ctr-a", data: HOJE, tipo: "OUTRO", descricao: "Tentativa com a tela aberta antes da revogação", encaminhamento: "NENHUM", evidencias: [{ nomeOriginal: "foto.png", mimeType: "image/png", conteudo: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7]) }], criadoPor: FISCAL })
    ).rejects.toThrow(/SEM-DESIGNACAO-DE-FISCAL/);
    expect(await prisma.ocorrenciaDeFiscalizacao.count()).toBe(ocorrencias);
    expect(await prisma.anexo.count()).toBe(anexos);
    expect((await alcanceNoContrato(prisma, FISCAL, "ctr-a")).fiscalizacao).toBe(false);
    // Nem backdating recupera o poder: o ato exige a designação vigente no dia do fato E hoje.
    await expect(registrarOcorrencia(prisma, { contratoId: "ctr-a", data: dia(-5), tipo: "OUTRO", descricao: "Registro com data anterior à revogação", encaminhamento: "NENHUM", criadoPor: FISCAL })).rejects.toThrow(/SEM-DESIGNACAO-DE-FISCAL/);
  });

  it("segregação: fiscal não vira recebedor definitivo do mesmo contrato, nem o contrário; recebedor com gestor é permitido", async () => {
    await expect(designarNoContrato(prisma, { contratoId: "ctr-a", papel: "RECEBEDOR_DEFINITIVO", usuarioIdentificador: FISCAL, atoDesignacao: "Portaria 50/2026", vigenciaInicio: HOJE, criadoPor: ADMIN })).rejects.toThrow(/ACUMULO-DE-FISCAL-E-RECEBEDOR/);
    await designarNoContrato(prisma, { contratoId: "ctr-a", papel: "RECEBEDOR_DEFINITIVO", usuarioIdentificador: RECEBEDOR, atoDesignacao: "Portaria 51/2026", vigenciaInicio: HOJE, criadoPor: ADMIN });
    await expect(designarNoContrato(prisma, { contratoId: "ctr-a", papel: "FISCAL", usuarioIdentificador: RECEBEDOR, atoDesignacao: "Portaria 52/2026", vigenciaInicio: HOJE, criadoPor: ADMIN })).rejects.toThrow(/ACUMULO-DE-FISCAL-E-RECEBEDOR/);
    await expect(designarNoContrato(prisma, { contratoId: "ctr-a", papel: "GESTOR", usuarioIdentificador: RECEBEDOR, atoDesignacao: "Portaria 53/2026", vigenciaInicio: HOJE, criadoPor: ADMIN })).resolves.toMatchObject({ designacaoId: expect.any(String) });
    expect(await alcanceNoContrato(prisma, RECEBEDOR, "ctr-a")).toMatchObject({ fiscalizacao: true, papeis: ["GESTOR", "RECEBEDOR_DEFINITIVO"] });
  });
});
