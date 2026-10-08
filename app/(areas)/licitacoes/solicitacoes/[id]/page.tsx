import { notFound } from "next/navigation";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { SOLICITACOES_DE_COMPRA } from "../../../../../lib/portas/recursos/compras";
import { verSolicitacao, opcoesDaSolicitacao } from "../../../../../lib/portas/recursos/compras-dados";
import { solicitacoesdecompraAction } from "../actions";
import { Atendimento } from "./Atendimento";
import { FormFormarOrdem } from "./FormFormarOrdem";
import { pessoaIdPeloDocumento, podeUsarAtalhoDeCadastro } from "../../../../../lib/portas/pessoas";

/**
 * O DETALHE DA SOLICITAÇÃO: itens e movimentos no histórico; autorizar e anular como ações; o
 * ATENDIMENTO por item (V6 P1.1) e, quando AUTORIZADA com pendente, a ilha "formar ordem".
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({ params, searchParams }: { readonly params: Promise<{ readonly id: string }>; readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_LICITACOES");
  const { id } = await params;
  const sp = await searchParams;
  const consulta = lerConsulta(SOLICITACOES_DE_COMPRA, sp);
  const credor = typeof sp["credor"] === "string" ? sp["credor"] : "";
  const [detalhe, opcoes, permitidas] = await Promise.all([
    verSolicitacao(id),
    opcoesDaSolicitacao(),
    acoesPermitidas([...SOLICITACOES_DE_COMPRA.acoes.map((a) => a.acaoDoCenso), "EMITIR_ORDEM_DE_COMPRA"]),
  ]);
  if (detalhe === null) notFound();
  const podeFormar = permitidas.has("EMITIR_ORDEM_DE_COMPRA") && detalhe.situacao === "AUTORIZADA" && detalhe.itensPendentes.length > 0;
  const [podeCadastrar, fornecedorPadrao] = podeFormar ? await Promise.all([podeUsarAtalhoDeCadastro(), credor === "" ? Promise.resolve(undefined) : pessoaIdPeloDocumento(credor)]) : [false, undefined];
  return (
    <DetalheDeRecurso
      definicao={SOLICITACOES_DE_COMPRA}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={
        <div className="space-y-4">
          <Atendimento itens={detalhe.atendimento} />
          {podeFormar ? (
            <FormFormarOrdem solicitacaoId={id} itensPendentes={detalhe.itensPendentes} fornecedorPadrao={fornecedorPadrao} podeCadastrarFornecedor={podeCadastrar} />
          ) : (
            <p className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-xs text-[color:var(--color-ink-2)]">
              {detalhe.situacao !== "AUTORIZADA"
                ? `Somente solicitações autorizadas podem gerar ordem de compra. Situação atual: ${detalhe.situacao.toLowerCase().replace(/_/g, " ")}.`
                : detalhe.itensPendentes.length === 0
                  ? "Todos os itens desta solicitação já constam em ordens de compra."
                  : "Seu perfil não tem permissão para emitir ordem de compra a partir desta solicitação."}
            </p>
          )}
          <FormsDoRecurso definicao={SOLICITACOES_DE_COMPRA} permitidas={[...permitidas]} opcoes={opcoes} registroId={id} action={solicitacoesdecompraAction} modo="acoes" />
        </div>
      }
    />
  );
}
