import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { anoCivil, competenciaCivil, diaCivilBr } from "../../../../packages/datas/index";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import {
  lerCentrosDeCusto,
  lerComposicaoDoCentro,
  lerCriteriosDeRateio,
  lerCustoPorCentro,
  lerLiquidacoesApropriaveis,
  lerLiquidacoesDeFolhaSemCusto,
  PortaSemBancoError,
} from "../../../../lib/portas/custos";
import { FormApropriacaoDeCusto, FormCriterioDeRateio, FormCustoDaFolha } from "./FormsDoCusto";
import { SeletorDoCusto } from "./SeletorDoCusto";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/**
 * CUSTO POR CENTRO — o acumulado de cada centro, e a composição que volta ao fato.
 *
 * ⚠️ O NÚMERO SÓ VALE COM A COMPOSIÇÃO AO LADO. Um total por secretaria sem o caminho de volta é um
 * número que ninguém pode conferir: o secretário lê "minha pasta custou 140.000,00" e não tem como
 * perguntar de onde veio. Escolher um centro no seletor abre cada parte com a liquidação, o empenho
 * e o credor — e a soma das partes fecha com o total da linha.
 *
 * ⚠️ E O RECORTE É A COMPETÊNCIA DO CUSTO, não a data da liquidação: o aluguel liquidado em janeiro
 * e apropriado a dezembro entra no custo de dezembro. É assim que o custo de um mês fechado para de
 * mudar quando uma nota atrasada chega.
 *
 * ⚠️ A APROPRIAÇÃO NÃO LANÇA NO RAZÃO, e a tela diz isso em vez de deixar supor: a despesa foi
 * reconhecida na liquidação. Lançá-la outra vez contaria o mesmo custo duas vezes no resultado.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO e do estado das apropriações.
 */
export const dynamic = "force-dynamic";

const CELULA = "px-3 py-2 text-sm";
const CABECA =
  "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]";

/**
 * A competência em `MM/AAAA` — a forma em que o contador a lê.
 *
 * ⚠️ PELA DATA CIVIL DO ENTE, e não por `getMonth()`: uma competência gravada ao meio-dia de 1º de
 * dezembro é 12/2026 aqui e em qualquer fuso em que o servidor rode. Foi um `getMonth()` em UTC que
 * já pôs uma competência de janeiro no dezembro anterior neste repositório.
 */
function mesCivilBr(instante: Date): string {
  const [ano, mes] = competenciaCivil(instante).split("-") as [string, string];
  return `${mes}/${ano}`;
}

