import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { apagarLicenciamentoDeTeste } from "./licenciamento-teste.js";
import { ID_DO_ENTE_UNICO } from "../modules/m01-core-contabil/contexto-do-ente.js";
import { TODAS_AS_ACOES } from "../modules/m16-travamento/acoes.js";
import {
  LicenciamentoNaoInstaladoError,
  ModuloNaoHabilitadoError,
  ehRecusaDeLicenca,
  exigirModuloParaEscrita,
  exigirModuloParaLeitura,
  moduloDoRotuloDaBorda,
  situacoesDosModulos,
} from "../lib/portas/licenciamento.js";
import {
  habilitarModuloContratado,
  registrarContratoComercial,
  suspenderModuloContratado,
} from "../modules/m35-licenciamento/servico.js";

/**
 * ═══ O GATE NA BORDA (V10 T1 · N6.1) ═══
 *
 * ⚠️ AQUI SE AFIRMA O EFEITO, não a papelada. Três guards deste repositório já ficaram verdes
 * por casarem com o comentário que explicava a exclusão. O que estes testes exercitam são as
 * funções que o funil de escrita e a política de leitura CHAMAM — e um teste de fonte, ao
 * final, afirma que os dois funis as chamam, porque essa parte não é exercitável sem request.
 *
 * ⚠️ E AS TRÊS RECUSAS SÃO DE CLASSES DIFERENTES: banco fora, licenciamento não instalado e
 * módulo não habilitado pedem providências diferentes (suporte técnico, instalação, comercial).
 * Confundi-las manda o município para a fila errada.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => prisma.$disconnect());

const OPERADOR = "u";
const RAIZ = fileURLToPath(new URL("..", import.meta.url));

beforeEach(async () => {
  await limparBanco(prisma);
  // ⚠️ O contrato das fixtures sai: aqui o assunto É o gate, e cada caso monta o seu estado.
  await apagarLicenciamentoDeTeste(prisma);
});

describe("G1 — sem contrato nenhum, o gate fecha NOMEANDO o comando que resolve", () => {
  it("escrita e leitura de módulo licenciável recusam com LicenciamentoNaoInstaladoError", async () => {
    await expect(exigirModuloParaEscrita("EMPENHAR")).rejects.toBeInstanceOf(LicenciamentoNaoInstaladoError);
    await expect(exigirModuloParaLeitura("CONSULTAR_DESPESA")).rejects.toBeInstanceOf(
      LicenciamentoNaoInstaladoError
    );
    // ⚠️ E A MENSAGEM NOMEIA A PROVIDÊNCIA. "Fechado e acionável" não é "fechado em silêncio".
    await expect(exigirModuloParaEscrita("EMPENHAR")).rejects.toThrow(/licenciamento:instalar/);
  });

  it("⚠️ a PLATAFORMA continua aberta — o município não perde a administração dos próprios usuários", async () => {
    await expect(exigirModuloParaEscrita("CRIAR_USUARIO")).resolves.toBeUndefined();
    await expect(exigirModuloParaEscrita("CADASTRAR_PESSOA")).resolves.toBeUndefined();
    await expect(exigirModuloParaLeitura("CONSULTAR_ADMINISTRACAO")).resolves.toBeUndefined();
    await expect(exigirModuloParaLeitura("CONSULTAR_CADASTROS")).resolves.toBeUndefined();
  });
});

describe("G2 — com contrato, o gate segue a situação de cada módulo", () => {
  async function contrato(): Promise<string> {
    const r = await registrarContratoComercial(prisma, {
      enteId: ID_DO_ENTE_UNICO,
      numero: "CT-GATE",
      cliente: "Município",
      inicio: "2020-01-01",
      fim: null,
      observacao: null,
      demonstracao: true,
      criadoPor: OPERADOR,
    });
    await habilitarModuloContratado(prisma, {
      contratoId: r.contratoId,
      modulo: "NUCLEO_CONTABIL",
      inicio: "2020-01-01",
      fim: null,
      motivo: "Contratado no instrumento original.",
      criadoPor: OPERADOR,
    });
    return r.contratoId;
  }

  it("contratado: escreve e lê. Não contratado: recusa nos DOIS", async () => {
    await contrato();
    await expect(exigirModuloParaEscrita("EMPENHAR")).resolves.toBeUndefined();
    await expect(exigirModuloParaLeitura("CONSULTAR_DESPESA")).resolves.toBeUndefined();

    // ⚠️ FIXTURE N=2: dois módulos não contratados, e dois pares (escrita, leitura).
    await expect(exigirModuloParaEscrita("CALCULAR_FOLHA")).rejects.toBeInstanceOf(ModuloNaoHabilitadoError);
    await expect(exigirModuloParaLeitura("CONSULTAR_FOLHA")).rejects.toBeInstanceOf(ModuloNaoHabilitadoError);
    await expect(exigirModuloParaEscrita("CADASTRAR_CONTRATO")).rejects.toBeInstanceOf(ModuloNaoHabilitadoError);
    await expect(exigirModuloParaLeitura("CONSULTAR_LICITACOES")).rejects.toBeInstanceOf(ModuloNaoHabilitadoError);
  });

  it("⚠️ SUSPENSO bloqueia a escrita e DEIXA a leitura passar", async () => {
    const contratoId = await contrato();
    await suspenderModuloContratado(
      prisma,
      { contratoId, modulo: "NUCLEO_CONTABIL", motivo: "Suspensão comercial." , criadoPor: OPERADOR },
      () => new Date()
    );
    await expect(exigirModuloParaEscrita("EMPENHAR")).rejects.toThrow(/MÓDULO SUSPENSO/);
    // A consulta ao que já foi escriturado continua: é obrigação do ente, não cortesia nossa.
    await expect(exigirModuloParaLeitura("CONSULTAR_DESPESA")).resolves.toBeUndefined();
  });

  it("a recusa diz QUEM resolve, e não 'acesso negado'", async () => {
    await contrato();
    await expect(exigirModuloParaEscrita("CALCULAR_FOLHA")).rejects.toThrow(/MÓDULO NÃO CONTRATADO/);
    await expect(exigirModuloParaEscrita("CALCULAR_FOLHA")).rejects.toThrow(
      /NÃO é falta de permissão do seu usuário/
    );
  });

  it("as situações de todos os módulos saem numa consulta — o insumo do menu", async () => {
    await contrato();
    const mapa = await situacoesDosModulos();
    expect(mapa.get("NUCLEO_CONTABIL")).toBe("HABILITADO");
    expect(mapa.get("PESSOAL_E_FOLHA")).toBe("NAO_CONTRATADO");
    expect(mapa.has("PLATAFORMA")).toBe(false); // não é licenciável: não entra no mapa.
  });

  it("ehRecusaDeLicenca separa a recusa comercial do resto", async () => {
    await contrato();
    const erro = await exigirModuloParaEscrita("CALCULAR_FOLHA").catch((e: unknown) => e);
    expect(ehRecusaDeLicenca(erro)).toBe(true);
    expect(ehRecusaDeLicenca(new Error("qualquer outra coisa"))).toBe(false);
  });
});

describe("G3 — nenhum rótulo de escrita fica sem classificação", () => {
  it("toda ação do censo tem módulo comercial", () => {
    for (const a of TODAS_AS_ACOES) expect(() => moduloDoRotuloDaBorda(a)).not.toThrow();
  });

  it("⚠️ um rótulo desconhecido ESTOURA em vez de virar 'plataforma'", () => {
    // Devolver PLATAFORMA para o desconhecido seria a gaveta de sobra: a ação que ninguém
    // classificou passaria calada, de graça, para sempre.
    expect(() => moduloDoRotuloDaBorda("INVENTAR_COISA")).toThrow(/NÃO CLASSIFICADO/);
  });

  it("o rótulo de envelope declarado é plataforma, e a lista é fechada", () => {
    expect(moduloDoRotuloDaBorda("APLICAR_ATUALIZACAO_DE_PERMISSOES")).toBe("PLATAFORMA");
  });

  /**
   * ⚠️ ESTE É UM TESTE DE FONTE, e ele sabe do próprio limite. O que ele afirma é que os DOIS
   * funis chamam o gate — e isso não é exercitável aqui porque `comEscritaAutenticada` e
   * `telaExige...` leem cookies e cabeçalhos do request, que não existem fora dele.
   *
   * A prova de EFEITO dos dois funis é o percurso de navegador
   * (`scripts/smoke-licenciamento.ts`): módulo suspenso pela tela do fornecedor, e a tela
   * municipal recusando o ato com a mensagem certa.
   */
  it("o funil de escrita e a política de leitura chamam o gate", () => {
    const sessao = readFileSync(`${RAIZ}lib/portas/sessao.ts`, "utf8");
    const leitura = readFileSync(`${RAIZ}lib/portas/leitura.ts`, "utf8");
    expect(sessao).toContain("await exigirModuloParaEscrita(acao);");
    expect(leitura).toContain("await exigirModuloParaLeitura(acao);");

    // E o gate da escrita vem ANTES do ato: a guarda depois do efeito colateral é o defeito
    // que este repositório já nomeou ("efeito antes da guarda envenena a tentativa seguinte").
    const iGate = sessao.indexOf("await exigirModuloParaEscrita(acao);");
    const iAto = sessao.indexOf("() => ato(ident.identificador)");
    expect(iGate).toBeGreaterThan(0);
    expect(iGate).toBeLessThan(iAto);
  });
});
