import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { arquivosDeTeste, particionar, PORTAS_DO_BANCO, precisaDeBanco } from "./particao-da-suite.js";

/**
 * ═══ A CONTA DA PARTIÇÃO FECHA ═══
 *
 * A suíte rápida existe para ser rodada a cada mudança; a completa, para o gate. O risco de
 * partir uma suíte é sempre o mesmo, e não é lentidão: é o arquivo que some das DUAS
 * partições e passa a não rodar em lugar nenhum — verde por ausência.
 *
 * ⚠️ É A MESMA CLASSE DO `test/` FORA DO TSCONFIG, que escondia 12 erros reais, e do
 * scanner que enumerava `"modules"` à mão e parou de enxergar os tribunais. Buraco na rede
 * é pior que ausência de rede.
 */
const RAIZ = resolve(import.meta.dirname, "..");

describe("a partição da suíte", () => {
  it("a união das duas partições é o conjunto INTEIRO, e a interseção é vazia", () => {
    const todos = arquivosDeTeste(RAIZ);
    const { rapida, lenta } = particionar(RAIZ);

    expect(todos.length, "nenhum arquivo de teste encontrado — o scanner cegou").toBeGreaterThan(100);
    expect([...rapida, ...lenta].sort()).toEqual([...todos].sort());
    expect(rapida.filter((a) => lenta.includes(a))).toEqual([]);
    expect(rapida.length, "a partição rápida ficou vazia").toBeGreaterThan(0);
    expect(lenta.length, "a partição lenta ficou vazia").toBeGreaterThan(0);
  });

  /**
   * ⚠️ ESTE É O TESTE QUE IMPORTA. A configuração rápida NÃO provisiona banco: nem
   * `globalSetup`, nem `setupFiles`. Um arquivo que precise de banco e caia na partição
   * rápida falharia — ou, se o `beforeEach` engolisse o erro, passaria por VACUIDADE.
   */
  it("nenhum arquivo da partição rápida alcança uma porta do banco", () => {
    const { rapida } = particionar(RAIZ);
    const infratores = rapida.filter((a) => precisaDeBanco(a, RAIZ));
    expect(
      infratores,
      "\n\n⚠️ ARQUIVO COM BANCO NA PARTIÇÃO RÁPIDA.\n\n" +
        "A configuração rápida não provisiona banco nenhum. Se o caminhamento de imports " +
        "não alcançou a porta, é porque ela foi aberta por um caminho que ele não segue — " +
        "um import dinâmico montado por string, ou um `PrismaClient` instanciado no " +
        "próprio arquivo de teste.\n\nInfratores:\n"
    ).toEqual([]);
  });

  /**
   * ⚠️ O CAMINHAMENTO SÓ ENXERGA O QUE PASSA PELAS PORTAS DECLARADAS. Um teste que
   * instancie `new PrismaClient()` por conta própria escaparia — e o modo de falha seria
   * silencioso. Esta é a rede da rede.
   */
  it("nenhum teste instancia PrismaClient por conta própria — todos passam pelas portas", () => {
    const fora: string[] = [];
    // ⚠️ ELE MESMO FICA DE FORA: este arquivo CITA `new PrismaClient()` na prosa e na
    // mensagem de erro, e um guard que se acusa é um guard que alguém desliga. Ele não
    // abre banco nenhum — a partição o coloca na metade rápida, e é lá que ele roda.
    const O_CANONICO = "test/particao-da-suite.test.ts";
    for (const a of arquivosDeTeste(RAIZ)) {
      if (a === O_CANONICO) continue;
      const fonte = readFileSync(join(RAIZ, a), "utf8");
      for (const [i, linha] of fonte.split("\n").entries()) {
        if (linha.trim().startsWith("//")) continue;
        if (/new\s+PrismaClient\s*\(/.test(linha)) fora.push(`${a}:${i + 1}`);
      }
    }
    expect(
      fora,
      "\n\n⚠️ UM TESTE ABRE BANCO SEM PASSAR PELAS PORTAS.\n\n" +
        `As portas são: ${PORTAS_DO_BANCO.join(", ")}. Elas existem para duas coisas: ` +
        "apontar o client para o banco de TESTE (e não para o de dev) e permitir que a " +
        "partição da suíte saiba quem é lento. Um `new PrismaClient()` solto perde as " +
        "duas.\n\nSítios:\n"
    ).toEqual([]);
  });

  it("as portas declaradas existem — a lista não pode apontar para o vazio", () => {
    for (const porta of PORTAS_DO_BANCO) {
      expect(() => readFileSync(join(RAIZ, porta), "utf8"), porta).not.toThrow();
    }
  });
});
