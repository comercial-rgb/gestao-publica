import { definirRecurso, type DefinicaoDeRecurso } from "../../molde/tipos.js";
import { RECURSOS_DO_ALMOXARIFADO } from "./almoxarifado.js";
import { RECURSOS_DA_GESTAO_DO_BEM } from "./gestao-do-bem.js";

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
  classesDeConta: ["7", "8"],
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
  classesDeConta: ["2"],
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
  classesDeConta: ["7", "8"],
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


// ══════════════════════════════════════════════════════════════════════════════
// ENT03c — OS CADASTROS QUE O CENSO ACHOU COM MOTOR E SEM TELA
//
// ⚠️ OS TRÊS SAÍRAM DA PRÓPRIA VARREDURA DESTE LOTE, e é isso que os torna baratos: o
// censo mediu o M10 e o M11 cláusula a cláusula e encontrou o mesmo padrão três vezes —
// caso de uso completo, invariante provado por teste de integração, e NENHUMA rota em
// `app/`. A dívida fundada amortiza dentro do pagamento; a dívida ativa inscreve, atualiza
// por competência idempotente e recebe pela guia; a obra mede com período que não se
// sobrepõe e segregação entre quem mede e quem aprova. Tudo isso existia e não tinha onde
// ser usado.
//
// ⚠️ E NENHUM DELES PRECISOU DE AÇÃO NOVA NO CENSO DO M16. As doze ações que estas telas
// disparam já estavam lá desde que os casos de uso nasceram — o que faltava era a
// superfície. É a medida mais honesta do que o molde custa: três cadastros, três
// descritores, nove rotas, uma migration aditiva de duas colunas.
// ══════════════════════════════════════════════════════════════════════════════

/** As dez do rol FECHADO da IN/INSS/DC 100/2003 — o mesmo rol que o Zod do M11 cobra. */
const TIPOS_DE_OBRA_OPCOES = [
  { valor: "SERVICOS_DIVERSOS_SUJEITOS_A_RETENCAO", rotulo: "01 — Serviços diversos sujeitos a retenção" },
  { valor: "TRANSPORTE_DE_PASSAGEIROS_POR_PF", rotulo: "02 — Transporte de passageiros por pessoa física" },
  { valor: "LIMPEZA_HOSPITALAR", rotulo: "03 — Limpeza hospitalar" },
  { valor: "DEMAIS_LIMPEZAS", rotulo: "04 — Demais limpezas" },
  { valor: "PAVIMENTACAO_ASFALTICA", rotulo: "05 — Pavimentação asfáltica" },
  { valor: "TERRAPLANAGEM_ATERRO_SANITARIO_E_DRAGAGEM", rotulo: "06 — Terraplanagem, aterro sanitário e dragagem" },
  { valor: "OBRAS_DE_ARTE", rotulo: "07 — Obras de arte (pontes, viadutos)" },
  { valor: "DRENAGEM", rotulo: "08 — Drenagem" },
  { valor: "DEMAIS_SERVICOS_DE_CONSTRUCAO_CIVIL_COM_EQUIPAMENTOS", rotulo: "09 — Demais serviços de construção civil com equipamentos" },
  { valor: "EDIFICACOES_EM_GERAL", rotulo: "10 — Edificações em geral" },
] as const;

