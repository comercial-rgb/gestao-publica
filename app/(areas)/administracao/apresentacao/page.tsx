import { Card } from "../../../../components/ui/Card";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { lerApresentacaoAdmin } from "../../../../lib/portas/identidade";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { instanteCivilBr } from "../../../../packages/datas/index";
import { FormApresentacao, type ValoresDaApresentacao } from "./FormApresentacao";

/**
 * ADMINISTRAÇÃO · Apresentação do ente (V6 P0.1).
 *
 * O que a entrada, o cabeçalho, o rodapé e os documentos NOVOS mostram — nome de exibição,
 * órgão, imagem, contatos, tema e canais. É apresentação, versionada: o cadastro fiscal do
 * ente (IBGE, CNPJ, tribunal) não se edita aqui, e aparece só para o administrador saber
 * QUAL ente está semeado nesta implantação.
 */
export const dynamic = "force-dynamic";

export default async function ApresentacaoPage(): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_ADMINISTRACAO");
  const [dados, permitidas] = await Promise.all([lerApresentacaoAdmin(), acoesPermitidas(["CONFIGURAR_APRESENTACAO_DO_ENTE"])]);
  const podeConfigurar = permitidas.has("CONFIGURAR_APRESENTACAO_DO_ENTE");
  const v = dados.vigente;
  const valores: ValoresDaApresentacao = {
    nomeDeExibicao: v?.nomeDeExibicao ?? "",
    orgao: v?.orgao ?? "",
    assinaturaDoFornecedor: v?.assinaturaDoFornecedor ?? "",
    contatoEmail: v?.contatoEmail ?? "",
    contatoTelefone: v?.contatoTelefone ?? "",
    horarioDeAtendimento: v?.horarioDeAtendimento ?? "",
    sitio: v?.sitio ?? "",
    tema: v?.tema ?? "PADRAO",
    temImagem: v?.temImagem ?? false,
    imagemHref: v?.temImagem === true ? `/identidade/imagem?v=${v.numero}` : null,
    canalTransparencia: v?.canalTransparencia ?? true,
    canalConsultaPublica: v?.canalConsultaPublica ?? true,
  };

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Apresentação do ente"
        subtitulo="Identificação da instituição exibida na entrada, no cabeçalho, no rodapé e nos novos documentos."
      />

      {dados.ente === null ? (
        <p role="alert" className="rounded-[var(--radius-md)] bg-[color:var(--color-status-alerta-bg)] px-3 py-2 text-sm text-[color:var(--color-status-alerta-fg)]">
          A identificação do ente (código IBGE, CNPJ e tribunal de contas) ainda não foi cadastrada. Solicite o cadastro
          ao responsável antes de configurar a apresentação.
        </p>
      ) : (
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Identificação do ente</h2>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            <div><dt className="text-xs text-[color:var(--color-ink-3)]">Nome oficial</dt><dd className="text-[color:var(--color-ink)]">{dados.ente.nome}</dd></div>
            <div><dt className="text-xs text-[color:var(--color-ink-3)]">UF</dt><dd className="text-[color:var(--color-ink)]">{dados.ente.uf ?? "—"}</dd></div>
            <div><dt className="text-xs text-[color:var(--color-ink-3)]">Código IBGE</dt><dd className="tabular text-[color:var(--color-ink)]">{dados.ente.codigoIbge}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-[color:var(--color-ink-3)]">Os dados de identificação fiscal não são alterados nesta tela.</p>
        </Card>
      )}

      {dados.ente !== null ? <FormApresentacao valores={valores} podeConfigurar={podeConfigurar} /> : null}

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Versões</h2>
        {dados.historico.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-3)]">Nenhuma versão gravada. Até a primeira gravação, a tela de entrada exibe uma identificação genérica.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-3)]">
                  <th className="py-1 pr-3">Versão</th>
                  <th className="py-1 pr-3">Nome de exibição</th>
                  <th className="py-1 pr-3">Tema</th>
                  <th className="py-1 pr-3">Imagem</th>
                  <th className="py-1 pr-3">Autor</th>
                  <th className="py-1">Quando</th>
                </tr>
              </thead>
              <tbody>
                {dados.historico.map((h) => (
                  <tr key={h.numero} className="border-t border-[color:var(--color-border)]" data-versao={h.numero}>
                    <td className="py-1 pr-3 tabular">{h.numero}{v?.numero === h.numero ? " (vigente)" : ""}</td>
                    <td className="py-1 pr-3">{h.nomeDeExibicao}</td>
                    <td className="py-1 pr-3">{h.tema === "ALTO_CONTRASTE" ? "Alto contraste" : "Padrão"}</td>
                    <td className="py-1 pr-3">{h.temImagem ? "sim" : "não"}</td>
                    <td className="py-1 pr-3">{h.criadoPor}</td>
                    <td className="py-1">{instanteCivilBr(h.criadoEm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
