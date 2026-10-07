import Link from "next/link";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { recorteDePagina } from "../../../../lib/portas/contexto";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { acoesPermitidas } from "../../../../lib/portas/molde";
import { fichasParaPrevia, lerPrevias, type PreviaNaLista } from "../../../../lib/portas/previas";
import { FormNovaPrevia, type FichaSugerida } from "./FormsDaPrevia";
import { ORIGEM, SITUACAO, TIPO } from "./rotulos";

/**
 * V36 — AS PRÉVIAS DE ALTERAÇÃO ORÇAMENTÁRIA do exercício. A regra é do M03 (`modules/m03-creditos/previa.ts`). Leitura:
 * CONSULTAR_PLANEJAMENTO; o formulário aparece para quem prepara o decreto.
 */
export const dynamic = "force-dynamic";

const celula = "border-b border-[color:var(--color-border)] px-2 py-1.5 align-top";

export default async function PreviasPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<React.ReactElement> {
  const sp = await searchParams;
  const cabecalho = <PageHeader titulo="Prévias de alteração orçamentária" subtitulo="O crédito adicional antes do decreto: movimentos em lotes, bloqueio das anulações, aprovação e efetivação" />;
  let exercicio: number;
  let previas: readonly PreviaNaLista[];
  let fichas: readonly FichaSugerida[] = [];
  let podeRegistrar: boolean;
  try {
    // A prévia reúne fichas de várias unidades: a leitura é do ente, como a do detalhe.
    await telaExigeLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
    exercicio = (await recorteDePagina(sp, "CONSULTAR_PLANEJAMENTO")).exercicio;
    const [p, permitidas] = await Promise.all([lerPrevias(exercicio), acoesPermitidas(["CRIAR_DECRETO_DE_CREDITO"])]);
    previas = p;
    podeRegistrar = permitidas.has("CRIAR_DECRETO_DE_CREDITO");
    if (podeRegistrar) fichas = await fichasParaPrevia(exercicio);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        {cabecalho}
        <EstadoVazio titulo="Não foi possível ler as prévias" descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <SincronizarContexto />
      {cabecalho}
      {previas.length === 0 ? (
        <EstadoVazio titulo="Nenhuma prévia no exercício" descricao="Registre abaixo a primeira prévia de alteração orçamentária." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" data-tabela-previas>
            <thead>
              <tr className="text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">
                <th scope="col" className={celula}>Prévia</th>
                <th scope="col" className={celula}>Objeto</th>
                <th scope="col" className={celula}>Crédito</th>
                <th scope="col" className={celula}>Situação</th>
                <th scope="col" className={`${celula} text-right`}>Suplementado</th>
                <th scope="col" className={`${celula} text-right`}>Anulado</th>
                <th scope="col" className={celula}>Decreto</th>
              </tr>
            </thead>
            <tbody>
              {previas.map((p) => (
                <tr key={p.id} data-previa={p.numero}>
                  <td className={celula}>
                    <Link className="text-[color:var(--color-primary)] underline" href={`/planejamento/previas/${p.id}`}>
                      nº {p.numero}/{p.exercicio}
                    </Link>
                    <span className="block text-xs text-[color:var(--color-ink-3)]">{p.lotes} lote(s), {p.itens} movimento(s)</span>
                  </td>
                  <td className={celula}>{p.descricao}</td>
                  <td className={celula}>
                    {TIPO[p.tipoCredito]}
                    <span className="block text-xs text-[color:var(--color-ink-3)]">{ORIGEM[p.origemRecurso]}</span>
                  </td>
                  <td className={celula} data-situacao={p.situacao}>{SITUACAO[p.situacao]}</td>
                  <td className={`${celula} text-right tabular-nums`}><ValorMonetario valor={p.suplementado.toFixed(2)} /></td>
                  <td className={`${celula} text-right tabular-nums`}><ValorMonetario valor={p.anulado.toFixed(2)} /></td>
                  <td className={celula}>{p.decreto === null ? "—" : `${p.decreto.numero}/${String(p.decreto.ano)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {podeRegistrar ? <FormNovaPrevia exercicio={exercicio} fichas={fichas} /> : null}
    </div>
  );
}
