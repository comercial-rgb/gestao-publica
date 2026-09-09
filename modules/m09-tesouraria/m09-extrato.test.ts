import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { importarExtrato } from "./extrato.js";
import { ConflitoDeFitidError } from "./dominio.js";

/**
 * M09 bloco 1 — import de extrato.
 *
 * A asserção que atravessa tudo: um arquivo entra INTEIRO ou não entra. Meio
 * extrato importado é pior que nenhum — ele parece completo.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "tesouraria@cg.pb.gov.br";
const CONTA = "cb1";

interface Linha {
  fitid: string;
  dt: string;
  amt: string;
  memo: string;
  checknum?: string;
}

function arquivo(linhas: readonly Linha[], periodo = ["20260101", "20260131"]): string {
  const trns = linhas
    .map((l) =>
      [
        "<STMTTRN>",
        "<TRNTYPE>OTHER",
        `<DTPOSTED>${l.dt}`,
        `<TRNAMT>${l.amt}`,
        `<FITID>${l.fitid}`,
        ...(l.checknum !== undefined ? [`<CHECKNUM>${l.checknum}`] : []),
        `<MEMO>${l.memo}`,
        "</STMTTRN>",
      ].join("\n")
    )
    .join("\n");

  return `OFXHEADER:100
<OFX>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>001
<ACCTID>12345-6
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>${periodo[0]}
<DTEND>${periodo[1]}
${trns}
</BANKTRANLIST>
</STMTRS>
</OFX>`;
}

const JANEIRO: readonly Linha[] = [
  { fitid: "F1", dt: "20260105120000[-3:BRT]", amt: "-1500.00", memo: "PAGTO FORNECEDOR" },
  { fitid: "F2", dt: "20260110", amt: "8000.00", memo: "ARRECADACAO IPTU" },
  { fitid: "F3", dt: "20260131", amt: "-35.90", memo: "TARIFA MANUTENCAO" },
];

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.fonteRecurso.create({
    data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  await prisma.contaBancaria.create({
    data: { id: CONTA, codigo: "CC-001", descricao: "Conta movimento", fonteId: "fnt-500" },
  });
}

describe("M09 — import de extrato OFX", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("importa: 3 linhas, sinal normalizado, período do cabeçalho", async () => {
    const r = await importarExtrato(prisma, {
      contaBancariaId: CONTA,
      arquivoOfx: arquivo(JANEIRO),
      importadoPor: POR,
    });

    expect(r.jaImportado).toBe(false);
    expect(r.inseridas).toBe(3);
    expect(r.puladas).toBe(0);
    expect(r.conflitos).toEqual([]);

    const extrato = await prisma.extratoBancario.findUniqueOrThrow({
      where: { id: r.extratoId },
    });
    expect(extrato.periodoInicio.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(extrato.periodoFim.toISOString().slice(0, 10)).toBe("2026-01-31");
    expect(extrato.importadoPor).toBe(POR);

    const linhas = await prisma.lancamentoExtrato.findMany({
      orderBy: { fitid: "asc" },
    });
    expect(linhas).toHaveLength(3);

    // valor SEMPRE positivo; o sinal virou natureza
    const f1 = linhas.find((l) => l.fitid === "F1")!;
    expect(f1.natureza).toBe("DEBITO");
    expect(f1.valor.toFixed(2)).toBe("1500.00");
    expect(f1.dataPostagem.toISOString().slice(0, 10)).toBe("2026-01-05");

    const f2 = linhas.find((l) => l.fitid === "F2")!;
    expect(f2.natureza).toBe("CREDITO");
    expect(f2.valor.toFixed(2)).toBe("8000.00");

    // todas apontam para a conta (é o que sustenta o índice único conta+fitid)
    expect(linhas.every((l) => l.contaBancariaId === CONTA)).toBe(true);
  });

  it("IDEMPOTÊNCIA: importar o MESMO arquivo 2x é no-op — não é erro", async () => {
    const ofx = arquivo(JANEIRO);
    const primeira = await importarExtrato(prisma, {
      contaBancariaId: CONTA, arquivoOfx: ofx, importadoPor: POR,
    });

    const segunda = await importarExtrato(prisma, {
      contaBancariaId: CONTA, arquivoOfx: ofx, importadoPor: POR,
    });

    // O operador clicou duas vezes. Isso não pode duplicar o extrato nem
    // estourar na cara dele.
    expect(segunda.jaImportado).toBe(true);
    expect(segunda.extratoId).toBe(primeira.extratoId);
    expect(segunda.inseridas).toBe(0);

    // prova por SELECT: nada foi duplicado
    expect(await prisma.extratoBancario.count()).toBe(1);
    expect(await prisma.lancamentoExtrato.count()).toBe(3);
  });

  it("PERÍODOS SOBREPOSTOS: só as linhas NOVAS entram; as repetidas são PULADAS", async () => {
    await importarExtrato(prisma, {
      contaBancariaId: CONTA, arquivoOfx: arquivo(JANEIRO), importadoPor: POR,
    });

    // O extrato de fevereiro repete as duas últimas de janeiro (caso NORMAL: o
    // banco tem todo direito de reenviá-las) e traz duas novas.
    const fevereiro = arquivo(
      [
        JANEIRO[1]!,
        JANEIRO[2]!,
        { fitid: "F4", dt: "20260205", amt: "-200.00", memo: "PAGTO SERVICOS" },
        { fitid: "F5", dt: "20260210", amt: "1200.00", memo: "TRANSFERENCIA" },
      ],
      ["20260110", "20260228"]
    );

    const r = await importarExtrato(prisma, {
      contaBancariaId: CONTA, arquivoOfx: fevereiro, importadoPor: POR,
    });

    expect(r.jaImportado).toBe(false); // arquivo diferente
    expect(r.inseridas).toBe(2); // F4, F5
    expect(r.puladas).toBe(2); // F2, F3 — mesmo conteúdo

    // 3 + 2 = 5, e nenhuma duplicata
    expect(await prisma.lancamentoExtrato.count()).toBe(5);
    expect(await prisma.extratoBancario.count()).toBe(2);
  });

  it("CONFLITO DE FITID: o banco mudou o passado → ABORTA TUDO, zero inserção", async () => {
    await importarExtrato(prisma, {
      contaBancariaId: CONTA, arquivoOfx: arquivo(JANEIRO), importadoPor: POR,
    });
    const antes = await prisma.lancamentoExtrato.count();

    // Mesmo FITID F2, VALOR diferente. E, junto, duas linhas novas e legítimas —
    // que NÃO podem entrar: o arquivo inteiro é suspeito.
    const adulterado = arquivo(
      [
        { fitid: "F2", dt: "20260110", amt: "9999.00", memo: "ARRECADACAO IPTU" },
        { fitid: "F9", dt: "20260212", amt: "-10.00", memo: "NOVA LEGITIMA" },
        { fitid: "F10", dt: "20260213", amt: "-20.00", memo: "OUTRA LEGITIMA" },
      ],
      ["20260201", "20260228"]
    );

    let erro: unknown;
    try {
      await importarExtrato(prisma, {
        contaBancariaId: CONTA, arquivoOfx: adulterado, importadoPor: POR,
      });
    } catch (e) {
      erro = e;
    }

    expect(erro).toBeInstanceOf(ConflitoDeFitidError);
    const c = erro as ConflitoDeFitidError;
    expect(c.conflitos).toHaveLength(1);
    expect(c.conflitos[0]!.fitid).toBe("F2");
    expect(String(c)).toMatch(/é o banco mudando o passado/);

    // ⚠️ NADA ENTROU — nem as duas linhas legítimas, nem o extrato.
    expect(await prisma.lancamentoExtrato.count()).toBe(antes);
    expect(await prisma.lancamentoExtrato.count({ where: { fitid: "F9" } })).toBe(0);
    expect(await prisma.extratoBancario.count()).toBe(1);
    // e o valor original de F2 está INTACTO
    const f2 = await prisma.lancamentoExtrato.findFirstOrThrow({ where: { fitid: "F2" } });
    expect(f2.valor.toFixed(2)).toBe("8000.00");
  });

  it("o mesmo FITID em OUTRA conta é outra transação (o índice é por conta)", async () => {
    await prisma.contaBancaria.create({
      data: { id: "cb2", codigo: "CC-002", descricao: "Outra", fonteId: "fnt-500" },
    });

    await importarExtrato(prisma, {
      contaBancariaId: CONTA, arquivoOfx: arquivo(JANEIRO), importadoPor: POR,
    });
    // MESMAS linhas, arquivo com período diferente (hash diferente), outra conta.
    const r = await importarExtrato(prisma, {
      contaBancariaId: "cb2",
      arquivoOfx: arquivo(JANEIRO, ["20260101", "20260130"]),
      importadoPor: POR,
    });

    expect(r.inseridas).toBe(3);
    expect(r.puladas).toBe(0);
    expect(await prisma.lancamentoExtrato.count()).toBe(6);
  });

  it("ARQUIVO PODRE não chega ao banco (o parser barra antes)", async () => {
    const podre = arquivo(JANEIRO).replace("<TRNAMT>8000.00", "<TRNAMT>R$ 8.000");

    await expect(
      importarExtrato(prisma, {
        contaBancariaId: CONTA, arquivoOfx: podre, importadoPor: POR,
      })
    ).rejects.toThrow(/não é um número decimal/);

    expect(await prisma.extratoBancario.count()).toBe(0);
    expect(await prisma.lancamentoExtrato.count()).toBe(0);
  });

  it("conta bancária inexistente: fail-closed", async () => {
    await expect(
      importarExtrato(prisma, {
        contaBancariaId: "nao-existe",
        arquivoOfx: arquivo(JANEIRO),
        importadoPor: POR,
      })
    ).rejects.toThrow(/não cadastrada/);

    expect(await prisma.extratoBancario.count()).toBe(0);
  });

  it("o índice único (conta, fitid) barra a duplicata driblando o serviço", async () => {
    const r = await importarExtrato(prisma, {
      contaBancariaId: CONTA, arquivoOfx: arquivo(JANEIRO), importadoPor: POR,
    });

    let erro: unknown;
    try {
      await prisma.lancamentoExtrato.create({
        data: {
          extratoId: r.extratoId,
          contaBancariaId: CONTA,
          fitid: "F1", // JÁ existe nesta conta
          dataPostagem: new Date("2026-01-05T00:00:00Z"),
          valor: "1500.00",
          natureza: "DEBITO",
          memo: "clandestina",
          linhaHash: "outro-hash",
        },
      });
    } catch (e) {
      erro = e;
    }

    expect(erro).toBeDefined();
    console.log(
      "\n>>> ERRO REAL DO POSTGRES (FITID duplicado na mesma conta):\n" +
        String(erro) + "\n"
    );
    expect(String(erro)).toMatch(/uq_extrato_conta_fitid|Unique constraint/i);
  });
});
