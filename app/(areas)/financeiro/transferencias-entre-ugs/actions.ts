"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { definirContabilizacaoPelaTela, estornarTransferenciaPelaTela, registrarTransferenciaPelaTela } from "../../../../lib/portas/transferencias-entre-ugs";
import { meioDiaCivil } from "../../../../packages/datas/index";

export interface EstadoDaTransferencia {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();
const TIPOS = ["DUODECIMO", "APORTE_DESPESAS_ADMINISTRATIVAS", "APORTE_INSUFICIENCIA_FINANCEIRA", "APORTE_BENEFICIOS_PREVIDENCIARIOS", "OUTROS_APORTES", "INVESTIMENTOS_OU_RESGATES", "DEVOLUCAO_DE_RECURSOS", "TRANSFERENCIA_INDIRETA"] as const;
const ROTA = "/financeiro/transferencias-entre-ugs";

async function ato(corpo: () => Promise<string>, padrao: string): Promise<EstadoDaTransferencia> {
  try {
    const sucesso = await corpo();
    revalidatePath(ROTA);
    return { sucesso };
  } catch (e) {
    return { erro: mensagemDoErro(e, padrao) };
  }
}

export async function definirContabilizacaoAction(_p: EstadoDaTransferencia, f: FormData): Promise<EstadoDaTransferencia> {
  return comComandoDoFormulario(f, async () => {
    const tipo = TIPOS.find((x) => x === t(f, "tipo"));
    if (tipo === undefined) return { erro: "Escolha o tipo de transferência." };
    if (t(f, "vigenteDesde") === "") return { erro: "Informe desde quando as contas valem." };
    return ato(
      () => definirContabilizacaoPelaTela({ tipo, contaConcedidaCodigo: t(f, "contaConcedida"), contaRecebidaCodigo: t(f, "contaRecebida"), vigenteDesde: meioDiaCivil(t(f, "vigenteDesde")), fundamento: t(f, "fundamento") }),
      "Não foi possível decidir as contas. Nada foi gravado."
    );
  });
}

export async function registrarTransferenciaAction(_p: EstadoDaTransferencia, f: FormData): Promise<EstadoDaTransferencia> {
  return comComandoDoFormulario(f, async () => {
    const tipo = TIPOS.find((x) => x === t(f, "tipo"));
    if (tipo === undefined) return { erro: "Escolha o tipo de transferência." };
    if (t(f, "data") === "") return { erro: "Informe a data da transferência." };
    if (t(f, "valor") === "") return { erro: "Informe o valor." };
    return ato(
      () =>
        registrarTransferenciaPelaTela({
          tipo,
          ugOrigemId: t(f, "ugOrigemId"),
          ugDestinoId: t(f, "ugDestinoId"),
          valor: t(f, "valor"),
          data: meioDiaCivil(t(f, "data")),
          contaOrigemId: t(f, "contaOrigemId") || null,
          contaDestinoId: t(f, "contaDestinoId") || null,
          vinculo: t(f, "vinculo"),
        }),
      "Não foi possível registrar a transferência. Nada foi gravado."
    );
  });
}

export async function estornarTransferenciaAction(_p: EstadoDaTransferencia, f: FormData): Promise<EstadoDaTransferencia> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "data") === "") return { erro: "Informe a data do estorno." };
    return ato(() => estornarTransferenciaPelaTela({ transferenciaId: t(f, "transferenciaId"), data: meioDiaCivil(t(f, "data")), motivo: t(f, "motivo") }), "Não foi possível estornar. Nada foi gravado.");
  });
}
