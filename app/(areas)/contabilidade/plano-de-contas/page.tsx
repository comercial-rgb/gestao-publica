import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { TabelaDeDados, type ColunaTabela } from "../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import {
  listarPlanoDeContas,
  PortaSemBancoError,
  type ContaDoPlano,
} from "../../../../lib/portas/contabilidade";
import { gerarBalancete, type LinhaDoBalancete } from "../../../../lib/portas/livros";
import {
  EscopoDeLeituraError,
  ExercicioIlegivelError,
  recorteDePagina,
  type RecorteDaPagina,
} from "../../../../lib/portas/contexto";
import { descreverRecorte } from "../../../../lib/recorte";
import { janelaCivilDoAno } from "../../../../packages/datas/index";

/**
 * PLANO DE CONTAS PCASP — o cadastro (M01) com o SALDO de cada conta ao lado.
 *
 * ═══ DUAS LEITURAS INDEPENDENTES, JUNTADAS POR `codigo` ═══
 * O CADASTRO vem de `listarPlanoDeContas` (porta de contabilidade → M01): código, nome,
 * `naturezaSaldo`, nível, analítica. O SALDO vem de `gerarBalancete` (porta de livros → M12), que
 * por sua vez só compõe o `somasPorConta` do M01 — o ÚNICO somador do razão do sistema.
 *
 * ⚠️ ESTA TELA NÃO SOMA NADA. Ela junta duas leituras por `codigo`. Se ela somasse partidas por
 * conta própria, existiria uma segunda verdade sobre o razão, e o dia em que ela divergisse o
 * plano mostraria um saldo e o balancete outro — sem ninguém saber qual mentiu. O preço de
 * juntar é a conta sem movimento aparecer com saldo zero (o balancete analítico só devolve quem
 * teve movimento); e zero é a resposta CERTA para uma conta que nunca foi tocada.
 *
 * ⚠️ O BALANCETE É PEDIDO DUAS VEZES — analítico E sintético — e isso é deliberado. O analítico
 * traz as FOLHAS (as que recebem partida); o sintético traz as SINTÉTICAS, cada uma já igual à Σ
 * das analíticas sob o prefixo dela (a identidade L2 do M12). Somar as filhas aqui para obter a
 * sintética seria, de novo, aritmética própria — e ela poderia discordar do balancete oficial.
 *
 * ═══ ⚠️ AS DUAS "NATUREZAS" QUE O VOCABULÁRIO CONTÁBIL CONFUNDE ═══
 *   · NATUREZA DO SALDO (devedora/credora) — coluna REAL de `ContaPcasp.naturezaSaldo`. Diz de
 *     que lado o saldo da conta é positivo. É atributo do CADASTRO.
 *   · NATUREZA DA INFORMAÇÃO do MSC (patrimonial/orçamentária/controle) — NÃO É COLUNA DE
 *     `ContaPcasp`. Ela é atributo do LANÇAMENTO: vive em `PartidaContabil.subsistema` (enum
 *     `Subsistema`). Esta tela a exibe DERIVADA da classe do código, e diz isso em voz alta na
 *     legenda e no `title` da célula — porque um usuário que a leia como se fosse cadastro vai
 *     procurá-la no plano e não vai encontrá-la.
 *
 * Quem quiser a natureza da informação COMO ELA REALMENTE FOI ESCRITURADA tem de olhar as
 * partidas — é a coluna "subsistema" da tela de Lançamentos, ao lado.
 */
export const dynamic = "force-dynamic";

