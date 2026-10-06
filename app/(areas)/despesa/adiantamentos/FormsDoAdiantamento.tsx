"use client";

import { useActionState, useState } from "react";
import { CampoReferenciado } from "../../../../components/ui/CampoReferenciado";
import { CampoValor } from "../../../../components/ui/Campos";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import {
  concederAction,
  decidirPrestacaoAction,
  registrarPrestacaoAction,
  type EstadoDoAdiantamento,
} from "./actions";

/**
 * Os formulários de diárias e suprimento de fundos (V32). O resultado aparece junto do formulário que o
 * operador acionou. Nenhum valor é sugerido: a quantidade, o valor da diária e o prazo vêm da norma do ente.
 */

function Resultado({ estado, acao }: { readonly estado: EstadoDoAdiantamento; readonly acao: string }): React.ReactElement | null {
  if (estado.sucesso !== undefined) {
    return (
      <p role="status" data-resultado-da-acao={acao} className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
        {estado.sucesso}
      </p>
    );
  }
  if (estado.erro !== undefined) {
    return (
      <p role="alert" data-resultado-da-acao={acao} className="mt-3 whitespace-pre-line text-sm text-[color:var(--color-status-erro-fg)]">
        {estado.erro}
      </p>
    );
  }
  return null;
}

const ROTULO_CAMPO = "text-xs text-[color:var(--color-ink-2)]";

export function FormConceder(): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoAdiantamento, FormData>(concederAction, {});
  const [especie, setEspecie] = useState("");
  const [documento, setDocumento] = useState("");
  const diaria = especie === "DIARIA";
  return (
    <form action={action} data-painel="conceder-adiantamento" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Conceder diária ou suprimento de fundos</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className={ROTULO_CAMPO}>
          <span className={ROTULO}>Tipo</span>
          <select name="especie" required value={especie} onChange={(e) => setEspecie(e.target.value)} className={CAMPO}>
            <option value="">Escolha…</option>
            <option value="DIARIA">Diária</option>
            <option value="SUPRIMENTO_DE_FUNDOS">Suprimento de fundos</option>
          </select>
        </label>
        <label className={ROTULO_CAMPO}>
          <span className={ROTULO}>Número da concessão</span>
          <input name="numero" required placeholder="Portaria ou processo" className={CAMPO} />
        </label>
        <CampoReferenciado
          name="empenhoId"
          rotulo="Empenho que paga a concessão"
          catalogo="empenhos-para-adiantamento"
          contexto={["especie"]}
          placeholder="Número do empenho ou CPF do beneficiário"
          ajuda="O empenho tem de estar em nome do beneficiário. Diária: elemento 14 ou 15."
          aoEscolher={(o) => {
            if (o?.dados?.["credorDocumento"] !== undefined) setDocumento(o.dados["credorDocumento"]);
          }}
          largura={2}
        />
        <label className={`${ROTULO_CAMPO} sm:col-span-2`}>
          <span className={ROTULO}>Nome do beneficiário</span>
          <input name="beneficiarioNome" required minLength={3} className={CAMPO} />
        </label>
        <label className={ROTULO_CAMPO}>
          <span className={ROTULO}>CPF do beneficiário</span>
          <input name="beneficiarioDocumento" required value={documento} onChange={(e) => setDocumento(e.target.value)} inputMode="numeric" className={CAMPO} />
        </label>
        <label className={ROTULO_CAMPO}>
          <span className={ROTULO}>Cargo ou função (opcional)</span>
          <input name="cargoOuFuncao" className={CAMPO} />
        </label>
        <label className={`${ROTULO_CAMPO} sm:col-span-2 lg:col-span-4`}>
          <span className={ROTULO}>Finalidade</span>
          <input name="finalidade" required minLength={10} placeholder="Objetivo da viagem ou das despesas" className={CAMPO} />
        </label>
        {diaria ? (
          <label className={`${ROTULO_CAMPO} sm:col-span-2`}>
            <span className={ROTULO}>Destino</span>
            <input name="destino" required placeholder="Cidade de destino" className={CAMPO} />
          </label>
        ) : null}
        <label className={ROTULO_CAMPO}>
          <span className={ROTULO}>{diaria ? "Saída" : "Início da aplicação"}</span>
          <input name="diaInicio" type="date" required className={CAMPO} />
        </label>
        <label className={ROTULO_CAMPO}>
          <span className={ROTULO}>{diaria ? "Retorno" : "Fim da aplicação"}</span>
          <input name="diaFim" type="date" required className={CAMPO} />
        </label>
        {diaria ? (
          <>
            <label className={ROTULO_CAMPO}>
              <span className={ROTULO}>Quantidade de diárias</span>
              <input name="quantidadeDeDiarias" required inputMode="decimal" placeholder="2,5" className={CAMPO} />
            </label>
            <label className={ROTULO_CAMPO}>
              <span className={ROTULO}>Valor da diária (R$)</span>
              <CampoValor name="valorUnitario" required className={CAMPO} />
            </label>
          </>
        ) : null}
        <label className={ROTULO_CAMPO}>
          <span className={ROTULO}>Valor total (R$)</span>
          <CampoValor name="valor" required className={CAMPO} />
        </label>
        <label className={`${ROTULO_CAMPO} sm:col-span-2`}>
          <span className={ROTULO}>Norma que autoriza</span>
          <input name="atoAutorizativo" required minLength={5} placeholder="Lei, decreto ou portaria" className={CAMPO} />
        </label>
        <label className={ROTULO_CAMPO}>
          <span className={ROTULO}>Prazo da prestação de contas</span>
          <input name="diaPrazoDePrestacao" type="date" required className={CAMPO} />
        </label>
        <label className={ROTULO_CAMPO}>
          <span className={ROTULO}>Data da concessão</span>
          <input name="diaConcessao" type="date" required className={CAMPO} />
        </label>
      </div>
      <Resultado estado={estado} acao="conceder-adiantamento" />
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Concedendo…" : "Conceder"}
      </button>
    </form>
  );
}

