import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { diaCivilBr } from "../../../../packages/datas/index";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import {
  lerComparativoDaPeca,
  lerLinhasAlteraveis,
  pecasDisponiveis,
  PortaSemBancoError,
} from "../../../../lib/portas/alteracoes-do-planejamento";
import { FormAtoDeAlteracao, FormItemDoAto } from "./FormAtoDeAlteracao";
import { SeletorDaPeca } from "./SeletorDaPeca";

/**
 * ALTERAÇÕES DO PPA E DA LDO — o original, os atos e o valor vigente, lado a lado.
 *
 * ⚠️ O ORIGINAL NUNCA É TOCADO, e é isso que a tela mostra: a coluna "aprovado" é a linha como a
 * peça foi aprovada, e o "vigente" é ela mais a soma dos atos. Não há coluna de cache em lugar
 * nenhum — se houvesse, no dia em que alguém gravasse um ajuste e esquecesse o cache, a peça
 * passaria a declarar um valor que os próprios atos dela desmentem.
 *
 * ⚠️ "SITUAÇÃO ATÉ" É A VERSÃO DA PEÇA. Não existe "versão 2" guardada: existe o estado da peça
 * até uma data, que é o que a consulta cronológica e o relatório por versão pedem. Uma versão
 * nomeada sem consequência no rito seria rótulo sem significado.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO e do estado das peças.
 */
export const dynamic = "force-dynamic";

const CELULA = "px-3 py-2 text-sm";
const CABECA =
  "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]";

