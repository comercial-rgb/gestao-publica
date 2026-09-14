import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * O MAPA DE ACESSO — DERIVADO DAS ROTAS REAIS (V6.1 §2).
 *
 * ⚠️ ELE NÃO É UMA LISTA MANTIDA À MÃO, e é essa a diferença que importa. Uma tabela escrita à
 * parte envelhece em silêncio: a rota nova não entra nela, e o documento passa a afirmar uma
 * fronteira que o código não tem. Este script LÊ `app/` e reporta, rota a rota, qual portão de
 * leitura está LITERALMENTE escrito no arquivo — o mesmo efeito que o guard `leitura-exige-acao`
 * cobra, e não o comentário que diz cobrar.
 *
 * ⚠️ E ELE NÃO INVENTA CATEGORIA. Cada rota cai numa destas, pelo que o arquivo diz:
 *   · PUBLICA          — fora de `(areas)`, sem portão; qualquer visitante alcança;
 *   · TITULAR          — portão `CONSULTAR_PORTAL_DO_SERVIDOR` ou `CONSULTAR_MEUS_SERVICOS` (V6.2 P3):
 *                        a porta recorta pela PESSOA da sessão (e, nos serviços, pelas representações
 *                        vigentes hoje); nenhuma função dela recebe id de pessoa;
 *   · OPERADOR:<ACAO>  — portão de leitura por ação nomeada;
 *   · SEM-PORTAO-DECLARADO — dentro de `(areas)` e sem chamada literal. É ACHADO, não omissão do
 *                        script: ou a página tem o portão noutro lugar (e o guard reprova), ou ela
 *                        está aberta a qualquer sessão autenticada.
 *
 * O que este mapa NÃO faz: dizer quais CAMPOS cada rota expõe. Projeção pública por allowlist de
 * campos é frente própria (`PROJECAO-PUBLICA-POR-CAMPO`), e afirmar aqui que ela existe seria
 * exatamente o que o adendo proíbe.
 *
 * Uso: `npx tsx scripts/mapa-de-acesso.ts [--gravar]` (sem `--gravar`, só imprime o resumo).
 */

const RAIZ = new URL("..", import.meta.url).pathname;
const APP = join(RAIZ, "app");
const SAIDA = join(RAIZ, "docs", "mapa-de-acesso.md");

interface Entrada {
  readonly rota: string;
  readonly arquivo: string;
  readonly tipo: "pagina" | "rota-http";
  readonly categoria: string;
  readonly dinamica: boolean;
}

function arquivos(dir: string, achados: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) arquivos(p, achados);
    else if (e.name === "page.tsx" || e.name === "route.ts") achados.push(p);
  }
  return achados;
}

/** A rota que o Next serve: grupos `(x)` somem, `[id]` fica como está. */
function rotaDe(arquivo: string): string {
  const rel = relative(APP, arquivo).split(sep).slice(0, -1);
  const partes = rel.filter((p) => !(p.startsWith("(") && p.endsWith(")")));
  return `/${partes.join("/")}`.replace(/\/$/, "") || "/";
}

const DO_TITULAR = new Set(["CONSULTAR_PORTAL_DO_SERVIDOR", "CONSULTAR_MEUS_SERVICOS"]);

