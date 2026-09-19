import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { diaCivil, instanteCivil, meioDiaCivil } from "../../packages/datas/index.js";
import type { ConfiguracaoLida } from "./acesso-a-informacao.js";
import {
  chaveDoFato,
  configuracaoDoPedido,
  instanciasUsadas,
  limiteParaRecorrer,
  pedidoDaChave,
  prazoDoPedidoDeAcesso,
  prorrogacoesAplicadas,
  recursoPendente,
  registrarFatoDoPedido,
  respostaEntregue,
  situacaoDoPedido,
  situacaoParaSolicitante,
  visaoDoSolicitante,
  visaoInternaDoPedido,
  type ComandoDoPedido,
  type FatoDoPedido,
  type PedidoDeAcesso,
  type ResultadoDoRegistro,
} from "./pedido-de-acesso.js";

/**
 * ⚠️ OS NÚMEROS DESTA SUÍTE SÃO INVENTADOS DE PROPÓSITO, pela mesma razão da suíte da régua: se o
 * teste usasse os números que se citam de cabeça, ele passaria a ENSINÁ-LOS, e o próximo leitor os
 * copiaria para dentro do código. O que está sob teste é a MÁQUINA — derivar a situação dos fatos,
 * congelar a versão aplicada, recusar a transição incompatível com motivo próprio —, não o
 * conteúdo da norma, que vem de fora por publicação do ente.
 */

const D = (dia: string): Date => meioDiaCivil(dia);

function config(p: Partial<ConfiguracaoLida> & { readonly versao: number }): ConfiguracaoLida {
  return {
    versao: p.versao,
    vigenciaInicio: p.vigenciaInicio ?? "2026-01-01",
    prazoDeRespostaEmDias: p.prazoDeRespostaEmDias ?? 7,
    prazoDeProrrogacaoEmDias: p.prazoDeProrrogacaoEmDias ?? 3,
    prorrogacoesPermitidas: p.prorrogacoesPermitidas ?? 1,
    instanciasDeRecurso: p.instanciasDeRecurso ?? 2,
    prazoDeRecursoEmDias: p.prazoDeRecursoEmDias ?? 5,
    normaFederal: p.normaFederal ?? "Norma de teste, art. 1",
    normaFederalPublicadaEm: p.normaFederalPublicadaEm ?? D("2025-01-01"),
    // ⚠️ `in`, NÃO `??`: um caso que passa `null` DE PROPÓSITO não pode receber o padrão de volta.
    regulamentacaoLocal: "regulamentacaoLocal" in p ? p.regulamentacaoLocal! : "Decreto municipal de teste",
    regulamentacaoLocalPublicadaEm:
      "regulamentacaoLocalPublicadaEm" in p ? p.regulamentacaoLocalPublicadaEm! : D("2025-06-01"),
    observacao: p.observacao ?? null,
  };
}

function pedido(p: Partial<PedidoDeAcesso> & { readonly id: string }): PedidoDeAcesso {
  return {
    id: p.id,
    processoId: p.processoId ?? `processo-${p.id}`,
    protocolo: p.protocolo ?? `1/2026`,
    protocoladoEm: p.protocoladoEm ?? D("2026-09-01"),
    configuracaoVersao: "configuracaoVersao" in p ? p.configuracaoVersao! : 1,
  };
}

/** O fato do protocolo — o único que o caso de uso grava junto com o pedido, sem passar por comando. */
function protocolado(pd: PedidoDeAcesso): FatoDoPedido {
  return {
    id: `f-protocolo-${pd.id}`,
    pedidoId: pd.id,
    processoId: pd.processoId,
    natureza: "PEDIDO_PROTOCOLADO",
    ator: "cidadao",
    em: pd.protocoladoEm,
    dia: diaCivil(pd.protocoladoEm),
    configuracaoVersao: pd.configuracaoVersao,
    chave: chaveDoFato(pd.id, "PEDIDO_PROTOCOLADO", "origem"),
    mensagemAoRequerente: null,
    fundamentoInterno: null,
    setorDestinoId: null,
    documentoId: null,
    classificacao: null,
    instancia: null,
    resultadoDoRecurso: null,
  };
}

let sequencia = 0;

interface Opcoes {
  readonly ator?: string;
  readonly em?: Date;
  readonly chave?: string;
  readonly config?: ConfiguracaoLida | null;
}

/** Aplica um comando e devolve o resultado CRU — para os casos de negação lerem o código. */
function tentar(
  pd: PedidoDeAcesso,
  cfg: ConfiguracaoLida | null,
  fatos: readonly FatoDoPedido[],
  comando: ComandoDoPedido,
  o: Opcoes = {},
): ResultadoDoRegistro {
  sequencia += 1;
  return registrarFatoDoPedido({
    pedido: pd,
    config: "config" in o ? o.config! : cfg,
    fatos,
    comando,
    ator: o.ator ?? "servidor.a",
    em: o.em ?? D("2026-09-02"),
    chave: o.chave ?? chaveDoFato(pd.id, comando.natureza, `s${sequencia}`),
    id: `f${sequencia}`,
  });
}

