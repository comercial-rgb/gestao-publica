// @vitest-environment happy-dom

/**
 * OS FORMULÁRIOS DA AGENDA DO GUICHÊ (V11 V8) — a fiação da tela.
 *
 * ═══ ⚠️ O QUE FALHA EM SILÊNCIO AQUI ═══
 *   (1) UM DEFAULT no guichê, no serviço, na unidade ou no dia da semana. Publicar a oferta no
 *       guichê errado só aparece quando alguém vai até lá e a porta está fechada; marcar no
 *       serviço errado manda a pessoa para a fila que não resolve o problema dela.
 *   (2) UM HORÁRIO LOTADO NA LISTA. O `select` só pode oferecer o que tem vaga — e o número de
 *       vagas tem de estar ao lado, porque é a informação que faz quem atende escolher.
 *   (3) A CONFIRMAÇÃO DO ATO QUE SAI DA TELA. O painel fecha no sucesso; sem confirmação fora
 *       dele, quem enviou lê silêncio e reenvia.
 *   (4) RÓTULO EM TODO CAMPO. Campo sem rótulo é caixa muda para leitor de tela.
 *
 * ⚠️ AS SERVER ACTIONS SÃO MOCKADAS: o que está sob teste é a FIAÇÃO. Capacidade, oferta
 * publicada e os estados da reserva são do domínio, provados por mutação contra o Postgres em
 * `modules/m21-protocolo/m21-guiche.test.ts`.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const acao = vi.hoisted(() => ({ resposta: {} as { erro?: string; sucesso?: string } }));

vi.mock("../../app/(areas)/protocolo/guiches/actions", () => ({
  abrirUnidadeAction: async () => acao.resposta,
  abrirGuicheAction: async () => acao.resposta,
  definirServicoAction: async () => acao.resposta,
  publicarOfertaAction: async () => acao.resposta,
  fecharDiaAction: async () => acao.resposta,
  marcarAction: async () => acao.resposta,
  confirmarAction: async () => acao.resposta,
  registrarAtendimentoAction: async () => acao.resposta,
  cancelarAction: async () => acao.resposta,
  remarcarAction: async () => acao.resposta,
}));

const { FormsDaOrganizacao } = await import("../../app/(areas)/protocolo/guiches/FormsDaOrganizacao");
const { FormMarcar, AtosDaReserva, AtosDaAgenda } = await import("../../app/(areas)/protocolo/guiches/[id]/AcoesDaAgenda");

const SETORES = [{ id: "s1", rotulo: "PROT — Protocolo Geral" }];
const UNIDADES = [{ id: "u1", rotulo: "SEDE — Sede da Prefeitura" }];
const GUICHES = [
  { id: "g1", rotulo: "Sede — Guichê 1" },
  { id: "g2", rotulo: "Sede — Guichê 2" },
];
const SERVICOS = [
  { id: "sv1", rotulo: "Segunda via de IPTU" },
  { id: "sv2", rotulo: "Alvará de funcionamento" },
];

afterEach(() => {
  acao.resposta = {};
  cleanup();
});

const form = (acaoDoForm: string): HTMLFormElement | null =>
  document.querySelector(`form[data-acao="${acaoDoForm}"]`);

function organizacao(): void {
  render(<FormsDaOrganizacao setores={SETORES} unidades={UNIDADES} guiches={GUICHES} servicos={SERVICOS} />);
}

/** A PROPRIEDADE do rótulo, afirmada uma vez e usada em todo formulário. */
function camposMudos(f: HTMLFormElement): readonly string[] {
  const visiveis = Array.from(f.querySelectorAll("input, select")).filter(
    (e) => (e as HTMLInputElement).type !== "hidden"
  );
  expect(visiveis.length).toBeGreaterThan(0);
  return visiveis
    .filter((e) => {
      const el = e as HTMLElement;
      if (el.closest("label") !== null) return false;
      const id = el.getAttribute("id");
      return id === null || f.querySelector(`label[for="${id}"]`) === null;
    })
    .map((e) => (e as HTMLInputElement).name || "(sem nome)");
}

