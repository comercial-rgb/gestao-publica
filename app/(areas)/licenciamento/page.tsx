import { Card } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { acoesPermitidas } from "../../../lib/portas/molde";
import { lerLicenciamentoDaTela } from "../../../lib/portas/licenciamento-admin";
import { nomeDoModulo } from "../../../lib/portas/licenciamento";
import { instanteCivilBr } from "../../../packages/datas/index";
import { CartaoDoModulo, type ModuloNaCarta } from "./CartaoDoModulo";
import { FormContrato } from "./FormContrato";

/**
 * CONTRATO E MÓDULOS — a tela do FORNECEDOR (V10 T1 · N6.1).
 *
 * ⚠️ ELA NÃO LISTA MUNICÍPIOS, e não é esquecimento. O sistema é mono-ente por implantação:
 * um banco, um ente, escolhido pelo `DATABASE_URL` do processo. Numa base que tem um ente,
 * uma tela "selecione o município" não teria o que listar — e inventá-la faria o produto
 * parecer multitenant sem ser. O console central que inventaria as instalações é a
 * continuação N6.2, e está declarada como não construída.
 *
 * ⚠️ QUEM CHEGA AQUI: só quem tem `CONSULTAR_LICENCIAMENTO`, que é ação RESERVADA — a tela de
 * permissões do ente recusa concedê-la e o bootstrap do administrador municipal não a recebe.
 */
export const dynamic = "force-dynamic";

const RÓTULO_DO_EVENTO: Record<string, string> = {
  CONTRATO_REGISTRADO: "Contrato registrado",
  CONTRATO_ENCERRADO: "Contrato encerrado",
  MODULO_HABILITADO: "Módulo habilitado",
  VIGENCIA_PROGRAMADA: "Vigência programada",
  MODULO_SUSPENSO: "Módulo suspenso",
  MODULO_REATIVADO: "Módulo reativado",
};

