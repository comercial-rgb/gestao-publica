import { Decimal } from "decimal.js";
import type { Tx } from "../m16-travamento/autorizacao.js";
import {
  descreverSituacao,
  inicioDaContagem,
  setorAtual,
  situacaoDoProcesso,
} from "../m21-protocolo/dominio.js";
import type { Valor } from "./gramatica.js";

/**
 * M26 — AS FONTES DE DADOS. Consultas escritas À MÃO, uma por valor do enum.
 *
 * ═══ ⚠️ É AQUI QUE "SEM SQL LIVRE DO USUÁRIO" DEIXA DE SER PROMESSA ═══
 * O usuário escolhe a FONTE e escreve expressões sobre as colunas que ela PUBLICA. Ele
 * nunca escreve a consulta, nunca nomeia tabela e nunca escolhe junção. Cada função
 * abaixo é código de produção como qualquer outro, revisável, com o `where` fixo.
 *
 * A alternativa — montar SQL a partir de um "construtor de consultas" — parece mais
 * poderosa e é a mesma coisa que dar SQL ao usuário com passos a mais: basta um campo
 * que escape para o dia em que alguém peça uma junção que o construtor não previu.
 *
 * ═══ ⚠️ E A FONTE JÁ NASCE RECORTADA PELA UNIDADE GESTORA ═══
 * Nenhuma expressão consegue ampliar o recorte: ele está no `where`, antes de a
 * gramática existir.
 */

export interface ColunaPublicada {
  readonly nome: string;
  readonly rotulo: string;
  readonly tipo: "TEXTO" | "NUMERO" | "DATA" | "BOOLEANO";
}

export type LinhaDaFonte = Readonly<Record<string, Valor>>;

/** O CATÁLOGO DE CAMPOS — é o que a tela do designer mostra, e o que a validação usa. */
export const COLUNAS_DA_FONTE: Readonly<Record<string, readonly ColunaPublicada[]>> = {
  PROCESSOS: [
    { nome: "numero", rotulo: "Número", tipo: "NUMERO" },
    { nome: "ano", rotulo: "Exercício", tipo: "NUMERO" },
    { nome: "assunto", rotulo: "Assunto", tipo: "TEXTO" },
    { nome: "subassunto", rotulo: "Subassunto", tipo: "TEXTO" },
    { nome: "situacao", rotulo: "Situação", tipo: "TEXTO" },
    { nome: "prioridade", rotulo: "Prioridade", tipo: "TEXTO" },
    { nome: "finalidade", rotulo: "Finalidade", tipo: "TEXTO" },
    { nome: "sigiloso", rotulo: "Sigiloso", tipo: "BOOLEANO" },
    { nome: "requerente", rotulo: "Requerente", tipo: "TEXTO" },
    { nome: "setor_atual", rotulo: "Setor atual", tipo: "TEXTO" },
    { nome: "setor_abertura", rotulo: "Setor de abertura", tipo: "TEXTO" },
    { nome: "aberto_em", rotulo: "Aberto em", tipo: "DATA" },
    { nome: "aberto_por", rotulo: "Aberto por", tipo: "TEXTO" },
    { nome: "recebido_em", rotulo: "Recebido em", tipo: "DATA" },
    { nome: "movimentos", rotulo: "Quantidade de movimentos", tipo: "NUMERO" },
    { nome: "taxa_em_aberto", rotulo: "Tem taxa em aberto", tipo: "BOOLEANO" },
  ],
  COMUNICADOS: [
    { nome: "numero", rotulo: "Número", tipo: "NUMERO" },
    { nome: "ano", rotulo: "Exercício", tipo: "NUMERO" },
    { nome: "tipo", rotulo: "Tipo", tipo: "TEXTO" },
    { nome: "assunto", rotulo: "Assunto", tipo: "TEXTO" },
    { nome: "remetente", rotulo: "Setor remetente", tipo: "TEXTO" },
    { nome: "destinatarios", rotulo: "Quantidade de destinatários", tipo: "NUMERO" },
    { nome: "enviado", rotulo: "Enviado", tipo: "BOOLEANO" },
    { nome: "leituras", rotulo: "Quantidade de leituras", tipo: "NUMERO" },
    { nome: "criado_em", rotulo: "Criado em", tipo: "DATA" },
    { nome: "criado_por", rotulo: "Criado por", tipo: "TEXTO" },
  ],
};

/**
 * ⚠️ O `sigiloso` É PUBLICADO COMO COLUNA, MAS A LINHA SIGILOSA NÃO ENTRA. As duas
 * coisas convivem: a coluna existe para o relatório poder dizer "destes N processos,
 * nenhum é sigiloso"; as linhas sigilosas de que o executor não participa ficam FORA da
 * fonte, antes de qualquer expressão. É o teste 3 do lote — "processo sigiloso não
 * aparece em listagem, busca, RELATÓRIO nem exportação de quem não é envolvido".
 */
