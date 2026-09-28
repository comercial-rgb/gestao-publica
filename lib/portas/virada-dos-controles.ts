import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import {
  classificarContaNaVirada,
  contasDaVirada,
  type DestinoDaConta,
} from "../../modules/m08-restos-a-pagar/classificacao-da-virada";
import {
  encerrarControlesOrcamentarios,
  estornarEncerramentoControles,
  ORIGEM_ENCERRAMENTO_CONTROLES,
} from "../../modules/m08-restos-a-pagar/encerramento-controles";

/**
 * PORTA — A VIRADA DAS CONTAS DE CONTROLE (classes 5 e 6), V20.
 *
 * ⚠️ TRÊS ESCRITAS, TRÊS AÇÕES DIFERENTES, e a separação é a mesma que o resto do sistema usa:
 * classificar cobra `PARAMETRIZAR_VIRADA_DOS_CONTROLES` (ato normativo do ente), encerrar cobra
 * `ENCERRAR_CONTROLES_ORCAMENTARIOS` (ato de execução) e estornar cobra
 * `ESTORNAR_ENCERRAMENTO_CONTROLES`. Quem executa não deve poder reescrever a régua pela qual o
 * próprio encerramento dele é medido.
 *
 * ⚠️ E DINHEIRO ATRAVESSA COMO STRING DECIMAL. Um `Decimal` cruzando para o Server Component
 * funcionaria por acidente e quebraria no dia em que a tela virasse ilha client.
 */

export { PortaSemBancoError };

export interface ContaDaViradaParaTela {
  readonly codigo: string;
  readonly nome: string;
  readonly naturezaSaldo: "DEVEDORA" | "CREDORA";
  readonly saldo: string;
  readonly pernaSeEncerrar: "DEBITO" | "CREDITO";
  readonly destino: DestinoDaConta | null;
  readonly justificativa: string | null;
  readonly classificadoPor: string | null;
  readonly destinoSugerido: DestinoDaConta;
  readonly razaoDaSugestao: string;
  readonly analitica: boolean;
}

export interface ViradaParaTela {
  readonly ano: number;
  readonly corte: Date;
  readonly exercicioId: string | null;
  readonly exercicioEncerrado: boolean;
  readonly contas: readonly ContaDaViradaParaTela[];
  readonly somaDebito: string;
  readonly somaCredito: string;
  /** Quantas contas com saldo ainda não têm destino declarado — o que falta para poder encerrar. */
  readonly semDestino: number;
  /** `true` quando ΣDÉBITO == ΣCRÉDITO entre as contas classificadas como ENCERRA. */
  readonly fecha: boolean;
}

export async function lerViradaDosControles(p: {
  readonly ano: number;
}): Promise<ViradaParaTela> {
  const r = await contasDaVirada(cliente(), p);
  return {
    ano: r.ano,
    corte: r.corte,
    exercicioId: r.exercicioId,
    exercicioEncerrado: r.exercicioEncerrado,
    somaDebito: r.somaDebito.toFixed(2),
    somaCredito: r.somaCredito.toFixed(2),
    semDestino: r.contas.filter((c) => c.destino === null).length,
    fecha: r.somaDebito.equals(r.somaCredito),
    contas: r.contas.map((c) => ({
      codigo: c.codigo,
      nome: c.nome,
      naturezaSaldo: c.naturezaSaldo,
      saldo: c.saldo.toFixed(2),
      pernaSeEncerrar: c.pernaSeEncerrar,
      destino: c.destino,
      justificativa: c.justificativa,
      classificadoPor: c.classificadoPor,
      destinoSugerido: c.sugestao.destino,
      razaoDaSugestao: c.sugestao.razao,
      analitica: c.analitica,
    })),
  };
}

/** Os encerramentos JÁ FEITOS, para a tela poder oferecer o estorno de um deles. */
export interface EncerramentoFeitoParaTela {
  readonly operacaoId: string;
  readonly lancamentoId: string;
  readonly numeroControle: string;
  readonly data: Date;
  readonly historico: string;
  readonly criadoPor: string;
  readonly estornado: boolean;
}