export default async function LicenciamentoPage(): Promise<React.ReactElement> {
  const visao = await lerLicenciamentoDaTela();
  const permitidas = await acoesPermitidas([
    "REGISTRAR_CONTRATO_COMERCIAL",
    "HABILITAR_MODULO_CONTRATADO",
    "PROGRAMAR_VIGENCIA_DE_MODULO",
    "SUSPENDER_MODULO_CONTRATADO",
    "REATIVAR_MODULO_CONTRATADO",
  ]);
  const podeRegistrar = permitidas.has("REGISTRAR_CONTRATO_COMERCIAL");
  const podeHabilitar =
    permitidas.has("HABILITAR_MODULO_CONTRATADO") || permitidas.has("PROGRAMAR_VIGENCIA_DE_MODULO");
  const podeSuspender =
    permitidas.has("SUSPENDER_MODULO_CONTRATADO") || permitidas.has("REATIVAR_MODULO_CONTRATADO");

  const contrato = visao.contrato;

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Contrato e módulos"
        subtitulo="Contrato comercial desta implantação e módulos contratados. As permissões dos usuários são definidas pela administração do ente."
      />

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Esta implantação</h2>
        {contrato === null ? (
          <p role="alert" data-papel="sem-contrato" className="rounded-[var(--radius-md)] bg-[color:var(--color-status-alerta-bg)] px-3 py-2 text-sm text-[color:var(--color-status-alerta-fg)]">
            Não há contrato comercial registrado. Sem contrato, os módulos contratáveis ficam
            indisponíveis. A administração de usuários, os cadastros e o suporte continuam
            disponíveis.
          </p>
        ) : (
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3" data-papel="contrato">
            <div>
              <dt className="text-xs text-[color:var(--color-ink-3)]">Número</dt>
              <dd className="text-[color:var(--color-ink)]">{contrato.numero}</dd>
            </div>
            <div>
              <dt className="text-xs text-[color:var(--color-ink-3)]">Cliente</dt>
              <dd className="text-[color:var(--color-ink)]">{contrato.cliente}</dd>
            </div>
            <div>
              <dt className="text-xs text-[color:var(--color-ink-3)]">Situação</dt>
              <dd className="text-[color:var(--color-ink)]">
                {contrato.situacao === "ATIVO" ? "Ativo" : "Encerrado"}
                {contrato.demonstracao ? " · demonstração" : ""}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[color:var(--color-ink-3)]">Vigência</dt>
              <dd className="tabular text-[color:var(--color-ink)]">
                {contrato.inicio} a {contrato.fim ?? "prazo indeterminado"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[color:var(--color-ink-3)]">Registrado por</dt>
              <dd className="text-[color:var(--color-ink)]">{contrato.criadoPor}</dd>
            </div>
            <div>
              <dt className="text-xs text-[color:var(--color-ink-3)]">Data de hoje</dt>
              <dd className="tabular text-[color:var(--color-ink)]">{visao.hoje}</dd>
            </div>
            {contrato.observacao === null ? null : (
              <div className="sm:col-span-3">
                <dt className="text-xs text-[color:var(--color-ink-3)]">Observação</dt>
                <dd className="text-[color:var(--color-ink)]">{contrato.observacao}</dd>
              </div>
            )}
          </dl>
        )}
      </Card>

      {contrato === null && podeRegistrar ? <FormContrato hoje={visao.hoje} /> : null}
      {contrato === null && !podeRegistrar ? (
        <Card>
          <p className="text-sm text-[color:var(--color-ink-3)]">
            Seu perfil permite consultar o contrato desta implantação, mas não registrá-lo.
          </p>
        </Card>
      ) : null}

      {contrato !== null ? (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Módulos</h2>
          <p className="mb-4 text-xs text-[color:var(--color-ink-3)]">
            A suspensão impede novas operações, mas não remove registros: o que já foi lançado
            continua disponível para consulta e prestação de contas.
          </p>
          <div className="space-y-4">
            {visao.modulos.map((m) => {
              const carta: ModuloNaCarta = {
                modulo: m.modulo,
                nome: m.nome,
                descricao: m.descricao,
                situacao: m.situacao,
                contratado: m.contratado,
                inicio: m.inicio,
                fim: m.fim,
                motivo: m.motivo,
                dependenciasFaltantes: m.dependenciasFaltantes.map(nomeDoModulo),
                dependentesAtivos: m.dependentesAtivos.map(nomeDoModulo),
              };
              return (
                <CartaoDoModulo
                  key={m.modulo}
                  contratoId={contrato.id}
                  m={carta}
                  hoje={visao.hoje}
                  podeHabilitar={podeHabilitar && contrato.situacao === "ATIVO"}
                  podeSuspender={podeSuspender && contrato.situacao === "ATIVO"}
                />
              );
            })}
          </div>
        </Card>
      ) : null}

      {contrato !== null ? (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Histórico</h2>
          {visao.eventos.length === 0 ? (
            <p className="text-sm text-[color:var(--color-ink-3)]">Nenhum evento registrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Eventos do contrato comercial desta implantação</caption>
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-3)]">
                    <th scope="col" className="py-1 pr-3">Data e hora</th>
                    <th scope="col" className="py-1 pr-3">Evento</th>
                    <th scope="col" className="py-1 pr-3">Módulo</th>
                    <th scope="col" className="py-1 pr-3">Motivo</th>
                    <th scope="col" className="py-1">Autor</th>
                  </tr>
                </thead>
                <tbody data-papel="historico">
                  {visao.eventos.map((e) => (
                    <tr key={e.id} className="border-t border-[color:var(--color-border)]" data-evento={e.tipo}>
                      <td className="py-1 pr-3">{instanteCivilBr(e.criadoEm)}</td>
                      <td className="py-1 pr-3">{RÓTULO_DO_EVENTO[e.tipo] ?? e.tipo}</td>
                      <td className="py-1 pr-3">{e.modulo === null ? "—" : nomeDoModulo(e.modulo)}</td>
                      <td className="py-1 pr-3">{e.motivo}</td>
                      <td className="py-1">{e.criadoPor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}
    </div>
  );
}
