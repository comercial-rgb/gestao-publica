import { autorizarNo } from "../m16-travamento/escopo.js";
import { diaCivil } from "../../packages/datas/index.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import {
  LIMITE_ETARIO_LEGAL,
  criaCicloDeLotacao,
  situacaoDoVinculo,
  zAdmitirServidorInput,
  zBaixarFinalidadeDependenteInput,
  zCadastrarCargoInput,
  zCadastrarContratoTrabalhoInput,
  zCadastrarDependenteInput,
  zCadastrarDiaCalendarioRhInput,
  zCadastrarLotacaoInput,
  zCadastrarServidorInput,
  zDesligarServidorInput,
  zProrrogarContratoTrabalhoInput,
  zRegistrarAlteracaoRemuneratoriaInput,
  zRegistrarAnotacaoServidorInput,
  zRegistrarAvaliacaoExperienciaInput,
  zRegistrarFinalidadeDependenteInput,
  zRegistrarMovimentacaoInput,
  zRegistrarPortariaInput,
  zRegistrarTreinamentoInput,
  type AdmitirServidorInput,
  type BaixarFinalidadeDependenteInput,
  type CadastrarCargoInput,
  type CadastrarContratoTrabalhoInput,
  type CadastrarDependenteInput,
  type CadastrarDiaCalendarioRhInput,
  type CadastrarLotacaoInput,
  type CadastrarServidorInput,
  type DesligarServidorInput,
  type EventoDoVinculo,
  type ProrrogarContratoTrabalhoInput,
  type RegistrarAlteracaoRemuneratoriaInput,
  type RegistrarAnotacaoServidorInput,
  type RegistrarAvaliacaoExperienciaInput,
  type RegistrarFinalidadeDependenteInput,
  type RegistrarMovimentacaoInput,
  type RegistrarPortariaInput,
  type RegistrarTreinamentoInput,
} from "./dominio.js";
import { toMoney } from "../../packages/contracts/index.js";

/**
 * M22 — OS SERVIÇOS DE RH, BLOCO 1. TR item 06.
 *
 * ═══ ⚠️ TODOS SÃO ESCOPO "ENTE" ═══
 * `unidadeOrcId` existe numa entidade só do sistema — `FichaOrcamentaria` — e `escopo.ts:9-19`
 * fecha a consequência: ou a UG do fato vem de uma ficha, ou o fato é ato do ENTE. Servidor não
 * tem ficha. A LOTAÇÃO pode apontar para uma unidade orçamentária, mas o docblock de `escopo.ts`
 * é explícito sobre por que isso não vira escopo de permissão ("um órgão TEM VÁRIAS UGs —
 * conceder poder a partir dele daria poder sobre as irmãs"): admitir alguém não é ato de uma
 * unidade orçamentária, é ato do ente que o nomeia.
 *
 * ═══ ⚠️ O REGISTRO DE OPERAÇÃO NÃO MORA AQUI ═══
 * Como em todo o repositório: o log vai FORA da transação, na BORDA (`comEscritaDoScaffold`),
 * senão o rollback de uma negação levaria embora a prova da tentativa.
 *
 * ═══ APPEND-ONLY ═══
 * Nada aqui apaga nada, e há UMA exceção declarada: `baixarFinalidadeDependente` escreve
 * `dataBaixa` na linha existente. O docblock dela explica o que se perde e por que a alternativa
 * era pior.
 */

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

// ═══════════════════════════════════════════════════════════════════════════════
// OS ERROS NOMEADOS — cada um diz o que fazer, não só o que houve
// ═══════════════════════════════════════════════════════════════════════════════

export class MatriculaJaUsadaError extends Error {
  constructor(matricula: string, deQuem: string) {
    super(
      `MATRICULA-JA-USADA: a matrícula ${matricula} já pertence ao vínculo de ${deQuem}. ` +
        `A matrícula é única no ente inteiro — se o ente reaproveita matrículas de servidores ` +
        `desligados, a carga tem de desambiguá-las: somar dois históricos funcionais numa ` +
        `matrícula só é irreversível.`
    );
    this.name = "MatriculaJaUsadaError";
  }
}

export class VinculoDesligadoError extends Error {
  constructor(matricula: string, quando: Date) {
    super(
      `VINCULO-DESLIGADO: o vínculo ${matricula} foi desligado em ` +
        `${diaCivil(quando)}. Um vínculo encerrado não recebe eventos ` +
        `posteriores — readmitir é OUTRO vínculo, com outra matrícula.`
    );
    this.name = "VinculoDesligadoError";
  }
}

export class CicloDeLotacaoError extends Error {
  constructor(codigo: string) {
    super(
      `CICLO-DE-LOTACAO: pôr ${codigo} nessa posição fecharia a árvore do organograma em si ` +
        `mesma. Uma árvore fechada faz a consulta que a percorre girar para sempre — a tela ` +
        `trava sem erro e sem log.`
    );
    this.name = "CicloDeLotacaoError";
  }
}

