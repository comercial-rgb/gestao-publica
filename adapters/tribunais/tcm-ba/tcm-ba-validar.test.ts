import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import type { Competencia, Inconsistencia } from "../../../packages/tribunais-core/porta.js";
import { SPEC_EMPENHO } from "./siga/specs/index.js";
import { TP_PODER_LEGISLATIVO } from "./siga/specs/index.js";
import {
  CODIGOS_SIGA,
  CODIGOS_SIGA_QUEIMADOS,
  granularidadeSuportada,
  validarMassaSiga,
  type EmpenhoParaValidar,
  type MassaParaValidar,
} from "./validar.js";

/**
 * A VALIDAÇÃO PRÉVIA (requisito 64) — os testes.
 *
 * ⚠️ TODA INCONSISTÊNCIA TEM DE APONTAR O REGISTRO, NÃO A LINHA. `validar()` roda ANTES de o
 * arquivo existir; se alguém voltar a preencher `linha` aqui, está inventando uma posição que
 * ainda não foi decidida. Os testes cobram `origemId` e cobram a AUSÊNCIA de `arquivo`/`linha`.
 */

const MENSAL: Competencia = { granularidade: "MENSAL", exercicio: 2026, mes: 3 };

const empenhoOk: EmpenhoParaValidar = {
  id: "cmp-empenho-0001",
  nuEmpenho: "45",
  historico: "MANUTENCAO DE VEICULOS",
  valor: new Decimal("12345.67"),
  data: new Date(Date.UTC(2026, 2, 15)),
  contratoAplicavel: false,
  nuContrato: null,
  sujeitoLicitacao: false,
  nuProcessoLicitatorio: null,
  cdDispensa: null,
  contaPcaspId: null,
  fonteRecursoId: null,
};

const massaBase: MassaParaValidar = {
  competencia: MENSAL,
  contas: [],
  fontes: [],
  empenhos: [],
};

const validar = (m: Partial<MassaParaValidar>): Inconsistencia[] =>
  validarMassaSiga({ ...massaBase, ...m }, SPEC_EMPENHO);

const codigos = (achados: readonly Inconsistencia[]): string[] => achados.map((a) => a.codigo);

describe("SIGA — validação prévia: o formato da inconsistência", () => {
  it("massa limpa não produz inconsistência alguma", () => {
    expect(validar({ empenhos: [empenhoOk] })).toEqual([]);
  });

  it("toda inconsistência aponta o REGISTRO (origemId), nunca a linha do arquivo", () => {
    const achados = validar({
      empenhos: [{ ...empenhoOk, contratoAplicavel: true, nuContrato: null }],
    });
    expect(achados).toHaveLength(1);
    const a = achados[0]!;

    expect(a.origemTabela).toBe("Empenho");
    expect(a.origemId).toBe("cmp-empenho-0001");
    // ⚠️ O arquivo AINDA NÃO EXISTE nesta fase — quem preenche isto é `gerar()`.
    expect(a.arquivo).toBeUndefined();
    expect(a.linha).toBeUndefined();
  });

  it("o código segue {TRIBUNAL}-{E|A}{NNN}, e a letra concorda com a severidade", () => {
    const achados = validar({
      empenhos: [
        { ...empenhoOk, contratoAplicavel: true, nuContrato: null }, // BLOQUEIA
        { ...empenhoOk, id: "cmp-empenho-0002", historico: "COMPRA; URGENTE" }, // ALERTA
      ],
    });
    expect(achados.length).toBeGreaterThanOrEqual(2);

    for (const a of achados) {
      expect(a.codigo).toMatch(/^SIGA-[EA]\d{3}$/);
      const letra = a.codigo.charAt(5);
      expect(letra).toBe(a.severidade === "BLOQUEIA" ? "E" : "A");
    }
  });

  it("a mensagem é para o CONTADOR — sem nome de campo do código nem jargão", () => {
    const achados = validar({
      contas: [{ contaPcaspId: "cmp-conta-1", codigoPcasp: "3.3.90.39", sequencialTcm: null }],
    });
    const a = achados[0]!;
    expect(a.mensagem).toContain("3.3.90.39");
    // O nome técnico do campo vive em `campo`, não no meio da frase que o humano lê.
    expect(a.campo).toBe("nu_SequencialTC");
    expect(a.mensagem).not.toContain("sequencialTcm");
    expect(a.mensagem).not.toContain("DeParaContaSiga");
  });
});