export default async function PlanoDeContasPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  // Recorte de APRESENTAÇÃO (não vai à porta): `?classe=2` mostra só uma classe. É o caminho que
  // o roteiro de demonstração percorre — classe 2 → 2.1.8.8.1.01.00 (Consignações).
  const classeFiltro = umaClasse(sp["classe"]);

  // ⚠️ AQUI O QUE O RECORTE AUTORIZADO ACRESCENTA É O **EXERCÍCIO**, NÃO A UNIDADE — e isso
  // foi medido, não suposto. As três leituras desta tela (`listarPlanoDeContas` e os dois
  // `gerarBalancete`) não recebem unidade nenhuma: o plano de contas é do ENTE, e a janela
  // do saldo sai de `janelaCivilDoAno(recorte.exercicio)`. Forçar recorte de unidade aqui
  // seria fabricar uma dimensão que o modelo não tem.
  //
  // O que ela ganha é a recusa do exercício ilegível: `?exercicio=abc` virava 2026 em
  // silêncio, e a tela afirmava com confiança o saldo de um ano que ninguém pediu.
  //
  // ⚠️ E O CABEÇALHO NASCE DEPOIS DO TRY, porque imprime `descreverRecorte(recorte)`.
  let recorte: RecorteDaPagina;
  let contas: readonly ContaDoPlano[];
  let linhasBalancete: readonly LinhaDoBalancete[];
  try {
    recorte = await recorteDePagina(sp);
    // ⚠️ A JANELA DO SALDO É O EXERCÍCIO INTEIRO do recorte — o saldo que se espera ver ao lado de
    // uma conta do plano é o acumulado do ano, não o de uma janela arbitrária. Quem quer o saldo
    // de um mês tem o Balancete, que é a tela feita para escolher a janela.
    // ⚠️ A JANELA DO EXERCÍCIO É CIVIL. Construída em UTC, ela começava às 21:00 de
    // 31/12 do ano anterior e terminava às 20:59:59 de 31/12 — deixando de fora os
    // lançamentos da noite do último dia e trazendo os da véspera do primeiro.
    const { inicio: desde, fim: ate } = janelaCivilDoAno(recorte.exercicio);
    const [plano, analitico, sintetico] = await Promise.all([
      listarPlanoDeContas(),
      gerarBalancete({ desde, ate, modo: "ANALITICO" }),
      gerarBalancete({ desde, ate, modo: "SINTETICO" }),
    ]);
    contas = plano;
    linhasBalancete = [...analitico.linhas, ...sintetico.linhas];
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader
          titulo="Plano de Contas PCASP"
          subtitulo="Contas por classe, com natureza do saldo e saldo do exercício"
        />
        <EstadoVazio
          titulo={
            erro instanceof EscopoDeLeituraError
              ? "Esta unidade não está no seu acesso"
              : erro instanceof ExercicioIlegivelError
                ? "O exercício pedido não é um ano"
                : erro instanceof PortaSemBancoError
                  ? "Banco de dados não configurado"
                  : "Não foi possível ler o plano de contas"
          }
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  // ⚠️ AQUI: `recorte` autorizado, e só agora o cabeçalho pode afirmar o exercício.
  const cabecalho = (
    <PageHeader
      titulo="Plano de Contas PCASP"
      subtitulo={`${descreverRecorte(recorte)} — contas por classe, com natureza do saldo e saldo do exercício`}
    />
  );

  // A JUNÇÃO — por `codigo`, a chave única do plano e a mesma que o balancete usa como rótulo.
  const saldoPorConta = new Map(linhasBalancete.map((l) => [l.conta, l]));

  const linhas: readonly LinhaDoPlano[] = contas.map((c) => {
    const b = saldoPorConta.get(c.codigo);
    return {
      ...c,
      saldoDevedor: b?.saldoFinalDevedor ?? "0.00",
      saldoCredor: b?.saldoFinalCredor ?? "0.00",
      // "sem movimento" ≠ "saldo zero por compensação". A tela distingue os dois: a primeira é a
      // ausência de linha no balancete, a segunda é uma linha cujas colunas deram zero.
      semMovimento: b === undefined,
    };
  });

  const classesPresentes = [...new Set(linhas.map((l) => l.classe))].sort();
  const visiveis = classeFiltro === undefined ? linhas : linhas.filter((l) => l.classe === classeFiltro);

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      {cabecalho}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs leading-relaxed text-[color:var(--color-ink-2)]">
        <strong>Natureza do saldo</strong> (devedora/credora) é atributo <em>cadastrado</em> da
        conta — coluna <code className="font-mono">naturezaSaldo</code> do PCASP. Já a{" "}
        <strong>natureza da informação</strong> (patrimonial, orçamentária, controle) NÃO é coluna
        da conta: ela é atributo do <em>lançamento</em> (<code className="font-mono">PartidaContabil.subsistema</code>).
        A coluna abaixo a mostra <strong>derivada da classe do código</strong>, como orientação; a
        natureza efetivamente escriturada aparece por partida em{" "}
        <a href="/contabilidade/lancamentos" className="text-[color:var(--color-primary)] hover:underline">Contabilidade · Lançamentos</a>.
        O <strong>saldo</strong> é o saldo final do exercício, lido do balancete (M12) e juntado a
        esta lista pelo código — esta tela não soma partida nenhuma.
      </div>

      {/* Navegação por CLASSE — é o eixo em que o PCASP se lê, e o caminho do roteiro (classe 2). */}
      <nav className="flex flex-wrap items-center gap-2 text-xs" data-chrome>
        <a
          href="/contabilidade/plano-de-contas"
          className={`rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-2.5 py-1 ${classeFiltro === undefined ? "bg-[color:var(--color-surface-2)] font-semibold text-[color:var(--color-ink)]" : "text-[color:var(--color-ink-2)] hover:text-[color:var(--color-ink)]"}`}
        >
          Todas
        </a>
        {classesPresentes.map((c) => (
          <a
            key={c}
            href={`/contabilidade/plano-de-contas?classe=${c}`}
            title={NOME_DA_CLASSE[c] ?? "Classe fora do PCASP conhecido"}
            className={`rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-2.5 py-1 ${classeFiltro === c ? "bg-[color:var(--color-surface-2)] font-semibold text-[color:var(--color-ink)]" : "text-[color:var(--color-ink-2)] hover:text-[color:var(--color-ink)]"}`}
          >
            {c} — {NOME_DA_CLASSE[c] ?? "?"}
          </a>
        ))}
      </nav>

      {visiveis.length === 0 ? (
        <EstadoVazio
          titulo="Sem contas"
          descricao={
            classeFiltro !== undefined
              ? `A classe ${classeFiltro} não tem conta cadastrada no plano.`
              : "O plano de contas PCASP não foi semeado neste banco."
          }
        />
      ) : (
        classesPresentes
          .filter((c) => classeFiltro === undefined || c === classeFiltro)
          .map((classe) => {
            const daClasse = visiveis.filter((l) => l.classe === classe);
            return (
              // O `id` ancora a navegação por classe (o roteiro salta direto para a classe 2).
              <Card key={classe} className="space-y-3">
                <div id={`classe-${classe}`} className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
                    Classe {classe} — {NOME_DA_CLASSE[classe] ?? "classe fora do PCASP conhecido"}
                  </h2>
                  <span className="text-xs text-[color:var(--color-ink-3)]">
                    natureza da informação (derivada): {naturezaDaInformacao(classe)} · {daClasse.length} conta(s)
                  </span>
                </div>
                <TabelaDeDados
                  colunas={COLUNAS}
                  linhas={daClasse}
                  keyDe={(l) => l.id}
                  recuoDe={(l) => (l.nivel - 1) * 12}
                  legenda="Saldo final do exercício, do balancete. “—” na coluna de saldo = a conta não teve movimento no exercício."
                />
              </Card>
            );
          })
      )}
    </div>
  );
}