export class FinalidadeJaBaixadaError extends Error {
  constructor(quando: Date) {
    super(
      `FINALIDADE-JA-BAIXADA: esta finalidade foi baixada em ` +
        `${diaCivil(quando)}. Para reativá-la, registre uma finalidade NOVA — ` +
        `a baixa é fato, e apagá-la apagaria o período em que o dependente não valeu.`
    );
    this.name = "FinalidadeJaBaixadaError";
  }
}

export class ContratoIndeterminadoError extends Error {
  constructor(numero: string) {
    super(
      `CONTRATO-INDETERMINADO: o contrato ${numero} é por prazo INDETERMINADO — ele não tem ` +
        `término a prorrogar.`
    );
    this.name = "ContratoIndeterminadoError";
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// OS GUARDS COMPARTILHADOS — LEITURA, e nada mais
// ═══════════════════════════════════════════════════════════════════════════════
//
// ⚠️ ELES NÃO AUTORIZAM. A chamada de autorização fica no CORPO PÚBLICO de cada serviço, sempre
// — é o que o t6 do censo (`m16-censo.test.ts`) exige, e é o que impede que alguém copie um
// serviço, esqueça de trocar a ação e passe a cobrar o crachá do vizinho. O que estes helpers
// fazem é a leitura de existência, cuja mensagem pertence ao serviço.

/** O vínculo existe? A mensagem é DESTE módulo — o resolvedor de escopo não a sequestra. */
async function exigirVinculo(
  tx: Tx,
  vinculoId: string
): Promise<{
  readonly matricula: string;
  readonly dataAdmissao: Date;
  readonly eventos: readonly EventoDoVinculo[];
}> {
  const v = await tx.vinculo.findUnique({
    where: { id: vinculoId },
    select: {
      matricula: true,
      dataAdmissao: true,
      eventos: {
        select: { data: true, criadoEm: true, tipo: true, cargoId: true, lotacaoId: true, salarioBase: true },
      },
    },
  });
  if (v === null) throw new Error(`Vínculo ${vinculoId} não existe.`);
  return {
    matricula: v.matricula,
    dataAdmissao: v.dataAdmissao,
    eventos: v.eventos.map((e) => ({
      data: e.data,
      criadoEm: e.criadoEm,
      tipo: e.tipo,
      cargoId: e.cargoId,
      lotacaoId: e.lotacaoId,
      salarioBase: e.salarioBase === null ? null : toMoney(e.salarioBase.toFixed(2)),
    })),
  };
}

/**
 * ⚠️ FAIL-CLOSED, E LIDO DENTRO DA TRANSAÇÃO. Checar fora é checar um passado que já pode ter
 * mudado: o vínculo pode ser desligado entre a leitura da tela e o submit do evento.
 *
 * ⚠️ E A PERGUNTA É "DESLIGADO **NA DATA DO EVENTO**", não "desligado hoje". Um evento com data
 * retroativa anterior ao desligamento é legítimo (a portaria saiu depois); um posterior não é.
 */
function recusarSeDesligado(
  matricula: string,
  eventos: readonly EventoDoVinculo[],
  quando: Date
): void {
  if (situacaoDoVinculo(eventos, quando) === "DESLIGADO") {
    const fim = eventos.find((e) => e.tipo === "DESLIGAMENTO");
    throw new VinculoDesligadoError(matricula, fim === undefined ? quando : fim.data);
  }
}

/** O evento não pode ser anterior à própria admissão. */
function recusarSeAntesDaAdmissao(matricula: string, dataAdmissao: Date, quando: Date): void {
  if (quando.getTime() < dataAdmissao.getTime()) {
    throw new Error(
      `EVENTO-ANTES-DA-ADMISSAO: o vínculo ${matricula} foi admitido em ` +
        `${diaCivil(dataAdmissao)} e o evento é de ` +
        `${diaCivil(quando)}.`
    );
  }
}

/**
 * O CARGO EXISTE E ESTÁ VIGENTE NA DATA?
 *
 * ⚠️ "VIGENTE NA DATA", e não "vigente hoje". Registrar hoje uma promoção retroativa a 2019 para
 * um cargo extinto em 2020 é legítimo — o cargo existia quando o ato aconteceu. Perguntar por
 * hoje recusaria o registro correto e obrigaria alguém a "desextinguir" o cargo para gravá-lo.
 */
async function exigirCargoVigente(tx: Tx, cargoId: string, quando: Date): Promise<void> {
  const c = await tx.cargo.findUnique({
    where: { id: cargoId },
    select: { codigo: true, dataExtincao: true },
  });
  if (c === null) throw new Error(`Cargo ${cargoId} não existe.`);
  if (c.dataExtincao !== null && c.dataExtincao.getTime() <= quando.getTime()) {
    throw new Error(
      `CARGO-EXTINTO: o cargo ${c.codigo} foi extinto em ` +
        `${diaCivil(c.dataExtincao)}, antes de ` +
        `${diaCivil(quando)}.`
    );
  }
}

async function exigirLotacaoVigente(tx: Tx, lotacaoId: string, quando: Date): Promise<void> {
  const l = await tx.lotacao.findUnique({
    where: { id: lotacaoId },
    select: { codigo: true, dataExtincao: true },
  });
  if (l === null) throw new Error(`Lotação ${lotacaoId} não existe.`);
  if (l.dataExtincao !== null && l.dataExtincao.getTime() <= quando.getTime()) {
    throw new Error(
      `LOTACAO-EXTINTA: a lotação ${l.codigo} foi extinta em ` +
        `${diaCivil(l.dataExtincao)}, antes de ` +
        `${diaCivil(quando)}.`
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// A ESTRUTURA — TR reqs. 8, 9, 10
// ═══════════════════════════════════════════════════════════════════════════════

export async function cadastrarCargo(
  prisma: PrismaClient,
  input: CadastrarCargoInput
): Promise<{ readonly cargoId: string }> {
  const dados = zCadastrarCargoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.cadastrarCargo, "ENTE");

    const criado = await tx.cargo.create({
      data: {
        codigo: dados.codigo,
        denominacao: dados.denominacao,
        tipo: dados.tipo,
        vagasFixadas: dados.vagasFixadas,
        leiAutorizativa: dados.leiAutorizativa,
        dataPublicacaoLei: dados.dataPublicacaoLei,
        requisitoIngresso: dados.requisitoIngresso ?? null,
        cargaHorariaSemanal: dados.cargaHorariaSemanal ?? null,
        dataExtincao: dados.dataExtincao ?? null,
        leiExtincao: dados.leiExtincao ?? null,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { cargoId: criado.id };
  });
}

/**
 * ⚠️ O CICLO É RECUSADO AQUI, porque o CHECK do banco só alcança o de UM nó.
 * `ck_lotacao_nao_e_pai_de_si` pega A → A; A → B → A precisa da CADEIA, e a cadeia vem do banco.
 * A regra pura mora no domínio (`criaCicloDeLotacao`) e tem teste sem Postgres.
 */
export async function cadastrarLotacao(
  prisma: PrismaClient,
  input: CadastrarLotacaoInput
): Promise<{ readonly lotacaoId: string }> {
  const dados = zCadastrarLotacaoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.cadastrarLotacao, "ENTE");

    if (dados.paiId !== undefined) {
      const pai = await tx.lotacao.findUnique({
        where: { id: dados.paiId },
        select: { id: true },
      });
      if (pai === null) throw new Error(`Lotação pai ${dados.paiId} não existe.`);
      // A lotação ainda não tem id — o ciclo de um nó é impossível na criação. O guard completo
      // vale para a REPARENTAGEM, que este bloco não entrega (pendência nomeada no MODULO.md);
      // a função pura já está pronta e testada para quando ela chegar.
      if (criaCicloDeLotacao(dados.codigo, dados.paiId, [])) {
        throw new CicloDeLotacaoError(dados.codigo);
      }
    }

    if (dados.unidadeOrcId !== undefined) {
      const uo = await tx.unidadeOrcamentaria.findUnique({
        where: { id: dados.unidadeOrcId },
        select: { id: true },
      });
      if (uo === null) {
        throw new Error(`Unidade orçamentária ${dados.unidadeOrcId} não existe.`);
      }
    }

    const criada = await tx.lotacao.create({
      data: {
        codigo: dados.codigo,
        nome: dados.nome,
        paiId: dados.paiId ?? null,
        unidadeOrcId: dados.unidadeOrcId ?? null,
        dataExtincao: dados.dataExtincao ?? null,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { lotacaoId: criada.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// A PESSOA — TR reqs. 2, 5, 12, 13
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ O CPF CHEGA JÁ NORMALIZADO — é do TIPO da entrada (`zCpf` transforma antes de validar), e
 * não uma chamada que este serviço faz e outro esquece. Não há caminho que a pule.
 */
/** O nome que as telas e as mensagens usam: o social quando há; senão o da versão vigente da pessoa. */
export async function nomeDoServidor(tx: Tx, servidorId: string): Promise<string> {
  const s = await tx.servidor.findUnique({
    where: { id: servidorId },
    select: { nomeSocial: true, pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } },
  });
  if (s === null) return servidorId;
  return s.nomeSocial ?? s.pessoa.versoes[0]?.nome ?? s.pessoa.documento;
}

export async function cadastrarServidor(
  prisma: PrismaClient,
  input: CadastrarServidorInput
): Promise<{ readonly servidorId: string }> {
  const dados = zCadastrarServidorInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.cadastrarServidor, "ENTE");

    // ⚠️ V6 P2.1 — A PESSOA É DO CADASTRO ÚNICO (M19): existe, é FÍSICA e ainda não é servidor.
    const pessoa = await tx.pessoa.findUnique({
      where: { id: dados.pessoaId },
      select: { id: true, tipo: true, documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } }, servidor: { select: { id: true } } },
    });
    if (pessoa === null) throw new Error(`Pessoa ${dados.pessoaId} não existe no cadastro único. Cadastre a pessoa antes do servidor.`);
    if (pessoa.tipo !== "FISICA") {
      throw new Error(`PESSOA-JURIDICA: ${pessoa.versoes[0]?.nome ?? pessoa.documento} é pessoa jurídica — servidor é pessoa física. Nada foi gravado.`);
    }
    if (pessoa.servidor !== null) {
      // ⚠️ AQUI É ERRO, e no vínculo é ALERTA (TR req. 4) — a diferença é o que se está criando.
      // Duas fichas para a mesma pessoa é impossível; duas MATRÍCULAS da mesma pessoa é rotina.
      throw new Error(
        `PESSOA-JA-E-SERVIDOR: ${pessoa.versoes[0]?.nome ?? pessoa.documento} já tem ficha de servidor. Se é um segundo ` +
          `vínculo, use a admissão — ela aceita N matrículas por pessoa.`
      );
    }

    const criado = await tx.servidor.create({
      data: {
        pessoaId: pessoa.id,
        nomeSocial: dados.nomeSocial ?? null,
        dataNascimento: dados.dataNascimento,
        sexo: dados.sexo,
        pisPasep: dados.pisPasep ?? null,
        rgNumero: dados.rgNumero ?? null,
        rgOrgaoEmissor: dados.rgOrgaoEmissor ?? null,
        rgUf: dados.rgUf ?? null,
        rgDataEmissao: dados.rgDataEmissao ?? null,
        tituloEleitor: dados.tituloEleitor ?? null,
        tituloZona: dados.tituloZona ?? null,
        tituloSecao: dados.tituloSecao ?? null,
        ctpsNumero: dados.ctpsNumero ?? null,
        ctpsSerie: dados.ctpsSerie ?? null,
        ctpsUf: dados.ctpsUf ?? null,
        nomeMae: dados.nomeMae ?? null,
        nomePai: dados.nomePai ?? null,
        fotoCaminho: dados.fotoCaminho ?? null,
        fotoTipoConteudo: dados.fotoTipoConteudo ?? null,
        fotoHashSha256: dados.fotoHashSha256 ?? null,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { servidorId: criado.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// O VÍNCULO — TR reqs. 3, 4, 17, 18, 25
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A ADMISSÃO — cria o vínculo E o evento `ADMISSAO`, na mesma transação.
 *
 * ═══ ⚠️ SEGUNDA MATRÍCULA PARA O MESMO CPF É **ALERTA**, NÃO ERRO — TR req. 4 ═══
 * A acumulação é legítima e comum: professor com duas cadeiras (CF art. 37, XVI, "a"), médico
 * com dois cargos de saúde ("c"), servidor com cargo efetivo e função gratificada. Recusar
 * obrigaria o RH a cadastrar a mesma pessoa duas vezes com CPFs falsos — e aí a DIRF do ente
 * declararia dois rendimentos a duas pessoas que são a mesma.
 *
 * ⚠️ MAS TAMBÉM NÃO PODE PASSAR EM SILÊNCIO: a acumulação tem limite constitucional, e é
 * exatamente por não haver aviso nenhum que o acúmulo ilegal atravessa anos. O serviço devolve
 * as OUTRAS matrículas do CPF, e a tela as mostra.
 *
 * ⚠️ E O ALERTA VAI NO RETORNO, NÃO NUM LOG. Um `console.warn` na transação seria visto por
 * ninguém — quem precisa da informação é quem está admitindo, na hora.
 */
export async function admitirServidor(
  prisma: PrismaClient,
  input: AdmitirServidorInput
): Promise<{
  readonly vinculoId: string;
  readonly alertaAcumulacao: readonly { readonly matricula: string; readonly tipo: string }[];
}> {
  const dados = zAdmitirServidorInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.admitirServidor, "ENTE");

    const servidor = await tx.servidor.findUnique({
      where: { id: dados.servidorId },
      select: { id: true, vinculos: { select: { matricula: true, tipo: true } } },
    });
    if (servidor === null) throw new Error(`Servidor ${dados.servidorId} não existe.`);

    const usada = await tx.vinculo.findUnique({
      where: { matricula: dados.matricula },
      select: { servidorId: true },
    });
    if (usada !== null) {
      throw new MatriculaJaUsadaError(dados.matricula, await nomeDoServidor(tx, usada.servidorId));
    }

    await exigirCargoVigente(tx, dados.cargoId, dados.dataAdmissao);
    await exigirLotacaoVigente(tx, dados.lotacaoId, dados.dataAdmissao);

    if (dados.portariaId !== undefined) {
      const p = await tx.portaria.findUnique({
        where: { id: dados.portariaId },
        select: { id: true },
      });
      if (p === null) throw new Error(`Portaria ${dados.portariaId} não existe.`);
    }

    const vinculo = await tx.vinculo.create({
      data: {
        servidorId: dados.servidorId,
        matricula: dados.matricula,
        tipo: dados.tipo,
        regimeJuridico: dados.regimeJuridico,
        regimePrevidenciario: dados.regimePrevidenciario ?? null,
        dataAdmissao: dados.dataAdmissao,
        observacao: dados.observacao ?? null,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });

    // ⚠️ O EVENTO DE ADMISSÃO NASCE JUNTO, e é ele que dá cargo, lotação e salário ao vínculo —
    // que NÃO os tem como coluna. Um vínculo sem este evento teria `cargoVigenteEm` nulo para
    // sempre: ninguém saberia em que cargo a pessoa foi nomeada, nem a folha quanto pagar.
    await tx.historicoVinculo.create({
      data: {
        vinculoId: vinculo.id,
        data: dados.dataAdmissao,
        tipo: "ADMISSAO",
        cargoId: dados.cargoId,
        lotacaoId: dados.lotacaoId,
        salarioBase: dados.salarioBase.toFixed(2),
        motivo: dados.observacao ?? "Admissão",
        portariaId: dados.portariaId ?? null,
        criadoPor: dados.criadoPor,
      },
    });

    return {
      vinculoId: vinculo.id,
      alertaAcumulacao: servidor.vinculos.map((v) => ({ matricula: v.matricula, tipo: v.tipo })),
    };
  });
}

/** MOVER — readaptação, remoção, afastamento, retorno. Não mexe em remuneração. */
export async function registrarMovimentacao(
  prisma: PrismaClient,
  input: RegistrarMovimentacaoInput
): Promise<{ readonly eventoId: string }> {
  const dados = zRegistrarMovimentacaoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.registrarMovimentacao, "ENTE");

    const v = await exigirVinculo(tx, dados.vinculoId);
    recusarSeAntesDaAdmissao(v.matricula, v.dataAdmissao, dados.data);
    recusarSeDesligado(v.matricula, v.eventos, dados.data);

    if (dados.cargoId !== undefined) await exigirCargoVigente(tx, dados.cargoId, dados.data);
    if (dados.lotacaoId !== undefined) {
      await exigirLotacaoVigente(tx, dados.lotacaoId, dados.data);
    }

    const criado = await tx.historicoVinculo.create({
      data: {
        vinculoId: dados.vinculoId,
        data: dados.data,
        tipo: dados.tipo,
        cargoId: dados.cargoId ?? null,
        lotacaoId: dados.lotacaoId ?? null,
        motivo: dados.motivo,
        portariaId: dados.portariaId ?? null,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { eventoId: criado.id };
  });
}

/** PAGAR — promoção, reajuste, gratificação. Outro crachá, pelo motivo no censo. */
export async function registrarAlteracaoRemuneratoria(
  prisma: PrismaClient,
  input: RegistrarAlteracaoRemuneratoriaInput
): Promise<{ readonly eventoId: string }> {
  const dados = zRegistrarAlteracaoRemuneratoriaInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.registrarAlteracaoRemuneratoria, "ENTE");

    const v = await exigirVinculo(tx, dados.vinculoId);
    recusarSeAntesDaAdmissao(v.matricula, v.dataAdmissao, dados.data);
    recusarSeDesligado(v.matricula, v.eventos, dados.data);

    if (dados.cargoId !== undefined) await exigirCargoVigente(tx, dados.cargoId, dados.data);

    const criado = await tx.historicoVinculo.create({
      data: {
        vinculoId: dados.vinculoId,
        data: dados.data,
        tipo: dados.tipo,
        cargoId: dados.cargoId ?? null,
        salarioBase: dados.salarioBase === undefined ? null : dados.salarioBase.toFixed(2),
        gratificacaoDescricao: dados.gratificacaoDescricao ?? null,
        gratificacaoValor:
          dados.gratificacaoValor === undefined ? null : dados.gratificacaoValor.toFixed(2),
        motivo: dados.motivo,
        portariaId: dados.portariaId ?? null,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { eventoId: criado.id };
  });
}

/**
 * DESLIGAR — exoneração, demissão, aposentadoria, falecimento.
 *
 * ⚠️ HÁ NO MÁXIMO UM POR VÍNCULO, e quem impõe é o índice parcial
 * `uq_historico_vinculo_desligamento`. O guard abaixo existe para dar a mensagem: sem ele, o
 * usuário receberia uma violação de índice em vez de saber que o vínculo já estava encerrado.
 */
export async function desligarServidor(
  prisma: PrismaClient,
  input: DesligarServidorInput
): Promise<{ readonly eventoId: string }> {
  const dados = zDesligarServidorInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.desligarServidor, "ENTE");

    const v = await exigirVinculo(tx, dados.vinculoId);
    recusarSeAntesDaAdmissao(v.matricula, v.dataAdmissao, dados.data);
    if (v.eventos.some((e) => e.tipo === "DESLIGAMENTO")) {
      const fim = v.eventos.find((e) => e.tipo === "DESLIGAMENTO");
      throw new VinculoDesligadoError(v.matricula, fim === undefined ? dados.data : fim.data);
    }

    if (dados.portariaId !== undefined) {
      const p = await tx.portaria.findUnique({
        where: { id: dados.portariaId },
        select: { id: true },
      });
      if (p === null) throw new Error(`Portaria ${dados.portariaId} não existe.`);
    }

    const criado = await tx.historicoVinculo.create({
      data: {
        vinculoId: dados.vinculoId,
        data: dados.data,
        tipo: "DESLIGAMENTO",
        motivo: dados.motivo,
        portariaId: dados.portariaId ?? null,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { eventoId: criado.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEPENDENTES — TR reqs. 6 e 7
// ═══════════════════════════════════════════════════════════════════════════════

export async function cadastrarDependente(
  prisma: PrismaClient,
  input: CadastrarDependenteInput
): Promise<{ readonly dependenteId: string; readonly finalidadeId: string }> {
  const dados = zCadastrarDependenteInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.cadastrarDependente, "ENTE");

    const s = await tx.servidor.findUnique({
      where: { id: dados.servidorId },
      select: { id: true },
    });
    if (s === null) throw new Error(`Servidor ${dados.servidorId} não existe.`);

    const dependente = await tx.dependente.create({
      data: {
        servidorId: dados.servidorId,
        nome: dados.nome,
        cpf: dados.cpf ?? null,
        dataNascimento: dados.dataNascimento,
        grauParentesco: dados.grauParentesco,
        invalidezPermanente: dados.invalidezPermanente ?? false,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });

    // ⚠️ O LIMITE VEM DO RECORD DO DOMÍNIO quando a entrada o omite — não de um `@default` de
    // coluna. O padrão DEPENDE da finalidade (14 no salário-família, 21 no IR); um default de
    // coluna teria de escolher um dos dois e estaria errado no outro.
    const finalidade = await tx.finalidadeDependente.create({
      data: {
        dependenteId: dependente.id,
        finalidade: dados.finalidade,
        dataInicio: dados.dataInicio,
        limiteIdadeAnos: dados.limiteIdadeAnos ?? LIMITE_ETARIO_LEGAL[dados.finalidade],
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });

    return { dependenteId: dependente.id, finalidadeId: finalidade.id };
  });
}

export async function registrarFinalidadeDependente(
  prisma: PrismaClient,
  input: RegistrarFinalidadeDependenteInput
): Promise<{ readonly finalidadeId: string }> {
  const dados = zRegistrarFinalidadeDependenteInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.registrarFinalidadeDependente, "ENTE");

    const d = await tx.dependente.findUnique({
      where: { id: dados.dependenteId },
      select: { id: true },
    });
    if (d === null) throw new Error(`Dependente ${dados.dependenteId} não existe.`);

    const criada = await tx.finalidadeDependente.create({
      data: {
        dependenteId: dados.dependenteId,
        finalidade: dados.finalidade,
        dataInicio: dados.dataInicio,
        limiteIdadeAnos: dados.limiteIdadeAnos ?? LIMITE_ETARIO_LEGAL[dados.finalidade],
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { finalidadeId: criada.id };
  });
}

/**
 * A BAIXA POR **FATO** — óbito, perda da guarda, decisão judicial.
 *
 * ═══ ⚠️ A ÚNICA ESCRITA NÃO-APPEND-ONLY DO MÓDULO, E O QUE SE PERDE ═══
 * Ela grava `dataBaixa`/`motivoBaixa` na linha existente. O que se perde é a possibilidade de
 * dizer "quem baixou e quando digitou" — o `criadoPor` da linha continua sendo o de quem a
 * criou. A alternativa (uma tabela de baixas) daria isso, e custaria um join em toda consulta de
 * folha do bloco 2 para responder "este dependente vale hoje?" — que é a pergunta mais frequente
 * do módulo inteiro.
 *
 * O registro de QUEM baixou não se perde de verdade: `comEscritaDoScaffold` grava a operação na
 * borda, com identificador e IP, fora da transação. É lá que a auditoria olha.
 *
 * ⚠️ E A BAIXA POR IDADE NÃO PASSA POR AQUI: ela é DERIVADA (`dependenteValeEm`). Um serviço
 * para ela seria um job noturno com outro nome.
 */
export async function baixarFinalidadeDependente(
  prisma: PrismaClient,
  input: BaixarFinalidadeDependenteInput
): Promise<void> {
  const dados = zBaixarFinalidadeDependenteInput.parse(input);

  await prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.baixarFinalidadeDependente, "ENTE");

    const f = await tx.finalidadeDependente.findUnique({
      where: { id: dados.finalidadeId },
      select: { dataInicio: true, dataBaixa: true },
    });
    if (f === null) throw new Error(`Finalidade ${dados.finalidadeId} não existe.`);
    if (f.dataBaixa !== null) throw new FinalidadeJaBaixadaError(f.dataBaixa);
    if (dados.dataBaixa.getTime() < f.dataInicio.getTime()) {
      throw new Error(
        `BAIXA-ANTES-DO-INICIO: a finalidade começou em ` +
          `${diaCivil(f.dataInicio)} e a baixa é de ` +
          `${diaCivil(dados.dataBaixa)}.`
      );
    }

    await tx.finalidadeDependente.update({
      where: { id: dados.finalidadeId },
      data: { dataBaixa: dados.dataBaixa, motivoBaixa: dados.motivoBaixa },
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// ATOS E REGISTROS — TR reqs. 11, 14, 15, 20, 22, 23
// ═══════════════════════════════════════════════════════════════════════════════

export async function registrarPortaria(
  prisma: PrismaClient,
  input: RegistrarPortariaInput
): Promise<{ readonly portariaId: string }> {
  const dados = zRegistrarPortariaInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.registrarPortaria, "ENTE");

    await exigirVinculo(tx, dados.vinculoId);

    const criada = await tx.portaria.create({
      data: {
        vinculoId: dados.vinculoId,
        numero: dados.numero,
        ano: dados.ano,
        tipo: dados.tipo,
        data: dados.data,
        ementa: dados.ementa,
        dataPublicacao: dados.dataPublicacao ?? null,
        veiculoPublicacao: dados.veiculoPublicacao ?? null,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { portariaId: criada.id };
  });
}

/**
 * A ANOTAÇÃO NA FICHA — TR req. 23, segunda metade. **APPEND-ONLY.**
 *
 * ⚠️ O VÍNCULO, QUANDO INFORMADO, TEM DE SER DO MESMO SERVIDOR — e isto o CHECK declarativo não
 * alcança (exigiria subconsulta). Sem o guard, uma advertência do professor entraria na ficha
 * dele apontando para a matrícula do vizinho, e a ficha de dois servidores ficaria misturada
 * exatamente no registro que tem consequência disciplinar.
 */
export async function registrarAnotacaoServidor(
  prisma: PrismaClient,
  input: RegistrarAnotacaoServidorInput
): Promise<{ readonly anotacaoId: string }> {
  const dados = zRegistrarAnotacaoServidorInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.registrarAnotacaoServidor, "ENTE");

    const s = await tx.servidor.findUnique({
      where: { id: dados.servidorId },
      select: { id: true },
    });
    if (s === null) throw new Error(`Servidor ${dados.servidorId} não existe.`);

    if (dados.vinculoId !== undefined) {
      const v = await tx.vinculo.findUnique({
        where: { id: dados.vinculoId },
        select: { matricula: true, servidorId: true },
      });
      if (v === null) throw new Error(`Vínculo ${dados.vinculoId} não existe.`);
      if (v.servidorId !== dados.servidorId) {
        throw new Error(
          `VINCULO-DE-OUTRO-SERVIDOR: a matrícula ${v.matricula} não pertence ao servidor da ` +
            `anotação. Anotação na ficha errada é registro disciplinar na pessoa errada.`
        );
      }
    }

    if (dados.portariaId !== undefined) {
      const p = await tx.portaria.findUnique({
        where: { id: dados.portariaId },
        select: { id: true },
      });
      if (p === null) throw new Error(`Portaria ${dados.portariaId} não existe.`);
    }

    const criada = await tx.anotacaoServidor.create({
      data: {
        servidorId: dados.servidorId,
        vinculoId: dados.vinculoId ?? null,
        data: dados.data,
        tipo: dados.tipo,
        titulo: dados.titulo,
        texto: dados.texto,
        portariaId: dados.portariaId ?? null,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { anotacaoId: criada.id };
  });
}

export async function registrarTreinamento(
  prisma: PrismaClient,
  input: RegistrarTreinamentoInput
): Promise<{ readonly treinamentoId: string }> {
  const dados = zRegistrarTreinamentoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.registrarTreinamento, "ENTE");

    const s = await tx.servidor.findUnique({
      where: { id: dados.servidorId },
      select: { id: true },
    });
    if (s === null) throw new Error(`Servidor ${dados.servidorId} não existe.`);

    const criado = await tx.treinamento.create({
      data: {
        servidorId: dados.servidorId,
        descricao: dados.descricao,
        instituicao: dados.instituicao ?? null,
        cargaHoraria: dados.cargaHoraria ?? null,
        dataInicio: dados.dataInicio,
        dataTermino: dados.dataTermino ?? null,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { treinamentoId: criado.id };
  });
}

export async function cadastrarDiaCalendarioRh(
  prisma: PrismaClient,
  input: CadastrarDiaCalendarioRhInput
): Promise<{ readonly diaId: string }> {
  const dados = zCadastrarDiaCalendarioRhInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.cadastrarDiaCalendarioRh, "ENTE");

    if (dados.lotacaoId !== undefined) {
      const l = await tx.lotacao.findUnique({
        where: { id: dados.lotacaoId },
        select: { id: true },
      });
      if (l === null) throw new Error(`Lotação ${dados.lotacaoId} não existe.`);
    }

    const criado = await tx.calendarioRh.create({
      data: {
        data: dados.data,
        tipo: dados.tipo,
        descricao: dados.descricao,
        horasExpediente:
          dados.horasExpediente === undefined ? null : dados.horasExpediente.toFixed(2),
        lotacaoId: dados.lotacaoId ?? null,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { diaId: criado.id };
  });
}

export async function cadastrarContratoTrabalho(
  prisma: PrismaClient,
  input: CadastrarContratoTrabalhoInput
): Promise<{ readonly contratoId: string }> {
  const dados = zCadastrarContratoTrabalhoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.cadastrarContratoTrabalho, "ENTE");

    const v = await exigirVinculo(tx, dados.vinculoId);
    recusarSeAntesDaAdmissao(v.matricula, v.dataAdmissao, dados.dataInicio);

    const criado = await tx.contratoTrabalho.create({
      data: {
        vinculoId: dados.vinculoId,
        numero: dados.numero,
        prazo: dados.prazo,
        dataInicio: dados.dataInicio,
        dataTerminoInicial: dados.dataTerminoInicial ?? null,
        objetoContratacao: dados.objetoContratacao,
        leiAutorizativa: dados.leiAutorizativa ?? null,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { contratoId: criado.id };
  });
}

export async function prorrogarContratoTrabalho(
  prisma: PrismaClient,
  input: ProrrogarContratoTrabalhoInput
): Promise<{ readonly prorrogacaoId: string }> {
  const dados = zProrrogarContratoTrabalhoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.prorrogarContratoTrabalho, "ENTE");

    const c = await tx.contratoTrabalho.findUnique({
      where: { id: dados.contratoId },
      select: { numero: true, prazo: true },
    });
    if (c === null) throw new Error(`Contrato de trabalho ${dados.contratoId} não existe.`);
    // ⚠️ Contrato por prazo INDETERMINADO não tem término — não há o que prorrogar. Deixar
    // passar criaria uma prorrogação que não move data nenhuma, e a tela mostraria um termo
    // aditivo sem efeito.
    if (c.prazo === "INDETERMINADO") throw new ContratoIndeterminadoError(c.numero);

    const criada = await tx.prorrogacaoContratoTrabalho.create({
      data: {
        contratoId: dados.contratoId,
        numeroTermo: dados.numeroTermo,
        data: dados.data,
        dias: dados.dias,
        motivo: dados.motivo,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { prorrogacaoId: criada.id };
  });
}

export async function registrarAvaliacaoExperiencia(
  prisma: PrismaClient,
  input: RegistrarAvaliacaoExperienciaInput
): Promise<{ readonly avaliacaoId: string }> {
  const dados = zRegistrarAvaliacaoExperienciaInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.registrarAvaliacaoExperiencia, "ENTE");

    const v = await exigirVinculo(tx, dados.vinculoId);
    recusarSeAntesDaAdmissao(v.matricula, v.dataAdmissao, dados.periodoInicio);

    const criada = await tx.avaliacaoExperiencia.create({
      data: {
        vinculoId: dados.vinculoId,
        etapa: dados.etapa,
        periodoInicio: dados.periodoInicio,
        periodoFim: dados.periodoFim,
        resultado: dados.resultado,
        pontuacao: dados.pontuacao === undefined ? null : dados.pontuacao.toFixed(2),
        parecer: dados.parecer ?? null,
        avaliadorNome: dados.avaliadorNome ?? null,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });
    return { avaliacaoId: criada.id };
  });
}
