import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { conferenciaAprovada, conferir, digestoDeTipos, explicarRecusa, inventarioDeRotas } from "./conferencia-de-tipos.mjs";

/**
 * ═══ O CANDIDATO DE RELEASE, IDENTIFICADO PELO CONTEÚDO (V9 N0.4) ═══
 *
 * ⚠️ O QUE ISTO CONSERTA. "O build de `caa598e` passou em 37 s" não identifica artefato
 * nenhum quando a árvore tem alterações não commitadas — e nesta sessão ela tem. Dois
 * conteúdos diferentes moram sob o mesmo SHA, e foi assim que um build aprovado passou a
 * ser citado como aprovação de telas que não estavam dentro dele.
 *
 * Aqui o candidato tem NOME PRÓPRIO: `<sha curto>+<digesto do conteúdo>`. O digesto é o
 * mesmo da conferência de tipos, então a pergunta "os tipos deste artefato foram
 * conferidos?" tem resposta de sim ou não, e não de memória.
 *
 * ⚠️ E A ORDEM É DELIBERADA: exigir a prova ANTES de gastar o build. Um build de minutos
 * que morre no fim por falta de aprovação é o mesmo tempo perdido que a válvula existia
 * para poupar.
 */

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const PASTA = join(RAIZ, ".registro-de-execucao", "releases");

function git(...args) {
  return (spawnSync("git", args, { cwd: RAIZ, encoding: "utf8" }).stdout ?? "").trim();
}

/** O artefato em disco: quantos arquivos e qual o hash do conjunto. */
function digestoDoArtefato(dir) {
  const h = createHash("sha256");
  let n = 0;
  const varrer = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = join(d, e.name);
      // `cache` é conteúdo do WEBPACK entre builds, não do artefato: incluí-lo faria dois
      // builds do mesmo código terem digestos diferentes.
      if (e.isDirectory()) {
        if (e.name === "cache") continue;
        varrer(p);
      } else {
        h.update(relative(dir, p));
        h.update(readFileSync(p));
        n += 1;
      }
    }
  };
  varrer(dir);
  return { digesto: h.digest("hex"), arquivos: n };
}

const sha = git("rev-parse", "HEAD");
const sujo = git("status", "--porcelain") !== "";
const { digesto } = digestoDeTipos();
const nome = `${sha.slice(0, 7)}+${digesto.slice(0, 12)}`;

console.error(`[release] candidato ........ ${nome}`);
console.error(`[release] sha .............. ${sha}${sujo ? " (ARVORE SUJA — o sha sozinho nao identifica este conteudo)" : ""}`);
console.error(`[release] digesto do fonte . ${digesto}`);

// (1) A PROVA DOS TIPOS, ANTES DO BUILD.
const prova = conferenciaAprovada();
if (!prova.ok) {
  console.error(explicarRecusa(prova));
  process.exit(1);
}
console.error(`[release] tipos ............ APROVADOS em ${prova.quando} (${prova.duracaoMs} ms)`);

// (2) O BUILD, com a válvula ligada — que, por sua vez, reconfere a prova sozinha.
const inicio = Date.now();
const r = spawnSync("npx", ["next", "build"], {
  cwd: RAIZ,
  stdio: ["ignore", "inherit", "inherit"],
  env: { ...process.env, PULAR_CONFERENCIA_DE_TIPOS_DO_BUILD: "1" },
});
const duracaoMs = Date.now() - inicio;

if (r.signal !== null && r.signal !== undefined) {
  console.error(`[release] ⚠️ o build foi MORTO pelo sinal ${r.signal} em ${duracaoMs} ms. Nao e aprovacao: e execucao que nao terminou.`);
  process.exit(128);
}
if (r.status !== 0) {
  console.error(`[release] build REPROVADO (codigo ${r.status}) em ${duracaoMs} ms. Nenhum candidato gravado.`);
  process.exit(r.status ?? 1);
}

/**
 * ═══ (3) OS TIPOS DE ROTA, CONFERIDOS CONTRA AS ROTAS FINAIS (V9 N0.4) ═══
 *
 * ⚠️ AQUI HAVIA UMA COBRA MORDENDO O RABO, e ela precisa ficar escrita. `.next/types/**` está no
 * `include` do `tsconfig.json` e é **gerado pelo próprio build**. Então:
 *
 *   · conferir os tipos ANTES do build confere os tipos de rota do build ANTERIOR;
 *   · e pôr `.next/types` no digesto faria o build que gera os tipos invalidar a aprovação que
 *     autoriza o build.
 *
 * Foi exatamente o que apareceu em 16/09/2026, ao mover as páginas públicas para um grupo de
 * rotas: o `tsc` acusou vinte e dois erros em `.next/types/**` apontando para caminhos de rota
 * que já não existiam. Os erros eram do artefato velho, não do código — mas um deles NÃO era:
 * um import de verdade tinha quebrado na mudança, e ele estava no meio dos outros.
 *
 * A saída é a ordem: o digesto cobre os ARQUIVOS DE ROTA (que estão sob `app/`, um a um), o
 * build regenera `.next/types`, e então o `tsc` roda **de novo** — agora contra as rotas finais.
 * O conteúdo não mudou, então o digesto é o mesmo e a aprovação continua sendo a mesma; o que
 * esta segunda passagem acrescenta é a única coisa que faltava: a certeza de que os tipos de
 * rota conferidos são os do artefato que está sendo promovido.
 */
console.error(`[release] reconferindo os tipos contra os tipos de rota recem-gerados...`);
const codigoDaReconferencia = conferir();
if (codigoDaReconferencia !== 0) {
  console.error(
    `\n[release] ⚠️ O BUILD PASSOU E OS TIPOS DE ROTA NAO. O artefato existe em disco e NAO foi ` +
      `promovido: as rotas finais nao casam com o que foi conferido antes do build. Nenhum ` +
      `candidato gravado.`
  );
  process.exit(codigoDaReconferencia);
}

// (4) O REGISTRO DO CANDIDATO.
const artefato = digestoDoArtefato(join(RAIZ, ".next"));
mkdirSync(PASTA, { recursive: true });
const registro = {
  candidato: nome,
  quando: new Date().toISOString(),
  sha,
  arvoreSuja: sujo,
  digestoDoFonte: digesto,
  digestoDoArtefato: artefato.digesto,
  arquivosDoArtefato: artefato.arquivos,
  buildMs: duracaoMs,
  tiposAprovadosEm: prova.quando,
  tiposEm: prova.duracaoMs,
  tiposDeRotaReconferidosAposOBuild: true,
  node: process.version,
  rotas: inventarioDeRotas(),
  // ⚠️ O QUE ESTE REGISTRO **NAO** DIZ, escrito aqui para nao ser lido como se dissesse:
  // que a suite passou, que os percursos rodaram, que a aplicacao foi instalada em lugar
  // nenhum. Ele diz que ESTE conteudo compila e builda. O resto tem evidencia propria.
  naoAtesta: [
    "suite de testes",
    "suite sob outro fuso",
    "percursos de navegador",
    "instalacao ou upgrade em banco",
    "publicacao ou implantacao",
  ],
};
writeFileSync(join(PASTA, `${nome}.json`), JSON.stringify(registro, null, 1));
console.error(`[release] BUILD OK em ${duracaoMs} ms · artefato ${artefato.digesto.slice(0, 12)} (${artefato.arquivos} arquivos)`);
console.error(`[release] candidato gravado em ${relative(RAIZ, join(PASTA, `${nome}.json`))}`);