/** Aplica e EXIGE aceitação — o caminho feliz das fixtures, que falha alto se o desenho mudar. */
function aplicar(
  pd: PedidoDeAcesso,
  cfg: ConfiguracaoLida | null,
  fatos: readonly FatoDoPedido[],
  comando: ComandoDoPedido,
  o: Opcoes = {},
): readonly FatoDoPedido[] {
  const r = tentar(pd, cfg, fatos, comando, o);
  if (!r.aceito) throw new Error(`fixture recusada (${r.codigo}): ${r.motivo}`);
  return [...fatos, r.fato];
}

const ENCAMINHAR: ComandoDoPedido = {
  natureza: "PEDIDO_DISTRIBUIDO",
  setorDestinoId: "setor-transparencia",
  fundamentoInterno: "Encaminhado ao setor que detém a informação pedida.",
};
const RECEBER: ComandoDoPedido = { natureza: "PEDIDO_RECEBIDO" };
const RESPONDER: ComandoDoPedido = {
  natureza: "RESPOSTA_ENTREGUE",
  classificacao: "ACESSO_CONCEDIDO",
  mensagemAoRequerente: "Segue a informação pedida, no documento em anexo.",
  documentoId: "anexo-1",
};

describe("V5.3 — a situação do pedido é DERIVADA dos fatos", () => {
  it("p1 — a jornada inteira, e cada fato move o pé do pedido", () => {
    const pd = pedido({ id: "ped-1" });
    const c = config({ versao: 1 });
    let fatos: readonly FatoDoPedido[] = [protocolado(pd)];
    expect(situacaoDoPedido(fatos)).toBe("PROTOCOLADO");

    fatos = aplicar(pd, c, fatos, ENCAMINHAR);
    expect(situacaoDoPedido(fatos)).toBe("EM_DISTRIBUICAO");

    fatos = aplicar(pd, c, fatos, RECEBER, { em: D("2026-09-03") });
    expect(situacaoDoPedido(fatos)).toBe("EM_ANALISE");

    fatos = aplicar(pd, c, fatos, RESPONDER, { em: D("2026-09-05") });
    expect(situacaoDoPedido(fatos)).toBe("RESPONDIDO");

    fatos = aplicar(pd, c, fatos, { natureza: "RECURSO_INTERPOSTO", mensagemAoRequerente: "Recebi menos do que pedi." }, { em: D("2026-09-06"), ator: "REQUERENTE" });
    expect(situacaoDoPedido(fatos)).toBe("EM_RECURSO");

    fatos = aplicar(pd, c, fatos, {
      natureza: "RECURSO_DECIDIDO",
      resultadoDoRecurso: "PROVIDO",
      mensagemAoRequerente: "Recurso provido; a informação complementar segue em anexo.",
    }, { em: D("2026-09-08") });
    expect(situacaoDoPedido(fatos)).toBe("RESPONDIDO");

    fatos = aplicar(pd, c, fatos, { natureza: "PEDIDO_ENCERRADO", fundamentoInterno: "Atendido integralmente." }, { em: D("2026-09-09") });
    expect(situacaoDoPedido(fatos)).toBe("ENCERRADO");
  });

  it("p2 — prorrogação e prévia NÃO mudam o pé, e a prorrogação mexe no prazo", () => {
    const pd = pedido({ id: "ped-2" });
    const c = config({ versao: 1, prazoDeRespostaEmDias: 7, prazoDeProrrogacaoEmDias: 3, prorrogacoesPermitidas: 1 });
    let fatos = aplicar(pd, c, [protocolado(pd)], ENCAMINHAR);
    fatos = aplicar(pd, c, fatos, RECEBER);
    expect(diaCivil(prazoDoPedidoDeAcesso(c, pd, fatos, D("2026-09-02")).limite!)).toBe("2026-09-08");

    fatos = aplicar(pd, c, fatos, {
      natureza: "RESPOSTA_PREVIA_REGISTRADA",
      fundamentoInterno: "Minuta da resposta conferida pela assessoria.",
    });
    expect(situacaoDoPedido(fatos)).toBe("EM_ANALISE");
    expect(diaCivil(prazoDoPedidoDeAcesso(c, pd, fatos, D("2026-09-02")).limite!)).toBe("2026-09-08");

    fatos = aplicar(pd, c, fatos, {
      natureza: "PRORROGACAO_CONCEDIDA",
      fundamentoInterno: "O acervo está em depósito externo e depende de transporte.",
      mensagemAoRequerente: "O prazo foi prorrogado; a informação depende de acervo em depósito externo.",
    });
    expect(situacaoDoPedido(fatos)).toBe("EM_ANALISE");
    expect(prorrogacoesAplicadas(fatos)).toBe(1);
    // ⚠️ A prorrogação acrescenta os dias DECLARADOS na configuração, não um número do código.
    expect(diaCivil(prazoDoPedidoDeAcesso(c, pd, fatos, D("2026-09-02")).limite!)).toBe("2026-09-11");
  });

  it("p3 — N=2 recursos: a dobra só sai da espera quando NÃO sobra recurso sem decisão", () => {
    const pd = pedido({ id: "ped-3" });
    const c = config({ versao: 1, instanciasDeRecurso: 2, prazoDeRecursoEmDias: 30 });
    let fatos = aplicar(pd, c, [protocolado(pd)], ENCAMINHAR);
    fatos = aplicar(pd, c, fatos, RECEBER);
    fatos = aplicar(pd, c, fatos, {
      natureza: "RESPOSTA_ENTREGUE",
      classificacao: "ACESSO_NEGADO",
      mensagemAoRequerente: "O acesso foi negado, e a razão segue no documento.",
      fundamentoInterno: "Documento preparatório de decisão ainda não tomada.",
    }, { em: D("2026-09-05") });

    fatos = aplicar(pd, c, fatos, { natureza: "RECURSO_INTERPOSTO", mensagemAoRequerente: "A negativa não indica a norma." }, { em: D("2026-09-06"), ator: "REQUERENTE" });
    expect(recursoPendente(fatos)?.instancia).toBe(1);

    fatos = aplicar(pd, c, fatos, {
      natureza: "RECURSO_DECIDIDO",
      resultadoDoRecurso: "DESPROVIDO",
      mensagemAoRequerente: "Recurso desprovido; a negativa fica mantida.",
      fundamentoInterno: "A hipótese de restrição foi confirmada pela assessoria.",
    }, { em: D("2026-09-07") });
    expect(situacaoDoPedido(fatos)).toBe("RESPONDIDO");
    expect(recursoPendente(fatos)).toBeNull();

    fatos = aplicar(pd, c, fatos, { natureza: "RECURSO_INTERPOSTO", mensagemAoRequerente: "Recorro à instância seguinte." }, { em: D("2026-09-08"), ator: "REQUERENTE" });
    expect(situacaoDoPedido(fatos)).toBe("EM_RECURSO");
    expect(recursoPendente(fatos)?.instancia).toBe(2);
    expect(instanciasUsadas(fatos)).toBe(2);

    // Com recurso ainda pendente, outro recurso recusa por ISSO — e não por esgotamento.
    const pendente = tentar(pd, c, fatos, { natureza: "RECURSO_INTERPOSTO", mensagemAoRequerente: "Mais um recurso." }, { em: D("2026-09-09") });
    expect(pendente.aceito).toBe(false);
    if (!pendente.aceito) expect(pendente.codigo).toBe("RECURSO-JA-PENDENTE");

    fatos = aplicar(pd, c, fatos, {
      natureza: "RECURSO_DECIDIDO",
      resultadoDoRecurso: "DESPROVIDO",
      mensagemAoRequerente: "Recurso desprovido na instância seguinte.",
      fundamentoInterno: "Nenhuma razão nova foi trazida.",
    }, { em: D("2026-09-10") });

    // Esgotadas as instâncias DECLARADAS, a terceira recusa nomeando quantas a norma previa.
    const esgotado = tentar(pd, c, fatos, { natureza: "RECURSO_INTERPOSTO", mensagemAoRequerente: "Terceiro recurso." }, { em: D("2026-09-11") });
    expect(esgotado.aceito).toBe(false);
    if (!esgotado.aceito) {
      expect(esgotado.codigo).toBe("RECURSO-ALEM-DAS-INSTANCIAS");
      expect(esgotado.motivo).toContain("2 instância(s)");
    }
  });
});

