"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { PLANOS_DO_REGIME_PROPRIO, registrarProjecaoAtuarial, retirarProjecaoAtuarial, type PlanoDoRegimeProprio } from "../../../../../lib/portas/rreo-anexo10";

export interface EstadoDaProjecao {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();
const ROTA = "/relatorios/rreo/anexo10";

function plano(f: FormData): PlanoDoRegimeProprio | null {
  const p = t(f, "plano");
  return (PLANOS_DO_REGIME_PROPRIO as readonly string[]).includes(p) ? (p as PlanoDoRegimeProprio) : null;
}

/** "1.234,56" ou "1234.56" → "1234.56"; o domínio confere o formato final. */
function valor(bruto: string): string {
  return bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto;
}

export async function registrarProjecaoAction(_p: EstadoDaProjecao, f: FormData): Promise<EstadoDaProjecao> {
  return comComandoDoFormulario(f, async () => {
    try {
      const p = plano(f);
      if (p === null) return { erro: "Escolha o plano (capitalização ou repartição). Nada foi gravado." };
      const sucesso = await registrarProjecaoAtuarial({
        exercicio: Number(t(f, "exercicio")),
        plano: p,
        dataDaAvaliacao: t(f, "dataDaAvaliacao"),
        documento: t(f, "documento"),
        saldoFinanceiroAnterior: valor(t(f, "saldoFinanceiroAnterior")),
        tabela: String(f.get("tabela") ?? ""),
      });
      revalidatePath(ROTA);
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar a projeção. Nada foi gravado.") };
    }
  });
}

export async function retirarProjecaoAction(_p: EstadoDaProjecao, f: FormData): Promise<EstadoDaProjecao> {
  return comComandoDoFormulario(f, async () => {
    try {
      const p = plano(f);
      if (p === null) return { erro: "Plano inválido. Nada foi gravado." };
      const sucesso = await retirarProjecaoAtuarial({ exercicio: Number(t(f, "exercicio")), plano: p });
      revalidatePath(ROTA);
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível retirar a projeção. Nada foi gravado.") };
    }
  });
}
