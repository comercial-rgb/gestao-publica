import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * ═══ O GREP-TESTE DA POLÍTICA DE LEITURA (orquestração V3, 4.1) ═══
 *
 * A decisão de produto: **cada leitura protegida exige a ação de leitura da sua área, no
 * escopo pedido**. O compilador garante metade — `exigirLeitura(acao)` e
 * `recorteDePagina(sp, acao)` não compilam sem a ação. A outra metade ele não vê: uma
 * tela NOVA que simplesmente não chame gate nenhum compila, renderiza, e entrega o dado a
 * qualquer sessão. Foi assim que 46 telas do molde e doze leituras do ente ficaram abertas
 * até a ENT10 medir.
 *
 * A PROPRIEDADE: todo `page.tsx` e todo `route.ts` sob `app/(areas)` declara a sua
 * leitura — por um dos gates da política — ou não importa porta nenhuma (é navegação:
 * cartões e links, sem dado). Não há terceira categoria.
 *
 * ⚠️ E A EXCEÇÃO É PROVADA, NÃO LISTADA. Uma lista de "páginas de navegação" apodreceria
 * no dia em que alguém pusesse um contador numa landing. Aqui a página sem gate tem de
 * NÃO importar `lib/portas/` (fora da porta de navegação e do menu): quem lê dado passa
 * por uma porta, e quem passa por uma porta precisa de gate.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const AREAS = join(RAIZ, "app", "(areas)");

