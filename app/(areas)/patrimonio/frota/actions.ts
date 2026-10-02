"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import {
  anularAbastecimentoPelaTela,
  anularSituacaoPelaTela,
  cadastrarMaquinaPelaTela,
  cadastrarVeiculoPelaTela,
  publicarVersaoDaMaquinaPelaTela,
  publicarVersaoDoVeiculoPelaTela,
  registrarAbastecimentoPelaTela,
  registrarSituacaoPelaTela,
} from "../../../../lib/portas/frota";

export interface EstadoDaFrota {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();
const TIPOS = ["PROPRIO", "LOCADO", "PRESTACAO_DE_SERVICOS", "CEDIDO"] as const;
const SITUACOES = ["EM_USO", "EM_MANUTENCAO", "BAIXADA", "BAIXA_TEMPORARIA"] as const;
const COMBUSTIVEIS = ["GASOLINA", "DIESEL", "ETANOL", "GAS_NATURAL", "ARLA_32", "ELETRICIDADE"] as const;
const escolha = <T extends string>(lista: readonly T[], v: string): T | undefined => lista.find((x) => x === v);

async function ato(corpo: () => Promise<string>, padrao: string): Promise<EstadoDaFrota> {
  try {
    const sucesso = await corpo();
    revalidatePath("/patrimonio/frota");
    return { sucesso };
  } catch (e) {
    return { erro: mensagemDoErro(e, padrao) };
  }
}

/** Os campos comuns de veículo e máquina (tipo, dono, locador, combustível, vigência, fundamento). */
function dadosDoBem(f: FormData): { erro: string } | { tipoFrota: (typeof TIPOS)[number]; combustivelPrincipal: (typeof COMBUSTIVEIS)[number]; proprietarioDocumento: string | null; locadorDocumento: string | null; vigenteDesde: string; fundamento: string } {
  const tipoFrota = escolha(TIPOS, t(f, "tipoFrota"));
  if (tipoFrota === undefined) return { erro: "Escolha se o bem é próprio, locado, de prestação de serviços ou cedido." };
  const combustivelPrincipal = escolha(COMBUSTIVEIS, t(f, "combustivelPrincipal"));
  if (combustivelPrincipal === undefined) return { erro: "Escolha o combustível principal." };
  if (t(f, "vigenteDesde") === "") return { erro: "Informe desde quando os dados valem." };
  return { tipoFrota, combustivelPrincipal, proprietarioDocumento: t(f, "proprietarioDocumento") || null, locadorDocumento: t(f, "locadorDocumento") || null, vigenteDesde: t(f, "vigenteDesde"), fundamento: t(f, "fundamento") };
}

export async function cadastrarVeiculoAction(_p: EstadoDaFrota, f: FormData): Promise<EstadoDaFrota> {
  return comComandoDoFormulario(f, async () => {
    const b = dadosDoBem(f);
    if ("erro" in b) return b;
    const situacaoInicial = escolha(SITUACOES, t(f, "situacaoInicial"));
    if (situacaoInicial === undefined) return { erro: "Escolha a situação do veículo no cadastro." };
    return ato(() => cadastrarVeiculoPelaTela({ ...b, ugId: t(f, "ugId"), placa: t(f, "placa"), anoModelo: Number(t(f, "anoModelo")), renavam: t(f, "renavam"), numeroModelo: t(f, "numeroModelo"), situacaoInicial }), "Não foi possível cadastrar o veículo. Nada foi gravado.");
  });
}

export async function cadastrarMaquinaAction(_p: EstadoDaFrota, f: FormData): Promise<EstadoDaFrota> {
  return comComandoDoFormulario(f, async () => {
    const b = dadosDoBem(f);
    if ("erro" in b) return b;
    const situacaoInicial = escolha(SITUACOES, t(f, "situacaoInicial"));
    if (situacaoInicial === undefined) return { erro: "Escolha a situação da máquina no cadastro." };
    return ato(() => cadastrarMaquinaPelaTela({ ...b, ugId: t(f, "ugId"), codigo: t(f, "codigo"), anoFabricacao: Number(t(f, "anoFabricacao")), descricao: t(f, "descricao"), situacaoInicial }), "Não foi possível cadastrar a máquina. Nada foi gravado.");
  });
}

export async function publicarVersaoAction(_p: EstadoDaFrota, f: FormData): Promise<EstadoDaFrota> {
  return comComandoDoFormulario(f, async () => {
    const b = dadosDoBem(f);
    if ("erro" in b) return b;
    if (t(f, "categoria") === "VEICULO") {
      return ato(() => publicarVersaoDoVeiculoPelaTela({ ...b, veiculoId: t(f, "bemId"), anoModelo: Number(t(f, "anoModelo")), renavam: t(f, "renavam"), numeroModelo: t(f, "numeroModelo") }), "Não foi possível publicar a versão. Nada foi gravado.");
    }
    return ato(() => publicarVersaoDaMaquinaPelaTela({ ...b, maquinaId: t(f, "bemId"), anoFabricacao: Number(t(f, "anoFabricacao")), descricao: t(f, "descricao") }), "Não foi possível publicar a versão. Nada foi gravado.");
  });
}

const alvo = (f: FormData): { veiculoId?: string; maquinaId?: string } => (t(f, "categoria") === "VEICULO" ? { veiculoId: t(f, "bemId") } : { maquinaId: t(f, "bemId") });

export async function registrarSituacaoAction(_p: EstadoDaFrota, f: FormData): Promise<EstadoDaFrota> {
  return comComandoDoFormulario(f, async () => {
    const situacao = escolha(SITUACOES, t(f, "situacao"));
    if (situacao === undefined) return { erro: "Escolha a situação." };
    if (t(f, "desde") === "") return { erro: "Informe o dia em que a situação começou." };
    return ato(() => registrarSituacaoPelaTela({ ...alvo(f), situacao, desde: t(f, "desde"), motivo: t(f, "motivo") }), "Não foi possível registrar a situação. Nada foi gravado.");
  });
}

export async function anularSituacaoAction(_p: EstadoDaFrota, f: FormData): Promise<EstadoDaFrota> {
  return comComandoDoFormulario(f, async () => ato(() => anularSituacaoPelaTela({ id: t(f, "id"), motivo: t(f, "motivo") }), "Não foi possível anular. Nada foi gravado."));
}

export async function registrarAbastecimentoAction(_p: EstadoDaFrota, f: FormData): Promise<EstadoDaFrota> {
  return comComandoDoFormulario(f, async () => {
    const combustivel = escolha(COMBUSTIVEIS, t(f, "combustivel"));
    if (combustivel === undefined) return { erro: "Escolha o combustível." };
    if (t(f, "data") === "") return { erro: "Informe o dia do abastecimento." };
    return ato(() => registrarAbastecimentoPelaTela({ ...alvo(f), data: t(f, "data"), combustivel, quantidade: t(f, "quantidade"), documento: t(f, "documento") }), "Não foi possível registrar o abastecimento. Nada foi gravado.");
  });
}

export async function anularAbastecimentoAction(_p: EstadoDaFrota, f: FormData): Promise<EstadoDaFrota> {
  return comComandoDoFormulario(f, async () => ato(() => anularAbastecimentoPelaTela({ id: t(f, "id"), motivo: t(f, "motivo") }), "Não foi possível anular. Nada foi gravado."));
}
