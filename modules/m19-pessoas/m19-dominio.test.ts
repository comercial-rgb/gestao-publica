import { describe, expect, it } from "vitest";
import {
  documentoValido,
  formatarDocumento,
  normalizarDocumento,
  papeisVigentesEm,
  podeSerCredorEm,
  tipoPeloDocumento,
  versaoVigente,
  zAlterarPessoa,
  zCadastrarPessoa,
  type MovimentoParaDerivar,
} from "./dominio.js";

/**
 * M19 — o domínio PURO. Sem banco: são as regras que não dependem de I/O.
 *
 * ⚠️ OS DOCUMENTOS DESTE ARQUIVO SÃO SINTÉTICOS. Eles satisfazem o dígito verificador
 * porque é isso que o teste precisa exercitar; não pertencem a pessoa nenhuma.
 */

// DVs conferidos à mão pela própria aritmética da Receita.
const CPF_OK = "52998224725";
const CNPJ_OK = "11222333000181";

describe("M19 — o documento", () => {
  it("normaliza máscara: o mesmo documento não entra duas vezes", () => {
    expect(normalizarDocumento("529.982.247-25")).toBe(CPF_OK);
    expect(normalizarDocumento("11.222.333/0001-81")).toBe(CNPJ_OK);
  });

  it("aceita CPF e CNPJ com dígito verificador correto", () => {
    expect(documentoValido(CPF_OK)).toBe(true);
    expect(documentoValido(CNPJ_OK)).toBe(true);
    expect(documentoValido("529.982.247-25")).toBe(true);
  });

  it("RECUSA onze algarismos que não são um CPF", () => {
    // Um dígito trocado no final: o formato passa, o DV não.
    expect(documentoValido("52998224726")).toBe(false);
    expect(documentoValido("11222333000180")).toBe(false);
  });

  it("recusa repetição total — ela passa na aritmética e não é de ninguém", () => {
    expect(documentoValido("00000000000")).toBe(false);
    expect(documentoValido("11111111111")).toBe(false);
    expect(documentoValido("00000000000000")).toBe(false);
  });

  it("recusa comprimento que não é de documento nenhum", () => {
    expect(documentoValido("123")).toBe(false);
    expect(documentoValido("123456789012")).toBe(false);
    expect(documentoValido("")).toBe(false);
  });

  it("o tipo sai do documento — não de um campo que o usuário escolhe", () => {
    expect(tipoPeloDocumento(CPF_OK)).toBe("FISICA");
    expect(tipoPeloDocumento(CNPJ_OK)).toBe("JURIDICA");
    expect(tipoPeloDocumento("123")).toBeNull();
  });

  it("formata só para exibição — o guardado é sem máscara", () => {
    expect(formatarDocumento(CPF_OK)).toBe("529.982.247-25");
    expect(formatarDocumento(CNPJ_OK)).toBe("11.222.333/0001-81");
  });
});

describe("M19 — a entrada do cadastro", () => {
  const base = { nome: "Fornecedor de Teste", criadoPor: "m19@cg.pb.gov.br" };

  it("aceita um cadastro mínimo e devolve o documento normalizado", () => {
    const p = zCadastrarPessoa.parse({ ...base, documento: "529.982.247-25" });
    expect(p.documento).toBe(CPF_OK);
  });

  it("recusa documento com DV errado, nomeando o motivo", () => {
    expect(() =>
      zCadastrarPessoa.parse({ ...base, documento: "52998224726" })
    ).toThrow(/dígito verificador/i);
  });

  it("recusa nome vazio — credor sem nome é um CNPJ com saldo", () => {
    expect(() =>
      zCadastrarPessoa.parse({ ...base, nome: "  ", documento: CPF_OK })
    ).toThrow();
  });

  it("recusa nome fantasia em pessoa FÍSICA", () => {
    expect(() =>
      zCadastrarPessoa.parse({
        ...base,
        documento: CPF_OK,
        nomeFantasia: "Loja do Zé",
      })
    ).toThrow(/pessoa jurídica/i);
  });

  it("aceita nome fantasia em pessoa jurídica", () => {
    const p = zCadastrarPessoa.parse({
      ...base,
      documento: CNPJ_OK,
      nomeFantasia: "Loja do Zé",
    });
    expect(p.nomeFantasia).toBe("Loja do Zé");
  });

  it("a UF sobe em maiúscula e o CEP sem máscara", () => {
    const p = zCadastrarPessoa.parse({
      ...base,
      documento: CNPJ_OK,
      uf: "pb",
      cep: "58.400-000",
    });
    expect(p.uf).toBe("PB");
    expect(p.cep).toBe("58400000");
  });

  it("ALTERAR exige motivo — uma versão sem motivo é um carimbo", () => {
    expect(() =>
      zAlterarPessoa.parse({
        pessoaId: "p1",
        nome: "Fornecedor de Teste",
        ativa: true,
        motivo: "",
        criadoPor: "m19@cg.pb.gov.br",
      })
    ).toThrow();

    const ok = zAlterarPessoa.parse({
      pessoaId: "p1",
      nome: "Fornecedor de Teste",
      ativa: true,
      motivo: "correção de endereço",
      criadoPor: "m19@cg.pb.gov.br",
    });
    expect(ok.motivo).toBe("correção de endereço");
  });
});