/** Os gates da política — qualquer um deles declara a leitura. */
const GATES = [
  /\bexigirLeitura\(\s*"CONSULTAR_[A-Z_]+"\s*\)/,
  // ⚠️ O ARGUMENTO PODE TER PARÊNTESES (`Object.fromEntries(req.nextUrl.searchParams)`):
  // um `[^)]*` aqui deixava as três rotas de PDF da despesa "sem gate" — falso positivo
  // pego na primeira execução.
  /\brecorteDePagina\([\s\S]*?,\s*"CONSULTAR_[A-Z_]+"\s*\)/,
  // ⚠️ O PAINEL INICIAL COMPÕE POR PERMISSÃO em vez de recusar: pergunta à política se pode
  // ler relatórios e OMITE os indicadores quando não pode. É a política consultada, não
  // contornada — e o dado só é lido quando a resposta é sim.
  /\btemLeituraDoEnte\(\s*"CONSULTAR_[A-Z_]+"\s*\)/,
  /\btelaExigeLeituraDoEnte\(\s*"CONSULTAR_[A-Z_]+"\s*\)/,
  /\btelaExigeLeituraEmAlgumEscopo\(\s*"CONSULTAR_[A-Z_]+"\s*\)/,
  /\bexigirLeituraDoEnte\(\s*"CONSULTAR_[A-Z_]+"\s*\)/,
  /\bexigirLeituraEmAlgumEscopo\(\s*"CONSULTAR_[A-Z_]+"\s*\)/,
  /\bautorizarLeituraDoRegistro\(/,
  // ⚠️ O DETALHE DO EMPENHO autoriza pelo próprio registro, DENTRO da porta
  // (`lerDossieDoEmpenho` → `autorizarLeituraDoRegistroPara`). A tela declara a leitura
  // ao chamá-la; o teste do lado da porta é `test/leitura-por-acao.test.ts`.
  /\blerDossieDoEmpenho\(/,
  // ⚠️ AS ROTAS DE ANEXO respondem 404 para "não pode" e "não existe" (M22), e a área do
  // dono é cobrada dentro da porta (`entregarAnexo` → `podeLerPara`).
  /\bentregar(Anexo|LoteDoProcesso|LoteDaPessoa)\(/,
  // ⚠️ A TELA DE RECUSA recalcula a decisão a partir da sessão — ela É a política, exposta.
  /\bexigirLeitura(DoEnte|EmAlgumEscopo)Para\(/,
];

/** Portas que uma página de NAVEGAÇÃO pode importar sem ter gate: não entregam dado. */
const PORTAS_SEM_DADO = /lib\/portas\/(navegacao-permissoes|sessao)(\.js)?"/;

function varrer(dir: string, achados: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      varrer(p, achados);
      continue;
    }
    if (e.name === "page.tsx" || e.name === "route.ts") achados.push(p);
  }
}

function rel(abs: string): string {
  return abs.slice(RAIZ.length).replace(/^[\\/]/, "").replace(/\\/g, "/");
}

/** As linhas que não são comentário — a política se explica nos comentários. */
function efetivo(conteudo: string): string {
  return conteudo
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join("\n");
}

function temGate(conteudo: string): boolean {
  return GATES.some((re) => re.test(conteudo));
}

function importaPortaComDado(conteudo: string): boolean {
  const imports = [...conteudo.matchAll(/from\s+["']([^"']*lib\/portas\/[^"']*)["']/g)].map((m) => m[1]!);
  return imports.some((i) => !PORTAS_SEM_DADO.test(`${i}"`));
}

describe("a política de leitura — toda tela e rota de (areas) declara a sua leitura", () => {
  const arquivos: string[] = [];
  expect(statSync(AREAS).isDirectory()).toBe(true);
  varrer(AREAS, arquivos);

  it("a varredura enxerga as telas — senão este guard estaria verde por não achar nada", () => {
    // Medido em 2026-09-12: 140 arquivos. O limiar fica bem abaixo, e bem acima de zero.
    expect(arquivos.length).toBeGreaterThan(100);
  });

  it("tela ou rota que lê por uma porta chama um gate da política", () => {
    const infratores = arquivos
      .map(rel)
      .filter((r) => {
        const c = efetivo(readFileSync(join(RAIZ, r), "utf8"));
        return importaPortaComDado(c) && !temGate(c);
      });

    expect(
      infratores,
      "\n\n⚠️ LEITURA SEM AÇÃO DECLARADA.\n\n" +
        "Cada leitura protegida exige a ação de leitura da sua área (CONSULTAR_<ÁREA>), no " +
        "escopo pedido — orquestração V3, 4.1. Uma tela que importa uma porta de dado e não " +
        "chama gate nenhum entrega o dado a qualquer sessão.\n\n" +
        "Use, conforme a natureza da leitura:\n" +
        "  · dado do ENTE (sem dimensão de unidade)  -> telaExigeLeituraDoEnte(acao) / exigirLeituraDoEnte(acao) em rota;\n" +
        "  · lista com dimensão de UNIDADE            -> recorteDePagina(sp, acao);\n" +
        "  · caixa por participação                   -> telaExigeLeituraEmAlgumEscopo(acao);\n" +
        "  · detalhe por id                           -> a porta autoriza pelo registro (autorizarLeituraDoRegistroPara).\n\n" +
        "Se a página é só navegação, ela não importa porta de dado — e então não precisa de gate.\n\nInfratores:\n"
    ).toEqual([]);
  });

  it("tela sem gate não importa porta de dado — a exceção é provada, não listada", () => {
    const suspeitas = arquivos
      .map(rel)
      .filter((r) => {
        const c = efetivo(readFileSync(join(RAIZ, r), "utf8"));
        return !temGate(c) && importaPortaComDado(c);
      });
    expect(suspeitas).toEqual([]);
  });

  it("os gates usam ações que EXISTEM no censo de leitura", async () => {
    const { ACOES_DE_LEITURA } = await import("../../modules/m16-travamento/acoes.js");
    const conhecidas = new Set<string>(ACOES_DE_LEITURA);
    const estranhas: string[] = [];
    for (const abs of arquivos) {
      const c = efetivo(readFileSync(abs, "utf8"));
      for (const m of c.matchAll(/"(CONSULTAR_[A-Z_]+)"/g)) {
        if (!conhecidas.has(m[1]!)) estranhas.push(`${rel(abs)}: ${m[1]}`);
      }
    }
    expect(estranhas).toEqual([]);
  });

  it("nenhuma tela do molde chama `exigirLeitura()` sem ação — o nome antigo mentia", () => {
    const voltou = arquivos
      .map(rel)
      .filter((r) => /\bexigirLeitura\(\s*\)/.test(efetivo(readFileSync(join(RAIZ, r), "utf8"))));
    expect(voltou).toEqual([]);
  });
});