function umString(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function Page({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  const sp = await searchParams;

  const cabecalho = (
    <PageHeader
      subtitulo="O que cada lei mudou no plano depois de aprovado — e quanto vale hoje"
      titulo="Alterações do planejamento"
    />
  );

  let pecas: readonly { peca: "PPA" | "LDO"; id: string; rotulo: string }[];
  try {
    pecas = await pecasDisponiveis();
  } catch (erro) {
    return (
      <div>
        {cabecalho}
        <EstadoVazio
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
          titulo={
            erro instanceof PortaSemBancoError
              ? "Banco de dados não configurado"
              : "Não foi possível ler as peças de planejamento"
          }
        />
      </div>
    );
  }

  if (pecas.length === 0) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <EstadoVazio
          descricao="Só existe alteração de peça aprovada. Cadastre o PPA ou a LDO antes de registrar a lei que os altera."
          titulo="Nenhum PPA ou LDO cadastrado"
        />
      </div>
    );
  }

  // A peça vem da URL como "PPA::<id>"; sem ela, a primeira do rol (o PPA mais recente).
  const daUrl = umString(sp["peca"]);
  const escolhida =
    pecas.find((p) => `${p.peca}::${p.id}` === daUrl) ?? (pecas[0] as (typeof pecas)[number]);
  const ateBruto = umString(sp["ate"]);
  // ⚠️ MEIO-DIA, e não meia-noite: `new Date("2027-06-30")` é meia-noite UTC, que no fuso do ente
  // é o dia 29 — e o corte perderia justamente os atos do próprio dia escolhido.
  const ate = /^\d{4}-\d{2}-\d{2}$/.test(ateBruto)
    ? new Date(`${ateBruto}T12:00:00.000-03:00`)
    : null;

  const [comparativo, alteraveis] = await Promise.all([
    lerComparativoDaPeca({ peca: escolhida.peca, pecaId: escolhida.id, ate }),
    lerLinhasAlteraveis({ peca: escolhida.peca, pecaId: escolhida.id }),
  ]);

  const opcoes = alteraveis.flatMap((l) =>
    l.grandezas.map((g) => ({
      valor: `${l.alvo}::${l.alvoId}::${g.grandeza}`,
      rotulo: `${l.rotulo} — ${g.rotulo}`,
    }))
  );
  const atosParaItem = comparativo.atos.map((a) => ({
    valor: a.id,
    rotulo: `${a.numero}/${a.ano} — ${diaCivilBr(a.data)}`,
  }));

  return (
    <div className="space-y-4">
      {cabecalho}

      <SeletorDaPeca
        ate={ateBruto}
        pecas={pecas.map((p) => ({ valor: `${p.peca}::${p.id}`, rotulo: p.rotulo }))}
        selecionada={`${escolhida.peca}::${escolhida.id}`}
      />

      <div
        className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]"
        data-peca={`${escolhida.peca}::${escolhida.id}`}
      >
        <strong>{comparativo.rotuloDaPeca}</strong>
        {ate === null ? (
          <> — situação vigente, com todos os atos registrados.</>
        ) : (
          <> — situação até {diaCivilBr(ate)}: atos posteriores a essa data ficam de fora.</>
        )}{" "}
        O valor aprovado permanece gravado como estava; o vigente é ele mais a soma dos ajustes.
      </div>

      {comparativo.atos.length === 0 ? (
        <EstadoVazio
          descricao="Nenhuma lei ou decreto alterou esta peça no recorte escolhido. O valor vigente é igual ao aprovado."
          titulo="Peça sem alterações"
        />
      ) : (
        <>
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
              Atos, em ordem cronológica
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)]">
                    <th className={CABECA}>Ato</th>
                    <th className={CABECA}>Data</th>
                    <th className={CABECA}>Publicação</th>
                    <th className={CABECA}>Fundamento</th>
                    <th className={`${CABECA} text-right`}>Linhas</th>
                    <th className={CABECA}>Registrado por</th>
                  </tr>
                </thead>
                <tbody>
                  {comparativo.atos.map((a) => (
                    <tr
                      className="border-b border-[color:var(--color-border)]"
                      data-ato={`${a.numero}/${a.ano}`}
                      key={a.id}
                    >
                      <td className={`${CELULA} tabular-nums`}>
                        {a.numero}/{a.ano}
                      </td>
                      <td className={`${CELULA} tabular-nums`}>{diaCivilBr(a.data)}</td>
                      <td className={`${CELULA} tabular-nums`}>{diaCivilBr(a.dataPublicacao)}</td>
                      <td className={CELULA}>{a.fundamento}</td>
                      <td className={`${CELULA} text-right tabular-nums`} data-itens-do-ato={`${a.numero}/${a.ano}`}>
                        {a.itens}
                      </td>
                      <td className={CELULA}>{a.criadoPor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/*
              ⚠️ NÃO HÁ TOTAL EM DINHEIRO POR ATO, e a ausência é deliberada: uma lei que mexe na
              previsão de receita e na dívida consolidada não tem soma — somar receita com estoque
              de dívida produziria um número que nenhum demonstrativo reconhece.
            */}
            <p className="mt-3 text-xs text-[color:var(--color-ink-3)]">
              A coluna de linhas conta quantos valores o ato alterou. Não há total em dinheiro por
              ato: um mesmo ato pode mexer em grandezas que não se somam entre si.
            </p>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
              Comparativo — aprovado, ajuste e vigente
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)]">
                    <th className={CABECA}>Linha da peça</th>
                    <th className={CABECA}>Grandeza</th>
                    <th className={`${CABECA} text-right`}>Aprovado</th>
                    <th className={`${CABECA} text-right`}>Ajuste</th>
                    <th className={`${CABECA} text-right`}>Vigente</th>
                    <th className={`${CABECA} text-right`}>Atos</th>
                  </tr>
                </thead>
                <tbody>
                  {comparativo.linhas.map((l) => (
                    <tr
                      className="border-b border-[color:var(--color-border)]"
                      data-linha={l.chave}
                      key={l.chave}
                    >
                      <td className={CELULA}>{l.rotulo}</td>
                      <td className={CELULA}>{l.rotuloDaGrandeza}</td>
                      <td className={`${CELULA} text-right`} data-original={l.chave}>
                        <ValorMonetario valor={l.original} />
                      </td>
                      <td className={`${CELULA} text-right`} data-ajuste={l.chave}>
                        <ValorMonetario valor={l.ajuste} />
                      </td>
                      <td className={`${CELULA} text-right font-semibold`} data-vigente={l.chave}>
                        <ValorMonetario valor={l.atual} />
                      </td>
                      <td className={`${CELULA} text-right tabular-nums`}>{l.atos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
              Totais por grandeza
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)]">
                    <th className={CABECA}>Grandeza</th>
                    <th className={`${CABECA} text-right`}>Linhas</th>
                    <th className={`${CABECA} text-right`}>Aprovado</th>
                    <th className={`${CABECA} text-right`}>Ajuste</th>
                    <th className={`${CABECA} text-right`}>Vigente</th>
                  </tr>
                </thead>
                <tbody>
                  {comparativo.totais.map((t) => (
                    <tr
                      className="border-b border-[color:var(--color-border)]"
                      data-total={t.grandeza}
                      key={t.grandeza}
                    >
                      <td className={CELULA}>{t.rotuloDaGrandeza}</td>
                      <td className={`${CELULA} text-right tabular-nums`}>{t.linhas}</td>
                      <td className={`${CELULA} text-right`}>
                        <ValorMonetario valor={t.original} />
                      </td>
                      <td className={`${CELULA} text-right`} data-total-ajuste={t.grandeza}>
                        <ValorMonetario valor={t.ajuste} />
                      </td>
                      <td className={`${CELULA} text-right font-semibold`} data-total-vigente={t.grandeza}>
                        <ValorMonetario valor={t.atual} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-[color:var(--color-ink-3)]">
              O total existe por grandeza, e só: é o único agrupamento em que as parcelas são da
              mesma coisa.
            </p>
          </Card>
        </>
      )}

      {opcoes.length === 0 ? (
        <EstadoVazio
          descricao={
            escolhida.peca === "PPA"
              ? "Esta peça ainda não tem previsão de receita, programa ou ação cadastrados — não há valor a alterar."
              : "Esta LDO ainda não tem metas fiscais cadastradas. O que uma lei altera nela são as metas anuais."
          }
          titulo="Nada a alterar nesta peça"
        />
      ) : (
        <>
          <FormAtoDeAlteracao opcoes={opcoes} peca={escolhida.peca} pecaId={escolhida.id} />
          {atosParaItem.length > 0 ? (
            <FormItemDoAto atos={atosParaItem} opcoes={opcoes} />
          ) : null}
        </>
      )}
    </div>
  );
}
