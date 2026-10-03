import { definirRecurso, type DefinicaoDeRecurso } from "../../molde/tipos.js";
import { RECURSOS_DO_ALMOXARIFADO } from "./almoxarifado.js";
import { RECURSOS_DA_GESTAO_DO_BEM } from "./gestao-do-bem.js";
import { RECURSOS_DO_ACERVO } from "./acervo.js";
import { RECURSOS_DOS_ROTEIROS } from "./roteiros.js";
import { ESTRUTURA_DO_PPA, LEIS_DE_DIRETRIZES, PLANOS_PLURIANUAIS, PROGRAMAS_DO_PPA } from "./plurianual.js";
import { CONTRATOS, PROCESSOS_LICITATORIOS } from "./contratacao.js";
import { ORDENS_DE_COMPRA, PESQUISAS_DE_PRECOS, SOLICITACOES_DE_COMPRA } from "./compras.js";
import { DOCUMENTOS_FISCAIS } from "./documentos-fiscais.js";
import { RECURSOS_DO_PESSOAL } from "./pessoal.js";
import { RECURSOS_DA_FOLHA } from "./folha.js";
import { EMENTARIO_DA_RECEITA } from "./ementario-receita.js";
import { CAMPANHAS_PUBLICITARIAS } from "./campanhas-publicitarias.js";
import { LEIS_ORCAMENTARIAS } from "./leis-orcamentarias.js";

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
    "Transferências voluntárias em que o ente é concedente ou convenente (LRF, art. 25). " +
    "O saldo a liberar, o valor pendente de prestação de contas e o valor glosado são " +
    "controlados separadamente, conforme os movimentos registrados.",
  campos: [
    { nome: "identificador", rotulo: "Número do convênio", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "CV-2026-001" },
    { nome: "papelDoEnte", rotulo: "Papel do ente", tipo: "selecao", obrigatorio: true, largura: 1,
      ajuda: "O concedente transfere os recursos e recebe a prestação de contas; o convenente recebe os recursos e presta contas.",
      opcoes: [
        { valor: "CONCEDENTE", rotulo: "Concedente (o ente transfere)" },
        { valor: "CONVENENTE", rotulo: "Convenente (o ente recebe)" },
      ] },
    { nome: "objeto", rotulo: "Objeto", tipo: "textoLongo", obrigatorio: true, largura: 4 },
    { nome: "partidaNome", rotulo: "Outra parte", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "partidaDocumento", rotulo: "CPF/CNPJ da outra parte", tipo: "cpfCnpj", obrigatorio: true, largura: 2 },
    { nome: "leiAutorizativa", rotulo: "Lei autorizativa", tipo: "texto", obrigatorio: true, largura: 2,
      ajuda: "LRF, art. 25: a transferência voluntária exige autorização na lei orçamentária." },
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
      aviso: "A liberação reduz o saldo do termo e, quando o ente é concedente, exige empenho.",
      campos: [
        { nome: "parcela", rotulo: "Parcela nº", tipo: "inteiro", obrigatorio: true, largura: 1, minimo: 1 },
        { nome: "valor", rotulo: "Valor (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "diaMovimento", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "competencia", rotulo: "Competência (AAAA-MM)", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "2026-02" },
        { nome: "empenhoId", rotulo: "Empenho", tipo: "selecao", largura: 2, opcoes: [] },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 2 },
      ] },
    { nome: "aprovar-prestacao", rotulo: "Aprovar prestação de contas", acaoDoCenso: "APROVAR_PRESTACAO_DE_CONTAS",
      aviso: "A aprovação dá quitação ao valor prestado e é registrada separadamente da liberação, por segregação de funções.",
      campos: [
        { nome: "valor", rotulo: "Valor prestado (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "diaMovimento", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "competencia", rotulo: "Competência (AAAA-MM)", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "2026-04" },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 3 },
      ] },
    { nome: "glosar", rotulo: "Glosar", acaoDoCenso: "GLOSAR_CONVENIO",
      aviso: "A glosa registra o valor a ser devolvido; a devolução em si é registrada à parte.",
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
        "Empenhos do convênio, consultados diretamente na execução da despesa.",
    },
  ],
});

