import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { meioDiaCivil } from "../../../packages/datas/index.js";
import {
  camposVigentes,
  conferirConsistencia,
  conferirEvento,
  DESCRICAO_DA_ORIGEM,
  EXTRATOR,
  escolherLeiauteVigente,
  eventosVigentes,
  LeiauteAmbiguoError,
  rotaDeCorrecao,
  SEM_EVENTO_VIGENTE,
  SEM_LEIAUTE,
  TODAS_AS_ORIGENS,
  type CampoLido,
  type EventoLido,
  type LeiauteLido,
  type LinhaDeOrigem,
  type Obrigatoriedade,
  type OrigemDoCampo,
} from "./leiaute.js";

/**
 * ⚠️ O LEIAUTE DESTES TESTES É FICTÍCIO, E DE PROPÓSITO. "X-9001" não é evento do eSocial e
 * nunca será: usar "S-1200" aqui plantaria no repositório um código normativo que ninguém
 * conferiu contra a fonte oficial, e o próximo leitor o copiaria para dentro do gerador. O que
 * está sob teste é a MÁQUINA (escolher pacote, respeitar vigência por evento, achar origem
 * vazia), não o conteúdo do leiaute — que vem de fora, por INSERT, com sha256 e conferente.
 */

const D = (dia: string): Date => meioDiaCivil(dia);

function campo(p: Partial<CampoLido> & { readonly origem: OrigemDoCampo; readonly obrigatoriedade: Obrigatoriedade }): CampoLido {
  return {
    id: p.id ?? `c-${p.origem}`,
    caminho: p.caminho ?? `x/${p.origem}`,
    rotulo: p.rotulo ?? DESCRICAO_DA_ORIGEM[p.origem].rotulo,
    origem: p.origem,
    obrigatoriedade: p.obrigatoriedade,
    condicao: p.condicao ?? null,
    regra: p.regra ?? null,
    vigenciaInicio: p.vigenciaInicio ?? null,
    vigenciaFim: p.vigenciaFim ?? null,
  };
}

function evento(p: Partial<EventoLido> & { readonly codigo: string }): EventoLido {
  return {
    id: p.id ?? `e-${p.codigo}`,
    codigo: p.codigo,
    nome: p.nome ?? "Evento de teste",
    xsdArquivo: p.xsdArquivo ?? null,
    xsdSha256: p.xsdSha256 ?? null,
    vigenciaInicio: p.vigenciaInicio ?? D("2026-01-01"),
    vigenciaFim: p.vigenciaFim ?? null,
    campos: p.campos ?? [],
  };
}

function pacote(p: Partial<LeiauteLido> & { readonly versao: string }): LeiauteLido {
  return {
    id: p.id ?? `l-${p.versao}`,
    versao: p.versao,
    ambiente: p.ambiente ?? "PRODUCAO",
    fonte: p.fonte ?? "https://exemplo.invalido/pacote",
    sha256: p.sha256 ?? "a".repeat(64),
    arquivo: p.arquivo ?? "pacote.zip",
    publicadoEm: p.publicadoEm ?? D("2026-01-01"),
    eventos: p.eventos ?? [],
  };
}

/** ⚠️ FIXTURE N=2: duas pessoas, com faltas DIFERENTES. Com uma só, "achou a pendência" não
 * distingue "achou a pendência daquela pessoa" de "achou uma pendência qualquer". */
const ADA: LinhaDeOrigem = {
  servidorId: "srv-ada",
  vinculoId: "vin-ada",
  identificacao: "Ada — matrícula 1001",
  cpf: "11111111111",
  nome: "Ada",
  nomeSocial: null,
  dataNascimento: D("1980-05-02"),
  sexo: "FEMININO",
  nis: null, // falta o NIS
  nomeMae: "Mae da Ada",
  nomePai: null,
  matricula: "1001",
  dataAdmissao: D("2015-03-01"),
  tipoDeVinculo: "EFETIVO",
  regimeJuridico: "Estatutário",
  regimePrevidenciario: "RPPS",
  cnpjDoEnte: "11222333000181",
};

const BENTO: LinhaDeOrigem = {
  ...ADA,
  servidorId: "srv-bento",
  vinculoId: "vin-bento",
  identificacao: "Bento — matrícula 1002",
  nis: "22222222222",
  nomeMae: "   ", // só espaço: presença aparente, ausência real
  matricula: "1002",
};

