import { anoCivil } from "../../../../packages/datas/index";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { exigirLeitura } from "../../../../lib/portas/molde";
import { consultaDoSuperavit } from "../../../../lib/portas/superavit";
import { PortaSemBancoError } from "../../../../lib/portas/cliente";

/**
 * A CONSULTA DO SUPERÁVIT FINANCEIRO POR FONTE (V11 V3.1).
 *
 * ⚠️ O NÚMERO EXISTIA E NÃO TINHA ONDE SER PERGUNTADO. O guard do M03 já calculava tudo
 * isto dentro da transação que grava o decreto — mas a resposta só chegava como RECUSA,
 * depois do decreto escrito. Esta tela faz a mesma pergunta antes.
 *
 * ⚠️ DOIS TETOS, OS DOIS NA TELA. Um crédito por superávit tem de caber sob os FATOS e sob
 * a DECLARAÇÃO. Mostrar só um anunciaria disponibilidade que o guard recusa, ou esconderia
 * a que ele aceita — e o servidor não saberia o que corrigir.
 *
 * ⚠️ Imports RELATIVOS na UI. `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

const ROTULO_DO_TETO: Readonly<Record<string, string>> = {
  FATOS: "os fatos",
  DECLARACAO: "a declaração",
  IGUAIS: "os dois, iguais",
  SEM_TETO: "—",
};

export default async function Pagina({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_CONTABILIDADE");
  const sp = await searchParams;
  const bruto = typeof sp["exercicio"] === "string" ? sp["exercicio"] : "";
  // ⚠️ O ANO CIVIL DO ENTE. Com `getFullYear()`, às 22h de 31 de dezembro em São Paulo a tela
  // abriria no exercício SEGUINTE — que ainda não existe — e mostraria "sem dados" para quem
  // estava fechando o ano.
  const exercicio = /^\d{4}$/.test(bruto) ? Number(bruto) : anoCivil(new Date());

  let c: Awaited<ReturnType<typeof consultaDoSuperavit>>;
  try {
    c = await consultaDoSuperavit(exercicio);
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <>
          <PageHeader titulo="Superávit financeiro por fonte" subtitulo="Origem de recurso para crédito adicional" />
          <EstadoVazio titulo="Sem banco configurado" descricao="Esta consulta lê os fatos do exercício encerrado e precisa do banco." />
        </>
      );
    }
    throw e;
  }

  return (
    <>
      <PageHeader
        titulo="Superávit financeiro por fonte"
        subtitulo={`Disponibilidade para crédito adicional em ${c.exercicio}, apurada no encerramento de ${c.exercicioApurado}`}
      />

      <form method="get" className="mb-4 flex items-end gap-2" data-papel="filtro-do-superavit">
        <label className="text-xs">
          <span className="mb-1 block text-[color:var(--color-ink-2)]">Exercício do crédito</span>
          <input
            name="exercicio"
            type="number"
            min={2000}
            max={2100}
            defaultValue={c.exercicio}
            className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-2 py-1"
          />
        </label>
        <button type="submit" className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-1 text-xs">
          Consultar
        </button>
      </form>

      {!c.exercicioAnteriorEncerrado ? (
        <Card>
          <p className="text-sm text-[color:var(--color-ink)]" data-papel="exercicio-aberto">
            O exercício {c.exercicioApurado} <strong>não foi encerrado</strong>. Sem encerramento não
            há superávit apurável, e nenhum crédito por superávit é aceito — o que aparece abaixo é
            só o que foi declarado. Isto não é superávit zero: é um exercício ainda aberto.
          </p>
        </Card>
      ) : (
        <div className="mb-4 grid gap-3 sm:grid-cols-3" data-papel="totais-do-superavit">
          <Card>
            <p className="text-xs text-[color:var(--color-ink-2)]">Apurado nos fatos de {c.exercicioApurado}</p>
            <p className="text-lg font-semibold tabular-nums"><ValorMonetario valor={c.totalApurado ?? "0.00"} comSimbolo /></p>
          </Card>
          <Card>
            <p className="text-xs text-[color:var(--color-ink-2)]">Já utilizado em créditos de {c.exercicio}</p>
            <p className="text-lg font-semibold tabular-nums"><ValorMonetario valor={c.totalUtilizado} comSimbolo /></p>
          </Card>
          <Card>
            <p className="text-xs text-[color:var(--color-ink-2)]">Disponível</p>
            <p className="text-lg font-semibold tabular-nums" data-papel="total-disponivel">
              <ValorMonetario valor={c.totalDisponivel ?? "0.00"} comSimbolo />
            </p>
          </Card>
        </div>
      )}

      {c.linhas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma fonte com superávit ou declaração"
          descricao={`Não há disponibilidade declarada de superávit para ${c.exercicio}, nem fonte com superávit apurado em ${c.exercicioApurado}.`}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-papel="tabela-do-superavit">
            <caption className="sr-only">
              Superávit financeiro por fonte: apurado nos fatos, declarado, utilizado e disponível
            </caption>
            <thead>
              <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-ink-2)]">
                <th scope="col" className="px-3 py-2">Fonte</th>
                <th scope="col" className="px-3 py-2 text-right">Apurado nos fatos</th>
                <th scope="col" className="px-3 py-2 text-right">Declarado</th>
                <th scope="col" className="px-3 py-2 text-right">Utilizado</th>
                <th scope="col" className="px-3 py-2 text-right">Disponível</th>
                <th scope="col" className="px-3 py-2">Limita</th>
              </tr>
            </thead>
            <tbody>
              {c.linhas.map((l) => (
                <tr key={l.fonteCodigo} className="border-b border-[color:var(--color-border)] align-top" data-fonte={l.fonteCodigo}>
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <span className="font-semibold">{l.fonteCodigo}</span> — {l.fonteDescricao}
                    <span className="mt-1 block text-xs text-[color:var(--color-ink-3)]">{l.situacao}</span>
                    {/* ═══ POR ENTIDADE (V11 V8.11) — o TR 5.10.1.48 pede "por entidade e
                        consolidada". A tabela é a CONSOLIDADA; esta lista é o recorte por
                        entidade do que os fatos sustentam: o SUPLEMENTADO, que vem do item de
                        crédito → ficha → órgão.

                        ⚠️ O APURADO NÃO APARECE AQUI, e a nota abaixo da tabela diz por quê: ele
                        vem do caixa por fonte, e a arrecadação deste sistema não tem entidade.
                        Mostrar uma coluna rateada inventaria o número que autoriza despesa. */}
                    {l.suplementadoPorEntidade.length > 0 ? (
                      <ul role="list" className="mt-1 space-y-0.5 text-xs" data-papel="suplementado-por-entidade">
                        {l.suplementadoPorEntidade.map((e) => (
                          <li key={e.orgaoCodigo} className="text-[color:var(--color-ink-2)]" data-entidade={e.orgaoCodigo}>
                            Entidade {e.orgaoCodigo} — {e.orgaoNome}: suplementado{" "}
                            <ValorMonetario valor={e.liquido} />
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {l.decretos.length > 0 ? (
                      <ul role="list" className="mt-1 space-y-0.5 text-xs" data-papel="decretos-da-fonte">
                        {l.decretos.map((d) => (
                          <li key={d.identificacao} className="text-[color:var(--color-ink-2)]">
                            Decreto {d.identificacao} de {d.data}: <ValorMonetario valor={d.liquido} />
                            {d.liquido === "0.00" ? " (anulado — devolveu a disponibilidade)" : ""}
                            {d.encerrado ? " · encerrado" : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </th>
                  <td className="px-3 py-2 text-right tabular-nums" data-apurado>
                    {l.apurado === null ? <span className="text-xs text-[color:var(--color-ink-3)]">não apurável</span> : <ValorMonetario valor={l.apurado} />}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {l.declarado === null ? <span className="text-xs text-[color:var(--color-ink-3)]">não declarado</span> : <ValorMonetario valor={l.declarado} />}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <ValorMonetario valor={l.utilizado} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold" data-disponivel>
                    {l.disponivel === null ? <span className="text-xs font-normal text-[color:var(--color-ink-3)]">indisponível</span> : <ValorMonetario valor={l.disponivel} />}
                  </td>
                  <td className="px-3 py-2 text-xs">{ROTULO_DO_TETO[l.tetoQueLimita] ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ⚠️ A NOTA QUE IMPEDE UMA LEITURA ERRADA, e ela é obrigatória: quem vê "por entidade"
              numa parte da tela conclui que a outra também está partida. Dizer o que NÃO está
              partido, e por quê, é o que separa um recorte honesto de um número inventado. */}
          <p className="mt-3 text-xs text-[color:var(--color-ink-2)]" data-papel="nota-da-entidade">
            <strong>A tabela é a consolidada.</strong> O recorte <strong>por entidade</strong>
            {" "}aparece no <strong>suplementado</strong> de cada fonte: o crédito aponta uma ficha,
            e a ficha aponta o órgão. O <strong>apurado</strong> não se parte por entidade — ele vem
            do caixa por fonte (arrecadação, pagamentos e movimentos extraorçamentários), e a
            arrecadação registrada aqui não tem entidade arrecadadora. Ratear a receita entre os
            órgãos para preencher a coluna inventaria justamente o número que autoriza a despesa.
          </p>
        </div>
      )}
    </>
  );
}
