import {
  DESCONTOS_FORA_DA_CONSIGNACAO,
  consignacaoVigenteDaRubrica,
  declararConsignacaoDaRubrica,
} from "../../modules/m33-folha/descontos-da-folha";
import { listarTiposConsignacao } from "../../modules/m07-extraorcamentario/consultas";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/**
 * ═══ OS DESCONTOS DA FOLHA RETIDOS NO PAGAMENTO, NA TELA (V28) ═══
 *
 * ⚠️ A LISTA PARTE DAS RUBRICAS DE DESCONTO, não das declarações: a rubrica sem consignação é a que vai
 * recusar o pagamento da folha, e é ela que a tela precisa mostrar primeiro.
 */

export interface TipoDeConsignacaoNaTela {
  readonly id: string;
  readonly rotulo: string;
}

export interface RubricaDeDescontoNaTela {
  readonly id: string;
  readonly codigo: string;
  readonly descricao: string;
  /** Preenchido quando a rubrica NÃO é retida como consignação, com o motivo. */
  readonly fora: string | null;
  readonly tipoRotulo: string | null;
  readonly credor: string | null;
  readonly fundamento: string | null;
  readonly versao: number | null;
}

export async function lerDescontosDaFolha(): Promise<{
  readonly rubricas: readonly RubricaDeDescontoNaTela[];
  readonly tipos: readonly TipoDeConsignacaoNaTela[];
}> {
  await exigirLeituraDoEnte("CONSULTAR_FOLHA");
  const prisma = cliente();
  const [rubricas, tipos] = await Promise.all([
    prisma.rubrica.findMany({ where: { tipo: "DESCONTO" }, orderBy: { codigo: "asc" }, select: { id: true, codigo: true, descricao: true, natureza: true } }),
    listarTiposConsignacao(prisma),
  ]);
  const rotuloDoTipo = new Map(tipos.map((t) => [t.id, `${t.codigo} — ${t.descricao}`]));
  const linhas: RubricaDeDescontoNaTela[] = [];
  for (const r of rubricas) {
    const fora = DESCONTOS_FORA_DA_CONSIGNACAO[r.natureza] ?? null;
    const d = fora === null ? await consignacaoVigenteDaRubrica(prisma, r.id) : null;
    linhas.push({
      id: r.id, codigo: r.codigo, descricao: r.descricao, fora,
      tipoRotulo: d === null ? null : rotuloDoTipo.get(d.tipoConsignacaoId) ?? null,
      credor: d?.credorConsignatario ?? null, fundamento: d?.fundamento ?? null, versao: d?.versao ?? null,
    });
  }
  return {
    rubricas: linhas,
    // Só os tipos que podem receber retenção: ativos e com conta de passivo.
    tipos: tipos.filter((t) => t.ativo && t.contaPassivoCodigo !== null).map((t) => ({ id: t.id, rotulo: `${t.codigo} — ${t.descricao} (passivo ${t.contaPassivoCodigo ?? ""})` })),
  };
}

export async function declararConsignacaoDaRubricaNaTela(input: {
  readonly rubricaId: string;
  readonly tipoConsignacaoId: string;
  readonly credorConsignatario: string;
  readonly fundamento: string;
}): Promise<string> {
  const r = await comEscritaAutenticada("GERIR_TIPOS_DE_CONSIGNACAO", (criadoPor) =>
    declararConsignacaoDaRubrica(cliente(), { ...input, criadoPor })
  );
  return (
    `Declaração registrada na versão ${String(r.versao)}: os próximos pagamentos da folha retêm este desconto para ` +
    `${input.credorConsignatario}. Os pagamentos já feitos não mudam.`
  );
}