type EstadoDaAcao = readonly [EstadoDoAdiantamento, (f: FormData) => void, boolean];

/**
 * V36 — A PRESTAÇÃO DE UMA CONCESSÃO: registrar, decidir, e o retorno de cada um.
 *
 * ⚠️ OS DOIS ESTADOS MORAM AQUI, E NÃO EM CADA FORMULÁRIO, PORQUE O SUCESSO TROCA O FORMULÁRIO. Registrar a
 * prestação faz a linha passar a mostrar a decisão; rejeitar a faz voltar ao registro; aprovar a deixa
 * comprovada, sem formulário. Com o estado dentro de cada formulário, o que sumia junto era a mensagem de
 * sucesso: o operador via a tela mudar sem nenhuma confirmação, e o percurso lia silêncio com a gravação
 * feita. Este componente fica montado nos três estados da linha, e a última resposta continua à vista.
 */
export function PrestacaoDaConcessao({
  concessaoId,
  numero,
  prestacaoEmAnaliseId,
  comprovada,
  children,
}: {
  readonly concessaoId: string;
  readonly numero: string;
  readonly prestacaoEmAnaliseId: string | null;
  readonly comprovada: boolean;
  /** O resumo da prestação em análise, montado no servidor. */
  readonly children?: React.ReactNode;
}): React.ReactElement {
  const prestar = useActionState<EstadoDoAdiantamento, FormData>(registrarPrestacaoAction, {});
  const decidir = useActionState<EstadoDoAdiantamento, FormData>(decidirPrestacaoAction, {});
  // A resposta que já não tem formulário embaixo dela: a do registro, quando a linha passou à decisão; a da
  // decisão, quando a linha voltou ao registro (rejeitada) ou ficou comprovada (aprovada).
  const anterior =
    prestacaoEmAnaliseId !== null ? { estado: prestar[0], acao: "registrar-prestacao" } : { estado: decidir[0], acao: "decidir-prestacao" };
  return (
    <div className="space-y-2">
      {comprovada ? <span>—</span> : null}
      {/* Só o sucesso: o erro fica dentro do formulário que o produziu, que continua montado. */}
      {anterior.estado.sucesso !== undefined ? <Resultado estado={anterior.estado} acao={anterior.acao} /> : null}
      {comprovada ? null : prestacaoEmAnaliseId !== null ? (
        <>
          {children}
          <FormDecisao prestacaoId={prestacaoEmAnaliseId} numero={numero} acao={decidir} />
        </>
      ) : (
        <FormPrestacao concessaoId={concessaoId} numero={numero} acao={prestar} />
      )}
    </div>
  );
}

