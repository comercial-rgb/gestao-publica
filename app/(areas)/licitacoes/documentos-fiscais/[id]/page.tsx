import Link from "next/link";
import { notFound } from "next/navigation";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { DetalheDeRecurso } from "../../../../../components/molde/DetalheDeRecurso";
import { ListaDeAnexos } from "../../../../../components/ui/ListaDeAnexos";
import { FormAnexo } from "../../../documentos/FormAnexo";
import { lerConsulta, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { EXTENSOES_ACEITAS, TAMANHO_MAXIMO_BYTES } from "../../../../../lib/portas/documentos";
import { DOCUMENTOS_FISCAIS } from "../../../../../lib/portas/recursos/documentos-fiscais";
import {
  disponibilidadeDoDocumentoFiscal,
  opcoesDoDocumentoFiscal,
  verDocumentoFiscal,
} from "../../../../../lib/portas/recursos/documentos-fiscais-dados";
import { documentosfiscaisAction } from "../actions";

/**
 * DETALHE DO DOCUMENTO FISCAL: itens, conferência, cancelamento, anexos e vínculos.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_LICITACOES");
  const { id } = await params;
  const consulta = lerConsulta(DOCUMENTOS_FISCAIS, await searchParams);
  const [detalhe, opcoes, permitidas] = await Promise.all([
    verDocumentoFiscal(id),
    opcoesDoDocumentoFiscal(),
    acoesPermitidas([
      ...DOCUMENTOS_FISCAIS.acoes.map((a) => a.acaoDoCenso),
      "ANEXAR_ARQUIVO",
      "REGISTRAR_RECEBIMENTO_DE_ORDEM",
      "LIQUIDAR",
    ]),
  ]);
  if (detalhe === null) notFound();
  const disponibilidade = await disponibilidadeDoDocumentoFiscal(id).catch(() => null);
  const podeAnexar = permitidas.has("ANEXAR_ARQUIVO");
  return (
    <DetalheDeRecurso
      definicao={DOCUMENTOS_FISCAIS}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={
        <div className="space-y-4">
          <p className="text-xs text-[color:var(--color-ink-2)]">
            O PDF de conferência não tem validade fiscal. A conferência é interna e não substitui
            a autorização da SEFAZ.
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <a
              href={`/licitacoes/documentos-fiscais/conferencia?id=${id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[color:var(--color-primary)] hover:underline"
            >
              Emitir conferência (PDF)
            </a>
            {detalhe.ordemId !== null ? (
              <Link
                href={`/licitacoes/ordens-de-compra/${detalhe.ordemId}`}
                className="font-medium text-[color:var(--color-primary)] hover:underline"
              >
                Abrir ordem {detalhe.ordemNumero}
              </Link>
            ) : null}
            {detalhe.empenhoId !== null ? (
              <Link
                href={`/despesa/empenhos/${detalhe.empenhoId}`}
                className="font-medium text-[color:var(--color-primary)] hover:underline"
              >
                Abrir empenho {detalhe.empenhoNumero}
              </Link>
            ) : null}
            {detalhe.situacao === "CONFERIDO" ? (
              <Link
                href="/despesa/liquidacoes"
                className="font-medium text-[color:var(--color-primary)] hover:underline"
              >
                Liquidar com este documento
              </Link>
            ) : null}
          </div>
          <ListaDeAnexos anexos={detalhe.anexos} />
          {podeAnexar ? (
            <FormAnexo
              dono={{ documentoFiscalId: id }}
              accept={`${EXTENSOES_ACEITAS},.xml,application/xml,text/xml`}
              tamanhoMaximoBytes={TAMANHO_MAXIMO_BYTES}
              rotulo="Anexar XML ou PDF do documento"
            />
          ) : null}
          <FormsDoRecurso
            definicao={DOCUMENTOS_FISCAIS}
            permitidas={[...permitidas]}
            opcoes={opcoes}
            registroId={id}
            action={documentosfiscaisAction}
            modo="acoes"
            disponibilidade={disponibilidade}
          />
        </div>
      }
    />
  );
}
