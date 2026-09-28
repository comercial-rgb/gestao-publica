import {
  configuracaoDoPedido,
  visaoDoSolicitante,
  visaoInternaDoPedido,
  type FatoDoPedido,
  type PedidoDeAcesso,
  type VisaoDoSolicitante,
  type VisaoInternaDoPedido,
} from "../../modules/m21-protocolo/pedido-de-acesso.js";
import { versoesDaConfiguracaoDoAcesso } from "../../modules/m21-protocolo/servico-acesso-a-informacao.js";
import {
  decidirRecursoDeAcesso,
  distribuirPedidoDeAcesso,
  interporRecursoDeAcesso,
  prorrogarPedidoDeAcesso,
  protocolarPedidoDeAcesso,
  receberPedidoDeAcesso,
  responderPedidoDeAcesso,
} from "../../modules/m21-protocolo/servico-pedido-de-acesso.js";
import { cliente } from "./cliente";
import { acoesPermitidas } from "./molde";
import { comEscritaAutenticada } from "./sessao";

/**
 * A PORTA DO PEDIDO DE ACESSO À INFORMAÇÃO (V11 V5.3, Fase B) — fina de propósito.
 *
 * ⚠️ AS DUAS PROJEÇÕES SÃO MONTADAS POR FUNÇÕES DIFERENTES, e isso não é organização: é a
 * garantia. `visaoDoSolicitante` NÃO LÊ o fundamento interno, o ator nem o setor — não é filtro
 * sobre uma estrutura maior, é uma estrutura que nunca teve aqueles campos. Um filtro esquece
 * um campo quando alguém acrescenta o próximo.
 *
 * ⚠️ VINCULAR AO PROCESSO NÃO TORNA O PEDIDO PÚBLICO. A tela interna mostra a trilha; a consulta
 * do cidadão mostra o que é dele.
 *
 * ⚠️ TODA ESCRITA PASSA POR `comEscritaAutenticada`, o funil onde moram sessão, autorização por
 * ação nomeada e o gate de módulo comercial.
 */

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();
const opcional = (c: Campos, k: string): string | null => (t(c, k) === "" ? null : t(c, k));

export type { VisaoDoSolicitante, VisaoInternaDoPedido };

const SELECT_PEDIDO = {
  id: true,
  processoId: true,
  protocoladoEm: true,
  configuracaoVersao: true,
  processo: {
    select: {
      numero: true,
      setorAberturaId: true,
      textoAbertura: true,
      codigoVerificador: true,
      exercicio: { select: { ano: true } },
    },
  },
  fatos: { orderBy: { em: "asc" as const } },
} as const;

interface Carregado {
  readonly pedido: PedidoDeAcesso;
  readonly fatos: readonly FatoDoPedido[];
  readonly setorAberturaId: string;
  readonly textoAbertura: string;
  readonly codigoVerificador: string;
}

async function carregar(id: string): Promise<Carregado | null> {
  const l = await cliente().pedidoDeAcessoAInformacao.findUnique({ where: { id }, select: SELECT_PEDIDO });
  if (l === null) return null;
  return {
    pedido: {
      id: l.id,
      processoId: l.processoId,
      protocolo: `${l.processo.numero}/${l.processo.exercicio.ano}`,
      protocoladoEm: l.protocoladoEm,
      configuracaoVersao: l.configuracaoVersao,
    },
    fatos: l.fatos as unknown as readonly FatoDoPedido[],
    setorAberturaId: l.processo.setorAberturaId,
    textoAbertura: l.processo.textoAbertura,
    codigoVerificador: l.processo.codigoVerificador,
  };
}

export interface PedidoNaLista {
  readonly id: string;
  readonly protocolo: string;
  readonly situacao: string;
  readonly rotulo: string;
  readonly limite: string | null;
  readonly situacaoDoPrazo: string;
}

export interface PainelDosPedidos {
  readonly pedidos: readonly PedidoNaLista[];
  readonly podeProtocolar: boolean;
  readonly setores: readonly { readonly id: string; readonly rotulo: string }[];
  readonly assuntos: readonly { readonly id: string; readonly rotulo: string }[];
  readonly exercicios: readonly number[];
}

