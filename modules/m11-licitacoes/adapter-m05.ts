import { toMoney } from "../../packages/contracts/index.js";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import type {
  ContratoPort,
  M05Deps,
  SituacaoDoContrato,
  TxDaDespesa,
} from "../m05-despesa/ports.js";
import { estaVigente, valorAtualizado, vigenciaFim } from "./dominio.js";
import { empenhadoLiquidoDoContrato, homologadoEm } from "./contratos.js";

/**
 * O M11 IMPLEMENTANDO O PORT QUE O M05 DECLAROU.
 *
 * ═══ A INVERSÃO, E POR QUE ELA É OBRIGATÓRIA AQUI ═══
 * O M11 precisa do M05 (o empenhado sai do `Empenho`) e o M05 precisa do M11
 * (vigência e saldo bloqueiam o empenho). Import nos dois sentidos seria um CICLO.
 * Então a seta aponta em UMA direção — `m11 → m05` — e o M05 recebe o que precisa
 * por uma INTERFACE que ele mesmo declarou (`ContratoPort`). O M05 não conhece
 * contrato; conhece uma pergunta.
 *
 * Este arquivo é o único lugar do repositório onde os dois módulos se encontram.
 */
export function criarContratoPortPrisma(): ContratoPort {
  return {
    async situacaoParaEmpenho(
      prisma: TxDaDespesa,
      contratoId: string,
      data: Date
    ): Promise<SituacaoDoContrato | null> {
      // ═══ O LOCK — e por que ele é a única coisa que fecha a janela ═══
      // Dois empenhos concorrentes contra o mesmo contrato leriam o MESMO
      // empenhado (READ COMMITTED: cada transação vê o que estava commitado
      // quando ELA começou), os dois veriam saldo, e os dois gravariam. Nenhum
      // guard teria errado — e o contrato estouraria.
      //
      // `FOR UPDATE` trava a LINHA do contrato: o segundo empenho fica bloqueado
      // até o primeiro commitar, e só então lê o empenhado — já com o primeiro
      // dentro. A serialização é POR CONTRATO (nada mais é travado).
      //
      // ⚠️ TEM DE VIR ANTES DA SOMA. Travar depois de somar seria travar o que já
      // se leu — e o número lido já estaria velho.
      await travar(prisma, "Contrato", [contratoId]);

      const c = await prisma.contrato.findUnique({
        where: { id: contratoId },
        select: {
          numeroContrato: true,
          processoId: true,
          categoriaOrdemCronologica: true,
          valorInicial: true,
          vigenciaInicio: true,
          vigenciaFimInicial: true,
          movimentos: { select: { tipo: true, valor: true, dias: true } },
        },
      });
      if (c === null) return null;

      // TODAS as derivações passam pelas funções puras do M11 — nenhuma conta é
      // refeita aqui. Sem corte: a pergunta é sobre o contrato COMO ELE ESTÁ.
      const movimentos = c.movimentos.map((m) => ({
        tipo: m.tipo,
        valor: m.valor === null ? null : toMoney(m.valor.toFixed(2)),
        dias: m.dias,
      }));

      const fim = vigenciaFim(c.vigenciaFimInicial, movimentos);
      const atual = valorAtualizado(
        toMoney(c.valorInicial.toFixed(2)),
        movimentos
      );
      const empenhado = await empenhadoLiquidoDoContrato(prisma, contratoId);
      const homologacao = await homologadoEm(prisma, c.processoId);

      return {
        numeroContrato: c.numeroContrato,
        processoId: c.processoId,
        processoHomologado: homologacao !== null,
        categoriaOrdemCronologica: c.categoriaOrdemCronologica,
        vigenciaInicio: c.vigenciaInicio,
        vigenciaFim: fim,
        // A vigência é sempre perguntada SOBRE UMA DATA — a do empenho.
        vigenteNaData: estaVigente(c.vigenciaInicio, fim, data),
        valorAtualizado: atual,
        empenhadoLiquido: empenhado,
        saldo: toMoney(atual.minus(empenhado)),
      };
    },
  };
}

/**
 * As deps do M05 COM o módulo de contratos ligado.
 *
 * `criarM05Deps(prisma)` continua existindo e continua sem saber o que é um
 * contrato — quem empenha sem contrato usa aquele, e nada mudou para ele. Este
 * aqui é o composition root de quem empenha COM contrato.
 */
export function criarM05DepsComContratos(prisma: PrismaClient): M05Deps {
  return criarM05Deps(prisma, criarContratoPortPrisma());
}
