import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../../components/ui/SincronizarContexto";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { lerMovimentosSemTitular } from "../../../../../lib/portas/movimentos-sem-titular";
import { lerEntidadesContabeis, TIPOS_DE_ATO_NA_TELA } from "../../../../../lib/portas/entidades-contabeis";
import { dataBr, exercicioAutorizado, ExercicioIlegivelError } from "../../../../../lib/recorte";
import { AtribuicoesDaFila, FormAtribuir } from "./FormAtribuirMovimento";

import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
/**
 * V34 — OS MOVIMENTOS EXTRAORÇAMENTÁRIOS SEM TITULAR: a fila de regularização.
 *
 * Um ingresso avulso ou um recolhimento numa conta sem titular declarado não diz de que entidade (e de que unidade
 * gestora) é. Com várias unidades gestoras, a remessa do Tribunal não o carimba em quem pediu: omite e nomeia. Aqui se
 * resolve um a um, por ato; ou, para todos de uma conta, declarando o titular em Financeiro › Contas bancárias.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function MovimentosSemTitularPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  let exercicio: number;
  let fila: Awaited<ReturnType<typeof lerMovimentosSemTitular>>;
  let entidades: Awaited<ReturnType<typeof lerEntidadesContabeis>>;
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_FINANCEIRO");
    exercicio = exercicioAutorizado(sp);
    fila = await lerMovimentosSemTitular({ exercicio });
    entidades = await lerEntidadesContabeis();
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Movimentos sem titular" subtitulo="Extraorçamentário em conta sem titular declarado" />
        <EstadoVazio
          titulo={erro instanceof ExercicioIlegivelError ? "Exercício inválido" : "Não foi possível carregar os movimentos"}
          descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."}
        />
      </div>
    );
  }
  const opcoes = entidades.map((e) => ({ id: e.id, codigo: e.codigo, nome: e.nome }));

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader
        titulo="Movimentos sem titular"
        subtitulo={`Ingressos avulsos e recolhimentos do exercício ${String(exercicio)} em conta bancária sem titular declarado.`}
      />
      <p className="text-sm text-[color:var(--color-ink-2)]">
        Estes movimentos não dizem a que entidade pertencem. Enquanto não forem regularizados, a remessa ao Tribunal de um
        ente com mais de uma unidade gestora os deixa de fora e os relaciona como pendência. Para resolver todos os
        movimentos de uma conta, declare o titular em <strong>Financeiro &gt; Contas bancárias</strong>; para um só, use a
        atribuição abaixo.
      </p>
      <AtribuicoesDaFila>
        {fila.length === 0 ? (
          <EstadoVazio titulo="Nenhum movimento sem titular" descricao={`Todos os movimentos de ${String(exercicio)} têm entidade identificada.`} />
        ) : (
          <section className="space-y-2" data-papel="fila-movimentos-sem-titular">
            <h2 className="text-sm font-semibold">Movimentos a regularizar ({fila.length})</h2>
            <ul className="space-y-2">
              {fila.map((m) => {
                const rotulo = `${m.tipo === "INGRESSO" ? "Ingresso" : "Recolhimento"} de ${dataBr(m.data)} na conta ${m.contaCodigo}`;
                return (
                  <li key={m.id} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3" data-movimento={m.id}>
                    <div className="flex flex-wrap items-baseline gap-2 text-sm">
                      <span className="font-semibold">{rotulo}</span>
                      <ValorMonetario valor={m.valor} />
                    </div>
                    <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">
                      {m.credor} · {m.historico}
                    </p>
                    <FormAtribuir movimentoId={m.id} rotulo={rotulo} entidades={opcoes} tiposDeAto={TIPOS_DE_ATO_NA_TELA} />
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </AtribuicoesDaFila>
    </div>
  );
}
