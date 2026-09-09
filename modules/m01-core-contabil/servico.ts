import {
  gerarEstorno,
  type Partida,
} from "../../packages/ledger/index.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import {
  comporLancamento,
  zEstornarLancamentoInput,
  type EstornarLancamentoInput,
  type RegistrarLancamentoInput,
} from "./dominio.js";
import type {
  ContaResolvida,
  M01Deps,
  PartidaParaPersistir,
} from "./ports.js";

/**
 * CASOS DE USO do M01. Orquestra: domain puro (comporLancamento / gerarEstorno)
 * + ports. Não fala Prisma — só ports.
 *
 * A barreira do INVARIANTE 5 ("conta tem que ser analítica") é aplicada aqui,
 * contra a ContaRepositoryPort, E DE NOVO dentro da transação do adapter: entre
 * a checagem e o INSERT o plano de contas pode mudar.
 */

/** Resolve códigos PCASP em contas, aplicando as barreiras fail-closed. */
async function resolverContasAnaliticas(
  codigos: readonly string[],
  deps: M01Deps
): Promise<ReadonlyMap<string, ContaResolvida>> {
  const unicos = [...new Set(codigos)];
  const encontradas = await deps.contas.buscarPorCodigos(unicos);
  const porCodigo = new Map(encontradas.map((c) => [c.codigo, c]));

  const inexistentes = unicos.filter((c) => !porCodigo.has(c));
  if (inexistentes.length > 0) {
    throw new Error(
      `Conta(s) inexistente(s) no plano PCASP: ${inexistentes.join(", ")}.`
    );
  }

  const sinteticas = encontradas.filter((c) => !c.analitica);
  if (sinteticas.length > 0) {
    throw new Error(
      `Conta sintética não recebe partida: ` +
        `${sinteticas.map((c) => c.codigo).join(", ")}. ` +
        `Só conta ANALÍTICA pode ser lançada.`
    );
  }

  return porCodigo;
}

function paraPersistir(
  partidas: readonly Partida[],
  porCodigo: ReadonlyMap<string, ContaResolvida>
): readonly PartidaParaPersistir[] {
  return partidas.map((partida) => ({
    // resolverContasAnaliticas já garantiu que toda conta está no índice.
    contaId: porCodigo.get(partida.conta)!.id,
    tipo: partida.tipo,
    subsistema: partida.subsistema,
    valor: partida.valor,
  }));
}

/**
 * Registra um lançamento contábil novo.
 * Ordem: forma (Zod) -> invariantes contábeis (motor puro) -> plano de contas
 * (fail-closed) -> persistência atômica.
 */
export async function registrarLancamento(
  input: RegistrarLancamentoInput,
  deps: M01Deps
): Promise<string> {
  // Domain puro: ΣDEBITO == ΣCREDITO, valor > 0, >=1 débito e >=1 crédito —
  // no lançamento inteiro e dentro de cada subsistema.
  const { dados, partidas } = comporLancamento(input);

  // ⚠️ A CHAVE-MESTRA DO RAZÃO (TR 5.95), E ELA É ATO DO ENTE — "ENTE", não uma UG.
  //
  // O input do lançamento manual não tem ficha: a partida é conta + tipo + subsistema + valor.
  // Não há de onde derivar unidade gestora, e inventar uma seria pior do que não ter: daria a
  // impressão de um recorte que não existe. Só a permissão GLOBAL autoriza — e está certo que
  // seja assim, porque quem pode lançar partidas ARBITRÁRIAS no razão pode reescrever qualquer
  // número deste sistema. É a permissão mais perigosa do rol, e é a que o TCE vai perguntar
  // quem tem.
  await deps.autz.exigir(
    dados.criadoPor,
    ACAO_DO_SERVICO.registrarLancamento,
    "ENTE"
  );

  const porCodigo = await resolverContasAnaliticas(
    partidas.map((p) => p.conta),
    deps
  );

  return deps.lancamentos.persistir({
    id: deps.ids.novo(),
    numeroControle: dados.numeroControle,
    dataTransacao: dados.dataTransacao,
    historico: dados.historico,
    origemTipo: dados.origemTipo,
    origemId: dados.origemId,
    criadoPor: dados.criadoPor,
    partidas: paraPersistir(partidas, porCodigo),
  });
}

/**
 * Estorna um lançamento: INVARIANTE 3 — não escreve de volta no original,
 * persiste um NOVO lançamento com as partidas invertidas apontando para ele via
 * `estornoDeId`. O motor puro rejeita duplo estorno lendo `original.estornos`.
 */
export async function estornarLancamento(
  input: EstornarLancamentoInput,
  deps: M01Deps
): Promise<string> {
  const dados = zEstornarLancamentoInput.parse(input);

  // ⚠️ O ESTORNO SEGUE AS UGs DO LANÇAMENTO ESTORNADO — TODAS elas.
  //
  // As partidas do original podem carregar fichas de unidades diferentes. Desfazê-lo mexe nas
  // duas pernas ao mesmo tempo (o estorno é um lançamento só, e ou ele grava inteiro ou não
  // grava), então quem só pode na Saúde não desfaz, "de carona", a perna da Educação. Sem
  // ficha nenhuma (o manual puro), o escopo é o do ENTE. Ver `ugsDoLancamento`.
  await deps.autz.exigir(dados.criadoPor, ACAO_DO_SERVICO.estornarLancamento, {
    lancamento: dados.lancamentoId,
  });

  const original = await deps.lancamentos.buscar(dados.lancamentoId);
  if (original === null) {
    throw new Error(`Lançamento ${dados.lancamentoId} não encontrado.`);
  }

  const estorno = gerarEstorno(original, {
    idEstorno: deps.ids.novo(),
    numeroControleEstorno: dados.numeroControleEstorno,
    dataEstorno: dados.dataEstorno,
  });

  // As contas do original já eram analíticas, mas o plano pode ter mudado —
  // fail-closed de novo, e é daqui que sai o contaId de cada partida invertida.
  const porCodigo = await resolverContasAnaliticas(
    estorno.partidas.map((p) => p.conta),
    deps
  );

  return deps.lancamentos.persistir({
    id: estorno.id,
    numeroControle: estorno.numeroControle,
    dataTransacao: estorno.dataTransacao,
    historico: estorno.historico,
    origemTipo: "ESTORNO",
    origemId: original.id,
    estornoDeId: original.id,
    criadoPor: dados.criadoPor,
    partidas: paraPersistir(estorno.partidas, porCodigo),
  });
}
