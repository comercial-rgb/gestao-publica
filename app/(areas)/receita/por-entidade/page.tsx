import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { lerArrecadadoPorEntidade, lerGuiasSemEntidade } from "../../../../lib/portas/arrecadacao";
import {
  lerEntidadesContabeis,
  TIPOS_DE_ATO_NA_TELA,
} from "../../../../lib/portas/entidades-contabeis";
import { dataBr, exercicioAutorizado, ExercicioIlegivelError } from "../../../../lib/recorte";
import { AtribuicoesDaFila, FormAtribuir } from "./FormAtribuir";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/**
 * A ARRECADACAO POR ENTIDADE TITULAR (V11 V9 · desenho de engenharia).
 *
 * ⚠️ ORIGEM DA CORRECAO (V11 V9.3): dizia `TR 5.38.7`. Nao se sustenta — a secao 5.38 e o
 * PORTAL DE TRANSPARENCIA, e a 5.38.7 pede consulta PUBLICA; esta tela e interna e autenticada.
 * Sem clausula atribuida ate que se ache vinculo literal. Ver `acoes.ts`.
 *
 * ═══ ⚠️ O NÃO ATRIBUÍDO É UMA LINHA, COM TOTAL PRÓPRIO ═══
 * Esta é a decisão inteira desta tela. As guias que não dizem de quem são **não somem**, **não
 * entram no zero de ninguém** e **não se distribuem**. Esconder faria a soma das entidades
 * parecer o total do ente, e um servidor concluiria que a prefeitura arrecadou tudo o que
 * ninguém atribuiu. Ratear inventaria o número. Mostrar separado é a única forma que não mente —
 * e o total do não atribuído é, literalmente, a fila de trabalho.
 *
 * ═══ ⚠️ E ISTO **NÃO** É O SUPERÁVIT POR ENTIDADE ═══
 * O que esta tela parte é a ARRECADAÇÃO. O superávit financeiro continua sendo do ENTE, e a
 * consulta dele continua dizendo por quê: o caixa por fonte tem quatro pernas (arrecadação,
 * pagamento, extraorçamentário, restos) e só uma delas tem entidade. Partir uma e subtrair as
 * outras três inteiras produziria um número com cara de número — e esse número autoriza despesa.
 *
 * ⚠️ IGNORA O SELETOR DE UNIDADE, como a tela da arrecadação. Entidade contábil não é unidade
 * gestora: UG é a estrutura da despesa; entidade é quem tem balancete próprio.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function PorEntidadePage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;

  let exercicio: number;
  let consulta: Awaited<ReturnType<typeof lerArrecadadoPorEntidade>>;
  let pendentes: Awaited<ReturnType<typeof lerGuiasSemEntidade>>;
  let entidades: Awaited<ReturnType<typeof lerEntidadesContabeis>>;
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_RECEITA");
    exercicio = exercicioAutorizado(sp);
    consulta = await lerArrecadadoPorEntidade({ exercicio });
    pendentes = await lerGuiasSemEntidade({ exercicio });
    entidades = await lerEntidadesContabeis();
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Arrecadação por entidade" subtitulo="Receita arrecadada por entidade contábil titular" />
        <EstadoVazio
          titulo={
            erro instanceof ExercicioIlegivelError
              ? "Exercício inválido"
              : "Não foi possível carregar a arrecadação por entidade"
          }
          descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."}
        />
      </div>
    );
  }

  const opcoes = entidades.map((e) => ({ id: e.id, codigo: e.codigo, nome: e.nome }));
  const temNaoAtribuido = consulta.naoAtribuido.guias > 0;

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader
        titulo="Arrecadação por entidade"
        subtitulo={`Receita arrecadada por entidade contábil titular, exercício ${String(exercicio)}.`}
      />

      <table className="w-full text-sm" data-papel="arrecadado-por-entidade">
        <caption className="sr-only">
          Arrecadação líquida do exercício {exercicio} por entidade contábil titular, com o total
          não atribuído em linha própria.
        </caption>
        <thead>
          <tr className="border-b border-[color:var(--color-border)] text-left text-xs">
            <th scope="col" className="py-2">Entidade</th>
            <th scope="col" className="py-2 text-right">Guias</th>
            <th scope="col" className="py-2 text-right">Arrecadado</th>
            {/*
              ⚠️ A PROCEDÊNCIA É COLUNA, NÃO NOTA DE RODAPÉ (V11 V9.2). O total por entidade passou
              a somar dois caminhos — o que veio identificado na origem e o que o ente atribuiu
              depois, por ato. Somá-los sem dizer quais são quais responderia "quanto" e apagaria
              "como o ente sabe disso", que é a pergunta de quem confere de fora.
            */}
            <th scope="col" className="py-2 text-right">Procedência</th>
          </tr>
        </thead>
        <tbody>
          {consulta.linhas.map((l) => (
            <tr key={l.entidadeId ?? "sem"} className="border-b border-[color:var(--color-border)]" data-linha-entidade={l.codigo}>
              <td className="py-2">
                <span className="font-semibold">{l.codigo}</span> {l.nome}
              </td>
              <td className="py-2 text-right">{l.guias}</td>
              <td className="py-2 text-right"><ValorMonetario valor={l.arrecadado} /></td>
              <td className="py-2 text-right text-xs text-[color:var(--color-ink-2)]" data-procedencia={l.codigo ?? ""}>
                {l.porAtribuicao.guias === 0 ? (
                  "identificada na origem"
                ) : l.naOrigem.guias === 0 ? (
                  <>atribuída por ato ({l.porAtribuicao.guias})</>
                ) : (
                  <>
                    na origem <ValorMonetario valor={l.naOrigem.arrecadado} /> ({l.naOrigem.guias}) · por ato{" "}
                    <ValorMonetario valor={l.porAtribuicao.arrecadado} /> ({l.porAtribuicao.guias})
                  </>
                )}
              </td>
            </tr>
          ))}
          {/*
            ⚠️ A LINHA DO NÃO ATRIBUÍDO ESTÁ AQUI, NA MESMA TABELA, e não numa nota de rodapé.
            Fora da tabela ela seria lida como observação; dentro, ela participa da soma que a
            pessoa faz com os olhos — que é exatamente o ponto.
          */}
          <tr className="border-b border-[color:var(--color-border)]" data-linha-entidade="nao-atribuido">
            <td className="py-2">
              <span className={temNaoAtribuido ? "text-[color:var(--color-status-alerta-fg)]" : ""}>
                Não atribuído (entidade titular não informada)
              </span>
            </td>
            <td className="py-2 text-right">{consulta.naoAtribuido.guias}</td>
            <td className="py-2 text-right"><ValorMonetario valor={consulta.naoAtribuido.arrecadado} /></td>
            <td className="py-2 text-right text-xs text-[color:var(--color-ink-2)]">
              {/* Esta linha é o complemento: nem origem, nem ato. Por isso não tem procedência a declarar. */}
              sem identificação
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <td className="py-2">Total arrecadado no exercício</td>
            <td className="py-2" />
            <td className="py-2 text-right" data-papel="total-do-exercicio">
              <ValorMonetario valor={consulta.total} />
            </td>
            <td className="py-2" />
          </tr>
        </tfoot>
      </table>

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        {/*
          ⚠️ ESTA NOTA É A MESMA DISCIPLINA DA TELA DO SUPERÁVIT. Quem vê "por entidade" numa
          parte conclui que a outra também está partida. Dizer o que NÃO está partido, e por quê,
          é o que separa um recorte honesto de um número inventado.
        */}
        Esta consulta distribui apenas a <strong>arrecadação</strong> por entidade. O{" "}
        <strong>superávit financeiro</strong> continua sendo do ente como um todo, pois também depende
        de pagamentos, movimentos extraorçamentários e restos a pagar, que não são distribuídos por
        entidade.
      </div>

      {/*
        ⚠️ O PROVEDOR ENVOLVE ATÉ A CONDIÇÃO, e não só a lista (V11 V9.3). A confirmação da
        atribuição morreu TRÊS vezes, cada uma num invólucro mais externo: dentro do formulário,
        dentro do `<li>` da guia, e — medido no passo 9.5 contra o artefato `6789a1f` — dentro
        desta `<section>`, que só existe enquanto HOUVER guia pendente. Atribuída a última, a
        fila esvazia, a seção inteira deixa de ser renderizada e leva o aviso junto.
        A regra que fecha a família: o aviso de um ato vive FORA de tudo o que o ato muda.
      */}
      <AtribuicoesDaFila>
      {pendentes.length > 0 ? (
        <section className="space-y-2" data-papel="fila-nao-atribuidas">
          <h2 className="text-sm font-semibold">
            Guias sem entidade ({pendentes.length})
          </h2>
          <ul className="space-y-2">
            {pendentes.map((g) => (
              <li
                key={g.id}
                className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3"
                data-guia={g.numeroReceita}
              >
                <div className="flex flex-wrap items-baseline gap-2 text-sm">
                  <span className="font-semibold">{g.numeroReceita}</span>
                  <span className="text-xs text-[color:var(--color-ink-2)]">
                    {dataBr(g.dataArrecadacao)} · fonte {g.fonteCodigo}
                  </span>
                  <ValorMonetario valor={g.valor} />
                </div>
                {/*
                  ⚠️ DOIS CAMINHOS, DUAS MENSAGENS. Uma frase só para os dois casos mandaria
                  metade das pessoas ao lugar errado: a guia com conta se resolve declarando o
                  titular da conta (e resolve todas as outras daquela conta de uma vez); a guia
                  sem conta só se resolve uma a uma.
                */}
                {g.caminho === "DECLARAR_TITULAR_DA_CONTA" ? (
                  <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">
                    Recebida na conta <strong>{g.contaCodigo}</strong>, que ainda não tem titular
                    declarado. Declare o titular em <strong>Financeiro &gt; Contas bancárias</strong>{" "}
                    para identificar as próximas guias dessa conta; esta guia precisa da atribuição abaixo.
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">
                    Esta guia não declara conta bancária (registro antigo ou importado). Informe a
                    entidade na atribuição abaixo.
                  </p>
                )}
                <FormAtribuir
                  receitaArrecadadaId={g.id}
                  numeroReceita={g.numeroReceita}
                  entidades={opcoes}
                  tiposDeAto={TIPOS_DE_ATO_NA_TELA}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      </AtribuicoesDaFila>
    </div>
  );
}
