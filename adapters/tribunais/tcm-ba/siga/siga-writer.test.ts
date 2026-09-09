import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";
import type { CampoSpec } from "./tipos.js";
import {
  BYTES_HEADER,
  BYTES_TRAILER,
  ENCODING_SIGA,
  formatarCampo,
  montarArquivo,
  montarHeader,
  montarLinha,
  montarTrailer,
  sanitizarAN,
} from "./writer.js";
import { validarArquivoSpec } from "./validar-spec.js";
import {
  SPECS_CAMINHO_CRITICO,
  SPECS_GERAVEIS,
  SPECS_INCOMPLETAS,
  SPECS_TRANSCRITAS,
  SPEC_EMPENHO,
  SPEC_MOV_CONTA,
  ehGeravel,
} from "./specs/index.js";
import { EMPENHO_GOLDEN, SEQUENCIAL_GOLDEN } from "./fixtures/empenho-golden.js";

/**
 * OS TESTES DO WRITER SIGA — e cada um existe por causa de um erro que o layout CONVIDA a cometer.
 *
 * Num formato posicional não há mensagem de erro: há um arquivo do tamanho certo significando
 * outra coisa. Estes testes são a única coisa entre uma transcrição errada e uma remessa recusada.
 */

const campo = (p: Partial<CampoSpec> & Pick<CampoSpec, "tipo" | "inicio" | "fim">): CampoSpec => ({
  nome: "campo_de_teste",
  ...p,
});

