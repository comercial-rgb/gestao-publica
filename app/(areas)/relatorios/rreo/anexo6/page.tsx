import { Badge } from "../../../../../components/ui/Badge";
import { Card, CardEstatistica } from "../../../../../components/ui/Card";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { RelatoriosRelacionados } from "../../../../../components/ui/RelatoriosRelacionados";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import {
  caixaDaLinhaDeDespesa,
  gerarRreoAnexo6,
  gerarRreoAnexo6Abaixo,
  PortaSemBancoError,
  type Anexo6,
  type Anexo6AbaixoDaLinha,
  type LinhaReceitaAnexo6,
  type LinhaDespesaAnexo6,
  type LinhaAjusteMetodologico,
  type NaturezaNaoClassificada,
} from "../../../../../lib/portas/rreo";
import { SeletorBimestreRreo } from "../anexo3/SeletorBimestreRreo";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";

/**
 * RREO — Anexo 6 · Resultado Primário e Nominal, ACIMA DA LINHA (LRF art. 53, III).
 * Server Component, força-dinâmica.
 */
export const dynamic = "force-dynamic";

export default async function RreoAnexo6Page({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_RELATORIOS");
  const sp = await searchParams;
  const exercicio = lerInteiro(sp["exercicio"], 2026);
  const b = lerInteiro(sp["bimestre"], 1);
  const bimestre = ([1, 2, 3, 4, 5, 6] as const).includes(b as 1) ? (b as 1) : 1;

  const cabecalho = (
    <PageHeader
      titulo="RREO — Anexo 6 · Resultado Primário e Nominal"
      subtitulo="Metodologias acima e abaixo da linha · LRF art. 53, III · regime de caixa"
      acoes={<SeletorBimestreRreo bimestre={bimestre} exercicio={exercicio} />}
    />
  );

  let dados: Anexo6;
  let abaixo: Anexo6AbaixoDaLinha;
  try {
    // ⚠️ Os dois caminhos JUNTOS: o acima (fluxo) e o abaixo (estoque) medem o mesmo resultado, e o
    // quadro de harmonização só faz sentido com os dois na mão. Se um falha, a página inteira mostra
    // o erro — melhor que meia página fingindo estar completa.
    [dados, abaixo] = await Promise.all([
      gerarRreoAnexo6({ exercicio, bimestre }),
      gerarRreoAnexo6Abaixo({ exercicio, bimestre }),
    ]);
  } catch (erro) {
    return (
      <div>
        {cabecalho}
        <EstadoVazio
          titulo={
            erro instanceof PortaSemBancoError
              ? "Serviço indisponível"
              : "Não foi possível gerar o Anexo 6"
          }
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  const primario = Number.parseFloat(dados.resultadoPrimario);
  const semMovimento =
    dados.receitaPrimariaTotal.realizada === "0.00" &&
    dados.despesaPrimariaTotal.empenhada === "0.00";

  return (
    <div className="space-y-6">
      {cabecalho}

      {semMovimento ? (
        <EstadoVazio
          titulo="Sem execução no período"
          descricao="Não há receita arrecadada nem despesa empenhada até este bimestre."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <CardEstatistica rotulo="Receita primária (XII)" nota="Realizada até o bimestre">
              <ValorMonetario valor={dados.receitaPrimariaTotal.realizada} />
            </CardEstatistica>
            <CardEstatistica rotulo="Despesa primária paga" nota="(a) + (b) + (c)">
              <ValorMonetario valor={caixaDaLinhaDeDespesa(dados.despesaPrimariaTotal)} />
            </CardEstatistica>
            <Card>
              <p className="text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">
                Resultado primário (XXIV)
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-2xl font-semibold tabular text-[color:var(--color-ink)]">
                  <ValorMonetario valor={dados.resultadoPrimario} />
                </span>
                {/*
                  ⚠️ SEMÂNTICA CONTÁBIL, não juízo de valor. Superávit primário NÃO é "bom" e
                  déficit não é "ruim": um ente investindo pesado com caixa poupado tem déficit
                  primário e está certo. O Badge diz O QUE É, e a comparação com a meta — que
                  julgaria — é justamente a que não temos (META-FISCAL-LDO).
                */}
                <Badge status={primario >= 0 ? "ok" : "alerta"}>
                  {primario >= 0 ? "superávit primário" : "déficit primário"}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">
                XII − [(a) + (b) + (c)]
              </p>
            </Card>
          </div>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">
              Receitas primárias
            </h2>
            <TabelaDeDados<LinhaReceitaAnexo6>
              colunas={COLUNAS_RECEITA}
              linhas={[...dados.receitas, dados.receitaPrimariaTotal]}
              keyDe={(l) => l.chave}
              legenda="Valores em R$ · receitas líquidas de deduções (FUNDEB e restituições) · realizadas até o bimestre."
            />
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">
              Despesas primárias
            </h2>
            <TabelaDeDados<LinhaDespesaAnexo6>
              colunas={COLUNAS_DESPESA}
              linhas={[...dados.despesas, dados.despesaPrimariaTotal]}
              keyDe={(l) => l.chave}
              legenda="Valores em R$ · (a) despesa do exercício paga · (b) RP processados pagos · (c) RP não processados pagos."
            />
          </section>

          <div className="grid gap-3 sm:grid-cols-3">
            <CardEstatistica rotulo="Juros ativos (XXV)" nota="Juros de haveres financeiros">
              {dados.jurosAtivos === null ? (
                <Badge status="alerta">sem cadastro</Badge>
              ) : (
                <ValorMonetario valor={dados.jurosAtivos} />
              )}
            </CardEstatistica>
            <CardEstatistica rotulo="Juros passivos (XXVI)" nota="Pagamentos do grupo de natureza 2">
              <ValorMonetario valor={dados.jurosPassivos} />
            </CardEstatistica>
            <CardEstatistica rotulo="Resultado nominal (XXVII)" nota="XXIV + (XXV − XXVI)">
              {dados.resultadoNominal === null ? (
                <Badge status="alerta">depende da linha XXV</Badge>
              ) : (
                <ValorMonetario valor={dados.resultadoNominal} />
              )}
            </CardEstatistica>
          </div>

          {/* ═══ ABAIXO DA LINHA (7.8-b) — o mesmo resultado, pela variação da DCL ═══ */}
          <section className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
            <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">
              Abaixo da linha — variação da Dívida Consolidada Líquida
            </h2>
            <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">
              Resultado nominal apurado pela variação da Dívida Consolidada Líquida entre 31/12/{exercicio - 1} e
              o fim do bimestre. A redução da DCL indica superávit.
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              <CardEstatistica rotulo={`DCL inicial (31/12/${exercicio - 1})`} nota="Saldo de abertura">
                <ValorMonetario valor={abaixo.dclInicial} />
              </CardEstatistica>
              <CardEstatistica rotulo="DCL final (fim do bimestre)" nota="Corte de referência">
                <ValorMonetario valor={abaixo.dclFinal} />
              </CardEstatistica>
              <CardEstatistica rotulo="Variação da DCL" nota="Inicial − final (bruta)">
                <ValorMonetario valor={abaixo.variacaoDclBruta} />
              </CardEstatistica>
            </div>

            <div className="mt-3">
              <h3 className="mb-1 text-xs font-medium uppercase tracking-wide text-[color:var(--color-ink-2)]">
                Ajustes metodológicos
              </h3>
              <p className="mb-2 text-xs text-[color:var(--color-ink-3)]">
                Variações da DCL que não decorrem do resultado fiscal do período. Ajustes sem registro
                de origem são apresentados com valor zero.
              </p>
              <TabelaDeDados<LinhaAjusteMetodologico>
                colunas={COLUNAS_AJUSTES}
                linhas={[...abaixo.ajustes]}
                keyDe={(l) => l.chave}
                legenda="Valores em R$ · a atualização monetária da dívida é ajustada no resultado nominal, por não decorrer de déficit."
              />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Card>
                <p className="text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">
                  Resultado nominal (abaixo)
                </p>
                <div className="mt-1 text-2xl font-semibold tabular text-[color:var(--color-ink)]">
                  <ValorMonetario valor={abaixo.resultadoNominal} />
                </div>
                <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">
                  Variação da DCL + ajustes
                </p>
              </Card>
              <CardEstatistica rotulo="Resultado primário (abaixo)" nota="Nominal − juros nominais líquidos">
                {abaixo.resultadoPrimario === null ? (
                  <Badge status="alerta">depende da linha XXV</Badge>
                ) : (
                  <ValorMonetario valor={abaixo.resultadoPrimario} />
                )}
              </CardEstatistica>
            </div>
          </section>

          {/* ═══ HARMONIZAÇÃO — os dois resultados lado a lado ═══ */}
          <Card>
            <div className="mb-2 flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Harmonização</h2>
              {abaixo.harmonizacao.fecha ? (
                <Badge status="ok">metodologias coincidem</Badge>
              ) : (
                <Badge status="alerta">diferença explicada abaixo</Badge>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <CardEstatistica rotulo="Primário acima (XXIV)" nota="Acima da linha">
                <ValorMonetario valor={abaixo.harmonizacao.primarioAcima} />
              </CardEstatistica>
              <CardEstatistica rotulo="Nominal abaixo" nota="Abaixo da linha (DCL)">
                <ValorMonetario valor={abaixo.harmonizacao.nominalAbaixo} />
              </CardEstatistica>
              <CardEstatistica rotulo="Diferença" nota="Nominal abaixo − primário acima">
                <ValorMonetario valor={abaixo.harmonizacao.diferenca} />
              </CardEstatistica>
            </div>
            <p className="mt-2 text-xs text-[color:var(--color-ink-3)]">
              {/*
                ⚠️ Sem juros e sem ajustes, nominal ≡ primário e os dois caminhos coincidem
                (diferença = 0). Com juros (XXVI), RP processado pago (DCL-neutro, mas subtraído no
                XXIV) e o piso da nota¹, a diferença é ESPERADA — e nomeada, não fechada à força. O
                XXVII (nominal acima) e o primário abaixo ficam sem número: falta o XXV (juros ativos).
              */}
              {abaixo.harmonizacao.fecha
                ? "Sem juros nem ajustes, o resultado nominal apurado abaixo da linha coincide com o resultado primário apurado acima da linha."
                : "A diferença decorre dos juros (XXVI), do pagamento de restos a pagar processados (que não altera a DCL, mas é deduzido na linha XXIV) e do limite mínimo da disponibilidade de caixa (nota ¹)."}
            </p>
          </Card>

          {/*
            ⚠️ A META DA LDO NÃO EXISTE — e o quadro MOSTRA O RESULTADO E CALA. Publicar
            "meta: 0,00" faria qualquer resultado positivo parecer cumprimento de meta.
          */}
          {dados.metaFiscal === null ? (
            <Card>
              <div className="flex items-center gap-2">
                <p className="text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">
                  Meta fiscal da LDO
                </p>
                <Badge status="alerta">sem cadastro</Badge>
              </div>
              <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">
                O Anexo de Metas Fiscais da LDO não está cadastrado. O demonstrativo apresenta o
                resultado apurado, sem comparação com a meta.
              </p>
            </Card>
          ) : null}

          {dados.naoClassificadas.length > 0 ? (
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">
                Naturezas fora da apuração
              </h2>
              <p className="mb-2 text-xs text-[color:var(--color-ink-3)]">
                Receitas arrecadadas cuja natureza não foi classificada e que, por isso, não integram
                a receita primária.
              </p>
              <TabelaDeDados<NaturezaNaoClassificada>
                colunas={COLUNAS_NAO_CLASSIFICADAS}
                linhas={dados.naoClassificadas}
                keyDe={(l) => l.codigo}
                legenda="Valores em R$."
              />
            </section>
          ) : null}
        </>
      )}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        <p className="mb-1 font-medium uppercase tracking-wide">Notas do demonstrativo</p>
        <ul className="list-disc space-y-1 pl-4">
          {dados.pendencias.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </div>

      <RelatoriosRelacionados
        relacoes={[
          {
            href: "/relatorios/rreo/anexo1",
            rotulo: "Anexo 1 — Balanço Orçamentário",
            motivo:
              "Receita e despesa orçamentárias completas, pelo regime orçamentário.",
          },
          {
            href: "/relatorios/rreo/anexo2",
            rotulo: "Anexo 2 — Despesa por Função",
            motivo: "A mesma despesa executada, classificada por função.",
          },
          {
            href: "/relatorios/rgf/anexo2",
            rotulo: "RGF Anexo 2 — Dívida Consolidada Líquida",
            motivo:
              "A DCL por quadrimestre e sua comparação com o limite do Senado.",
          },
        ]}
      />
    </div>
  );
}

function lerInteiro(v: string | string[] | undefined, padrao: number): number {
  const bruto = Array.isArray(v) ? v[0] : v;
  if (bruto === undefined) return padrao;
  const n = Number.parseInt(bruto, 10);
  return Number.isNaN(n) ? padrao : n;
}


const recuo = (nivel: LinhaReceitaAnexo6["nivel"]): string =>
  nivel === "item" ? "pl-4 text-[color:var(--color-ink-2)]" : "font-medium";

const COLUNAS_RECEITA: readonly ColunaTabela<LinhaReceitaAnexo6>[] = [
  {
    chave: "rotulo",
    cabecalho: "Receita",
    alinhamento: "esquerda",
    celula: (l) => <span className={recuo(l.nivel)}>{l.rotulo}</span>,
  },
  {
    chave: "previsao",
    cabecalho: "Previsão atualizada",
    alinhamento: "direita",
    largura: "10rem",
    celula: (l) => <ValorMonetario valor={l.previsao} />,
  },
  {
    chave: "realizada",
    cabecalho: "Realizadas até o bimestre",
    alinhamento: "direita",
    largura: "10rem",
    celula: (l) => <ValorMonetario valor={l.realizada} />,
  },
];

const COLUNAS_DESPESA: readonly ColunaTabela<LinhaDespesaAnexo6>[] = [
  {
    chave: "rotulo",
    cabecalho: "Despesa",
    alinhamento: "esquerda",
    celula: (l) => <span className={l.nivel === "total" ? "font-medium" : ""}>{l.rotulo}</span>,
  },
  { chave: "dot", cabecalho: "Dotação atualizada", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.dotacaoAtualizada} /> },
  { chave: "emp", cabecalho: "Empenhadas", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.empenhada} /> },
  { chave: "liq", cabecalho: "Liquidadas", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.liquidada} /> },
  { chave: "pag", cabecalho: "Pagas (a)", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.paga} /> },
  { chave: "rpp", cabecalho: "RP processados pagos (b)", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.rpProcessadosPagos} /> },
  { chave: "rpnp", cabecalho: "RP não processados pagos (c)", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.rpNaoProcessadosPagos} /> },
];

