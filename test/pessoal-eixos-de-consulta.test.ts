import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { lerConsulta } from "../lib/molde/consulta.js";
import { SERVIDORES } from "../lib/portas/recursos/pessoal.js";
import {
  ConsultaDePessoalAmplaDemaisError,
  diaDeReferencia,
  listarServidoresPara,
} from "../lib/portas/recursos/pessoal-dados.js";
import {
  admitirServidor,
  cadastrarCargo,
  cadastrarLotacao,
  cadastrarServidor,
  desligarServidor,
  registrarMovimentacao,
} from "../modules/m32-pessoal/servico.js";
import { EscopoDeLeituraError, exigirLeituraDoEntePara, podeLerPara } from "../lib/portas/leitura.js";
import type { Identidade } from "../modules/m16-travamento/autenticacao.js";
import type { AcaoDoSistema } from "../modules/m16-travamento/acoes.js";

/**
 * ═══ A CONSULTA DE SERVIDORES PELA PORTA — TR 5.12.50 (V11 V9.4) ═══
 *
 * O PREDICADO PURO está em `modules/m32-pessoal/m32-eixos-de-consulta.test.ts`. Aqui se prova o
 * que só o banco e o descritor respondem:
 *
 *  · o "E" se conjuga sobre UM MESMO VÍNCULO, contra uma pessoa com DUAS matrículas;
 *  · a coluna mostra a matrícula que CASOU, não a primeira viva;
 *  · o filtro derivado é apurado ANTES de recortar a página — a fixture tem TRINTA servidores,
 *    porque com 25 ou menos o defeito de paginar antes de filtrar não aparece;
 *  · filtro que não acha devolve VAZIO, nunca tudo;
 *  · o teto RECUSA e não trunca, provado nas duas direções;
 *  · a leitura é autorizada por CONSULTAR_PESSOAL **na PORTA**, positiva e negativa, e a recusa diz
 *    o MOTIVO. Toda consulta daqui passa por `listarServidoresPara` com identidade real — cada
 *    asserção de eixo é, também, a metade positiva da autorização.
 *
 * ⚠️ O QUE ELE NÃO PROVA, DE PROPÓSITO: que a folha possa ser calculada por um recorte. Estes
 * eixos são CONSULTA — ver o docblock de `listarServidores` e `modules/m33-folha/MODULO.md`.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "contabilidade@cg.pb.gov.br";
const D = (a: number, m: number, d: number): Date => new Date(Date.UTC(a, m - 1, d, 12, 0, 0));

// ═══════════════════════════════════════════════════════════════════════════════
// (B) A CONSULTA PELA PORTA DE VERDADE — banco, descritor e paginação
// ═══════════════════════════════════════════════════════════════════════════════

function consulta(filtros: Record<string, string>) {
  // ⚠️ PELO `lerConsulta` DO DESCRITOR, nunca por um objeto montado à mão: é ele que recusa um
  // `regimePrev=QUALQUER` que não esteja nas opções declaradas. Montar o filtro à mão aqui
  // provaria a porta e deixaria a fronteira da query string sem prova nenhuma.
  return lerConsulta(SERVIDORES, filtros);
}

/**
 * ⚠️ TODA CONSULTA DESTE ARQUIVO PASSA POR `listarServidoresPara` COM UMA IDENTIDADE REAL, e não é
 * cerimônia: o gate mora na PORTA (invariante 6), então cada asserção de eixo abaixo é também a
 * metade POSITIVA da autorização. Sem isso, um `throw` incondicional no gate deixaria o teste
 * negativo verde com a consulta quebrada para todo mundo.
 */
let leitor: Identidade;

async function usuarioCom(id: string, acoes: readonly AcaoDoSistema[]): Promise<Identidade> {
  const u = await prisma.usuario.create({ data: { identificador: id, nome: id, criadoPor: "seed-teste" }, select: { id: true, identificador: true } });
  const perfil = await prisma.perfil.create({ data: { nome: `perfil-${id}`, descricao: "teste", criadoPor: "seed-teste" }, select: { id: true } });
  for (const a of acoes) {
    await prisma.permissaoDePerfil.create({ data: { perfilId: perfil.id, acao: a, unidadeOrcId: null, criadoPor: "seed-teste" } });
  }
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: "seed-teste" } });
  return { usuarioId: u.id, identificador: u.identificador };
}