describe("SIGA — as specs conferem contra o manual (o guarda anti-typo)", () => {
  // ⚠️ ESTE É O TESTE MAIS IMPORTANTE DO ARQUIVO. O manual v44 tem erros de digitação CONFIRMADOS
  // nas posições (MetasArrecada, PagRetencao, UnidOrca, Diaria). Se a transcrição de uma spec
  // ganhar um typo, é aqui que ele aparece — não numa recusa do TCM semanas depois.
  it("(1) validarArquivoSpec não acusa nada nas 5 specs do caminho crítico", () => {
    const problemas: string[] = [];
    for (const spec of SPECS_CAMINHO_CRITICO) {
      problemas.push(...validarArquivoSpec(spec));
    }
    expect(
      problemas,
      "\n\n⚠️ UMA SPEC NÃO FECHA. Some as larguras dos campos e confronte com a tabela do manual — " +
        "NÃO ajuste o `totalBytes` para calar o teste: é assim que o erro de digitação do PDF entra " +
        "no código e vira arquivo recusado.\n\nProblemas:\n"
    ).toEqual([]);
  });

  it("(1a) TODAS as specs transcritas fecham — inclusive as bloqueadas para geração", () => {
    // ⚠️ UMA SPEC INGERÁVEL CONTINUA TENDO DE FECHAR. Se o MovConta ficasse fora desta varredura,
    // um erro de transcrição nele dormiria até o dia em que a tabela de domínio chegasse.
    const problemas: string[] = [];
    for (const spec of SPECS_TRANSCRITAS) {
      problemas.push(...validarArquivoSpec(spec).map((p) => `${spec.identificacao}: ${p}`));
    }
    expect(problemas).toEqual([]);
    expect(SPECS_TRANSCRITAS).toHaveLength(15);
  });

  it("(1a2) a auditoria de soma bate com o total declarado, arquivo a arquivo", () => {
    // O manual erra em UnidOrca (66) e MovConta (32): declara a POSIÇÃO FINAL no lugar da
    // CONTAGEM. Como as posições são 0-based, contagem = fim + 1. Esta tabela é a conferência.
    const auditoria = SPECS_TRANSCRITAS.map((s) => {
      const soma = s.campos.reduce((a, c) => a + (c.fim - c.inicio + 1), 0);
      const ultimo = s.campos[s.campos.length - 1]!;
      return {
        arquivo: s.identificacao,
        soma,
        total: s.totalBytes,
        fimMaisUm: ultimo.fim + 1,
      };
    });

    for (const a of auditoria) {
      expect(a.soma, `${a.arquivo}: soma != totalBytes`).toBe(a.total);
      expect(a.fimMaisUm, `${a.arquivo}: fim+1 != totalBytes`).toBe(a.total);
    }

    // Os dois totais que o manual erra — travados aqui para ninguém "corrigir" de volta.
    const porNome = new Map(auditoria.map((a) => [a.arquivo, a]));
    expect(porNome.get("UnidOrca")!.total).toBe(83); // manual diz 82
    expect(porNome.get("MovConta")!.total).toBe(97); // manual diz 96
  });

  it("(1a3) só o MovConta está bloqueado para geração, e ele NÃO está nas geráveis", () => {
    expect(SPECS_INCOMPLETAS.map((s) => s.identificacao)).toEqual(["MovConta"]);
    expect(SPECS_GERAVEIS.map((s) => s.identificacao)).not.toContain("MovConta");
    expect(SPECS_GERAVEIS).toHaveLength(14);
    // A marca é lida em runtime, não é só documentação.
    expect(ehGeravel(SPEC_MOV_CONTA)).toBe(false);
    expect(SPEC_MOV_CONTA.origemSpec).toMatch(/-INCOMPLETO$/);
  });

  it("(1b) as 5 specs do caminho crítico estão presentes e ordenadas por (módulo, ordem)", () => {
    expect(SPECS_CAMINHO_CRITICO.map((s) => s.identificacao)).toEqual([
      "ContaCont", // BASICOS ordem 3
      "Dotacao", // ORCAMENTO ordem 8
      "Empenho", // INFORMES ordem 14
      "LiqEmp", // INFORMES ordem 18
      "PagEmp2", // INFORMES ordem 19
    ]);
    for (const s of SPECS_CAMINHO_CRITICO) expect(s.origemSpec).toBe("manual-v44-2014");
  });

  it("(1d) um reservado_tcm_* tipo N SEM literal é ERRO DE SPEC, não surpresa em runtime", () => {
    // ⚠️ O esquecimento silencioso: N preenche com BRANCOS, o manual manda ZEROS. Sem o literal
    // o campo sai em branco, a geometria continua certa, e só o TCM percebe — recusando a remessa.
    // `exactOptionalPropertyTypes` recusa `literal: undefined` — a chave tem de ser OMITIDA, que
    // é justamente o esquecimento real que se está simulando.
    const semLiteral = {
      ...SPEC_EMPENHO,
      campos: SPEC_EMPENHO.campos.map((c) => {
        if (c.nome !== "reservado_tcm_1") return c;
        const { literal: _descartado, ...semAExcecao } = c;
        return semAExcecao;
      }),
    };
    const erros = validarArquivoSpec(semLiteral);
    expect(erros.join("\n")).toMatch(/reservado_tcm_1.*literal/s);
  });

  it("(1e) literal com largura errada também é erro de spec", () => {
    const literalCurto = {
      ...SPEC_EMPENHO,
      campos: SPEC_EMPENHO.campos.map((c) =>
        c.nome === "reservado_tcm_1" ? { ...c, literal: "00" } : c
      ),
    };
    expect(validarArquivoSpec(literalCurto).join("\n")).toMatch(/largura exata/);
  });

  it("(1c) validarArquivoSpec PEGA um typo de posição — a prova de que o guarda guarda", () => {
    // Um typo plausível: alguém digita 41 em vez de 42 no fim de cd_ContaContabil.
    const comTypo = {
      ...SPEC_EMPENHO,
      campos: SPEC_EMPENHO.campos.map((c) =>
        c.nome === "nu_Empenho" ? { ...c, fim: 17 } : c
      ),
    };
    const erros = validarArquivoSpec(comTypo);
    expect(erros.length).toBeGreaterThan(0);
    expect(erros.join("\n")).toMatch(/GAP não declarado|soma das larguras/);
  });
});

