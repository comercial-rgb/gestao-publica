import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * V39-R3 (R3-029) — TODA LISTA DO MOLDE EXPORTA O CONJUNTO INTEIRO, COM A LEITURA DA PRÓPRIA TELA.
 *
 * A rota `/exportar/[recurso]` lê pelo registro `EXPORTACOES_DO_MOLDE`. A propriedade: cada página que monta
 * `ListaDeRecurso` tem entrada no registro, e a entrada usa a MESMA ação de leitura e o MESMO lister da página. Sem isso,
 * o botão da lista levaria a "esta lista não tem exportação", ou — pior — a um arquivo lido com outra régua de acesso.
 * Lido do código-fonte (página e registro), sem importar as portas.
 */
const RAIZ = join(__dirname, "..");
function paginas(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) saida.push(...paginas(p));
    else if (nome === "page.tsx" && readFileSync(p, "utf8").includes("<ListaDeRecurso")) saida.push(p);
  }
  return saida;
}
const registro = readFileSync(join(RAIZ, "lib/portas/recursos/exportacao.ts"), "utf8");

describe("V39-R3 — a exportação de cada lista do molde", () => {
  const todas = paginas(join(RAIZ, "app"));

  it("acha as listas (não passa por vacuidade)", () => {
    expect(todas.length).toBeGreaterThanOrEqual(58);
  });

  it("cada lista tem entrada com a mesma leitura e o mesmo lister da tela", () => {
    const divergentes: string[] = [];
    for (const f of todas) {
      const s = readFileSync(f, "utf8");
      const def = /definicao=\{([A-Z_0-9]+)\}/.exec(s)?.[1] ?? "?";
      const lister = /(listar[A-Za-z0-9]*)\((?:sessao, )?consulta\)/.exec(s)?.[1] ?? "?";
      const leitura = /(?:exigirLeitura|telaExigeLeituraEmAlgumEscopo)\("([A-Z_]+)"\)/.exec(s)?.[1] ?? "?";
      // O bloco EXATO da entrada: da chave dela até a próxima chave (ou o fim do objeto).
      const inicio = registro.indexOf(`  [${def}.nome]:`);
      const fim = inicio < 0 ? -1 : registro.slice(inicio + 1).search(/\n {2}\[[A-Z_0-9]+\.nome\]:|\n\};/);
      const bloco = inicio < 0 || fim < 0 ? "" : registro.slice(inicio, inicio + 1 + fim);
      const ok = bloco.includes(`definicao: ${def},`) && bloco.includes(`("${leitura}")`) && new RegExp(`\\b${lister}\\b`).test(bloco);
      if (!ok) divergentes.push(`${relative(RAIZ, f)}: ${def} / ${leitura} / ${lister}`);
    }
    expect(divergentes).toEqual([]);
  });
});