type LinhaDoPlano = ContaDoPlano & {
  readonly saldoDevedor: string;
  readonly saldoCredor: string;
  readonly semMovimento: boolean;
};

/** `?classe=2` — um dígito só; qualquer outra coisa é ignorada (vale "todas"). */
function umaClasse(v: string | string[] | undefined): string | undefined {
  const bruto = Array.isArray(v) ? v[0] : v;
  return bruto !== undefined && /^\d$/.test(bruto) ? bruto : undefined;
}

/** Os nomes das oito classes do PCASP — rótulo de APRESENTAÇÃO, não dado do banco. */
const NOME_DA_CLASSE: Readonly<Record<string, string>> = {
  "1": "Ativo",
  "2": "Passivo e Patrimônio Líquido",
  "3": "Variações Patrimoniais Diminutivas",
  "4": "Variações Patrimoniais Aumentativas",
  "5": "Controles da Aprovação do Planejamento e Orçamento",
  "6": "Controles da Execução do Planejamento e Orçamento",
  "7": "Controles Devedores",
  "8": "Controles Credores",
};

/**
 * A NATUREZA DA INFORMAÇÃO do MSC, DERIVADA da classe.
 *
 * ⚠️ DERIVAÇÃO, NÃO LEITURA. Não existe coluna disso em `ContaPcasp`; o que existe de verdade é
 * `PartidaContabil.subsistema`, escriturado a cada lançamento. A correspondência classe→natureza
 * é a convenção do MCASP e vale como orientação de leitura do plano — mas se um lançamento
 * escriturar um subsistema diferente do que a classe sugere, quem tem razão é a PARTIDA.
 */
function naturezaDaInformacao(classe: string): string {
  if (classe >= "1" && classe <= "4") return "patrimonial";
  if (classe === "5" || classe === "6") return "orçamentária";
  if (classe === "7" || classe === "8") return "controle";
  return "não classificada";
}

