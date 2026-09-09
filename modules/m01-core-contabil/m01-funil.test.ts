import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { raizesExistentes, RAIZES_DE_CODIGO } from "../../test/raizes-dominio.js";

/**
 * O GREP-TESTE DO FUNIL — e ele é a única coisa que MANTÉM o funil sendo funil.
 *
 * ═══ POR QUE ELE EXISTE ═══
 * `lancarNoRazao` (m01/razao.ts) é o ponto único por onde todo lançamento contábil passa —
 * e é dentro dele que mora o travamento de competência (TR 4.52/4.53/4.54).
 *
 * Um funil só é funil se for o ÚNICO. Este bloco migrou 19 escritores diretos para ele; o
 * 20º — o do próximo módulo — vai ser escrito por alguém que não leu este arquivo, e vai
 * chamar `tx.lancamentoContabil.create()` porque é o que os outros 19 faziam. Se ninguém o
 * impedir, ele reabre o furo em SILÊNCIO: o mês continua "fechado" no relatório e o razão
 * continua se movendo pela porta nova.
 *
 * ⚠️ E O SINTOMA SÓ APARECE NO TCE. Nenhum teste de negócio quebra: o lançamento é
 * gravado, o balancete fecha, as identidades da MSC fecham. O que quebra é a PROMESSA — e
 * ela só é cobrada quando alguém pergunta por que março se mexeu depois de fechado.
 *
 * Por isso a rede é um GREP, e ele roda na suíte. Mesma anatomia dos grep-testes de leitura
 * pura do M13/M14.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

/** O ÚNICO arquivo autorizado a chamar o `create` do lançamento. */
const O_FUNIL = join("modules", "m01-core-contabil", "razao.ts");

/**
 * ⚠️ AS DUAS FORMAS. `create` (o aninhado, que é como as 19 gravavam) e `createMany` (que
 * ninguém usa hoje — e é justamente por isso que ele entra: o dia em que alguém precisar de
 * performance e alcançar o `createMany`, o guard não roda, e o grep tem de estar lá).
 */
const PROIBIDO = /\.(lancamentoContabil|partidaContabil)\.(create|createMany)\(/;

function varrer(dir: string, achados: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      // O client gerado é do Prisma — ele É a API que o funil usa.
      if (e.name === "node_modules" || e.name === "generated" || e.name === ".git") continue;
      varrer(p, achados);
      continue;
    }
    if (!e.name.endsWith(".ts")) continue;

    // ⚠️ OS TESTES FICAM DE FORA — e é DELIBERADO, não uma brecha.
    //
    // Uma fixture que grava o lançamento DIRETO está DRIBLANDO O SERVIÇO de propósito: é
    // assim que este repositório prova o índice único de duplo estorno (M01), a fonte
    // ambígua do resolver (M14) e a mutação da conferência pós-evento (M08). Forjar estado
    // torto por fora é a ÚNICA maneira de provar que a rede o pega.
    //
    // O funil é uma promessa sobre o CÓDIGO DE PRODUÇÃO: nenhum caminho que o usuário
    // percorre grava no razão sem passar pelo guard. Um teste não é um caminho do usuário.
    if (e.name.endsWith(".test.ts")) continue;

    achados.push(p);
  }
}

