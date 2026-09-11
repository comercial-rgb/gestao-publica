import { execFileSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { DIRETORIOS_INERTES } from "../test/raizes-dominio.js";

/**
 * ═══ QUE ARQUIVOS `.ts`/`.tsx` NÃO ESTÃO EM NENHUM DOS TRÊS TSCONFIG ═══
 *
 * ⚠️ BURACO NA REDE É PIOR QUE AUSÊNCIA DE REDE. Quem vê três `typecheck` verdes conclui
 * que o repositório inteiro compila. Se metade dele não está em config nenhum, os três
 * verdes são verdadeiros e a conclusão é falsa.
 *
 * A varredura de 2026-09-10 encontrou **34 arquivos fora dos três**, e dois achados
 * doeram:
 *
 *   · `middleware.ts` — código de PRODUÇÃO que roda em TODA requisição, e que o
 *     compilador nunca tinha olhado;
 *   · `prisma/seed/**` — 29 arquivos, dos quais **cinco são `.test.ts` que a suíte
 *     EXECUTA**. Testes rodando sem nunca terem sido compilados.
 *
 * Antes disso, a mesma varredura feita à mão já tinha achado `test/` inteiro fora — e
 * `test/` escondia 12 erros reais, um deles um import sem extensão que fazia um módulo
 * inteiro resolver como `any` e apagava três erros de tipo por tabela.
 *
 * ⚠️ A LISTA DE ARQUIVOS VEM DO PRÓPRIO `tsc` (`--listFilesOnly`), e não de uma
 * reimplementação das regras de `include`/`exclude`. Reimplementá-las criaria a segunda
 * verdade sobre "este arquivo está coberto?", e ela divergiria do compilador exatamente
 * nos casos difíceis — que são os que importam.
 */

const RAIZ = resolve(import.meta.dirname, "..");

export const CONFIGS = [
  "tsconfig.backend.json",
  "tsconfig.json",
  "tsconfig.scripts.json",
] as const;

/** Diretórios que não contêm fonte nossa. */
const IGNORADOS = new Set([
  "node_modules",
  ".next",
  ".git",
  "var",
  // O client do Prisma é GERADO — recompilá-lo não diz nada sobre o nosso código, e ele
  // é grande o bastante para dominar qualquer medição.
  "generated",
  // ⚠️ OS DIRETÓRIOS INERTES (`doador/`) — A ÚNICA EXCLUSÃO QUE ESTE VARREDOR PRECISOU
  // GANHAR PELA ABSORÇÃO, e foi MEDIDA antes de escrita.
  //
  // Importar `doador/saas-municipal` deixou este varredor vermelho com **199 descobertos,
  // os 199 dentro de `doador/` e ZERO fora** — e ele estava certo: nenhum dos três
  // tsconfig cobre aquele código, porque nenhum deve cobrir. Os três `include` são listas
  // brancas e já não o alcançavam; o que quebrou foi só a afirmação deste arquivo, que
  // varre o repositório INTEIRO por construção (é justamente o que o torna útil: um
  // varredor que só olhasse as raízes conhecidas nunca teria achado `middleware.ts`).
  //
  // ⚠️ A EXCLUSÃO NÃO ENFRAQUECE A REDE. O que este varredor promete é "todo arquivo NOSSO
  // está em algum config". `doador/` não é nosso: é repositório absorvido, inerte por
  // decisão, e o guard de inércia (`test/inercia-do-doador.test.ts`) é quem prova que ele
  // continua desligado. Sem esta linha, a alternativa real não seria mais rigor — seria
  // um varredor cronicamente vermelho, e varredor cronicamente vermelho deixa de ser lido.
  ...DIRETORIOS_INERTES,
]);

function arquivosDoConfig(config: string): ReadonlySet<string> {
  const saida = execFileSync(
    "npx",
    ["tsc", "-p", config, "--listFilesOnly", "--noEmit"],
    { cwd: RAIZ, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  const cobertos = new Set<string>();
  for (const linha of saida.split("\n")) {
    const p = linha.trim();
    if (p === "" || p.includes("/node_modules/")) continue;
    if (!p.startsWith(`${RAIZ}/`)) continue;
    cobertos.add(relative(RAIZ, p));
  }
  return cobertos;
}

function fontesDoRepositorio(dir = RAIZ): readonly string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(dir)) {
    if (IGNORADOS.has(entrada) || entrada.startsWith(".")) continue;
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) {
      achados.push(...fontesDoRepositorio(caminho));
      continue;
    }
    if (!/\.tsx?$/.test(entrada) || entrada.endsWith(".d.ts")) continue;
    const rel = relative(RAIZ, caminho);
    if (rel.startsWith("prisma/generated")) continue;
    achados.push(rel);
  }
  return achados;
}

export interface Cobertura {
  readonly total: number;
  readonly cobertos: number;
  readonly descobertos: readonly string[];
  readonly porConfig: Readonly<Record<string, number>>;
}

export function medirCobertura(): Cobertura {
  const todos = new Set(fontesDoRepositorio());
  const cobertos = new Set<string>();
  const porConfig: Record<string, number> = {};

  for (const config of CONFIGS) {
    const s = arquivosDoConfig(config);
    porConfig[config] = s.size;
    for (const f of s) cobertos.add(f);
  }

  const descobertos = [...todos].filter((f) => !cobertos.has(f)).sort();
  return {
    total: todos.size,
    cobertos: todos.size - descobertos.length,
    descobertos,
    porConfig,
  };
}

// Executável direto: `npx tsx scripts/cobertura-de-tsconfig.ts`
if (process.argv[1]?.endsWith("cobertura-de-tsconfig.ts") === true) {
  const c = medirCobertura();
  for (const [cfg, n] of Object.entries(c.porConfig)) {
    console.log(`${cfg}: ${n} arquivos`);
  }
  console.log(`\ntotal ${c.total} · cobertos ${c.cobertos} · descobertos ${c.descobertos.length}`);
  for (const d of c.descobertos) console.log(`  · ${d}`);
  process.exitCode = c.descobertos.length === 0 ? 0 : 1;
}
