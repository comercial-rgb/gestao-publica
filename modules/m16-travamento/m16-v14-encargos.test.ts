import { describe, expect, it } from "vitest";
import { ACOES_DOS_ENCARGOS_DA_FOLHA, ACOES_SEGREGADAS_DOS_ENCARGOS, ATUALIZACOES, derivarEncargosDaFolha } from "./atualizacoes-de-permissoes.js";

/**
 * A v14 CONCEDE CADASTRAR E APURAR OS ENCARGOS A QUEM ADMINISTRA — e deliberadamente NÃO concede
 * aprovar o parâmetro nem certificar a apuração. A omissão é a regra, e este teste a prende: uma
 * derivação "generosa" faria a instalação nascer com quem digita a alíquota podendo aprová-la.
 */
const perfis = [
  { id: "adm", nome: "ADMINISTRADOR", permissoes: [{ acao: "CONCEDER_ACAO_A_PERFIL", unidadeOrcId: null }] },
  { id: "adm-ug", nome: "ADMIN DE UMA UG", permissoes: [{ acao: "CONCEDER_ACAO_A_PERFIL", unidadeOrcId: "uo-1" }] },
  { id: "ja", nome: "JA TEM", permissoes: [{ acao: "CONCEDER_ACAO_A_PERFIL", unidadeOrcId: null }, { acao: "APURAR_ENCARGOS_DA_FOLHA", unidadeOrcId: null }] },
  { id: "rh", nome: "RH", permissoes: [{ acao: "CALCULAR_FOLHA", unidadeOrcId: null }] },
];

describe("v14 — encargos da folha", () => {
  it("só quem administra no global recebe; só as duas; o que já tem não duplica", () => {
    const d = derivarEncargosDaFolha(perfis, {} as never);
    expect(d.map((c) => `${c.perfilId}:${c.acao}`).sort()).toEqual(["adm:APURAR_ENCARGOS_DA_FOLHA", "adm:CADASTRAR_ENCARGO_DA_FOLHA", "ja:CADASTRAR_ENCARGO_DA_FOLHA"]);
  });

  it("aprovar e certificar NUNCA saem da derivação", () => {
    const d = derivarEncargosDaFolha(perfis, {} as never);
    expect(d.some((c) => ACOES_SEGREGADAS_DOS_ENCARGOS.includes(c.acao))).toBe(false);
    expect(ACOES_DOS_ENCARGOS_DA_FOLHA.some((a) => ACOES_SEGREGADAS_DOS_ENCARGOS.includes(a))).toBe(false);
  });

  it("é a versão 14, depois do atesto da folha", () => {
    const versoes = ATUALIZACOES.map((a) => a.versao);
    expect(versoes.slice(versoes.indexOf(13), versoes.indexOf(13) + 2)).toEqual([13, 14]);
  });
});