export const PRECATORIOS: DefinicaoDeRecurso = definirRecurso({
  nome: "precatorios",
  rotulo: "Precatórios judiciais",
  rotuloSingular: "Precatório",
  rota: "/divida/precatorios",
  descricao:
    "Requisitórios judiciais na ordem do art. 100 da Constituição: créditos alimentares antes dos " +
    "comuns, a preferência do § 2º entre os alimentares e, em seguida, a data de apresentação.",
  campos: [
    { nome: "numeroProcesso", rotulo: "Processo judicial", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "tribunal", rotulo: "Tribunal", tipo: "texto", obrigatorio: true, largura: 1 },
    { nome: "oficioRequisitorio", rotulo: "Ofício requisitório", tipo: "texto", largura: 1 },
    { nome: "beneficiarioNome", rotulo: "Beneficiário", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "beneficiarioDocumento", rotulo: "CPF/CNPJ", tipo: "cpfCnpj", obrigatorio: true, largura: 2 },
    { nome: "natureza", rotulo: "Natureza", tipo: "selecao", obrigatorio: true, largura: 1,
      ajuda: "CF, art. 100, § 1º: o crédito alimentar é pago antes do comum.",
      opcoes: [
        { valor: "ALIMENTAR", rotulo: "Alimentar" },
        { valor: "COMUM", rotulo: "Comum" },
      ] },
    { nome: "preferencia", rotulo: "Preferência (§2º)", tipo: "selecao", largura: 1,
      ajuda: "A preferência vale apenas entre créditos alimentares.",
      opcoes: [
        { valor: "NENHUMA", rotulo: "Nenhuma" },
        { valor: "IDOSO", rotulo: "Idoso" },
        { valor: "DOENCA_GRAVE", rotulo: "Doença grave" },
        { valor: "DEFICIENCIA", rotulo: "Pessoa com deficiência" },
      ] },
    { nome: "diaApresentacao", rotulo: "Data de apresentação", tipo: "data", obrigatorio: true, largura: 1,
      ajuda: "Define a posição na ordem de pagamento, independentemente da data de cadastro." },
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
      aviso: "A inscrição reconhece o passivo pelo valor requisitado e é feita uma única vez.",
      campos: [
        { nome: "valor", rotulo: "Valor (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "diaMovimento", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 2 },
      ] },
    { nome: "atualizar", rotulo: "Atualizar (juros e correção)", acaoDoCenso: "ATUALIZAR_PRECATORIO",
      aviso: "A atualização é registrada uma vez por competência.",
      campos: [
        { nome: "valor", rotulo: "Valor (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "competencia", rotulo: "Competência (AAAA-MM)", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "2026-02" },
        { nome: "diaMovimento", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 1 },
      ] },
    { nome: "cancelar", rotulo: "Cancelar por decisão judicial", acaoDoCenso: "CANCELAR_PRECATORIO",
      irreversivel: true,
      aviso: "O cancelamento extingue o passivo sem saída de caixa. Eventual correção exige novo registro.",
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
      explicacao: "Empenhos do precatório, consultados diretamente na execução da despesa.",
    },
  ],
});

export const CONSORCIOS: DefinicaoDeRecurso = definirRecurso({
  nome: "consorcios",
  rotulo: "Consórcios públicos",
  rotuloSingular: "Consórcio",
  rota: "/transferencias/consorcios",
  descricao:
    "Consórcios públicos da Lei 11.107/2005. O repasse depende do contrato de rateio do " +
    "exercício (art. 8º), limitado ao valor do contrato original somado aos aditivos.",
  campos: [
    { nome: "identificador", rotulo: "Identificador", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "CIS-2026-001" },
    { nome: "denominacao", rotulo: "Denominação", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "cnpj", rotulo: "CNPJ", tipo: "cpfCnpj", obrigatorio: true, largura: 1 },
    { nome: "areaDeAtuacao", rotulo: "Área de atuação", tipo: "texto", obrigatorio: true, largura: 1 },
    { nome: "protocoloDeIntencoes", rotulo: "Protocolo de intenções", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "leiRatificadora", rotulo: "Lei ratificadora", tipo: "texto", obrigatorio: true, largura: 1,
      ajuda: "Art. 5º: a participação do ente depende da lei que ratifica o protocolo de intenções." },
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
      aviso: "O contrato de rateio é anual. O aditivo é somado ao contrato original, sem substituí-lo.",
      campos: [
        { nome: "exercicio", rotulo: "Exercício", tipo: "inteiro", obrigatorio: true, largura: 1, minimo: 2000, maximo: 2100 },
        { nome: "valorDoEnte", rotulo: "Cota do ente (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "diaAssinatura", rotulo: "Assinatura", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "aditivoDeId", rotulo: "Aditivo ao contrato", tipo: "selecao", largura: 1, opcoes: [] },
      ] },
    { nome: "repassar", rotulo: "Repassar ao consórcio", acaoDoCenso: "REPASSAR_AO_CONSORCIO",
      aviso: "Informe o exercício da cota: um repasse feito em janeiro pode se referir ao ano anterior.",
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
      explicacao: "Empenhos do consórcio, consultados diretamente na execução da despesa.",
    },
  ],
});

export const AUDITORIAS: DefinicaoDeRecurso = definirRecurso({
  nome: "auditorias",
  rotulo: "Auditorias internas",
  rotuloSingular: "Auditoria",
  rota: "/controle-interno/auditorias",
  descricao:
    "Auditorias do controle interno (art. 74 da Constituição): roteiro com base legal, achados " +
    "com providência e prazo e relatório circunstanciado para assinatura.",
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
      aviso: "Informe a providência e o prazo; sem eles, o achado é registrado apenas como observação.",
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
      aviso: "Depois de encerrada, a auditoria só recebe novos registros se for reaberta, com motivo. Todo o roteiro deve estar respondido.",
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
        "Operações registradas no sistema, com usuário, ação e data.",
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
export const TIPOS_DE_OBRA_OPCOES = [
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
    "Dívida consolidada do ente (LRF, art. 29, I). O ingresso é registrado como receita de operação " +
    "de crédito, e a amortização, como despesa do grupo 6. Nesta tela é registrada a atualização " +
    "monetária, que reduz o patrimônio.",
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
      ajuda: "LRF, art. 32: a operação de crédito exige autorização legislativa." },
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
        "A atualização monetária é registrada como variação patrimonial diminutiva. Ingresso e " +
        "amortização são registrados na receita e na despesa. A atualização é feita uma vez por competência.",
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
        "Empenhos de amortização da dívida, consultados na execução da despesa.",
    },
    {
      rotulo: "RGF Anexo 2 — dívida consolidada",
      href: "/relatorios/rgf/anexo2",
      explicacao: "Demonstrativo com o saldo da dívida por tipo, o mesmo apresentado nesta lista.",
    },
  ],
});