describe("SIGA — header e trailer", () => {
  const ctx = {
    codUnidade: "1",
    nomeUnidade: "MUNICIPIO DE LAPAO",
    geradoEm: new Date(Date.UTC(2026, 0, 15, 9, 30, 0)),
  };

  it("(2) o header tem exatamente 162 bytes", () => {
    const h = montarHeader({ ...ctx, identificacao: "Empenho" });
    expect(h).toHaveLength(BYTES_HEADER);
    expect(BYTES_HEADER).toBe(162);
  });

  it("(2b) a versão do layout (34-37) é 1, NÃO 44 — o 44 é a versão do documento", () => {
    const h = montarHeader({ ...ctx, identificacao: "Empenho" });
    expect(h.slice(34, 38)).toBe("   1");
    expect(h.slice(34, 38)).not.toContain("44");
  });

  it("(2c) o header carrega tipo 0, identificação, data/hora, sistema e sequencial 1", () => {
    const h = montarHeader({ ...ctx, identificacao: "Empenho" });
    expect(h.slice(0, 1)).toBe("0");
    expect(h.slice(1, 16)).toBe("Empenho".padEnd(15, " "));
    expect(h.slice(16, 26)).toBe("15/01/2026");
    expect(h.slice(26, 34)).toBe("09:30:00");
    expect(h.slice(38, 48)).toBe("SIGA".padEnd(10, " "));
    expect(h.slice(48, 52)).toBe("   1"); // N = brancos à esquerda
    expect(h.slice(152, 162)).toBe("         1");
  });

  it("(3) o trailer tem exatamente 11 bytes e leva o próprio sequencial", () => {
    const t = montarTrailer(5);
    expect(t).toHaveLength(BYTES_TRAILER);
    expect(BYTES_TRAILER).toBe(11);
    expect(t.slice(0, 1)).toBe("9");
    expect(t.slice(1, 11)).toBe("         5");
  });
});

