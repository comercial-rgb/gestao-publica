import { definirRecurso, type DefinicaoDeRecurso } from "../../molde/tipos.js";

/**
 * ═══ PESSOAL — M32 (RH bloco 1, TR 5.12), V6 P2.2 ═══
 *
 * Três recursos do molde: SERVIDORES (a ficha sobre a pessoa canônica do M19, com os vínculos e o
 * histórico funcional), CARGOS (o quadro: vagas fixadas em lei × ocupadas contadas) e LOTAÇÕES (a
 * árvore). Os atos da vida funcional — admitir, movimentar, alterar remuneração, desligar,
 * dependente, portaria, anotação, treinamento — são AÇÕES do detalhe do servidor.
 *
 * ⚠️ TUDO É DERIVADO dos eventos (`HistoricoVinculo`): cargo, lotação, salário e situação de cada
 * vínculo NA DATA. Nenhuma coluna de situação. Vagas ocupadas são contadas a cada leitura.
 */

const OPCOES_DE_SEXO = [
  { valor: "FEMININO", rotulo: "Feminino" },
  { valor: "MASCULINO", rotulo: "Masculino" },
  { valor: "NAO_INFORMADO", rotulo: "Não informado" },
];
const OPCOES_DE_TIPO_DE_VINCULO = [
  { valor: "EFETIVO", rotulo: "Efetivo" },
  { valor: "COMISSIONADO", rotulo: "Comissionado" },
  { valor: "TEMPORARIO", rotulo: "Temporário" },
  { valor: "ELETIVO", rotulo: "Eletivo" },
  { valor: "APOSENTADO", rotulo: "Aposentado" },
  { valor: "PENSIONISTA", rotulo: "Pensionista" },
  { valor: "ESTAGIARIO", rotulo: "Estagiário" },
];
const OPCOES_DE_TIPO_DE_CARGO = [
  { valor: "EFETIVO", rotulo: "Efetivo" },
  { valor: "COMISSAO", rotulo: "Em comissão" },
  { valor: "FUNCAO_GRATIFICADA", rotulo: "Função gratificada" },
  { valor: "EMPREGO_PUBLICO", rotulo: "Emprego público" },
  { valor: "TEMPORARIO", rotulo: "Temporário" },
  { valor: "AGENTE_POLITICO", rotulo: "Agente político" },
];
const OPCOES_DE_PARENTESCO = [
  { valor: "CONJUGE", rotulo: "Cônjuge" }, { valor: "COMPANHEIRO", rotulo: "Companheiro(a)" }, { valor: "FILHO", rotulo: "Filho(a)" },
  { valor: "ENTEADO", rotulo: "Enteado(a)" }, { valor: "TUTELADO", rotulo: "Tutelado(a)" }, { valor: "PAI", rotulo: "Pai" }, { valor: "MAE", rotulo: "Mãe" },
  { valor: "IRMAO", rotulo: "Irmão(ã)" }, { valor: "NETO", rotulo: "Neto(a)" }, { valor: "OUTRO", rotulo: "Outro" },
];
const OPCOES_DE_FINALIDADE = [
  { valor: "IMPOSTO_RENDA", rotulo: "Imposto de renda" }, { valor: "SALARIO_FAMILIA", rotulo: "Salário-família" },
  { valor: "PLANO_SAUDE", rotulo: "Plano de saúde" }, { valor: "PENSAO_ALIMENTICIA", rotulo: "Pensão alimentícia" },
];
const OPCOES_DE_PORTARIA = [
  { valor: "NOMEACAO", rotulo: "Nomeação" }, { valor: "DESIGNACAO", rotulo: "Designação" }, { valor: "SUBSTITUICAO", rotulo: "Substituição" },
  { valor: "PROMOCAO", rotulo: "Promoção" }, { valor: "EXONERACAO", rotulo: "Exoneração" }, { valor: "DEMISSAO", rotulo: "Demissão" },
];
const OPCOES_DE_ANOTACAO = [
  { valor: "ELOGIO", rotulo: "Elogio" }, { valor: "ADVERTENCIA", rotulo: "Advertência" }, { valor: "SUSPENSAO", rotulo: "Suspensão" },
  { valor: "OCORRENCIA", rotulo: "Ocorrência" }, { valor: "OBSERVACAO", rotulo: "Observação" },
];