describe("V5.3 — alterar a configuração NÃO reescreve pedido em andamento", () => {
  it("p4 — N=2 versões e N=2 pedidos: cada um mantém o prazo da versão sob a qual nasceu", () => {
    const v1 = config({ versao: 1, vigenciaInicio: "2026-01-01", prazoDeRespostaEmDias: 7 });
    const v2 = config({ versao: 2, vigenciaInicio: "2026-09-10", prazoDeRespostaEmDias: 21 });
    const versoes = [v1, v2];

    const antigo = pedido({ id: "ped-a", protocolo: "10/2026", protocoladoEm: D("2026-09-01"), configuracaoVersao: 1 });
    const novo = pedido({ id: "ped-b", protocolo: "11/2026", protocoladoEm: D("2026-09-12"), configuracaoVersao: 2 });

    expect(configuracaoDoPedido(versoes, antigo)?.versao).toBe(1);
    expect(configuracaoDoPedido(versoes, novo)?.versao).toBe(2);

    const prazoAntigo = prazoDoPedidoDeAcesso(configuracaoDoPedido(versoes, antigo), antigo, [protocolado(antigo)], D("2026-09-12"));
    const prazoNovo = prazoDoPedidoDeAcesso(configuracaoDoPedido(versoes, novo), novo, [protocolado(novo)], D("2026-09-12"));

    // ⚠️ O PONTO DO CASO: o pedido antigo continua com o prazo da versão 1 DEPOIS de publicada a 2.
    expect(diaCivil(prazoAntigo.limite!)).toBe("2026-09-08");
    expect(diaCivil(prazoNovo.limite!)).toBe("2026-10-03");
    // E a versão 2, que é a vigente hoje, NÃO encurtou nem esticou o prazo do pedido antigo.
    expect(diaCivil(prazoAntigo.limite!)).not.toBe(diaCivil(prazoDoPedidoDeAcesso(v2, antigo, [protocolado(antigo)], D("2026-09-12")).limite!));
  });

  it("p5 — um ato que chega com OUTRA versão é recusado, e a recusa nomeia as duas", () => {
    const pd = pedido({ id: "ped-5", configuracaoVersao: 1 });
    const r = tentar(pd, config({ versao: 1 }), [protocolado(pd)], ENCAMINHAR, { config: config({ versao: 2 }) });
    expect(r.aceito).toBe(false);
    if (!r.aceito) {
      expect(r.codigo).toBe("CONFIGURACAO-DIVERGENTE");
      expect(r.motivo).toContain("versão 1");
      expect(r.motivo).toContain("versão 2");
    }
  });

  it("p6 — pedido nascido SEM configuração não ganha prazo quando o ente publica uma depois", () => {
    const pd = pedido({ id: "ped-6", configuracaoVersao: null });
    const fatos = [protocolado(pd)];
    const versoes = [config({ versao: 1, vigenciaInicio: "2026-09-10" })];

    expect(configuracaoDoPedido(versoes, pd)).toBeNull();
    const prazo = prazoDoPedidoDeAcesso(configuracaoDoPedido(versoes, pd), pd, fatos, D("2026-09-20"));
    expect(prazo.situacao).toBe("SEM_PRAZO");
    expect(prazo.limite).toBeNull();
    expect(prazo.pendencias[0]!.codigo).toBe("SEM-CONFIGURACAO-DO-ACESSO");

    // E prorrogar recusa pelo motivo da CONFIGURAÇÃO, não por limite de prorrogação.
    const r = tentar(pd, null, fatos, {
      natureza: "PRORROGACAO_CONCEDIDA",
      fundamentoInterno: "O acervo está em depósito externo.",
      mensagemAoRequerente: "O prazo foi prorrogado.",
    });
    expect(r.aceito).toBe(false);
    if (!r.aceito) {
      expect(r.codigo).toBe("SEM-CONFIGURACAO-DO-ACESSO");
      expect(r.motivo).toContain("não o inventa");
    }
  });
});