describe("a organização do atendimento", () => {
  it("t1: os cinco painéis nascem FECHADOS — cinco formulários abertos seriam uma tela ilegível", () => {
    organizacao();
    for (const a of [
      "abrir-unidade-de-atendimento",
      "abrir-guiche",
      "definir-servico-do-guiche",
      "publicar-oferta-de-horarios",
      "fechar-dia-de-atendimento",
    ]) {
      expect(form(a), a).toBeNull();
    }
    expect(screen.getByRole("button", { name: "Abrir unidade" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Publicar oferta" })).toBeTruthy();
  });

  it("t2: em TODO painel, TODO campo tem rótulo", () => {
    organizacao();
    const painéis: readonly [string, string][] = [
      ["Abrir unidade", "abrir-unidade-de-atendimento"],
      ["Criar guichê", "abrir-guiche"],
      ["Gravar", "definir-servico-do-guiche"],
      ["Publicar oferta", "publicar-oferta-de-horarios"],
      ["Declarar", "fechar-dia-de-atendimento"],
    ];
    for (const [botao, a] of painéis) {
      fireEvent.click(screen.getByRole("button", { name: botao }));
      const f = form(a);
      expect(f, a).not.toBeNull();
      expect(camposMudos(f!), a).toEqual([]);
    }
  });

  it("t3: guichê, serviço, unidade e dia da semana NÃO têm default — a tela não escolhe pelo ente", () => {
    organizacao();
    fireEvent.click(screen.getByRole("button", { name: "Publicar oferta" }));
    const f = form("publicar-oferta-de-horarios")!;

    expect((f.querySelector('select[name="guicheId"]') as HTMLSelectElement).value).toBe("");
    expect((f.querySelector('select[name="diaDaSemana"]') as HTMLSelectElement).value).toBe("");
    // Os sete dias existem, e o vazio é a primeira opção.
    const dias = Array.from((f.querySelector('select[name="diaDaSemana"]') as HTMLSelectElement).options).map((o) => o.value);
    expect(dias).toEqual(["", "0", "1", "2", "3", "4", "5", "6"]);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    fireEvent.click(screen.getByRole("button", { name: "Gravar" }));
    const g = form("definir-servico-do-guiche")!;
    expect((g.querySelector('select[name="guicheId"]') as HTMLSelectElement).value).toBe("");
    expect((g.querySelector('select[name="servicoId"]') as HTMLSelectElement).value).toBe("");
  });

  it("t4: no SUCESSO o painel fecha E a confirmação fica, marcada para quem não enxerga a tela", async () => {
    acao.resposta = { sucesso: "Oferta publicada: 4 horário(s) por dia, 2 lugar(es) em cada." };
    organizacao();
    fireEvent.click(screen.getByRole("button", { name: "Publicar oferta" }));
    fireEvent.submit(form("publicar-oferta-de-horarios")!);
    await screen.findByText(/Oferta publicada/);

    expect(form("publicar-oferta-de-horarios")).toBeNull();
    const aviso = document.querySelector('[data-resultado-da-acao="publicar-oferta-de-horarios"]');
    expect(aviso).not.toBeNull();
    expect(aviso!.getAttribute("role")).toBe("status");
    expect(aviso!.getAttribute("data-resultado-seq")).toBe("1");
  });

  it("t5: no ERRO o painel CONTINUA aberto, com o motivo INTEIRO do domínio", async () => {
    acao.resposta = {
      erro: "Esta oferta se sobrepõe à janela 08:00–12:00 já publicada no guichê Guichê 1 para o mesmo dia da semana.",
    };
    organizacao();
    fireEvent.click(screen.getByRole("button", { name: "Publicar oferta" }));
    fireEvent.submit(form("publicar-oferta-de-horarios")!);
    await screen.findByRole("alert");

    expect(form("publicar-oferta-de-horarios")).not.toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("se sobrepõe à janela 08:00–12:00");
  });
});

describe("marcar um atendimento", () => {
  const HORARIOS = [
    { hora: "08:00", livres: 0, capacidade: 2 },
    { hora: "08:30", livres: 1, capacidade: 2 },
    { hora: "09:00", livres: 2, capacidade: 2 },
  ];

  function marcar(p: { horarios?: typeof HORARIOS; servicos?: typeof SERVICOS } = {}): void {
    render(
      <FormMarcar
        guicheId="g1"
        dia="2026-09-21"
        servicos={(p.servicos ?? SERVICOS).map((s) => ({ id: s.id, titulo: s.rotulo }))}
        horarios={p.horarios ?? HORARIOS}
      />
    );
  }

  it("t6: o HORÁRIO LOTADO não entra na lista, e os que entram dizem quantas vagas têm", () => {
    marcar();
    fireEvent.click(screen.getByRole("button", { name: "Marcar atendimento" }));
    const sel = form("marcar-atendimento")!.querySelector('select[name="horaInicio"]') as HTMLSelectElement;

    const valores = Array.from(sel.options).map((o) => o.value);
    // ⚠️ AS 08:00 NÃO ESTÃO LÁ: zero vagas. Oferecê-las seria a tela prometendo o que a
    // gravação recusa dentro da transação.
    expect(valores).toEqual(["", "08:30", "09:00"]);
    expect(sel.value).toBe("");
    expect(sel.options[1]!.textContent).toContain("1 de 2 livre(s)");
  });

  it("t7: sem vaga nenhuma, o botão de marcar fica DESABILITADO e a tela diz por quê", () => {
    marcar({ horarios: [{ hora: "08:00", livres: 0, capacidade: 1 }] });
    const botao = screen.getByRole("button", { name: "Marcar atendimento" }) as HTMLButtonElement;
    expect(botao.disabled).toBe(true);
    expect(screen.getByText("Nenhum horário com vaga neste dia.")).toBeTruthy();
  });

  it("t8: guichê que não atende NADA não oferece formulário — ele diz o que falta", () => {
    marcar({ servicos: [] });
    expect(screen.queryByRole("button", { name: "Marcar atendimento" })).toBeNull();
    expect(screen.getByText(/não possui serviços habilitados/)).toBeTruthy();
  });

  it("t9: TODO campo tem rótulo, e o serviço não tem default", () => {
    marcar();
    fireEvent.click(screen.getByRole("button", { name: "Marcar atendimento" }));
    const f = form("marcar-atendimento")!;
    expect(camposMudos(f)).toEqual([]);
    expect((f.querySelector('select[name="servicoId"]') as HTMLSelectElement).value).toBe("");
    // A pessoa entra pelo DOCUMENTO — não há select com o cadastro do município.
    expect(f.querySelector('input[name="documento"]')).not.toBeNull();
    expect(f.querySelector('select[name="pessoaId"]')).toBeNull();
  });

  it("t10b: CADA ato da reserva confirma com o PRÓPRIO nome — não com um rótulo genérico", async () => {
    // ⚠️ ISTO FOI UM DEFEITO MEDIDO (percurso do guichê, passos 3.3, 3.6 e 4.2). Os três atos —
    // registrar, cancelar e remarcar — dividiam UM marcador de resultado. O efeito: o ato gravava,
    // o formulário fechava, e quem procurava a confirmação DAQUELE ato não a encontrava. O
    // percurso leu "silêncio" três vezes em atos que tinham funcionado, e só os passos seguintes
    // (que liam o efeito na tela) mostraram que o problema era o aviso, não a gravação.
    //
    // Para um leitor de tela o defeito é o mesmo: "algo deu certo" sem dizer o quê.
    acao.resposta = { sucesso: "Remarcado para 21/09/2026 às 09:00 (remarcação nº 1)." };
    render(
      <AtosDaAgenda>
        <AtosDaReserva reservaId="r1" guicheId="g1" dia="2026-09-21" />
      </AtosDaAgenda>
    );
    fireEvent.click(screen.getByRole("button", { name: "Remarcar" }));
    fireEvent.submit(form("remarcar-atendimento")!);
    await screen.findByText(/Remarcado para/);

    const aviso = document.querySelector('[data-resultado-da-acao="remarcar-atendimento"]');
    expect(aviso).not.toBeNull();
    expect(aviso!.getAttribute("role")).toBe("status");
    expect(aviso!.getAttribute("data-resultado-seq")).toBe("1");
    // E não o rótulo genérico de antes.
    expect(document.querySelector('[data-resultado-da-acao="ato-da-reserva"]')).toBeNull();
  });

  it("t10c: a confirmação vive FORA da linha — ela sobrevive ao sumiço do formulário", async () => {
    // ⚠️ A AFIRMAÇÃO ESTRUTURAL, e é ela que o percurso derrubou duas vezes: o aviso não pode ser
    // filho do componente da reserva. Registrar torna a situação ATENDIDA e a linha deixa de
    // oferecer atos; cancelar faz o mesmo; remarcar move a linha de lugar. Guardado lá dentro, o
    // aviso morre com o componente, e quem enviou lê silêncio.
    acao.resposta = { sucesso: "Atendimento registrado." };
    const { unmount } = render(
      <AtosDaAgenda>
        <AtosDaReserva reservaId="r1" guicheId="g1" dia="2026-09-21" />
      </AtosDaAgenda>
    );
    fireEvent.click(screen.getByRole("button", { name: "Registrar atendimento" }));
    fireEvent.submit(form("registrar-atendimento")!);
    await screen.findByText("Atendimento registrado.");

    const aviso = document.querySelector('[data-resultado-da-acao="registrar-atendimento"]');
    expect(aviso).not.toBeNull();
    // O aviso NÃO é descendente do formulário nem da linha — ele é irmão de cima.
    expect(aviso!.closest('form[data-acao="registrar-atendimento"]')).toBeNull();
    unmount();
  });

  it("t10d: sem o provedor, o ato NÃO é oferecido — melhor mudo que silencioso", () => {
    // Fail-closed e visível: renderizado fora da agenda, o componente diz que não há ato, em vez
    // de oferecer um botão cuja confirmação ninguém veria.
    render(<AtosDaReserva reservaId="r1" guicheId="g1" dia="2026-09-21" />);
    expect(screen.queryByRole("button", { name: "Remarcar" })).toBeNull();
    expect(screen.getByText("Atos indisponíveis nesta tela.")).toBeTruthy();
  });

  it("t10: no SUCESSO o painel fecha e a confirmação traz o CÓDIGO da marcação", async () => {
    acao.resposta = { sucesso: "Atendimento marcado para 21/09/2026 às 08:30. Código ABC123XYZ." };
    marcar();
    fireEvent.click(screen.getByRole("button", { name: "Marcar atendimento" }));
    fireEvent.submit(form("marcar-atendimento")!);
    await screen.findByText(/Atendimento marcado/);

    expect(form("marcar-atendimento")).toBeNull();
    const aviso = document.querySelector('[data-resultado-da-acao="marcar-atendimento"]');
    expect(aviso!.getAttribute("role")).toBe("status");
    expect(aviso!.textContent).toContain("Código ABC123XYZ");
  });
});
