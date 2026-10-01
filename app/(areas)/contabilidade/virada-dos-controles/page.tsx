import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { anoCivil, diaCivilBr } from "../../../../packages/datas/index";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import {
  lerEncerramentosDeControles,
  lerViradaDosControles,
  PortaSemBancoError,
} from "../../../../lib/portas/virada-dos-controles";
import {
  FormClassificarConta,
  FormEncerrarControles,
  FormEstornarEncerramento,
} from "./FormsDaVirada";
import { SeletorDoExercicioDaVirada } from "./SeletorDoExercicio";

/**
 * A VIRADA DAS CONTAS DE CONTROLE — o que morre em 31 de dezembro e o que atravessa.
 *
 * ⚠️ A APURAÇÃO DO RESULTADO NÃO FAZ ISSO, e é a confusão mais fácil de cometer aqui. Ela zera as
 * classes 3 e 4 (as variações patrimoniais) contra o patrimônio líquido. As classes 5 e 6 — a
 * dotação que a lei fixou, o crédito que sobrou disponível, a previsão de receita — são igualmente do
 * exercício e nunca foram tocadas por ela. Sem esta tela, o saldo do ano que acabou atravessa para o
 * novo: o exercício seguinte nasce com crédito que ninguém votou.
 *
 * ⚠️ E O SISTEMA NÃO ESCOLHE POR NINGUÉM. Cada conta com saldo tem de dizer se ENCERRA ou se
 * TRANSFERE, com justificativa escrita. A tela SUGERE, com a razão ao lado, e grava só o que o
 * operador confirmar — porque classificar errado o controle dos restos a pagar apagaria o registro de
 * quanto o ente deve executar de exercícios anteriores.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO e do saldo do razão.
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
  await telaExigeLeituraDoEnte("CONSULTAR_CONTABILIDADE");
  const sp = await searchParams;

  const cabecalho = (
    <PageHeader
      subtitulo="Encerramento das contas de controle orçamentário e transferência de saldos ao exercício seguinte"
      titulo="Virada das contas de controle"
    />
  );

  const anoAtual = anoCivil(new Date());
  const exercicios = [anoAtual + 1, anoAtual, anoAtual - 1, anoAtual - 2];
  const doUrl = Number.parseInt(umString(sp["exercicio"]), 10);
  const exercicio = exercicios.includes(doUrl) ? doUrl : anoAtual;

  let virada: Awaited<ReturnType<typeof lerViradaDosControles>>;
  let feitos: Awaited<ReturnType<typeof lerEncerramentosDeControles>>;
  try {
    [virada, feitos] = await Promise.all([
      lerViradaDosControles({ ano: exercicio }),
      lerEncerramentosDeControles(),
    ]);
  } catch (erro) {
    return (
      <div>
        {cabecalho}
        <EstadoVazio
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
          titulo={
            erro instanceof PortaSemBancoError
              ? "Serviço indisponível"
              : "Não foi possível ler as contas de controle"
          }
        />
      </div>
    );
  }

  // ⚠️ OS DOIS IMPEDIMENTOS SÃO DIFERENTES E OS DOIS SÃO DITOS. Um exercício que ainda corre não se
  // enterra; e uma conta com saldo sem destino declarado derruba a operação inteira. Mostrar só "não
  // pode" faria o operador procurar o defeito no lugar errado.
  const impedimentos: string[] = [];
  if (!virada.exercicioEncerrado) {
    impedimentos.push(
      virada.exercicioId === null
        ? `Não existe exercício ${String(exercicio)} cadastrado.`
        : `O exercício ${String(exercicio)} ainda não foi encerrado. Encerre o exercício antes, em Despesa, Restos a pagar.`
    );
  }
  if (virada.semDestino > 0) {
    impedimentos.push(
      `${String(virada.semDestino)} conta(s) com saldo ainda não têm destino declarado. Toda conta das classes 5 e 6 com saldo em 31 de dezembro deve ser classificada para encerramento ou transferência.`
    );
  }
  if (virada.contas.length > 0 && virada.semDestino === 0 && !virada.fecha) {
    impedimentos.push(
      `As contas classificadas como ENCERRA não fecham: débitos de ${virada.somaDebito} e créditos de ${virada.somaCredito}. Cada conta de controle deve ter o mesmo destino da sua contrapartida; caso contrário, o encerramento é recusado.`
    );
  }
  const podeEncerrar = impedimentos.length === 0 && virada.contas.length > 0;

  // ⚠️ O ROL DO ESTORNO SÓ TRAZ OS VIGENTES — estornar o que já foi estornado é recusado pelo
  // domínio, e oferecê-lo na tela seria convidar ao clique que recusa.
  const encerramentosVigentes = feitos
    .filter((f) => !f.estornado)
    .map((f) => ({
      operacaoId: f.operacaoId,
      rotulo: `${f.numeroControle} — ${diaCivilBr(f.data)} — por ${f.criadoPor}`,
    }));

  const contasParaForm = virada.contas
    .filter((c) => c.analitica)
    .map((c) => ({
      codigo: c.codigo,
      rotulo: `${c.codigo} — ${c.nome} — saldo ${c.saldo}${c.destino === null ? " — sem destino" : ` — destino atual: ${c.destino}`}`,
      destinoSugerido: c.destinoSugerido,
      razaoDaSugestao: c.razaoDaSugestao,
    }));

  return (
    <div className="space-y-4">
      {cabecalho}

      <SeletorDoExercicioDaVirada exercicio={exercicio} exercicios={exercicios} />

      <div
        className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs leading-relaxed text-[color:var(--color-ink-2)]"
        data-corte-da-virada={String(exercicio)}
      >
        Saldos apurados até <strong>{diaCivilBr(virada.corte)}</strong>, último dia do exercício. A
        apuração do resultado encerra somente as variações patrimoniais; as contas de controle
        orçamentário são encerradas nesta tela.
      </div>

      {impedimentos.length > 0 ? (
        <div
          className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-status-alerta-bg)] p-3 text-xs leading-relaxed text-[color:var(--color-ink-2)]"
          data-impedimentos={String(impedimentos.length)}
        >
          <strong className="text-[color:var(--color-ink)]">
            O que falta para encerrar os controles de {exercicio}:
          </strong>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {impedimentos.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
          Contas de controle com saldo no fim do exercício
        </h2>
        {virada.contas.length === 0 ? (
          <EstadoVazio
            descricao="Nenhuma conta das classes 5 e 6 tem saldo no fim deste exercício. O exercício não teve execução orçamentária ou os controles já foram encerrados."
            titulo="Nenhuma conta de controle com saldo"
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)]">
                    <th className={CABECA}>Conta</th>
                    <th className={CABECA}>Natureza</th>
                    <th className={`${CABECA} text-right`}>Saldo final</th>
                    <th className={CABECA}>Lançamento no encerramento</th>
                    <th className={CABECA}>Destino declarado</th>
                    <th className={CABECA}>Justificativa</th>
                  </tr>
                </thead>
                <tbody>
                  {virada.contas.map((c) => (
                    <tr
                      className="border-b border-[color:var(--color-border)]"
                      data-conta-da-virada={c.codigo}
                      key={c.codigo}
                    >
                      <td className={CELULA}>
                        <span className="tabular-nums">{c.codigo}</span>
                        <span className="block text-xs text-[color:var(--color-ink-3)]">
                          {c.nome}
                          {c.analitica ? "" : " (sintética, sem lançamento direto)"}
                        </span>
                      </td>
                      <td className={CELULA}>{c.naturezaSaldo === "DEVEDORA" ? "Devedora" : "Credora"}</td>
                      <td className={`${CELULA} text-right`} data-saldo-da-conta={c.codigo}>
                        <ValorMonetario valor={c.saldo} />
                      </td>
                      <td className={CELULA}>
                        {c.pernaSeEncerrar === "DEBITO" ? "Débito" : "Crédito"}
                      </td>
                      <td className={CELULA} data-destino-da-conta={c.codigo}>
                        {c.destino === null ? (
                          <>
                            <span className="font-semibold text-[color:var(--color-status-alerta-fg)]">
                              Sem destino
                            </span>
                            <span className="block text-xs text-[color:var(--color-ink-3)]">
                              sugestão: {c.destinoSugerido}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="font-semibold">{c.destino}</span>
                            {c.classificadoPor === null ? null : (
                              <span className="block text-xs text-[color:var(--color-ink-3)]">
                                por {c.classificadoPor}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td className={`${CELULA} text-xs text-[color:var(--color-ink-2)]`}>
                        {c.justificativa ?? c.razaoDaSugestao}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-[color:var(--color-border-strong)]">
                    <td className={`${CELULA} font-semibold`} colSpan={2}>
                      Total a encerrar
                    </td>
                    <td className={`${CELULA} text-right font-semibold`} data-soma-debito>
                      <ValorMonetario valor={virada.somaDebito} />
                    </td>
                    <td className={`${CELULA} font-semibold`} colSpan={3}>
                      débito &nbsp;·&nbsp; crédito{" "}
                      <span data-soma-credito>
                        <ValorMonetario valor={virada.somaCredito} />
                      </span>
                      {virada.fecha ? (
                        <span className="text-[color:var(--color-status-ok-fg)]"> — fecha</span>
                      ) : (
                        <span className="text-[color:var(--color-status-alerta-fg)]">
                          {" "}
                          — não fecha
                        </span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-[color:var(--color-ink-3)]">
              O total considera somente as contas classificadas como ENCERRA. Débitos e créditos
              devem ser iguais para que o encerramento seja realizado.
            </p>
          </>
        )}
      </Card>

      {feitos.length === 0 ? null : (
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
            Encerramentos realizados
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[color:var(--color-border)]">
                  <th className={CABECA}>Número de controle</th>
                  <th className={CABECA}>Data</th>
                  <th className={CABECA}>Histórico</th>
                  <th className={CABECA}>Registrado por</th>
                  <th className={CABECA}>Situação</th>
                </tr>
              </thead>
              <tbody>
                {feitos.map((f) => (
                  <tr
                    className="border-b border-[color:var(--color-border)]"
                    data-encerramento-de-controles={f.numeroControle}
                    key={f.lancamentoId}
                  >
                    <td className={`${CELULA} tabular-nums`}>{f.numeroControle}</td>
                    <td className={`${CELULA} tabular-nums`}>{diaCivilBr(f.data)}</td>
                    <td className={`${CELULA} text-xs`}>{f.historico}</td>
                    <td className={CELULA}>{f.criadoPor}</td>
                    <td className={CELULA} data-situacao-do-encerramento={f.numeroControle}>
                      {f.estornado ? "Estornado" : "Vigente"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {contasParaForm.length === 0 ? (
        <EstadoVazio
          descricao="Não há conta analítica de controle com saldo neste exercício para classificar."
          titulo="Nada a classificar"
        />
      ) : (
        <FormClassificarConta contas={contasParaForm} />
      )}

      {/*
        ⚠️ A CONDIÇÃO É `feitos`, NÃO `encerramentosVigentes` — e a diferença é o defeito que o
        percurso achou. Condicionando pelos vigentes, estornar o último desmontava o formulário e
        apagava a confirmação junto: o operador via silêncio, com o estorno gravado.
      */}
      {feitos.length === 0 ? null : (
        <FormEstornarEncerramento encerramentos={encerramentosVigentes} />
      )}

      <FormEncerrarControles
        exercicio={exercicio}
        impedimento={
          impedimentos.length === 0
            ? ""
            : `O encerramento só pode ser realizado após resolver as pendências: ${impedimentos.join(" ")}`
        }
        podeEncerrar={podeEncerrar}
      />
    </div>
  );
}