const COLUNAS: readonly ColunaTabela<LinhaDoPlano>[] = [
  {
    chave: "codigo",
    cabecalho: "Código",
    alinhamento: "esquerda",
    largura: "12rem",
    celula: (l) => (
      <span className="font-mono text-xs text-[color:var(--color-ink)]" title={l.contaPaiCodigo !== null ? `Sob a conta ${l.contaPaiCodigo} · nível ${l.nivel}` : `Conta raiz · nível ${l.nivel}`}>
        {l.codigo}
      </span>
    ),
  },
  { chave: "nome", cabecalho: "Conta", alinhamento: "esquerda", celula: (l) => l.nome },
  {
    chave: "tipo",
    cabecalho: "Tipo",
    alinhamento: "esquerda",
    largura: "7rem",
    // Analítica recebe partida; sintética só resume as filhas (o M01 barra partida em sintética).
    celula: (l) => (
      <Badge status={l.analitica ? "ok" : "neutro"}>{l.analitica ? "analítica" : "sintética"}</Badge>
    ),
  },
  {
    chave: "naturezaSaldo",
    cabecalho: "Natureza do saldo",
    alinhamento: "esquerda",
    largura: "9rem",
    celula: (l) => (
      <span title="Coluna real do cadastro (ContaPcasp.naturezaSaldo) — o lado em que o saldo desta conta é positivo.">
        {l.naturezaSaldo === "DEVEDORA" ? "devedora" : "credora"}
      </span>
    ),
  },
  {
    chave: "naturezaInfo",
    cabecalho: "Natureza da informação",
    alinhamento: "esquerda",
    largura: "11rem",
    celula: (l) => (
      <span
        className="text-[color:var(--color-ink-2)]"
        title="DERIVADA da classe do código (convenção MCASP). Não é coluna do plano de contas: a natureza escriturada vive em PartidaContabil.subsistema."
      >
        {naturezaDaInformacao(l.classe)} <span className="text-[color:var(--color-ink-3)]">(derivada)</span>
      </span>
    ),
  },
  {
    chave: "indicador",
    cabecalho: "F/P",
    alinhamento: "centro",
    largura: "4rem",
    celula: (l) => (
      <span className="text-[color:var(--color-ink-2)]" title="Indicador de superávit financeiro (MCASP): F = financeiro, P = permanente.">
        {l.indicadorSuperavit ?? "—"}
      </span>
    ),
  },
  {
    chave: "saldo",
    cabecalho: "Saldo (exercício)",
    alinhamento: "direita",
    largura: "11rem",
    // ⚠️ UMA coluna só, com o LADO ao lado do número. Duas colunas (devedor/credor) dobrariam a
    // largura e deixariam metade delas vazia em toda linha — o balancete tem as duas porque ali
    // as somas de cada coluna são a prova de que o livro fecha; aqui a pergunta é outra
    // ("quanto tem esta conta"), e a resposta é um número com um lado.
    celula: (l) => {
      if (l.semMovimento) {
        return <span className="text-[color:var(--color-ink-3)]" title="Conta sem movimento no exercício — não aparece no balancete.">—</span>;
      }
      const devedor = Number(l.saldoDevedor) !== 0;
      const credor = Number(l.saldoCredor) !== 0;
      if (!devedor && !credor) {
        return <span className="text-[color:var(--color-ink-3)]" title="Teve movimento, mas o saldo final é zero (débitos e créditos se compensaram).">0,00</span>;
      }
      const lado = devedor ? "D" : "C";
      // ⚠️ SALDO NO LADO CONTRÁRIO À NATUREZA é FATO, não erro — e a tela o NOMEIA em vez de o
      // esconder ou de o virar de sinal. Uma conta credora com saldo devedor costuma indicar
      // estorno excessivo ou roteiro invertido, e quem lê o plano precisa ver isso.
      const invertido = (l.naturezaSaldo === "DEVEDORA" && credor) || (l.naturezaSaldo === "CREDORA" && devedor);
      return (
        <span className="inline-flex items-center gap-1.5">
          <ValorMonetario valor={devedor ? l.saldoDevedor : l.saldoCredor} />
          <span className="text-[color:var(--color-ink-3)]">{lado}</span>
          {invertido ? <Badge status="alerta">invertido</Badge> : null}
        </span>
      );
    },
  },
];
