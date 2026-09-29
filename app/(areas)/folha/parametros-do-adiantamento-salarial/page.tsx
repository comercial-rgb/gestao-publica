import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { ListaDeRecurso } from "../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import { acoesPermitidas, exigirLeitura } from "../../../../lib/portas/molde";
import { OPCOES_DE_ESFERA_DO_ATO, OPCOES_DE_TIPO_DE_ATO, PARAMETROS_DO_ADIANTAMENTO_SALARIAL } from "../../../../lib/portas/recursos/folha";
import {
  contasParaOAdiantamentoSalarial,
  listarParametrosDoAdiantamentoSalarial,
  rubricasParaOParametroDoAdiantamentoSalarial,
  PortaSemBancoError,
} from "../../../../lib/portas/recursos/folha-dados";
import { FormParametroDoAdiantamentoSalarial } from "./FormParametroDoAdiantamentoSalarial";

/**
 * OS PARÂMETROS DO ADIANTAMENTO SALARIAL DO ENTE (M33, V13; TR 5.12.50) — lista do molde; o
 * cadastro é a ilha `FormParametroDoAdiantamentoSalarial`.
 *
 * ⚠️ A SITUAÇÃO É DERIVADA a cada leitura: vigente é a de maior versão da competência. Não há
 * coluna de situação, e as versões anteriores continuam listadas — as folhas que elas calcularam
 * citam o id e a versão na memória, e é a versão CITADA que a folha mensal lê para abater. Sem a
 * linha, o contracheque deixaria de se explicar.
 *
 * ⚠️ Imports RELATIVOS na UI. `force-dynamic`: a lista depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({ searchParams }: { readonly searchParams: Promise<ParametrosBrutos> }): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_FOLHA");
  const consulta = lerConsulta(PARAMETROS_DO_ADIANTAMENTO_SALARIAL, await searchParams);
  try {
    const [pagina, rubricas, contasDoAdiantamento, permitidas] = await Promise.all([
      listarParametrosDoAdiantamentoSalarial(consulta),
      rubricasParaOParametroDoAdiantamentoSalarial(),
      // As contas do ramo `1.1.3.1 ADIANTAMENTOS CONCEDIDOS` — o vale é operação PATRIMONIAL e
      // debita um DIREITO a receber do servidor, que a folha mensal baixa ao abatê-lo.
      contasParaOAdiantamentoSalarial(),
      acoesPermitidas(["CONFIGURAR_PARAMETRO_DO_ADIANTAMENTO_SALARIAL"]),
    ]);
    const podeCriar = permitidas.has("CONFIGURAR_PARAMETRO_DO_ADIANTAMENTO_SALARIAL");
    return (
      <ListaDeRecurso
        definicao={PARAMETROS_DO_ADIANTAMENTO_SALARIAL}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        // Nenhuma coluna deste recurso é somável (não há dinheiro na lista de parâmetros), então
        // a coluna de marcação nem aparece — mas a prop é obrigatória, e o vazio diz isso.
        somaDaSelecao={{}}
        {...(podeCriar
          ? {
              formulario: (
                <FormParametroDoAdiantamentoSalarial
                  proventos={rubricas.proventos}
                  abatimento={rubricas.abatimento}
                  adiantamentosQuePermitemPago={rubricas.adiantamentosQuePermitemPago}
                  contasDoAdiantamento={contasDoAdiantamento}
                  opcoesDeEsferaDoAto={OPCOES_DE_ESFERA_DO_ATO}
                  opcoesDeTipoDeAto={OPCOES_DE_TIPO_DE_ATO}
                />
              ),
            }
          : {
              motivoSemCriar:
                "Seu perfil não tem permissão para configurar os parâmetros do adiantamento salarial. Essa permissão é " +
                "específica e não acompanha a do 13º, pois o percentual do adiantamento costuma ser fixado por decreto. " +
                "Solicite a permissão ao administrador do sistema.",
            })}
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader
            titulo={PARAMETROS_DO_ADIANTAMENTO_SALARIAL.rotulo}
            subtitulo={PARAMETROS_DO_ADIANTAMENTO_SALARIAL.descricao}
          />
          <EstadoVazio
            titulo="Dados indisponíveis no momento"
            descricao="Não foi possível acessar as informações. Tente novamente mais tarde."
          />
        </div>
      );
    }
    throw e;
  }
}