export async function painelDosPedidosDeAcesso(): Promise<PainelDosPedidos> {
  const prisma = cliente();
  const agora = new Date();

  const [linhas, versoes, permitidas, setores, assuntos, exercicios] = await Promise.all([
    prisma.pedidoDeAcessoAInformacao.findMany({ orderBy: { protocoladoEm: "desc" }, take: 100, select: SELECT_PEDIDO }),
    versoesDaConfiguracaoDoAcesso(prisma),
    acoesPermitidas(["PROTOCOLAR_PEDIDO_DE_ACESSO_A_INFORMACAO"]),
    prisma.setor.findMany({ where: { ativo: true }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nome: true } }),
    prisma.assunto.findMany({ where: { ativo: true }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nome: true } }),
    prisma.exercicio.findMany({ orderBy: { ano: "desc" }, select: { ano: true } }),
  ]);

  return {
    pedidos: linhas.map((l) => {
      const pedido: PedidoDeAcesso = {
        id: l.id,
        processoId: l.processoId,
        protocolo: `${l.processo.numero}/${l.processo.exercicio.ano}`,
        protocoladoEm: l.protocoladoEm,
        configuracaoVersao: l.configuracaoVersao,
      };
      const v = visaoInternaDoPedido(
        pedido,
        configuracaoDoPedido(versoes, pedido),
        l.fatos as unknown as readonly FatoDoPedido[],
        l.processo.setorAberturaId,
        agora,
      );
      return {
        id: l.id,
        protocolo: v.protocolo,
        situacao: v.situacao,
        rotulo: v.rotulo,
        limite: v.prazo.limiteBr,
        situacaoDoPrazo: v.prazo.situacao,
      };
    }),
    podeProtocolar: permitidas.has("PROTOCOLAR_PEDIDO_DE_ACESSO_A_INFORMACAO"),
    setores: setores.map((s) => ({ id: s.id, rotulo: `${s.codigo} — ${s.nome}` })),
    assuntos: assuntos.map((a) => ({ id: a.id, rotulo: `${a.codigo} — ${a.nome}` })),
    exercicios: exercicios.map((e) => e.ano),
  };
}

export interface DetalheDoPedido {
  readonly id: string;
  readonly textoAbertura: string;
  readonly codigoVerificador: string;
  readonly processoId: string;
  readonly interna: VisaoInternaDoPedido;
  /** O MESMO que o cidadão lê na consulta pública — montado pela função dele, não filtrado. */
  readonly doRequerente: VisaoDoSolicitante;
  readonly setores: readonly { readonly id: string; readonly rotulo: string }[];
  readonly podeDistribuir: boolean;
  readonly podeReceber: boolean;
  readonly podeProrrogar: boolean;
  readonly podeResponder: boolean;
  readonly podeDecidirRecurso: boolean;
}

export async function pedidoDeAcessoParaTela(id: string): Promise<DetalheDoPedido | null> {
  const c = await carregar(id);
  if (c === null) return null;

  const agora = new Date();
  const [versoes, permitidas, setores] = await Promise.all([
    versoesDaConfiguracaoDoAcesso(cliente()),
    acoesPermitidas([
      "DISTRIBUIR_PEDIDO_DE_ACESSO_A_INFORMACAO",
      "RECEBER_PROCESSO",
      "PRORROGAR_PEDIDO_DE_ACESSO_A_INFORMACAO",
      "RESPONDER_PEDIDO_DE_ACESSO_A_INFORMACAO",
      "DECIDIR_RECURSO_DE_ACESSO_A_INFORMACAO",
    ]),
    cliente().setor.findMany({ where: { ativo: true }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, nome: true } }),
  ]);
  const config = configuracaoDoPedido(versoes, c.pedido);

  return {
    id: c.pedido.id,
    textoAbertura: c.textoAbertura,
    codigoVerificador: c.codigoVerificador,
    processoId: c.pedido.processoId,
    interna: visaoInternaDoPedido(c.pedido, config, c.fatos, c.setorAberturaId, agora),
    doRequerente: visaoDoSolicitante(c.pedido, config, c.fatos, agora),
    setores: setores.map((s) => ({ id: s.id, rotulo: `${s.codigo} — ${s.nome}` })),
    podeDistribuir: permitidas.has("DISTRIBUIR_PEDIDO_DE_ACESSO_A_INFORMACAO"),
    podeReceber: permitidas.has("RECEBER_PROCESSO"),
    podeProrrogar: permitidas.has("PRORROGAR_PEDIDO_DE_ACESSO_A_INFORMACAO"),
    podeResponder: permitidas.has("RESPONDER_PEDIDO_DE_ACESSO_A_INFORMACAO"),
    podeDecidirRecurso: permitidas.has("DECIDIR_RECURSO_DE_ACESSO_A_INFORMACAO"),
  };
}

