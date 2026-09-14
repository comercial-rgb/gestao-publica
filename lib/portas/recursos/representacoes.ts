import { definirRecurso, type DefinicaoDeRecurso } from "../../molde/tipos";

/**
 * ═══ AS REPRESENTAÇÕES DE PESSOA (M19, V6.2 P3) ═══
 *
 * Quem age em nome de outra pessoa (em regra, a empresa fornecedora) pela carta de serviços: a CONTA
 * de uma pessoa física (vinculada ao cadastro pelo CPF), a pessoa representada, o documento que
 * fundamenta e a vigência. Revogar é fato com data de efeito: a partir dela a conta não protocola,
 * não acompanha e não baixa documento em nome da representada.
 *
 * ⚠️ CNPJ DIGITADO NÃO AUTENTICA NINGUÉM. O representante é escolhido entre as contas do sistema; o
 * serviço recusa conta sem pessoa vinculada, pessoa jurídica como representante e representação de si.
 */
export const REPRESENTACOES: DefinicaoDeRecurso = definirRecurso({
  nome: "representacoes",
  rotulo: "Representações",
  rotuloSingular: "Representação",
  rota: "/cadastros/representacoes",
  descricao:
    "Quem age em nome de uma pessoa do cadastro pela carta de serviços: a conta de uma pessoa física, o documento que " +
    "fundamenta e a vigência. Revogada, a conta deixa de protocolar, acompanhar e baixar documentos da representada.",
  campos: [
    { nome: "representadaId", rotulo: "Pessoa representada", tipo: "referencia", catalogo: "pessoas", obrigatorio: true, largura: 2 },
    { nome: "representanteUsuario", rotulo: "Conta do representante (pessoa física vinculada)", tipo: "referencia", catalogo: "contas-com-pessoa-fisica", obrigatorio: true, largura: 2 },
    { nome: "fundamento", rotulo: "Documento que fundamenta (procuração, contrato social, ata)", tipo: "texto", obrigatorio: true, largura: 4 },
    { nome: "vigenciaInicio", rotulo: "Início da vigência", tipo: "data", obrigatorio: true, largura: 1 },
    { nome: "vigenciaFim", rotulo: "Fim da vigência (vazio = sem termo)", tipo: "data", largura: 1 },
  ],
  colunas: [
    { nome: "representada", cabecalho: "Representada", tipo: "link" },
    { nome: "representante", cabecalho: "Representante", tipo: "texto" },
    { nome: "vigencia", cabecalho: "Vigência", tipo: "texto" },
    { nome: "situacao", cabecalho: "Hoje", tipo: "texto" },
  ],
  filtros: [{ nome: "q", rotulo: "Nome, documento ou conta", tipo: "texto", largura: 2 }],
  acoes: [
    {
      nome: "revogar", rotulo: "Revogar a representação", acaoDoCenso: "REGISTRAR_REPRESENTACAO", irreversivel: true,
      aviso: "A partir do dia do efeito, a conta não age nem acompanha em nome da representada. O que já foi protocolado continua registrado com a representação usada.",
      campos: [
        { nome: "dataEfeito", rotulo: "Data de efeito", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 3 },
      ],
    },
  ],
  acoesPorEstado: true,
  permissoes: { criar: "REGISTRAR_REPRESENTACAO" },
  abas: ["dados", "historico"],
});
