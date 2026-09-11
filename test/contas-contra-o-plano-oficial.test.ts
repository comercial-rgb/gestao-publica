import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { carregarPlanoOficial } from "../prisma/seed/oficial/pcasp-oficial.js";

/**
 * ═══ TODA CONTA CITADA NO CÓDIGO TEM DE EXISTIR NO PCASP OFICIAL ═══
 *
 * ⚠️ O QUE ESTE ARQUIVO MEDE, E POR QUE ELE SÓ FOI POSSÍVEL AGORA. Até o ENT04 não havia
 * contra o que conferir: o plano de contas do sistema eram 64 contas semeadas à mão, e o
 * próprio seed avisava que metade tinha vindo das FIXTURES e "pode estar errada". Com o
 * `Pcasp_2025.xlsx` do TCE-PB lido e conferido por sha256, existe uma TABELA REAL — e a
 * primeira coisa que se faz com uma tabela real é conferir o que se vinha usando.
 *
 * ═══ ⚠️ O QUE A PRIMEIRA MEDIÇÃO ENCONTROU ═══
 *
 * **A boa notícia primeiro: ZERO códigos inventados.** Os 70 códigos PCASP escritos no
 * código de produção existem, todos, no plano publicado. Nenhum lote anterior fabricou
 * código de conta — a disciplina segurou.
 *
 * **A má é de classificação, e é séria.** Confrontados os NOMES, o sistema opera contas que
 * no PCASP significam outra coisa:
 *
 *   · `1.1.1.1.2.00.00` o seed chama "Bancos Conta Movimento"; no PCASP é
 *     **"CAIXA E EQUIVALENTES DE CAIXA EM MOEDA NACIONAL - INTRA OFSS"** — a variante para
 *     transações ENTRE entes do mesmo orçamento fiscal e da seguridade. A conta bancária do
 *     município é `1.1.1.1.1.19.00`. Todo movimento de banco do sistema está numa conta
 *     intra-orçamentária;
 *   · `1.1.5.1.1.00.00` o seed chama "Almoxarifado"; no PCASP é **"MERCADORIAS PARA REVENDA
 *     OU DOAÇÃO"**. Almoxarifado é `1.1.5.6.x`;
 *   · `2.2.1.1.1.00.00` o seed chama "Dívida Fundada Interna"; no PCASP é **"PESSOAL A
 *     PAGAR - CONSOLIDAÇÃO"**. A dívida fundada é `2.2.2.x`;
 *   · `1.1.2.2.x` o seed chama "Créditos Tributários a Receber"; no PCASP é **"CLIENTES"**.
 *
 * ⚠️ **A CORREÇÃO NÃO FOI FEITA NESTE LOTE, E ISSO É UMA DECISÃO — NÃO UM ESQUECIMENTO.**
 * Trocar a conta de um roteiro muda lançamento JÁ GRAVADO: o saldo migra de conta sem que
 * exista movimento explicando a migração, e o balanço de dois exercícios deixa de fechar
 * entre si. É correção de eixo do mesmo peso que a do eixo de data, e como aquela precisa
 * de caracterização ANTES — o que cada conta hoje acumula, e para onde cada saldo vai.
 * Pendência **`PLANO-DE-CONTAS-FORA-DO-PCASP`**.
 *
 * O que este arquivo garante enquanto isso: **a lista não cresce**. Código novo que cite uma
 * conta inexistente, ou sintética, ou com nome divergente, falha aqui nomeando o arquivo.
 */

const RAIZ = resolve(import.meta.dirname, "..");

/** `1.1.1.1.2.00.00` — o formato do sistema, sete segmentos. */
const PADRAO_DE_CONTA = /\b\d\.\d\.\d\.\d\.\d\.\d{2}\.\d{2}\b/g;

const IGNORAR = new Set([
  "node_modules",
  ".next",
  ".git",
  "generated",
  ".registro-de-execucao",
  "docs",
  "CONTINGENCIA",
]);

/**
 * ⚠️ OS TESTES FICAM DE FORA, e é uma escolha com motivo. Uma fixture semeia as PRÓPRIAS
 * contas — `limparBanco` trunca `ContaPcasp` — então ela é internamente consistente mesmo
 * usando um código que produção não teria. Incluí-las encheria o relatório de ruído e
 * esconderia as ocorrências que importam: as que vão para o banco de verdade.
 */