function FormPrestacao({ concessaoId, numero, acao }: { readonly concessaoId: string; readonly numero: string; readonly acao: EstadoDaAcao }): React.ReactElement {
  const [estado, action, pendente] = acao;
  return (
    <form action={action} data-acao="registrar-prestacao" data-concessao={numero} className="grid gap-2 sm:grid-cols-2">
      <ChaveDeComando />
      <input type="hidden" name="concessaoId" value={concessaoId} />
      <label className={ROTULO_CAMPO}>
        <span className={ROTULO}>Valor comprovado (R$)</span>
        <CampoValor name="valorComprovado" required className={CAMPO} />
      </label>
      <label className={ROTULO_CAMPO}>
        <span className={ROTULO}>Valor devolvido (R$)</span>
        <CampoValor name="valorDevolvido" className={CAMPO} />
      </label>
      <label className={`${ROTULO_CAMPO} sm:col-span-2`}>
        <span className={ROTULO}>Relatório e comprovantes</span>
        <input name="relatorio" required minLength={20} placeholder="O que foi feito e quais comprovantes foram apresentados" className={CAMPO} />
      </label>
      <label className={ROTULO_CAMPO}>
        <span className={ROTULO}>Data da apresentação</span>
        <input name="diaApresentacao" type="date" required className={CAMPO} />
      </label>
      <div className="flex items-end">
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
          {pendente ? "Registrando…" : "Registrar prestação"}
        </button>
      </div>
      <div className="sm:col-span-2">
        {/* Só o erro: o sucesso tira a linha deste formulário e aparece acima, em PrestacaoDaConcessao. */}
        <Resultado estado={estado.erro !== undefined ? estado : {}} acao="registrar-prestacao" />
      </div>
    </form>
  );
}

function FormDecisao({ prestacaoId, numero, acao }: { readonly prestacaoId: string; readonly numero: string; readonly acao: EstadoDaAcao }): React.ReactElement {
  const [estado, action, pendente] = acao;
  return (
    <form action={action} data-acao="decidir-prestacao" data-concessao={numero} className="grid gap-2 sm:grid-cols-2">
      <ChaveDeComando />
      <input type="hidden" name="prestacaoId" value={prestacaoId} />
      <label className={ROTULO_CAMPO}>
        <span className={ROTULO}>Decisão</span>
        <select name="decisao" required defaultValue="" className={CAMPO}>
          <option value="">Escolha…</option>
          <option value="aprovar">Aprovar</option>
          <option value="rejeitar">Rejeitar</option>
        </select>
      </label>
      <label className={ROTULO_CAMPO}>
        <span className={ROTULO}>Data da decisão</span>
        <input name="diaDecisao" type="date" required className={CAMPO} />
      </label>
      <label className={`${ROTULO_CAMPO} sm:col-span-2`}>
        <span className={ROTULO}>Parecer</span>
        <input name="motivo" required minLength={10} placeholder="O que foi conferido, ou o que falta" className={CAMPO} />
      </label>
      <div>
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
          {pendente ? "Gravando…" : "Gravar decisão"}
        </button>
      </div>
      <div className="sm:col-span-2">
        <Resultado estado={estado.erro !== undefined ? estado : {}} acao="decidir-prestacao" />
      </div>
    </form>
  );
}
