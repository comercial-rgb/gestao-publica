import { describe, expect, it } from "vitest";
import {
  AtoDeclaradoInvalidoError,
  conferirAtoDeclarado,
  rotuloDoAto,
  type AncoradouroDoAto,
  type AtoDeclarado,
} from "./ato-declarado.js";

/**
 * A RÉGUA DO ATO — testes PUROS, sem banco.
 *
 * ⚠️ ELA NASCE COM A PROVA DE QUE ACUSA, e nas duas direções: para cada conferência há um caso
 * que REPROVA e um que PASSA. Um instrumento só com casos vermelhos não prova que ele deixa
 * passar o legítimo; um só com verdes não prova que ele recusa coisa nenhuma. Já houve quatro
 * defeitos dentro de instrumentos de medição neste repositório.
 *
 * ⚠️ E O TESTE DE NEGAÇÃO AFIRMA O **MOTIVO**, não só "deu erro". "Não passou" é compatível com
 * a régua recusando pela razão errada — por exemplo, reprovando por aplicabilidade um ato cujo
 * problema real era o ano. É por isso que `AtoDeclaradoInvalidoError` carrega `motivo`.
 */

const HOJE = new Date("2026-09-23T12:00:00Z");

/** A entidade do cenário — uma autarquia com nome acentuado e CNPJ, de propósito. */
const NOME = "Fundação Municipal de Saúde";
const CNPJ = "12345678000199";

const ANCORA_ENTIDADE: readonly AncoradouroDoAto[] = [
  { rotulo: `o nome da entidade ("${NOME}")`, termos: [NOME] },
  { rotulo: `o CNPJ dela (${CNPJ})`, termos: [CNPJ] },
];

const BOM: AtoDeclarado = {
  atoTipo: "LEI",
  atoNumero: "1.234",
  atoAno: 2005,
  atoDispositivo: "art. 2º",
  atoCitacao:
    "Fica criada a Fundação Municipal de Saúde, entidade autárquica com personalidade " +
    "jurídica de direito público e patrimônio próprio.",
};

function motivoDe(fn: () => void): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof AtoDeclaradoInvalidoError) return e.motivo;
    return `OUTRO_ERRO: ${e instanceof Error ? e.message : String(e)}`;
  }
  return "NAO_RECUSOU";
}

