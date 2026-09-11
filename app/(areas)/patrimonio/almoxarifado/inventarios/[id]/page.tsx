import { notFound } from "next/navigation";
import { FormsDoRecurso } from "../../../../../../components/molde/FormsDoRecurso";
import { DetalheDeRecurso } from "../../../../../../components/molde/DetalheDeRecurso";
import { lerConsulta, type ParametrosBrutos } from "../../../../../../lib/molde/consulta";
import type { AbaDoMolde } from "../../../../../../lib/molde/tipos";
import { acoesPermitidas, exigirLeitura } from "../../../../../../lib/portas/molde";
import { INVENTARIOS_DE_ESTOQUE } from "../../../../../../lib/portas/recursos/almoxarifado";
import { verInventarioDeEstoque, opcoesDoAlmoxarifado } from "../../../../../../lib/portas/recursos/almoxarifado-dados";
import { acaoDeInventariosAction } from "../actions";

/**
 * O detalhe — as abas do molde. `campos` e `anexos` NÃO aparecem aqui, e é decisão
 * declarada: as duas custam MODELO (uma coluna de dono em `Anexo`, um valor em
 * `CadastroComCamposAdicionais`), e este lote não abre modelo novo. Aba vazia ensina que o
 * sistema perdeu o arquivo — `verificarDefinicao` recusa declará-la sem o modelo.
 */
export const dynamic = "force-dynamic";

export default async function Detalhe({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura();
  const { id } = await params;
  const consulta = lerConsulta(INVENTARIOS_DE_ESTOQUE, await searchParams);

  const [detalhe, opcoes, permitidas] = await Promise.all([
    verInventarioDeEstoque(id),
    // ⚠️ AS OPÇÕES CONTEXTUAIS DEPENDEM DESTE REGISTRO. Oferecer o item de OUTRA
    // requisição, ou o bloqueio de OUTRO depósito, seria montar um formulário que o caso
    // de uso recusa dentro da transação.
    opcoesDoAlmoxarifado({ }),
    acoesPermitidas(INVENTARIOS_DE_ESTOQUE.acoes.map((a) => a.acaoDoCenso)),
  ]);
  if (detalhe === null) notFound();

  return (
    <DetalheDeRecurso
      definicao={INVENTARIOS_DE_ESTOQUE}
      id={id}
      titulo={detalhe.titulo}
      subtitulo={detalhe.subtitulo}
      selos={detalhe.selos}
      abaAtiva={consulta.aba as AbaDoMolde}
      dados={detalhe.dados}
      historico={detalhe.historico}
      acoes={
        <FormsDoRecurso
          definicao={INVENTARIOS_DE_ESTOQUE}
          permitidas={[...permitidas]}
          opcoes={opcoes}
          registroId={id}
          action={acaoDeInventariosAction}
          modo="acoes"
        />
      }
    />
  );
}