/**
 * A PROJEÇÃO DO REQUERENTE, para a consulta SEM SESSÃO.
 *
 * ⚠️ ELA NÃO RECEBE O ID DO PEDIDO: recebe o do PROCESSO, porque quem já conferiu número e
 * código verificador foi a consulta pública do protocolo. Esta função não decide acesso — ela
 * devolve a projeção de quem já entrou.
 */
export async function pedidoDoProcessoParaRequerente(processoId: string): Promise<VisaoDoSolicitante | null> {
  const l = await cliente().pedidoDeAcessoAInformacao.findUnique({ where: { processoId }, select: SELECT_PEDIDO });
  if (l === null) return null;
  const pedido: PedidoDeAcesso = {
    id: l.id,
    processoId: l.processoId,
    protocolo: `${l.processo.numero}/${l.processo.exercicio.ano}`,
    protocoladoEm: l.protocoladoEm,
    configuracaoVersao: l.configuracaoVersao,
  };
  const versoes = await versoesDaConfiguracaoDoAcesso(cliente());
  return visaoDoSolicitante(
    pedido,
    configuracaoDoPedido(versoes, pedido),
    l.fatos as unknown as readonly FatoDoPedido[],
    new Date(),
  );
}

// ────────────────────────────────────────────────────────────────────────────
// AS ESCRITAS — cada uma pelo seu crachá
// ────────────────────────────────────────────────────────────────────────────

export async function protocolarNaTela(campos: Campos): Promise<string> {
  return comEscritaAutenticada("PROTOCOLAR_PEDIDO_DE_ACESSO_A_INFORMACAO", async (criadoPor) => {
    const r = await protocolarPedidoDeAcesso(cliente(), {
      exercicio: Number.parseInt(t(campos, "exercicio"), 10),
      assuntoId: t(campos, "assuntoId"),
      requerenteId: opcional(campos, "requerenteId") ?? undefined,
      contatoAnonimo: opcional(campos, "contatoAnonimo") ?? undefined,
      setorAberturaId: t(campos, "setorAberturaId"),
      pedido: t(campos, "pedido"),
      sufixoDaChave: t(campos, "__chave"),
      criadoPor,
    });
    return (
      `Pedido de acesso à informação protocolado sob o número ${r.protocolo}. ` +
      (r.configuracaoVersao === null
        ? "O ente ainda não publicou a configuração do prazo; o pedido segue normalmente, e a data limite será informada após a publicação."
        : `O prazo segue a versão ${r.configuracaoVersao} da configuração, registrada neste pedido.`)
    );
  });
}

export async function distribuirNaTela(campos: Campos): Promise<string> {
  return comEscritaAutenticada("DISTRIBUIR_PEDIDO_DE_ACESSO_A_INFORMACAO", async (criadoPor) => {
    const r = await distribuirPedidoDeAcesso(cliente(), {
      pedidoId: t(campos, "pedidoId"),
      setorDestinoId: t(campos, "setorDestinoId"),
      fundamentoInterno: t(campos, "fundamentoInterno"),
      sufixoDaChave: t(campos, "__chave"),
      criadoPor,
    });
    return r.repetido
      ? "Este encaminhamento já estava registrado; nenhuma nova tramitação foi feita."
      : "Pedido encaminhado ao setor, com a tramitação do processo correspondente.";
  });
}