function umString(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function Page({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_CONTABILIDADE");
  const sp = await searchParams;

  const cabecalho = (
    <PageHeader
      subtitulo="Custo apropriado a cada centro no período, com a composição por despesa"
      titulo="Custo por centro"
    />
  );

  const agora = new Date();
  const anoAtual = anoCivil(agora);
  const exercicios = [anoAtual + 1, anoAtual, anoAtual - 1, anoAtual - 2];
  const doUrl = Number.parseInt(umString(sp["exercicio"]), 10);
  const exercicio = exercicios.includes(doUrl) ? doUrl : anoAtual;

  let custo: Awaited<ReturnType<typeof lerCustoPorCentro>>;
  let criterios: Awaited<ReturnType<typeof lerCriteriosDeRateio>>;
  let centros: Awaited<ReturnType<typeof lerCentrosDeCusto>>;
  let liquidacoes: Awaited<ReturnType<typeof lerLiquidacoesApropriaveis>>;
  let daFolha: Awaited<ReturnType<typeof lerLiquidacoesDeFolhaSemCusto>>;
  try {
    [custo, criterios, centros, liquidacoes, daFolha] = await Promise.all([
      lerCustoPorCentro({ exercicio }),
      lerCriteriosDeRateio(),
      lerCentrosDeCusto(),
      lerLiquidacoesApropriaveis({ exercicio }),
      lerLiquidacoesDeFolhaSemCusto({ exercicio }),
    ]);
  } catch (erro) {
    return (
      <div>
        {cabecalho}
        <EstadoVazio
          descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."}
          titulo={
            erro instanceof PortaSemBancoError
              ? "Serviço indisponível"
              : "Não foi possível ler o custo por centro"
          }
        />
      </div>
    );
  }

  const centroEscolhido = umString(sp["centro"]);
  const centroValido = custo.centros.some((c) => c.centroId === centroEscolhido)
    ? centroEscolhido
    : "";
  const composicao =
    centroValido === ""
      ? []
      : await lerComposicaoDoCentro({ centroId: centroValido, exercicio });
  const nomeDoCentro =
    custo.centros.find((c) => c.centroId === centroValido)?.nome ?? "";

  const chavesVigentes = criterios.filter((c) => c.vigente).map((c) => c.chave);

  return (
    <div className="space-y-4">
      {cabecalho}

      <SeletorDoCusto
        centro={centroValido}
        centros={custo.centros.map((c) => ({
          valor: c.centroId,
          rotulo: `${c.codigo} — ${c.nome}`,
        }))}
        exercicio={exercicio}
        exercicios={exercicios}
      />

      <div
        className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs leading-relaxed text-[color:var(--color-ink-2)]"
        data-janela-do-custo={String(exercicio)}
      >
        Período de {diaCivilBr(custo.de)} a {diaCivilBr(custo.ate)}, pela{" "}
        <strong>competência do custo</strong>, e não pela data da liquidação. A competência é
        informada em cada apropriação.
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
          Acumulado por centro
        </h2>
        {custo.centros.length === 0 ? (
          <EstadoVazio
            descricao="Nenhuma despesa foi apropriada a centro de custo neste período. Publique um critério de rateio e aproprie o custo de uma liquidação para que o acumulado apareça aqui."
            titulo="Nenhum custo apropriado no período"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)]">
                    <th className={CABECA}>Centro de custo</th>
                    <th className={CABECA}>Unidade orçamentária</th>
                    <th className={`${CABECA} text-right`}>Apropriações</th>
                    <th className={`${CABECA} text-right`}>Custo no período</th>
                  </tr>
                </thead>
                <tbody>
                  {custo.centros.map((c) => (
                    <tr
                      className="border-b border-[color:var(--color-border)]"
                      data-centro={c.codigo}
                      key={c.centroId}
                    >
                      <td className={CELULA}>
                        <span className="tabular-nums">{c.codigo}</span> — {c.nome}
                      </td>
                      <td className={CELULA}>
                        <span className="tabular-nums">{c.unidadeCodigo}</span> — {c.unidadeNome}
                      </td>
                      <td className={`${CELULA} text-right tabular-nums`}>{c.apropriacoes}</td>
                      <td
                        className={`${CELULA} text-right font-semibold`}
                        data-custo-do-centro={c.codigo}
                      >
                        <ValorMonetario valor={c.total} />
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-[color:var(--color-border-strong)]">
                    <td className={`${CELULA} font-semibold`} colSpan={3}>
                      Total apropriado no período
                    </td>
                    <td
                      className={`${CELULA} text-right font-semibold`}
                      data-custo-total={String(exercicio)}
                    >
                      <ValorMonetario valor={custo.total} />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-[color:var(--color-ink-3)]">
              São listados apenas os centros com apropriação no período.
            </p>
          </>
        )}
      </Card>

      {centroValido === "" ? null : (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
            Composição do custo de {nomeDoCentro}
          </h2>
          {composicao.length === 0 ? (
            <EstadoVazio
              descricao="Este centro não recebeu apropriação no período escolhido."
              titulo="Sem apropriações no período"
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-[color:var(--color-border)]">
                      <th className={CABECA}>Competência</th>
                      <th className={CABECA}>Liquidação</th>
                      <th className={CABECA}>Empenho</th>
                      <th className={CABECA}>Credor</th>
                      <th className={CABECA}>Critério</th>
                      <th className={`${CABECA} text-right`}>Apropriado</th>
                      <th className={`${CABECA} text-right`}>Neste centro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {composicao.map((l) => (
                      <tr
                        className="border-b border-[color:var(--color-border)]"
                        data-parte={l.liquidacaoNumero}
                        key={l.id}
                      >
                        <td className={`${CELULA} tabular-nums`}>{mesCivilBr(l.competencia)}</td>
                        <td className={CELULA}>
                          <span className="tabular-nums">{l.liquidacaoNumero}</span>
                          <span className="block text-xs text-[color:var(--color-ink-3)]">
                            {diaCivilBr(l.liquidacaoData)} · <ValorMonetario valor={l.liquidacaoValor} />
                          </span>
                        </td>
                        <td className={`${CELULA} tabular-nums`}>{l.empenhoNumero}</td>
                        <td className={`${CELULA} tabular-nums`}>{l.credor}</td>
                        <td className={CELULA}>
                          {l.criterio === null ? (
                            <span className="text-[color:var(--color-ink-3)]">
                              apropriação direta, sem rateio
                            </span>
                          ) : (
                            <>
                              {l.criterio}
                              <span className="block text-xs text-[color:var(--color-ink-3)]">
                                versão {l.criterioVersao} · {l.criterioAto}
                              </span>
                            </>
                          )}
                        </td>
                        <td className={`${CELULA} text-right`}>
                          <ValorMonetario valor={l.valorApropriado} />
                        </td>
                        <td
                          className={`${CELULA} text-right font-semibold`}
                          data-parte-no-centro={l.liquidacaoNumero}
                        >
                          <ValorMonetario valor={l.valorNoCentro} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-xs text-[color:var(--color-ink-3)]">
                A soma da coluna deste centro corresponde ao acumulado da tabela acima. A coluna
                &quot;Apropriado&quot; mostra o valor total da apropriação, dividido entre os centros do
                critério.
              </p>
            </>
          )}
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
          Critérios de rateio publicados
        </h2>
        {criterios.length === 0 ? (
          <EstadoVazio
            descricao="Nenhum critério foi publicado. É necessário publicar um critério de rateio antes de apropriar custos."
            titulo="Nenhum critério de rateio"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[color:var(--color-border)]">
                  <th className={CABECA}>Critério</th>
                  <th className={`${CABECA} text-right`}>Versão</th>
                  <th className={CABECA}>Vigente desde</th>
                  <th className={CABECA}>Ato</th>
                  <th className={CABECA}>Rateio</th>
                  <th className={CABECA}>Situação</th>
                </tr>
              </thead>
              <tbody>
                {criterios.map((c) => (
                  <tr
                    className="border-b border-[color:var(--color-border)]"
                    data-criterio={`${c.chave}-v${String(c.versao)}`}
                    key={c.id}
                  >
                    <td className={CELULA}>{c.chave}</td>
                    <td className={`${CELULA} text-right tabular-nums`}>{c.versao}</td>
                    <td className={`${CELULA} tabular-nums`}>{diaCivilBr(c.vigenteDesde)}</td>
                    <td className={CELULA}>{c.atoRef}</td>
                    <td className={CELULA}>
                      <ul className="space-y-0.5 text-xs">
                        {c.itens.map((i) => (
                          <li key={i.centroCodigo}>
                            <span className="tabular-nums">{i.percentual}</span> por cento —{" "}
                            <span className="tabular-nums">{i.centroCodigo}</span> {i.centroNome}
                            {i.centroCodigo === c.centroDoResiduo ? (
                              <span className="text-[color:var(--color-ink-3)]">
                                {" "}
                                (recebe o resíduo em centavos)
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className={CELULA} data-situacao-do-criterio={`${c.chave}-v${String(c.versao)}`}>
                      {c.vigente ? (
                        <span className="font-semibold text-[color:var(--color-status-ok-fg)]">
                          Vigente
                        </span>
                      ) : c.vigenteDesde > agora ? (
                        "Vigência futura"
                      ) : (
                        "Substituída"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-[color:var(--color-ink-3)]">
          As versões anteriores permanecem registradas e identificam a proporção usada em cada
          apropriação já realizada.
        </p>
      </Card>

      {centros.length === 0 ? (
        <EstadoVazio
          descricao="Os centros de custo correspondem aos setores administrativos. Cadastre os setores do ente para publicar um critério de rateio."
          titulo="Nenhum setor ativo cadastrado"
        />
      ) : (
        <FormCriterioDeRateio
          centros={centros.map((c) => ({ id: c.id, codigo: c.codigo, nome: c.nome }))}
        />
      )}

      {daFolha.length > 0 ? <FormCustoDaFolha liquidacoes={daFolha} /> : null}

      {chavesVigentes.length === 0 || liquidacoes.length === 0 ? (
        <EstadoVazio
          descricao={
            chavesVigentes.length === 0
              ? "Publique um critério de rateio com vigência já iniciada para poder apropriar custo."
              : "Não há liquidação com custo a apropriar no exercício escolhido. Liquidações já apropriadas por inteiro, e as anulações, não aparecem aqui."
          }
          titulo={
            chavesVigentes.length === 0
              ? "Nenhum critério vigente"
              : "Nenhuma liquidação com custo a apropriar"
          }
        />
      ) : (
        <FormApropriacaoDeCusto
          criterios={chavesVigentes}
          liquidacoes={liquidacoes.map((l) => ({
            id: l.id,
            rotulo: `${l.numero} — ${diaCivilBr(l.data)} — credor ${l.credor} — disponível ${l.disponivel}`,
          }))}
        />
      )}
    </div>
  );
}
