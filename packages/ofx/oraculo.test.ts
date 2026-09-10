import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseOfx } from "./parser.js";

/**
 * ═══ ⚠️ O PARSER CONFERIDO CONTRA UMA IMPLEMENTAÇÃO INDEPENDENTE ═══
 *
 * `ofx.test.ts`, ao lado, tem 23 testes bons — e nenhum deles prova que lemos o
 * arquivo CERTO. Todos montam um OFX com um helper deste repositório, chamam
 * `parseOfx`, e comparam com o que o próprio teste acabou de escrever. **Um teste
 * assim passa com qualquer interpretação errada, desde que seja consistente.**
 *
 * Foi exatamente assim que o offset do diretório central do zip sobreviveu a oito
 * testes verdes: o nosso escritor e o nosso leitor concordavam entre si, e ambos
 * estavam errados. Só o `unzip` do sistema desmentiu os dois.
 *
 * Aqui o desmentidor é o **`ofxtools` 1.1.1** (PyPI, projeto de terceiros, sem
 * relação com este repositório). Ele lê `corpus/*.ofx`, e o que ele extraiu está
 * congelado em `corpus/esperado.json` — gerado por `scripts/oraculo-ofx.py`, não
 * escrito à mão. Este teste confronta o NOSSO parser com o que O OUTRO leu.
 *
 * ⚠️ SE ESTE TESTE FALHAR, A SUSPEITA RECAI SOBRE O NOSSO PARSER — não sobre o
 * `esperado.json`. Regravar o esperado para fazer o teste passar destrói a única
 * coisa que ele prova. O `esperado.json` só se regrava quando o CORPUS muda, e
 * com o motivo registrado.
 *
 * ═══ O QUE ESTA CONFERÊNCIA JÁ ENCONTROU, NA PRIMEIRA EXECUÇÃO ═══
 *
 * 1. **O nosso parser aceita cabeçalho que um leitor conforme REJEITA.** O
 *    `ofxtools` recusou o cabeçalho de quatro linhas que os testes antigos usavam
 *    (`OFXHEADER/DATA/VERSION/CHARSET`): a especificação 1.x exige também
 *    `SECURITY`, `ENCODING`, `COMPRESSION`, `OLDFILEUID` e `NEWFILEUID`. E recusou
 *    o corpo sem `<SIGNONMSGSRSV1>` e sem `<LEDGERBAL>`, ambos obrigatórios.
 *
 *    Ser mais permissivo na ENTRADA é menos perigoso que ler valor errado, e por
 *    isso não foi tratado como defeito — mas é bom saber que os arquivos dos
 *    testes antigos **não eram OFX válido**, e que nenhum deles teria vindo de um
 *    banco de verdade. O corpus deste arquivo é conforme.
 *
 * 2. **A divergência de DATA no fim do mês, que é a que importa.** Ver o bloco
 *    `c-fuso` no fim deste arquivo.
 */

const CORPUS = join(process.cwd(), "packages", "ofx", "corpus");

interface TransacaoEsperada {
  readonly fitid: string;
  readonly instanteUtc: string;
  readonly dataLocalDeclarada: string;
  readonly valor: string;
  readonly natureza: "CREDITO" | "DEBITO";
  readonly memo: string;
  readonly documento: string | null;
}

interface ExtratoEsperado {
  readonly moeda: string;
  readonly acctid: string;
  readonly bankid: string | null;
  readonly periodoInicio: string | null;
  readonly periodoFim: string | null;
  readonly transacoes: readonly TransacaoEsperada[];
}

const esperado = JSON.parse(
  readFileSync(join(CORPUS, "esperado.json"), "utf8")
) as { readonly arquivos: Readonly<Record<string, ExtratoEsperado>> };

/** A data no fuso de Brasília, que é como o extrato do banco a imprime. */
function dataLocal(d: Date): string {
  return d.toISOString().slice(0, 10);
}