describe("M01 — o FUNIL do razão", () => {
  it("t0: `lancamentoContabil.create` NÃO existe fora de m01/razao.ts (o funil é único)", () => {
    const arquivos: string[] = [];
    // ⚠️ AS RAÍZES VÊM DE `test/raizes-dominio.ts`, NÃO DE UMA LISTA AQUI. Enquanto esta lista era
    // literal (`["modules", "packages", ...]`), ela não incluía `adapters/` — e quando o gerador
    // SAGRES saiu de `modules/m15-sagres/` para `adapters/tribunais/tce-pb/sagres/`, o funil
    // simplesmente DEIXOU DE VARRÊ-LO. Um `lancamentoContabil.create()` escrito ali passaria sem
    // que nada acusasse, com o guard verde. Ver o docblock de `raizes-dominio.ts`.
    for (const abs of raizesExistentes(RAIZ, RAIZES_DE_CODIGO)) varrer(abs, arquivos);
    expect(arquivos.length).toBeGreaterThan(50);

    const infratores: string[] = [];

    for (const abs of arquivos) {
      const rel = abs.slice(RAIZ.length).replace(/^[\\/]/, "");
      if (rel.replace(/\\/g, "/") === O_FUNIL.replace(/\\/g, "/")) continue;

      const linhas = readFileSync(abs, "utf8").split("\n");
      linhas.forEach((linha, i) => {
        // Comentário não é código — o funil se DESCREVE nos comentários dos chamadores.
        if (/^\s*(\/\/|\*|\/\*)/.test(linha)) return;
        if (PROIBIDO.test(linha)) {
          infratores.push(`${rel}:${i + 1}  ${linha.trim()}`);
        }
      });
    }

    expect(
      infratores,
      "\n\n⚠️ O FUNIL FOI FURADO.\n\n" +
        "Todo lançamento contábil TEM de passar por `lancarNoRazao` " +
        "(modules/m01-core-contabil/razao.ts) — é lá que roda o travamento de competência " +
        "(TR 4.52/4.53/4.54). Um `create` direto grava o fato SEM passar pelo guard: o mês " +
        "continua 'fechado' no relatório e o razão se move pela porta nova, em silêncio.\n\n" +
        "Nenhum teste de negócio quebraria — o balancete fecha, a MSC fecha. O que quebra é " +
        "a PROMESSA, e ela só é cobrada quando o TCE pergunta por que março mexeu depois de " +
        "fechado.\n\n" +
        "Troque o `create` por `lancarNoRazao(tx, {...})`. Se o seu caso NÃO couber na " +
        "assinatura do funil, ABSORVA-O na assinatura — não bifurque o funil, porque dois " +
        "funis são nenhum.\n\nInfratores:\n"
    ).toEqual([]);
  });

  it("t0b: o funil está lá, e ele chama o guard de travamento ANTES de gravar", () => {
    const fonte = readFileSync(join(RAIZ, O_FUNIL), "utf8");

    // O guard roda ANTES do INSERT — um lançamento barrado não deixa rastro.
    const posGuard = fonte.indexOf("exigirCompetenciaDestravada");
    const posCreate = fonte.indexOf("lancamentoContabil.create");
    expect(posGuard).toBeGreaterThan(0);
    expect(posCreate).toBeGreaterThan(0);
    expect(
      posGuard,
      "o guard de travamento tem de rodar ANTES do create — senão o lançamento barrado " +
        "deixa rastro no banco"
    ).toBeLessThan(posCreate);
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // t2 — A COMPETÊNCIA DORMENTE NÃO VOLTA.
  //
  // ⚠️ O GREP É PELO **USO DA COLUNA**, NÃO PELA PALAVRA — e a distinção é o teste inteiro.
  //
  // "Competência" é uma palavra LEGÍTIMA e viva neste repositório, e ela aparece em lugares
  // que NÃO têm nada a ver com o que foi removido:
  //   · `MovimentoPatrimonial.competencia`  — a depreciação mensal (M10, `atualizarCompetencia`);
  //   · `MovimentoProvisao.competencia`     — a idempotência por competência das provisões;
  //   · `MovimentoDivida.competencia`       — a atualização monetária;
  //   · a JANELA do travamento (M16) e o RÓTULO "2026-07" da MSC (M14).
  // Todas são campos PRÓPRIOS de quem os declara, todas TÊM LEITOR, e todas ficam.
  //
  // O que não pode voltar é a competência DO LANÇAMENTO CONTÁBIL: o segundo carimbo de data,
  // herdado pelos estornos, divergente da `dataTransacao`, e sem um único leitor.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  it("t2: `competencia` NÃO ressuscita no lançamento contábil (a coluna dormente ficou morta)", () => {
    const arquivos: string[] = [];
    // ⚠️ AS RAÍZES VÊM DE `test/raizes-dominio.ts`, NÃO DE UMA LISTA AQUI. Enquanto esta lista era
    // literal (`["modules", "packages", ...]`), ela não incluía `adapters/` — e quando o gerador
    // SAGRES saiu de `modules/m15-sagres/` para `adapters/tribunais/tce-pb/sagres/`, o funil
    // simplesmente DEIXOU DE VARRÊ-LO. Um `lancamentoContabil.create()` escrito ali passaria sem
    // que nada acusasse, com o guard verde. Ver o docblock de `raizes-dominio.ts`.
    for (const abs of raizesExistentes(RAIZ, RAIZES_DE_CODIGO)) varrer(abs, arquivos);

    /**
     * Os usos da COLUNA, e só eles:
     *   · `competencia` / `competenciaEstorno` dentro de um payload do funil ou do motor de
     *     estorno — reconhecidos porque estão ao lado de `dataTransacao` ou de `numeroControle`;
     *   · `lancamentoContabil` num `select`/`where` que peça `competencia`.
     * O bloco é lido por ARQUIVO (não por linha) para alcançar o objeto multi-linha.
     */
    const infratores: string[] = [];

    for (const abs of arquivos) {
      const rel = abs.slice(RAIZ.length).replace(/^[\\/]/, "").replace(/\\/g, "/");
      const fonte = readFileSync(abs, "utf8");

      // (a) o parâmetro do motor de estorno — ele não existe mais, em lugar nenhum.
      if (/\bcompetenciaEstorno\b/.test(fonte.replace(/^\s*(\/\/|\*).*$/gm, ""))) {
        infratores.push(`${rel}  (competenciaEstorno — o parâmetro morreu com a coluna)`);
      }

      // (b) `competencia:` no MESMO objeto literal que `dataTransacao:` — é a assinatura de um
      //     payload de lançamento (o funil, o motor, um adapter). As competências legítimas do
      //     M10 vivem ao lado de `dataMovimento`, nunca de `dataTransacao`.
      const linhas = fonte.split("\n");
      linhas.forEach((linha, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(linha)) return;
        if (!/^\s*competencia[,:]/.test(linha)) return;

        // A janela de 6 linhas em volta: o payload do lançamento sempre traz `dataTransacao`.
        const vizinhanca = linhas.slice(Math.max(0, i - 6), i + 7).join("\n");
        if (/\bdataTransacao\b|\bnumeroControle\b/.test(vizinhanca)) {
          infratores.push(`${rel}:${i + 1}  ${linha.trim()}`);
        }
      });
    }

    expect(
      infratores,
      "\n\n⚠️ A COMPETÊNCIA DORMENTE ESTÁ VOLTANDO AO LANÇAMENTO CONTÁBIL.\n\n" +
        "A coluna `LancamentoContabil.competencia` foi REMOVIDA — e não por capricho: ela era " +
        "escrita por ~20 pontos (todo estorno herdava a do original), DIVERGIA da " +
        "`dataTransacao` no banco, e NINGUÉM a lia. Uma coluna que só se escreve e que diverge " +
        "é uma mina armada para o primeiro leitor ingênuo: o dia em que alguém filtrar por ela, " +
        "o estorno de janeiro aparece em dezembro, e o relatório fecha — plausível e errado.\n\n" +
        "TUDO neste repositório corta por `dataTransacao` (o travamento do M16, a MSC, os " +
        "balanços) ou por `criadoEm` (o encerramento do M08). Use uma delas.\n\n" +
        "⚠️ E SE VOCÊ PRECISA DA COMPETÊNCIA CONTÁBIL DE VERDADE (o regime de competência da " +
        "NBC TSP — a despesa pertence ao mês do FATO GERADOR): ela é o 5.87/5.88, e nasce na " +
        "ENTIDADE DONA DO FATO, com LEITOR NOMEADO no mesmo commit. Coluna sem leitor não " +
        "entra — foi exatamente assim que esta aqui nasceu.\n\n" +
        "(As competências do M10 — depreciação, provisão, dívida — são campos PRÓPRIOS de " +
        "movimento, TÊM leitor, e este grep não as toca: ele procura `competencia` ao lado de " +
        "`dataTransacao`, que é a assinatura do payload do lançamento.)\n\nOcorrências:\n"
    ).toEqual([]);
  });
});