describe("SIGA — validação prévia: as regras", () => {
  it("SIGA-E001: conta contábil sem de/para", () => {
    const achados = validar({
      contas: [{ contaPcaspId: "cmp-conta-1", codigoPcasp: "1.1.1.1.1", sequencialTcm: null }],
    });
    expect(codigos(achados)).toEqual([CODIGOS_SIGA.CONTA_SEM_DE_PARA]);
    expect(achados[0]!.origemTabela).toBe("ContaPcasp");
    expect(achados[0]!.origemId).toBe("cmp-conta-1");
  });

  it("SIGA-E002: fonte de recurso sem código do TCM-BA", () => {
    const achados = validar({
      fontes: [{ fonteRecursoId: "cmp-fonte-1", codigo: "500", codigoTcmBa: null }],
    });
    expect(codigos(achados)).toEqual([CODIGOS_SIGA.FONTE_SEM_DE_PARA]);
    expect(achados[0]!.origemTabela).toBe("FonteRecurso");
  });

  it("SIGA-E003: contrato aplicável sem número de contrato", () => {
    expect(
      codigos(validar({ empenhos: [{ ...empenhoOk, contratoAplicavel: true, nuContrato: null }] }))
    ).toEqual([CODIGOS_SIGA.CONTRATO_OBRIGATORIO]);

    // Com o contrato informado, some.
    expect(
      validar({ empenhos: [{ ...empenhoOk, contratoAplicavel: true, nuContrato: "CT-1" }] })
    ).toEqual([]);
  });

  it("SIGA-E004: sujeito a licitação sem processo nem dispensa (e dispensa basta)", () => {
    expect(
      codigos(validar({ empenhos: [{ ...empenhoOk, sujeitoLicitacao: true }] }))
    ).toEqual([CODIGOS_SIGA.LICITACAO_SEM_REFERENCIA]);

    expect(
      validar({ empenhos: [{ ...empenhoOk, sujeitoLicitacao: true, cdDispensa: "DL-07" }] })
    ).toEqual([]);
  });

  it("SIGA-E005: data anterior a 2000", () => {
    expect(
      codigos(validar({ empenhos: [{ ...empenhoOk, data: new Date(Date.UTC(1999, 11, 31)) }] }))
    ).toEqual([CODIGOS_SIGA.ANO_INVALIDO]);
  });

  it("SIGA-E006: valor que não cabe na largura do campo V", () => {
    expect(
      codigos(
        validar({ empenhos: [{ ...empenhoOk, valor: new Decimal("999999999999999.99") }] })
      )
    ).toEqual([CODIGOS_SIGA.VALOR_NAO_CABE]);
  });

  it("SIGA-E008: histórico que não cabe depois de sanitizado", () => {
    const achados = validar({ empenhos: [{ ...empenhoOk, historico: "X".repeat(300) }] });
    expect(codigos(achados)).toContain(CODIGOS_SIGA.HISTORICO_NAO_CABE);
  });

  it("SIGA-A002: a blacklist alterou o texto — a remessa sai, mas diferente do banco", () => {
    const achados = validar({
      empenhos: [{ ...empenhoOk, historico: "MANUTENÇÃO; VEÍCULOS" }],
    });
    expect(codigos(achados)).toEqual([CODIGOS_SIGA.TEXTO_SANITIZADO]);
    expect(achados[0]!.severidade).toBe("ALERTA");
  });

  it("SIGA-E009/E010: o empenho referencia de/para que não existe", () => {
    const achados = validar({
      empenhos: [{ ...empenhoOk, contaPcaspId: "cmp-conta-x", fonteRecursoId: "cmp-fonte-x" }],
    });
    expect(codigos(achados)).toEqual([
      CODIGOS_SIGA.EMPENHO_CONTA_SEM_DE_PARA,
      CODIGOS_SIGA.EMPENHO_FONTE_SEM_DE_PARA,
    ]);
  });
});

