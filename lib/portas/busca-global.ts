import type { AcaoDoSistema } from "../../modules/m16-travamento/acoes.js";
import { AREA_DA_ACAO } from "./navegacao-permissoes.js";
import {
  AREAS,
  ADMINISTRACAO,
  CADASTROS,
  CONTABILIDADE,
  DIVIDA,
  EXECUCAO_DESPESA,
  EXECUCAO_RECEITA,
  FINANCEIRO,
  PLANEJAMENTO,
  PROTOCOLO,
  RELATORIOS_GERENCIAIS,
  RELATORIOS_LIVROS,
  RELATORIOS_RGF,
  RELATORIOS_RREO,
  ALMOXARIFADO,
  GESTAO_DO_BEM,
  TRANSFERENCIAS,
  CONTROLE_INTERNO,
  COMUNICACAO,
  type SlugDeArea,
} from "../navegacao.js";
import { RECURSOS_DO_MOLDE } from "./recursos/definicoes.js";
import { filtrarPorTexto, type DestinoDaBusca } from "../busca-global.js";

/**
 * ═══ A BUSCA GLOBAL — SOBRE O QUE O SISTEMA REGISTRA, E SÓ O QUE O USUÁRIO ALCANÇA ═══
 *
 * ⚠️ O ÍNDICE É DERIVADO, NÃO DIGITADO. Ele se monta de `RECURSOS_DO_MOLDE` (os cadastros
 * que o molde gera), de `AREAS` e das listas de relatórios — as MESMAS estruturas que
 * desenham a barra lateral. Uma lista de destinos escrita à mão começaria certa e
 * envelheceria calada: o cadastro novo entregue pelo molde simplesmente não apareceria na
 * busca, e ninguém notaria, porque nada quebra quando um índice fica incompleto.
 *
 * ⚠️ E ELA RESPEITA A MESMA PERMISSÃO DA BARRA LATERAL. Uma busca que devolve "Usuários"
 * para quem não pode administrar recria, dentro de um campo de texto, exatamente o defeito
 * que o menu filtrado corrigiu — com o agravante de parecer um atalho legítimo. O recurso
 * do molde traz a própria ação em `permissoes.criar`; os destinos de área herdam a
 * visibilidade da área.
 *
 * ⚠️ ISTO NÃO BUSCA **DADO**. Não procura o convênio nº 12/2026 nem o empenho 2026NE0001:
 * procura ONDE se faz cada coisa. Buscar dado exige varrer tabelas com o recorte de
 * unidade gestora de cada consulta, e uma busca que ignorasse esse recorte devolveria
 * títulos de registros que o usuário não pode ler — vazamento por lista de resultados.
 * Pendência **`BUSCA-DE-REGISTRO`**.
 */

const GRUPOS_DE_RELATORIO: readonly (readonly [
  SlugDeArea,
  string,
  readonly { readonly href: string; readonly rotulo: string; readonly numero: string }[],
])[] = [
  ["relatorios", "RREO", RELATORIOS_RREO],
  ["relatorios", "RGF", RELATORIOS_RGF],
  ["relatorios", "Livros", RELATORIOS_LIVROS],
  ["relatorios", "Gerenciais", RELATORIOS_GERENCIAIS],
  ["despesa", "Execução da despesa", EXECUCAO_DESPESA],
  ["receita", "Execução da receita", EXECUCAO_RECEITA],
  ["planejamento", "Planejamento", PLANEJAMENTO],
  ["financeiro", "Financeiro", FINANCEIRO],
  ["contabilidade", "Contabilidade", CONTABILIDADE],
  ["administracao", "Administração", ADMINISTRACAO],
  ["cadastros", "Cadastros", CADASTROS],
  ["protocolo", "Protocolo", PROTOCOLO],
  ["comunicacao", "Comunicação interna", COMUNICACAO],
  ["transferencias", "Transferências", TRANSFERENCIAS],
  // ⚠️ UMA LINHA POR ÁREA, e as duas listas do patrimônio entram JUNTAS nela. Abrir uma
  // segunda linha para a mesma área daria dois destinos de leitura com o mesmo rótulo, e
  // quem busca veria "Patrimônio" duas vezes sem saber qual é qual.
  ["patrimonio", "Patrimônio", [...ALMOXARIFADO, ...GESTAO_DO_BEM]],
  ["divida", "Dívida e precatórios", DIVIDA],
  ["controle-interno", "Controle interno", CONTROLE_INTERNO],
];

/** O índice inteiro, sem filtro. Exportado para o teste poder medi-lo. */
export function indiceDaBusca(): readonly DestinoDaBusca[] {
  const destinos: DestinoDaBusca[] = [];

  // 1 · os cadastros do molde — trazem a própria permissão
  //
  // ⚠️ `permissoes.criar` É OPCIONAL no descritor: um recurso pode existir só para leitura.
  // Nesse caso o destino cai na regra de ÁREA, e não some — sumir faria a busca esconder
  // uma tela que o usuário pode abrir.
  for (const r of RECURSOS_DO_MOLDE) {
    const acao = (r.permissoes.criar ?? null) as AcaoDoSistema | null;
    const destino = acao === null ? undefined : AREA_DA_ACAO[acao];
    destinos.push({
      rotulo: r.rotulo,
      href: r.rota,
      contexto: "Cadastro",
      acao,
      area: destino === undefined || destino === "transversal" ? "cadastros" : destino,
    });
  }

  // 2 · as áreas
  for (const a of AREAS) {
    destinos.push({
      rotulo: a.rotulo,
      href: `/${a.slug}`,
      contexto: "Área",
      acao: null,
      area: a.slug,
    });
  }

  // 3 · as telas listadas em cada grupo de navegação
  for (const [area, grupo, itens] of GRUPOS_DE_RELATORIO) {
    for (const i of itens) {
      destinos.push({
        rotulo: i.rotulo,
        href: i.href,
        contexto: `${grupo} · ${i.numero}`,
        acao: null,
        area,
      });
    }
  }
  return destinos;
}


/**
 * BUSCA. `acoes` e `areas` vêm do servidor (o mesmo cálculo da barra lateral).
 *
 * ⚠️ UM DESTINO COM AÇÃO SÓ APARECE SE O USUÁRIO TIVER **AQUELA** AÇÃO — não basta a área
 * estar visível. Quem enxerga "Transferências" porque pode lançar consórcio não deve
 * receber "Convênios" num campo de busca que parece um atalho autorizado.
 */
export function buscar(
  termo: string,
  permitido: {
    readonly acoes: ReadonlySet<AcaoDoSistema>;
    readonly areas: ReadonlySet<string>;
  },
  limite = 8
): readonly DestinoDaBusca[] {
  return filtrarPorTexto(permitidos(permitido), termo, limite);
}

/** O recorte de permissão, isolado: é ele que o layout aplica antes de mandar à tela. */
export function permitidos(permitido: {
  readonly acoes: ReadonlySet<AcaoDoSistema>;
  readonly areas: ReadonlySet<string>;
}): readonly DestinoDaBusca[] {
  return indiceDaBusca().filter((d) =>
    d.acao === null
      ? permitido.areas.has(d.area)
      : permitido.acoes.has(d.acao as AcaoDoSistema)
  );
}