describe("SIGA — formatação por tipo de campo", () => {
  it("(4) N alinha à direita com BRANCOS — nunca zeros", () => {
    expect(formatarCampo(campo({ tipo: "N", inicio: 0, fim: 9 }), 123)).toBe("       123");
  });

  // ⚠️ O CASO CARO: zeros à esquerda no nº de empenho fazem o TCM devolver ERRO.
  it("(5-bis) nu_Empenho sai com BRANCOS à esquerda, e nunca zero-padded", () => {
    const nuEmpenho = SPEC_EMPENHO.campos.find((c) => c.nome === "nu_Empenho")!;
    const saida = formatarCampo(nuEmpenho, "45");
    expect(saida).toBe("        45");
    expect(saida).toHaveLength(10);
    expect(saida.startsWith("0")).toBe(false);
  });

  it("(5) V alinha à direita com ZEROS, sem separador — 1234.56 em 16 bytes", () => {
    const c = campo({ tipo: "V", inicio: 0, fim: 15, decimais: 2 });
    expect(formatarCampo(c, new Decimal("1234.56"))).toBe("0000000000123456");
  });

  it("(6) V negativo com permissão leva o sinal à esquerda", () => {
    const c = campo({ tipo: "V", inicio: 0, fim: 15, decimais: 2, permiteNegativo: true });
    const saida = formatarCampo(c, new Decimal("-5000.00"));
    expect(saida).toBe("-000000000500000");
    expect(saida).toHaveLength(16);
  });

  it("(7) V com 3 decimais — qt_ItemLicitado/vl_Unitario NÃO são 2 casas", () => {
    const c = campo({ tipo: "V", inicio: 0, fim: 15, decimais: 3 });
    expect(formatarCampo(c, new Decimal("12.345"))).toBe("0000000000012345");
  });

  it("(8) V negativo SEM permissão lança NEGATIVO_NAO_PERMITIDO", () => {
    const c = campo({ tipo: "V", inicio: 0, fim: 15, decimais: 2 });
    expect(() => formatarCampo(c, new Decimal("-1.00"))).toThrow(/NEGATIVO_NAO_PERMITIDO/);
  });

  it("(8b) valor monetário como number é RECUSADO — dinheiro não trafega em float", () => {
    const c = campo({ tipo: "V", inicio: 0, fim: 15, decimais: 2 });
    expect(() => formatarCampo(c, 1234.56)).toThrow(/VALOR_NAO_DECIMAL/);
  });

  it("(9) AN sanitiza a blacklist do TCM", () => {
    const c = campo({ tipo: "AN", inicio: 0, fim: 39 });
    const saida = formatarCampo(c, "Compra; DROP TABLE x");
    expect(saida).not.toContain(";");
    expect(saida.toLowerCase()).not.toContain("drop");
    expect(saida).toHaveLength(40);
  });

  it("(9b) a blacklist cobre aspa, --, e as palavras SQL em qualquer caixa", () => {
    expect(sanitizarAN("O'Brien")).not.toContain("'");
    expect(sanitizarAN("saldo -- ajuste")).not.toContain("--");
    expect(sanitizarAN("SeLeCt 1")).not.toMatch(/select/i);
    expect(sanitizarAN("xp_cmdshell")).not.toMatch(/xp_/i);
    // Substitui por espaço (não remove): a largura do texto e as palavras vizinhas sobrevivem.
    expect(sanitizarAN("a;b")).toBe("a b");
  });

  it("(10) AN remove acento — 1 caractere = 1 byte, seja qual for o encoding real", () => {
    expect(sanitizarAN("Serviços")).toBe("Servicos");
    expect(sanitizarAN("MANUTENÇÃO DE VEÍCULOS")).toBe("MANUTENCAO DE VEICULOS");
  });

  it("(10b) AN elimina caractere de controle — CR/LF partiriam o registro em duas linhas", () => {
    expect(sanitizarAN("linha1\r\nlinha2")).toBe("linha1  linha2");
    expect(sanitizarAN("com\ttab")).toBe("com tab");
  });

  it("(11) D formata ddmmaaaa; ano anterior a 2000 lança ANO_INVALIDO", () => {
    const c = campo({ tipo: "D", inicio: 0, fim: 7 });
    expect(formatarCampo(c, new Date(Date.UTC(2026, 0, 15)))).toBe("15012026");
    expect(() => formatarCampo(c, new Date(Date.UTC(1999, 11, 31)))).toThrow(/ANO_INVALIDO/);
  });

  it("(14) overflow lança OVERFLOW_CAMPO em vez de truncar", () => {
    const v = campo({ tipo: "V", inicio: 0, fim: 5, decimais: 2 });
    expect(() => formatarCampo(v, new Decimal("999999999.99"))).toThrow(/OVERFLOW_CAMPO/);

    const n = campo({ tipo: "N", inicio: 0, fim: 2 });
    expect(() => formatarCampo(n, "12345")).toThrow(/OVERFLOW_CAMPO/);

    const an = campo({ tipo: "AN", inicio: 0, fim: 4 });
    expect(() => formatarCampo(an, "texto longo demais")).toThrow(/OVERFLOW_CAMPO/);
  });

  it("os campos Reservado TCM saem ZERADOS — a exceção declarada à regra do N", () => {
    const reservado = SPEC_EMPENHO.campos.find((c) => c.nome === "reservado_tcm_1")!;
    expect(formatarCampo(reservado, undefined)).toBe("00000000000000");
    // O literal IGNORA o valor do registro — é a spec que manda.
    expect(formatarCampo(reservado, "999")).toBe("00000000000000");
  });
});

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * O EMPENHO COMPLETO — golden byte a byte
 * ──────────────────────────────────────────────────────────────────────────────────────────────*/

