import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { acoesPermitidas } from "../../../../../lib/portas/molde";
import {
  ANOS_MINIMOS_DA_PROJECAO,
  gerarRreoAnexo10,
  PLANOS_DO_REGIME_PROPRIO,
  PortaSemBancoError,
  ROTULO_DO_PLANO,
  type Anexo10,
  type LinhaDoAnexo10,
} from "../../../../../lib/portas/rreo-anexo10";
import { SeletorBimestreRreo } from "../anexo3/SeletorBimestreRreo";
import { FormProjecao, FormRetirarProjecao } from "./Formularios";

/**
 * V35 — RREO Anexo 10 · Projeção Atuarial do Regime Próprio de Previdência (LRF, art. 53, § 1º, II). Só no 6º bimestre
 * (regra do Siconfi). Os números vêm da avaliação atuarial, registrada aqui com o documento; resultado e saldo são
 * calculados. Server Component, força-dinâmica.
 */
export const dynamic = "force-dynamic";

export default async function RreoAnexo10Page({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_RELATORIOS");
  const sp = await searchParams;
  const exercicio = lerInteiro(sp["exercicio"], 2026);
  const b = lerInteiro(sp["bimestre"], 6);
  const bimestre = ([1, 2, 3, 4, 5, 6] as const).includes(b as 1) ? (b as 1) : 6;

  const cabecalho = (
    <PageHeader
      titulo="RREO — Anexo 10 · Projeção Atuarial do Regime Próprio de Previdência"
      subtitulo="LRF art. 53, § 1º, II · só no último bimestre · fonte: avaliação atuarial"
      acoes={<SeletorBimestreRreo bimestre={bimestre} exercicio={exercicio} />}
    />
  );

  let dados: Anexo10;
  let permitidas: ReadonlySet<string>;
  try {
    [dados, permitidas] = await Promise.all([gerarRreoAnexo10({ exercicio, bimestre }), acoesPermitidas(["CADASTRAR_LINHA_DEMONSTRATIVO"])]);
  } catch (erro) {
    return <div>{cabecalho}<EstadoVazio titulo={erro instanceof PortaSemBancoError ? "Serviço indisponível" : "Não foi possível gerar o Anexo 10"} descricao={erro instanceof Error ? erro.message : "Erro desconhecido."} /></div>;
  }
  const podeEscrever = permitidas.has("CADASTRAR_LINHA_DEMONSTRATIVO");

  return (
    <div className="space-y-6">
      {cabecalho}

      {!dados.disponivel ? (
        <EstadoVazio titulo="Anexo do último bimestre" descricao="O Anexo 10 integra só o RREO do 6º bimestre. Escolha o 6º bimestre para ver e registrar a projeção." />
      ) : dados.quadros.length === 0 ? (
        <EstadoVazio titulo="Sem projeção registrada" descricao={`A projeção vem da avaliação atuarial do regime próprio. Registre-a abaixo, com o documento, para o RREO de ${String(exercicio)}.`} />
      ) : (
        dados.quadros.map((q) => (
          <section key={q.plano} aria-label={q.titulo} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold">{q.titulo}</h2>
              {podeEscrever ? <FormRetirarProjecao exercicio={exercicio} plano={q.plano} rotulo={q.titulo} /> : null}
            </div>
            <p className="text-xs text-[color:var(--color-ink-3)]">
              Avaliação de {q.dataDaAvaliacao.split("-").reverse().join("/")} · {q.documento} · versão {q.versao} · saldo financeiro anterior{" "}
              <ValorMonetario valor={q.saldoFinanceiroAnterior} />
            </p>
            <TabelaDeDados<LinhaDoAnexo10> colunas={COLUNAS} linhas={q.linhas} keyDe={(l) => String(l.ano)} legenda="Valores em R$ · (c) = (a) − (b); (d) = (d do exercício anterior) + (c)." />
          </section>
        ))
      )}

      {dados.disponivel && podeEscrever ? (
        <section aria-label="Registrar a projeção atuarial" className="space-y-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
          <h2 className="text-sm font-semibold">Registrar ou substituir a projeção de um plano</h2>
          <FormProjecao exercicio={exercicio} planos={PLANOS_DO_REGIME_PROPRIO.map((p) => ({ valor: p, rotulo: ROTULO_DO_PLANO[p] }))} anosMinimos={ANOS_MINIMOS_DA_PROJECAO} />
        </section>
      ) : null}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        <p className="mb-1 font-medium uppercase tracking-wide">Notas do demonstrativo</p>
        <ul className="list-disc space-y-1 pl-4">
          {dados.notas.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function lerInteiro(v: string | string[] | undefined, padrao: number): number {
  const bruto = Array.isArray(v) ? v[0] : v;
  if (bruto === undefined) return padrao;
  const n = Number.parseInt(bruto, 10);
  return Number.isNaN(n) ? padrao : n;
}

const COLUNAS: readonly ColunaTabela<LinhaDoAnexo10>[] = [
  { chave: "ano", cabecalho: "Exercício", alinhamento: "centro", largura: "6rem", celula: (l) => String(l.ano) },
  { chave: "a", cabecalho: "Receitas previdenciárias (a)", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.receitas} /> },
  { chave: "b", cabecalho: "Despesas previdenciárias (b)", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.despesas} /> },
  { chave: "c", cabecalho: "Resultado previdenciário (c) = (a − b)", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.resultado} /> },
  { chave: "d", cabecalho: "Saldo financeiro do exercício (d)", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.saldo} /> },
];