let cargoProfessor = "";
let cargoMotorista = "";
let lotEscola = "";
let lotGaragem = "";

async function pessoaFisica(documento: string, nome: string): Promise<string> {
  const p = await prisma.pessoa.create({
    data: { documento, tipo: "FISICA", criadoPor: POR, versoes: { create: { nome, criadoPor: POR } } },
    select: { id: true },
  });
  return p.id;
}

async function base(): Promise<void> {
  await limparBanco(prisma);
  leitor = await usuarioCom("rh.leitor@teste.local", ["CONSULTAR_PESSOAL"]);
  cargoProfessor = (await cadastrarCargo(prisma, { codigo: "PROF-I", denominacao: "Professor Nivel I", tipo: "EFETIVO", vagasFixadas: 40, leiAutorizativa: "Lei Municipal 1.234/2010", dataPublicacaoLei: D(2010, 5, 1), criadoPor: POR })).cargoId;
  cargoMotorista = (await cadastrarCargo(prisma, { codigo: "MOT-A", denominacao: "Motorista categoria D", tipo: "EFETIVO", vagasFixadas: 40, leiAutorizativa: "Lei Municipal 1.234/2010", dataPublicacaoLei: D(2010, 5, 1), criadoPor: POR })).cargoId;
  lotEscola = (await cadastrarLotacao(prisma, { codigo: "ESC-CENTRAL", nome: "Escola Municipal Central", criadoPor: POR })).lotacaoId;
  lotGaragem = (await cadastrarLotacao(prisma, { codigo: "GARAGEM", nome: "Garagem Municipal", criadoPor: POR })).lotacaoId;
}

