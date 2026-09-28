import Link from "next/link";
import { notFound } from "next/navigation";
import { EstadoVazio } from "../../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../../components/ui/PageHeader";
import { acoesPermitidas, exigirLeitura } from "../../../../../../lib/portas/molde";
import {
  ACAO_DO_EIXO,
  analiseDoEstorno,
  ehEixo,
  PortaSemBancoError,
  type ItemDaAnalise,
} from "../../../../../../lib/portas/recursos/estorno-dados";
import { EstornarMovimento } from "../../EstornarMovimento";

/**
 * A ANÁLISE DO ESTORNO (V3, pacote 2) — o que o estorno desfaz, quem depende dele e quem vem
 * depois, ANTES de o operador decidir. O botão só aparece quando nada bloqueia e o servidor
 * autoriza; o serviço refaz a análise dentro da transação e recusa pelos mesmos bloqueios.
 *
 * O `eixo` é `valor` (movimentos que lançam no razão) ou `gestao` (localização, responsável,
 * estado, situação, transferência). Eixo ou movimento desconhecido é `notFound`.
 */
export const dynamic = "force-dynamic";

function Itens({ itens, tom }: { readonly itens: readonly ItemDaAnalise[]; readonly tom: "neutro" | "erro" }): React.ReactElement {
  return (
    <ol className="space-y-2">
      {itens.map((i) => (
        <li key={i.id} data-item={i.id} className={`rounded border px-3 py-2 text-xs ${tom === "erro" ? "border-[color:var(--color-status-erro-fg)]" : "border-[color:var(--color-linha)]"}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">
              {i.rotulo}
              {i.valor !== null ? <span className="ml-2 tabular-nums">{i.valor}</span> : null}
            </span>
            <span className="tabular-nums text-[color:var(--color-ink-3)]">ocorrido em {i.quando} · registrado em {i.registradoEm} · {i.por}</span>
          </div>
          {i.motivo !== null ? <div className="mt-1 text-[color:var(--color-ink-2)]">{i.motivo}</div> : null}
          {i.porque !== null ? <div className="mt-1 text-[color:var(--color-status-erro-fg)]">Depende porque {i.porque}.</div> : null}
          <div className="mt-1">
            <Link href={i.href} className="underline underline-offset-2">Analisar o estorno deste movimento</Link>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default async function AnaliseDoEstornoPage({
  params,
}: {
  readonly params: Promise<{ readonly eixo: string; readonly id: string }>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PATRIMONIO");
  const { eixo, id } = await params;
  if (!ehEixo(eixo)) notFound();

  try {
    const [analise, permitidas] = await Promise.all([analiseDoEstorno(eixo, id), acoesPermitidas([ACAO_DO_EIXO[eixo]])]);
    if (analise === null) notFound();
    const autorizado = [...permitidas].includes(ACAO_DO_EIXO[eixo]);

    return (
      <div className="space-y-6" data-estorno={analise.podeEstornar ? "possivel" : "bloqueado"}>
        <PageHeader titulo={`Estorno — ${analise.titulo}`} subtitulo={analise.subtitulo} />
        {analise.bemId !== null ? (
          <p className="text-xs text-[color:var(--color-ink-2)]">
            Bem <Link className="underline underline-offset-2" href={`/patrimonio/bens-patrimoniais/${analise.bemId}`}>{analise.numeroTombamento}</Link>
            {analise.classe !== null ? ` · ${analise.classe}` : ""}
          </p>
        ) : null}

        <section className="space-y-2">
          <h2 className="font-medium">Efeitos do estorno</h2>
          <p className="text-sm">
            O movimento é anulado por um novo lançamento, de mesmo valor e com débito e crédito invertidos; o registro original permanece no histórico.
            {analise.temMemoria ? " A memória de cálculo do movimento é preservada." : ""}
          </p>
          {analise.arrastados.length > 0 ? (
            <>
              <p className="text-sm">
                {analise.execucao !== null
                  ? `Este movimento integra o processamento da competência ${analise.execucao.competencia} (${analise.execucao.escopo}, ${analise.execucao.itens} item(ns), em lançamento único). O estorno anula somente esse processamento, sem afetar as demais classes. Serão estornados em conjunto:`
                  : "Serão estornados em conjunto, por pertencerem à mesma operação:"}
              </p>
              <Itens itens={analise.arrastados} tom="neutro" />
            </>
          ) : null}
          {analise.resultados.length > 0 ? (
            <p className="text-sm">E também: {analise.resultados.join("; ")}.</p>
          ) : null}
        </section>

        <section className="space-y-2">
          <h2 className="font-medium">Movimentos dependentes</h2>
          {analise.dependentes.length === 0 ? (
            <p className="text-sm text-[color:var(--color-ink-2)]">Nenhum movimento posterior ficaria inválido com este estorno.</p>
          ) : (
            <>
              <p className="text-sm">Os movimentos abaixo foram calculados com base neste. Estorne-os antes, do mais recente para o mais antigo:</p>
              <Itens itens={analise.dependentes} tom="erro" />
            </>
          )}
        </section>

        {analise.informativos.length > 0 ? (
          <section className="space-y-2">
            <h2 className="font-medium">{eixo === "valor" ? "Movimentos posteriores do mesmo bem" : "Movimentos de gestão posteriores deste bem"}</h2>
            <p className="text-sm text-[color:var(--color-ink-2)]">
              {eixo === "valor"
                ? "Não são afetados por este estorno; são exibidos para consulta do histórico completo do bem."
                : "A situação atual do bem corresponde ao movimento mais recente; o estorno de um movimento anterior altera apenas o histórico."}
            </p>
            <Itens itens={analise.informativos} tom="neutro" />
          </section>
        ) : null}

        {analise.bloqueios.length > 0 ? (
          <section className="space-y-1">
            <h2 className="font-medium">Impedimentos ao estorno</h2>
            {analise.bloqueios.map((b) => (
              <p key={b} role="alert" className="whitespace-pre-line text-sm text-[color:var(--color-status-erro-fg)]">{b}</p>
            ))}
          </section>
        ) : autorizado ? (
          <EstornarMovimento
            eixo={eixo}
            movimentoId={analise.movimentoId}
            resumo={
              analise.arrastados.length > 0
                ? `Estorna o movimento e os ${analise.arrastados.length} movimento(s) vinculado(s) da mesma operação, em um único registro.`
                : "Estorna o movimento por novo lançamento, com a data e o motivo informados abaixo."
            }
          />
        ) : (
          <p className="text-sm text-[color:var(--color-ink-2)]">Não há impedimentos ao estorno, mas o seu perfil não tem permissão para estorná-lo.</p>
        )}
      </div>
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-4">
          <PageHeader titulo="Estorno" subtitulo="Análise de dependências do movimento" />
          <EstadoVazio titulo="Dados indisponíveis" descricao="Não foi possível acessar os movimentos do bem no momento. Tente novamente em instantes." />
        </div>
      );
    }
    throw e;
  }
}
