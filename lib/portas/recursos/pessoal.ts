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
    "Ficha funcional do servidor: dados civis complementares, vínculos (matrículas) e histórico funcional. CPF, nome, " +
    "endereço e contatos são mantidos no cadastro único de pessoas. Cargo, lotação, salário e situação de cada vínculo " +
    "resultam das movimentações registradas.",
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
    // ⚠️ A MATRÍCULA MOSTRADA É A DO VÍNCULO QUE CASOU COM O FILTRO — ver `listarServidores`.
    // Sem esta coluna, quem procura "cargo de motorista" recebe a linha de uma pessoa com duas
    // matrículas e não sabe QUAL delas é a de motorista.
    { nome: "matricula", cabecalho: "Matrícula", tipo: "texto" },
    { nome: "cargo", cabecalho: "Cargo (na data de referência)", tipo: "texto" },
    { nome: "lotacao", cabecalho: "Lotação (na data de referência)", tipo: "texto" },
    { nome: "funcao", cabecalho: "Função (na data de referência)", tipo: "texto" },
    { nome: "centroDeCusto", cabecalho: "Centro de custo (na data de referência)", tipo: "texto" },
    { nome: "situacao", cabecalho: "Situação", tipo: "situacao" },
  ],
  /**
   * ═══ OS EIXOS DE CONSULTA DO TR 5.12.50 ═══
   *
   * A cláusula pede oito: matrícula, nome, cargo, regime, local de trabalho, centro de custo,
   * função e data de admissão. **Os oito estão aqui desde a V11 V9.4** — os dois últimos entraram
   * quando o MODELO deles nasceu, não antes: até então um seletor vazio no lugar deles teria sido
   * pior que a ausência.
   *
   * ⚠️ E OS DOIS ÚLTIMOS NÃO SÃO O QUE O NOME VIZINHO SUGERE:
   *   · `função` NÃO é `cargo`. Cargo é o posto que a lei criou; função é a atribuição exercida.
   *     Antes da V11 V9.4 os únicos candidatos eram `TipoCargo.FUNCAO_GRATIFICADA` (espécie de
   *     cargo) e `HistoricoVinculo.gratificacaoDescricao` (texto livre, e DINHEIRO, não atribuição).
   *   · `centro de custo` NÃO é `lotação`. Lotação é onde a pessoa trabalha; centro de custo é
   *     onde a despesa é apropriada — e ele não ganhou tabela nova: é o `Setor` do M21, que o
   *     almoxarifado (5.18.10), as compras (5.17.54) e o patrimônio já usam nesse papel.
   *
   * ⚠️ E `regime` SÃO DOIS EIXOS, não um: o JURÍDICO (`String` livre, como a lei orgânica do ente
   * o nomeia) e o PREVIDENCIÁRIO (derivado por evento, decide a tabela de contribuição da folha).
   * Fundi-los num filtro só faria "Estatutário" e "RPPS" disputarem a mesma caixa.
   *
   * ⚠️ CARGO E LOTAÇÃO SÃO BUSCA, NÃO ENUMERAÇÃO. Um `selecao` com o quadro de cargos inteiro
   * ordenado por código é formulário bonito e inútil — o descritor declara o RECORTE, e aqui o
   * recorte é o que a pessoa digita. A porta resolve o texto a identificadores e filtra por eles.
   */
  filtros: [
    { nome: "q", rotulo: "Busca geral (nome, CPF ou matrícula)", tipo: "texto", largura: 2 },
    { nome: "nome", rotulo: "Nome (civil ou social)", tipo: "texto", largura: 2, placeholder: "Nome civil ou nome social" },
    { nome: "matricula", rotulo: "Matrícula", tipo: "texto", largura: 1 },
    { nome: "cargo", rotulo: "Cargo (código ou denominação)", tipo: "texto", largura: 2 },
    { nome: "lotacao", rotulo: "Local de trabalho (código ou nome da lotação)", tipo: "texto", largura: 2 },
    { nome: "funcao", rotulo: "Função exercida (código ou denominação)", tipo: "texto", largura: 2, placeholder: "Ex.: coordenação, chefia" },
    { nome: "centroDeCusto", rotulo: "Centro de custo (código ou nome do setor)", tipo: "texto", largura: 2, placeholder: "Código ou nome do setor" },
    { nome: "regimeJuridico", rotulo: "Regime jurídico", tipo: "texto", largura: 1, placeholder: "Estatutário, CLT..." },
    { nome: "regimePrev", rotulo: "Regime previdenciário", tipo: "selecao", largura: 1, opcoes: [
      { valor: "RGPS", rotulo: "RGPS — regime geral" }, { valor: "RPPS", rotulo: "RPPS — regime próprio" },
      { valor: "ISENTO", rotulo: "Isento" },
      { valor: "NAO_INFORMADO", rotulo: "Não informado (folha não calculada)" },
    ] },
    { nome: "admitidoDe", rotulo: "Admitido de", tipo: "data", largura: 1 },
    { nome: "admitidoAte", rotulo: "Admitido até", tipo: "data", largura: 1 },
    { nome: "situacao", rotulo: "Situação do servidor", tipo: "selecao", largura: 1, opcoes: [
      { valor: "ATIVO", rotulo: "Com vínculo ativo" }, { valor: "AFASTADO", rotulo: "Afastado" }, { valor: "DESLIGADO", rotulo: "Só desligados" }, { valor: "SEM_VINCULO", rotulo: "Sem vínculo" },
    ] },
    // ⚠️ SEM ESTE CAMPO O FILTRO ESCOLHERIA A DATA EM SILÊNCIO. Cargo, lotação e regime
    // previdenciário são derivados: "cargo hoje" e "cargo na competência de maio" dão listas
    // diferentes, e a promoção de junho move o servidor de uma para a outra. Vazio = hoje, e a
    // coluna do cargo deriva na MESMA data que o filtro usou.
    { nome: "dataRef", rotulo: "Data de referência (cargo, lotação, função, centro de custo e regime previdenciário)", tipo: "data", largura: 2, placeholder: "Em branco, data de hoje" },
  ],
  acoes: [
    {
      nome: "admitir", rotulo: "Admitir (novo vínculo)", acaoDoCenso: "ADMITIR_SERVIDOR",
      aviso: "Cria a matrícula e registra a admissão com cargo, lotação e salário. Uma segunda matrícula da mesma pessoa é aceita com alerta de acumulação de cargos.",
      campos: [
        { nome: "matricula", rotulo: "Matrícula (única no ente)", tipo: "texto", obrigatorio: true, largura: 1 },
        { nome: "tipo", rotulo: "Tipo de vínculo", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: OPCOES_DE_TIPO_DE_VINCULO },
        { nome: "regimeJuridico", rotulo: "Regime jurídico (conforme a lei do ente)", tipo: "texto", obrigatorio: true, largura: 2 },
        { nome: "regimePrevidenciario", rotulo: "Regime previdenciário (necessário para a folha)", tipo: "selecao", largura: 1, opcoes: [
          { valor: "RGPS", rotulo: "RGPS — regime geral" },
          { valor: "RPPS", rotulo: "RPPS — regime próprio" },
          { valor: "ISENTO", rotulo: "Isento" },
        ] },
        { nome: "dataAdmissao", rotulo: "Data de admissão", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "cargoId", rotulo: "Cargo", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "lotacaoId", rotulo: "Lotação", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        // ⚠️ V11 V9.5 — OPCIONAL, e no formulário de ADMISSÃO de propósito: sem ele, todo vínculo
        // novo nasceria sem apropriação e dependeria de um segundo ato que alguém vai esquecer.
        // A FUNÇÃO não está aqui — é ato próprio e datado (a portaria), em Movimentar.
        { nome: "centroDeCustoId", rotulo: "Centro de custo (onde a despesa é apropriada)", tipo: "selecao", largura: 2, opcoes: [] },
        { nome: "salarioBase", rotulo: "Salário base (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "observacao", rotulo: "Observação (opcional)", tipo: "texto", largura: 2 },
      ],
    },
    {
      nome: "movimentar", rotulo: "Movimentar (cargo, lotação, função, centro de custo, afastamento, retorno, regime)", acaoDoCenso: "MOVIMENTAR_SERVIDOR",
      aviso: "Registra mudança de cargo, lotação, função, centro de custo, regime ou afastamento, sem alterar a remuneração; a gratificação de função é registrada em Alterar remuneração. A dispensa encerra a função vigente. A movimentação vale a partir da data do fato, e a folha de cada competência considera a situação vigente naquela competência.",
      campos: [
        { nome: "vinculoId", rotulo: "Vínculo (matrícula)", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "tipo", rotulo: "Tipo", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [
          { valor: "MUDANCA_CARGO", rotulo: "Mudança de cargo" }, { valor: "MUDANCA_LOTACAO", rotulo: "Mudança de lotação" },
          { valor: "AFASTAMENTO", rotulo: "Afastamento" }, { valor: "RETORNO_AFASTAMENTO", rotulo: "Retorno de afastamento" },
          { valor: "MUDANCA_REGIME_PREVIDENCIARIO", rotulo: "Mudança de regime previdenciário" },
          // ⚠️ V11 V9.5 — SEM ESTES TRÊS, OS DOIS EIXOS DE 5.12.50 NÃO TINHAM COMO EXISTIR. O
          // modelo, o predicado, a porta e os filtros foram entregues na V9.4, mas nada podia ser
          // DESIGNADO: o operador via "Função exercida" na barra de filtros, digitava e recebia
          // vazio para sempre — não porque o filtro errasse, mas porque o dado era ausente POR
          // CONSTRUÇÃO. É a armadilha que a mutação do `SELECAO_ENXUTA` provou (um filtro que
          // nunca acha nada é indistinguível de um correto sobre dado ausente), na forma mais
          // completa dela: sem ponta de entrada, as duas situações são a mesma para sempre.
          { valor: "DESIGNACAO_FUNCAO", rotulo: "Designação para função" },
          { valor: "DISPENSA_FUNCAO", rotulo: "Dispensa de função" },
          { valor: "MUDANCA_CENTRO_DE_CUSTO", rotulo: "Mudança de centro de custo" },
        ] },
        { nome: "data", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "cargoId", rotulo: "Cargo de destino (mudança de cargo)", tipo: "selecao", largura: 2, opcoes: [] },
        { nome: "lotacaoId", rotulo: "Lotação de destino (mudança de lotação)", tipo: "selecao", largura: 2, opcoes: [] },
        // ⚠️ A DISPENSA NÃO TEM CAMPO DE FUNÇÃO, E ISSO É O DESENHO. Ela ENCERRA a que estiver
        // vigente — `funcaoVigenteEm` decide pelo TIPO do evento, não pela nulidade da coluna, e
        // o CHECK `ck_historico_vinculo_funcao` é bicondicional: dispensa COM função não grava.
        // Preencher os dois faria "dispensou de diretor" e "designou para diretor" terem as
        // mesmas colunas na ficha funcional.
        { nome: "funcaoId", rotulo: "Função de destino (designação para função)", tipo: "selecao", largura: 2, opcoes: [] },
        { nome: "centroDeCustoId", rotulo: "Centro de custo de destino (mudança de centro de custo)", tipo: "selecao", largura: 2, opcoes: [] },
        { nome: "regimePrevidenciario", rotulo: "Regime previdenciário (mudança de regime)", tipo: "selecao", largura: 2, opcoes: [
          { valor: "RGPS", rotulo: "RGPS — regime geral" }, { valor: "RPPS", rotulo: "RPPS — regime próprio" }, { valor: "ISENTO", rotulo: "Isento" },
        ] },
        { nome: "motivo", rotulo: "Motivo / fundamento", tipo: "texto", obrigatorio: true, largura: 4 },
      ],
    },
    {
      nome: "alterar-remuneracao", rotulo: "Alterar remuneração (promoção, reajuste, gratificação)", acaoDoCenso: "ALTERAR_REMUNERACAO",
      aviso: "Altera a remuneração do servidor. Promoção exige cargo e salário; reajuste exige salário; gratificação exige descrição e valor.",
      campos: [
        { nome: "vinculoId", rotulo: "Vínculo (matrícula)", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "tipo", rotulo: "Tipo", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [
          { valor: "PROMOCAO", rotulo: "Promoção" }, { valor: "REAJUSTE_SALARIAL", rotulo: "Reajuste salarial" }, { valor: "GRATIFICACAO", rotulo: "Gratificação" },
        ] },
        { nome: "data", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "cargoId", rotulo: "Cargo (promoção)", tipo: "selecao", largura: 2, opcoes: [] },
        { nome: "salarioBase", rotulo: "Salário base novo (R$)", tipo: "dinheiro", largura: 1 },
        { nome: "gratificacaoDescricao", rotulo: "Gratificação — descrição", tipo: "texto", largura: 2 },
        { nome: "gratificacaoValor", rotulo: "Gratificação — valor (R$)", tipo: "dinheiro", largura: 1 },
        { nome: "motivo", rotulo: "Motivo / fundamento", tipo: "texto", obrigatorio: true, largura: 4 },
      ],
    },
    {
      nome: "informar-regime", rotulo: "Informar o regime previdenciário (vínculos migrados)", acaoDoCenso: "MOVIMENTAR_SERVIDOR",
      aviso: "Para vínculos migrados do sistema anterior sem regime previdenciário informado, inclusive os já desligados com valores a pagar. A data deve estar entre a admissão e o desligamento. O registro corrige o cadastro e não constitui nova movimentação.",
      campos: [
        { nome: "vinculoRegimeId", rotulo: "Vínculo (matrícula), inclusive desligados", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "data", rotulo: "A partir de (entre a admissão e o desligamento)", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "regimePrevidenciario", rotulo: "Regime previdenciário", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [
          { valor: "RGPS", rotulo: "RGPS — regime geral" }, { valor: "RPPS", rotulo: "RPPS — regime próprio" }, { valor: "ISENTO", rotulo: "Isento" },
        ] },
        { nome: "motivo", rotulo: "Motivo / fundamento", tipo: "texto", obrigatorio: true, largura: 4 },
      ],
    },
    {
      nome: "desligar", rotulo: "Desligar", acaoDoCenso: "DESLIGAR_SERVIDOR", irreversivel: true,
      aviso: "Encerra o vínculo de forma definitiva. A readmissão exige novo vínculo, com outra matrícula.",
      campos: [
        { nome: "vinculoId", rotulo: "Vínculo (matrícula)", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "data", rotulo: "Data do desligamento", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo / fundamento", tipo: "texto", obrigatorio: true, largura: 4 },
      ],
    },
    {
      nome: "dependente", rotulo: "Cadastrar dependente", acaoDoCenso: "GERIR_DEPENDENTE",
      aviso: "A baixa por idade ocorre automaticamente no limite legal da finalidade; as demais baixas são registradas em Encerrar finalidade de dependente.",
      campos: [
        { nome: "nome", rotulo: "Nome", tipo: "texto", obrigatorio: true, largura: 2 },
        { nome: "cpf", rotulo: "CPF (opcional para recém-nascido)", tipo: "texto", largura: 1 },
        { nome: "dataNascimento", rotulo: "Nascimento", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "grauParentesco", rotulo: "Parentesco", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: OPCOES_DE_PARENTESCO },
        { nome: "finalidade", rotulo: "Finalidade", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: OPCOES_DE_FINALIDADE },
        { nome: "dataInicio", rotulo: "Início da finalidade", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "invalidezPermanente", rotulo: "Invalidez permanente (sem limite de idade)", tipo: "booleano", largura: 1 },
      ],
    },
    {
      nome: "encerrar-finalidade", rotulo: "Encerrar finalidade de dependente", acaoDoCenso: "BAIXAR_DEPENDENTE", irreversivel: true,
      aviso: "Óbito, perda da guarda, decisão judicial ou saída do plano: o encerramento é registrado com data de efeito, motivo e responsável. Folhas já fechadas não são recalculadas; se o efeito alcançar competências fechadas, elas são indicadas para retificação. Para reativar, cadastre nova finalidade.",
      campos: [
        { nome: "finalidadeId", rotulo: "Dependente e finalidade vigente", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "dataEfeito", rotulo: "Data de efeito", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo (óbito, decisão judicial, saída do plano...)", tipo: "texto", obrigatorio: true, largura: 4 },
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
      aviso: "Elogio, advertência, suspensão, ocorrência ou observação. O registro é permanente e identifica o responsável.",
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
    "Quadro de pessoal: cargos com as vagas fixadas em lei e as vagas ocupadas pelos vínculos ativos. A nomeação depende " +
    "de vaga disponível.",
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

/**
 * ═══ AS FUNÇÕES DE PESSOAL — TR 5.12.50 (V11 V9.5) ═══
 *
 * ⚠️ ESTA TELA É A PONTA DE ENTRADA QUE FALTAVA, e a falta dela era pior que uma tela ausente.
 * A V9.4 entregou o modelo, o predicado, a porta e o FILTRO "Função exercida" — e nenhuma forma
 * de cadastrar uma função ou designar alguém. O operador via o campo, digitava e recebia vazio
 * **para sempre**: não porque o filtro errasse, mas porque o dado era ausente POR CONSTRUÇÃO.
 * Um filtro que nunca acha nada é indistinguível de um filtro correto sobre dado ausente — e sem
 * ponta de entrada as duas situações são a mesma coisa, permanentemente.
 *
 * ⚠️ FUNÇÃO NÃO É CARGO, e a tela é separada por isso: cargo é o POSTO que a lei criou (com vagas
 * fixadas, que autorizam a próxima nomeação); função é a ATRIBUIÇÃO exercida, que não consome
 * vaga nenhuma. Por isso aqui não há "vagas fixadas" nem "ocupadas": o que se conta é quantos
 * vínculos a exercem HOJE, derivado dos eventos, nunca coluna.
 *
 * ⚠️ E NÃO HÁ CAMPO DE VALOR, o que é a razão de `cadastrarFuncao` reusar `CADASTRAR_CARGO`: é a
 * MESMA autoridade (dizer o que a estrutura do ente tem), e o dinheiro que a função costuma pagar
 * entra por `GRATIFICACAO`, sob `ALTERAR_REMUNERACAO`. **Se algum dia esta tela ganhar um campo
 * de valor, a ação se separa no mesmo ato** — a condição de reversão está escrita no censo.
 */
export const FUNCOES: DefinicaoDeRecurso = definirRecurso({
  nome: "funcoes",
  rotulo: "Funções",
  rotuloSingular: "Função",
  rota: "/pessoal/funcoes",
  descricao:
    "Funções que o ente pode designar, distintas dos cargos criados em lei. A designação e a dispensa são registradas " +
    "como movimentação do vínculo, com data de efeito. A gratificação de função é registrada em Alterar remuneração.",
  campos: [
    { nome: "codigo", rotulo: "Código", tipo: "texto", obrigatorio: true, largura: 1 },
    { nome: "denominacao", rotulo: "Denominação", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "leiAutorizativa", rotulo: "Lei ou ato de criação", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "dataPublicacaoLei", rotulo: "Publicação do ato", tipo: "data", obrigatorio: true, largura: 1 },
  ],
  colunas: [
    { nome: "codigo", cabecalho: "Código", tipo: "link", ordenavel: true },
    { nome: "denominacao", cabecalho: "Denominação", tipo: "texto", ordenavel: true },
    { nome: "exercendo", cabecalho: "Exercendo hoje", tipo: "inteiro" },
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
    "Estrutura de lotações do ente (secretaria, departamento, escola), com a unidade orçamentária correspondente, quando " +
    "houver, e a quantidade de servidores lotados.",
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