function categoriaDe(arquivo: string, fonte: string): string {
  const leitura = /exigirLeitura\(\s*"([A-Z_]+)"/.exec(fonte);
  if (leitura !== null) {
    return DO_TITULAR.has(leitura[1] as string) ? "TITULAR" : `OPERADOR:${leitura[1] as string}`;
  }
  const doEnte = /telaExigeLeituraDoEnte\(\s*"([A-Z_]+)"/.exec(fonte);
  if (doEnte !== null) return DO_TITULAR.has(doEnte[1] as string) ? "TITULAR" : `OPERADOR:${doEnte[1] as string} (ente)`;
  const algum = /exigirLeituraEmAlgumEscopo\(\s*"([A-Z_]+)"/.exec(fonte);
  if (algum !== null) return `OPERADOR:${algum[1] as string} (algum escopo)`;
  // ⚠️ AQUI A AÇÃO É O SEGUNDO ARGUMENTO — `recorteDePagina(sp, "CONSULTAR_X")`. A primeira
  // versão deste script procurava no primeiro e classificou 44 páginas como SEM-PORTAO. Era
  // defeito DO INSTRUMENTO: as páginas tinham portão, e o mapa dizia que não. Instrumento que
  // acusa errado é pior que instrumento nenhum — ele manda consertar o que não está quebrado.
  // ⚠️ `[^)]*?` NÃO SERVE AQUI, e este foi o segundo defeito do instrumento: o argumento real é
  // `recorteDePagina(Object.fromEntries(req.nextUrl.searchParams), "CONSULTAR_DESPESA")` — há um
  // `)` ANTES da ação, e a classe negada parava nele. Dez rotas de PDF apareciam como sem portão.
  const recorte = /recorteDePagina\([\s\S]{0,240}?"([A-Z_]+)"/.exec(fonte);
  if (recorte !== null) return `OPERADOR:${recorte[1] as string} (por unidade)`;
  const exercicio = /exercicioAutorizado\([\s\S]{0,240}?"([A-Z_]+)"/.exec(fonte);
  if (exercicio !== null) return `OPERADOR:${exercicio[1] as string} (ente)`;
  const doEnteDireto = /exigirLeituraDoEnte\(\s*"([A-Z_]+)"/.exec(fonte);
  if (doEnteDireto !== null) return DO_TITULAR.has(doEnteDireto[1] as string) ? "TITULAR" : `OPERADOR:${doEnteDireto[1] as string} (ente)`;
  const emAlgum = /telaExigeLeituraEmAlgumEscopo\(\s*"([A-Z_]+)"/.exec(fonte);
  if (emAlgum !== null) return `OPERADOR:${emAlgum[1] as string} (algum escopo)`;
  // ⚠️ AUTORIZAÇÃO PELO REGISTRO DONO — o download de anexo não tem ação de ÁREA: quem manda é a
  // permissão sobre o processo, o contrato ou o bem a que o anexo pertence, resolvida no servidor.
  // Chamar isso de "sem portão" seria acusar errado; chamá-lo de área seria afirmar demais.
  if (/entregarLote(DaPessoa|DoProcesso)|anexoAutorizado|entregarAnexo/.test(fonte)) return "POR-REGISTRO-DONO";
  // A porta é que resolve a autorização pelo REGISTRO, e a página só a chama: `lerDossieDoEmpenho`
  // (M05) devolve `EscopoDeLeituraError` quando a unidade do empenho não é a do usuário.
  if (/lerDossieDoEmpenho|EscopoDeLeituraError/.test(fonte) && /lib\/portas\//.test(fonte)) return "POR-REGISTRO-DONO";
  // ⚠️ O SELETOR REFERENCIADO (V6.2) cobra a leitura DO CATÁLOGO pedido — a ação sai de
  // `leituraDoCatalogo(catalogo)` e vai a `exigirLeituraEmAlgumEscopoPara` antes de ler parâmetro.
  // A ação é variável, e por isso as regex de ação literal acima não a veem.
  if (/leituraDoCatalogo\(/.test(fonte) && /exigirLeituraEmAlgumEscopoPara\(/.test(fonte)) return "OPERADOR:leitura do catálogo pedido (algum escopo)";
  const naoAutorizado = /recorteNaoAutorizado\(/.test(fonte);
  if (naoAutorizado) return "RECORTE-NAO-AUTORIZADO (declarado)";
  // ⚠️ A MESA PERGUNTA ANTES DE MOSTRAR. `temLeituraDoEnte` não recusa: ele responde "pode?" por
  // área, e a mesa omite o bloco de quem não pode. É autorização por BLOCO, não por página — e
  // por isso a página em si não tem portão. Confundi-la com furo encheria o mapa de ruído.
  if (/temLeituraDoEnte\(/.test(fonte)) return "MESA (cada bloco pergunta se pode, e some se não)";
  // Autosserviço da PRÓPRIA conta (trocar a minha senha): não lê dado de área nenhuma, e a
  // identidade vem da sessão dentro da Server Action.
  if (/lib\/portas\//.test(fonte) === false && /Form[A-Z]/.test(fonte)) return "AUTOSSERVICO DA PROPRIA CONTA";
  if (!arquivo.includes(`${sep}(areas)${sep}`)) return "PUBLICA";
  // ⚠️ LANDING NÃO É PÁGINA SEM PORTÃO: ela não lê dado nenhum — monta cartões a partir de
  // `lib/navegacao`, e o MENU já é recortado no servidor pela mesma `PermissaoDePerfil`
  // (`menu-contra-o-servidor.test.ts`). Classificá-la como furo encheria o mapa de falso positivo.
  const soNavegacao = /from "[^"]*lib\/navegacao"/.test(fonte) && !/lib\/portas\//.test(fonte);
  if (soNavegacao) return "LANDING (só navegação; o menu é recortado no servidor)";
  return "SEM-PORTAO-DECLARADO";
}

function main(): void {
  const entradas: Entrada[] = arquivos(APP)
    .map((arquivo) => {
      const fonte = readFileSync(arquivo, "utf8");
      const rota = rotaDe(arquivo);
      return {
        rota,
        arquivo: relative(RAIZ, arquivo),
        tipo: arquivo.endsWith("route.ts") ? ("rota-http" as const) : ("pagina" as const),
        categoria: categoriaDe(arquivo, fonte),
        dinamica: rota.includes("["),
      };
    })
    .sort((a, b) => a.rota.localeCompare(b.rota));

  const porCategoria = new Map<string, number>();
  for (const e of entradas) porCategoria.set(e.categoria, (porCategoria.get(e.categoria) ?? 0) + 1);

  const publicas = entradas.filter((e) => e.categoria === "PUBLICA");
  const semPortao = entradas.filter((e) => e.categoria === "SEM-PORTAO-DECLARADO");

  const linhas: string[] = [
    "# Mapa de acesso — derivado das rotas reais",
    "",
    "> ⚠️ **GERADO POR `scripts/mapa-de-acesso.ts`. Não edite à mão.** Uma tabela mantida à parte",
    "> envelhece em silêncio: a rota nova não entra nela, e o documento passa a afirmar uma",
    "> fronteira que o código não tem. Aqui cada linha vem do que o ARQUIVO da rota diz.",
    "",
    "A categoria sai do portão de leitura **literalmente escrito** no arquivo — o mesmo efeito que",
    "o guard `leitura-exige-acao` cobra. `SEM-PORTAO-DECLARADO` é achado, não lacuna do script.",
    "",
    "Este mapa **não** diz quais CAMPOS cada rota expõe: projeção pública por allowlist de campos é",
    "frente própria (`PROJECAO-PUBLICA-POR-CAMPO`), e afirmá-la aqui seria inventar cobertura.",
    "",
    `Rotas encontradas: **${entradas.length}** (${entradas.filter((e) => e.tipo === "pagina").length} páginas, ${entradas.filter((e) => e.tipo === "rota-http").length} rotas HTTP).`,
    "",
    "## Resumo por categoria",
    "",
    "| Categoria | Rotas |",
    "|---|---|",
    ...[...porCategoria.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `| ${c} | ${n} |`),
    "",
    "## As rotas PÚBLICAS — o que um visitante sem sessão alcança",
    "",
    "| Rota | Arquivo |",
    "|---|---|",
    ...publicas.map((e) => `| \`${e.rota}\` | \`${e.arquivo}\` |`),
    "",
  ];

  if (semPortao.length > 0) {
    linhas.push(
      "## ⚠️ Sob `(areas)` e SEM portão declarado",
      "",
      "Cada uma destas é uma pergunta aberta: ou o portão está noutro lugar (e o guard reprova), ou",
      "a página está aberta a qualquer sessão autenticada.",
      "",
      "| Rota | Arquivo |",
      "|---|---|",
      ...semPortao.map((e) => `| \`${e.rota}\` | \`${e.arquivo}\` |`),
      ""
    );
  }

  linhas.push("## Todas as rotas", "", "| Rota | Tipo | Categoria de acesso |", "|---|---|---|");
  for (const e of entradas) linhas.push(`| \`${e.rota}\` | ${e.tipo} | ${e.categoria} |`);
  linhas.push("");

  const texto = linhas.join("\n");
  if (process.argv.includes("--gravar")) {
    writeFileSync(SAIDA, texto, "utf8");
    console.log(`gravado em ${SAIDA}`);
  }
  console.log(`\n${entradas.length} rota(s). Por categoria:`);
  for (const [c, n] of [...porCategoria.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${c.padEnd(46)} ${n}`);
  console.log(`\nPúblicas: ${publicas.length}. Sem portão declarado sob (areas): ${semPortao.length}.`);
}

main();