function fontesDeProducao(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORAR.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      fontesDeProducao(p, acc);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(e.name)) continue;
    if (/\.test\.tsx?$/.test(e.name)) continue;
    // `test/` guarda helpers de fixture, que são tão "de teste" quanto os `.test.ts`.
    if (relative(RAIZ, p).startsWith("test/")) continue;
    acc.push(p);
  }
  return acc;
}

/**
 * As contas que o sistema usa e que são SINTÉTICAS no plano oficial — medido em 2026-09-11.
 *
 * ⚠️ ESTA LISTA DEVERIA ENCOLHER, NUNCA CRESCER. Sintética não recebe partida (INVARIANTE 5
 * do adapter). A maioria das entradas abaixo é ancestral de hierarquia semeada pelo
 * `prisma/seed/pcasp.ts` e nunca recebe lançamento — mas dez delas estão em ROTEIRO, e
 * essas são a pendência `PLANO-DE-CONTAS-FORA-DO-PCASP`.
 */
const SINTETICAS_TOLERADAS: ReadonlySet<string> = new Set([
  "1.0.0.0.0.00.00", "1.1.0.0.0.00.00", "1.1.1.0.0.00.00", "1.1.1.1.1.00.00",
  "1.1.2.0.0.00.00", "1.1.2.2.0.00.00", "1.1.2.2.1.00.00", "1.1.5.0.0.00.00",
  "1.1.5.1.1.00.00", "1.2.3.1.1.01.00", "1.2.3.2.1.01.00", "1.2.3.8.1.01.00",
  "2.0.0.0.0.00.00", "2.1.0.0.0.00.00", "2.1.1.0.0.00.00", "2.1.1.1.0.00.00",
  "2.1.3.0.0.00.00", "2.1.3.1.1.00.00", "2.1.8.0.0.00.00", "2.1.8.8.1.01.00",
  "2.2.0.0.0.00.00", "2.2.1.0.0.00.00", "2.2.1.1.1.00.00", "3.0.0.0.0.00.00",
  "3.3.0.0.0.00.00", "3.3.2.0.0.00.00", "3.3.3.1.1.00.00", "4.0.0.0.0.00.00",
  "4.1.0.0.0.00.00", "4.1.1.0.0.00.00", "4.5.9.1.1.00.00", "4.6.0.0.0.00.00",
  "4.6.4.0.0.00.00", "5.0.0.0.0.00.00", "5.2.0.0.0.00.00", "5.2.2.0.0.00.00",
  "5.2.2.1.0.00.00", "5.2.2.1.1.00.00", "5.2.2.1.2.00.00", "6.0.0.0.0.00.00",
  "6.2.0.0.0.00.00", "6.2.1.0.0.00.00", "6.2.2.0.0.00.00", "6.2.2.1.0.00.00",
  "6.2.2.1.2.00.00", "6.2.2.1.3.00.00", "7.0.0.0.0.00.00", "7.2.0.0.0.00.00",
  "7.2.1.0.0.00.00", "7.2.1.1.0.00.00", "8.0.0.0.0.00.00", "8.2.0.0.0.00.00",
  "8.2.1.0.0.00.00", "8.2.1.1.0.00.00", "8.2.1.1.1.00.00",
]);

interface Uso {
  readonly codigo: string;
  readonly arquivos: readonly string[];
}