describe("V2.1 — a escolha do pacote de leiaute", () => {
  it("e1 — sem pacote registrado, a resposta é recusa NOMEADA, não lista vazia", () => {
    const r = conferirConsistencia([], [ADA, BENTO], { ambiente: "PRODUCAO", dia: D("2026-09-18") });
    expect(r.leiaute).toBeNull();
    expect(r.indisponivel).toBe(SEM_LEIAUTE);
    expect(r.pendencias).toHaveLength(0);
    expect(r.vinculosConferidos).toBe(0);
    // ⚠️ O MOTIVO, não só o resultado: "zero pendências" e "não há leiaute" são opostos.
    expect(r.indisponivel).toMatch(/documento oficial da União/);
  });

  it("e2 — o ambiente NÃO cai de volta: pacote de produção não atende a produção restrita", () => {
    const leiautes = [pacote({ versao: "V-A", ambiente: "PRODUCAO" })];
    expect(escolherLeiauteVigente(leiautes, { ambiente: "PRODUCAO_RESTRITA", dia: D("2026-09-18") })).toBeNull();
    expect(escolherLeiauteVigente(leiautes, { ambiente: "PRODUCAO", dia: D("2026-09-18") })?.versao).toBe("V-A");
  });

  it("e3 — pacote publicado DEPOIS do dia consultado não vale", () => {
    const leiautes = [pacote({ versao: "V-A", publicadoEm: D("2026-10-01") })];
    expect(escolherLeiauteVigente(leiautes, { ambiente: "PRODUCAO", dia: D("2026-09-30") })).toBeNull();
    expect(escolherLeiauteVigente(leiautes, { ambiente: "PRODUCAO", dia: D("2026-10-01") })?.versao).toBe("V-A");
  });

  it("e4 — N=2 pacotes: vence o de publicação mais recente que não é futura", () => {
    const leiautes = [
      pacote({ versao: "V-A", publicadoEm: D("2026-01-01") }),
      pacote({ versao: "V-B", publicadoEm: D("2026-06-01") }),
    ];
    expect(escolherLeiauteVigente(leiautes, { ambiente: "PRODUCAO", dia: D("2026-09-18") })?.versao).toBe("V-B");
    expect(escolherLeiauteVigente(leiautes, { ambiente: "PRODUCAO", dia: D("2026-05-31") })?.versao).toBe("V-A");
  });

  it("e5 — N=2 pacotes empatados na publicação: RECUSA, não escolha por ordem de array", () => {
    const leiautes = [
      pacote({ versao: "V-A", sha256: "a".repeat(64), publicadoEm: D("2026-06-01") }),
      pacote({ versao: "V-B", sha256: "b".repeat(64), publicadoEm: D("2026-06-01") }),
    ];
    expect(() => escolherLeiauteVigente(leiautes, { ambiente: "PRODUCAO", dia: D("2026-09-18") })).toThrow(LeiauteAmbiguoError);
    try {
      escolherLeiauteVigente(leiautes, { ambiente: "PRODUCAO", dia: D("2026-09-18") });
    } catch (e) {
      expect((e as Error).message).toContain("V-A");
      expect((e as Error).message).toContain("V-B");
    }
    // E a ordem inversa dá o MESMO resultado — é isso que prova que não escolheu pelo índice.
    expect(() => escolherLeiauteVigente([...leiautes].reverse(), { ambiente: "PRODUCAO", dia: D("2026-09-18") })).toThrow(LeiauteAmbiguoError);
  });
});

