import { definirRecurso, type DefinicaoDeRecurso } from "../../molde/tipos";

/**
 * ═══ OS COMPONENTES DE ENCARGO DO EMPREGADOR (M33, V6.2 U1) ═══
 *
 * O ente cadastra CADA componente (previdência patronal, RAT, outras entidades, suplementar do RPPS,
 * FGTS…) por regime; as VERSÕES (alíquota, teto, rubricas da base, vigência e fundamento) entram pelo
 * detalhe — a base é uma lista de rubricas, e isso é ilha (limite 2 do molde). A versão só vale depois
 * de APROVADA por outra pessoa.
 *
 * ⚠️ NENHUMA ALÍQUOTA SUGERIDA. O formulário não traz percentual preenchido nem "padrão nacional":
 * RGPS, RPPS e FGTS têm fundamentos e bases diferentes, e o valor vem do ato que o ente tem na mão.
 */
export const OPCOES_DE_TIPO_DE_ENCARGO = [
  { valor: "PREVIDENCIA_PATRONAL", rotulo: "Previdência — contribuição patronal" },
  { valor: "PREVIDENCIA_SUPLEMENTAR", rotulo: "Previdência — alíquota suplementar / aporte" },
  { valor: "RISCO_AMBIENTAL_DO_TRABALHO", rotulo: "Risco ambiental do trabalho" },
  { valor: "OUTRAS_ENTIDADES", rotulo: "Outras entidades e fundos" },
  { valor: "FGTS", rotulo: "FGTS" },
  { valor: "OUTRO", rotulo: "Outro (descreva)" },
] as const;

export const OPCOES_DE_REGIME = [
  { valor: "RGPS", rotulo: "RGPS" },
  { valor: "RPPS", rotulo: "RPPS" },
  { valor: "ISENTO", rotulo: "Sem regime (isento)" },
] as const;

export const ENCARGOS_DA_FOLHA: DefinicaoDeRecurso = definirRecurso({
  nome: "encargos-da-folha",
  rotulo: "Encargos do empregador",
  rotuloSingular: "Componente de encargo",
  rota: "/folha/encargos",
  descricao:
    "Os encargos que o ENTE deve sobre a folha, por regime: cada componente com versões vigentes por competência, " +
    "alíquota, base (as rubricas que incidem), teto e fundamento. Não é desconto do servidor e não muda o contracheque. " +
    "A versão só entra no cálculo depois de aprovada por outra pessoa.",
  campos: [
    { nome: "codigo", rotulo: "Código (maiúsculas, dígitos e hífen)", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "RGPS-PATRONAL" },
    { nome: "descricao", rotulo: "Descrição", tipo: "texto", obrigatorio: true, largura: 3 },
    { nome: "tipo", rotulo: "Tipo de encargo", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [...OPCOES_DE_TIPO_DE_ENCARGO] },
    { nome: "regime", rotulo: "Regime do contracheque a que se aplica", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [...OPCOES_DE_REGIME] },
  ],
  colunas: [
    { nome: "codigo", cabecalho: "Código", tipo: "link", ordenavel: true },
    { nome: "descricao", cabecalho: "Descrição", tipo: "texto" },
    { nome: "tipo", cabecalho: "Tipo", tipo: "texto" },
    { nome: "regime", cabecalho: "Regime", tipo: "texto" },
    { nome: "vigente", cabecalho: "Versão vigente hoje", tipo: "texto" },
    { nome: "grupo", cabecalho: "Grupo de empenho", tipo: "texto" },
  ],
  filtros: [{ nome: "q", rotulo: "Código ou descrição", tipo: "texto", largura: 2 }],
  acoes: [
    {
      nome: "aprovar-versao", rotulo: "Aprovar uma versão", acaoDoCenso: "APROVAR_ENCARGO_DA_FOLHA",
      aviso: "Aprovar é conferir alíquota, base, teto e fundamento contra o ato do ente. Quem cadastrou a versão não a aprova. Uma versão SINTÉTICA é perfil de teste e continua dita como tal.",
      campos: [
        { nome: "versaoId", rotulo: "Versão a aprovar", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "motivo", rotulo: "Observação da conferência (opcional)", tipo: "texto", largura: 2 },
      ],
    },
  ],
  permissoes: { criar: "CADASTRAR_ENCARGO_DA_FOLHA" },
  abas: ["dados", "historico"],
});
