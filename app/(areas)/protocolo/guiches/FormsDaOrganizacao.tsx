"use client";

import { useActionState, useState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  abrirGuicheAction,
  abrirUnidadeAction,
  definirServicoAction,
  fecharDiaAction,
  publicarOfertaAction,
  type EstadoDoAto,
} from "./actions";

/**
 * OS FORMULÁRIOS DE ORGANIZAÇÃO DO ATENDIMENTO (V11 V8).
 *
 * ⚠️ CADA UM NASCE FECHADO e abre por um botão — são cinco atos de frequência muito diferente
 * (uma unidade se abre uma vez; um feriado, várias por ano), e cinco painéis abertos ao mesmo
 * tempo dariam uma tela em que ninguém acha nada.
 *
 * ⚠️ SEM DEFAULT em guichê, serviço, unidade e dia da semana. Um default escolheria, no lugar de
 * quem organiza, onde a oferta vale — e publicar horário no guichê errado só aparece quando
 * alguém aparece lá.
 *
 * ⚠️ ILHA CLIENT NÃO IMPORTA PORTA: tudo chega como props.
 */

export interface OpcaoSimples {
  readonly id: string;
  readonly rotulo: string;
}

const DIAS = [
  { valor: 0, rotulo: "Domingo" },
  { valor: 1, rotulo: "Segunda-feira" },
  { valor: 2, rotulo: "Terça-feira" },
  { valor: 3, rotulo: "Quarta-feira" },
  { valor: 4, rotulo: "Quinta-feira" },
  { valor: 5, rotulo: "Sexta-feira" },
  { valor: 6, rotulo: "Sábado" },
] as const;

/** Um painel que nasce fechado, confirma FORA do formulário e some no sucesso. */
function Painel({
  acao,
  titulo,
  explicacao,
  rotuloDoBotao,
  action,
  estado,
  pendente,
  children,
}: {
  readonly acao: string;
  readonly titulo: string;
  readonly explicacao: string;
  readonly rotuloDoBotao: string;
  readonly action: (f: FormData) => void;
  readonly estado: EstadoDoAto;
  readonly pendente: boolean;
  readonly children: React.ReactNode;
}): React.ReactElement {
  const [aberto, setAberto] = useState(false);
  const [ultimo, setUltimo] = useState<string | undefined>(undefined);
  const [seq, setSeq] = useState(0);

  // Deriva no render, como nos formulários do crédito adicional: o sucesso fecha o painel e a
  // confirmação fica FORA dele — quem enviou não pode ler silêncio.
  if (estado.sucesso !== undefined && estado.sucesso !== ultimo) {
    setUltimo(estado.sucesso);
    setSeq((n) => n + 1);
    setAberto(false);
  }

  const confirmacao =
    estado.sucesso === undefined ? null : (
      <p
        role="status"
        data-resultado-da-acao={acao}
        data-resultado-seq={String(seq)}
        className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]"
      >
        {estado.sucesso}
      </p>
    );

  if (!aberto) {
    return (
      <div className={CLASSE_PAINEL_FORMULARIO}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[color:var(--color-ink)]">{titulo}</h3>
            <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">{explicacao}</p>
          </div>
          <button type="button" onClick={() => setAberto(true)} className={CLASSE_BOTAO_PRIMARIO}>
            {rotuloDoBotao}
          </button>
        </div>
        {confirmacao}
      </div>
    );
  }

  return (
    <form action={action} data-acao={acao} className={CLASSE_PAINEL_FORMULARIO} aria-label={titulo}>
      <ChaveDeComando />
      <h3 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">{titulo}</h3>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">{explicacao}</p>
      {children}
      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
          {pendente ? "Gravando…" : rotuloDoBotao}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="text-xs text-[color:var(--color-ink-3)] hover:underline">
          Cancelar
        </button>
        {estado.erro !== undefined ? (
          <span role="alert" className="text-xs whitespace-pre-line text-[color:var(--color-status-erro-fg)]">
            {estado.erro}
          </span>
        ) : null}
      </div>
    </form>
  );
}