describe("V2.1 — a vigência é do EVENTO, não da publicação do pacote", () => {
  it("e6 — pacote publicado, evento com entrada futura: o evento NÃO entra", () => {
    const l = pacote({
      versao: "V-A",
      publicadoEm: D("2026-06-01"),
      eventos: [evento({ codigo: "X-9001", vigenciaInicio: D("2027-01-01") })],
    });
    expect(eventosVigentes(l, D("2026-09-18"))).toHaveLength(0);
    expect(eventosVigentes(l, D("2027-01-01"))).toHaveLength(1);
  });

  it("e7 — evento com vigência encerrada não entra", () => {
    const l = pacote({
      versao: "V-A",
      eventos: [evento({ codigo: "X-9001", vigenciaInicio: D("2026-01-01"), vigenciaFim: D("2026-08-31") })],
    });
    expect(eventosVigentes(l, D("2026-08-31"))).toHaveLength(1);
    expect(eventosVigentes(l, D("2026-09-01"))).toHaveLength(0);
  });

  it("e8 — pacote registrado sem evento vigente: recusa com motivo PRÓPRIO, distinto do e1", () => {
    const l = pacote({ versao: "V-A", eventos: [evento({ codigo: "X-9001", vigenciaInicio: D("2027-01-01") })] });
    const r = conferirConsistencia([l], [ADA], { ambiente: "PRODUCAO", dia: D("2026-09-18") });
    expect(r.leiaute?.versao).toBe("V-A");
    expect(r.indisponivel).toBe(SEM_EVENTO_VIGENTE);
    expect(r.indisponivel).not.toBe(SEM_LEIAUTE);
    expect(r.pendencias).toHaveLength(0);
  });

  it("e14 — campo com vigência PRÓPRIA futura não entra, mesmo com o evento vigente", () => {
    const e = evento({
      codigo: "X-9001",
      vigenciaInicio: D("2026-01-01"),
      campos: [
        campo({ origem: "NIS_DO_TRABALHADOR", obrigatoriedade: "OBRIGATORIO" }),
        campo({ origem: "NOME_DO_PAI", obrigatoriedade: "OBRIGATORIO", vigenciaInicio: D("2027-01-01") }),
      ],
    });
    expect(camposVigentes(e, D("2026-09-18")).map((c) => c.origem)).toEqual(["NIS_DO_TRABALHADOR"]);
    expect(camposVigentes(e, D("2027-01-01")).map((c) => c.origem)).toEqual(["NIS_DO_TRABALHADOR", "NOME_DO_PAI"]);
  });

  it("e15 — campo sem vigência própria HERDA a do evento, e a herança é das duas pontas", () => {
    const e = evento({
      codigo: "X-9001",
      vigenciaInicio: D("2026-03-01"),
      vigenciaFim: D("2026-08-31"),
      campos: [campo({ origem: "NIS_DO_TRABALHADOR", obrigatoriedade: "OBRIGATORIO" })],
    });
    expect(camposVigentes(e, D("2026-02-28"))).toHaveLength(0);
    expect(camposVigentes(e, D("2026-03-01"))).toHaveLength(1);
    expect(camposVigentes(e, D("2026-08-31"))).toHaveLength(1);
    expect(camposVigentes(e, D("2026-09-01"))).toHaveLength(0);
  });
});

describe("V2.1 — a consistência acha a origem vazia e diz onde corrigir", () => {
  const eventoCompleto = evento({
    codigo: "X-9001",
    nome: "Evento de teste",
    campos: [
      campo({ origem: "CPF_DO_TRABALHADOR", obrigatoriedade: "OBRIGATORIO", caminho: "x/ideTrab/cpf" }),
      campo({ origem: "NIS_DO_TRABALHADOR", obrigatoriedade: "OBRIGATORIO", caminho: "x/ideTrab/nis" }),
      campo({ origem: "NOME_DA_MAE", obrigatoriedade: "OBRIGATORIO", caminho: "x/ideTrab/mae" }),
      campo({ origem: "NOME_DO_PAI", obrigatoriedade: "CONDICIONAL", caminho: "x/ideTrab/pai", condicao: "Obrigatório quando constar do registro civil." }),
      campo({ origem: "NOME_SOCIAL_DO_TRABALHADOR", obrigatoriedade: "FACULTATIVO", caminho: "x/ideTrab/social" }),
    ],
  });

  it("e9 — campo OBRIGATÓRIO vazio vira AUSENTE, com rota e sugestão de cadastro", () => {
    const p = conferirEvento(eventoCompleto, eventoCompleto.campos, ADA).filter((x) => x.origem === "NIS_DO_TRABALHADOR");
    expect(p).toHaveLength(1);
    expect(p[0]!.tipo).toBe("AUSENTE");
    expect(p[0]!.caminho).toBe("x/ideTrab/nis");
    expect(p[0]!.rota).toBe("/pessoal/servidores/srv-ada");
    expect(p[0]!.sugestao).toContain("PIS/PASEP");
    expect(p[0]!.erro).toContain("X-9001");
  });

  it("e10 — campo CONDICIONAL vazio vira CONFERIR, com a condição TRANSCRITA, nunca avaliada", () => {
    const p = conferirEvento(eventoCompleto, eventoCompleto.campos, ADA).filter((x) => x.origem === "NOME_DO_PAI");
    expect(p).toHaveLength(1);
    expect(p[0]!.tipo).toBe("CONFERIR");
    expect(p[0]!.textoDoLeiaute).toBe("Obrigatório quando constar do registro civil.");
    expect(p[0]!.erro).toContain("não avalia a condição");
  });

  it("e11 — campo FACULTATIVO vazio não gera pendência nenhuma", () => {
    const p = conferirEvento(eventoCompleto, eventoCompleto.campos, ADA);
    expect(p.some((x) => x.origem === "NOME_SOCIAL_DO_TRABALHADOR")).toBe(false);
  });

  it("e12 — campo preenchido não gera pendência", () => {
    const p = conferirEvento(eventoCompleto, eventoCompleto.campos, ADA);
    expect(p.some((x) => x.origem === "CPF_DO_TRABALHADOR")).toBe(false);
  });

  it("e16 — string de espaços conta como AUSENTE: presença aparente não é preenchimento", () => {
    const p = conferirEvento(eventoCompleto, eventoCompleto.campos, BENTO).filter((x) => x.origem === "NOME_DA_MAE");
    expect(p).toHaveLength(1);
    expect(p[0]!.tipo).toBe("AUSENTE");
    // e a Ada, que TEM o nome da mãe, não aparece por esse campo
    expect(conferirEvento(eventoCompleto, eventoCompleto.campos, ADA).some((x) => x.origem === "NOME_DA_MAE")).toBe(false);
  });

  it("e13 — N=2 vínculos: cada pendência sai identificada pela SUA pessoa e pelo SEU vínculo", () => {
    const l = pacote({ versao: "V-A", eventos: [eventoCompleto] });
    const r = conferirConsistencia([l], [ADA, BENTO], { ambiente: "PRODUCAO", dia: D("2026-09-18") });
    expect(r.indisponivel).toBeNull();
    expect(r.vinculosConferidos).toBe(2);

    const daAda = r.pendencias.filter((p) => p.vinculoId === "vin-ada");
    const doBento = r.pendencias.filter((p) => p.vinculoId === "vin-bento");
    // Ada: falta NIS (AUSENTE) + pai condicional (CONFERIR). Bento: falta mãe + pai condicional.
    expect(daAda.filter((p) => p.tipo === "AUSENTE").map((p) => p.origem)).toEqual(["NIS_DO_TRABALHADOR"]);
    expect(doBento.filter((p) => p.tipo === "AUSENTE").map((p) => p.origem)).toEqual(["NOME_DA_MAE"]);
    expect(daAda.every((p) => p.identificacao === "Ada — matrícula 1001")).toBe(true);
    expect(doBento.every((p) => p.identificacao === "Bento — matrícula 1002")).toBe(true);
  });

  it("e17 — a rota de correção aponta ao ALVO do campo: servidor, vínculo ou ente", () => {
    expect(rotaDeCorrecao("NIS_DO_TRABALHADOR", ADA)).toBe("/pessoal/servidores/srv-ada");
    expect(rotaDeCorrecao("MATRICULA_DO_VINCULO", ADA)).toBe("/pessoal/vinculos/vin-ada");
    expect(rotaDeCorrecao("CNPJ_DO_ENTE", ADA)).toBe("/administracao/ente");
  });
});

