import { describe, expect, it } from "vitest";
import { ACOES_DA_CARTA_DE_SERVICOS, ATUALIZACOES, derivarCartaDeServicos } from "./atualizacoes-de-permissoes.js";

/**
 * A v15 CONCEDE CONFIGURAR A CARTA, REGISTRAR REPRESENTAÇÃO E A LEITURA A QUEM ADMINISTRA — e
 * deliberadamente NÃO concede pedir nem decidir. A omissão é a regra: uma derivação "generosa" faria a
 * instalação nascer com a mesma conta protocolando e decidindo o próprio pedido.
 */
const perfis = [
  { id: "adm", nome: "ADMINISTRADOR", permissoes: [{ acao: "CONCEDER_ACAO_A_PERFIL", unidadeOrcId: null }] },
  { id: "adm-ug", nome: "ADMIN DE UMA UG", permissoes: [{ acao: "CONCEDER_ACAO_A_PERFIL", unidadeOrcId: "uo-1" }] },
  { id: "ja", nome: "JA TEM", permissoes: [{ acao: "CONCEDER_ACAO_A_PERFIL", unidadeOrcId: null }, { acao: "REGISTRAR_REPRESENTACAO", unidadeOrcId: null }] },
  { id: "protocolo", nome: "PROTOCOLO", permissoes: [{ acao: "ABRIR_PROCESSO", unidadeOrcId: null }] },
];

describe("v15 — carta de serviços", () => {
  it("só quem administra no global recebe; só as três; o que já tem não duplica", () => {
    const d = derivarCartaDeServicos(perfis, {} as never);
    expect(d.map((c) => `${c.perfilId}:${c.acao}`).sort()).toEqual([
      "adm:CONFIGURAR_CARTA_DE_SERVICOS",
      "adm:CONSULTAR_MEUS_SERVICOS",
      "adm:REGISTRAR_REPRESENTACAO",
      "ja:CONFIGURAR_CARTA_DE_SERVICOS",
      "ja:CONSULTAR_MEUS_SERVICOS",
    ]);
  });

  it("pedir e decidir NUNCA saem da derivação", () => {
    const d = derivarCartaDeServicos(perfis, {} as never);
    expect(d.some((c) => c.acao === "SOLICITAR_SERVICO" || c.acao === "DECIDIR_SOLICITACAO_DE_SERVICO")).toBe(false);
    expect(ACOES_DA_CARTA_DE_SERVICOS).not.toContain("SOLICITAR_SERVICO");
    expect(ACOES_DA_CARTA_DE_SERVICOS).not.toContain("DECIDIR_SOLICITACAO_DE_SERVICO");
  });

  it("é a versão 15, a última, depois dos encargos", () => {
    expect(ATUALIZACOES.map((a) => a.versao).slice(-2)).toEqual([14, 15]);
  });
});
