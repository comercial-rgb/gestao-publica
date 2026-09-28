import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { DOCUMENTOS_FISCAIS } from "../../../../lib/portas/recursos/documentos-fiscais";
import {
  listarDocumentosFiscais,
  opcoesDoDocumentoFiscal,
  PortaSemBancoError,
} from "../../../../lib/portas/recursos/documentos-fiscais-dados";
import { FormDocumentoFiscal } from "./FormDocumentoFiscal";
import { FormImportarXml } from "./FormImportarXml";

/**
 * DOCUMENTOS FISCAIS RECEBIDOS — lista do molde; criação e importação de XML são ilhas.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_LICITACOES");
  const consulta = lerConsulta(DOCUMENTOS_FISCAIS, await searchParams);
  try {
    const [pagina, permitidas, opcoes] = await Promise.all([
      listarDocumentosFiscais(consulta),
      acoesPermitidas(["REGISTRAR_DOCUMENTO_FISCAL"]),
      opcoesDoDocumentoFiscal(),
    ]);
    const podeCriar = permitidas.has("REGISTRAR_DOCUMENTO_FISCAL");
    const emitentes = (opcoes["emitenteId"] ?? []).map((o) => ({ id: o.valor, rotulo: o.rotulo }));
    const ordens = (opcoes["ordemId"] ?? []).map((o) => ({ id: o.valor, rotulo: o.rotulo }));
    const contratos = (opcoes["contratoId"] ?? []).map((o) => ({ id: o.valor, rotulo: o.rotulo }));
    const empenhos = (opcoes["empenhoId"] ?? []).map((o) => ({ id: o.valor, rotulo: o.rotulo }));
    return (
      <ListaDeRecurso
        definicao={DOCUMENTOS_FISCAIS}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(
          pagina.linhas,
          consulta.selecionados,
          DOCUMENTOS_FISCAIS.colunas.filter((c) => c.somavel === true).map((c) => c.nome)
        )}
        {...(podeCriar
          ? {
              formulario: (
                <div className="space-y-6">
                  <FormDocumentoFiscal
                    emitentes={emitentes}
                    ordens={ordens}
                    contratos={contratos}
                    empenhos={empenhos}
                  />
                  <FormImportarXml ordens={ordens} contratos={contratos} empenhos={empenhos} />
                </div>
              ),
            }
          : {
              motivoSemCriar:
                "Seu perfil não tem permissão para registrar documentos fiscais. Solicite a permissão ao administrador do sistema.",
            })}
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={DOCUMENTOS_FISCAIS.rotulo} subtitulo={DOCUMENTOS_FISCAIS.descricao} />
          <EstadoVazio
            titulo="Serviço indisponível"
            descricao="Não foi possível carregar os dados. Tente novamente em instantes."
          />
        </div>
      );
    }
    throw e;
  }
}