export async function receberNaTela(campos: Campos): Promise<string> {
  return comEscritaAutenticada("RECEBER_PROCESSO", async (criadoPor) => {
    const r = await receberPedidoDeAcesso(cliente(), {
      pedidoId: t(campos, "pedidoId"),
      sufixoDaChave: t(campos, "__chave"),
      criadoPor,
    });
    return r.repetido
      ? "Este recebimento já estava registrado."
      : "Pedido recebido no setor, juntamente com o processo correspondente.";
  });
}

export async function prorrogarNaTela(campos: Campos): Promise<string> {
  return comEscritaAutenticada("PRORROGAR_PEDIDO_DE_ACESSO_A_INFORMACAO", async (criadoPor) => {
    const r = await prorrogarPedidoDeAcesso(cliente(), {
      pedidoId: t(campos, "pedidoId"),
      fundamentoInterno: t(campos, "fundamentoInterno"),
      mensagemAoRequerente: t(campos, "mensagemAoRequerente"),
      sufixoDaChave: t(campos, "__chave"),
      criadoPor,
    });
    return r.repetido
      ? "Esta prorrogação já estava registrada; o prazo não foi prorrogado novamente."
      : "Prorrogação registrada. O novo prazo aparece acima, e a mensagem fica disponível ao requerente na consulta do pedido.";
  });
}

export async function responderNaTela(campos: Campos): Promise<string> {
  return comEscritaAutenticada("RESPONDER_PEDIDO_DE_ACESSO_A_INFORMACAO", async (criadoPor) => {
    const entregar = t(campos, "entregar") === "sim";
    const r = await responderPedidoDeAcesso(cliente(), {
      pedidoId: t(campos, "pedidoId"),
      entregar,
      classificacao: (opcional(campos, "classificacao") ?? null) as "ACESSO_CONCEDIDO" | "ACESSO_PARCIAL" | "ACESSO_NEGADO" | null,
      mensagemAoRequerente: opcional(campos, "mensagemAoRequerente"),
      fundamentoInterno: opcional(campos, "fundamentoInterno"),
      documentoId: opcional(campos, "documentoId"),
      sufixoDaChave: t(campos, "__chave"),
      criadoPor,
    });
    if (r.repetido) return "Este registro já existia; nada foi alterado.";
    return entregar
      ? "Resposta entregue ao requerente. A partir dela, conta-se o prazo para recurso."
      : "Prévia registrada, ainda não entregue: não aparece para o requerente e não inicia prazo de recurso.";
  });
}

export async function interporNaTela(campos: Campos): Promise<string> {
  return comEscritaAutenticada("DECIDIR_RECURSO_DE_ACESSO_A_INFORMACAO", async (criadoPor) => {
    const r = await interporRecursoDeAcesso(cliente(), {
      pedidoId: t(campos, "pedidoId"),
      razoes: t(campos, "razoes"),
      sufixoDaChave: t(campos, "__chave"),
      criadoPor,
    });
    return r.repetido ? "Este recurso já estava registrado." : "Recurso registrado, aguardando decisão.";
  });
}

export async function decidirRecursoNaTela(campos: Campos): Promise<string> {
  return comEscritaAutenticada("DECIDIR_RECURSO_DE_ACESSO_A_INFORMACAO", async (criadoPor) => {
    const r = await decidirRecursoDeAcesso(cliente(), {
      pedidoId: t(campos, "pedidoId"),
      resultado: t(campos, "resultado") as "PROVIDO" | "PROVIDO_EM_PARTE" | "DESPROVIDO",
      mensagemAoRequerente: t(campos, "mensagemAoRequerente"),
      fundamentoInterno: opcional(campos, "fundamentoInterno"),
      sufixoDaChave: t(campos, "__chave"),
      criadoPor,
    });
    return r.repetido ? "Esta decisão já estava registrada." : "Recurso decidido. A decisão fica disponível ao requerente na consulta do pedido.";
  });
}
