import Link from "next/link";
import { BotaoCsvDasTabelas } from "../../../../../components/ui/BotaoCsvDasTabelas";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../../components/ui/SincronizarContexto";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { lerVinculoPpaLoa, PortaSemBancoError, type VinculoPpaLoa } from "../../../../../lib/portas/loa";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { exercicioAutorizado, ExercicioIlegivelError } from "../../../../../lib/recorte";

/**
 * V37 — AS AÇÕES DO PPA NA LOA: para cada ação do plano que cobre o exercício, as fichas que a executam (mesmo programa
 * e mesma ação; e a mesma unidade, função e subfunção quando o plano as declara), a dotação do exercício e a somada
 * nos exercícios do plano, ao lado da meta financeira vigente do plano. As fichas sem ação correspondente vêm à parte,
 * com o motivo. Só leitura; a tela não declara compatibilidade, mostra os valores.
 */
export const dynamic = "force-dynamic";

const TITULO = "Ações do PPA na LOA";
type Acao = VinculoPpaLoa["acoes"][number];
type SemAcao = VinculoPpaLoa["fichasSemAcao"][number];

const fichaLink = (f: { readonly id: string; readonly numero: number }): React.ReactNode => (
  <Link key={f.id} href={`/planejamento/fichas/${f.id}`} className="text-[color:var(--color-primary)] hover:underline">{f.numero}</Link>
);

const COLUNAS_ACOES: readonly ColunaTabela<Acao>[] = [
  { chave: "programa", cabecalho: "Programa", alinhamento: "esquerda", celula: (a) => a.programa },
  { chave: "acao", cabecalho: "Ação do plano", alinhamento: "esquerda", celula: (a) => (<span>{a.acao}<span className="block text-xs text-[color:var(--color-ink-2)]">{a.produto}{a.recorte === null ? "" : ` · ${a.recorte}`}</span></span>) },
  { chave: "meta", cabecalho: "Meta financeira do plano", alinhamento: "direita", largura: "9rem", celula: (a) => <ValorMonetario valor={a.metaFinanceiraVigente} /> },
  { chave: "plano", cabecalho: "Dotação nos anos do plano", alinhamento: "direita", largura: "9rem", celula: (a) => <ValorMonetario valor={a.dotacaoNoPlano} /> },
  { chave: "exercicio", cabecalho: "Dotação no exercício", alinhamento: "direita", largura: "9rem", celula: (a) => <ValorMonetario valor={a.dotacaoNoExercicio} /> },
  { chave: "fichas", cabecalho: "Fichas", alinhamento: "esquerda", celula: (a) => (a.fichas.length === 0 ? <span className="text-[color:var(--color-ink-2)]">Nenhuma no exercício</span> : <span className="flex flex-wrap gap-x-2">{a.fichas.map(fichaLink)}</span>) },
];

const COLUNAS_SEM_ACAO: readonly ColunaTabela<SemAcao>[] = [
  { chave: "ficha", cabecalho: "Ficha", alinhamento: "direita", largura: "4rem", celula: (f) => fichaLink(f) },
  { chave: "classificacao", cabecalho: "Unidade, programa e ação", alinhamento: "esquerda", celula: (f) => `${f.unidade} · ${f.programa} · ${f.acao}` },
  { chave: "natureza", cabecalho: "Natureza", alinhamento: "esquerda", largura: "6rem", celula: (f) => f.natureza },
  { chave: "valor", cabecalho: "Dotação", alinhamento: "direita", largura: "9rem", celula: (f) => <ValorMonetario valor={f.valorDotado} /> },
  { chave: "motivo", cabecalho: "Motivo", alinhamento: "esquerda", celula: (f) => f.motivo },
];

export default async function VinculoPpaLoaPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  const sp = await searchParams;

  let exercicio: number;
  let v: VinculoPpaLoa;
  try {
    exercicio = exercicioAutorizado(sp);
    v = await lerVinculoPpaLoa({ exercicio });
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo={TITULO} subtitulo="As fichas da LOA que executam cada ação do Plano Plurianual" />
        <EstadoVazio
          titulo={erro instanceof ExercicioIlegivelError ? "O exercício pedido não é um ano" : erro instanceof PortaSemBancoError ? "Serviço indisponível" : "Não foi possível montar o vínculo"}
          descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SincronizarContexto />
      <PageHeader
        titulo={TITULO}
        subtitulo={v.plano === null ? `Exercício ${String(exercicio)}: nenhum plano plurianual cobre este exercício` : `Exercício ${String(exercicio)} · plano ${String(v.plano.anoInicio)}–${String(v.plano.anoFim)} (${v.plano.leiRef})`}
        acoes={<BotaoCsvDasTabelas nomeArquivo={`acoes-do-ppa-na-loa-${String(exercicio)}.csv`} />}
      />
      <p data-resumo-do-vinculo className="text-sm text-[color:var(--color-ink-2)]">
        Dotação do exercício: <ValorMonetario valor={v.totalDotadoNoExercicio} />, das quais <ValorMonetario valor={v.totalDotadoComAcao} /> em
        fichas que executam uma ação do plano. Uma ficha executa a ação quando tem o mesmo programa e a mesma ação e, se o
        plano as declara, a mesma unidade executora, função e subfunção. A meta financeira vale para o plano inteiro.
      </p>
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">Ações do plano</h2>
        {v.acoes.length === 0 ? (
          <EstadoVazio titulo="Nenhuma ação no plano" descricao={v.plano === null ? "Cadastre o Plano Plurianual que cobre este exercício." : "O plano deste exercício ainda não tem ações cadastradas."} />
        ) : (
          <TabelaDeDados<Acao> colunas={COLUNAS_ACOES} linhas={v.acoes} keyDe={(a) => a.acaoPpaId} legenda={`${String(v.acoes.length)} ação(ões) do plano.`} />
        )}
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">Fichas sem ação correspondente no plano</h2>
        {v.fichasSemAcao.length === 0 ? (
          <EstadoVazio titulo="Todas as fichas executam uma ação do plano" descricao="Nenhuma ficha do exercício ficou sem ação correspondente." />
        ) : (
          <TabelaDeDados<SemAcao> colunas={COLUNAS_SEM_ACAO} linhas={v.fichasSemAcao} keyDe={(f) => f.id} legenda={`${String(v.fichasSemAcao.length)} ficha(s).`} />
        )}
      </section>
    </div>
  );
}
