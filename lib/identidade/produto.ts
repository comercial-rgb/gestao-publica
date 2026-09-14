/**
 * ═══ A IDENTIDADE DO PRODUTO — tipada, pura, sem servidor (V6 P0.1) ═══
 *
 * Três coisas que a tela de entrada misturava, separadas:
 *   · o PRODUTO — "Gestão Pública", a plataforma. Constante do código.
 *   · a INSTITUIÇÃO — a prefeitura que opera a implantação. Vem do cadastro (`EnteConfig` +
 *     `VersaoDaApresentacaoDoEnte`), pela porta `lib/portas/identidade.ts`. Nunca daqui.
 *   · o AMBIENTE — desenvolvimento, demonstração, homologação, produção. Vem do build.
 *
 * ⚠️ SIAFIC continua sendo o nome do DOMÍNIO contábil (M01–M14) e uma referência técnica
 * legítima. Não é o nome da suíte, e é por isso que ele saiu da entrada e do shell.
 *
 * ⚠️ Este arquivo é importável por componentes client ("use client"): nada de Prisma,
 * nada de porta, nada de `process.env` fora de `NEXT_PUBLIC_*` (o Next os injeta no build).
 */

export const PRODUTO = {
  nome: "Gestão Pública",
  descricao: "Plataforma integrada de gestão municipal",
  /** As iniciais para a marca quando não há imagem institucional. */
  sigla: "GP",
} as const;

export const AMBIENTES = ["desenvolvimento", "demonstracao", "homologacao", "producao"] as const;
export type Ambiente = (typeof AMBIENTES)[number];

/**
 * O ambiente de execução, do build (`NEXT_PUBLIC_AMBIENTE`, ver `next.config.mjs`).
 * Valor desconhecido cai em DESENVOLVIMENTO — o rótulo mais modesto, nunca "produção".
 */
export function ambienteDeExecucao(): Ambiente {
  const bruto = process.env["NEXT_PUBLIC_AMBIENTE"];
  return (AMBIENTES as readonly string[]).includes(bruto ?? "") ? (bruto as Ambiente) : "desenvolvimento";
}

/** O rótulo do ambiente para a tela; `null` em produção (produção não se anuncia). */
export function rotuloDoAmbiente(ambiente: Ambiente = ambienteDeExecucao()): string | null {
  switch (ambiente) {
    case "desenvolvimento":
      return "Ambiente de desenvolvimento";
    case "demonstracao":
      return "Ambiente de demonstração";
    case "homologacao":
      return "Ambiente de homologação";
    case "producao":
      return null;
  }
}

/**
 * A VERSÃO LEGÍVEL — os sete primeiros caracteres do commit do build, ou `null` fora de um
 * build versionado. O SHA completo NÃO vai para o rodapé comum: fica na área técnica
 * autorizada (`/administracao/sistema`) e nas evidências.
 */
export function versaoLegivel(commit: string | undefined = process.env["NEXT_PUBLIC_BUILD_COMMIT"]): string | null {
  if (commit === undefined || commit === "" || commit === "dev") return null;
  return commit.slice(0, 7);
}

/** A proveniência completa — só para a área técnica autorizada. */
export function proveniencia(): { readonly commit: string | null; readonly ambiente: Ambiente } {
  const commit = process.env["NEXT_PUBLIC_BUILD_COMMIT"];
  return { commit: commit === undefined || commit === "" || commit === "dev" ? null : commit, ambiente: ambienteDeExecucao() };
}

/**
 * OS CANAIS — experiências e políticas distintas sobre os MESMOS domínios, não cinco
 * sistemas. Um canal só aparece na entrada quando EXISTE no código (`href` não nulo) e está
 * ATIVADO na apresentação do ente. Os que ainda não existem não ganham link, nem menu vazio.
 */
export interface Canal {
  readonly id: "gestao-interna" | "transparencia" | "consulta-publica" | "portal-do-servidor" | "portal-do-cidadao" | "fornecedor";
  readonly rotulo: string;
  readonly descricao: string;
  /** A rota pública do canal, ou `null` enquanto o canal não existir. */
  readonly href: string | null;
}

export const CANAIS: readonly Canal[] = [
  { id: "gestao-interna", rotulo: "Gestão interna", descricao: "Contabilidade, orçamento, compras, patrimônio, protocolo e administração — com sessão.", href: "/login" },
  { id: "transparencia", rotulo: "Transparência", descricao: "Demonstrativos fiscais em PDF, sem cadastro.", href: "/transparencia/demonstrativos" },
  { id: "consulta-publica", rotulo: "Acompanhar processo", descricao: "Situação e movimentos pelo número e pelo código verificador.", href: "/consulta" },
  { id: "portal-do-servidor", rotulo: "Portal do Servidor", descricao: "Vínculo, dependentes e contracheques — com a sua conta de servidor.", href: "/portal-do-servidor" },
  { id: "portal-do-cidadao", rotulo: "Carta de serviços", descricao: "Serviços publicados, pedido pela internet e acompanhamento do requerente.", href: "/servicos" },
  { id: "fornecedor", rotulo: "Fornecedor", descricao: "Complemento documental pelo representante da empresa, com representação registrada.", href: "/servicos?publico=FORNECEDOR" },
];

/**
 * A IDENTIDADE COMO A TELA A RECEBE — dado puro, serializável, sem função: é o que o layout
 * passa por props às ilhas client (marca da sidebar, rodapé). A porta monta a partir da
 * projeção pública; nada aqui vem do cliente.
 */
export interface IdentidadeDaTela {
  readonly produtoNome: string;
  readonly produtoSigla: string;
  readonly produtoDescricao: string;
  /** O nome de exibição do ente, ou `null` (identidade neutra de desenvolvimento). */
  readonly enteNome: string | null;
  readonly enteOrgao: string | null;
  readonly enteUf: string | null;
  readonly imagemHref: string | null;
  readonly rotuloDoAmbiente: string | null;
  readonly versao: string | null;
  readonly assinaturaDoFornecedor: string | null;
  readonly tema: "PADRAO" | "ALTO_CONTRASTE";
}

/** A identidade NEUTRA — o que a tela mostra sem ente configurado. Nunca uma prefeitura ao acaso. */
export function identidadeNeutra(): IdentidadeDaTela {
  return {
    produtoNome: PRODUTO.nome,
    produtoSigla: PRODUTO.sigla,
    produtoDescricao: PRODUTO.descricao,
    enteNome: null,
    enteOrgao: null,
    enteUf: null,
    imagemHref: null,
    rotuloDoAmbiente: rotuloDoAmbiente(),
    versao: versaoLegivel(),
    assinaturaDoFornecedor: null,
    tema: "PADRAO",
  };
}