export const SERVIDORES: DefinicaoDeRecurso = definirRecurso({
  nome: "servidores",
  rotulo: "Servidores",
  rotuloSingular: "Servidor",
  rota: "/pessoal/servidores",
  descricao:
    "A ficha do servidor sobre a PESSOA do cadastro único: CPF, nome, endereço e contatos vivem lá; aqui ficam os dados " +
    "civis próprios, os vínculos (matrículas) e o histórico funcional. Cargo, lotação, salário e situação de cada vínculo " +
    "são derivados dos eventos — nunca colunas.",
  campos: [
    { nome: "pessoaId", rotulo: "Pessoa do cadastro único (física)", tipo: "selecao", obrigatorio: true, largura: 3, opcoes: [] },
    { nome: "nomeSocial", rotulo: "Nome social (opcional)", tipo: "texto", largura: 1 },
    { nome: "dataNascimento", rotulo: "Data de nascimento", tipo: "data", obrigatorio: true, largura: 1 },
    { nome: "sexo", rotulo: "Sexo", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: OPCOES_DE_SEXO },
    { nome: "pisPasep", rotulo: "PIS/PASEP/NIT (11 dígitos, opcional)", tipo: "texto", largura: 1 },
    { nome: "rgNumero", rotulo: "RG (opcional)", tipo: "texto", largura: 1 },
    { nome: "rgOrgaoEmissor", rotulo: "Órgão emissor", tipo: "texto", largura: 1 },
    { nome: "rgUf", rotulo: "UF do RG", tipo: "texto", largura: 1 },
    { nome: "tituloEleitor", rotulo: "Título de eleitor (opcional)", tipo: "texto", largura: 1 },
    { nome: "ctpsNumero", rotulo: "CTPS (opcional)", tipo: "texto", largura: 1 },
    { nome: "ctpsSerie", rotulo: "Série da CTPS", tipo: "texto", largura: 1 },
    { nome: "nomeMae", rotulo: "Nome da mãe (opcional)", tipo: "texto", largura: 2 },
    { nome: "nomePai", rotulo: "Nome do pai (opcional)", tipo: "texto", largura: 2 },
  ],
  colunas: [
    { nome: "nome", cabecalho: "Nome", tipo: "link", ordenavel: true },
    { nome: "documento", cabecalho: "CPF", tipo: "texto" },
    { nome: "vinculos", cabecalho: "Vínculos", tipo: "inteiro" },
    { nome: "cargo", cabecalho: "Cargo (vínculo ativo)", tipo: "texto" },
    { nome: "lotacao", cabecalho: "Lotação", tipo: "texto" },
    { nome: "situacao", cabecalho: "Situação", tipo: "situacao" },
  ],
  filtros: [
    { nome: "q", rotulo: "Nome, CPF ou matrícula", tipo: "texto", largura: 2 },
    { nome: "situacao", rotulo: "Situação", tipo: "selecao", largura: 1, opcoes: [
      { valor: "ATIVO", rotulo: "Com vínculo ativo" }, { valor: "AFASTADO", rotulo: "Afastado" }, { valor: "DESLIGADO", rotulo: "Só desligados" }, { valor: "SEM_VINCULO", rotulo: "Sem vínculo" },
    ] },
  ],
  acoes: [
    {
      nome: "admitir", rotulo: "Admitir (novo vínculo)", acaoDoCenso: "ADMITIR_SERVIDOR",
      aviso: "Cria a matrícula e o evento de admissão com cargo, lotação e salário. Segunda matrícula da mesma pessoa é aceita com ALERTA de acumulação.",
      campos: [
        { nome: "matricula", rotulo: "Matrícula (única no ente)", tipo: "texto", obrigatorio: true, largura: 1 },
        { nome: "tipo", rotulo: "Tipo de vínculo", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: OPCOES_DE_TIPO_DE_VINCULO },
        { nome: "regimeJuridico", rotulo: "Regime jurídico (como a lei do ente o nomeia)", tipo: "texto", obrigatorio: true, largura: 2 },
        { nome: "regimePrevidenciario", rotulo: "Regime previdenciário (a folha exige)", tipo: "selecao", largura: 1, opcoes: [
          { valor: "RGPS", rotulo: "RGPS — regime geral" },
          { valor: "RPPS", rotulo: "RPPS — regime próprio" },
          { valor: "ISENTO", rotulo: "Isento" },
        ] },
        { nome: "dataAdmissao", rotulo: "Data de admissão", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "cargoId", rotulo: "Cargo", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "lotacaoId", rotulo: "Lotação", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "salarioBase", rotulo: "Salário base (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "observacao", rotulo: "Observação (opcional)", tipo: "texto", largura: 2 },
      ],
    },
    {
      nome: "movimentar", rotulo: "Movimentar (cargo, lotação, afastamento, retorno)", acaoDoCenso: "MOVIMENTAR_SERVIDOR",
      aviso: "Muda ONDE e EM QUE o servidor trabalha; não muda quanto recebe. Afastamento e retorno não levam cargo nem lotação.",
      campos: [
        { nome: "vinculoId", rotulo: "Vínculo (matrícula)", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "tipo", rotulo: "Tipo", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [
          { valor: "MUDANCA_CARGO", rotulo: "Mudança de cargo" }, { valor: "MUDANCA_LOTACAO", rotulo: "Mudança de lotação" },
          { valor: "AFASTAMENTO", rotulo: "Afastamento" }, { valor: "RETORNO_AFASTAMENTO", rotulo: "Retorno de afastamento" },
        ] },
        { nome: "data", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "cargoId", rotulo: "Cargo de destino (só mudança de cargo)", tipo: "selecao", largura: 2, opcoes: [] },
        { nome: "lotacaoId", rotulo: "Lotação de destino (só mudança de lotação)", tipo: "selecao", largura: 2, opcoes: [] },
        { nome: "motivo", rotulo: "Motivo / fundamento", tipo: "texto", obrigatorio: true, largura: 4 },
      ],
    },
    {
      nome: "alterar-remuneracao", rotulo: "Alterar remuneração (promoção, reajuste, gratificação)", acaoDoCenso: "ALTERAR_REMUNERACAO",
      aviso: "Muda QUANTO o servidor recebe. Promoção exige cargo e salário; reajuste exige salário; gratificação exige descrição e valor.",
      campos: [
        { nome: "vinculoId", rotulo: "Vínculo (matrícula)", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "tipo", rotulo: "Tipo", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [
          { valor: "PROMOCAO", rotulo: "Promoção" }, { valor: "REAJUSTE_SALARIAL", rotulo: "Reajuste salarial" }, { valor: "GRATIFICACAO", rotulo: "Gratificação" },
        ] },
        { nome: "data", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "cargoId", rotulo: "Cargo (só promoção)", tipo: "selecao", largura: 2, opcoes: [] },
        { nome: "salarioBase", rotulo: "Salário base novo (R$)", tipo: "dinheiro", largura: 1 },
        { nome: "gratificacaoDescricao", rotulo: "Gratificação — descrição", tipo: "texto", largura: 2 },
        { nome: "gratificacaoValor", rotulo: "Gratificação — valor (R$)", tipo: "dinheiro", largura: 1 },
        { nome: "motivo", rotulo: "Motivo / fundamento", tipo: "texto", obrigatorio: true, largura: 4 },
      ],
    },
    {
      nome: "desligar", rotulo: "Desligar", acaoDoCenso: "DESLIGAR_SERVIDOR", irreversivel: true,
      aviso: "Encerra o vínculo: é terminal. Readmitir é OUTRO vínculo, com outra matrícula.",
      campos: [
        { nome: "vinculoId", rotulo: "Vínculo (matrícula)", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "data", rotulo: "Data do desligamento", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo / fundamento", tipo: "texto", obrigatorio: true, largura: 4 },
      ],
    },
    {
      nome: "dependente", rotulo: "Cadastrar dependente", acaoDoCenso: "GERIR_DEPENDENTE",
      aviso: "A baixa por IDADE é derivada do limite legal da finalidade; só a baixa por fato é um ato.",
      campos: [
        { nome: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true, largura: 2 },
        { nome: "cpf", rotulo: "CPF (opcional — recém-nascido entra sem)", tipo: "texto", largura: 1 },
        { nome: "dataNascimento", rotulo: "Nascimento", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "grauParentesco", rotulo: "Parentesco", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: OPCOES_DE_PARENTESCO },
        { nome: "finalidade", rotulo: "Finalidade", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: OPCOES_DE_FINALIDADE },
        { nome: "dataInicio", rotulo: "Início da finalidade", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "invalidezPermanente", rotulo: "Invalidez permanente (sem limite de idade)", tipo: "booleano", largura: 1 },
      ],
    },
    {
      nome: "portaria", rotulo: "Registrar portaria", acaoDoCenso: "REGISTRAR_PORTARIA",
      campos: [
        { nome: "vinculoId", rotulo: "Vínculo (matrícula)", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "tipo", rotulo: "Tipo", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: OPCOES_DE_PORTARIA },
        { nome: "numero", rotulo: "Número", tipo: "texto", obrigatorio: true, largura: 1 },
        { nome: "ano", rotulo: "Ano", tipo: "inteiro", obrigatorio: true, largura: 1, minimo: 1900, maximo: 2100 },
        { nome: "data", rotulo: "Data", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "ementa", rotulo: "Ementa", tipo: "texto", obrigatorio: true, largura: 4 },
      ],
    },
    {
      nome: "anotacao", rotulo: "Anotar na ficha", acaoDoCenso: "REGISTRAR_ANOTACAO",
      aviso: "Elogio, advertência, suspensão, ocorrência ou observação — append-only, com autor.",
      campos: [
        { nome: "tipo", rotulo: "Tipo", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: OPCOES_DE_ANOTACAO },
        { nome: "data", rotulo: "Data", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "titulo", rotulo: "Título", tipo: "texto", obrigatorio: true, largura: 2 },
        { nome: "texto", rotulo: "Texto (mínimo 10 caracteres)", tipo: "textoLongo", obrigatorio: true, largura: 4 },
      ],
    },
    {
      nome: "treinamento", rotulo: "Registrar treinamento", acaoDoCenso: "REGISTRAR_TREINAMENTO",
      campos: [
        { nome: "descricao", rotulo: "Descrição", tipo: "texto", obrigatorio: true, largura: 2 },
        { nome: "instituicao", rotulo: "Instituição (opcional)", tipo: "texto", largura: 1 },
        { nome: "cargaHoraria", rotulo: "Carga horária (h)", tipo: "inteiro", largura: 1, minimo: 1 },
        { nome: "dataInicio", rotulo: "Início", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "dataTermino", rotulo: "Término (opcional)", tipo: "data", largura: 1 },
      ],
    },
  ],
  permissoes: { criar: "CADASTRAR_SERVIDOR" },
  abas: ["dados", "historico"],
});

export const CARGOS: DefinicaoDeRecurso = definirRecurso({
  nome: "cargos",
  rotulo: "Cargos",
  rotuloSingular: "Cargo",
  rota: "/pessoal/cargos",
  descricao:
    "O quadro de pessoal: cada cargo com as vagas FIXADAS em lei; as vagas OCUPADAS são contadas a cada leitura pelos " +
    "vínculos vivos naquele cargo — é esse número que autoriza a próxima nomeação. Criar a vaga e ocupá-la são ações distintas.",
  campos: [
    { nome: "codigo", rotulo: "Código", tipo: "texto", obrigatorio: true, largura: 1 },
    { nome: "denominacao", rotulo: "Denominação", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "tipo", rotulo: "Tipo", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: OPCOES_DE_TIPO_DE_CARGO },
    { nome: "vagasFixadas", rotulo: "Vagas fixadas em lei", tipo: "inteiro", obrigatorio: true, largura: 1, minimo: 0 },
    { nome: "leiAutorizativa", rotulo: "Lei de criação", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "dataPublicacaoLei", rotulo: "Publicação da lei", tipo: "data", obrigatorio: true, largura: 1 },
    { nome: "cargaHorariaSemanal", rotulo: "Carga horária semanal (h)", tipo: "inteiro", largura: 1, minimo: 1 },
    { nome: "requisitoIngresso", rotulo: "Requisito de ingresso (opcional)", tipo: "texto", largura: 4 },
  ],
  colunas: [
    { nome: "codigo", cabecalho: "Código", tipo: "link", ordenavel: true },
    { nome: "denominacao", cabecalho: "Denominação", tipo: "texto", ordenavel: true },
    { nome: "tipo", cabecalho: "Tipo", tipo: "texto" },
    { nome: "vagasFixadas", cabecalho: "Vagas", tipo: "inteiro" },
    { nome: "ocupadas", cabecalho: "Ocupadas", tipo: "inteiro" },
    { nome: "situacao", cabecalho: "Situação", tipo: "situacao" },
  ],
  filtros: [{ nome: "q", rotulo: "Código ou denominação", tipo: "texto", largura: 2 }],
  acoes: [],
  permissoes: { criar: "CADASTRAR_CARGO" },
  abas: ["dados", "historico"],
});

export const LOTACOES: DefinicaoDeRecurso = definirRecurso({
  nome: "lotacoes",
  rotulo: "Lotações",
  rotuloSingular: "Lotação",
  rota: "/pessoal/lotacoes",
  descricao:
    "A árvore de lotações do ente (secretaria, departamento, escola…), com a unidade orçamentária quando houver. Os " +
    "lotados em cada uma são contados pelos vínculos vivos — nunca coluna.",
  campos: [
    { nome: "codigo", rotulo: "Código", tipo: "texto", obrigatorio: true, largura: 1 },
    { nome: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "paiId", rotulo: "Lotação superior (opcional)", tipo: "selecao", largura: 2, opcoes: [] },
    { nome: "unidadeOrcId", rotulo: "Unidade orçamentária (opcional)", tipo: "selecao", largura: 2, opcoes: [] },
  ],
  colunas: [
    { nome: "codigo", cabecalho: "Código", tipo: "link", ordenavel: true },
    { nome: "nome", cabecalho: "Nome", tipo: "texto", ordenavel: true },
    { nome: "pai", cabecalho: "Superior", tipo: "texto" },
    { nome: "unidade", cabecalho: "Unidade orçamentária", tipo: "texto" },
    { nome: "lotados", cabecalho: "Lotados", tipo: "inteiro" },
  ],
  filtros: [{ nome: "q", rotulo: "Código ou nome", tipo: "texto", largura: 2 }],
  acoes: [],
  permissoes: { criar: "CADASTRAR_LOTACAO" },
  abas: ["dados", "historico"],
});

export const RECURSOS_DO_PESSOAL: readonly DefinicaoDeRecurso[] = [SERVIDORES, CARGOS, LOTACOES];