describe("V5.3 — repetição não duplica evento, e o escopo mora DENTRO da chave", () => {
  it("p7 — a mesma chave devolve o MESMO fato, e não um segundo", () => {
    const pd = pedido({ id: "ped-7" });
    const c = config({ versao: 1 });
    const chave = chaveDoFato(pd.id, "PEDIDO_DISTRIBUIDO", "envio-1");
    const fatos = aplicar(pd, c, [protocolado(pd)], ENCAMINHAR, { chave });
    expect(fatos).toHaveLength(2);

    const r = tentar(pd, c, fatos, ENCAMINHAR, { chave });
    expect(r.aceito).toBe(true);
    if (r.aceito) {
      expect(r.repetido).toBe(true);
      expect(r.fato.id).toBe(fatos[1]!.id);
    }
  });

  it("p8 — N=2 pedidos: a chave de um NÃO responde pelo outro", () => {
    const a = pedido({ id: "ped-8a", protocolo: "20/2026" });
    const b = pedido({ id: "ped-8b", protocolo: "21/2026" });
    const c = config({ versao: 1 });
    const chaveDeA = chaveDoFato(a.id, "PEDIDO_DISTRIBUIDO", "envio-1");

    const fatosDeA = aplicar(a, c, [protocolado(a)], ENCAMINHAR, { chave: chaveDeA });
    expect(pedidoDaChave(chaveDeA)).toBe(a.id);

    // A MESMA chave, no pedido B: não é replay — é engano, e o motivo diz isso.
    const r = tentar(b, c, [protocolado(b)], ENCAMINHAR, { chave: chaveDeA });
    expect(r.aceito).toBe(false);
    if (!r.aceito) {
      expect(r.codigo).toBe("CHAVE-FORA-DO-ESCOPO");
      expect(r.motivo).toContain("21/2026");
    }
    // E o fato de A continua sendo o único de A.
    expect(fatosDeA.filter((f) => f.chave === chaveDeA)).toHaveLength(1);
  });

  it("p9 — chave sem escopo declarado é recusada, e não aceita por omissão", () => {
    const pd = pedido({ id: "ped-9" });
    expect(pedidoDaChave("envio-1")).toBeNull();
    const r = tentar(pd, config({ versao: 1 }), [protocolado(pd)], ENCAMINHAR, { chave: "envio-1" });
    expect(r.aceito).toBe(false);
    if (!r.aceito) expect(r.codigo).toBe("CHAVE-FORA-DO-ESCOPO");
  });
});

