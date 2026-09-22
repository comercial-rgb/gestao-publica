import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { criarM03Deps } from "../modules/m03-creditos/adapter-prisma.js";
import { criarM03DepsAmarrado } from "../modules/m12-relatorios/adapter-m03.js";

/**
 * ═══ A AMARRAÇÃO DO RECURSO NOVO TEM DE ESTAR LIGADA NA PORTA (V11 V8.10) ═══
 *
 * ⚠️ O DEFEITO QUE ISTO FECHA, E ELE ESTAVA VERDE EM OITO TESTES. O M03 pergunta o superávit, o
 * excesso e a operação de crédito por PORT, e documenta que port ausente é **fail-open com log**
 * ("um módulo que não está montado não pode paralisar o ente"). `criarM03DepsAmarrado` monta os
 * três; `criarM03Deps` não monta nenhum.
 *
 * `lib/portas/creditos.ts` montava o SEM AMARRAÇÃO. Consequência medida: todo crédito por recurso
 * novo aberto PELA TELA era conferido só contra a disponibilidade DECLARADA — o número digitado —
 * enquanto `m03-superavit.test.ts` e `m03-recurso-novo.test.ts` provavam a amarração contra os
 * fatos montando as deps que só ELES montavam. Oito testes verdes sobre um caminho que a
 * aplicação não percorria.
 *
 * ⚠️ E É POR ISSO QUE ESTE GUARD OLHA A FONTE. O que se quer afirmar é sobre a MONTAGEM: qual das
 * duas funções a camada que o usuário percorre chama. Um teste de comportamento na porta exigiria
 * sessão, banco e um decreto — e ainda assim poderia passar por um caminho que não é o da tela.
 * Aqui a propriedade é direta e a acusação é imediata.
 */

const RAIZ = fileURLToPath(new URL("..", import.meta.url));

/** As camadas que o usuário percorre: a porta e a superfície. */
const ZONAS = ["lib", "app"] as const;

function arquivosTs(dir: string): readonly string[] {
  const achados: string[] = [];
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === ".next") continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) achados.push(...arquivosTs(caminho));
    else if (/\.tsx?$/.test(nome)) achados.push(caminho);
  }
  return achados;
}

/**
 * ⚠️ A BUSCA IGNORA COMENTÁRIO — e isso não é detalhe. O arquivo que este guard vigia EXPLICA,
 * num comentário de dez linhas, por que não usa `criarM03Deps`. Uma busca ingênua casaria com a
 * explicação e acusaria justamente quem fez certo: é o "não atestar pela papelada" ao contrário.
 */
const semComentarios = (conteudo: string): string =>
  conteudo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("as deps do M03 na porta vêm com a amarração ligada", () => {
  it("t1 — nenhum arquivo de lib/ ou app/ monta as deps SEM amarração", () => {
    const culpados: string[] = [];
    for (const zona of ZONAS) {
      for (const caminho of arquivosTs(join(RAIZ, zona))) {
        const corpo = semComentarios(readFileSync(caminho, "utf8"));
        // `criarM03Deps(` casaria com `criarM03DepsAmarrado(`? Não: o nome é outro, e a
        // fronteira `\(` garante a distinção sem depender de ordem de teste.
        if (/\bcriarM03Deps\s*\(/.test(corpo)) culpados.push(caminho.slice(RAIZ.length));
      }
    }
    expect(culpados).toEqual([]);
  });

  it("t2 — e a porta do crédito importa, de fato, a montagem AMARRADA", () => {
    // ⚠️ O NEGATIVO DE t1 NÃO BASTA SOZINHO: um arquivo que não monta deps nenhuma também
    // passa em t1. Esta afirma o positivo no arquivo que importa.
    const porta = semComentarios(readFileSync(join(RAIZ, "lib", "portas", "creditos.ts"), "utf8"));
    expect(porta).toMatch(/criarM03DepsAmarrado/);
  });

  /**
   * ⚠️ E A PROVA DE QUE A DIFERENÇA ENTRE AS DUAS MONTAGENS É REAL **NÃO MORA AQUI** — de
   * propósito. `M03Deps` não carrega os ports: eles ficam na closure do repositório, e nenhuma
   * inspeção do objeto os enxerga. Quem prova o efeito é `m03-superavit.test.ts` t5 ("port
   * DESLIGADO = fail-open silencioso; religado, barra"), contra Postgres — e ele vira vermelho no
   * dia em que alguém ligar os ports dentro de `criarM03Deps`, que é exatamente o dia em que
   * este arquivo passaria a vigiar uma distinção que não existe mais.
   */
});
