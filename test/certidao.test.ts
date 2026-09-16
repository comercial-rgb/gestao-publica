import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { cadastrarPessoa } from "../modules/m19-pessoas/servico.js";
import { criarM19Deps } from "../modules/m19-pessoas/adapter-prisma.js";
import { cadastrarImovel, vincularPessoaAoImovel } from "../modules/m34-tributario/cadastro-imobiliario.js";
import { publicarTabelaDeParametros } from "../modules/m34-tributario/simulacao.js";
import {
  constituirCreditoTributario,
  lancamentosDoLote,
  prepararLoteDeLancamento,
} from "../modules/m34-tributario/lancamento.js";
import {
  BASES_DA_CERTIDAO,
  conferirAutenticidade,
  configurarCertidao,
  decidirCertidao,
  levantarCobertura,
  mascarar,
  solicitarCertidao,
  sugestaoDaCobertura,
  type LinhaDaCobertura,
} from "../modules/m34-tributario/certidao.js";

/**
 * ═══ M34 B2.4 — A CERTIDÃO (V10 T2 · N5) ═══
 *
 * ⚠️ O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR É UM SÓ: **a negativa falsa.**
 *
 * "Não achei dívida" e "não olhei" produzem a mesma tela e são coisas opostas para quem assina.
 * Uma certidão negativa é a declaração do município de que aquela pessoa nada deve — e este
 * sistema, hoje, não alcança a dívida ativa por pessoa, não tem parcelamento e não tem cadastro
 * econômico. Emitir negativa "porque nada apareceu" seria declarar o que não se conferiu.
 *
 * Os testes C3, C4 e C5 são os que valem: sem cobertura completa, o sistema NÃO sugere negativa
 * e NÃO deixa emiti-la sem a declaração de quem conferiu fora daqui.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => prisma.$disconnect());

const POR = "tributos@cg.pb.gov.br";
const NAT_IPTU = "11130111";
const FONTE = "fonte-500";
const CPF_DEVEDOR = "529.982.247-25";
const CPF_LIMPO_DEVEDOR = "52998224725";
const CPF_QUITE = "111.444.777-35";
const CPF_LIMPO_QUITE = "11144477735";

const FORMULA = "areaDoTerreno * valorDoM2Terreno * aliquota";

async function semear(): Promise<{ readonly imovelId: string }> {
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-cr", codigo: "1.1.2.1.1.00.00", nome: "Crédito a receber", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-vpa", codigo: "4.1.1.1.1.00.00", nome: "VPA — impostos", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-vpd", codigo: "3.6.1.1.1.00.00", nome: "VPD — perda", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.naturezaReceita.create({ data: { id: "nr-iptu", codigo: NAT_IPTU, descricao: "IPTU" } });
  await prisma.fonteRecurso.create({ data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await prisma.roteiroReconhecimento.create({
    data: {
      origem: "IMPOSTOS_TAXAS_CONTRIBUICOES_DE_MELHORIA",
      contaCreditoAReceberId: "c-cr", contaVpaId: "c-vpa", contaVpdId: "c-vpd", criadoPor: POR,
    },
  });

  const deps = criarM19Deps(prisma);
  await cadastrarPessoa({ documento: CPF_DEVEDOR, nome: "Maria da Silva", criadoPor: POR }, deps);
  await cadastrarPessoa({ documento: CPF_QUITE, nome: "Joao Pereira", criadoPor: POR }, deps);

  const imovel = await cadastrarImovel(prisma, {
    inscricao: "01.001.0001", vigenciaInicio: "2020-01-01", motivo: "Cadastro inicial do imovel",
    logradouro: "Rua das Flores", numero: "100", bairro: "Centro",
    uso: "TERRITORIAL", areaDoTerreno: "200.0000", areaConstruida: "0.0000", criadoPor: POR,
  });
  await vincularPessoaAoImovel(prisma, {
    imovelId: imovel.imovelId, pessoaDocumento: CPF_LIMPO_DEVEDOR, papel: "PROPRIETARIO",
    fracao: "1.000000", vigenciaInicio: "2020-01-01", motivo: "Escritura registrada", criadoPor: POR,
  });
  await publicarTabelaDeParametros(prisma, {
    tributo: "IPTU", exercicio: 2026, vigenciaInicio: "2026-01-01",
    fundamento: "Regra SINTETICA do teste — nao e lei de municipio nenhum",
    motivo: "Tabela do exercicio", formula: FORMULA,
    parametros: [
      { chave: "valorDoM2Terreno", valor: "100.000000", descricao: "Valor do m2" },
      { chave: "aliquota", valor: "0.010000", descricao: "Aliquota" },
    ],
    criadoPor: POR,
  });
  return { imovelId: imovel.imovelId };
}

async function lancarEConstituir(imovelId: string): Promise<void> {
  const r = await prepararLoteDeLancamento(prisma, {
    numero: "IPTU/2026/001", tributo: "IPTU", exercicio: 2026, fatoGerador: "2026-01-01",
    descricao: "Lancamento do IPTU de 2026", naturezaCodigo: NAT_IPTU, fonteId: FONTE,
    vencimentos: ["2026-03-10"], criadoPor: POR, imoveisIds: [imovelId],
  });
  const ls = await lancamentosDoLote(prisma, r.loteId);
  await constituirCreditoTributario(prisma, { lancamentoId: ls[0]!.id, criadoPor: POR });
}

async function configurar(): Promise<void> {
  await configurarCertidao(prisma, {
    vigenciaInicio: "2020-01-01",
    validadeEmDias: 60,
    fundamento: "Artigo SINTETICO do teste — nao e lei de municipio nenhum",
    criadoPor: POR,
  });
}

beforeEach(async () => {
  await limparBanco(prisma);
});

// ════════════════════════════════════════════════════════════════════════════
// C1–C2 — A COBERTURA É UM CENSO, E ELA APARECE
// ════════════════════════════════════════════════════════════════════════════

describe("C1 — a cobertura declara TODAS as bases, inclusive as que não alcança", () => {
  it("toda base do censo vira uma linha, e as não alcançadas dizem por quê", async () => {
    await semear();
    const pessoa = await prisma.pessoa.findUniqueOrThrow({ where: { documento: CPF_LIMPO_QUITE }, select: { id: true } });
    const cobertura = await levantarCobertura(prisma, { pessoaId: pessoa.id, imovelId: null });

    expect(cobertura.map((c) => c.base)).toEqual(BASES_DA_CERTIDAO.map((b) => b.id));
    const fora = cobertura.filter((c) => c.situacao === "FORA_DO_ALCANCE");
    // ⚠️ TRÊS BASES FORA DO ALCANCE, e é a verdade de hoje: dívida ativa por pessoa,
    // parcelamento e cadastro econômico não existem neste sistema.
    expect(fora.map((c) => c.base)).toEqual(["DIVIDA_ATIVA", "PARCELAMENTO", "CADASTRO_ECONOMICO_ISS"]);
    for (const f of fora) expect(f.detalhe.length).toBeGreaterThan(40);
  });

  it("⚠️ base alcançada que ESTOURA vira INDISPONIVEL, e nunca 'nada devido'", async () => {
    await semear();
    // O `catch` que devolve vazio é como a negativa falsa acontece na prática. Aqui o cliente
    // é substituído por um que estoura na consulta dos lançamentos.
    const quebrado = {
      ...prisma,
      lancamentoTributario: {
        findMany: async (): Promise<never> => {
          throw new Error("conexao perdida com o banco");
        },
      },
    } as unknown as typeof prisma;
    const pessoa = await prisma.pessoa.findUniqueOrThrow({ where: { documento: CPF_LIMPO_QUITE }, select: { id: true } });
    const cobertura = await levantarCobertura(quebrado, { pessoaId: pessoa.id, imovelId: null });
    const linha = cobertura.find((c) => c.base === "LANCAMENTO_TRIBUTARIO");
    expect(linha?.situacao).toBe("INDISPONIVEL");
    expect(linha?.detalhe).toMatch(/conexao perdida/);
    expect(linha?.pendencias).toBeNull();
  });
});

describe("C2 — a sugestão segue a cobertura, e nunca a atropela", () => {
  const linha = (base: string, situacao: LinhaDaCobertura["situacao"]): LinhaDaCobertura => ({
    base: base as LinhaDaCobertura["base"], nome: base, situacao, detalhe: "—", pendencias: null,
  });

  it("tudo consultado e limpo = NEGATIVA", () => {
    const s = sugestaoDaCobertura([linha("LANCAMENTO_TRIBUTARIO", "SEM_PENDENCIA"), linha("CREDITO_RECONHECIDO", "SEM_PENDENCIA")]);
    expect(s.sugestao).toBe("NEGATIVA");
    expect(s.pendencia).toBeNull();
  });

  it("⚠️ uma base FORA DO ALCANCE, com tudo o mais limpo, NÃO vira negativa", () => {
    const s = sugestaoDaCobertura([linha("LANCAMENTO_TRIBUTARIO", "SEM_PENDENCIA"), linha("DIVIDA_ATIVA", "FORA_DO_ALCANCE")]);
    expect(s.sugestao).toBe("ANALISE");
    expect(s.pendencia).toMatch(/NÃO emite negativa sobre base que não leu/);
  });

  it("⚠️ uma base INDISPONIVEL, com tudo o mais limpo, também NÃO vira negativa", () => {
    const s = sugestaoDaCobertura([linha("LANCAMENTO_TRIBUTARIO", "SEM_PENDENCIA"), linha("CREDITO_RECONHECIDO", "INDISPONIVEL")]);
    expect(s.sugestao).toBe("ANALISE");
  });

  it("débito manda em tudo: com pendência, a sugestão é POSITIVA mesmo com base sem resposta", () => {
    const s = sugestaoDaCobertura([linha("LANCAMENTO_TRIBUTARIO", "COM_PENDENCIA"), linha("DIVIDA_ATIVA", "FORA_DO_ALCANCE")]);
    expect(s.sugestao).toBe("POSITIVA");
    expect(s.pendencia).toMatch(/art. 206 do CTN/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// C3 — O PEDIDO
// ════════════════════════════════════════════════════════════════════════════

describe("C3 — o pedido registra o que leu, e não emite nada", () => {
  it("quem deve aparece com débito; quem não deve, sem — e nenhum dos dois vira certidão", async () => {
    const { imovelId } = await semear();
    await lancarEConstituir(imovelId);

    const devedor = await solicitarCertidao(prisma, { documento: CPF_LIMPO_DEVEDOR, criadoPor: POR });
    expect(devedor.sugestao).toBe("POSITIVA");
    expect(devedor.cobertura.find((c) => c.base === "LANCAMENTO_TRIBUTARIO")?.situacao).toBe("COM_PENDENCIA");
    expect(devedor.cobertura.find((c) => c.base === "CREDITO_RECONHECIDO")?.situacao).toBe("COM_PENDENCIA");

    // FIXTURE N=2: a segunda pessoa, sem débito, para provar que a regra distingue.
    const quite = await solicitarCertidao(prisma, { documento: CPF_LIMPO_QUITE, criadoPor: POR });
    expect(quite.sugestao).toBe("ANALISE");
    expect(quite.cobertura.find((c) => c.base === "LANCAMENTO_TRIBUTARIO")?.situacao).toBe("SEM_PENDENCIA");

    // ⚠️ NENHUM DOS DOIS FOI EMITIDO. Pedir não emite.
    const emitidas = await prisma.solicitacaoDeCertidao.count({ where: { situacao: "EMITIDA" } });
    expect(emitidas).toBe(0);
  });

  it("a chave de autenticidade tem 64 hex e não se repete", async () => {
    await semear();
    const a = await solicitarCertidao(prisma, { documento: CPF_LIMPO_DEVEDOR, criadoPor: POR });
    const b = await solicitarCertidao(prisma, { documento: CPF_LIMPO_QUITE, criadoPor: POR });
    expect(a.chaveDeAutenticidade).toMatch(/^[0-9a-f]{64}$/);
    expect(b.chaveDeAutenticidade).toMatch(/^[0-9a-f]{64}$/);
    expect(a.chaveDeAutenticidade).not.toBe(b.chaveDeAutenticidade);
    // ⚠️ E ELA NÃO É O PROTOCOLO: o protocolo é sequencial e serve ao balcão; a chave é o que
    // um terceiro usa para conferir, e um protocolo sequencial se enumera em minutos.
    expect(a.chaveDeAutenticidade).not.toBe(a.protocolo);
  });

  it("pessoa não cadastrada é recusada — a certidão não cria cadastro de passagem", async () => {
    await semear();
    await expect(
      solicitarCertidao(prisma, { documento: "39053344705", criadoPor: POR })
    ).rejects.toThrow(/PESSOA-NAO-CADASTRADA/);
    expect(await prisma.solicitacaoDeCertidao.count()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// C4 — A DECISÃO: ONDE A NEGATIVA FALSA SERIA EMITIDA
// ════════════════════════════════════════════════════════════════════════════

describe("C4 — a negativa exige cobertura, e a emissão exige configuração", () => {
  it("⚠️ NEGATIVA com base sem resposta e SEM declaração é RECUSADA, e nada é gravado", async () => {
    await semear();
    await configurar();
    const pedido = await solicitarCertidao(prisma, { documento: CPF_LIMPO_QUITE, criadoPor: POR });

    await expect(
      decidirCertidao(prisma, {
        solicitacaoId: pedido.solicitacaoId, decisao: "EMITIR", tipo: "NEGATIVA",
        semValidadeOficial: true, criadoPor: POR,
      })
    ).rejects.toThrow(/NEGATIVA-SEM-COBERTURA/);
    await expect(
      decidirCertidao(prisma, {
        solicitacaoId: pedido.solicitacaoId, decisao: "EMITIR", tipo: "NEGATIVA",
        semValidadeOficial: true, criadoPor: POR,
      })
    ).rejects.toThrow(/Não aparecer e não existir são coisas diferentes/);

    const s = await prisma.solicitacaoDeCertidao.findUniqueOrThrow({ where: { id: pedido.solicitacaoId }, select: { situacao: true, emissao: true } });
    expect(s.situacao).toBe("EM_ANALISE");
    expect(s.emissao).toBeNull();
  });

  it("COM a declaração de conferência, emite — e a declaração vai CONGELADA no documento", async () => {
    await semear();
    await configurar();
    const pedido = await solicitarCertidao(prisma, { documento: CPF_LIMPO_QUITE, criadoPor: POR });
    const DECLARACAO = "Conferi a divida ativa e o cadastro economico no sistema legado em 16/09/2026: nada consta.";

    const r = await decidirCertidao(
      prisma,
      {
        solicitacaoId: pedido.solicitacaoId, decisao: "EMITIR", tipo: "NEGATIVA",
        declaracaoDeConferencia: DECLARACAO, semValidadeOficial: true, criadoPor: POR,
      },
      new Date("2026-09-16T12:00:00-03:00")
    );
    expect(r.situacao).toBe("EMITIDA");
    // ⚠️ 60 DIAS CORRIDOS a partir de 16/09 = 15/11. O prazo vem da CONFIGURAÇÃO, não do código.
    expect(r.validadeAte).toBe("2026-11-15");

    const s = await prisma.solicitacaoDeCertidao.findUniqueOrThrow({ where: { id: pedido.solicitacaoId }, select: { emissao: true, emissaoSha256: true } });
    const emissao = s.emissao as { declaracaoDeConferencia: string; semValidadeOficial: boolean; pessoa: { documento: string } };
    expect(emissao.declaracaoDeConferencia).toBe(DECLARACAO);
    expect(emissao.semValidadeOficial).toBe(true);
    // ⚠️ O CPF SAI MASCARADO ATÉ DENTRO DO DOCUMENTO CONGELADO — este pedido é do Joao.
    expect(emissao.pessoa.documento).toBe("***.444.777-**");
    expect(JSON.stringify(emissao)).not.toContain(CPF_LIMPO_QUITE);
    expect(s.emissaoSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("⚠️ SEM CONFIGURAÇÃO de validade, a emissão é recusada — e o pedido continua de pé", async () => {
    await semear();
    const pedido = await solicitarCertidao(prisma, { documento: CPF_LIMPO_QUITE, criadoPor: POR });
    await expect(
      decidirCertidao(prisma, {
        solicitacaoId: pedido.solicitacaoId, decisao: "EMITIR", tipo: "POSITIVA",
        semValidadeOficial: true, criadoPor: POR,
      })
    ).rejects.toThrow(/CERTIDAO-SEM-CONFIGURACAO/);
    // A mensagem diz o que NÃO se faz — usar 90 dias "porque é o que muitos usam".
    await expect(
      decidirCertidao(prisma, {
        solicitacaoId: pedido.solicitacaoId, decisao: "EMITIR", tipo: "POSITIVA",
        semValidadeOficial: true, criadoPor: POR,
      })
    ).rejects.toThrow(/inventar norma municipal/);

    const s = await prisma.solicitacaoDeCertidao.findUniqueOrThrow({ where: { id: pedido.solicitacaoId }, select: { situacao: true } });
    expect(s.situacao).toBe("EM_ANALISE");
  });

  it("decidir duas vezes é recusado — duas certidões do mesmo pedido, ambas conferíveis", async () => {
    await semear();
    await configurar();
    const pedido = await solicitarCertidao(prisma, { documento: CPF_LIMPO_DEVEDOR, criadoPor: POR });
    await decidirCertidao(prisma, {
      solicitacaoId: pedido.solicitacaoId, decisao: "EMITIR", tipo: "POSITIVA",
      semValidadeOficial: true, criadoPor: POR,
    });
    await expect(
      decidirCertidao(prisma, {
        solicitacaoId: pedido.solicitacaoId, decisao: "EMITIR", tipo: "POSITIVA",
        semValidadeOficial: true, criadoPor: POR,
      })
    ).rejects.toThrow(/SOLICITACAO-JA-DECIDIDA/);
    expect(await prisma.solicitacaoDeCertidao.count({ where: { situacao: "EMITIDA" } })).toBe(1);
  });

  it("indeferir exige fundamento", async () => {
    await semear();
    await configurar();
    const pedido = await solicitarCertidao(prisma, { documento: CPF_LIMPO_DEVEDOR, criadoPor: POR });
    await expect(
      decidirCertidao(prisma, { solicitacaoId: pedido.solicitacaoId, decisao: "INDEFERIR", semValidadeOficial: true, criadoPor: POR })
    ).rejects.toThrow(/MOTIVO-OBRIGATORIO/);
  });

  it("quem não tem a ação não decide — e nada muda", async () => {
    await semear();
    await configurar();
    const pedido = await solicitarCertidao(prisma, { documento: CPF_LIMPO_DEVEDOR, criadoPor: POR });

    const perfil = await prisma.perfil.create({
      data: {
        nome: "BALCAO", descricao: "pede, mas nao decide", criadoPor: POR,
        permissoes: { create: [{ acao: "SOLICITAR_CERTIDAO", criadoPor: POR }] },
      },
      select: { id: true },
    });
    const u = await prisma.usuario.create({ data: { identificador: "balcao@teste", nome: "Balcao", criadoPor: POR }, select: { id: true } });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: POR } });

    await expect(
      decidirCertidao(prisma, {
        solicitacaoId: pedido.solicitacaoId, decisao: "EMITIR", tipo: "POSITIVA",
        semValidadeOficial: true, criadoPor: "balcao@teste",
      })
    ).rejects.toThrow(/ACESSO NEGADO/);
    const s = await prisma.solicitacaoDeCertidao.findUniqueOrThrow({ where: { id: pedido.solicitacaoId }, select: { situacao: true } });
    expect(s.situacao).toBe("EM_ANALISE");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// C5 — A CONFERÊNCIA PÚBLICA
// ════════════════════════════════════════════════════════════════════════════

describe("C5 — a conferência devolve o mínimo, e a chave errada não ensina nada", () => {
  async function emitida(): Promise<string> {
    await semear();
    await configurar();
    const pedido = await solicitarCertidao(prisma, { documento: CPF_LIMPO_DEVEDOR, criadoPor: POR });
    await decidirCertidao(
      prisma,
      { solicitacaoId: pedido.solicitacaoId, decisao: "EMITIR", tipo: "POSITIVA", semValidadeOficial: true, criadoPor: POR },
      new Date("2026-09-16T12:00:00-03:00")
    );
    return pedido.chaveDeAutenticidade;
  }

  it("a certidão emitida confere, com titular mascarado e vigência", async () => {
    const chave = await emitida();
    const a = await conferirAutenticidade(prisma, chave, "2026-10-01");
    expect(a.existe).toBe(true);
    expect(a.tipo).toBe("POSITIVA");
    expect(a.titular).toBe("Maria da Silva");
    expect(a.documentoMascarado).toBe("***.982.247-**");
    expect(a.vigente).toBe(true);
    expect(a.semValidadeOficial).toBe(true);
  });

  it("⚠️ a conferência NÃO devolve extrato de débitos nem cobertura", async () => {
    const chave = await emitida();
    const a = await conferirAutenticidade(prisma, chave, "2026-10-01");
    const texto = JSON.stringify(a);
    // Quem tem a chave de uma certidão não ganha o cadastro fiscal de ninguém.
    expect(texto).not.toContain("LANCAMENTO_TRIBUTARIO");
    expect(texto).not.toContain("COM_PENDENCIA");
    expect(texto).not.toContain("200.00");
    expect(texto).not.toContain(CPF_LIMPO_DEVEDOR);
    expect(Object.keys(a).sort()).toEqual([
      "documentoMascarado", "emitidaEm", "existe", "protocolo", "semValidadeOficial",
      "tipo", "titular", "validadeAte", "vigente",
    ]);
  });

  it("depois da validade, a mesma chave confere e diz VENCIDA", async () => {
    const chave = await emitida();
    const a = await conferirAutenticidade(prisma, chave, "2026-12-01");
    expect(a.existe).toBe(true);
    expect(a.vigente).toBe(false);
  });

  it("⚠️ chave inválida e chave inexistente respondem IGUAL — a diferença ensinaria quem varre", async () => {
    await emitida();
    const invalida = await conferirAutenticidade(prisma, "nao-e-hex", "2026-10-01");
    const inexistente = await conferirAutenticidade(prisma, "f".repeat(64), "2026-10-01");
    expect(invalida).toEqual(inexistente);
    expect(invalida.existe).toBe(false);
  });

  it("uma solicitação EM ANÁLISE não confere — só o que foi emitido existe lá fora", async () => {
    await semear();
    await configurar();
    const pedido = await solicitarCertidao(prisma, { documento: CPF_LIMPO_DEVEDOR, criadoPor: POR });
    const a = await conferirAutenticidade(prisma, pedido.chaveDeAutenticidade, "2026-10-01");
    expect(a.existe).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// C6 — A MÁSCARA
// ════════════════════════════════════════════════════════════════════════════

describe("C6 — a máscara do documento", () => {
  it("CPF esconde; CNPJ aparece inteiro", () => {
    // Pessoa jurídica que se relaciona com o município é identificável — é a mesma regra da
    // consulta pública de despesas (V9 N2). Pessoa física, não.
    expect(mascarar("52998224725")).toBe("***.982.247-**");
    expect(mascarar("11222333000181")).toBe("11.222.333/0001-81");
  });
});
