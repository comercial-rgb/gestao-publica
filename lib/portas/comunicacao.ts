import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada, exigirSessao } from "./sessao";
import {
  integridadeDoEnvio,
  leiturasDoComunicado,
  listarCaixaDeComunicados,
  type Caixa,
  type LeituraRegistrada,
  type LinhaDaCaixa as LinhaDeComunicado,
} from "../../modules/m23-comunicacao/consultas";
import {
  arquivarComunicado,
  desarquivarComunicado,
  editarRascunho,
  encaminharComunicado,
  enviarComunicado,
  etiquetarComunicado,
  favoritarComunicado,
  marcarLeitura,
  rascunharComunicado,
  responderComunicado,
} from "../../modules/m23-comunicacao/servico";

/**
 * PORTA — COMUNICAÇÃO INTERNA (M23).
 *
 * ⚠️ A CAIXA É CALCULADA PARA QUEM PERGUNTA, e quem pergunta é a SESSÃO. A porta não
 * aceita "de quem é a caixa" como parâmetro: se aceitasse, bastaria trocar um campo da
 * requisição para ler a caixa de outra pessoa.
 */

export { PortaSemBancoError };
export type { Caixa, LeituraRegistrada, LinhaDeComunicado };

export interface OpcaoDeTipo {
  readonly id: string;
  readonly rotulo: string;
  readonly aceitaResposta: boolean;
  readonly assinaturaExigida: string | null;
}

export interface OpcaoDeSetor {
  readonly id: string;
  readonly rotulo: string;
}

export interface DetalheDoComunicado {
  readonly id: string;
  readonly rotulo: string;
  readonly tipo: string;
  readonly aceitaResposta: boolean;
  /**
   * O modo de assinatura que o TIPO exige, quando exige.
   *
   * ⚠️ A TELA PRECISA DISTO. Sem o dado, o formulário de envio não teria o que mandar, e
   * o servidor recusaria com "este tipo EXIGE assinatura e ela não veio" — uma tela
   * incapaz de fazer o que o sistema permite.
   */
  readonly assinaturaExigida: string | null;
  readonly assunto: string;
  readonly corpo: string;
  readonly remetenteId: string;
  readonly remetente: string;
  readonly destinatarios: readonly { readonly setor: string; readonly aosCuidadosDe: string | null; readonly porEncaminhamento: boolean }[];
  readonly enviado: boolean;
  readonly conteudoIntegro: boolean;
  readonly tags: readonly string[];
  readonly criadoPor: string;
  readonly criadoEm: Date;
  readonly leituras: readonly LeituraRegistrada[];
  readonly movimentos: readonly {
    readonly tipo: string;
    readonly por: string;
    readonly em: Date;
    readonly origem: string | null;
  }[];
}

// ═══════════════════════════════════════════════════════════════════════════
// LEITURAS
// ═══════════════════════════════════════════════════════════════════════════

export async function lerCaixa(
  caixa: Caixa | "TODAS" = "ENTRADA"
): Promise<readonly LinhaDeComunicado[]> {
  const sessao = await exigirSessao();
  return listarCaixaDeComunicados(cliente(), sessao.identificador, caixa);
}

export async function lerTiposDeComunicado(): Promise<readonly OpcaoDeTipo[]> {
  const tipos = await cliente().tipoDeComunicado.findMany({
    where: { ativo: true },
    select: {
      id: true,
      codigo: true,
      nome: true,
      aceitaResposta: true,
      modoDeAssinaturaExigido: true,
    },
    orderBy: { codigo: "asc" },
  });
  return tipos.map((t) => ({
    id: t.id,
    rotulo: `${t.codigo} — ${t.nome}`,
    aceitaResposta: t.aceitaResposta,
    assinaturaExigida: t.modoDeAssinaturaExigido,
  }));
}

export async function lerMeusSetoresParaComunicado(): Promise<readonly OpcaoDeSetor[]> {
  const sessao = await exigirSessao();
  const lotacoes = await cliente().usuarioDoSetor.findMany({
    where: { usuarioIdent: sessao.identificador },
    select: { setor: { select: { id: true, codigo: true, nome: true, ativo: true } } },
    orderBy: { setor: { codigo: "asc" } },
  });
  return lotacoes
    .filter((l) => l.setor.ativo)
    .map((l) => ({ id: l.setor.id, rotulo: `${l.setor.codigo} — ${l.setor.nome}` }));
}

export async function lerSetoresParaDestino(): Promise<readonly OpcaoDeSetor[]> {
  const setores = await cliente().setor.findMany({
    where: { ativo: true },
    select: { id: true, codigo: true, nome: true },
    orderBy: { codigo: "asc" },
  });
  return setores.map((s) => ({ id: s.id, rotulo: `${s.codigo} — ${s.nome}` }));
}

/**
 * O DETALHE — e ele devolve `null` a quem não participa.
 *
 * ⚠️ A CONFERÊNCIA É A MESMA DA CAIXA, e não uma regra nova aqui: quem não vê o
 * comunicado na caixa não o abre por link direto.
 */