describe("(B) a consulta pela porta — o 'E' sobre o mesmo vínculo, com banco", () => {
  let acumula = "";
  let soProfessor = "";

  beforeEach(async () => {
    await base();
    // ⚠️ N=2 NAS DUAS DIMENSÕES: dois servidores, e um deles com DUAS matrículas. Com um vínculo
    // por pessoa, o cruzamento de eixos passa por vacuidade.
    const p1 = await pessoaFisica("11144477735", "Ana Carolina Ribeiro");
    acumula = (await cadastrarServidor(prisma, { pessoaId: p1, dataNascimento: D(1985, 7, 20), sexo: "FEMININO", nomeSocial: "Ana Beatriz Ribeiro", criadoPor: POR })).servidorId;
    await admitirServidor(prisma, { servidorId: acumula, matricula: "1001", tipo: "EFETIVO", regimeJuridico: "Estatutario", regimePrevidenciario: "RPPS", dataAdmissao: D(2020, 3, 1), cargoId: cargoProfessor, lotacaoId: lotEscola, salarioBase: "3000.00", criadoPor: POR });
    await admitirServidor(prisma, { servidorId: acumula, matricula: "1002", tipo: "EFETIVO", regimeJuridico: "CLT", regimePrevidenciario: "RGPS", dataAdmissao: D(2022, 8, 15), cargoId: cargoMotorista, lotacaoId: lotGaragem, salarioBase: "2000.00", criadoPor: POR });

    const p2 = await pessoaFisica("52998224725", "Joao Pedro Alves");
    soProfessor = (await cadastrarServidor(prisma, { pessoaId: p2, dataNascimento: D(1990, 2, 10), sexo: "MASCULINO", criadoPor: POR })).servidorId;
    await admitirServidor(prisma, { servidorId: soProfessor, matricula: "2001", tipo: "EFETIVO", regimeJuridico: "Estatutario", regimePrevidenciario: "RPPS", dataAdmissao: D(2021, 5, 10), cargoId: cargoProfessor, lotacaoId: lotEscola, salarioBase: "3100.00", criadoPor: POR });
  });

  it("cada eixo sozinho acha quem deve — a fixture não é degenerada", async () => {
    expect((await listarServidoresPara(leitor, consulta({ cargo: "Motorista" }))).linhas.map((l) => l.id)).toEqual([acumula]);
    expect((await listarServidoresPara(leitor, consulta({ lotacao: "GARAGEM" }))).linhas.map((l) => l.id)).toEqual([acumula]);
    expect(new Set((await listarServidoresPara(leitor, consulta({ cargo: "PROF-I" }))).linhas.map((l) => l.id))).toEqual(new Set([acumula, soProfessor]));
    expect((await listarServidoresPara(leitor, consulta({ matricula: "2001" }))).linhas.map((l) => l.id)).toEqual([soProfessor]);
  });

  it("CARGO DE UMA MATRÍCULA + LOTAÇÃO DA OUTRA não acha ninguém — o 'E' é sobre o MESMO vínculo", async () => {
    const r = await listarServidoresPara(leitor, consulta({ cargo: "Motorista", lotacao: "Escola Municipal Central" }));
    expect(r.linhas).toEqual([]);
    expect(r.total).toBe(0);
    // ⚠️ E O MOTIVO ESTÁ NA FIXTURE, não na sorte: ela TEM as duas matrículas, e cada eixo acha
    // uma. É a conjunção sobre o mesmo vínculo que recusa.
    expect((await listarServidoresPara(leitor, consulta({ cargo: "Motorista", lotacao: "GARAGEM" }))).linhas.map((l) => l.id)).toEqual([acumula]);
  });

  it("A LINHA MOSTRA A MATRÍCULA QUE CASOU, não a primeira viva — senão a célula mente", async () => {
    const comoMotorista = await listarServidoresPara(leitor, consulta({ cargo: "Motorista" }));
    expect(comoMotorista.linhas[0]?.["matricula"]).toBe("1002");
    expect(comoMotorista.linhas[0]?.["cargo"]).toContain("Motorista categoria D");
    expect(comoMotorista.linhas[0]?.["lotacao"]).toContain("Garagem Municipal");

    const comoProfessora = await listarServidoresPara(leitor, consulta({ matricula: "1001" }));
    expect(comoProfessora.linhas[0]?.["matricula"]).toBe("1001");
    expect(comoProfessora.linhas[0]?.["cargo"]).toContain("Professor Nivel I");
  });

  it("FILTRO QUE NÃO ACHA DEVOLVE VAZIO, NUNCA TUDO — o modo mais discreto de um filtro deixar de filtrar", async () => {
    const semCargo = await listarServidoresPara(leitor, consulta({ cargo: "Fiscal de Tributos" }));
    expect(semCargo.total).toBe(0);
    expect(semCargo.linhas).toEqual([]);
    const semLotacao = await listarServidoresPara(leitor, consulta({ lotacao: "Hospital que nao existe" }));
    expect(semLotacao.total).toBe(0);
    // A prova de que o vazio não é por o banco estar vazio: sem filtro, os dois aparecem.
    expect((await listarServidoresPara(leitor, consulta({}))).total).toBe(2);
  });

  it("O NOME ACHA PELO SOCIAL **E** PELO CIVIL — quem usa nome social e não é encontrado por ele é defeito de produto", async () => {
    // Ana Carolina Ribeiro (civil) usa "Ana Beatriz Ribeiro" (social). Os dois acham; e é o social
    // que a linha MOSTRA (Lei 14.164/2021).
    expect((await listarServidoresPara(leitor, consulta({ nome: "Ana Beatriz" }))).linhas.map((l) => l.id)).toEqual([acumula]);
    const porCivil = await listarServidoresPara(leitor, consulta({ nome: "Ana Carolina" }));
    expect(porCivil.linhas.map((l) => l.id)).toEqual([acumula]);
    expect(porCivil.linhas[0]?.["nome"]).toBe("Ana Beatriz Ribeiro");
    // Negação COM MOTIVO: o outro servidor não entra por acaso — ele é achado pelo nome DELE.
    expect((await listarServidoresPara(leitor, consulta({ nome: "Ana" }))).linhas.map((l) => l.id)).toEqual([acumula]);
    expect((await listarServidoresPara(leitor, consulta({ nome: "Joao Pedro" }))).linhas.map((l) => l.id)).toEqual([soProfessor]);
  });

  it("A DATA DE REFERÊNCIA MUDA A LISTA — e a coluna do cargo deriva na MESMA data que o filtro", async () => {
    await registrarMovimentacao(prisma, { vinculoId: (await prisma.vinculo.findUniqueOrThrow({ where: { matricula: "2001" }, select: { id: true } })).id, tipo: "MUDANCA_CARGO", data: D(2026, 6, 1), cargoId: cargoMotorista, motivo: "Aproveitamento em outro cargo por concurso", criadoPor: POR });

    const emMaio = await listarServidoresPara(leitor, consulta({ cargo: "PROF-I", dataRef: "2026-05-31" }));
    expect(new Set(emMaio.linhas.map((l) => l.id))).toEqual(new Set([acumula, soProfessor]));
    const emJunho = await listarServidoresPara(leitor, consulta({ cargo: "PROF-I", dataRef: "2026-06-01" }));
    expect(emJunho.linhas.map((l) => l.id)).toEqual([acumula]);

    const motoristaEmJunho = await listarServidoresPara(leitor, consulta({ cargo: "Motorista", dataRef: "2026-06-01" }));
    expect(new Set(motoristaEmJunho.linhas.map((l) => l.id))).toEqual(new Set([acumula, soProfessor]));
    // ⚠️ A COLUNA SEGUE O FILTRO: em maio ele é Professor na célula; em junho, Motorista.
    const soEle = (r: Awaited<ReturnType<typeof listarServidoresPara>>) => r.linhas.find((l) => l.id === soProfessor);
    expect(soEle(await listarServidoresPara(leitor, consulta({ matricula: "2001", dataRef: "2026-05-31" })))?.["cargo"]).toContain("Professor");
    expect(soEle(await listarServidoresPara(leitor, consulta({ matricula: "2001", dataRef: "2026-06-01" })))?.["cargo"]).toContain("Motorista");
  });

  it("REGIME JURÍDICO E PREVIDENCIÁRIO NÃO SÃO O MESMO FILTRO", async () => {
    expect((await listarServidoresPara(leitor, consulta({ regimeJuridico: "CLT" }))).linhas.map((l) => l.id)).toEqual([acumula]);
    expect(new Set((await listarServidoresPara(leitor, consulta({ regimeJuridico: "Estatutario" }))).linhas.map((l) => l.id))).toEqual(new Set([acumula, soProfessor]));
    // O motorista é CLT no RGPS; as duas matrículas de professor são Estatutárias no RPPS.
    expect((await listarServidoresPara(leitor, consulta({ regimePrev: "RGPS" }))).linhas.map((l) => l.id)).toEqual([acumula]);
    expect(new Set((await listarServidoresPara(leitor, consulta({ regimePrev: "RPPS" }))).linhas.map((l) => l.id))).toEqual(new Set([acumula, soProfessor]));
    // Cruzado sobre o MESMO vínculo: CLT no RPPS não existe nesta fixture.
    expect((await listarServidoresPara(leitor, consulta({ regimeJuridico: "CLT", regimePrev: "RPPS" }))).total).toBe(0);
  });

  it("A JANELA DE ADMISSÃO É INCLUSIVA NO DIA — 'até 15/08/2022' inclui quem entrou no dia 15", async () => {
    expect((await listarServidoresPara(leitor, consulta({ admitidoDe: "2022-01-01" }))).linhas.map((l) => l.id)).toEqual([acumula]);
    expect((await listarServidoresPara(leitor, consulta({ admitidoAte: "2022-08-15", admitidoDe: "2022-08-15" }))).linhas.map((l) => l.id)).toEqual([acumula]);
    expect((await listarServidoresPara(leitor, consulta({ admitidoAte: "2022-08-14", admitidoDe: "2022-08-01" }))).total).toBe(0);
    expect(new Set((await listarServidoresPara(leitor, consulta({ admitidoAte: "2021-12-31" }))).linhas.map((l) => l.id))).toEqual(new Set([acumula, soProfessor]));
  });

  it("SEM `dataRef`, A ÂNCORA É O DIA CIVIL DO ENTE — e não a hora em que a tela foi aberta", async () => {
    // ⚠️ O DEFEITO QUE ESTE TESTE FECHA: os eventos são gravados em MEIO-DIA civil, e uma âncora em
    // `new Date()` cru fazia a consulta das 09h00 não enxergar a promoção com efeito NAQUELE DIA —
    // o servidor sumia do filtro até o meio-dia. `agora` entra por parâmetro justamente para que a
    // prova não dependa da hora em que a suíte roda: um teste que só falha de manhã passa por
    // vacuidade na outra metade do dia.
    const v = await prisma.vinculo.findUniqueOrThrow({ where: { matricula: "2001" }, select: { id: true } });
    await registrarMovimentacao(prisma, { vinculoId: v.id, tipo: "MUDANCA_CARGO", data: D(2026, 6, 10), cargoId: cargoMotorista, motivo: "Aproveitamento em outro cargo por concurso", criadoPor: POR });

    const NOVE_DA_MANHA = new Date("2026-06-10T12:00:00.000Z"); // 09h00 no fuso do ente
    const cedo = await listarServidoresPara(leitor, consulta({ cargo: "Motorista" }), { agora: NOVE_DA_MANHA });
    expect(new Set(cedo.linhas.map((l) => l.id))).toEqual(new Set([acumula, soProfessor]));
    // E a MESMA pergunta com a data escrita à mão responde igual — era essa igualdade que faltava.
    const comData = await listarServidoresPara(leitor, consulta({ cargo: "Motorista", dataRef: "2026-06-10" }));
    expect(new Set(comData.linhas.map((l) => l.id))).toEqual(new Set(cedo.linhas.map((l) => l.id)));

    // A âncora, direto: qualquer hora do dia civil colapsa no MESMO instante.
    const madrugada = diaDeReferencia("", new Date("2026-06-10T03:30:00.000Z"));
    const noite = diaDeReferencia("", new Date("2026-06-10T23:30:00.000Z"));
    expect(madrugada.getTime()).toBe(noite.getTime());
    expect(madrugada.getTime()).toBe(diaDeReferencia("2026-06-10", new Date()).getTime());
  });

  it("O TETO RECUSA E NOMEIA O MOTIVO — e não trunca (as duas direções)", async () => {
    // Direção 1: teto abaixo do conjunto ⇒ recusa, dizendo quantos e que NÃO truncou.
    await expect(listarServidoresPara(leitor, consulta({ situacao: "ATIVO" }), { teto: 1 })).rejects.toThrow(ConsultaDePessoalAmplaDemaisError);
    await expect(listarServidoresPara(leitor, consulta({ situacao: "ATIVO" }), { teto: 1 })).rejects.toThrow(/alcança 2 servidores, acima do teto de 1[\s\S]*NÃO foi truncada/);
    // Direção 2: teto acima ⇒ a MESMA consulta responde inteira. Sem isto, a recusa poderia estar
    // acontecendo por outro motivo qualquer.
    const r = await listarServidoresPara(leitor, consulta({ situacao: "ATIVO" }), { teto: 2 });
    expect(r.total).toBe(2);
  });

  it("a recusa por amplitude carrega a PROVIDÊNCIA, não só a queixa — e diz que não truncou", async () => {
    // ⚠️ AFIRMA O EFEITO DA MENSAGEM, não que ela exista: quem a lê tem de saber o que fazer, e a
    // recusa tem de dizer que NÃO truncou — senão o operador supõe que a lista está completa.
    const erro = await listarServidoresPara(leitor, consulta({ situacao: "ATIVO" }), { teto: 0 }).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ConsultaDePessoalAmplaDemaisError);
    const msg = (erro as Error).message;
    expect(msg).toMatch(/NÃO foi truncada/);
    expect(msg).toMatch(/Estreite por nome, matrícula, data de admissão ou regime jurídico/);
    // E não vaza identificador de cláusula nem selo de conformidade para quem lê a tela.
    expect(msg).not.toMatch(/5\.12|TR |conformidade|cobertura/);
  });

  it("A PORTA COBRA `CONSULTAR_PESSOAL` — recusa pelo MOTIVO, e a positiva pareada prova que não é recusa cega", async () => {
    // ⚠️ CHAMA A PORTA DIRETO, SEM ROTA. O gate da página é outra coisa (ele traduz a recusa em
    // /sem-acesso); o que se afirma aqui é que a CONSULTA recusa por si — porque a segunda rota a
    // reusá-la (exportação, API, worker) nasceria sem gate, e a página não estaria lá para cobrar.
    //
    // ⚠️ E O NEGATIVO TEM AS OUTRAS AÇÕES DE PESSOAL NA MÃO. Sem isso, o teste passaria contra um
    // usuário sem perfil nenhum e provaria apenas que sessão vazia recusa — não que o recorte é
    // POR AÇÃO NOMEADA. Quem escreve o cadastro não lê a consulta.
    const semLeitura = await usuarioCom("rh.escreve.nao.consulta@teste.local", [
      "CADASTRAR_SERVIDOR", "ADMITIR_SERVIDOR", "MOVIMENTAR_SERVIDOR", "CONSULTAR_DESPESA",
    ]);

    const erro = await listarServidoresPara(semLeitura, consulta({})).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(EscopoDeLeituraError);
    // O MOTIVO, não só a recusa: "não completou" é compatível com o servidor entregando o dado.
    expect((erro as Error).message).toMatch(/CONSULTAR_PESSOAL/);
    expect((erro as Error).message).toMatch(/em escopo nenhum/);

    // ⚠️ A POSITIVA PAREADA, NO MESMO CENÁRIO: sem ela, um `throw` incondicional no gate deixaria a
    // negativa verde com a consulta quebrada para todos. A leitora vê os dois servidores.
    const permitida = await listarServidoresPara(leitor, consulta({}));
    expect(permitida.total).toBe(2);
    expect(permitida.linhas.length).toBe(2);

    // E a recusa é do eixo CERTO: a leitura que ele de fato tem continua valendo.
    expect(await podeLerPara(semLeitura, "CONSULTAR_DESPESA", "ente")).toBe(true);
    expect(await podeLerPara(semLeitura, "CONSULTAR_PESSOAL", "ente")).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// (C) A PAGINAÇÃO — o defeito que 25 registros escondem
// ═══════════════════════════════════════════════════════════════════════════════

describe("(C) filtro derivado é apurado ANTES de recortar a página", () => {
  const QUANTOS = 30;
  const DESLIGADOS = 2;

  beforeEach(async () => {
    await base();
    for (let i = 0; i < QUANTOS; i += 1) {
      const doc = String(10000000000 + i);
      const pid = await pessoaFisica(doc, `Servidora numero ${String(i).padStart(2, "0")}`);
      const { servidorId } = await cadastrarServidor(prisma, { pessoaId: pid, dataNascimento: D(1990, 1, 1), sexo: "FEMININO", criadoPor: POR });
      await admitirServidor(prisma, { servidorId, matricula: `9${String(i).padStart(3, "0")}`, tipo: "EFETIVO", regimeJuridico: "Estatutario", regimePrevidenciario: "RPPS", dataAdmissao: D(2020, 1, 1), cargoId: cargoProfessor, lotacaoId: lotEscola, salarioBase: "3000.00", criadoPor: POR });
      // ⚠️ OS DESLIGADOS FICAM NO COMEÇO DA ORDENAÇÃO (a lista ordena por `criadoEm desc`, então
      // os dois ÚLTIMOS criados vêm primeiro). É a posição que expõe o defeito: filtrando depois
      // do `skip`/`take`, a primeira página perderia dois ativos e o total mentiria.
      if (i >= QUANTOS - DESLIGADOS) {
        const v = await prisma.vinculo.findUniqueOrThrow({ where: { matricula: `9${String(i).padStart(3, "0")}` }, select: { id: true } });
        await desligarServidor(prisma, { vinculoId: v.id, data: D(2024, 6, 30), motivo: "Exoneracao a pedido do servidor", criadoPor: POR });
      }
    }
  });

  it("o TOTAL é o do conjunto, igual nas duas páginas — e as páginas não se sobrepõem nem perdem ninguém", async () => {
    const esperado = QUANTOS - DESLIGADOS;
    const p1 = await listarServidoresPara(leitor, consulta({ situacao: "ATIVO" }));
    const p2 = await listarServidoresPara(leitor, consulta({ situacao: "ATIVO", pagina: "2" }));

    expect(p1.total).toBe(esperado);
    expect(p2.total).toBe(esperado);
    expect(p1.linhas.length).toBe(25);
    expect(p2.linhas.length).toBe(esperado - 25);

    const ids = [...p1.linhas.map((l) => l.id), ...p2.linhas.map((l) => l.id)];
    expect(new Set(ids).size).toBe(esperado);
    // E nenhum desligado atravessou: a coluna de situação afirma o efeito, não o formato.
    expect([...p1.linhas, ...p2.linhas].every((l) => l["situacao"] === "ATIVO")).toBe(true);
  });

  it("o mesmo vale para eixo DERIVADO puro (cargo), que também não se resolve no WHERE", async () => {
    const p1 = await listarServidoresPara(leitor, consulta({ cargo: "PROF-I" }));
    const p2 = await listarServidoresPara(leitor, consulta({ cargo: "PROF-I", pagina: "2" }));
    expect(p1.total).toBe(QUANTOS);
    expect(p2.total).toBe(QUANTOS);
    expect(new Set([...p1.linhas.map((l) => l.id), ...p2.linhas.map((l) => l.id)]).size).toBe(QUANTOS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// (D) A AUTORIZAÇÃO — ação nomeada, nos dois sentidos, e a recusa DIZ O MOTIVO
// ═══════════════════════════════════════════════════════════════════════════════

describe("(D) a consulta é autorizada no servidor por CONSULTAR_PESSOAL", () => {
  beforeEach(async () => {
    await limparBanco(prisma);
  });


  it("POSITIVA: quem tem a ação lê", async () => {
    const quem = await usuarioCom("rh.consulta@teste.local", ["CONSULTAR_PESSOAL"]);
    await expect(exigirLeituraDoEntePara(quem, "CONSULTAR_PESSOAL")).resolves.toBeUndefined();
    expect(await podeLerPara(quem, "CONSULTAR_PESSOAL", "ente")).toBe(true);
  });

  it("NEGATIVA: quem NÃO tem recusa — e a recusa nomeia a ação que falta, não só 'não pode'", async () => {
    // ⚠️ COM OUTRAS AÇÕES DE PESSOAL NA MÃO: sem isso, o teste passaria contra um usuário sem
    // perfil nenhum e não provaria que o recorte é POR AÇÃO — provaria só que sessão vazia recusa.
    const quem = await usuarioCom("rh.escreve.nao.le@teste.local", ["CADASTRAR_SERVIDOR", "ADMITIR_SERVIDOR", "CONSULTAR_DESPESA"]);
    expect(await podeLerPara(quem, "CONSULTAR_PESSOAL", "ente")).toBe(false);
    await expect(exigirLeituraDoEntePara(quem, "CONSULTAR_PESSOAL")).rejects.toThrow(/CONSULTAR_PESSOAL/);
    await expect(exigirLeituraDoEntePara(quem, "CONSULTAR_PESSOAL")).rejects.toThrow(/em escopo nenhum/);
    // E a leitura que ele TEM continua valendo: a recusa é do eixo certo.
    expect(await podeLerPara(quem, "CONSULTAR_DESPESA", "ente")).toBe(true);
  });

  it("A TELA COBRA A AÇÃO **ANTES** DE LER — a ordem é a propriedade, não a presença da linha", async () => {
    const { readFileSync } = await import("node:fs");
    const fonte = readFileSync(new URL("../app/(areas)/pessoal/servidores/page.tsx", import.meta.url), "utf8");
    const gate = fonte.indexOf('exigirLeitura("CONSULTAR_PESSOAL")');
    const leitura = fonte.indexOf("listarServidores(");
    expect(gate).toBeGreaterThan(-1);
    expect(leitura).toBeGreaterThan(-1);
    // ⚠️ UM `exigirLeitura` DEPOIS DO `listarServidores` COMPILA, RENDERIZA E VAZA: a consulta já
    // teria ido ao banco quando a recusa estourasse. Afirmar só a presença da linha deixaria essa
    // inversão passar — é a diferença entre atestar pela papelada e afirmar o efeito.
    expect(gate).toBeLessThan(leitura);
    // ⚠️ AQUI NÃO SE AFIRMA QUE A RECUSA DO TETO CHEGA À TELA, e a omissão é deliberada. A versão
    // anterior deste teste conferia que `ConsultaDePessoalAmplaDemaisError` aparecia no `catch` do
    // arquivo — e a MUTAÇÃO provou que a guarda era inerte: trocar o ramo por `if (false && ...)`
    // deixou os 26 testes VERDES. Uma guarda que casa com o texto do arquivo atesta pela papelada,
    // não pelo efeito. O ramo existe em `page.tsx` e é melhor que subir para a tela genérica do
    // Next, mas quem prova que ele RENDERIZA é o percurso de navegador — pendência
    // `PESSOAL-RECUSA-DO-TETO-SEM-PERCURSO`, nomeada no MODULO.md do M32 e NÃO executada.
  });

});
