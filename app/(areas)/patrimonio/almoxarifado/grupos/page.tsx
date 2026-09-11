import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { FormsDoRecurso } from "../../../../../components/molde/FormsDoRecurso";
import { ListaDeRecurso } from "../../../../../components/molde/ListaDeRecurso";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../../lib/molde/consulta";
import { somarSelecionadas } from "../../../../../lib/molde/soma";
import { acoesPermitidas, exigirLeitura } from "../../../../../lib/portas/molde";
import { GRUPOS_DE_MATERIAL } from "../../../../../lib/portas/recursos/almoxarifado";
import { listarGruposDeMaterial, opcoesDoAlmoxarifado } from "../../../../../lib/portas/recursos/almoxarifado-dados";
import { PortaSemBancoError } from "../../../../../lib/portas/recursos/dados";
import { acaoDeGruposAction } from "./actions";

/**
 * Materiais — tela do MOLDE (ENT06). O ENT05 deu a esta seção modelo, caso de uso e
 * teste contra banco, e nenhuma tela; esta é a superfície.
 *
 * ⚠️ O QUE É DESTE CADASTRO, E SÓ ISSO: qual porta ler e qual Server Action ligar. Filtros,
 * ordenação por URL, paginação, seleção com soma no servidor e o formulário saem do
 * descritor em `lib/portas/recursos/almoxarifado.ts`.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({
  searchParams,
}: {
  readonly searchParams: Promise<ParametrosBrutos>;
}): Promise<React.ReactElement> {
  // O gate de leitura é a SESSÃO, fail-closed: o censo do M16 é o rol das MUTAÇÕES.
  await exigirLeitura();
  const consulta = lerConsulta(GRUPOS_DE_MATERIAL, await searchParams);

  try {
    const [pagina, opcoes, permitidas] = await Promise.all([
      listarGruposDeMaterial(consulta),
      opcoesDoAlmoxarifado(),
      acoesPermitidas([
        ...Object.values(GRUPOS_DE_MATERIAL.permissoes).filter((p): p is string => p !== undefined),
        ...GRUPOS_DE_MATERIAL.acoes.map((a) => a.acaoDoCenso),
      ]),
    ]);

    const somaveis = GRUPOS_DE_MATERIAL.colunas.filter((c) => c.somavel === true).map((c) => c.nome);

    return (
      <ListaDeRecurso
        definicao={GRUPOS_DE_MATERIAL}
        linhas={pagina.linhas}
        total={pagina.total}
        pagina={consulta.pagina}
        tamanhoPagina={TAMANHO_DE_PAGINA}
        filtrosVigentes={consulta.filtros}
        ordem={consulta.ordem}
        direcao={consulta.direcao}
        selecionados={consulta.selecionados}
        somaDaSelecao={somarSelecionadas(pagina.linhas, consulta.selecionados, somaveis)}
        formulario={
          <FormsDoRecurso
            definicao={GRUPOS_DE_MATERIAL}
            permitidas={[...permitidas]}
            opcoes={opcoes}
            action={acaoDeGruposAction}
            modo="criar"
          />
        }
      />
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <div className="space-y-6">
          <PageHeader titulo={GRUPOS_DE_MATERIAL.rotulo} subtitulo={GRUPOS_DE_MATERIAL.descricao} />
          <EstadoVazio
            titulo="Banco de dados indisponível"
            descricao="Este cadastro lê e escreve no banco. Sem ele, esta tela não tem o que mostrar — e não vai fingir que tem."
          />
        </div>
      );
    }
    throw e;
  }
}
