import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { toMoney } from "../../../../packages/contracts/index.js";
import { serializarArquivo } from "./registry.js";
import { LAYOUT_DOTACAO, LAYOUT_LIQUIDACAO, type DotacaoFato, type LiquidacaoFato } from "./layout-2026v11.js";
import type { ArquivoGerado } from "./gerador.js";
import { montarPacote, sha256, ziparDeterministico } from "./pacote.js";

const dotacaoFato: DotacaoFato = {
  codUnidadeGestora: "999001", competencia: 2026, codUnidadeOrcamentaria: "02001",
  codFuncao: "04", codSubfuncao: "122", codPrograma: "0001", codAcao: "2001",
  codCategoriaEconomica: "3", codNaturezaDespesa: "3", codModalidadeDespesa: "90", codElementoDespesa: "30",
  exercicioFonteRecurso: 1, codFonteRecurso: "500", valor: toMoney("150000.00"),
};
const liqFato: LiquidacaoFato = {
  codUnidadeGestora: "999001", anoEmissaoEmpenho: 2026, codUnidadeOrcamentaria: "02001",
  numEmpenho: "12", numero: "1", data: new Date(Date.UTC(2026, 6, 15)), notaFiscal: null,
  valor: toMoney("6000.00"), codAgrupamentoFolha: null,
};

function arquivos(): ArquivoGerado[] {
  return [
    { nome: "999001072026Dotacao.txt", conteudo: serializarArquivo(LAYOUT_DOTACAO, [dotacaoFato]), registros: 1 },
    { nome: "99900115072026Liquidacao.txt", conteudo: serializarArquivo(LAYOUT_LIQUIDACAO, [liqFato]), registros: 1 },
  ];
}
const meta = { layout: "2026 v1.1", periodicidade: "DIARIO", competencia: "2026-07-15", codUnidadeGestora: "999001" };

describe("F3 — manifesto com SHA-256 por arquivo + hash do pacote", () => {
  it("o sha256 de cada arquivo bate com o hash do próprio conteúdo", () => {
    const arqs = arquivos();
    const { manifesto } = montarPacote(meta, arqs);
    expect(manifesto.arquivos).toHaveLength(2);
    for (const a of manifesto.arquivos) {
      const orig = arqs.find((x) => x.nome === a.nome)!;
      expect(a.sha256).toBe(createHash("sha256").update(orig.conteudo).digest("hex"));
      expect(a.bytes).toBe(orig.conteudo.length);
    }
  });

  it("o manifesto declara a natureza honesta (DIRETIVA §7), sem recibo/protocolo", () => {
    const { manifesto } = montarPacote(meta, arquivos());
    expect(manifesto.natureza).toBe("FORMATO_OFICIAL_GERADO_E_VALIDADO_LOCALMENTE");
    expect(JSON.stringify(manifesto)).not.toMatch(/recibo|protocolo|aceito|transmitido/i);
  });
});

describe("F3 — determinismo (mesma massa = mesmo byte = mesmo hash)", () => {
  it("dois montares produzem o MESMO zip e o MESMO hashPacote", () => {
    const p1 = montarPacote(meta, arquivos());
    const p2 = montarPacote(meta, arquivos());
    expect(p1.manifesto.hashPacote).toBe(p2.manifesto.hashPacote);
    expect(sha256(p1.zip)).toBe(sha256(p2.zip)); // zip byte a byte idêntico
  });

  it("a ordem de entrada não muda os bytes do zip (entradas ordenadas por nome)", () => {
    const arqs = arquivos();
    const z1 = ziparDeterministico(arqs.map((a) => ({ nome: a.nome, conteudo: a.conteudo })));
    const z2 = ziparDeterministico([...arqs].reverse().map((a) => ({ nome: a.nome, conteudo: a.conteudo })));
    expect(sha256(z1)).toBe(sha256(z2));
  });

  it("o zip é um contêiner PKWARE válido (assinatura PK\\x03\\x04)", () => {
    const { zip } = montarPacote(meta, arquivos());
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
    expect(zip[2]).toBe(0x03);
    expect(zip[3]).toBe(0x04);
  });
});