describe("V2.1 — os instrumentos, e a prova de que acusam", () => {
  it("e18 — o universo das origens é FECHADO: extrator e descrição para cada uma, e nada além", () => {
    expect(TODAS_AS_ORIGENS.length).toBeGreaterThan(0);
    for (const o of TODAS_AS_ORIGENS) {
      expect(typeof EXTRATOR[o]).toBe("function");
      expect(DESCRICAO_DA_ORIGEM[o].rotulo.length).toBeGreaterThan(0);
      expect(DESCRICAO_DA_ORIGEM[o].onde.length).toBeGreaterThan(0);
      expect(DESCRICAO_DA_ORIGEM[o].rota.startsWith("/")).toBe(true);
    }
    expect(Object.keys(EXTRATOR).sort()).toEqual([...TODAS_AS_ORIGENS].sort());
  });

  it("e19 — TRIPWIRE: nenhum código de evento do eSocial escrito dentro do domínio", () => {
    // ⚠️ ESTE É O INSTRUMENTO QUE VIGIA A REGRA QUE ORIGINOU O BLOCO — e ele ACUSOU na primeira
    // execução, contra um código que o comentário do próprio domínio citava como exemplo do que
    // não deveria estar lá. O leiaute do eSocial não está no repositório; um código de evento
    // aparecendo no domínio significa que alguém o escreveu de memória, e o próximo leitor o
    // copiaria para dentro de um gerador. A propriedade afirmada
    // é a FORMA do código no leiaute (letra, hífen, quatro dígitos), não uma lista de códigos
    // conhecidos — enumerar acharia só os enumerados.
    const alvo = fileURLToPath(new URL("./leiaute.ts", import.meta.url));
    const fonte = readFileSync(alvo, "utf8");
    const achados = fonte.match(/\bS-\d{4}\b/g) ?? [];
    expect(achados).toEqual([]);
  });

  it("e20 — a consistência não escreve: mesma entrada, mesma saída, e a entrada intacta", () => {
    const l = pacote({ versao: "V-A", eventos: [evento({ codigo: "X-9001", campos: [campo({ origem: "NIS_DO_TRABALHADOR", obrigatoriedade: "OBRIGATORIO" })] })] });
    const antes = JSON.stringify([l, ADA]);
    const a = conferirConsistencia([l], [ADA], { ambiente: "PRODUCAO", dia: D("2026-09-18") });
    const b = conferirConsistencia([l], [ADA], { ambiente: "PRODUCAO", dia: D("2026-09-18") });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify([l, ADA])).toBe(antes);
  });
});
