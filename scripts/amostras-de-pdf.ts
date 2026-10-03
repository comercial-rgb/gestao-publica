import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fecharBrowser, gerarPdfDoDemonstrativo } from "../lib/pdf/gerar.js";
import type { DocumentoPdf } from "../lib/pdf/documento.js";

/**
 * V33 — AMOSTRAS DO MOTOR DE PDF PARA CONFERÊNCIA VISUAL: curto, multipágina (nomes longos, muitos registros,
 * negativos e zero, coluna larga em paisagem) e sem movimento. Os dados são SINTÉTICOS e o documento diz isso; o
 * ambiente de execução decide a faixa de demonstração. Uso: npx tsx scripts/amostras-de-pdf.ts <pasta-de-saída>
 */

const saida = resolve(process.argv[2] ?? ".registro-de-execucao/amostras-pdf");
mkdirSync(saida, { recursive: true });

const ente = "Município de Exemplo/PB (dados sintéticos de conferência)";
const colunasLargas = [
  { rotulo: "Origem" }, { rotulo: "Fase" }, { rotulo: "Empenho" }, { rotulo: "Liquidação" }, { rotulo: "Unid. · fonte" },
  { rotulo: "Base", alinhamento: "direita" as const }, { rotulo: "Pago (bruto)", alinhamento: "direita" as const },
  { rotulo: "Retido", alinhamento: "direita" as const }, { rotulo: "Pago (líquido)", alinhamento: "direita" as const },
  { rotulo: "Cancelado", alinhamento: "direita" as const }, { rotulo: "Saldo", alinhamento: "direita" as const }, { rotulo: "Vencimento" },
];
const reais = (c: number): string => (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });

const curto: DocumentoPdf = {
  ente,
  titulo: "Amostra curta",
  subtitulo: "Uma seção, três linhas, um total",
  periodo: "Exercício 2026",
  unidade: "Unidade orçamentária 01001 — Secretaria de Administração",
  filtros: ["Fase: liquidado a pagar"],
  secoes: [
    {
      colunas: [{ rotulo: "Especificação" }, { rotulo: "Valor", alinhamento: "direita" }],
      linhas: [["Linha positiva", "1.234,56"], ["Linha zerada", "0,00"], ["Linha negativa", "-987,65"], ["Total", "246,91"]],
      totais: [3],
    },
  ],
  notas: ["Valores em R$. Zero é 0,00; negativo leva o sinal; dado ausente é um travessão."],
};

const longo = "FORNECEDOR COM UM NOME MUITO LONGO DE EMPRESA DE SERVIÇOS TÉCNICOS ESPECIALIZADOS LTDA — FILIAL DA REGIÃO METROPOLITANA";
const multipagina: DocumentoPdf = {
  ente,
  titulo: "Amostra multipágina, em paisagem",
  subtitulo: "Doze colunas, oitenta linhas por credor, nomes longos, negativos e ausentes",
  periodo: "Exercício 2026",
  numero: "000123/2026",
  filtros: ["Credor: todos", "Origem: exercício e restos"],
  secoes: [0, 1].map((k) => ({
    titulo: `${k === 0 ? longo : "Credor B"} — 12.345.678/0001-95 · liquidado a pagar 98.765,43 · a liquidar 1.000,00`,
    colunas: colunasLargas,
    linhas: Array.from({ length: 80 }, (_, i) => [
      i % 7 === 0 ? "Restos processados de 2025" : "Exercício",
      i % 3 === 0 ? "A liquidar" : "Liquidado a pagar",
      `NE-${String(1000 + i)}/2026`,
      i % 3 === 0 ? "—" : `NL-${String(2000 + i)}`,
      "01001 · 1500",
      reais(1_000_000 + i * 12_345),
      reais(i * 1_000),
      reais(i % 5 === 0 ? 0 : 150),
      reais(i * 1_000 - (i % 5 === 0 ? 0 : 150)),
      i % 11 === 0 ? `-${reais(500)}` : "0,00",
      reais(1_000_000 + i * 11_345),
      i % 4 === 0 ? "sem ordem" : "30/06/2026",
    ]),
  })),
  notas: ["Amostra de conferência visual: cabeçalho das colunas repetido, totais, quebra de nome longo."],
};

const vazio: DocumentoPdf = {
  ente,
  titulo: "Amostra sem movimento",
  subtitulo: "Nenhuma obrigação no recorte",
  periodo: "Exercício 2026",
  secoes: [{ titulo: "Totais do documento", colunas: [{ rotulo: "Especificação" }, { rotulo: "Valor", alinhamento: "direita" }], linhas: [["Liquidado a pagar", "0,00"], ["A liquidar", "0,00"]] }],
  notas: ["Nenhuma obrigação aberta neste recorte."],
};

async function main(): Promise<void> {
  for (const [nome, doc] of [["curto", curto], ["multipagina", multipagina], ["vazio", vazio]] as const) {
    const r = await gerarPdfDoDemonstrativo(doc, { nomeBase: `amostra-${nome}` });
    writeFileSync(resolve(saida, r.nomeArquivo), r.pdf);
    console.log(`${r.nomeArquivo} · ${String(r.pdf.length)} bytes · ${r.hash.slice(0, 12)}`);
  }
  await fecharBrowser();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