describe("M19 — o estado é derivado do histórico", () => {
  it("a versão vigente é a mais recente", () => {
    const v = versaoVigente([
      { criadoEm: new Date("2026-01-01"), ativa: true },
      { criadoEm: new Date("2026-03-01"), ativa: false },
      { criadoEm: new Date("2026-02-01"), ativa: true },
    ]);
    expect(v?.ativa).toBe(false);
  });

  it("pessoa sem versão nenhuma devolve null — nunca um objeto inventado", () => {
    expect(versaoVigente([])).toBeNull();
  });

  function mov(
    papel: MovimentoParaDerivar["papel"],
    movimento: MovimentoParaDerivar["movimento"],
    data: string,
    criadoEm = data
  ): MovimentoParaDerivar {
    return {
      papel,
      movimento,
      data: new Date(data),
      criadoEm: new Date(criadoEm),
    };
  }

  it("papel concedido e não encerrado está vigente", () => {
    expect(
      papeisVigentesEm([mov("CREDOR", "CONCEDIDO", "2026-01-10")], new Date("2026-06-01"))
    ).toEqual(["CREDOR"]);
  });

  it("papel encerrado sai — e o histórico dele permanece", () => {
    const movimentos = [
      mov("CREDOR", "CONCEDIDO", "2026-01-10"),
      mov("CREDOR", "ENCERRADO", "2026-04-10"),
    ];
    expect(papeisVigentesEm(movimentos, new Date("2026-06-01"))).toEqual([]);
    // ...e antes do encerramento ele estava vigente. O passado não é reescrito.
    expect(papeisVigentesEm(movimentos, new Date("2026-02-01"))).toEqual(["CREDOR"]);
  });

  it("conceder de novo depois de encerrar volta a valer", () => {
    expect(
      papeisVigentesEm(
        [
          mov("CREDOR", "CONCEDIDO", "2026-01-10"),
          mov("CREDOR", "ENCERRADO", "2026-04-10"),
          mov("CREDOR", "CONCEDIDO", "2026-07-10"),
        ],
        new Date("2026-08-01")
      )
    ).toEqual(["CREDOR"]);
  });

  it("dois movimentos na MESMA data: decide o registrado por último", () => {
    // Concedeu por engano e encerrou no mesmo dia — o corte é `data`, o desempate
    // é `criadoEm`.
    expect(
      papeisVigentesEm(
        [
          mov("CREDOR", "CONCEDIDO", "2026-01-10", "2026-01-10T09:00:00Z"),
          mov("CREDOR", "ENCERRADO", "2026-01-10", "2026-01-10T15:00:00Z"),
        ],
        new Date("2026-06-01")
      )
    ).toEqual([]);
  });

  it("movimento com data FUTURA não vale hoje", () => {
    expect(
      papeisVigentesEm(
        [mov("CREDOR", "CONCEDIDO", "2027-01-10")],
        new Date("2026-06-01")
      )
    ).toEqual([]);
  });

  it("papéis são independentes entre si", () => {
    expect(
      papeisVigentesEm(
        [
          mov("CREDOR", "CONCEDIDO", "2026-01-10"),
          mov("SERVIDOR", "CONCEDIDO", "2026-02-10"),
          mov("CREDOR", "ENCERRADO", "2026-03-10"),
        ],
        new Date("2026-06-01")
      )
    ).toEqual(["SERVIDOR"]);
  });

  it("SERVIDOR não faz de ninguém um credor", () => {
    const movimentos = [mov("SERVIDOR", "CONCEDIDO", "2026-01-10")];
    expect(podeSerCredorEm(movimentos, new Date("2026-06-01"))).toBe(false);

    expect(
      podeSerCredorEm(
        [...movimentos, mov("CREDOR", "CONCEDIDO", "2026-02-10")],
        new Date("2026-06-01")
      )
    ).toBe(true);
  });
});
