import { definirRecurso, type DefinicaoDeRecurso } from "../../molde/tipos.js";

/**
 * OS DESCRITORES DOS CADASTROS DO ENT03b — a prova do molde.
 *
 * ⚠️ ELES MORAM NUMA PORTA, e não em `lib/molde/`. O descritor nomeia AÇÕES DO CENSO, e é a
 * porta que pode importar o domínio (`test/ui/fronteira-ui.test.ts`, zona 2). `lib/molde/` é
 * dado puro: ele não sabe o que é uma `AcaoDoSistema`.
 *
 * ⚠️ E `definirRecurso` VERIFICA EM TEMPO DE MÓDULO. Um descritor inconsistente — aba de
 * anexos sem dono, coluna somável que não é dinheiro, ação sem permissão — não carrega, e o
 * `next build` falha junto. O erro aparece antes de alguém abrir a página.
 *
 * ⚠️ O QUE O MOLDE **NÃO** RESOLVE, E ESTÁ AQUI PARA SE VER: cada cadastro declara qual
 * COLUNA de `Anexo` aponta para ele e qual valor de `CadastroComCamposAdicionais` usa. Isso é
 * MODELO, e o modelo não é genérico de propósito — um dono `(tipo, id)` livre faria o banco
 * deixar de garantir que o registro existe. Cadastro novo com anexo custa uma migration
 * aditiva e UMA linha aqui.
 */

const ABAS_COMPLETAS = ["dados", "campos", "anexos", "historico", "relacionados"] as const;