export async function lerFonteProcessos(
  tx: Tx,
  unidadeOrcId: string,
  usuarioIdent: string,
  limite: number
): Promise<readonly LinhaDaFonte[]> {
  const lotacoes = await tx.usuarioDoSetor.findMany({
    where: { usuarioIdent },
    select: { setorId: true },
  });
  const meusSetores = lotacoes.map((l) => l.setorId);

  const usuario = await tx.usuario.findUnique({
    where: { identificador: usuarioIdent },
    select: {
      vinculos: {
        select: { perfil: { select: { permissoes: { select: { unidadeOrcId: true } } } } },
      },
    },
  });
  const gestor =
    usuario !== null &&
    usuario.vinculos.some((v) => v.perfil.permissoes.some((p) => p.unidadeOrcId === null));

  const processos = await tx.processo.findMany({
    where: {
      setorAbertura: { unidadeOrcId },
      // ⚠️ O SIGILO ENTRA NO `where`, e não num filtro depois. Filtrar a página já lida
      // faria o TOTAL do relatório contar linhas que quem o pediu não pode ver.
      ...(gestor
        ? {}
        : {
            OR: [
              { sigiloso: false },
              { criadoPor: usuarioIdent },
              { setorAberturaId: { in: meusSetores } },
              { movimentos: { some: { setorOrigemId: { in: meusSetores } } } },
              { movimentos: { some: { setorDestinoId: { in: meusSetores } } } },
            ],
          }),
    },
    select: {
      numero: true,
      prioridade: true,
      finalidade: true,
      sigiloso: true,
      criadoEm: true,
      criadoPor: true,
      contatoAnonimo: true,
      setorAberturaId: true,
      exercicio: { select: { ano: true } },
      assunto: { select: { nome: true } },
      subassunto: { select: { nome: true } },
      requerente: {
        select: { versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 } },
      },
      movimentos: {
        select: {
          id: true,
          tipo: true,
          setorOrigemId: true,
          setorDestinoId: true,
          respondeAId: true,
          tornaSemEfeitoId: true,
          criadoEm: true,
        },
      },
      taxas: { select: { movimentos: { select: { tipo: true, criadoEm: true } } } },
    },
    orderBy: [{ exercicio: { ano: "desc" } }, { numero: "desc" }],
    take: limite,
  });

  const setores = await tx.setor.findMany({
    where: { unidadeOrcId },
    select: { id: true, codigo: true, nome: true },
  });
  const nome = new Map(setores.map((s) => [s.id, `${s.codigo} — ${s.nome}`]));

  return processos.map((p): LinhaDaFonte => {
    const atual = setorAtual(p.setorAberturaId, p.movimentos);
    return {
      numero: new Decimal(p.numero),
      ano: new Decimal(p.exercicio.ano),
      assunto: p.assunto.nome,
      subassunto: p.subassunto?.nome ?? null,
      situacao: descreverSituacao(situacaoDoProcesso(p.movimentos)),
      prioridade: p.prioridade,
      finalidade: p.finalidade,
      sigiloso: p.sigiloso,
      requerente: p.requerente?.versoes[0]?.nome ?? p.contatoAnonimo ?? "Anônimo",
      setor_atual: nome.get(atual) ?? atual,
      setor_abertura: nome.get(p.setorAberturaId) ?? p.setorAberturaId,
      aberto_em: p.criadoEm,
      aberto_por: p.criadoPor,
      recebido_em: inicioDaContagem(p.movimentos),
      movimentos: new Decimal(p.movimentos.length),
      taxa_em_aberto: p.taxas.some((t) => t.movimentos.length === 0),
    };
  });
}

export async function lerFonteComunicados(
  tx: Tx,
  unidadeOrcId: string,
  usuarioIdent: string,
  limite: number
): Promise<readonly LinhaDaFonte[]> {
  const lotacoes = await tx.usuarioDoSetor.findMany({
    where: { usuarioIdent },
    select: { setorId: true },
  });
  const meusSetores = lotacoes.map((l) => l.setorId);

  const comunicados = await tx.comunicado.findMany({
    where: {
      setorRemetente: { unidadeOrcId },
      OR: [
        { setorRemetenteId: { in: meusSetores } },
        { destinatarios: { some: { setorId: { in: meusSetores } } } },
        { criadoPor: usuarioIdent },
      ],
    },
    select: {
      numero: true,
      assunto: true,
      criadoEm: true,
      criadoPor: true,
      exercicio: { select: { ano: true } },
      tipo: { select: { nome: true } },
      setorRemetente: { select: { codigo: true, nome: true } },
      destinatarios: { select: { setorId: true } },
      movimentos: { select: { tipo: true } },
    },
    orderBy: { criadoEm: "desc" },
    take: limite,
  });

  return comunicados.map((c): LinhaDaFonte => ({
    numero: new Decimal(c.numero),
    ano: new Decimal(c.exercicio.ano),
    tipo: c.tipo.nome,
    assunto: c.assunto,
    remetente: `${c.setorRemetente.codigo} — ${c.setorRemetente.nome}`,
    destinatarios: new Decimal(c.destinatarios.length),
    enviado: c.movimentos.some((m) => m.tipo === "ENVIO"),
    leituras: new Decimal(c.movimentos.filter((m) => m.tipo === "LEITURA").length),
    criado_em: c.criadoEm,
    criado_por: c.criadoPor,
  }));
}
