import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import {
  cadastrarObra,
  ELEMENTOS_DE_OBRA,
  TIP_OBRA_SERVICO,
  TIPOS_DE_OBRA,
  zCadastrarObraInput,
} from "./obras.js";
import type { M05Deps } from "../m05-despesa/ports.js";

/**
 * M11 — OBRAS (TR 4.50): o cadastro, o rol fechado e o GUARD do empenho.
 *
 * ═══ AS DUAS FICHAS ═══
 *   ficha-obra   natureza 4.4.90.51 (elemento 51 — "Obras e Instalações")  -> EXIGE obra
 *   ficha-serv   natureza 3.3.90.39 (elemento 39 — "Outros Serv. Terceiros PJ") -> não exige
 *
 * ⚠️ O ELEMENTO 51 É O GATILHO, E O RECORD É FECHADO POR UM MOTIVO LITERAL: o elemento
 * **37** do rol oficial chama-se "Locação de Mão-de-**Obra**" — tem "Obra" no nome e NÃO é
 * obra nenhuma (é pessoal). Qualquer derivação por texto o pegaria, e todo empenho de mão
 * de obra passaria a exigir uma matrícula CEI que não existe.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "obras@cg.pb.gov.br";
const FONTE = "fnt-500";
const FICHA_OBRA = "ficha-obra";
const FICHA_SERV = "ficha-serv";

const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";

const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: C_DISPONIVEL,
  creditoEmpenhado: C_EMPENHADO,
});

let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05Deps(prisma);

  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Obras", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-15", codigo: "15", nome: "Urbanismo" } });
  await prisma.subfuncao.create({ data: { id: "sub-451", codigo: "451", nome: "Infraestrutura" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0015", descricao: "Cidade" } });
  await prisma.acao.create({
    data: { id: "aca", codigo: "1001", descricao: "Pavimentar vias", tipo: "PROJETO" },
  });

  // ⚠️ 4.4.90.51 — o ELEMENTO 51 é o gatilho do TR 4.50.
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd-obra", codCategoria: "4", codNatureza: "4", codModalidade: "90",
      codElemento: "51", codigoCompleto: "449051", descricao: "Obras e Instalações",
    },
  });
  // 3.3.90.39 — serviço comum. NÃO é obra.
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd-serv", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "Outros Serviços PJ",
    },
  });

  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });

  for (const [id, nd, numero] of [
    [FICHA_OBRA, "nd-obra", 1],
    [FICHA_SERV, "nd-serv", 2],
  ] as const) {
    await criarFichaDeTeste(prisma, {
      id, exercicio: 2026, numero, orgaoId: "org-01", unidadeOrcId: "uo-01",
      funcaoId: "fun-15", subfuncaoId: "sub-451", programaId: "prg", acaoId: "aca",
      naturezaDespesaId: nd, fonteId: FONTE, valorDotado: "500000.00",
    });
  }
}

const empenhoDe = (
  fichaId: string,
  numero: string,
  obraId?: string
): Parameters<typeof empenhar>[0] => ({
  fichaId,
  numero,
  tipo: "ORDINARIO",
  valor: "100000.00",
  data: new Date("2026-05-10T12:00:00Z"),
  credorCpfCnpj: "12345678000199",
  historico: "execução",
  categoriaOrdemCronologica: "REALIZACAO_OBRAS",
  criadoPor: POR,
  ...(obraId !== undefined ? { obraId } : {}),
});

describe("M11 — obras (TR 4.50)", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t3 — O GUARD.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t3: elemento 51 SEM obra REJEITA nomeando; COM obra passa; elemento 39 sem obra passa", async () => {
    // ── (1) elemento 51 SEM obra -> REJEITA, e a mensagem ENSINA ──
    await expect(
      empenhar(empenhoDe(FICHA_OBRA, "NE-1"), R_EMPENHO, deps)
    ).rejects.toThrow(/EMPENHO DE OBRA SEM OBRA \(TR 4\.50\)/);
    await expect(
      empenhar(empenhoDe(FICHA_OBRA, "NE-1"), R_EMPENHO, deps)
    ).rejects.toThrow(/elemento 51 \("Obras e Instalações"\), natureza 449051/);
    // ⚠️ A mensagem cita o L800 (o que se perde) e o rol fechado (o que é obra).
    await expect(
      empenhar(empenhoDe(FICHA_OBRA, "NE-1"), R_EMPENHO, deps)
    ).rejects.toThrow(/registro L800 do MANAD/);
    await expect(
      empenhar(empenhoDe(FICHA_OBRA, "NE-1"), R_EMPENHO, deps)
    ).rejects.toThrow(/O elemento 37, "Locação de Mão-de-Obra", NÃO é obra/);

    // ...e NADA foi gravado.
    expect(await prisma.empenho.count()).toBe(0);

    // ── (2) elemento 51 COM obra -> PASSA ──
    const { obraId } = await cadastrarObra(prisma, {
      identificador: "OB-2026-001",
      descricao: "Pavimentação da Av. Brasil",
      tipoObraServico: "PAVIMENTACAO_ASFALTICA",
      cei: "123456789012",
      criadoPor: POR,
    });
    const e = await empenhar(empenhoDe(FICHA_OBRA, "NE-1", obraId), R_EMPENHO, deps);
    const gravado = await prisma.empenho.findUniqueOrThrow({
      where: { id: e.empenhoId },
      select: { obraId: true },
    });
    expect(gravado.obraId).toBe(obraId);

    // ── (3) elemento 39 SEM obra -> PASSA. O rol é FECHADO: só o 51 é gatilho. ──
    await expect(
      empenhar(empenhoDe(FICHA_SERV, "NE-2"), R_EMPENHO, deps)
    ).resolves.toBeDefined();

    // ── (4) ⚠️ E O VÍNCULO VOLUNTÁRIO É PERMITIDO — a diferença deliberada para o 4.48.
    // A instalação elétrica de uma obra pode vir, legitimamente, no elemento 39. Proibir
    // o vínculo obrigaria quem quer rastrear a MENTIR na classificação da despesa.
    await expect(
      empenhar(empenhoDe(FICHA_SERV, "NE-3", obraId), R_EMPENHO, deps)
    ).resolves.toBeDefined();
  });

  it("t3b: obra INEXISTENTE e obra INATIVA são recusadas", async () => {
    await expect(
      empenhar(empenhoDe(FICHA_OBRA, "NE-9", "obra-fantasma"), R_EMPENHO, deps)
    ).rejects.toThrow(/Obra obra-fantasma não existe/);

    const { obraId } = await cadastrarObra(prisma, {
      identificador: "OB-VELHA",
      descricao: "Obra encerrada",
      tipoObraServico: "EDIFICACOES_EM_GERAL",
      criadoPor: POR,
    });
    await prisma.obra.update({ where: { id: obraId }, data: { ativa: false } });

    await expect(
      empenhar(empenhoDe(FICHA_OBRA, "NE-10", obraId), R_EMPENHO, deps)
    ).rejects.toThrow(/Obra OB-VELHA está INATIVA/);
    expect(await prisma.empenho.count()).toBe(0);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t5 — O ROL É FECHADO (Record + Zod).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t5: o rol da IN/INSS/DC 100/2003 é FECHADO — o Zod recusa fora dele, COM o rol na mensagem", () => {
    // Os dez códigos do manual, e nada mais.
    expect(Object.values(TIP_OBRA_SERVICO).sort()).toEqual([
      "01", "02", "03", "04", "05", "06", "07", "08", "09", "10",
    ]);
    expect(TIPOS_DE_OBRA).toHaveLength(10);
    expect(TIP_OBRA_SERVICO.PAVIMENTACAO_ASFALTICA).toBe("05");
    expect(TIP_OBRA_SERVICO.EDIFICACOES_EM_GERAL).toBe("10");

    // ⚠️ Um tipo fora do rol NÃO COMPILA (o Record é exaustivo sobre o enum do Prisma).
    // Em tempo de execução, o Zod o recusa — e a mensagem TRAZ O ROL, para que quem
    // digitou veja o que PODIA ter digitado.
    const r = zCadastrarObraInput.safeParse({
      identificador: "OB-X",
      descricao: "Obra inventada",
      tipoObraServico: "REFORMA_DE_PRACA", // não existe na IN 100/2003
      criadoPor: POR,
    });
    expect(r.success).toBe(false);
    const msg = JSON.stringify(r.error?.issues);
    expect(msg).toMatch(/rol da IN\/INSS\/DC 100\/2003/);
    expect(msg).toMatch(/05-PAVIMENTACAO_ASFALTICA/);
    expect(msg).toMatch(/10-EDIFICACOES_EM_GERAL/);
  });

  it("t5b: ELEMENTOS_DE_OBRA nasce {51} — e o 37 ('Locação de Mão-de-Obra') NÃO está nele", () => {
    // ⚠️ O RECORD É A FONTE ÚNICA DO GATILHO. Ele nasce com um valor só, e cresce por
    // DECISÃO — nunca por dedução textual. É o mesmo desenho do ELEMENTOS_DE_ALMOXARIFADO
    // (M10), que nasceu {30} e deixou o 32 de fora pelo mesmo motivo.
    expect(Object.keys(ELEMENTOS_DE_OBRA)).toEqual(["51"]);
    expect(ELEMENTOS_DE_OBRA["37"]).toBeUndefined(); // "Locação de Mão-de-Obra" — pessoal
    expect(ELEMENTOS_DE_OBRA["52"]).toBeUndefined(); // bem móvel — é do ClasseDeBens (4.49)
    expect(ELEMENTOS_DE_OBRA["39"]).toBeUndefined(); // serviço sem obra — rol ASTEC, pendência
  });
});