describe("SIGA — o Empenho completo (golden)", () => {
  it("(12) uma linha de Empenho tem exatamente 500 bytes e bate com a fixture commitada", () => {
    const linha = montarLinha(SPEC_EMPENHO, EMPENHO_GOLDEN, SEQUENCIAL_GOLDEN);
    expect(linha).toHaveLength(500);

    // ⚠️ A FIXTURE É UM GUARDA DE REGRESSÃO, NÃO UMA PROVA DE CONFORMIDADE. Ela foi gerada por
    // este writer e depois CONFERIDA campo a campo contra a tabela do manual (ver as asserções de
    // posição abaixo, que são independentes do arquivo). O que ela garante é que uma mudança no
    // writer não desloque silenciosamente nenhum byte — não que o TCM aceite o resultado.
    const esperado = readFileSync(
      fileURLToPath(new URL("./fixtures/empenho-golden.txt", import.meta.url)),
      ENCODING_SIGA
    ).replace(/\r?\n$/, "");

    expect(linha).toBe(esperado);
  });

  // ⚠️ AS ASSERÇÕES DE POSIÇÃO SÃO A CONFERÊNCIA DE VERDADE — elas não dependem da fixture, e é
  // por isso que existem além dela. Se o golden estivesse errado, estas falhariam.
  it("(12b) cada campo do golden está na posição que o manual manda", () => {
    const l = montarLinha(SPEC_EMPENHO, EMPENHO_GOLDEN, 2);

    expect(l.slice(0, 1)).toBe("1"); // tp_registro = detalhe
    expect(l.slice(1, 5)).toBe("   1"); // cd_Unidade (N, brancos)
    expect(l.slice(5, 9)).toBe(" 101"); // cd_UnidadeOrcamentaria
    expect(l.slice(9, 19)).toBe("        45"); // nu_Empenho — BRANCOS, nunca zeros
    expect(l.slice(19, 55)).toBe("PL-2026-000123".padEnd(36, " "));
    expect(l.slice(55, 59)).toBe("2026");
    expect(l.slice(68, 82)).toBe("00000000000000"); // reservado_tcm_1 zerado
    expect(l.slice(82, 90)).toBe("33903900");
    expect(l.slice(90, 106)).toBe("0000000001234567"); // vl_Empenho 12345.67
    expect(l.slice(106, 361)).toBe(
      "MANUTENCAO DE VEICULOS DA FROTA MUNICIPAL".padEnd(255, " ")
    );
    expect(l.slice(361, 362)).toBe("1");
    expect(l.slice(362, 370)).toBe("15012026"); // dt_Empenho ddmmaaaa
    expect(l.slice(386, 436)).toBe("FORNECEDOR MODELO LTDA".padEnd(50, " "));
    expect(l.slice(436, 442)).toBe("202601");
    expect(l.slice(456, 457)).toBe("2"); // tp_Pessoa jurídica
    expect(l.slice(477, 478)).toBe("0"); // reservado_tcm_2 zerado
    expect(l.slice(488, 489)).toBe("S"); // st_contrato_aplicavel
    expect(l.slice(489, 490)).toBe("S"); // st_licitacao_sujeito
    expect(l.slice(490, 500)).toBe("         2"); // sequencial do detalhe
  });
});