export const DIVIDA_FUNDADA: DefinicaoDeRecurso = definirRecurso({
  nome: "divida-fundada",
  rotulo: "Dívida fundada",
  rotuloSingular: "Dívida",
  rota: "/divida/fundada",
  descricao:
    "A dívida consolidada do ente (LRF art. 29, I). O ingresso é receita de operação de " +
    "crédito e a amortização é despesa do grupo 6 — os dois são lançados por quem é dono " +
    "do fato. Só a atualização monetária nasce aqui, e é a única que diminui o patrimônio.",
  campos: [
    { nome: "identificador", rotulo: "Identificador", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "DF-2026-001" },
    { nome: "tipo", rotulo: "Tipo", tipo: "selecao", obrigatorio: true, largura: 1,
      opcoes: [
        { valor: "CONTRATUAL", rotulo: "Contratual (contrato de financiamento)" },
        { valor: "MOBILIARIA", rotulo: "Mobiliária (títulos)" },
      ] },
    { nome: "credorNome", rotulo: "Credor", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "credorDocumento", rotulo: "CNPJ do credor", tipo: "cpfCnpj", obrigatorio: true, largura: 1 },
    { nome: "leiAutorizativa", rotulo: "Lei autorizativa", tipo: "texto", obrigatorio: true, largura: 2,
      ajuda: "Art. 32 da LRF: sem autorização legislativa, a operação de crédito não se contrata." },
    { nome: "objeto", rotulo: "Objeto", tipo: "textoLongo", obrigatorio: true, largura: 4 },
    { nome: "contaContabilId", rotulo: "Conta do passivo", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
  ],
  colunas: [
    { nome: "identificador", cabecalho: "Identificador", tipo: "link", ordenavel: true },
    { nome: "credorNome", cabecalho: "Credor", tipo: "texto" },
    { nome: "tipo", cabecalho: "Tipo", tipo: "texto" },
    { nome: "ingressado", cabecalho: "Ingressado", tipo: "dinheiro", somavel: true },
    { nome: "amortizado", cabecalho: "Amortizado", tipo: "dinheiro", somavel: true },
    { nome: "saldo", cabecalho: "Saldo devedor", tipo: "dinheiro", somavel: true },
  ],
  filtros: [
    { nome: "q", rotulo: "Identificador ou credor", tipo: "texto", largura: 2 },
    { nome: "tipo", rotulo: "Tipo", tipo: "selecao", largura: 1,
      opcoes: [
        { valor: "CONTRATUAL", rotulo: "Contratual" },
        { valor: "MOBILIARIA", rotulo: "Mobiliária" },
      ] },
  ],
  acoes: [
    { nome: "atualizacao-monetaria", rotulo: "Registrar atualização monetária",
      acaoDoCenso: "REGISTRAR_ATUALIZACAO_MONETARIA",
      aviso:
        "A correção é a ÚNICA movimentação que nasce aqui, e ela é DESPESA: o ente fica " +
        "mais pobre. Ingresso e amortização são lançados pela receita e pela despesa. " +
        "A competência dá a idempotência — a mesma duas vezes é recusada.",
      campos: [
        { nome: "valor", rotulo: "Valor da correção (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "competencia", rotulo: "Competência (AAAA-MM)", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "2026-02" },
        { nome: "diaMovimento", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 4 },
      ] },
  ],
  classesDeConta: ["2"],
  permissoes: { criar: "CADASTRAR_DIVIDA", anexar: "ANEXAR_ARQUIVO" },
  abas: [...ABAS_COMPLETAS],
  donoDoAnexo: "dividaId",
  cadastroDeCamposAdicionais: "DIVIDA_FUNDADA",
  relacionados: [
    {
      rotulo: "Empenhos de amortização (grupo 6)",
      href: "/relatorios/gerenciais?divida={id}",
      explicacao:
        "A amortização é despesa orçamentária e vive no M05 — esta tela não a reconta. " +
        "O saldo aqui e o saldo da conta contábil são duas leituras independentes do " +
        "mesmo passivo, e é o teste de integração que as confronta.",
    },
    {
      rotulo: "RGF Anexo 2 — dívida consolidada",
      href: "/relatorios/rgf/anexo2",
      explicacao: "O demonstrativo lê o mesmo saldo por tipo que esta lista mostra.",
    },
  ],
});

export const DIVIDA_ATIVA: DefinicaoDeRecurso = definirRecurso({
  nome: "divida-ativa",
  rotulo: "Dívida ativa",
  rotuloSingular: "Dívida ativa",
  rota: "/divida/ativa",
  descricao:
    "O crédito do ente contra o contribuinte (art. 39 da Lei 4.320/64). A inscrição " +
    "reconhece um ativo; o recebimento é permutativo e entra pela receita, nunca aqui.",
  campos: [
    { nome: "identificador", rotulo: "Identificador", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "DA-2026-000123" },
    { nome: "devedorNome", rotulo: "Devedor", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "devedorDocumento", rotulo: "CPF/CNPJ do devedor", tipo: "cpfCnpj", obrigatorio: true, largura: 1 },
    { nome: "origem", rotulo: "Origem", tipo: "selecao", obrigatorio: true, largura: 2,
      ajuda: "O art. 39, § 2º dá DUAS origens, e só duas. O rol é da lei, não do ente.",
      opcoes: [
        { valor: "TRIBUTARIA", rotulo: "Tributária — tributos e seus acréscimos" },
        { valor: "NAO_TRIBUTARIA", rotulo: "Não tributária — multas, aluguéis, ressarcimentos, alcances" },
      ] },
    { nome: "contaContabilId", rotulo: "Conta do ativo", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
  ],
  colunas: [
    { nome: "identificador", cabecalho: "Identificador", tipo: "link", ordenavel: true },
    { nome: "devedorNome", cabecalho: "Devedor", tipo: "texto" },
    { nome: "origem", cabecalho: "Origem", tipo: "texto" },
    { nome: "inscrito", cabecalho: "Inscrito + atualizado", tipo: "dinheiro", somavel: true },
    { nome: "baixado", cabecalho: "Recebido + cancelado", tipo: "dinheiro", somavel: true },
    { nome: "saldo", cabecalho: "Saldo a receber", tipo: "dinheiro", somavel: true },
  ],
  filtros: [
    { nome: "q", rotulo: "Identificador ou devedor", tipo: "texto", largura: 2 },
    { nome: "origem", rotulo: "Origem", tipo: "selecao", largura: 1,
      opcoes: [
        { valor: "TRIBUTARIA", rotulo: "Tributária" },
        { valor: "NAO_TRIBUTARIA", rotulo: "Não tributária" },
      ] },
  ],
  acoes: [
    { nome: "inscrever", rotulo: "Inscrever em dívida ativa", acaoDoCenso: "INSCREVER_DIVIDA_ATIVA",
      aviso:
        "A inscrição RECONHECE um crédito que o ente ainda não tinha no ativo — o " +
        "patrimônio cresce. Se o crédito já foi reconhecido antes (fato gerador), a " +
        "inscrição é RECLASSIFICAÇÃO e não cria riqueza nova; essa variante ainda não " +
        "tem tela e só existe pelo caso de uso.",
      campos: [
        { nome: "valor", rotulo: "Valor inscrito (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "diaMovimento", rotulo: "Data da inscrição", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 4 },
      ] },
    { nome: "atualizar", rotulo: "Atualizar (juros, multa, correção)", acaoDoCenso: "ATUALIZAR_DIVIDA_ATIVA",
      aviso: "A competência dá a idempotência: a mesma duas vezes é recusada, e o estorno a libera.",
      campos: [
        { nome: "valor", rotulo: "Valor do acréscimo (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "competencia", rotulo: "Competência (AAAA-MM)", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "2026-02" },
        { nome: "diaMovimento", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 4 },
      ] },
    { nome: "cancelar", rotulo: "Cancelar (prescrição, remissão, decisão)", acaoDoCenso: "CANCELAR_DIVIDA_ATIVA",
      irreversivel: true,
      aviso:
        "O cancelamento MATA o crédito e a perda é despesa. Ele não é o recebimento: " +
        "quem recebe é a receita, pela guia de arrecadação, e ali o fato é permutativo.",
      campos: [
        { nome: "valor", rotulo: "Valor cancelado (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "diaMovimento", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 4 },
      ] },
  ],
  classesDeConta: ["1"],
  permissoes: { criar: "CADASTRAR_DIVIDA_ATIVA", anexar: "ANEXAR_ARQUIVO" },
  abas: [...ABAS_COMPLETAS],
  donoDoAnexo: "dividaAtivaId",
  cadastroDeCamposAdicionais: "DIVIDA_ATIVA",
  relacionados: [
    {
      rotulo: "Arrecadações que quitaram dívida ativa",
      href: "/receita/arrecadacoes",
      explicacao:
        "O recebimento é RECEITA ORÇAMENTÁRIA e mora no M04 — reconhecê-lo aqui contaria " +
        "a mesma receita duas vezes, porque a VPA já foi reconhecida na inscrição.",
    },
  ],
});

export const OBRAS: DefinicaoDeRecurso = definirRecurso({
  nome: "obras",
  rotulo: "Obras e serviços de engenharia",
  rotuloSingular: "Obra",
  rota: "/licitacoes/obras",
  descricao:
    "O cadastro de obras da IN/INSS/DC 100/2003 e as medições que autorizam a liquidação. " +
    "Quem mede não aprova, o período de uma medição não se sobrepõe ao de outra, e sem " +
    "medição aprovada a liquidação da obra é recusada inteira.",
  campos: [
    { nome: "identificador", rotulo: "Identificador", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "OB-2026-001" },
    { nome: "descricao", rotulo: "Descrição", tipo: "textoLongo", obrigatorio: true, largura: 3 },
    { nome: "tipoObraServico", rotulo: "Tipo (IN/INSS/DC 100/2003)", tipo: "selecao", obrigatorio: true, largura: 2,
      ajuda: "O rol é FECHADO — é norma, não catálogo do ente.",
      opcoes: [...TIPOS_DE_OBRA_OPCOES] },
    { nome: "cei", rotulo: "CEI (12 dígitos)", tipo: "texto", largura: 1,
      ajuda: "Pode ficar vazio: a obra existe antes da matrícula, e o CEI leva dias para sair na Receita. Um CEI inventado num arquivo da Receita é pior que um campo vazio." },
    { nome: "orgaoId", rotulo: "Órgão responsável", tipo: "selecao", largura: 2, opcoes: [] },
  ],
  colunas: [
    { nome: "identificador", cabecalho: "Identificador", tipo: "link", ordenavel: true },
    { nome: "descricao", cabecalho: "Descrição", tipo: "texto" },
    { nome: "tipo", cabecalho: "Tipo", tipo: "texto" },
    { nome: "medicoes", cabecalho: "Medições", tipo: "inteiro", ordenavel: true },
    { nome: "medido", cabecalho: "Medido", tipo: "dinheiro", somavel: true },
    { nome: "aprovado", cabecalho: "Aprovado", tipo: "dinheiro", somavel: true },
    { nome: "estado", cabecalho: "Situação", tipo: "situacao" },
  ],
  filtros: [
    { nome: "q", rotulo: "Identificador ou descrição", tipo: "texto", largura: 2 },
    { nome: "tipoObraServico", rotulo: "Tipo", tipo: "selecao", largura: 2, opcoes: [...TIPOS_DE_OBRA_OPCOES] },
  ],
  acoes: [
    { nome: "medir", rotulo: "Registrar medição", acaoDoCenso: "REGISTRAR_MEDICAO_DE_OBRA",
      aviso:
        "O período não pode se sobrepor ao de outra medição do mesmo contrato, e a borda é " +
        "INCLUSIVA: acabar em X e começar em X já se sobrepõe. O acumulado não passa do " +
        "valor do contrato.",
      campos: [
        { nome: "contratoId", rotulo: "Contrato", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "numero", rotulo: "Número da medição", tipo: "inteiro", obrigatorio: true, largura: 1, minimo: 1, maximo: 999 },
        { nome: "valorMedido", rotulo: "Valor medido (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "diaInicio", rotulo: "Período — de", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "diaFim", rotulo: "Período — até", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "responsavelTecnico", rotulo: "Responsável técnico", tipo: "texto", obrigatorio: true, largura: 2 },
        // ⚠️ OBRIGATÓRIO, e o domínio é que manda: "sem ele, o atesto é de alguém que
        // pode não poder atestar" (modules/m11-licitacoes/medicoes.ts). O descritor o
        // trouxe opcional na primeira escrita, e o typecheck derrubou — um formulário
        // opcional aqui montaria um campo que o caso de uso recusaria depois de o
        // operador preencher a tela inteira.
        { nome: "registroProfissional", rotulo: "CREA/CAU do responsável", tipo: "texto", obrigatorio: true, largura: 1 },
      ] },
    { nome: "aprovar", rotulo: "Aprovar medição", acaoDoCenso: "APROVAR_MEDICAO_DE_OBRA",
      aviso:
        "QUEM MEDIU NÃO APROVA — a segregação é conferida no servidor, e aprovar duas " +
        "vezes é recusado porque a segunda apagaria quem aprovou primeiro.",
      campos: [
        { nome: "medicaoId", rotulo: "Medição", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "diaAprovacao", rotulo: "Data da aprovação", tipo: "data", obrigatorio: true, largura: 1 },
      ] },
  ],
  permissoes: { criar: "CADASTRAR_OBRA", anexar: "ANEXAR_ARQUIVO" },
  abas: [...ABAS_COMPLETAS],
  donoDoAnexo: "obraId",
  cadastroDeCamposAdicionais: "OBRA",
  relacionados: [
    {
      rotulo: "Empenhos de investimento desta obra",
      href: "/relatorios/gerenciais?obra={id}",
      explicacao:
        "O elemento 51 EXIGE obra — empenhar investimento sem apontá-la é recusado " +
        "nomeando. A execução continua sendo do M05.",
    },
  ],
});

/** Todos os recursos do molde — a lista que o teste do censo e a navegação consomem. */
export const PROVISOES: DefinicaoDeRecurso = definirRecurso({
  nome: "provisoes",
  rotulo: "Provisões",
  rotuloSingular: "Provisão",
  rota: "/patrimonio/provisoes",
  descricao:
    "O que o ente reconhece que vai dever antes de dever — provisão matemática " +
    "previdenciária, riscos cíveis e trabalhistas (NBC TSP 03). Constituir é VPD: o " +
    "patrimônio diminui hoje por uma obrigação que vence depois.",
  campos: [
    { nome: "identificador", rotulo: "Identificador", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "PROV-2026-001" },
    { nome: "descricao", rotulo: "Descrição", tipo: "textoLongo", obrigatorio: true, largura: 3,
      ajuda: "O que esta provisão cobre — o cálculo atuarial, a ação judicial, o risco reconhecido." },
    { nome: "contaContabilId", rotulo: "Conta do passivo", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
  ],
  colunas: [
    { nome: "identificador", cabecalho: "Identificador", tipo: "link", ordenavel: true },
    { nome: "descricao", cabecalho: "Descrição", tipo: "texto" },
    { nome: "constituido", cabecalho: "Constituído", tipo: "dinheiro", somavel: true },
    { nome: "revertido", cabecalho: "Revertido", tipo: "dinheiro", somavel: true },
    { nome: "saldo", cabecalho: "Saldo provisionado", tipo: "dinheiro", somavel: true },
  ],
  filtros: [{ nome: "q", rotulo: "Identificador ou descrição", tipo: "texto", largura: 2 }],
  acoes: [
    { nome: "constituir", rotulo: "Constituir provisão", acaoDoCenso: "CONSTITUIR_PROVISAO",
      aviso:
        "Constituir é VARIAÇÃO PATRIMONIAL DIMINUTIVA: o ente fica mais pobre hoje por uma " +
        "obrigação que vence depois. Não é despesa orçamentária e não consome dotação.",
      campos: [
        { nome: "valor", rotulo: "Valor (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "diaMovimento", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 4 },
      ] },
    { nome: "atualizar", rotulo: "Atualizar provisão", acaoDoCenso: "ATUALIZAR_PROVISAO",
      aviso:
        "A atualização é por COMPETÊNCIA, e é ela que dá a idempotência: a mesma " +
        "competência duas vezes é recusada, e não somada.",
      campos: [
        { nome: "valor", rotulo: "Valor da atualização (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "competencia", rotulo: "Competência (AAAA-MM)", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "2026-03" },
        { nome: "diaMovimento", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 4 },
      ] },
    { nome: "reverter", rotulo: "Reverter provisão", acaoDoCenso: "REVERTER_PROVISAO",
      aviso:
        "Reverter é o contrário de constituir: o risco não se concretizou. O servidor " +
        "RECUSA reverter mais do que o saldo — a provisão não fica negativa.",
      campos: [
        { nome: "valor", rotulo: "Valor revertido (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "diaMovimento", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 4 },
      ] },
  ],
  classesDeConta: ["2"],
  permissoes: { criar: "CADASTRAR_PROVISAO" },
  // ⚠️ SEM AS ABAS DE ANEXO E DE CAMPOS ADICIONAIS, e é decisão declarada: as duas exigem
  // FK própria (`Anexo.provisaoId`, `ValorDeCampoAdicional.provisaoId`) e um valor no rol
  // fechado do M25. Declará-las sem isso produziria uma aba "Anexos" que perde o arquivo —
  // e aba vazia é pior que aba ausente. Pendência PROVISAO-ANEXOS-E-CAMPOS.
  abas: ["dados", "historico", "relacionados"],
  relacionados: [
    {
      rotulo: "RGF Anexo 2 — dívida consolidada",
      href: "/relatorios/rgf/anexo2",
      explicacao:
        "A provisão matemática previdenciária entra na dívida consolidada do RPPS. " +
        "Quem soma é o M12 — esta tela não reconta.",
    },
  ],
});

export const RECURSOS_DO_MOLDE: readonly DefinicaoDeRecurso[] = [
  CONVENIOS,
  PRECATORIOS,
  CONSORCIOS,
  AUDITORIAS,
  DIVIDA_FUNDADA,
  DIVIDA_ATIVA,
  OBRAS,
  PROVISOES,
  // ⚠️ ENT06 — as três seções que o ENT05 modelou e deixou sem tela. Entram na MESMA
  // lista porque é dela que saem a busca global (`lib/portas/busca-global.ts`) e o censo
  // do molde: um cadastro que entrasse por fora ficaria invisível na busca e sem a
  // verificação de que suas ações existem no censo do M16.
  ...RECURSOS_DO_ALMOXARIFADO,
  // ⚠️ ENT06 — os cadastros de apoio da GESTÃO DO BEM (TR 5.19). Entram pela mesma lista
  // pelo mesmo motivo do almoxarifado: é dela que saem a busca global e o censo do molde.
  // Um cadastro que entrasse por fora ficaria invisível na busca e sem a verificação de que
  // suas ações existem no censo do M16.
  ...RECURSOS_DA_GESTAO_DO_BEM,
];