describe("M01 — a régua do ato declarado", () => {
  it("t1: o ato bem formado e aplicável PASSA — a contraprova de todos os vermelhos abaixo", () => {
    // ⚠️ ESTE TESTE É O QUE DÁ SENTIDO AOS OUTROS. Uma régua que recusasse tudo passaria em
    // todos os casos de negação e seria inútil; é este verde que prova que ela mede.
    expect(() =>
      conferirAtoDeclarado(BOM, { hoje: HOJE, ancoradouros: ANCORA_ENTIDADE })
    ).not.toThrow();
  });

  it("t2: ano FUTURO é recusado, e o motivo é o ano — não a aplicabilidade", () => {
    expect(
      motivoDe(() =>
        conferirAtoDeclarado(
          { ...BOM, atoAno: 2027 },
          { hoje: HOJE, ancoradouros: ANCORA_ENTIDADE }
        )
      )
    ).toBe("ANO_FUTURO");
  });

  it("t2b: o ano é do ENTE, não do relógio — 2026 passa, e é a borda do t2", () => {
    // O ano civil do ente em 23/09/2026 é 2026. Um ato DESTE ano é legítimo; o de 2027 não.
    // A borda importa: uma régua com `<` no lugar de `<=` reprovaria todo ato do ano corrente.
    expect(() =>
      conferirAtoDeclarado({ ...BOM, atoAno: 2026 }, { hoje: HOJE, ancoradouros: ANCORA_ENTIDADE })
    ).not.toThrow();
  });

  it("t3: ano sem quatro dígitos é recusado pela FORMA", () => {
    expect(
      motivoDe(() =>
        conferirAtoDeclarado({ ...BOM, atoAno: 95 }, { hoje: HOJE, ancoradouros: ANCORA_ENTIDADE })
      )
    ).toBe("ANO_FORA_DE_FORMA");
  });

  it("t4: número sem dígito é recusado — ato sem número é ato que ninguém acha", () => {
    expect(
      motivoDe(() =>
        conferirAtoDeclarado(
          { ...BOM, atoNumero: "sem número" },
          { hoje: HOJE, ancoradouros: ANCORA_ENTIDADE }
        )
      )
    ).toBe("NUMERO_SEM_DIGITO");
  });

  it("t5: dispositivo que não nomeia dispositivo é recusado", () => {
    expect(
      motivoDe(() =>
        conferirAtoDeclarado(
          { ...BOM, atoDispositivo: "conforme a lei" },
          { hoje: HOJE, ancoradouros: ANCORA_ENTIDADE }
        )
      )
    ).toBe("DISPOSITIVO_SEM_FORMA");
  });

  it("t5b: o sinal § vale como dispositivo, e o inciso e o anexo também", () => {
    for (const dispositivo of ["§ 1º do art. 5º", "inciso II", "Anexo I", "caput"]) {
      expect(() =>
        conferirAtoDeclarado(
          { ...BOM, atoDispositivo: dispositivo },
          { hoje: HOJE, ancoradouros: ANCORA_ENTIDADE }
        )
      ).not.toThrow();
    }
  });

  it("t6: a citação que REPETE o rótulo do ato não cita nada", () => {
    // ⚠️ E REPARE NO COMPRIMENTO: "Lei 1.234/2005, art. 2º" tem 23 caracteres e passaria por um
    // `CHECK length >= 20` — que é exatamente o piso que este repositório usa nos outros
    // fundamentos. É este caso que mostra por que o piso de comprimento não mede nada.
    const rotulo = "Lei 1.234/2005, art. 2º";
    expect(rotulo.length).toBeGreaterThanOrEqual(20);
    expect(
      motivoDe(() =>
        conferirAtoDeclarado(
          { ...BOM, atoCitacao: rotulo },
          { hoje: HOJE, ancoradouros: ANCORA_ENTIDADE }
        )
      )
    ).toBe("CITACAO_E_O_PROPRIO_ROTULO");
  });

  it("t7: APLICABILIDADE — a citação longa que não fala da entidade é recusada", () => {
    // Texto real de lei, bem formado, com sobra de caracteres, e que não é sobre esta entidade.
    expect(
      motivoDe(() =>
        conferirAtoDeclarado(
          {
            ...BOM,
            atoCitacao:
              "Fica o Poder Executivo autorizado a abrir crédito adicional suplementar no " +
              "valor de R$ 250.000,00, observado o disposto na Lei de Diretrizes Orçamentárias.",
          },
          { hoje: HOJE, ancoradouros: ANCORA_ENTIDADE }
        )
      )
    ).toBe("ATO_NAO_TRATA_DO_OBJETO");
  });

  it("t7b: a citação que traz o CNPJ passa, mesmo COM máscara — casa por dígitos", () => {
    expect(() =>
      conferirAtoDeclarado(
        {
          ...BOM,
          atoCitacao:
            "A entidade inscrita no CNPJ 12.345.678/0001-99 passa a operar conta própria " +
            "para os recursos que lhe são vinculados.",
        },
        { hoje: HOJE, ancoradouros: ANCORA_ENTIDADE }
      )
    ).not.toThrow();
  });

  it("t7c: NORMALIZAÇÃO — caixa, acento e cedilha não reprovam", () => {
    // ⚠️ Sem normalizar, a régua reprovaria por cedilha e viraria teatro: o operador copiaria o
    // texto certo do ato, levaria recusa, e aprenderia a contornar o campo.
    expect(() =>
      conferirAtoDeclarado(
        {
          ...BOM,
          atoCitacao:
            "FICA CRIADA A FUNDACAO MUNICIPAL DE SAUDE, com personalidade juridica propria.",
        },
        { hoje: HOJE, ancoradouros: ANCORA_ENTIDADE }
      )
    ).not.toThrow();
  });

  it("t8: o ancoradouro da CONTA aceita o ato que abriu a conta — e é conjunção", () => {
    const ancoras: readonly AncoradouroDoAto[] = [
      ...ANCORA_ENTIDADE,
      { rotulo: "a conta (banco 001, agência 1234, conta 567890)", termos: ["001", "1234", "567890"] },
    ];

    // Passa: a citação traz os TRÊS termos da conta, e não menciona a entidade.
    expect(() =>
      conferirAtoDeclarado(
        {
          ...BOM,
          atoTipo: "OFICIO",
          atoCitacao:
            "Autorizo a abertura da conta corrente 567890 na agência 1234 do banco 001, " +
            "destinada à movimentação dos recursos vinculados.",
        },
        { hoje: HOJE, ancoradouros: ancoras }
      )
    ).not.toThrow();

    // ⚠️ RECUSA: só UM dos três termos aparece. A conjunção dentro do ancoradouro é o que impede
    // o falso positivo — "1234" sozinho casaria com o número do próprio ato, com um valor, com
    // qualquer coisa. Sem ela a aplicabilidade seria decorativa.
    expect(
      motivoDe(() =>
        conferirAtoDeclarado(
          {
            ...BOM,
            atoTipo: "OFICIO",
            atoCitacao:
              "Autorizo a movimentação de recursos na forma do processo 1234 desta secretaria.",
          },
          { hoje: HOJE, ancoradouros: ancoras }
        )
      )
    ).toBe("ATO_NAO_TRATA_DO_OBJETO");
  });

  it("t9: conferir SEM ancoradouro é erro de programação, não ato inválido", () => {
    // ⚠️ É assim que um instrumento morre em silêncio: alguém chama a régua sem dizer sobre o que
    // o ato tem de falar, a checagem de aplicabilidade não roda, e tudo passa. O erro é de
    // PROGRAMAÇÃO e não é um `AtoDeclaradoInvalidoError` — quem o vê é quem escreve o código.
    expect(() => conferirAtoDeclarado(BOM, { hoje: HOJE, ancoradouros: [] })).toThrow(
      /ANCORADOURO AUSENTE/
    );
  });

  it("t10: a recusa de aplicabilidade DIZ o que falta e o que fazer", () => {
    // Mensagem de operação ORIENTA quem opera. "Fundamento inválido" mandaria a pessoa adivinhar.
    let mensagem = "";
    try {
      conferirAtoDeclarado(
        { ...BOM, atoCitacao: "Texto que não trata de coisa alguma relacionada ao objeto." },
        { hoje: HOJE, ancoradouros: ANCORA_ENTIDADE }
      );
    } catch (e) {
      mensagem = e instanceof Error ? e.message : "";
    }
    expect(mensagem).toContain("não menciona");
    expect(mensagem).toContain(NOME);
    expect(mensagem).toContain("Nada foi gravado");
    // E diz qual é a saída honesta quando o ente não tem ato: não declarar.
    expect(mensagem).toContain("não atribuídas");
  });

  it("t11: o rótulo do ato é montado num lugar só", () => {
    expect(rotuloDoAto(BOM)).toBe("Lei 1.234/2005, art. 2º");
  });
});
