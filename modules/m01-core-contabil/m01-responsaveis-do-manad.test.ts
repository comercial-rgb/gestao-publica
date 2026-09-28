import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { responsaveisDoPeriodo, vigenciasEfetivas } from "../m14-exports-federais/manad/responsaveis.js";
import {
  CadastroDeResponsavelInvalidoError,
  declararCentralizacaoDaEscrituracao,
  registrarContabilistaDoManad,
  registrarEmpresaGeradoraDoManad,
} from "./responsaveis-do-manad.js";

/**
 * ═══ OS RESPONSÁVEIS DO MANAD (0050, 0100) E O INDICADOR DE CENTRALIZAÇÃO (0000) ═══
 *
 * ⚠️ OS DOCUMENTOS DE TESTE SÃO VETORES CONHECIDOS, não saídas do nosso validador: CPF
 * 529.982.247-25 e 111.444.777-35, CNPJ 11.222.333/0001-81 — números de exemplo públicos com dígito
 * válido. Conferir o validador com números que ele mesmo gerou passaria com qualquer erro
 * consistente.
 *
 * ⚠️ N=2 NA SUCESSÃO: o fim derivado só existe quando há um SEGUNDO registro. Com um só, a regra
 * "termina na véspera do sucessor" passaria por vacuidade.
 *
 * ⚠️ A NEGATIVA DE AUTORIZAÇÃO usa usuários FORA do censo das fixtures (que são todos ADMIN), e
 * afirma o MOTIVO — "nenhum perfil concede a ação", distinto de "não tem perfil nenhum".
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "contabilidade@cg.pb.gov.br";
const AGORA = new Date("2026-09-28T15:00:00Z");
const CPF_A = "52998224725";
const CPF_B = "11144477735";
const CNPJ_OK = "11222333000181";

const utc = (a: number, m: number, d: number): Date => new Date(Date.UTC(a, m - 1, d));

const contabilista = (extra: Record<string, string> = {}) => ({
  nome: "Contador de Teste",
  cpf: "529.982.247-25",
  crc: "PB-012345/O",
  dtInicio: "2024-01-01",
  criadoPor: POR,
  ...extra,
});

async function recusa(p: Promise<unknown>): Promise<Error> {
  const e = await p.then(
    () => null,
    (x: unknown) => x
  );
  expect(e, "a operação deveria ter sido recusada").toBeInstanceOf(Error);
  return e as Error;
}

// ═══════════════════════════════════════════════════════════════════════════
// A VIGÊNCIA DERIVADA (pura)
// ═══════════════════════════════════════════════════════════════════════════

describe("vigência derivada dos responsáveis (sem banco)", () => {
  const p = (r: { inicio: Date; fim: Date | null }) => r;

  it("N=2: o primeiro, aberto, termina na véspera do segundo; o segundo fica vigente", () => {
    const v = vigenciasEfetivas(
      [
        { inicio: utc(2026, 3, 1), fim: null },
        { inicio: utc(2024, 1, 1), fim: null },
      ],
      p
    );
    expect(v.map((x) => [x.inicio.toISOString().slice(0, 10), x.fimEfetivo?.toISOString().slice(0, 10) ?? null])).toEqual([
      ["2024-01-01", "2026-02-28"],
      ["2026-03-01", null],
    ]);
  });

  it("N=3: um fim declarado ANTES da véspera do sucessor prevalece (o intervalo sem responsável é dado)", () => {
    const v = vigenciasEfetivas(
      [
        { inicio: utc(2024, 1, 1), fim: utc(2024, 6, 30) },
        { inicio: utc(2025, 1, 1), fim: null },
        { inicio: utc(2026, 1, 1), fim: null },
      ],
      p
    );
    expect(v.map((x) => x.fimEfetivo?.toISOString().slice(0, 10) ?? null)).toEqual([
      "2024-06-30",
      "2025-12-31",
      null,
    ]);
  });

  it("o arquivo de um exercício leva só quem respondeu por ele", () => {
    const regs = [
      { inicio: utc(2024, 1, 1), fim: null },
      { inicio: utc(2026, 3, 1), fim: null },
    ];
    const ano = (a: number) => ({ dtInicio: utc(a, 1, 1), dtFim: utc(a, 12, 31) });
    expect(responsaveisDoPeriodo(regs, p, ano(2026))).toHaveLength(2);
    expect(responsaveisDoPeriodo(regs, p, ano(2027)).map((x) => x.inicio.toISOString().slice(0, 10))).toEqual(["2026-03-01"]);
    expect(responsaveisDoPeriodo(regs, p, ano(2025)).map((x) => x.inicio.toISOString().slice(0, 10))).toEqual(["2024-01-01"]);
    expect(responsaveisDoPeriodo(regs, p, ano(2023))).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O REGISTRO (com banco)
// ═══════════════════════════════════════════════════════════════════════════

describe("registro dos responsáveis do MANAD", () => {
  beforeEach(async () => {
    await limparBanco(prisma);
  });

  it("POSITIVO: grava o contabilista com CPF sem máscara, quem registrou e quando", async () => {
    const { id } = await registrarContabilistaDoManad(prisma, contabilista({ uf: "pb", cep: "58400-000" }), AGORA);
    const r = await prisma.manadContabilista.findUniqueOrThrow({ where: { id } });
    expect(r.cpf).toBe(CPF_A);
    expect(r.crc).toBe("PB-012345/O");
    expect(r.dtInicio.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    expect(r.dtFim).toBeNull();
    expect(r.uf).toBe("PB");
    expect(r.cep).toBe("58400000");
    expect(r.conferidoPor).toBe(POR);
    expect(r.conferidoEm.toISOString()).toBe(AGORA.toISOString());
  });

  it("SUCESSÃO (N=2): o segundo registro é INSERT; o primeiro fica intacto e termina pela derivação", async () => {
    const a = await registrarContabilistaDoManad(prisma, contabilista(), AGORA);
    const b = await registrarContabilistaDoManad(
      prisma,
      contabilista({ nome: "Contadora Sucessora", cpf: CPF_B, crc: "PB-054321/O", dtInicio: "2026-03-01" }),
      AGORA
    );
    const linhas = await prisma.manadContabilista.findMany({ orderBy: { dtInicio: "asc" } });
    expect(linhas.map((l) => l.id)).toEqual([a.id, b.id]);
    // O anterior NÃO foi tocado (o papel da aplicação não tem UPDATE aqui).
    expect(linhas[0]!.dtFim).toBeNull();
    const v = vigenciasEfetivas(linhas, (l) => ({ inicio: l.dtInicio, fim: l.dtFim }));
    expect(v[0]!.fimEfetivo?.toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("SUCESSÃO: um início que não é posterior ao último é recusado com o motivo, e nada é gravado", async () => {
    await registrarContabilistaDoManad(prisma, contabilista({ dtInicio: "2025-01-01" }), AGORA);
    const e = await recusa(registrarContabilistaDoManad(prisma, contabilista({ cpf: CPF_B, dtInicio: "2025-01-01" }), AGORA));
    expect(e).toBeInstanceOf(CadastroDeResponsavelInvalidoError);
    expect(e.message).toMatch(/início em 01\/01\/2025\. O novo registro precisa começar depois dele/);
    expect(await prisma.manadContabilista.count()).toBe(1);
  });

  it("SUCESSÃO: começar dentro de um período já FECHADO é recusado", async () => {
    await registrarContabilistaDoManad(prisma, contabilista({ dtInicio: "2025-01-01", dtFim: "2025-12-31" }), AGORA);
    const e = await recusa(registrarContabilistaDoManad(prisma, contabilista({ cpf: CPF_B, dtInicio: "2025-06-01" }), AGORA));
    expect(e.message).toMatch(/começa dentro de um período já cadastrado \(de 01\/01\/2025 a 31\/12\/2025\)/);
    expect(await prisma.manadContabilista.count()).toBe(1);
  });

  it("VALIDAÇÃO: CPF com dígito errado, CRC vazio, CRC longo, fim antes do início e texto fora do leiaute", async () => {
    const casos: readonly [Record<string, string>, RegExp][] = [
      [{ cpf: "529.982.247-24" }, /^CPF: o dígito verificador não confere/],
      [{ cpf: "111.111.111-11" }, /^CPF: o dígito verificador não confere/],
      [{ cpf: "1234" }, /^CPF: o CPF tem 11 dígitos/],
      [{ crc: "   " }, /^CRC: campo obrigatório/],
      [{ crc: "PB-0123456789/O" }, /^CRC: o número de registro tem no máximo 11 caracteres/],
      [{ dtInicio: "2026-02-30" }, /^Início da responsabilidade: a data informada não existe/],
      [{ dtInicio: "2026-03-01", dtFim: "2026-02-01" }, /^O fim do período não pode ser anterior ao início/],
      [{ nome: "Contador — Teste" }, /^Nome: há caractere que o arquivo da Receita não aceita/],
      [{ nome: "Contador | Teste" }, /^Nome: a barra vertical/],
      [{ cnpjEscritorio: "11.222.333/0001-82" }, /^CNPJ do escritório: o dígito verificador não confere/],
      [{ email: "sem-arroba" }, /^E-mail: o endereço informado não é válido/],
    ];
    for (const [extra, motivo] of casos) {
      const e = await recusa(registrarContabilistaDoManad(prisma, contabilista(extra), AGORA));
      expect(e, JSON.stringify(extra)).toBeInstanceOf(CadastroDeResponsavelInvalidoError);
      expect(e.message, JSON.stringify(extra)).toMatch(motivo);
    }
    expect(await prisma.manadContabilista.count()).toBe(0);
  });

  it("EMPRESA GERADORA: exige CNPJ ou CPF, só CNPJ numérico, e grava com o documento sem máscara", async () => {
    const base = {
      empresaOuTecnico: "Empresa de Teste",
      cargo: "Fornecedor do sistema",
      dtInicioServico: "2026-01-01",
      criadoPor: POR,
    };
    expect((await recusa(registrarEmpresaGeradoraDoManad(prisma, base, AGORA))).message).toMatch(
      /^Informe o CNPJ da empresa ou o CPF do técnico/
    );
    expect(
      (await recusa(registrarEmpresaGeradoraDoManad(prisma, { ...base, cnpj: "12ABC34501DE35" }, AGORA))).message
    ).toMatch(/^CNPJ: o CNPJ tem 14 dígitos\. O arquivo da Receita aceita apenas CNPJ numérico/);
    expect(await prisma.manadEmpresaGeradora.count()).toBe(0);

    const { id } = await registrarEmpresaGeradoraDoManad(prisma, { ...base, cnpj: "11.222.333/0001-81" }, AGORA);
    const r = await prisma.manadEmpresaGeradora.findUniqueOrThrow({ where: { id } });
    expect(r.cnpj).toBe(CNPJ_OK);
    expect(r.cpf).toBeNull();
    expect(r.conferidoPor).toBe(POR);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A AUTORIZAÇÃO — por ação nomeada, no ente, com o motivo
// ═══════════════════════════════════════════════════════════════════════════

describe("autorização: CADASTRAR_ENTIDADE_CONTABIL no ente", () => {
  const SO_CONSULTA = "consulta.contabil@teste.local";
  const SEM_PERFIL = "sem.perfil@teste.local";

  beforeEach(async () => {
    await limparBanco(prisma);
    const perfil = await prisma.perfil.create({
      data: {
        nome: "SO-CONSULTA-CONTABIL",
        descricao: "Vizinho: lê a contabilidade e não cadastra a entidade.",
        criadoPor: "SEED",
        permissoes: { create: [{ acao: "CONSULTAR_CONTABILIDADE", criadoPor: "SEED" }] },
      },
      select: { id: true },
    });
    const u = await prisma.usuario.create({
      data: { identificador: SO_CONSULTA, nome: SO_CONSULTA, criadoPor: "SEED" },
      select: { id: true },
    });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: "SEED" } });
    await prisma.usuario.create({ data: { identificador: SEM_PERFIL, nome: SEM_PERFIL, criadoPor: "SEED" } });
    await prisma.enteConfig.create({
      data: {
        id: "unico", codigoIbge: "2504009", poderOrgao: "10131", nome: "Municipio de Teste",
        cnpj: "08993917000146", uf: "PB", tribunalCodigo: "TCE-PB", tribunalUf: "PB",
        planoContasSeed: "pcasp-federal", conferidoPor: "SEED", conferidoEm: AGORA,
      },
    });
  });

  it("NEGATIVO: o perfil vizinho (só consulta) é recusado por NÃO TER A AÇÃO — e nada é gravado", async () => {
    const e1 = await recusa(registrarContabilistaDoManad(prisma, contabilista({ criadoPor: SO_CONSULTA }), AGORA));
    expect(e1.message).toMatch(/^ACESSO NEGADO: o usuário "consulta.contabil@teste.local" não tem permissão para CADASTRAR_ENTIDADE_CONTABIL no escopo do ENTE/);
    expect(e1.message).toMatch(/nenhum dos perfis dele concede CADASTRAR_ENTIDADE_CONTABIL/);
    const e2 = await recusa(
      registrarEmpresaGeradoraDoManad(
        prisma,
        { empresaOuTecnico: "X", cargo: "Y", cnpj: CNPJ_OK, dtInicioServico: "2026-01-01", criadoPor: SO_CONSULTA },
        AGORA
      )
    );
    expect(e2.message).toMatch(/nenhum dos perfis dele concede CADASTRAR_ENTIDADE_CONTABIL/);
    const e3 = await recusa(declararCentralizacaoDaEscrituracao(prisma, { indicador: "0", criadoPor: SO_CONSULTA }));
    expect(e3.message).toMatch(/nenhum dos perfis dele concede CADASTRAR_ENTIDADE_CONTABIL/);

    expect(await prisma.manadContabilista.count()).toBe(0);
    expect(await prisma.manadEmpresaGeradora.count()).toBe(0);
    expect((await prisma.enteConfig.findUniqueOrThrow({ where: { id: "unico" } })).indCentralizacao).toBeNull();
  });

  it("NEGATIVO: sem perfil nenhum, o motivo é o VÍNCULO (outra providência)", async () => {
    const e = await recusa(registrarContabilistaDoManad(prisma, contabilista({ criadoPor: SEM_PERFIL }), AGORA));
    expect(e.message).toMatch(/ACESSO NEGADO — SEM PERFIL/);
    expect(await prisma.manadContabilista.count()).toBe(0);
  });

  it("POSITIVO PAREADO: no mesmo cenário, quem tem a ação grava os três", async () => {
    await registrarContabilistaDoManad(prisma, contabilista(), AGORA);
    await registrarEmpresaGeradoraDoManad(
      prisma,
      { empresaOuTecnico: "Empresa", cargo: "Fornecedor", cnpj: CNPJ_OK, dtInicioServico: "2026-01-01", criadoPor: POR },
      AGORA
    );
    const r = await declararCentralizacaoDaEscrituracao(prisma, { indicador: "0", criadoPor: POR });
    expect(r).toEqual({ anterior: null, atual: "0" });
    expect(await prisma.manadContabilista.count()).toBe(1);
    expect(await prisma.manadEmpresaGeradora.count()).toBe(1);
    expect((await prisma.enteConfig.findUniqueOrThrow({ where: { id: "unico" } })).indCentralizacao).toBe("0");
  });

  it("CENTRALIZAÇÃO: indicador fora do leiaute é recusado antes de tocar o ente", async () => {
    const e = await recusa(declararCentralizacaoDaEscrituracao(prisma, { indicador: "3", criadoPor: POR }));
    expect(e.message).toMatch(/^Indicador de centralização inválido: use 0/);
    expect((await prisma.enteConfig.findUniqueOrThrow({ where: { id: "unico" } })).indCentralizacao).toBeNull();
  });
});