export async function lerEncerramentosDeControles(): Promise<
  readonly EncerramentoFeitoParaTela[]
> {
  const prisma = cliente();
  const lancamentos = await prisma.lancamentoContabil.findMany({
    where: { origemTipo: ORIGEM_ENCERRAMENTO_CONTROLES, estornoDeId: null },
    orderBy: { dataTransacao: "desc" },
    select: {
      id: true,
      origemId: true,
      numeroControle: true,
      dataTransacao: true,
      historico: true,
      criadoPor: true,
      estornos: { select: { id: true } },
    },
  });
  return lancamentos
    .filter((l) => l.origemId !== null)
    .map((l) => ({
      operacaoId: l.origemId as string,
      lancamentoId: l.id,
      numeroControle: l.numeroControle,
      data: l.dataTransacao,
      historico: l.historico,
      criadoPor: l.criadoPor,
      estornado: l.estornos.length > 0,
    }));
}

/** CLASSIFICAR (ou reclassificar) uma conta — ESCRITA AUTENTICADA. */
export async function classificarConta(input: {
  readonly contaCodigo: string;
  readonly destino: DestinoDaConta;
  readonly justificativa: string;
}): Promise<{ readonly codigo: string; readonly reclassificada: boolean }> {
  return comEscritaAutenticada("PARAMETRIZAR_VIRADA_DOS_CONTROLES", async (criadoPor) => {
    const r = await classificarContaNaVirada(cliente(), { ...input, criadoPor });
    return { codigo: r.codigo, reclassificada: r.reclassificada };
  });
}

/**
 * ENCERRAR os controles do exercício — ESCRITA AUTENTICADA.
 *
 * ⚠️ A TELA PASSA O ANO E A PORTA RESOLVE O `exercicioId`. O serviço pede o id porque ele é o dono
 * do lock por exercício; a tela fala em ANO, que é o que o operador enxerga. Resolver aqui evita que
 * a tela carregue um id opaco num campo oculto — e um campo oculto com id é exatamente o que um
 * chamador direto trocaria por outro exercício.
 */
export async function encerrarControlesDoAno(p: {
  readonly ano: number;
}): Promise<string> {
  return comEscritaAutenticada("ENCERRAR_CONTROLES_ORCAMENTARIOS", async (criadoPor) => {
    const prisma = cliente();
    const exercicio = await prisma.exercicio.findFirst({
      where: { ano: p.ano },
      select: { id: true },
    });
    if (exercicio === null) {
      throw new Error(
        `Não existe exercício ${String(p.ano)} cadastrado. Nada foi gravado.`
      );
    }
    const r = await encerrarControlesOrcamentarios(prisma, {
      exercicioId: exercicio.id,
      criadoPor,
    });
    const zeradas = r.encerradas
      .map((c) => `${c.codigo} (${c.saldo.toFixed(2)})`)
      .join(", ");
    const transferidas =
      r.transferidas.length === 0
        ? ""
        : ` Atravessaram a virada, sem receber partida: ` +
          r.transferidas.map((c) => `${c.codigo} (${c.saldo.toFixed(2)})`).join(", ") + ".";
    return (
      `Controles orçamentários de ${String(p.ano)} encerrados: ` +
      `${String(r.encerradas.length)} conta(s) zerada(s) — ${zeradas}.${transferidas} ` +
      `A dotação e o crédito do exercício não atravessam mais a virada.`
    );
  });
}

/** ESTORNAR um encerramento de controles — ESCRITA AUTENTICADA. */
export async function estornarEncerramentoDeControles(p: {
  readonly operacaoId: string;
  readonly motivo: string;
}): Promise<string> {
  return comEscritaAutenticada("ESTORNAR_ENCERRAMENTO_CONTROLES", async (criadoPor) => {
    const r = await estornarEncerramentoControles(cliente(), {
      operacaoId: p.operacaoId,
      motivo: p.motivo,
      criadoPor,
    });
    return (
      `Encerramento dos controles estornado: ${String(r.lancamentos.length)} lançamento(s) de ` +
      `estorno gravado(s). O original permanece no razão — o saldo das contas voltou, e o ` +
      `encerramento pode ser refeito.`
    );
  });
}
