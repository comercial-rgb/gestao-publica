import { Card } from "../../../../components/ui/Card";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { exigirLeitura } from "../../../../lib/portas/molde";
import { certidoesParaTela } from "../../../../lib/portas/lancamento-tributario";
import { instanteCivilBr } from "../../../../packages/datas/index";
import { FormConfiguracao, FormDecisao, FormPedido } from "./FormulariosDaCertidao";

/**
 * RECEITA · Certidões (V10 T2 · N5).
 *
 * ⚠️ A COBERTURA APARECE NA TELA, base por base. É a resposta honesta a "o município declara
 * que esta pessoa nada deve?": o sistema mostra o que leu e o que NÃO conseguiu ler, e não
 * emite negativa sozinho enquanto houver base fora do alcance. Quem decide é gente, e o que
 * ela conferir fora daqui vai congelado no documento com o nome dela.
 */
export const dynamic = "force-dynamic";

const RÓTULO_DA_BASE: Record<string, string> = {
  LANCAMENTO_TRIBUTARIO: "Lançamentos tributários deste sistema",
  CREDITO_RECONHECIDO: "Créditos reconhecidos com saldo em aberto",
  DIVIDA_ATIVA: "Dívida ativa",
  PARCELAMENTO: "Parcelamentos de débito",
  CADASTRO_ECONOMICO_ISS: "Cadastro econômico e ISS",
};

const RÓTULO_DA_SITUACAO_DA_BASE: Record<string, string> = {
  SEM_PENDENCIA: "consultada, sem débitos",
  COM_PENDENCIA: "consultada, com débitos",
  INDISPONIVEL: "indisponível no momento da consulta",
  FORA_DO_ALCANCE: "não integrada ao sistema",
};

export default async function CertidoesPage(): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_RECEITA");
  const dados = await certidoesParaTela();

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Certidões"
        subtitulo="Pedido, análise e emissão de certidões, com consulta às bases fiscais disponíveis."
      />

      {dados.semValidadeOficial ? (
        <p role="note" className="rounded-[var(--radius-md)] bg-[color:var(--color-status-alerta-bg)] px-3 py-2 text-sm text-[color:var(--color-status-alerta-fg)]">
          Este ambiente não é de produção: os documentos emitidos são marcados como{" "}
          <strong>sem validade oficial</strong>.
        </p>
      ) : null}

      {dados.configuracao === null ? (
        <p role="alert" data-papel="sem-configuracao" className="rounded-[var(--radius-md)] bg-[color:var(--color-status-alerta-bg)] px-3 py-2 text-sm text-[color:var(--color-status-alerta-fg)]">
          Não há validade nem fundamento legal configurados, e por isso nenhuma certidão pode ser
          emitida. Os pedidos e a análise continuam disponíveis; publique a configuração abaixo.
        </p>
      ) : (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Configuração vigente</h2>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-[color:var(--color-ink-3)]">Validade</dt>
              <dd className="tabular text-[color:var(--color-ink)]">{dados.configuracao.validadeEmDias} dias corridos</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs text-[color:var(--color-ink-3)]">Fundamento</dt>
              <dd className="text-[color:var(--color-ink)]">{dados.configuracao.fundamento}</dd>
            </div>
          </dl>
        </Card>
      )}

      {dados.podeSolicitar ? <FormPedido /> : null}

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Pedidos</h2>
        {dados.solicitacoes.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-3)]">Nenhum pedido registrado.</p>
        ) : (
          <div className="space-y-4" data-papel="pedidos">
            {dados.solicitacoes.map((s) => {
              const semResposta = s.cobertura.filter(
                (c) => c.situacao === "INDISPONIVEL" || c.situacao === "FORA_DO_ALCANCE"
              );
              return (
                <section
                  key={s.id}
                  data-protocolo={s.protocolo}
                  data-situacao={s.situacao}
                  className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-4"
                >
                  <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[color:var(--color-ink)]">
                      {s.protocolo} — {s.titular}
                    </h3>
                    <span className="text-xs font-medium text-[color:var(--color-ink-2)]">
                      {s.situacao === "EM_ANALISE" ? "Em análise" : s.situacao === "EMITIDA" ? `Emitida (${s.tipo})` : s.situacao === "INDEFERIDA" ? "Indeferida" : s.situacao}
                      {s.validadeAte === null ? "" : ` · válida até ${s.validadeAte.split("-").reverse().join("/")}`}
                    </span>
                  </header>
                  <p className="mb-2 text-xs text-[color:var(--color-ink-3)]">
                    Pedido em {instanteCivilBr(s.criadoEm)}
                    {s.imovel === null ? "" : ` · imóvel ${s.imovel}`}
                  </p>

                  <h4 className="mb-1 text-xs font-semibold text-[color:var(--color-ink-2)]">
                    Cobertura da base fiscal
                  </h4>
                  <ul role="list" className="space-y-0.5 text-xs" data-papel="cobertura">
                    {s.cobertura.map((c) => (
                      <li key={c.base} data-base={c.base} data-base-situacao={c.situacao} className="text-[color:var(--color-ink)]">
                        <strong>{RÓTULO_DA_BASE[c.base] ?? c.base}</strong>:{" "}
                        {RÓTULO_DA_SITUACAO_DA_BASE[c.situacao] ?? c.situacao} — {c.detalhe}
                      </li>
                    ))}
                  </ul>

                  {s.pendencia === null ? null : (
                    <p role="note" className="mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-alerta-bg)] px-3 py-2 text-xs text-[color:var(--color-status-alerta-fg)]">
                      {s.pendencia}
                    </p>
                  )}

                  {dados.podeDecidir && s.situacao === "EM_ANALISE" ? (
                    <FormDecisao
                      solicitacaoId={s.id}
                      protocolo={s.protocolo}
                      temBaseSemResposta={semResposta.length > 0}
                    />
                  ) : null}
                </section>
              );
            })}
          </div>
        )}
      </Card>

      {dados.podeConfigurar ? <FormConfiguracao hoje={dados.hoje} atual={dados.configuracao} /> : null}
    </div>
  );
}