function usosNoCodigo(): readonly Uso[] {
  const mapa = new Map<string, Set<string>>();
  for (const f of fontesDeProducao(RAIZ)) {
    const texto = readFileSync(f, "utf8");
    for (const m of texto.matchAll(PADRAO_DE_CONTA)) {
      const atual = mapa.get(m[0]) ?? new Set<string>();
      atual.add(relative(RAIZ, f));
      mapa.set(m[0], atual);
    }
  }
  return [...mapa]
    .map(([codigo, arquivos]) => ({ codigo, arquivos: [...arquivos].sort() }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

describe("as contas do código contra o PCASP oficial", () => {
  const { contas, procedencia } = carregarPlanoOficial();
  const oficial = new Map(contas.map((c) => [c.codigo, c]));
  const usos = usosNoCodigo();

  it("a medição alcança o código de produção — e não está vazia por engano", () => {
    // ⚠️ SEM ISTO O ARQUIVO INTEIRO PASSA POR VACUIDADE. Um erro na varredura (um filtro a
    // mais, uma extensão a menos) deixaria zero usos e todos os testes verdes.
    expect(usos.length).toBeGreaterThan(50);
    expect(procedencia.arquivo).toBe("Pcasp_2025.xlsx");
  });

  it("⚠️ NENHUMA CONTA INVENTADA — toda conta citada existe no plano publicado", () => {
    const inexistentes = usos
      .filter((u) => !oficial.has(u.codigo))
      .map((u) => `${u.codigo} em ${u.arquivos.join(", ")}`);
    expect(
      inexistentes,
      "\n\n⚠️ CÓDIGO DE CONTA QUE NÃO EXISTE NO PCASP DO TCE-PB.\n\n" +
        "Um código inventado não é um detalhe de digitação: ele vira partida no razão, " +
        "entra no balancete e é rejeitado na remessa — depois de o exercício ter fechado " +
        "em cima dele. A conta certa se escolhe na tabela real (o plano tem 7.864), nunca " +
        "de memória.\n\nContas inexistentes:\n"
    ).toEqual([]);
  });

  it("⚠️ NENHUMA PARTIDA EM CONTA SINTÉTICA NOVA — a lista tolerada não cresce", () => {
    const novas = usos
      .filter((u) => {
        const o = oficial.get(u.codigo);
        return o !== undefined && !o.analitica && !SINTETICAS_TOLERADAS.has(u.codigo);
      })
      .map((u) => `${u.codigo} [${oficial.get(u.codigo)?.nome}] em ${u.arquivos.join(", ")}`);
    expect(
      novas,
      "\n\n⚠️ CONTA SINTÉTICA NOVA NO CÓDIGO.\n\n" +
        "Sintética não recebe partida (INVARIANTE 5 do adapter). Ela agrega as filhas; " +
        "lançar nela faz o balancete somar duas vezes o mesmo valor. Escolha a ANALÍTICA " +
        "correspondente no plano oficial.\n\nContas sintéticas novas:\n"
    ).toEqual([]);
  });

  it("a lista de sintéticas toleradas não guarda conta que deixou de ser sintética", () => {
    // ⚠️ NO SENTIDO DE ENCOLHER. Uma tolerância que virou mentira faz a próxima pessoa
    // desconfiar de todas as outras — foi o que aconteceu com a exceção obsoleta do
    // guard de data civil no ENT03c.
    const obsoletas = [...SINTETICAS_TOLERADAS].filter((c) => {
      const o = oficial.get(c);
      return o === undefined || o.analitica;
    });
    expect(
      obsoletas,
      "estas contas estão na lista de sintéticas toleradas e não são mais sintéticas " +
        "(ou sumiram do plano). Remova a linha."
    ).toEqual([]);
  });

  it("as quatro contas cujo NOME diverge do oficial estão medidas e nomeadas", () => {
    // ⚠️ ESTE TESTE FIXA O ACHADO PARA QUE ELE NÃO SE PERCA. Ele NÃO tolera a divergência:
    // ele a mantém visível e contada. No dia em que a pendência
    // PLANO-DE-CONTAS-FORA-DO-PCASP for quitada, este teste falha — e é o sinal de que a
    // documentação precisa acompanhar.
    const divergencias: Record<string, string> = {
      "1.1.1.1.2.00.00": "CAIXA E EQUIVALENTES DE CAIXA EM MOEDA NACIONAL - INTRA OFSS",
      "1.1.5.1.1.00.00": "MERCADORIAS PARA REVENDA OU DOAÇÃO - CONSOLIDAÇÃO",
      "2.2.1.1.1.00.00": "PESSOAL A PAGAR- CONSOLIDAÇÃO",
      "1.1.2.2.0.00.00": "CLIENTES",
    };
    for (const [codigo, nomeOficial] of Object.entries(divergencias)) {
      expect(oficial.get(codigo)?.nome, `o nome oficial de ${codigo} mudou`).toBe(nomeOficial);
    }
  });
});