describe("SIGA — as regras do lote 2", () => {
  it("SIGA-E014: a remessa PADRÃO não é bloqueada pelo MovConta", () => {
    // ⚠️ O MovConta não está no caminho crítico. Se o E014 disparasse sempre, `exportarParaTribunal`
    // devolveria ok:false em TODA competência — um fail-closed que não protege nada e impede tudo.
    expect(codigos(validar({}))).not.toContain(CODIGOS_SIGA.SPEC_INCOMPLETA);
  });

  it("SIGA-E014: pedir o MovConta explicitamente BLOQUEIA, nomeando o motivo", () => {
    const achados = validar({ arquivosSolicitados: ["Empenho", "MovConta"] });
    const e014 = achados.filter((a) => a.codigo === CODIGOS_SIGA.SPEC_INCOMPLETA);
    expect(e014).toHaveLength(1);
    expect(e014[0]!.origemId).toBe("MovConta");
    expect(e014[0]!.severidade).toBe("BLOQUEIA");
    // A mensagem diz que falta DOMÍNIO, não que falta implementação.
    expect(e014[0]!.mensagem).toMatch(/tabela de domínio/i);
  });

  it("SIGA-E016/E017: item de receita e elemento de despesa sem código do TCM", () => {
    const achados = validar({
      itensReceita: [
        { itemReceitaId: "cmp-ir-1", codigoInterno: "1112", codigoTcmBa: null },
        { itemReceitaId: "cmp-ir-2", codigoInterno: "1113", codigoTcmBa: "11130211" },
      ],
      itensDespesa: [{ elementoId: "cmp-ed-1", codigoInterno: "339039", codigoTcmBa: null }],
    });
    expect(codigos(achados)).toEqual([
      CODIGOS_SIGA.ITEM_RECEITA_SEM_DE_PARA,
      CODIGOS_SIGA.ITEM_DESPESA_SEM_DE_PARA,
    ]);
  });

  it("SIGA-E018: o manual exige Executivo E Legislativo — dois executivos não bastam", () => {
    const soExecutivo = validar({
      orgaos: [
        { id: "o1", codigo: "01", tpPoder: "1" },
        { id: "o2", codigo: "02", tpPoder: "3" },
      ],
    });
    expect(codigos(soExecutivo)).toContain(CODIGOS_SIGA.ORGAOS_INSUFICIENTES);

    const comCamara = validar({
      orgaos: [
        { id: "o1", codigo: "01", tpPoder: "1" },
        { id: "o2", codigo: "02", tpPoder: TP_PODER_LEGISLATIVO },
      ],
    });
    expect(codigos(comCamara)).not.toContain(CODIGOS_SIGA.ORGAOS_INSUFICIENTES);
  });

  it("SIGA-E019/E020: conciliação tipo 3 força pagamento 1 e detalhe 11111111", () => {
    const errado = validar({
      conciliacoes: [
        {
          id: "cc-1",
          cdConciliacao: 3,
          tpPagamento: "3",
          detalheTipoPagto: "99999999",
          valor: new Decimal("100.00"),
        },
      ],
    });
    expect(codigos(errado)).toEqual([
      CODIGOS_SIGA.CONCILIA_TIPO3_PAGAMENTO,
      CODIGOS_SIGA.CONCILIA_TIPO3_DETALHE,
    ]);

    const certo = validar({
      conciliacoes: [
        {
          id: "cc-2",
          cdConciliacao: 3,
          tpPagamento: "1",
          detalheTipoPagto: "11111111",
          // Tipo 3 admite valor zero — é saldo, não movimento.
          valor: new Decimal("0.00"),
        },
      ],
    });
    expect(codigos(certo)).toEqual([]);
  });

  it("SIGA-E021: fora do tipo 3, valor zero não concilia nada", () => {
    const achados = validar({
      conciliacoes: [
        {
          id: "cc-3",
          cdConciliacao: 1,
          tpPagamento: "2",
          detalheTipoPagto: "123",
          valor: new Decimal("0.00"),
        },
      ],
    });
    expect(codigos(achados)).toContain(CODIGOS_SIGA.CONCILIA_VALOR_ZERO);
  });

  it("SIGA-E022: estorno de receita não pode exceder o saldo do lançamento", () => {
    const excede = validar({
      estornosReceita: [
        {
          id: "er-1",
          valorEstorno: new Decimal("150.00"),
          saldoDisponivel: new Decimal("100.00"),
        },
      ],
    });
    expect(codigos(excede)).toContain(CODIGOS_SIGA.ESTORNO_EXCEDE_SALDO);

    // Igual ao saldo é legítimo — estorno total.
    const igual = validar({
      estornosReceita: [
        {
          id: "er-2",
          valorEstorno: new Decimal("100.00"),
          saldoDisponivel: new Decimal("100.00"),
        },
      ],
    });
    expect(codigos(igual)).not.toContain(CODIGOS_SIGA.ESTORNO_EXCEDE_SALDO);
  });

  it("SIGA-E015 está QUEIMADO — não pode reaparecer como código de regra", () => {
    // ⚠️ E015 foi proposto para "fonte sem de/para", que já era E002. Dois códigos para a mesma
    // recusa quebraria o filtro da tela e a citação do contador. O número fica reservado.
    const usados = Object.values(CODIGOS_SIGA) as string[];
    for (const queimado of CODIGOS_SIGA_QUEIMADOS) {
      expect(usados).not.toContain(queimado);
    }
  });
});

describe("SIGA — a granularidade da competência", () => {
  it("MENSAL e ANUAL são atendíveis; DIARIA não", () => {
    expect(granularidadeSuportada({ granularidade: "MENSAL", exercicio: 2026, mes: 3 })).toBe(true);
    expect(granularidadeSuportada({ granularidade: "ANUAL", exercicio: 2026 })).toBe(true);
    expect(
      granularidadeSuportada({ granularidade: "DIARIA", exercicio: 2026, mes: 3, dia: 15 })
    ).toBe(false);
  });

  it("SIGA-E011: pedir remessa DIÁRIA BLOQUEIA em vez de devolver o mês em silêncio", () => {
    // ⚠️ É ISTO QUE A UNION ETIQUETADA COMPRA. Com `{ exercicio, mes?, dia? }` o adapter receberia
    // um `dia` que não sabe usar e devolveria março inteiro — e quem pediu 15/03 acreditaria ter
    // recebido o dia. Aqui ele recusa, nomeando.
    const achados = validar({
      competencia: { granularidade: "DIARIA", exercicio: 2026, mes: 3, dia: 15 },
    });
    expect(codigos(achados)).toEqual([CODIGOS_SIGA.GRANULARIDADE_NAO_SUPORTADA]);
    expect(achados[0]!.severidade).toBe("BLOQUEIA");
  });
});