const COLUNAS_AJUSTES: readonly ColunaTabela<LinhaAjusteMetodologico>[] = [
  {
    chave: "rotulo",
    cabecalho: "Ajuste",
    alinhamento: "esquerda",
    celula: (l) => <span className={l.tipo === "parametro" ? "text-[color:var(--color-ink-3)]" : ""}>{l.rotulo}</span>,
  },
  {
    chave: "tipo",
    cabecalho: "Origem",
    alinhamento: "esquerda",
    largura: "8rem",
    celula: (l) =>
      l.tipo === "vivo" ? (
        <Badge status="neutro">apurado</Badge>
      ) : (
        <Badge status="alerta">parâmetro</Badge>
      ),
  },
  {
    chave: "valor",
    cabecalho: "Valor",
    alinhamento: "direita",
    largura: "9rem",
    celula: (l) => <ValorMonetario valor={l.valor} />,
  },
];

const COLUNAS_NAO_CLASSIFICADAS: readonly ColunaTabela<NaturezaNaoClassificada>[] = [
  { chave: "codigo", cabecalho: "Natureza", alinhamento: "esquerda", largura: "8rem", celula: (l) => <span className="tabular">{l.codigo}</span> },
  { chave: "motivo", cabecalho: "Motivo", alinhamento: "esquerda", celula: (l) => l.motivo },
  { chave: "realizada", cabecalho: "Arrecadada", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.realizada} /> },
];