export async function lerComunicado(
  comunicadoId: string
): Promise<DetalheDoComunicado | null> {
  const sessao = await exigirSessao();
  const caixa = await listarCaixaDeComunicados(cliente(), sessao.identificador, "TODAS", 1000);
  const naCaixa = caixa.find((c) => c.id === comunicadoId);
  if (naCaixa === undefined) return null;

  const c = await cliente().comunicado.findUnique({
    where: { id: comunicadoId },
    select: {
      id: true,
      assunto: true,
      corpo: true,
      criadoPor: true,
      criadoEm: true,
      setorRemetenteId: true,
      setorRemetente: { select: { codigo: true, nome: true } },
      tipo: {
        select: { nome: true, aceitaResposta: true, modoDeAssinaturaExigido: true },
      },
      destinatarios: {
        select: {
          aosCuidadosDe: true,
          porEncaminhamento: true,
          setor: { select: { codigo: true, nome: true } },
        },
      },
      movimentos: {
        select: { tipo: true, criadoPor: true, criadoEm: true, origem: true },
        orderBy: { criadoEm: "asc" },
      },
    },
  });
  if (c === null) return null;

  const [leituras, integridade] = await Promise.all([
    leiturasDoComunicado(cliente(), comunicadoId, sessao.identificador),
    integridadeDoEnvio(cliente(), comunicadoId),
  ]);

  return {
    id: c.id,
    rotulo: naCaixa.rotulo,
    tipo: c.tipo.nome,
    aceitaResposta: c.tipo.aceitaResposta,
    assinaturaExigida: c.tipo.modoDeAssinaturaExigido,
    assunto: c.assunto,
    corpo: c.corpo,
    remetenteId: c.setorRemetenteId,
    remetente: `${c.setorRemetente.codigo} — ${c.setorRemetente.nome}`,
    destinatarios: c.destinatarios.map((d) => ({
      setor: `${d.setor.codigo} — ${d.setor.nome}`,
      aosCuidadosDe: d.aosCuidadosDe,
      porEncaminhamento: d.porEncaminhamento,
    })),
    enviado: naCaixa.caixa !== "RASCUNHO",
    conteudoIntegro: integridade?.integro ?? true,
    tags: naCaixa.tags,
    criadoPor: c.criadoPor,
    criadoEm: c.criadoEm,
    leituras: leituras ?? [],
    movimentos: c.movimentos.map((m) => ({
      tipo: m.tipo,
      por: m.criadoPor,
      em: m.criadoEm,
      origem: m.origem,
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ESCRITAS
// ═══════════════════════════════════════════════════════════════════════════

export async function rascunharNaTela(input: {
  readonly exercicio: number;
  readonly tipoId: string;
  readonly setorRemetenteId: string;
  readonly assunto: string;
  readonly corpo: string;
  readonly processoId?: string | undefined;
}): Promise<{ readonly comunicadoId: string; readonly numero: number }> {
  return comEscritaAutenticada("RASCUNHAR_COMUNICADO", (criadoPor) =>
    rascunharComunicado(cliente(), { ...input, criadoPor })
  );
}

export async function editarRascunhoNaTela(input: {
  readonly comunicadoId: string;
  readonly assunto: string;
  readonly corpo: string;
}): Promise<void> {
  await comEscritaAutenticada("EDITAR_RASCUNHO_DE_COMUNICADO", (criadoPor) =>
    editarRascunho(cliente(), { ...input, criadoPor })
  );
}

export async function enviarNaTela(input: {
  readonly comunicadoId: string;
  readonly destinatarios: readonly { readonly setorId: string; readonly aosCuidadosDe?: string | undefined }[];
  readonly modoDeAssinatura?: "SIMPLES" | "AVANCADA" | "QUALIFICADA" | undefined;
}): Promise<{ readonly destinatarios: number }> {
  return comEscritaAutenticada("ENVIAR_COMUNICADO", (criadoPor) =>
    enviarComunicado(cliente(), {
      ...input,
      // O Zod do domínio pede um array mutável; a porta expõe `readonly` para a UI não
      // guardar a ilusão de que pode alterá-lo depois de entregar.
      destinatarios: input.destinatarios.map((d) => ({ ...d })),
      criadoPor,
    })
  );
}

export async function responderNaTela(input: {
  readonly comunicadoId: string;
  readonly setorRemetenteId: string;
  readonly assunto: string;
  readonly corpo: string;
}): Promise<{ readonly numero: number }> {
  return comEscritaAutenticada("RESPONDER_COMUNICADO", (criadoPor) =>
    responderComunicado(cliente(), { ...input, criadoPor })
  );
}

export async function encaminharNaTela(input: {
  readonly comunicadoId: string;
  readonly setorDestinoId: string;
  readonly aosCuidadosDe?: string | undefined;
}): Promise<void> {
  await comEscritaAutenticada("ENCAMINHAR_COMUNICADO", (criadoPor) =>
    encaminharComunicado(cliente(), { ...input, criadoPor })
  );
}

export async function marcarLeituraNaTela(comunicadoId: string): Promise<{ readonly jaLida: boolean }> {
  return comEscritaAutenticada("MARCAR_LEITURA_DE_COMUNICADO", (criadoPor) =>
    marcarLeitura(cliente(), { comunicadoId, origem: "SISTEMA", criadoPor })
  );
}

export async function arquivarNaTela(comunicadoId: string): Promise<void> {
  await comEscritaAutenticada("GERIR_MINHA_CAIXA", (criadoPor) =>
    arquivarComunicado(cliente(), { comunicadoId, criadoPor })
  );
}

export async function desarquivarNaTela(comunicadoId: string): Promise<void> {
  await comEscritaAutenticada("GERIR_MINHA_CAIXA", (criadoPor) =>
    desarquivarComunicado(cliente(), { comunicadoId, criadoPor })
  );
}

export async function favoritarNaTela(comunicadoId: string): Promise<void> {
  await comEscritaAutenticada("GERIR_MINHA_CAIXA", (criadoPor) =>
    favoritarComunicado(cliente(), { comunicadoId, criadoPor })
  );
}

export async function etiquetarNaTela(input: {
  readonly comunicadoId: string;
  readonly tag: string;
}): Promise<void> {
  await comEscritaAutenticada("ETIQUETAR_COMUNICADO", (criadoPor) =>
    etiquetarComunicado(cliente(), { ...input, criadoPor })
  );
}
