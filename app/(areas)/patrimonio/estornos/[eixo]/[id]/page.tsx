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
            <span className="tabular-nums text-[color:var(--color-ink-3)]">fato em {i.quando} · registrado {i.registradoEm} · {i.por}</span>
          </div>
          {i.motivo !== null ? <div className="mt-1 text-[color:var(--color-ink-2)]">{i.motivo}</div> : null}
          {i.porque !== null ? <div className="mt-1 text-[color:var(--color-status-erro-fg)]">Depende porque {i.porque}.</div> : null}
          <div className="mt-1">
            <Link href={i.href} className="underline underline-offset-2">analisar o estorno deste</Link>
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
          <h2 className="font-medium">O que este estorno desfaz</h2>
          <p className="text-sm">
            O movimento acima é anulado por um lançamento novo, com o mesmo valor e as pernas invertidas; o original continua no histórico.
            {analise.temMemoria ? " A memória de cálculo gravada com ele permanece — o estorno não a apaga." : ""}
          </p>
          {analise.arrastados.length > 0 ? (
            <>
              <p className="text-sm">
                {analise.execucao !== null
                  ? `Este movimento é um item da execução de ${analise.execucao.competencia} (${analise.execucao.escopo}, ${analise.execucao.itens} item(ns), um lançamento só). O estorno desfaz ESSA execução — não a virada de todas as classes. Desfeitos no mesmo ato:`
                  : "Desfeitos NO MESMO ATO, porque pertencem à mesma operação:"}
              </p>
              <Itens itens={analise.arrastados} tom="neutro" />
            </>
          ) : null}
          {analise.resultados.length > 0 ? (
            <p className="text-sm">E também: {analise.resultados.join("; ")}.</p>
          ) : null}
        </section>

        <section className="space-y-2">
          <h2 className="font-medium">Quem depende deste movimento</h2>
          {analise.dependentes.length === 0 ? (
            <p className="text-sm text-[color:var(--color-ink-2)]">Nenhum movimento posterior ficaria inválido com este estorno.</p>
          ) : (
            <>
              <p className="text-sm">Estes movimentos foram conferidos ou calculados sobre um acervo que incluía este. Estorne-os primeiro, do mais recente ao mais antigo:</p>
              <Itens itens={analise.dependentes} tom="erro" />
            </>
          )}
        </section>

        {analise.informativos.length > 0 ? (
          <section className="space-y-2">
            <h2 className="font-medium">{eixo === "valor" ? "Posteriores do mesmo bem" : "Posteriores do mesmo eixo deste bem"}</h2>
            <p className="text-sm text-[color:var(--color-ink-2)]">
              {eixo === "valor"
                ? "Não ficam inválidos com este estorno; aparecem para que a cadeia do bem seja vista inteira."
                : "O estado atual do bem é o movimento mais recente do eixo; estornar um anterior reescreve o histórico, não o estado."}
            </p>
            <Itens itens={analise.informativos} tom="neutro" />
          </section>
        ) : null}

        {analise.bloqueios.length > 0 ? (
          <section className="space-y-1">
            <h2 className="font-medium">Por que não pode ser estornado agora</h2>
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
                ? `Estorna o movimento e os ${analise.arrastados.length} arrastado(s) da operação, numa só transação.`
                : "Estorna o movimento por lançamento novo, com a data e o motivo abaixo."
            }
          />
        ) : (
          <p className="text-sm text-[color:var(--color-ink-2)]">Nada bloqueia o estorno, mas o seu perfil não estorna neste eixo — o ato é de quem tem a ação de estornar.</p>
        )}
      </div>
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-4">
          <PageHeader titulo="Estorno" subtitulo="Análise de dependências" />
          <EstadoVazio titulo="Banco de dados indisponível" descricao="Esta tela lê os movimentos do bem e da classe. Sem banco, não tem o que mostrar." />
        </div>
      );
    }
    throw e;
  }
}