describe("SIGA — o arquivo completo", () => {
  it("(13) header(1) + 3 detalhes(2,3,4) + trailer(5), com o sequencial contínuo", () => {
    const registros = [
      { ...EMPENHO_GOLDEN, nu_Empenho: "45" },
      { ...EMPENHO_GOLDEN, nu_Empenho: "46" },
      { ...EMPENHO_GOLDEN, nu_Empenho: "47" },
    ];
    const buf = montarArquivo(SPEC_EMPENHO, registros, {
      codUnidade: "1",
      nomeUnidade: "MUNICIPIO DE LAPAO",
      geradoEm: new Date(Date.UTC(2026, 0, 15, 9, 30, 0)),
    });

    const linhas = buf.toString(ENCODING_SIGA).split("\r\n").filter((l) => l.length > 0);
    expect(linhas).toHaveLength(5);

    expect(linhas[0]!.slice(0, 1)).toBe("0");
    expect(linhas[0]!).toHaveLength(162);
    expect(linhas[0]!.slice(152, 162)).toBe("         1");

    for (let i = 1; i <= 3; i++) {
      expect(linhas[i]!.slice(0, 1)).toBe("1");
      expect(linhas[i]!).toHaveLength(500);
      expect(linhas[i]!.slice(490, 500)).toBe(String(i + 1).padStart(10, " "));
    }

    expect(linhas[4]!.slice(0, 1)).toBe("9");
    expect(linhas[4]!).toHaveLength(11);
    expect(linhas[4]!.slice(1, 11)).toBe("         5");
  });

  it("cada ArquivoRemessa carrega a sua ordem de importação — o SIGA recusa fora de ordem", async () => {
    const { montarPacoteSiga } = await import("../index.js");
    const pacote = montarPacoteSiga(
      {
        competencia: { granularidade: "MENSAL", exercicio: 2026, mes: 1 },
        contas: [],
        fontes: [],
        empenhos: [],
        registrosPorArquivo: {},
      },
      { codUnidade: "1", nomeUnidade: "MUNICIPIO DE LAPAO", geradoEm: new Date(Date.UTC(2026, 0, 15)) }
    );

    // A ordem do pacote é a ordem de CARGA: BASICOS antes de ORCAMENTO antes de INFORMES.
    expect(pacote.arquivos.map((a) => [a.modulo, a.ordem, a.nome])).toEqual([
      ["BASICOS", 3, "ContaCont.txt"],
      ["ORCAMENTO", 8, "Dotacao.txt"],
      ["INFORMES", 14, "Empenho.txt"],
      ["INFORMES", 18, "LiqEmp.txt"],
      ["INFORMES", 19, "PagEmp2.txt"],
    ]);
    // Arquivo sem movimento sai VAZIO (header+trailer), nunca omitido.
    expect(pacote.arquivos.every((a) => a.registros === 0)).toBe(true);
    expect(pacote.layoutVersao).toBe("v44-2014");
  });

  it("(13b) arquivo sem detalhe: header(1) + trailer(2) — vazio, não omitido", () => {
    const buf = montarArquivo(SPEC_EMPENHO, [], {
      codUnidade: "1",
      nomeUnidade: "MUNICIPIO DE LAPAO",
      geradoEm: new Date(Date.UTC(2026, 0, 15, 9, 30, 0)),
    });
    const linhas = buf.toString(ENCODING_SIGA).split("\r\n").filter((l) => l.length > 0);
    expect(linhas).toHaveLength(2);
    expect(linhas[1]!.slice(1, 11)).toBe("         2");
  });

  it("(13c) LiqEmp tem ordem PRÓPRIA: orçamentária, empenho, gestora", () => {
    // ⚠️ A armadilha do LiqEmp. Os três campos são numéricos e de largura parecida — trocá-los
    // gera um arquivo do tamanho certo apontando para a unidade errada.
    const linha = montarLinha(
      SPECS_CAMINHO_CRITICO.find((s) => s.identificacao === "LiqEmp")!,
      {
        cd_UnidadeOrcamentaria: "101",
        nu_Empenho: "45",
        cd_Unidade: "1",
        dt_Liquidacao: new Date(Date.UTC(2026, 0, 20)),
        vl_Liquidacao: new Decimal("12345.67"),
        dt_Ano: "2026",
        dt_AnoMes: "202601",
        cd_Orgao: "99",
      },
      2
    );
    expect(linha).toHaveLength(77);
    expect(linha.slice(1, 5)).toBe(" 101"); // orçamentária ANTES
    expect(linha.slice(5, 15)).toBe("        45"); // empenho
    expect(linha.slice(15, 19)).toBe("   1"); // gestora DEPOIS
    expect(linha.slice(57, 67)).toBe("0000000000"); // reservado zerado
  });

  it("(13d) LiqEmp aceita valor NEGATIVO — a anulação de liquidação", () => {
    const linha = montarLinha(
      SPECS_CAMINHO_CRITICO.find((s) => s.identificacao === "LiqEmp")!,
      {
        cd_UnidadeOrcamentaria: "101",
        nu_Empenho: "45",
        cd_Unidade: "1",
        dt_Liquidacao: new Date(Date.UTC(2026, 0, 20)),
        vl_Liquidacao: new Decimal("-500.00"),
        dt_Ano: "2026",
        dt_AnoMes: "202601",
        cd_Orgao: "99",
      },
      2
    );
    expect(linha.slice(27, 43)).toBe("-000000000050000");
  });
});