export function FormsDaOrganizacao({
  setores,
  unidades,
  guiches,
  servicos,
}: {
  readonly setores: readonly OpcaoSimples[];
  readonly unidades: readonly OpcaoSimples[];
  readonly guiches: readonly OpcaoSimples[];
  readonly servicos: readonly OpcaoSimples[];
}): React.ReactElement {
  const [eUnidade, aUnidade, pUnidade] = useActionState<EstadoDoAto, FormData>(abrirUnidadeAction, {});
  const [eGuiche, aGuiche, pGuiche] = useActionState<EstadoDoAto, FormData>(abrirGuicheAction, {});
  const [eServico, aServico, pServico] = useActionState<EstadoDoAto, FormData>(definirServicoAction, {});
  const [eOferta, aOferta, pOferta] = useActionState<EstadoDoAto, FormData>(publicarOfertaAction, {});
  const [eFeriado, aFeriado, pFeriado] = useActionState<EstadoDoAto, FormData>(fecharDiaAction, {});

  return (
    <div className="space-y-3">
      <Painel
        acao="abrir-unidade-de-atendimento"
        titulo="Abrir uma unidade de atendimento"
        explicacao="O lugar físico onde se atende. Os guichês moram dentro dela, e é o endereço dela que a pessoa vai procurar."
        rotuloDoBotao="Abrir unidade"
        action={aUnidade}
        estado={eUnidade}
        pendente={pUnidade}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs">
            <span className={ROTULO}>Código</span>
            <input name="codigo" required maxLength={20} placeholder="SEDE" className={CAMPO} />
          </label>
          <label className="text-xs">
            <span className={ROTULO}>Nome</span>
            <input name="nome" required placeholder="Sede da Prefeitura" className={CAMPO} />
          </label>
          <label className="text-xs sm:col-span-2">
            <span className={ROTULO}>Endereço</span>
            <input name="endereco" required placeholder="Praça Central, 1 - Centro" className={CAMPO} />
          </label>
          <label className="text-xs sm:col-span-2">
            <span className={ROTULO}>Setor responsável</span>
            <select name="setorId" required defaultValue="" className={CAMPO}>
              <option value="">Escolha o setor…</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>{s.rotulo}</option>
              ))}
            </select>
          </label>
        </div>
      </Painel>

      <Painel
        acao="abrir-guiche"
        titulo="Criar um guichê"
        explicacao="O posto de atendimento dentro da unidade. Ele nasce sem atender serviço nenhum e sem horário publicado."
        rotuloDoBotao="Criar guichê"
        action={aGuiche}
        estado={eGuiche}
        pendente={pGuiche}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-xs">
            <span className={ROTULO}>Unidade</span>
            <select name="unidadeId" required defaultValue="" className={CAMPO}>
              <option value="">Escolha a unidade…</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>{u.rotulo}</option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className={ROTULO}>Nome do guichê</span>
            <input name="nome" required maxLength={60} placeholder="Guichê 1" className={CAMPO} />
          </label>
        </div>
      </Painel>

      <Painel
        acao="definir-servico-do-guiche"
        titulo="Dizer o que um guichê atende"
        explicacao="Só se marca atendimento para um serviço que o guichê atende — marcar noutro mandaria a pessoa para uma fila que não resolve o problema dela."
        rotuloDoBotao="Gravar"
        action={aServico}
        estado={eServico}
        pendente={pServico}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs">
            <span className={ROTULO}>Guichê</span>
            <select name="guicheId" required defaultValue="" className={CAMPO}>
              <option value="">Escolha o guichê…</option>
              {guiches.map((g) => (
                <option key={g.id} value={g.id}>{g.rotulo}</option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className={ROTULO}>Serviço da carta</span>
            <select name="servicoId" required defaultValue="" className={CAMPO}>
              <option value="">Escolha o serviço…</option>
              {servicos.map((s) => (
                <option key={s.id} value={s.id}>{s.rotulo}</option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className={ROTULO}>Passa a atender?</span>
            <select name="habilitado" required defaultValue="sim" className={CAMPO}>
              <option value="sim">Sim — habilitar</option>
              <option value="nao">Não — desabilitar</option>
            </select>
          </label>
          <label className="text-xs">
            <span className={ROTULO}>Motivo (opcional)</span>
            <input name="motivo" maxLength={240} placeholder="Passou a ser atendido na Secretaria de Finanças" className={CAMPO} />
          </label>
        </div>
      </Painel>

      <Painel
        acao="publicar-oferta-de-horarios"
        titulo="Publicar a oferta de horários"
        explicacao="De que hora a que hora, de quantos em quantos minutos e quantas pessoas cabem em cada horário. Enquanto não houver oferta publicada, o guichê não oferece horário nenhum — não existe expediente padrão."
        rotuloDoBotao="Publicar oferta"
        action={aOferta}
        estado={eOferta}
        pendente={pOferta}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs sm:col-span-2">
            <span className={ROTULO}>Guichê</span>
            <select name="guicheId" required defaultValue="" className={CAMPO}>
              <option value="">Escolha o guichê…</option>
              {guiches.map((g) => (
                <option key={g.id} value={g.id}>{g.rotulo}</option>
              ))}
            </select>
          </label>
          <label className="text-xs sm:col-span-2">
            <span className={ROTULO}>Dia da semana</span>
            <select name="diaDaSemana" required defaultValue="" className={CAMPO}>
              <option value="">Escolha o dia…</option>
              {DIAS.map((d) => (
                <option key={d.valor} value={String(d.valor)}>{d.rotulo}</option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className={ROTULO}>Das</span>
            <input name="horaInicio" type="time" required className={CAMPO} />
          </label>
          <label className="text-xs">
            <span className={ROTULO}>Às</span>
            <input name="horaFim" type="time" required className={CAMPO} />
          </label>
          <label className="text-xs">
            <span className={ROTULO}>Minutos por atendimento</span>
            <input name="duracaoMinutos" type="number" min={5} max={480} required defaultValue={30} className={CAMPO} />
          </label>
          <label className="text-xs">
            <span className={ROTULO}>Pessoas por horário</span>
            <input name="capacidade" type="number" min={1} max={100} required defaultValue={1} className={CAMPO} />
          </label>
          <label className="text-xs sm:col-span-2">
            <span className={ROTULO}>Vale a partir de</span>
            <input name="vigenciaInicio" type="date" required className={CAMPO} />
          </label>
          <label className="text-xs sm:col-span-2">
            <span className={ROTULO}>Até (em branco = sem prazo)</span>
            <input name="vigenciaFim" type="date" className={CAMPO} />
          </label>
        </div>
      </Painel>

      <Painel
        acao="fechar-dia-de-atendimento"
        titulo="Fechar um dia"
        explicacao="Feriado, ponto facultativo, força maior. Vale para a unidade inteira, e é recusado se já houver gente marcada naquele dia — cancele ou remarque antes, cada uma com o seu motivo."
        rotuloDoBotao="Fechar o dia"
        action={aFeriado}
        estado={eFeriado}
        pendente={pFeriado}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs">
            <span className={ROTULO}>Unidade</span>
            <select name="unidadeId" required defaultValue="" className={CAMPO}>
              <option value="">Escolha a unidade…</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>{u.rotulo}</option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className={ROTULO}>Dia</span>
            <input name="dia" type="date" required className={CAMPO} />
          </label>
          <label className="text-xs sm:col-span-2">
            <span className={ROTULO}>Motivo</span>
            <input name="motivo" required maxLength={240} placeholder="Feriado municipal - padroeira da cidade" className={CAMPO} />
          </label>
        </div>
      </Painel>
    </div>
  );
}