describe("V5.3 — transição incompatível: cada recusa com o motivo PRÓPRIO", () => {
  const c = config({ versao: 1, prorrogacoesPermitidas: 1, instanciasDeRecurso: 1, prazoDeRecursoEmDias: 5 });

  function respondido(id: string): { readonly pd: PedidoDeAcesso; readonly fatos: readonly FatoDoPedido[] } {
    const pd = pedido({ id });
    let fatos = aplicar(pd, c, [protocolado(pd)], ENCAMINHAR);
    fatos = aplicar(pd, c, fatos, RECEBER);
    fatos = aplicar(pd, c, fatos, RESPONDER, { em: D("2026-09-05") });
    return { pd, fatos };
  }

  it("p10 — responder duas vezes: PEDIDO-JA-RESPONDIDO, com a data da primeira", () => {
    const { pd, fatos } = respondido("ped-10");
    const r = tentar(pd, c, fatos, RESPONDER, { em: D("2026-09-06") });
    expect(r.aceito).toBe(false);
    if (!r.aceito) {
      expect(r.codigo).toBe("PEDIDO-JA-RESPONDIDO");
      expect(r.motivo).toContain("05/09/2026");
    }
  });

  it("p11 — prorrogar depois de respondido: motivo PRÓPRIO, e não 'acabaram as prorrogações'", () => {
    const { pd, fatos } = respondido("ped-11");
    const r = tentar(pd, c, fatos, {
      natureza: "PRORROGACAO_CONCEDIDA",
      fundamentoInterno: "Ainda falta juntar um documento.",
      mensagemAoRequerente: "O prazo foi prorrogado.",
    }, { em: D("2026-09-06") });
    expect(r.aceito).toBe(false);
    if (!r.aceito) {
      expect(r.codigo).toBe("PRORROGACAO-APOS-RESPOSTA");
      expect(r.motivo).toContain("já foi respondido");
      // ⚠️ A NEGAÇÃO AFIRMA O MOTIVO: ela NÃO fala em limite de prorrogações, que ainda havia.
      expect(r.motivo).not.toContain("prorrogação(ões) admitidas");
      expect(prorrogacoesAplicadas(fatos)).toBeLessThan(c.prorrogacoesPermitidas);
    }
  });

  it("p11b — prorrogar além do DECLARADO recusa por outro código, e nomeia quantas já foram", () => {
    const pd = pedido({ id: "ped-11b" });
    let fatos = aplicar(pd, c, [protocolado(pd)], ENCAMINHAR);
    fatos = aplicar(pd, c, fatos, RECEBER);
    const prorrogar: ComandoDoPedido = {
      natureza: "PRORROGACAO_CONCEDIDA",
      fundamentoInterno: "O acervo está em depósito externo.",
      mensagemAoRequerente: "O prazo foi prorrogado, e o motivo é o acervo em depósito externo.",
    };
    fatos = aplicar(pd, c, fatos, prorrogar);
    const r = tentar(pd, c, fatos, prorrogar);
    expect(r.aceito).toBe(false);
    if (!r.aceito) {
      expect(r.codigo).toBe("PRORROGACAO-ALEM-DA-NORMA");
      expect(r.motivo).toContain("1 de 1");
      expect(r.motivo).toContain("versão 1");
    }
  });

  it("p12 — recorrer antes da resposta: RECURSO-SEM-RESPOSTA, e a prévia não serve de resposta", () => {
    const pd = pedido({ id: "ped-12" });
    let fatos = aplicar(pd, c, [protocolado(pd)], ENCAMINHAR);
    fatos = aplicar(pd, c, fatos, RECEBER);
    fatos = aplicar(pd, c, fatos, { natureza: "RESPOSTA_PREVIA_REGISTRADA", fundamentoInterno: "Minuta pronta, aguardando visto." });

    const r = tentar(pd, c, fatos, { natureza: "RECURSO_INTERPOSTO", mensagemAoRequerente: "Quero recorrer." }, { ator: "REQUERENTE" });
    expect(r.aceito).toBe(false);
    if (!r.aceito) {
      expect(r.codigo).toBe("RECURSO-SEM-RESPOSTA");
      expect(r.motivo).toContain("prévia");
    }
    // ⚠️ E A PRÉVIA NÃO INICIA PRAZO DE RECURSO: não há prazo enquanto nada foi entregue.
    expect(limiteParaRecorrer(c, fatos)).toBeNull();
    expect(respostaEntregue(fatos)).toBeNull();
  });

  it("p13 — decidir recurso que não existe, e prévia depois da entrega: códigos próprios", () => {
    const { pd, fatos } = respondido("ped-13");
    const semRecurso = tentar(pd, c, fatos, {
      natureza: "RECURSO_DECIDIDO",
      resultadoDoRecurso: "DESPROVIDO",
      mensagemAoRequerente: "Recurso desprovido.",
      fundamentoInterno: "Sem razões novas.",
    });
    expect(semRecurso.aceito).toBe(false);
    if (!semRecurso.aceito) expect(semRecurso.codigo).toBe("RECURSO-NAO-PENDENTE");

    const previaTardia = tentar(pd, c, fatos, { natureza: "RESPOSTA_PREVIA_REGISTRADA", fundamentoInterno: "Outra minuta." });
    expect(previaTardia.aceito).toBe(false);
    if (!previaTardia.aceito) expect(previaTardia.codigo).toBe("PREVIA-APOS-RESPOSTA");
  });

  it("p14 — negar o acesso sem fundamento recusa; conceder sem fundamento não recusa", () => {
    const pd = pedido({ id: "ped-14" });
    let fatos = aplicar(pd, c, [protocolado(pd)], ENCAMINHAR);
    fatos = aplicar(pd, c, fatos, RECEBER);

    const semFundamento = tentar(pd, c, fatos, {
      natureza: "RESPOSTA_ENTREGUE",
      classificacao: "ACESSO_PARCIAL",
      mensagemAoRequerente: "Parte da informação não será entregue.",
    });
    expect(semFundamento.aceito).toBe(false);
    if (!semFundamento.aceito) {
      expect(semFundamento.codigo).toBe("NEGATIVA-SEM-FUNDAMENTO");
      expect(semFundamento.motivo).toContain("recurso");
    }

    // A concessão integral se prova pelo documento entregue, e não exige fundamento escrito.
    const concedida = tentar(pd, c, fatos, RESPONDER);
    expect(concedida.aceito).toBe(true);
  });

  it("p15 — receber sem encaminhamento, e receber duas vezes: dois códigos, não um", () => {
    const pd = pedido({ id: "ped-15" });
    const fatos = [protocolado(pd)];
    const semEnvio = tentar(pd, c, fatos, RECEBER);
    expect(semEnvio.aceito).toBe(false);
    if (!semEnvio.aceito) expect(semEnvio.codigo).toBe("RECEBIMENTO-SEM-ENCAMINHAMENTO");

    const comEnvio = aplicar(pd, c, fatos, ENCAMINHAR);
    const recebido = aplicar(pd, c, comEnvio, RECEBER);
    const denovo = tentar(pd, c, recebido, RECEBER);
    expect(denovo.aceito).toBe(false);
    if (!denovo.aceito) expect(denovo.codigo).toBe("RECEBIMENTO-JA-REGISTRADO");
  });

  it("p16 — pedido encerrado não aceita ato novo, e a recusa não se confunde com as outras", () => {
    const { pd, fatos } = respondido("ped-16");
    const encerrado = aplicar(pd, c, fatos, { natureza: "PEDIDO_ENCERRADO", fundamentoInterno: "Atendido integralmente." }, { em: D("2026-09-06") });
    const r = tentar(pd, c, encerrado, ENCAMINHAR, { em: D("2026-09-07") });
    expect(r.aceito).toBe(false);
    if (!r.aceito) {
      expect(r.codigo).toBe("PEDIDO-ENCERRADO");
      expect(r.motivo).toContain("ENCERRADO");
    }
  });

  it("p17 — o prazo de recurso se compara por DIA CIVIL: o último dia inteiro vale", () => {
    const pd = pedido({ id: "ped-17" });
    const cc = config({ versao: 1, prazoDeRecursoEmDias: 5, instanciasDeRecurso: 1 });
    let fatos = aplicar(pd, cc, [protocolado(pd)], ENCAMINHAR);
    fatos = aplicar(pd, cc, fatos, RECEBER);
    fatos = aplicar(pd, cc, fatos, RESPONDER, { em: D("2026-09-05") });
    expect(diaCivil(limiteParaRecorrer(cc, fatos)!)).toBe("2026-09-10");

    // ⚠️ HORA DE BORDA: às 23:30 do último dia ainda está no prazo. A comparação por instante
    // rejeitaria quem recorreu depois do horário do meio-dia da resposta, e isso não é o prazo.
    const noLimite = tentar(pd, cc, fatos, { natureza: "RECURSO_INTERPOSTO", mensagemAoRequerente: "Recorro no último dia." }, {
      em: instanteCivil(2026, 9, 10, 23, 30, 0, 0),
      ator: "REQUERENTE",
    });
    expect(noLimite.aceito).toBe(true);

    const depois = tentar(pd, cc, fatos, { natureza: "RECURSO_INTERPOSTO", mensagemAoRequerente: "Recorro tarde." }, {
      em: instanteCivil(2026, 9, 11, 0, 30, 0, 0),
      ator: "REQUERENTE",
    });
    expect(depois.aceito).toBe(false);
    if (!depois.aceito) {
      expect(depois.codigo).toBe("RECURSO-FORA-DO-PRAZO");
      expect(depois.motivo).toContain("10/09/2026");
    }
  });
});

