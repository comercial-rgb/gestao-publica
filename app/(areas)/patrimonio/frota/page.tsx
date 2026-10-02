import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { lerFrota, ROTULO_COMBUSTIVEL, ROTULO_SITUACAO, ROTULO_TIPO_DE_FROTA } from "../../../../lib/portas/frota";
import { FormAbastecimento, FormAnular, FormCadastrarMaquina, FormCadastrarVeiculo, FormSituacao, FormVersao } from "./Forms";

/**
 * V27 — A FROTA: veículos e máquinas da unidade gestora, a situação ao longo do mês e os abastecimentos — o que a
 * prestação de contas mensal ao Tribunal pede.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

const TITULO = "Frota";
const SUBTITULO = "Veículos e máquinas, situação e abastecimento";

export default async function FrotaPage(): Promise<React.ReactElement> {
  let dados: Awaited<ReturnType<typeof lerFrota>>;
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_PATRIMONIO");
    dados = await lerFrota();
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo={TITULO} subtitulo={SUBTITULO} />
        <EstadoVazio titulo="Não foi possível carregar" descricao={erro instanceof Error ? erro.message : "Erro desconhecido."} />
      </div>
    );
  }
  const opcoes = { tipos: ROTULO_TIPO_DE_FROTA, combustiveis: ROTULO_COMBUSTIVEL, situacoes: ROTULO_SITUACAO };
  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo={TITULO} subtitulo={SUBTITULO} />
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        Todo mês o Tribunal recebe a situação de cada veículo e máquina e os litros abastecidos, inclusive quando não houve
        abastecimento. O cadastro vai no mês em que é feito e de novo quando muda o dono, o locador ou algum dado. No bem
        próprio, o dono é a própria unidade gestora. Dono e locador precisam estar no cadastro de pessoas.
      </div>
      {dados.ugs.length === 0 ? (
        <EstadoVazio titulo="Nenhuma unidade gestora escriturada aqui" descricao="Cadastre a unidade gestora em Contabilidade › Unidades gestoras antes de cadastrar a frota." />
      ) : (
        <>
          <FormCadastrarVeiculo ugs={dados.ugs} {...opcoes} />
          <FormCadastrarMaquina ugs={dados.ugs} {...opcoes} />
        </>
      )}
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Veículos e máquinas</h2>
        {dados.bens.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-3)]" data-teste="sem-frota">Nenhum veículo ou máquina cadastrado.</p>
        ) : (
          <ul className="space-y-3" data-lista="frota">
            {dados.bens.map((b) => (
              <li key={b.id} className="border-b border-[color:var(--color-border)] pb-3" data-bem-da-frota={b.identificacao}>
                <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
                  <strong className="font-mono">{b.identificacao}</strong>
                  <span>{b.categoria === "VEICULO" ? "Veículo" : "Máquina"} · {b.tipo} · {b.situacao}</span>
                  <span className="text-xs text-[color:var(--color-ink-3)]">{b.ug} · versão {b.versao}</span>
                </div>
                <p className="text-xs text-[color:var(--color-ink-2)]">{b.descricao} · {b.combustivel} · dono: {b.dono}{b.locador !== null ? ` · locador: ${b.locador}` : ""}</p>
                {b.pendencia !== null ? <p className="text-xs text-[color:var(--color-status-erro-fg)]" data-pendencia-da-frota={b.identificacao}>{b.pendencia}</p> : null}
                <div className="mt-1 grid gap-2 sm:grid-cols-3">
                  <FormVersao bemId={b.id} categoria={b.categoria} identificacao={b.identificacao} dados={b.dados} tipos={ROTULO_TIPO_DE_FROTA} combustiveis={ROTULO_COMBUSTIVEL} />
                  <FormSituacao bemId={b.id} categoria={b.categoria} identificacao={b.identificacao} situacoes={ROTULO_SITUACAO} />
                  <FormAbastecimento bemId={b.id} categoria={b.categoria} identificacao={b.identificacao} combustiveis={ROTULO_COMBUSTIVEL} />
                </div>
                <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                  <div>
                    <span className="font-semibold">Situações</span>
                    <ul data-lista="situacoes-da-frota">
                      {b.situacoes.map((s) => (
                        <li key={s.id} className={s.anulada ? "text-[color:var(--color-ink-3)] line-through" : ""}>
                          {s.dia} — {s.situacao} ({s.motivo}){!s.anulada ? <> <FormAnular id={s.id} tipo="situacao" rotulo={`a situação de ${s.dia}`} /></> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span className="font-semibold">Abastecimentos recentes</span>
                    {b.abastecimentos.length === 0 ? <p className="text-[color:var(--color-ink-3)]">Nenhum.</p> : null}
                    <ul data-lista="abastecimentos">
                      {b.abastecimentos.map((a) => (
                        <li key={a.id} className={a.anulado ? "text-[color:var(--color-ink-3)] line-through" : ""}>
                          {a.dia} — {a.quantidade} de {a.combustivel.toLowerCase()} ({a.documento}){!a.anulado ? <> <FormAnular id={a.id} tipo="abastecimento" rotulo={`o abastecimento de ${a.dia}`} /></> : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
