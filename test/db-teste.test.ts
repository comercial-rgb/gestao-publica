import { describe, expect, it } from "vitest";
import { alvoDoBanco, mesmoAlvo, urlDoBancoDeTeste } from "./db-teste.js";

const DEV = "postgresql://siafic:siafic@localhost:5432/siafic_cg?schema=public";
const TESTE =
  "postgresql://siafic:siafic@localhost:5432/siafic_cg_test?schema=public";

describe("guarda-chuva do banco de teste", () => {
  it("ABORTA se DATABASE_URL_TEST não está definida", () => {
    expect(() => urlDoBancoDeTeste({ DATABASE_URL: DEV })).toThrow(
      /DATABASE_URL_TEST não está definida/
    );
  });

  it("ABORTA se DATABASE_URL_TEST está vazia", () => {
    expect(() =>
      urlDoBancoDeTeste({ DATABASE_URL: DEV, DATABASE_URL_TEST: "   " })
    ).toThrow(/DATABASE_URL_TEST não está definida/);
  });

  it("ABORTA se DATABASE_URL_TEST aponta para o MESMO banco que DATABASE_URL", () => {
    expect(() =>
      urlDoBancoDeTeste({ DATABASE_URL: DEV, DATABASE_URL_TEST: DEV })
    ).toThrow(/MESMO banco/);
  });

  it("ABORTA mesmo se as URLs diferem só na ORDEM dos parâmetros", () => {
    // mesmo alvo, escrito diferente — o guarda-chuva compara o ALVO, não a string
    const mesmoBancoOutraString =
      "postgresql://siafic:siafic@LOCALHOST:5432/siafic_cg?schema=public&connect_timeout=5";
    expect(() =>
      urlDoBancoDeTeste({
        DATABASE_URL: DEV,
        DATABASE_URL_TEST: mesmoBancoOutraString,
      })
    ).toThrow(/MESMO banco/);
  });

  it("ACEITA quando o database é diferente", () => {
    expect(
      urlDoBancoDeTeste({ DATABASE_URL: DEV, DATABASE_URL_TEST: TESTE })
    ).toBe(TESTE);
  });

  it("ACEITA quando só o SCHEMA difere (isolamento válido no Postgres)", () => {
    const outroSchema =
      "postgresql://siafic:siafic@localhost:5432/siafic_cg?schema=test";
    expect(
      urlDoBancoDeTeste({ DATABASE_URL: DEV, DATABASE_URL_TEST: outroSchema })
    ).toBe(outroSchema);
  });
});

describe("alvoDoBanco", () => {
  it("normaliza host, porta, database e schema", () => {
    expect(alvoDoBanco(DEV)).toEqual({
      host: "localhost",
      porta: "5432",
      database: "siafic_cg",
      schema: "public",
    });
  });

  it("assume porta 5432 e schema public quando omitidos", () => {
    expect(alvoDoBanco("postgresql://u:p@db.example.com/siafic")).toEqual({
      host: "db.example.com",
      porta: "5432",
      database: "siafic",
      schema: "public",
    });
  });

  it("REJEITA connection string inválida (fail-closed)", () => {
    expect(() => alvoDoBanco("não é uma url")).toThrow(/inválida/);
  });
});

describe("mesmoAlvo", () => {
  it("host/porta/database/schema iguais => mesmo alvo", () => {
    expect(mesmoAlvo(DEV, DEV)).toBe(true);
  });

  it("database diferente => alvos diferentes", () => {
    expect(mesmoAlvo(DEV, TESTE)).toBe(false);
  });

  it("porta diferente => alvos diferentes", () => {
    expect(
      mesmoAlvo(DEV, DEV.replace(":5432", ":5433"))
    ).toBe(false);
  });
});