describe("V5.3 — duas projeções, e a do requerente RECONSTRÓI", () => {
  const SEGREDO = "FUNDAMENTO-QUE-NAO-PODE-SAIR-DAQUI";
  const c = config({ versao: 1, instanciasDeRecurso: 1, prazoDeRecursoEmDias: 30 });

  function completo(): { readonly pd: PedidoDeAcesso; readonly fatos: readonly FatoDoPedido[] } {
    const pd = pedido({ id: "ped-proj", protocolo: "77/2026" });
    let fatos = aplicar(pd, c, [protocolado(pd)], {
      natureza: "PEDIDO_DISTRIBUIDO",
      setorDestinoId: `setor-${SEGREDO}`,
      fundamentoInterno: `Encaminhamento: ${SEGREDO}`,
    }, { ator: `servidor-${SEGREDO}` });
    fatos = aplicar(pd, c, fatos, RECEBER, { ator: `servidor-${SEGREDO}` });
    fatos = aplicar(pd, c, fatos, { natureza: "RESPOSTA_PREVIA_REGISTRADA", fundamentoInterno: `Minuta: ${SEGREDO}` }, { ator: `servidor-${SEGREDO}` });
    fatos = aplicar(pd, c, fatos, {
      natureza: "RESPOSTA_ENTREGUE",
      classificacao: "ACESSO_PARCIAL",
      mensagemAoRequerente: "Parte da informação segue em anexo; a outra parte foi negada.",
      fundamentoInterno: `Restrição: ${SEGREDO}`,
      documentoId: "anexo-9",
    }, { em: D("2026-09-05"), ator: `servidor-${SEGREDO}` });
    fatos = aplicar(pd, c, fatos, { natureza: "RECURSO_INTERPOSTO", mensagemAoRequerente: "A negativa não indica a norma." }, { em: D("2026-09-06"), ator: "REQUERENTE" });
    fatos = aplicar(pd, c, fatos, {
      natureza: "RECURSO_DECIDIDO",
      resultadoDoRecurso: "PROVIDO_EM_PARTE",
      mensagemAoRequerente: "Recurso provido em parte; segue o complemento.",
      fundamentoInterno: `Deliberação: ${SEGREDO}`,
    }, { em: D("2026-09-08"), ator: `servidor-${SEGREDO}` });
    return { pd, fatos };
  }

  it("p18 — PROPRIEDADE: nada de interno atravessa para o requerente, e não por lista de exclusão", () => {
    const { pd, fatos } = completo();
    const visao = visaoDoSolicitante(pd, c, fatos, D("2026-09-09"));
    const serializada = JSON.stringify(visao);

    // ⚠️ A AFIRMAÇÃO É DE PROPRIEDADE, NÃO DE CAMPO: qualquer campo interno que passasse a entrar
    // na projeção carregaria o sentinela junto, e este caso acusaria — inclusive um campo que
    // ainda não existe hoje.
    expect(serializada).not.toContain(SEGREDO);
    // ANTIVACUIDADE: o sentinela ESTÁ nos fatos e ESTÁ na projeção interna. Sem isto, o caso
    // passaria por vacuidade no dia em que a fixture deixasse de carregá-lo.
    expect(JSON.stringify(fatos)).toContain(SEGREDO);
    expect(JSON.stringify(visaoInternaDoPedido(pd, c, fatos, "setor-entrada", D("2026-09-09")))).toContain(SEGREDO);
  });

  it("p19 — a prévia não existe para o requerente, e a resposta entregue existe", () => {
    const { pd, fatos } = completo();
    const visao = visaoDoSolicitante(pd, c, fatos, D("2026-09-09"));
    expect(visao.resposta?.classificacao).toBe("ACESSO_PARCIAL");
    expect(visao.resposta?.mensagem).toContain("segue em anexo");
    expect(visao.resposta?.temDocumento).toBe(true);
    expect(visao.recursos).toHaveLength(1);
    expect(visao.recursos[0]!.decisao?.resultado).toBe("PROVIDO_EM_PARTE");
    expect(JSON.stringify(visao)).not.toContain("Minuta");
    // A trilha interna, essa, mostra a prévia — ela é trabalho do setor, e fica registrada.
    const interna = visaoInternaDoPedido(pd, c, fatos, "setor-entrada", D("2026-09-09"));
    expect(interna.trilha.some((l) => l.natureza === "RESPOSTA_PREVIA_REGISTRADA")).toBe(true);
  });

  it("p20 — o encaminhamento interno não vira notícia do requerente", () => {
    const pd = pedido({ id: "ped-20" });
    const fatos = aplicar(pd, c, [protocolado(pd)], ENCAMINHAR);
    expect(situacaoDoPedido(fatos)).toBe("EM_DISTRIBUICAO");
    expect(situacaoParaSolicitante(situacaoDoPedido(fatos))).toBe("PROTOCOLADO");
    const visao = visaoDoSolicitante(pd, c, fatos, D("2026-09-03"));
    expect(visao.situacao).toBe("PROTOCOLADO");
    expect(JSON.stringify(visao)).not.toContain("setor-transparencia");
    // Mas a visão interna sabe onde ele está — é a mesa de alguém.
    expect(visaoInternaDoPedido(pd, c, fatos, "setor-entrada", D("2026-09-03")).setorAtualId).toBe("setor-transparencia");
  });

  it("p21 — a norma obedecida vai junto com a data, nos dois lados", () => {
    const pd = pedido({ id: "ped-21" });
    const cc = config({ versao: 1, normaFederal: "Norma de teste, art. 9" });
    const fatos = [protocolado(pd)];
    expect(visaoDoSolicitante(pd, cc, fatos, D("2026-09-02")).normaFederal).toBe("Norma de teste, art. 9");
    expect(visaoInternaDoPedido(pd, cc, fatos, "setor-entrada", D("2026-09-02")).prazo.normaFederal).toBe("Norma de teste, art. 9");
  });

  it("p22 — sem configuração, o requerente lê POR QUE não há data — e o pedido continua correndo", () => {
    const pd = pedido({ id: "ped-22", configuracaoVersao: null });
    const visao = visaoDoSolicitante(pd, null, [protocolado(pd)], D("2026-09-20"));
    expect(visao.limite).toBeNull();
    expect(visao.situacaoDoPrazo).toBe("SEM_PRAZO");
    expect(visao.avisos).toHaveLength(1);
    expect(visao.avisos[0]).toContain("continua podendo ser recebido");
    expect(visao.situacao).toBe("PROTOCOLADO");
  });
});