export const DIVIDA_ATIVA: DefinicaoDeRecurso = definirRecurso({
  nome: "divida-ativa",
  rotulo: "Dívida ativa",
  rotuloSingular: "Dívida ativa",
  rota: "/divida/ativa",
  descricao:
    "Créditos do ente inscritos em dívida ativa (art. 39 da Lei 4.320/1964). A inscrição reconhece " +
    "um ativo; o recebimento é registrado na arrecadação da receita.",
  campos: [
    { nome: "identificador", rotulo: "Identificador", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "DA-2026-000123" },
    { nome: "devedorNome", rotulo: "Devedor", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "devedorDocumento", rotulo: "CPF/CNPJ do devedor", tipo: "cpfCnpj", obrigatorio: true, largura: 1 },
    { nome: "origem", rotulo: "Origem", tipo: "selecao", obrigatorio: true, largura: 2,
      ajuda: "Origens previstas no art. 39, § 2º, da Lei 4.320/1964.",
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
        "A inscrição reconhece no ativo um crédito ainda não registrado, com aumento do " +
        "patrimônio. Créditos já reconhecidos pelo fato gerador são tratados como " +
        "reclassificação, que não é registrada nesta tela.",
      campos: [
        { nome: "valor", rotulo: "Valor inscrito (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "diaMovimento", rotulo: "Data da inscrição", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 4 },
      ] },
    { nome: "reclassificar", rotulo: "Inscrever crédito já lançado", acaoDoCenso: "INSCREVER_DIVIDA_ATIVA",
      aviso:
        "Para o crédito que já foi lançado (como o IPTU constituído) e não foi pago no vencimento: o valor sai do " +
        "crédito a receber e entra na dívida ativa, sem reconhecer a receita de novo.",
      campos: [
        {
          nome: "reconhecimentoId", rotulo: "Crédito lançado", tipo: "referencia", catalogo: "creditos-a-receber",
          obrigatorio: true, largura: 4,
          ajuda: "Créditos lançados com saldo ainda não arrecadado.",
        },
        { nome: "valor", rotulo: "Valor inscrito (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "diaMovimento", rotulo: "Data da inscrição", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 4 },
      ] },
    { nome: "atualizar", rotulo: "Atualizar (juros, multa, correção)", acaoDoCenso: "ATUALIZAR_DIVIDA_ATIVA",
      aviso: "A atualização é registrada uma vez por competência; após estorno, pode ser registrada novamente.",
      campos: [
        { nome: "valor", rotulo: "Valor do acréscimo (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "competencia", rotulo: "Competência (AAAA-MM)", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "2026-02" },
        { nome: "diaMovimento", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 4 },
      ] },
    { nome: "cancelar", rotulo: "Cancelar (prescrição, remissão, decisão)", acaoDoCenso: "CANCELAR_DIVIDA_ATIVA",
      irreversivel: true,
      aviso:
        "O cancelamento extingue o crédito e registra a perda como variação patrimonial " +
        "diminutiva. O recebimento é registrado na arrecadação da receita, pela guia.",
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
        "Recebimentos de dívida ativa, registrados como receita orçamentária na arrecadação.",
    },
  ],
});

export const OBRAS: DefinicaoDeRecurso = definirRecurso({
  nome: "obras",
  rotulo: "Obras e serviços de engenharia",
  rotuloSingular: "Obra",
  rota: "/licitacoes/obras",
  descricao:
    "Cadastro de obras (IN/INSS/DC 100/2003) e medições que autorizam a liquidação. A medição é " +
    "aprovada por pessoa diferente de quem a registrou, os períodos não podem se sobrepor, e a " +
    "liquidação da obra exige medição aprovada.",
  campos: [
    { nome: "identificador", rotulo: "Identificador", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "OB-2026-001" },
    { nome: "descricao", rotulo: "Descrição", tipo: "textoLongo", obrigatorio: true, largura: 3 },
    { nome: "tipoObraServico", rotulo: "Tipo (IN/INSS/DC 100/2003)", tipo: "selecao", obrigatorio: true, largura: 2,
      ajuda: "Tipos definidos na IN/INSS/DC 100/2003.",
      opcoes: [...TIPOS_DE_OBRA_OPCOES] },
    { nome: "cei", rotulo: "CEI (12 dígitos)", tipo: "texto", largura: 1,
      ajuda: "Pode ficar em branco até a emissão da matrícula pela Receita Federal." },
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
        "O período não pode se sobrepor ao de outra medição do mesmo contrato, inclusive nas " +
        "datas de início e fim. O valor acumulado não pode superar o valor do contrato.",
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
        "A aprovação deve ser feita por pessoa diferente de quem registrou a medição, " +
        "uma única vez.",
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
        "Empenhos no elemento 51 (obras e instalações), que exigem a indicação da obra.",
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
    "Provisões para obrigações futuras do ente: provisão matemática previdenciária e riscos " +
    "cíveis e trabalhistas (NBC TSP 03). A constituição é registrada como variação patrimonial " +
    "diminutiva.",
  campos: [
    { nome: "identificador", rotulo: "Identificador", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "PROV-2026-001" },
    { nome: "descricao", rotulo: "Descrição", tipo: "textoLongo", obrigatorio: true, largura: 3,
      ajuda: "Objeto da provisão: cálculo atuarial, ação judicial ou risco reconhecido." },
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
        "A constituição é registrada como variação patrimonial diminutiva, por obrigação " +
        "com vencimento futuro. Não é despesa orçamentária e não consome dotação.",
      campos: [
        { nome: "valor", rotulo: "Valor (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "diaMovimento", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 4 },
      ] },
    { nome: "atualizar", rotulo: "Atualizar provisão", acaoDoCenso: "ATUALIZAR_PROVISAO",
      aviso:
        "A atualização é registrada uma vez por competência.",
      campos: [
        { nome: "valor", rotulo: "Valor da atualização (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "competencia", rotulo: "Competência (AAAA-MM)", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "2026-03" },
        { nome: "diaMovimento", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 4 },
      ] },
    { nome: "reverter", rotulo: "Reverter provisão", acaoDoCenso: "REVERTER_PROVISAO",
      aviso:
        "A reversão registra que o risco não se concretizou. O valor revertido não pode " +
        "superar o saldo da provisão.",
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
        "A provisão matemática previdenciária integra a dívida consolidada do RPPS.",
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
  // ⚠️ ENT07 — o acervo. A classe e o bem entram pela mesma lista que tudo o mais: é dela que
  // saem a busca global e a verificação de que as ações declaradas existem no censo do M16.
  ...RECURSOS_DO_ACERVO,
  // ⚠️ ENT11 — os roteiros contábeis do patrimônio. Entram pela mesma lista pelo mesmo
  // motivo de todos os outros: é dela que saem a busca global e a verificação de que as
  // ações declaradas existem no censo do M16. Um cadastro que entrasse por fora ficaria
  // invisível na busca e sem a amarração da permissão.
  ...RECURSOS_DOS_ROTEIROS,
  // ⚠️ V4 §8 (M02b) — o planejamento plurianual. Pela mesma lista, pelo mesmo motivo: busca
  // global e a amarração das dez ações ao censo do M16.
  PLANOS_PLURIANUAIS,
  PROGRAMAS_DO_PPA,
  ESTRUTURA_DO_PPA,
  LEIS_DE_DIRETRIZES,
  // ⚠️ V4 §8 (M11) — o processo licitatório e o contrato. Pela mesma lista, pelo mesmo motivo.
  PROCESSOS_LICITATORIOS,
  CONTRATOS,
  // ⚠️ V4 §8 (M11) — as compras: a criação é de ilhas com itens; a lista e as ações são do molde.
  SOLICITACOES_DE_COMPRA,
  PESQUISAS_DE_PRECOS,
  ORDENS_DE_COMPRA,
  DOCUMENTOS_FISCAIS,
  // V6 P2 — M32 pessoal (servidores, cargos, lotações)
  ...RECURSOS_DO_PESSOAL,
  // V6 P2.3 — M33 folha (folhas, rubricas, lançamentos, tabelas do ente)
  ...RECURSOS_DA_FOLHA,
  // V22 — M04 o ementário da receita. Pela mesma lista: busca global e amarração ao censo do M16.
  EMENTARIO_DA_RECEITA,
  // V22 — M05 as campanhas publicitárias (o vínculo da nota de empenho). Pela mesma lista.
  CAMPANHAS_PUBLICITARIAS,
  // V22 — M02b a Lei Orçamentária Anual (projeto, lei que a aprovou e anexos). Pela mesma lista.
  LEIS_ORCAMENTARIAS,
];
