import { BotaoCsvDasTabelas } from "../../../../../components/ui/BotaoCsvDasTabelas";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { RelatoriosRelacionados } from "../../../../../components/ui/RelatoriosRelacionados";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { RELACOES_RREO } from "../../../../../lib/navegacao";
import {
  gerarRreoAnexo1,
  PortaSemBancoError,
  type Anexo1,
  type LinhaDespesaRreo,
  type LinhaReceitaRreo,
} from "../../../../../lib/portas/rreo";
import { SeletorBimestreRreo } from "../anexo3/SeletorBimestreRreo";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";

import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
/** RREO — Anexo 1 · Balanço Orçamentário (LRF art. 52). Server Component, força-dinâmica. */
export const dynamic = "force-dynamic";

export default async function RreoAnexo1Page({
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
    <PageHeader titulo="RREO — Anexo 1 · Balanço Orçamentário" subtitulo="Execução da receita e da despesa orçamentária (LRF art. 52)" acoes={<div className="flex items-center gap-2"><SeletorBimestreRreo bimestre={bimestre} exercicio={exercicio} /><BotaoCsvDasTabelas nomeArquivo="rreo-anexo1.csv" /><a href={`/transparencia/demonstrativos/pdf?slug=rreo-anexo1&exercicio=${exercicio}&bimestre=${bimestre}`} target="_blank" rel="noopener" data-chrome className="h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-xs font-medium text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)] inline-flex items-center">Baixar PDF</a></div>} />
  );

  let dados: Anexo1;
  try {
    dados = await gerarRreoAnexo1({ exercicio, bimestre });
  } catch (erro) {
    return <div>{cabecalho}<EstadoVazio titulo={erro instanceof PortaSemBancoError ? "Serviço indisponível" : "Não foi possível gerar o Anexo 1"} descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."} /></div>;
  }

  if (dados.receitas.length === 0 && dados.despesas.length === 0) {
    return <div>{cabecalho}<EstadoVazio titulo="Sem execução no período" descricao={`Não há receita nem despesa até o ${bimestre}º bimestre de ${exercicio}.`} /></div>;
  }

  return (
    <div className="space-y-6">
      {cabecalho}
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">Receitas</h2>
        <TabelaDeDados<LinhaReceitaRreo>
          colunas={colunasReceita(exercicio, bimestre)}
          linhas={[...dados.receitas, dados.subtotalReceitas]}
          keyDe={(l, i) => `${l.nivel}-${l.codigo}-${i}`}
          ehTotal={(l) => l.codigo === ""}
          recuoDe={(l) => (l.nivel === "especie" ? 2 : l.nivel === "origem" ? 1 : 0)}
          legenda="Valores em R$ · (b) no bimestre · (c) até o bimestre · saldo = previsão − (c)."
        />
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">Despesas</h2>
        <TabelaDeDados<LinhaDespesaRreo>
          colunas={COLUNAS_DESPESA}
          linhas={[...dados.despesas, dados.subtotalDespesas]}
          keyDe={(l, i) => `${l.nivel}-${l.codigo}-${i}`}
          ehTotal={(l) => l.codigo === ""}
          recuoDe={(l) => (l.nivel === "grupo" ? 1 : 0)}
          legenda={`Valores em R$ · déficit ${dados.deficit} · superávit ${dados.superavit}.`}
        />
      </section>
      <RelatoriosRelacionados relacoes={RELACOES_RREO["/relatorios/rreo/anexo1"] ?? []} />
    </div>
  );
}

function lerInteiro(v: string | string[] | undefined, padrao: number): number {
  const bruto = Array.isArray(v) ? v[0] : v;
  if (bruto === undefined) return padrao;
  const n = Number.parseInt(bruto, 10);
  return Number.isNaN(n) ? padrao : n;
}
const pct = (v: string) => `${v.replace(".", ",")}%`;

/**
 * V37 — o DETALHAMENTO ATÉ AS GUIAS: o valor arrecadado de cada linha (categoria, origem ou espécie) abre a lista de
 * guias das receitas de código iniciado pelo da linha, no bimestre (b) ou do começo do exercício até o fim dele (c).
 * A soma da lista é a do Anexo (mesmo sinal, por data de arrecadação). A linha de total não abre nada.
 */
function colunasReceita(exercicio: number, bimestre: number): readonly ColunaTabela<LinhaReceitaRreo>[] {
  const mes = (m: number): string => `${String(exercicio)}-${String(m).padStart(2, "0")}`;
  const guias = (codigo: string, de: number): string => `/receita/arrecadacoes?exercicio=${String(exercicio)}&natureza=${codigo}&de=${mes(de)}&ate=${mes(bimestre * 2)}`;
  const valor = (l: LinhaReceitaRreo, v: string, de: number, elo: string): React.ReactNode =>
    l.codigo === "" ? <ValorMonetario valor={v} /> : <a href={guias(l.codigo, de)} data-elo={elo} className="underline decoration-dotted underline-offset-2"><ValorMonetario valor={v} /></a>;
  return [
    { chave: "rotulo", cabecalho: "Especificação", alinhamento: "esquerda", celula: (l) => l.rotulo },
    { chave: "pa", cabecalho: "Previsão Atualizada", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.previsaoAtualizada} /> },
    { chave: "b", cabecalho: "No Bimestre", alinhamento: "direita", largura: "7rem", celula: (l) => valor(l, l.noBimestre, bimestre * 2 - 1, "guias-do-bimestre") },
    { chave: "c", cabecalho: "Até o Bimestre", alinhamento: "direita", largura: "8rem", celula: (l) => valor(l, l.ateBimestre, 1, "guias-ate-o-bimestre") },
    ...COLUNAS_RECEITA_FIM,
  ];
}
const COLUNAS_RECEITA_FIM: readonly ColunaTabela<LinhaReceitaRreo>[] = [
  { chave: "pc", cabecalho: "%", alinhamento: "direita", largura: "5rem", celula: (l) => pct(l.percentAteBim) },
  { chave: "s", cabecalho: "Saldo", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.saldo} /> },
];
const COLUNAS_DESPESA: readonly ColunaTabela<LinhaDespesaRreo>[] = [
  { chave: "rotulo", cabecalho: "Especificação", alinhamento: "esquerda", celula: (l) => l.rotulo },
  { chave: "da", cabecalho: "Dotação Atualizada", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.dotacaoAtualizada} /> },
  { chave: "ea", cabecalho: "Empenhadas até", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.empenhadasAte} /> },
  { chave: "la", cabecalho: "Liquidadas até", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.liquidadasAte} /> },
  { chave: "sd", cabecalho: "Saldo Dotação", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.saldoDotacao} /> },
];
