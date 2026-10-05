import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { lerApropriacoes, type ApropriacaoNaLista } from "../../../../lib/portas/apropriacao-por-competencia";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { acoesPermitidas } from "../../../../lib/portas/molde";
import { anoCivil, competenciaCivil } from "../../../../packages/datas/index";
import { FormAcerto, FormApropriar, FormEncargos, FormParametroDeFerias } from "./Formularios";

/**
 * V35 — APROPRIAÇÃO MENSAL DO 13º E DAS FÉRIAS (MCASP 11ª ed., Parte II, item 18). A folha fechada de cada
 * competência vira o duodécimo de cada vínculo; a liquidação da folha que paga baixa o passivo apropriado; o 13º
 * fecha o ano em zero pelo acerto. Server Component.
 */
export const dynamic = "force-dynamic";

const ROTULO_DO_TIPO: Readonly<Record<ApropriacaoNaLista["tipo"], string>> = {
  DECIMO_TERCEIRO: "13º salário",
  FERIAS: "Férias",
  ENCARGOS_DECIMO_TERCEIRO: "Encargos sobre o 13º",
  ENCARGOS_FERIAS: "Encargos sobre as férias",
};

const COLUNAS: readonly ColunaTabela<ApropriacaoNaLista>[] = [
  { chave: "competencia", cabecalho: "Competência", celula: (l) => l.competencia.split("-").reverse().join("/") },
  { chave: "tipo", cabecalho: "Apropriação", celula: (l) => ROTULO_DO_TIPO[l.tipo] },
  { chave: "vinculos", cabecalho: "Vínculos", alinhamento: "direita", celula: (l) => String(l.vinculos) },
  { chave: "total", cabecalho: "Total apropriado", alinhamento: "direita", celula: (l) => (l.lancou ? <ValorMonetario valor={l.total} /> : "sem valor a lançar") },
];

export default async function ApropriacaoPorCompetenciaPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_FOLHA");
  const sp = await searchParams;
  const bruto = Array.isArray(sp["exercicio"]) ? sp["exercicio"][0] : sp["exercicio"];
  const hoje = new Date();
  const exercicio = bruto !== undefined && /^\d{4}$/.test(bruto) ? Number(bruto) : anoCivil(hoje);
  const [linhas, permitidas] = await Promise.all([lerApropriacoes(exercicio), acoesPermitidas(["APROPRIAR_FOLHA", "CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO"])]);
  return (
    <div className="space-y-4">
      <PageHeader
        titulo="Apropriação do 13º e das férias"
        subtitulo={`Duodécimo mensal de cada vínculo pela folha fechada, e o acerto do 13º no fim do ano — exercício ${String(exercicio)}`}
      />
      {permitidas.has("CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO") ? (
        <section aria-label="Parâmetro das férias" className="space-y-2">
          <h2 className="text-sm font-semibold">Parâmetro das férias</h2>
          <FormParametroDeFerias exercicio={exercicio} />
        </section>
      ) : null}
      {permitidas.has("APROPRIAR_FOLHA") ? (
        <>
          <section aria-label="Apropriação da competência" className="space-y-2">
            <h2 className="text-sm font-semibold">Apropriação da competência</h2>
            <FormApropriar competencia={competenciaCivil(hoje)} />
          </section>
          <section aria-label="Encargos patronais da competência" className="space-y-2">
            <h2 className="text-sm font-semibold">Encargos patronais sobre o 13º e as férias</h2>
            <p className="text-xs text-[color:var(--color-text-muted)]">Depois de apropriar a competência e de apurar os encargos da folha fechada: cada servidor recebe as alíquotas que a apuração aplicou a ele.</p>
            <FormEncargos competencia={competenciaCivil(hoje)} />
          </section>
          <section aria-label="Acerto do 13º" className="space-y-2">
            <h2 className="text-sm font-semibold">Acerto do 13º no fim do exercício</h2>
            <FormAcerto exercicio={exercicio} />
          </section>
        </>
      ) : null}
      {linhas.length === 0 ? (
        <EstadoVazio titulo="Nenhuma competência apropriada" descricao="Feche a folha mensal, declare o parâmetro das férias e o roteiro da apropriação, e aproprie a competência." />
      ) : (
        <TabelaDeDados colunas={COLUNAS} linhas={linhas} keyDe={(l) => `${l.competencia}-${l.tipo}`} legenda="Apropriações do exercício — valores em R$" />
      )}
    </div>
  );
}