describe("OFX — conferido contra o ofxtools (implementação independente)", () => {
  const nomes = readdirSync(CORPUS)
    .filter((n) => n.endsWith(".ofx"))
    .sort();

  /**
   * ⚠️ O CORPUS TEM DE ESTAR TODO COBERTO. Sem esta amarração, acrescentar um
   * arquivo ao corpus e esquecer de regravar o esperado deixaria o arquivo novo
   * sem conferência nenhuma — e a suíte ficaria verde sem tê-lo lido.
   */
  it("todo arquivo do corpus tem expectativa gerada pelo oráculo", () => {
    expect(nomes.length).toBeGreaterThan(0);
    expect(nomes).toEqual(Object.keys(esperado.arquivos).sort());
  });

  for (const nome of nomes) {
    it(`${nome}: cabeçalho, conta e período conferem`, () => {
      const bruto = readFileSync(join(CORPUS, nome), "latin1");
      const nosso = parseOfx(bruto);
      const outro = esperado.arquivos[nome]!;

      expect(nosso.moeda).toBe(outro.moeda);
      expect(nosso.acctid).toBe(outro.acctid);
      expect(nosso.bankid ?? null).toBe(outro.bankid);
      expect(nosso.periodoInicio ? dataLocal(nosso.periodoInicio) : null).toBe(
        outro.periodoInicio
      );
      expect(nosso.periodoFim ? dataLocal(nosso.periodoFim) : null).toBe(
        outro.periodoFim
      );
    });

    it(`${nome}: as transações conferem uma a uma`, () => {
      const bruto = readFileSync(join(CORPUS, nome), "latin1");
      const nosso = parseOfx(bruto);
      const outro = esperado.arquivos[nome]!;

      // ⚠️ A CONTAGEM PRIMEIRO, e separada. Sem ela, um parser que lesse metade das
      // linhas passaria em todas as comparações item a item que fizesse.
      expect(nosso.transacoes.length).toBe(outro.transacoes.length);

      for (const [i, t] of outro.transacoes.entries()) {
        const n = nosso.transacoes[i]!;
        expect(n.fitid, `${nome}[${i}] fitid`).toBe(t.fitid);
        expect(n.valor.toFixed(2), `${nome}[${i}] valor`).toBe(t.valor);
        expect(n.natureza, `${nome}[${i}] natureza`).toBe(t.natureza);
        expect(n.memo, `${nome}[${i}] memo`).toBe(t.memo);
        expect(n.documento ?? null, `${nome}[${i}] documento`).toBe(t.documento);
        expect(dataLocal(n.dataPostagem), `${nome}[${i}] data`).toBe(
          t.dataLocalDeclarada
        );
      }
    });
  }

  /**
   * ═══ ⚠️ c-fuso: A DIVERGÊNCIA REAL, E POR QUE ELA FICA REGISTRADA AQUI ═══
   *
   * `01-basico.ofx` tem uma tarifa de um centavo em `20260131235900[-3:BRT]` — o
   * último minuto de janeiro, no horário de Brasília. O oráculo normaliza para UTC
   * e guarda `2026-02-01T02:59:00Z`. Lida como data em UTC, essa transação é de
   * **fevereiro**. Lida como data no fuso que o arquivo declara, é de
   * **janeiro** — e é assim que o nosso parser a lê.
   *
   * ⚠️ UM DIA DE DIFERENÇA NUMA TRANSAÇÃO DO ÚLTIMO DIA DO MÊS É UMA MUDANÇA DE
   * MÊS. A conciliação bancária é mensal e é feita contra o extrato que o
   * tesoureiro tem na mão — e o extrato do banco brasileiro imprime 31/01. Jogar
   * essa linha em fevereiro porque o instante em Greenwich já virou o dia deixaria
   * a conciliação de janeiro permanentemente aberta, por uma linha que o papel diz
   * que é de janeiro.
   *
   * Por isso o nosso parser está certo, e por isso o `esperado.json` guarda AS
   * DUAS leituras: `instanteUtc` é o oráculo cru, sem interpretação nossa;
   * `dataLocalDeclarada` é o mesmo instante no fuso que o arquivo declara. Este
   * teste prova que elas REALMENTE divergem — se um dia pararem de divergir, o
   * corpus perdeu o caso de fronteira e alguém precisa saber.
   */
  it("c-fuso: a virada de mês diverge entre UTC e o fuso declarado — e o corpus prova", () => {
    const t = esperado.arquivos["01-basico.ofx"]!.transacoes.find(
      (x) => x.fitid === "F3"
    );
    expect(t, "o caso de fronteira sumiu do corpus").toBeDefined();

    expect(t!.instanteUtc.slice(0, 10)).toBe("2026-02-01");
    expect(t!.dataLocalDeclarada).toBe("2026-01-31");
    expect(t!.instanteUtc.slice(0, 10)).not.toBe(t!.dataLocalDeclarada);

    // E o nosso parser fica com JANEIRO — a data do extrato, não a de Greenwich.
    const bruto = readFileSync(join(CORPUS, "01-basico.ofx"), "latin1");
    const nossa = parseOfx(bruto).transacoes.find((x) => x.fitid === "F3");
    expect(nossa).toBeDefined();
    expect(dataLocal(nossa!.dataPostagem)).toBe("2026-01-31");
  });
});