export const CONVENIOS: DefinicaoDeRecurso = definirRecurso({
  nome: "convenios",
  rotulo: "Convênios de repasse",
  rotuloSingular: "Convênio",
  rota: "/transferencias/convenios",
  descricao:
    "Transferências voluntárias em que o ente é concedente ou convenente (LRF art. 25). " +
    "O saldo a liberar, o pendente de prestação de contas e o glosado são três contas " +
    "distintas, todas derivadas dos movimentos.",
  campos: [
    { nome: "identificador", rotulo: "Número do convênio", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "CV-2026-001" },
    { nome: "papelDoEnte", rotulo: "Papel do ente", tipo: "selecao", obrigatorio: true, largura: 1,
      ajuda: "Concedente transfere e recebe a prestação de contas; convenente recebe e a deve.",
      opcoes: [
        { valor: "CONCEDENTE", rotulo: "Concedente (o ente transfere)" },
        { valor: "CONVENENTE", rotulo: "Convenente (o ente recebe)" },
      ] },
    { nome: "objeto", rotulo: "Objeto", tipo: "textoLongo", obrigatorio: true, largura: 4 },
    { nome: "partidaNome", rotulo: "Outra parte", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "partidaDocumento", rotulo: "CPF/CNPJ da outra parte", tipo: "cpfCnpj", obrigatorio: true, largura: 2 },
    { nome: "leiAutorizativa", rotulo: "Lei autorizativa", tipo: "texto", obrigatorio: true, largura: 2,
      ajuda: "LRF art. 25: transferência voluntária exige autorização na lei orçamentária." },
    { nome: "valorRepasse", rotulo: "Valor do repasse (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
    { nome: "valorContrapartida", rotulo: "Contrapartida (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
    { nome: "diaVigenciaInicio", rotulo: "Início da vigência", tipo: "data", obrigatorio: true, largura: 1 },
    { nome: "diaVigenciaFim", rotulo: "Fim da vigência", tipo: "data", obrigatorio: true, largura: 1 },
    { nome: "diasParaPrestacaoDeContas", rotulo: "Prazo de prestação (dias)", tipo: "inteiro", largura: 1, minimo: 1, maximo: 365 },
    { nome: "fonteRecursoId", rotulo: "Fonte de recurso", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [] },
    { nome: "contaContabilId", rotulo: "Conta de controle", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
  ],
  colunas: [
    { nome: "identificador", cabecalho: "Número", tipo: "link", ordenavel: true },
    { nome: "papel", cabecalho: "Papel", tipo: "texto" },
    { nome: "partidaNome", cabecalho: "Outra parte", tipo: "texto" },
    { nome: "valorRepasse", cabecalho: "Repasse", tipo: "dinheiro", somavel: true, ordenavel: true },
    { nome: "aLiberar", cabecalho: "A liberar", tipo: "dinheiro", somavel: true },
    { nome: "aPrestarContas", cabecalho: "A prestar contas", tipo: "dinheiro", somavel: true },
    { nome: "vigenciaFim", cabecalho: "Fim da vigência", tipo: "data", ordenavel: true },
    { nome: "estado", cabecalho: "Situação", tipo: "situacao" },
  ],
  filtros: [
    { nome: "q", rotulo: "Número ou outra parte", tipo: "texto", largura: 2, placeholder: "CV-2026 ou Casa de Apoio" },
    { nome: "papel", rotulo: "Papel do ente", tipo: "selecao", largura: 1,
      opcoes: [
        { valor: "CONCEDENTE", rotulo: "Concedente" },
        { valor: "CONVENENTE", rotulo: "Convenente" },
      ] },
    { nome: "venceAte", rotulo: "Vigência até", tipo: "data", largura: 1 },
  ],
  acoes: [
    { nome: "liberar-parcela", rotulo: "Liberar parcela", acaoDoCenso: "LIBERAR_PARCELA_DE_CONVENIO",
      aviso: "A liberação consome o saldo do termo e, como concedente, exige empenho.",
      campos: [
        { nome: "parcela", rotulo: "Parcela nº", tipo: "inteiro", obrigatorio: true, largura: 1, minimo: 1 },
        { nome: "valor", rotulo: "Valor (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "diaMovimento", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "competencia", rotulo: "Competência (AAAA-MM)", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "2026-02" },
        { nome: "empenhoId", rotulo: "Empenho", tipo: "selecao", largura: 2, opcoes: [] },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 2 },
      ] },
    { nome: "aprovar-prestacao", rotulo: "Aprovar prestação de contas", acaoDoCenso: "APROVAR_PRESTACAO_DE_CONTAS",
      aviso: "Aprovar dá quitação do valor prestado — e é ato separado de liberar, por segregação.",
      campos: [
        { nome: "valor", rotulo: "Valor prestado (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "diaMovimento", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "competencia", rotulo: "Competência (AAAA-MM)", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "2026-04" },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 3 },
      ] },
    { nome: "glosar", rotulo: "Glosar", acaoDoCenso: "GLOSAR_CONVENIO",
      aviso: "A glosa declara que um valor é devido de volta — ela não devolve dinheiro por si.",
      campos: [
        { nome: "valor", rotulo: "Valor glosado (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "diaMovimento", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "competencia", rotulo: "Competência (AAAA-MM)", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "2026-04" },
        { nome: "motivo", rotulo: "Motivo da glosa", tipo: "texto", obrigatorio: true, largura: 3 },
      ] },
    { nome: "registrar-devolucao", rotulo: "Registrar devolução", acaoDoCenso: "REGISTRAR_DEVOLUCAO_DE_CONVENIO",
      campos: [
        { nome: "valor", rotulo: "Valor devolvido (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "diaMovimento", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "competencia", rotulo: "Competência (AAAA-MM)", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "2026-05" },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 3 },
      ] },
  ],
  permissoes: { criar: "CADASTRAR_CONVENIO", anexar: "ANEXAR_ARQUIVO" },
  abas: [...ABAS_COMPLETAS],
  donoDoAnexo: "convenioId",
  cadastroDeCamposAdicionais: "CONVENIO",
  relacionados: [
    {
      rotulo: "Empenhos deste convênio",
      href: "/relatorios/gerenciais?convenio={id}",
      explicacao:
        "Quem soma empenho é o M05. Uma segunda contagem nesta tela seria a segunda verdade " +
        "sobre a mesma execução.",
    },
  ],
});

export const PRECATORIOS: DefinicaoDeRecurso = definirRecurso({
  nome: "precatorios",
  rotulo: "Precatórios judiciais",
  rotuloSingular: "Precatório",
  rota: "/divida/precatorios",
  descricao:
    "Requisitórios judiciais, com a ordem do art. 100 da Constituição: alimentar antes de " +
    "comum, a preferência do §2º dentro dos alimentares, depois a data de apresentação.",
  campos: [
    { nome: "numeroProcesso", rotulo: "Processo judicial", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "tribunal", rotulo: "Tribunal", tipo: "texto", obrigatorio: true, largura: 1 },
    { nome: "oficioRequisitorio", rotulo: "Ofício requisitório", tipo: "texto", largura: 1 },
    { nome: "beneficiarioNome", rotulo: "Beneficiário", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "beneficiarioDocumento", rotulo: "CPF/CNPJ", tipo: "cpfCnpj", obrigatorio: true, largura: 2 },
    { nome: "natureza", rotulo: "Natureza", tipo: "selecao", obrigatorio: true, largura: 1,
      ajuda: "CF art. 100, §1º: alimentar paga-se antes de comum.",
      opcoes: [
        { valor: "ALIMENTAR", rotulo: "Alimentar" },
        { valor: "COMUM", rotulo: "Comum" },
      ] },
    { nome: "preferencia", rotulo: "Preferência (§2º)", tipo: "selecao", largura: 1,
      ajuda: "Só ordena DENTRO dos alimentares. Um comum com preferência não passa à frente de um alimentar.",
      opcoes: [
        { valor: "NENHUMA", rotulo: "Nenhuma" },
        { valor: "IDOSO", rotulo: "Idoso" },
        { valor: "DOENCA_GRAVE", rotulo: "Doença grave" },
        { valor: "DEFICIENCIA", rotulo: "Pessoa com deficiência" },
      ] },
    { nome: "diaApresentacao", rotulo: "Data de apresentação", tipo: "data", obrigatorio: true, largura: 1,
      ajuda: "É ela que ordena a fila — nunca a data em que alguém cadastrou." },
    { nome: "exercicioDePagamento", rotulo: "Exercício de pagamento", tipo: "inteiro", obrigatorio: true, largura: 1, minimo: 2000, maximo: 2100 },
    { nome: "valorOriginal", rotulo: "Valor requisitado (R$)", tipo: "dinheiro", obrigatorio: true, largura: 2 },
    { nome: "contaContabilId", rotulo: "Conta de passivo", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
  ],
  colunas: [
    { nome: "posicao", cabecalho: "Fila", tipo: "inteiro" },
    { nome: "numeroProcesso", cabecalho: "Processo", tipo: "link", ordenavel: true },
    { nome: "beneficiarioNome", cabecalho: "Beneficiário", tipo: "texto" },
    { nome: "natureza", cabecalho: "Natureza", tipo: "texto" },
    { nome: "preferencia", cabecalho: "Preferência", tipo: "texto" },
    { nome: "dataApresentacao", cabecalho: "Apresentação", tipo: "data", ordenavel: true },
    { nome: "valorOriginal", cabecalho: "Requisitado", tipo: "dinheiro", somavel: true },
    { nome: "saldoDevido", cabecalho: "Devido", tipo: "dinheiro", somavel: true },
  ],
  filtros: [
    { nome: "q", rotulo: "Processo ou beneficiário", tipo: "texto", largura: 2 },
    { nome: "natureza", rotulo: "Natureza", tipo: "selecao", largura: 1,
      opcoes: [
        { valor: "ALIMENTAR", rotulo: "Alimentar" },
        { valor: "COMUM", rotulo: "Comum" },
      ] },
    { nome: "exercicio", rotulo: "Exercício de pagamento", tipo: "inteiro", largura: 1 },
  ],
  acoes: [
    { nome: "inscrever", rotulo: "Inscrever o passivo", acaoDoCenso: "INSCREVER_PRECATORIO",
      aviso: "A inscrição reconhece o passivo pelo valor requisitado — e acontece uma vez só.",
      campos: [
        { nome: "valor", rotulo: "Valor (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "diaMovimento", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 2 },
      ] },
    { nome: "atualizar", rotulo: "Atualizar (juros e correção)", acaoDoCenso: "ATUALIZAR_PRECATORIO",
      aviso: "A competência torna a correção idempotente: o mesmo mês não se corrige duas vezes.",
      campos: [
        { nome: "valor", rotulo: "Valor (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "competencia", rotulo: "Competência (AAAA-MM)", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "2026-02" },
        { nome: "diaMovimento", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 1 },
      ] },
    { nome: "cancelar", rotulo: "Cancelar por decisão judicial", acaoDoCenso: "CANCELAR_PRECATORIO",
      irreversivel: true,
      aviso: "O cancelamento extingue o passivo SEM saída de caixa. Corrigi-lo depois é outro fato.",
      campos: [
        { nome: "valor", rotulo: "Valor (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "diaMovimento", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Decisão que cancelou", tipo: "texto", obrigatorio: true, largura: 2 },
      ] },
  ],
  permissoes: { criar: "CADASTRAR_PRECATORIO", anexar: "ANEXAR_ARQUIVO" },
  abas: [...ABAS_COMPLETAS],
  donoDoAnexo: "precatorioId",
  cadastroDeCamposAdicionais: "PRECATORIO",
  relacionados: [
    {
      rotulo: "Empenhos deste precatório",
      href: "/relatorios/gerenciais?precatorio={id}",
      explicacao: "A execução da despesa é do M05 — esta tela não a reconta.",
    },
  ],
});

export const CONSORCIOS: DefinicaoDeRecurso = definirRecurso({
  nome: "consorcios",
  rotulo: "Consórcios públicos",
  rotuloSingular: "Consórcio",
  rota: "/transferencias/consorcios",
  descricao:
    "Associações públicas da Lei 11.107/2005. O repasse só acontece dentro do contrato de " +
    "rateio do exercício (art. 8º), e o teto é a soma do contrato original com os aditivos.",
  campos: [
    { nome: "identificador", rotulo: "Identificador", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "CIS-2026-001" },
    { nome: "denominacao", rotulo: "Denominação", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "cnpj", rotulo: "CNPJ", tipo: "cpfCnpj", obrigatorio: true, largura: 1 },
    { nome: "areaDeAtuacao", rotulo: "Área de atuação", tipo: "texto", obrigatorio: true, largura: 1 },
    { nome: "protocoloDeIntencoes", rotulo: "Protocolo de intenções", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "leiRatificadora", rotulo: "Lei ratificadora", tipo: "texto", obrigatorio: true, largura: 1,
      ajuda: "Art. 5º: sem a lei que ratifica o protocolo, o consórcio não existe para o ente." },
    { nome: "fonteRecursoId", rotulo: "Fonte de recurso", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [] },
    { nome: "contaContabilId", rotulo: "Conta de controle", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
  ],
  colunas: [
    { nome: "identificador", cabecalho: "Identificador", tipo: "link", ordenavel: true },
    { nome: "denominacao", cabecalho: "Denominação", tipo: "texto" },
    { nome: "areaDeAtuacao", cabecalho: "Área", tipo: "texto" },
    { nome: "teto", cabecalho: "Rateio do exercício", tipo: "dinheiro", somavel: true },
    { nome: "repassado", cabecalho: "Repassado", tipo: "dinheiro", somavel: true },
    { nome: "saldo", cabecalho: "A repassar", tipo: "dinheiro", somavel: true },
  ],
  filtros: [
    { nome: "q", rotulo: "Identificador ou denominação", tipo: "texto", largura: 2 },
    { nome: "exercicio", rotulo: "Exercício do rateio", tipo: "inteiro", largura: 1 },
  ],
  acoes: [
    { nome: "registrar-rateio", rotulo: "Registrar contrato de rateio", acaoDoCenso: "REGISTRAR_CONTRATO_DE_RATEIO",
      aviso: "O rateio é ANUAL. Um aditivo SOMA ao original — não o substitui.",
      campos: [
        { nome: "exercicio", rotulo: "Exercício", tipo: "inteiro", obrigatorio: true, largura: 1, minimo: 2000, maximo: 2100 },
        { nome: "valorDoEnte", rotulo: "Cota do ente (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "diaAssinatura", rotulo: "Assinatura", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "aditivoDeId", rotulo: "Aditivo ao contrato", tipo: "selecao", largura: 1, opcoes: [] },
      ] },
    { nome: "repassar", rotulo: "Repassar ao consórcio", acaoDoCenso: "REPASSAR_AO_CONSORCIO",
      aviso: "O exercício do repasse é declarado, e não derivado da data: um repasse de janeiro pode ser da cota do ano anterior.",
      campos: [
        { nome: "exercicio", rotulo: "Exercício da cota", tipo: "inteiro", obrigatorio: true, largura: 1, minimo: 2000, maximo: 2100 },
        { nome: "valor", rotulo: "Valor (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "diaMovimento", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "competencia", rotulo: "Competência (AAAA-MM)", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "2026-02" },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 4 },
      ] },
  ],
  permissoes: { criar: "CADASTRAR_CONSORCIO", anexar: "ANEXAR_ARQUIVO" },
  abas: [...ABAS_COMPLETAS],
  donoDoAnexo: "consorcioId",
  cadastroDeCamposAdicionais: "CONSORCIO",
  relacionados: [
    {
      rotulo: "Empenhos deste consórcio",
      href: "/relatorios/gerenciais?consorcio={id}",
      explicacao: "A execução da despesa é do M05 — esta tela não a reconta.",
    },
  ],
});

export const AUDITORIAS: DefinicaoDeRecurso = definirRecurso({
  nome: "auditorias",
  rotulo: "Auditorias internas",
  rotuloSingular: "Auditoria",
  rota: "/controle-interno/auditorias",
  descricao:
    "O controle interno do art. 74 da Constituição: roteiro com base legal, achados com " +
    "providência e prazo, e o relatório circunstanciado que se assina.",
  campos: [
    { nome: "identificador", rotulo: "Identificador", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "AI-2026-001" },
    { nome: "tipo", rotulo: "Tipo", tipo: "selecao", obrigatorio: true, largura: 1,
      opcoes: [
        { valor: "PROGRAMADA", rotulo: "Programada (plano anual)" },
        { valor: "EXTRAORDINARIA", rotulo: "Extraordinária" },
        { valor: "MONITORAMENTO", rotulo: "Monitoramento de providências" },
      ] },
    { nome: "orgaoId", rotulo: "Órgão auditado", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
    { nome: "objeto", rotulo: "Objeto", tipo: "textoLongo", obrigatorio: true, largura: 4 },
    { nome: "diaPeriodoInicio", rotulo: "Período — de", tipo: "data", obrigatorio: true, largura: 1 },
    { nome: "diaPeriodoFim", rotulo: "Período — até", tipo: "data", obrigatorio: true, largura: 1 },
    { nome: "responsavel", rotulo: "Responsável", tipo: "texto", obrigatorio: true, largura: 1 },
    { nome: "diaAbertura", rotulo: "Data da abertura", tipo: "data", obrigatorio: true, largura: 1 },
    { nome: "motivo", rotulo: "Motivo da abertura", tipo: "texto", obrigatorio: true, largura: 4 },
  ],
  colunas: [
    { nome: "identificador", cabecalho: "Identificador", tipo: "link", ordenavel: true },
    { nome: "orgao", cabecalho: "Órgão auditado", tipo: "texto" },
    { nome: "tipo", cabecalho: "Tipo", tipo: "texto" },
    { nome: "periodo", cabecalho: "Período auditado", tipo: "texto" },
    { nome: "checklist", cabecalho: "Checklist", tipo: "texto" },
    { nome: "achados", cabecalho: "Achados", tipo: "inteiro", ordenavel: true },
    { nome: "estado", cabecalho: "Situação", tipo: "situacao" },
  ],
  filtros: [
    { nome: "q", rotulo: "Identificador ou objeto", tipo: "texto", largura: 2 },
    { nome: "tipo", rotulo: "Tipo", tipo: "selecao", largura: 1,
      opcoes: [
        { valor: "PROGRAMADA", rotulo: "Programada" },
        { valor: "EXTRAORDINARIA", rotulo: "Extraordinária" },
        { valor: "MONITORAMENTO", rotulo: "Monitoramento" },
      ] },
  ],
  acoes: [
    { nome: "registrar-irregularidade", rotulo: "Registrar irregularidade", acaoDoCenso: "REGISTRAR_IRREGULARIDADE",
      aviso: "Achado sem providência e prazo é observação — e observação não se cobra.",
      campos: [
        { nome: "descricao", rotulo: "Descrição do achado", tipo: "textoLongo", obrigatorio: true, largura: 4 },
        { nome: "gravidade", rotulo: "Gravidade", tipo: "selecao", obrigatorio: true, largura: 1,
          opcoes: [
            { valor: "FORMAL", rotulo: "Formal (sem dano)" },
            { valor: "GRAVE", rotulo: "Grave" },
            { valor: "GRAVISSIMA", rotulo: "Gravíssima (dano ou dolo)" },
          ] },
        { nome: "diaPrazo", rotulo: "Prazo", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "providencia", rotulo: "Providência determinada", tipo: "texto", obrigatorio: true, largura: 2 },
      ] },
    { nome: "encerrar", rotulo: "Encerrar a auditoria", acaoDoCenso: "ENCERRAR_AUDITORIA_INTERNA",
      irreversivel: true,
      aviso: "Encerrada, ela só volta a receber lançamento por REABERTURA — que é um fato e exige motivo. O checklist tem de estar inteiro respondido.",
      campos: [
        { nome: "diaEncerramento", rotulo: "Data do encerramento", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 3 },
      ] },
  ],
  permissoes: { criar: "ABRIR_AUDITORIA_INTERNA", anexar: "ANEXAR_ARQUIVO" },
  abas: [...ABAS_COMPLETAS],
  donoDoAnexo: "auditoriaId",
  cadastroDeCamposAdicionais: "AUDITORIA_INTERNA",
  relacionados: [
    {
      rotulo: "Registro de operações do período",
      href: "/administracao/auditoria",
      explicacao:
        "O log da borda registra QUEM fez O QUÊ e QUANDO — mas não a qual registro. " +
        "Pendência nomeada AUDITORIA-SEM-EIXO-DE-REGISTRO.",
    },
  ],
});

/** Todos os recursos do molde — a lista que o teste do censo e a navegação consomem. */
export const RECURSOS_DO_MOLDE: readonly DefinicaoDeRecurso[] = [
  CONVENIOS,
  PRECATORIOS,
  CONSORCIOS,
  AUDITORIAS,
];