describe("V5.3 — os instrumentos, e a prova de que acusam", () => {
  it("p23 — TRIPWIRE: nenhum prazo de norma escrito dentro do domínio do pedido", () => {
    // ⚠️ A propriedade é a FORMA de um prazo cravado — um número seguido de "dia"/"dias" no texto
    // do módulo —, não uma lista de números conhecidos. Enumerar os números que se citam de cabeça
    // acharia só esses, e o número de um decreto municipal entraria em silêncio.
    const padrao = /\b\d+\s*dias?\b/gi;
    const alvo = fileURLToPath(new URL("./pedido-de-acesso.ts", import.meta.url));
    const fonte = readFileSync(alvo, "utf8");
    expect(fonte.match(padrao) ?? []).toEqual([]);

    // ANTIVACUIDADE: o instrumento ACUSA. Um regex que não casa com nada nunca reprova ninguém —
    // já houve quatro defeitos dentro de instrumentos de medição neste repositório.
    // ⚠️ E O CONTROLE PRECISA TER A FORMA QUE O PADRÃO VARRE. A primeira versão deste caso usava
    // "const PRAZO = 20; // vinte dias corridos" — o número e a palavra estavam na mesma linha, mas
    // NÃO adjacentes, e o padrão não casava: o caso reprovava o próprio controle. O achado é do
    // teste, e ele delimita a reach real do instrumento: ele pega "N dias" grudado, não um número
    // solto cujo sentido esteja num comentário ao lado.
    const controle = "const PRAZO_DE_RESPOSTA = 20; // o prazo é de 20 dias corridos";
    expect(controle.match(padrao) ?? []).not.toEqual([]);
  });

  it("p24 — TRIPWIRE: o domínio não lê o relógio nem o banco por dentro", () => {
    const alvo = fileURLToPath(new URL("./pedido-de-acesso.ts", import.meta.url));
    const fonte = readFileSync(alvo, "utf8");
    // `agora` é parâmetro em toda função de prazo; um `Date.now()` aqui tornaria a suíte um
    // oráculo do dia em que ela roda.
    expect(fonte).not.toContain("Date.now(");
    expect(fonte).not.toContain("new Date(");
    expect(fonte).not.toContain("@prisma/client");
    expect(fonte).not.toContain("prisma");
  });

  it("p25 — a régua não escreve: mesma entrada, mesma saída, e a entrada intacta", () => {
    const pd = pedido({ id: "ped-25" });
    const c = config({ versao: 1 });
    const fatos = aplicar(pd, c, [protocolado(pd)], ENCAMINHAR, { chave: chaveDoFato("ped-25", "PEDIDO_DISTRIBUIDO", "x") });
    const antes = JSON.stringify({ c, fatos });
    const a = visaoDoSolicitante(pd, c, fatos, D("2026-09-05"));
    const b = visaoDoSolicitante(pd, c, fatos, D("2026-09-05"));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify({ c, fatos })).toBe(antes);
  });
});
