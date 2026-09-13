import { definirRecurso, type DefinicaoDeRecurso } from "../../molde/tipos.js";

/**
 * ═══ OS TERMOS PATRIMONIAIS — M10, V3 pacote 2, unidade 5 (TR 5.19.36, 5.19.37) ═══
 *
 * Emitir o termo REGISTRA o movimento (responsabilidade ou baixa) na mesma transação — o
 * serviço já fazia isso; o que faltava era a tela e o papel. O termo é IMUTÁVEL: não há
 * ações no detalhe; corrigir é emitir outro. O PDF sai pela rota autenticada, com o mesmo
 * motor e rodapé dos demonstrativos.
 *
 * ⚠️ V4 (§5): a EMISSÃO é congelada na criação (dados, modelo, sha256) — a segunda via é ela; a
 * posição atual é outro PDF; o termo ASSINADO é anexado na aba de anexos, com sha256 conferido
 * na entrega.
 *
 * ⚠️ OS BENS ENTRAM PELO TOMBAMENTO, não por seletor: um termo setorial pode relacionar
 * dezenas de bens, e um `select` múltiplo com o acervo inteiro é o formulário bonito e
 * inútil. A porta resolve os tombamentos e recusa nomeando os que não existem.
 */

export const OPCOES_DE_TIPO_DE_TERMO: readonly { readonly valor: string; readonly rotulo: string }[] = [
  { valor: "RESPONSABILIDADE", rotulo: "Responsabilidade — entrega os bens a um responsável" },
  { valor: "BAIXA", rotulo: "Baixa — os bens saem do acervo" },
];

export const TERMOS_PATRIMONIAIS: DefinicaoDeRecurso = definirRecurso({
  nome: "termos-patrimoniais",
  rotulo: "Termos patrimoniais",
  rotuloSingular: "Termo patrimonial",
  rota: "/patrimonio/termos",
  descricao:
    "O termo de responsabilidade (individual, setorial ou por responsável) e o termo de baixa. " +
    "Emitir registra o movimento de cada bem na mesma transação; o papel sai em PDF pelo detalhe.",
  campos: [
    { nome: "numero", rotulo: "Número do termo", tipo: "texto", obrigatorio: true, largura: 1, ajuda: "Único. Ex.: TR-2026-0001." },
    { nome: "tipo", rotulo: "Tipo", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: OPCOES_DE_TIPO_DE_TERMO },
    { nome: "data", rotulo: "Data do termo", tipo: "data", obrigatorio: true, largura: 1 },
    {
      nome: "responsavelId", rotulo: "Responsável", tipo: "selecao", largura: 2, opcoes: [],
      ajuda: "Obrigatório no termo de responsabilidade: é em quem o bem recai.",
    },
    { nome: "setorId", rotulo: "Setor", tipo: "selecao", largura: 2, opcoes: [], ajuda: "Para o termo setorial. Em branco: termo do ente." },
    {
      nome: "tombamentos", rotulo: "Tombamentos dos bens", tipo: "texto", obrigatorio: true, largura: 4,
      ajuda: "Separados por vírgula, ponto e vírgula ou espaço. Tombamento inexistente é recusado nomeando.",
    },
  ],
  colunas: [
    { nome: "numero", cabecalho: "Número", tipo: "link", ordenavel: true },
    { nome: "tipo", cabecalho: "Tipo", tipo: "texto" },
    { nome: "responsavel", cabecalho: "Responsável", tipo: "texto" },
    { nome: "setor", cabecalho: "Setor", tipo: "texto" },
    { nome: "data", cabecalho: "Data", tipo: "data", ordenavel: true },
    { nome: "itens", cabecalho: "Bens", tipo: "inteiro" },
  ],
  filtros: [
    { nome: "q", rotulo: "Número ou responsável", tipo: "texto", largura: 2 },
    { nome: "tipo", rotulo: "Tipo", tipo: "selecao", largura: 1, opcoes: OPCOES_DE_TIPO_DE_TERMO.map((o) => ({ valor: o.valor, rotulo: o.rotulo.split(" — ")[0] ?? o.rotulo })) },
  ],
  acoes: [],
  permissoes: { criar: "EMITIR_TERMO_PATRIMONIAL" },
  abas: ["dados", "historico", "anexos", "relacionados"],
  donoDoAnexo: "termoPatrimonialId",
  relacionados: [
    { rotulo: "PDF do termo emitido (segunda via)", href: "/patrimonio/termos/{id}/pdf", explicacao: "O documento como foi emitido: os bens, o valor contábil e a localização de cada um NA EMISSÃO, congelados com o termo. Reimprimir não muda nada." },
    { rotulo: "PDF da posição patrimonial atual", href: "/patrimonio/termos/{id}/pdf?via=atual", explicacao: "Outro documento, com data própria: os mesmos bens como estão hoje. Não é o termo nem uma segunda via dele." },
  ],
});
