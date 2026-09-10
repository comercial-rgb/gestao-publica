"use client";

import { useActionState } from "react";
import { CampoSelect, CampoTexto, CampoTextarea } from "../../../../../components/ui/Campos";
import { CLASSE_BOTAO_PRIMARIO } from "../../../../../components/ui/Formulario";
import {
  arquivarAction,
  desarquivarAction,
  editarRascunhoAction,
  encaminharAction,
  enviarAction,
  etiquetarAction,
  favoritarAction,
  marcarLeituraAction,
  responderAction,
  type EstadoDoComunicado,
} from "../actions";
import { ResultadoComunicado } from "../FormComunicado";

export interface SetorDaAcao {
  readonly id: string;
  readonly rotulo: string;
}

function Painel({
  titulo,
  descricao,
  children,
}: {
  readonly titulo: string;
  readonly descricao?: string;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
      <h3 className="text-sm font-medium text-[color:var(--color-ink)]">{titulo}</h3>
      {descricao !== undefined ? (
        <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">{descricao}</p>
      ) : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function FormEditarRascunho({
  comunicadoId,
  assunto,
  corpo,
}: {
  readonly comunicadoId: string;
  readonly assunto: string;
  readonly corpo: string;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoComunicado, FormData>(
    editarRascunhoAction,
    {}
  );
  return (
    <Painel
      titulo="Editar rascunho"
      descricao="Editável até o envio, e nunca depois: quem já leu leu o texto que saiu. O envio carimba o hash do conteúdo, e é ele que denuncia uma alteração feita por outro caminho."
    >
      <form data-acao="editar-rascunho" action={action} className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <input type="hidden" name="comunicadoId" value={comunicadoId} />
        <CampoTexto name="assunto" rotulo="Assunto" required largura={4} defaultValue={assunto} />
        <CampoTextarea name="corpo" rotulo="Corpo" required largura={4} linhas={6} defaultValue={corpo} />
        <div className="md:col-span-4">
          <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendente}>
            {pendente ? "Salvando…" : "Salvar rascunho"}
          </button>
          <ResultadoComunicado estado={estado} />
        </div>
      </form>
    </Painel>
  );
}

/**
 * ENVIAR — com um ou mais destinos.
 *
 * ⚠️ SELEÇÃO MÚLTIPLA EM HTML PURO (`<select multiple>`), sem JavaScript de montagem.
 * É o que um smoke de navegador exercita de verdade, e é o que funciona quando o script
 * da página falha.
 */
export function FormEnviar({
  comunicadoId,
  setores,
  assinaturaExigida,
}: {
  readonly comunicadoId: string;
  readonly setores: readonly SetorDaAcao[];
  readonly assinaturaExigida: string | null;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoComunicado, FormData>(
    enviarAction,
    {}
  );
  return (
    <Painel
      titulo="Enviar"
      descricao={
        assinaturaExigida !== null
          ? `Este tipo EXIGE assinatura ${assinaturaExigida}. O servidor recusa o envio sem ela — um tipo que declara exigir assinatura e um envio que passa sem ela é configuração decorativa.`
          : "O comunicado sai para os setores escolhidos e some da sua caixa de rascunhos."
      }
    >
      <form data-acao="enviar" action={action} className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <input type="hidden" name="comunicadoId" value={comunicadoId} />
        <label className="flex flex-col gap-1 text-xs text-[color:var(--color-ink-2)] md:col-span-2">
          <span className="font-medium text-[color:var(--color-ink)]">
            Setores de destino
          </span>
          <select
            name="destino"
            multiple
            size={Math.min(6, Math.max(3, setores.length))}
            required
            className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-2 text-sm text-[color:var(--color-ink)]"
          >
            {setores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.rotulo}
              </option>
            ))}
          </select>
          <span>Segure Ctrl (ou Cmd) para escolher mais de um.</span>
        </label>
        <CampoTexto
          name="aosCuidadosDe"
          rotulo="Aos cuidados de (opcional)"
          largura={2}
          placeholder="identificador do servidor"
          ajuda="Destaca para uma pessoa — mas NÃO restringe: o comunicado continua sendo do setor."
        />
        {assinaturaExigida !== null ? (
          <input type="hidden" name="modoDeAssinatura" value={assinaturaExigida} />
        ) : null}
        <div className="md:col-span-4">
          <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendente}>
            {pendente ? "Enviando…" : "Enviar comunicado"}
          </button>
          <ResultadoComunicado estado={estado} />
        </div>
      </form>
    </Painel>
  );
}

export function FormResponder({
  comunicadoId,
  setores,
  aceitaResposta,
  assuntoOriginal,
}: {
  readonly comunicadoId: string;
  readonly setores: readonly SetorDaAcao[];
  readonly aceitaResposta: boolean;
  readonly assuntoOriginal: string;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoComunicado, FormData>(
    responderAction,
    {}
  );

  if (!aceitaResposta) {
    return (
      <Painel titulo="Responder">
        <p className="text-xs text-[color:var(--color-ink-2)]">
          Este tipo <strong>não aceita resposta</strong>. Uma circular é comunicação de
          um para muitos: se cada destinatário respondesse a todos, ela viraria lista de
          discussão — que é exatamente o que ela não é. Emita um comunicado novo, se for
          o caso.
        </p>
      </Painel>
    );
  }

  return (
    <Painel
      titulo="Responder"
      descricao="A resposta alcança apenas os setores JÁ ENVOLVIDOS. Para trazer alguém novo, use encaminhar — e o encaminhamento fica registrado como tal."
    >
      <form data-acao="responder" action={action} className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <input type="hidden" name="comunicadoId" value={comunicadoId} />
        <CampoSelect
          name="setorRemetenteId"
          rotulo="Respondo pelo setor"
          required
          largura={2}
          vazio="Escolha"
          opcoes={setores.map((s) => ({ valor: s.id, rotulo: s.rotulo }))}
        />
        <CampoTexto
          name="assunto"
          rotulo="Assunto"
          required
          largura={4}
          defaultValue={`Re: ${assuntoOriginal}`}
        />
        <CampoTextarea name="corpo" rotulo="Resposta" required largura={4} linhas={5} />
        <div className="md:col-span-4">
          <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendente}>
            {pendente ? "Respondendo…" : "Responder"}
          </button>
          <ResultadoComunicado estado={estado} />
        </div>
      </form>
    </Painel>
  );
}

export function FormEncaminhar({
  comunicadoId,
  setores,
}: {
  readonly comunicadoId: string;
  readonly setores: readonly SetorDaAcao[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoComunicado, FormData>(
    encaminharAction,
    {}
  );
  return (
    <Painel
      titulo="Encaminhar"
      descricao="É o ato que INCLUI alguém novo na conversa — e por isso ele é registrado, ao contrário de uma resposta que alcançasse qualquer setor."
    >
      <form data-acao="encaminhar" action={action} className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <input type="hidden" name="comunicadoId" value={comunicadoId} />
        <CampoSelect
          name="setorDestinoId"
          rotulo="Incluir o setor"
          required
          largura={2}
          vazio="Escolha"
          opcoes={setores.map((s) => ({ valor: s.id, rotulo: s.rotulo }))}
        />
        <CampoTexto
          name="aosCuidadosDe"
          rotulo="Aos cuidados de (opcional)"
          largura={2}
        />
        <div className="md:col-span-4">
          <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendente}>
            {pendente ? "Encaminhando…" : "Encaminhar"}
          </button>
          <ResultadoComunicado estado={estado} />
        </div>
      </form>
    </Painel>
  );
}

/** As ações pessoais: ciência, arquivo e favorito. Cada uma é um `<form>` de um botão. */
export function FormAcoesPessoais({
  comunicadoId,
  arquivado,
}: {
  readonly comunicadoId: string;
  readonly arquivado: boolean;
}): React.ReactElement {
  const [ciencia, acaoCiencia, pendenteCiencia] = useActionState<EstadoDoComunicado, FormData>(
    marcarLeituraAction,
    {}
  );
  const [arquivo, acaoArquivo, pendenteArquivo] = useActionState<EstadoDoComunicado, FormData>(
    arquivado ? desarquivarAction : arquivarAction,
    {}
  );
  const [favorito, acaoFavorito, pendenteFavorito] = useActionState<EstadoDoComunicado, FormData>(
    favoritarAction,
    {}
  );
  const [etiqueta, acaoEtiqueta, pendenteEtiqueta] = useActionState<EstadoDoComunicado, FormData>(
    etiquetarAction,
    {}
  );

  return (
    <Painel
      titulo="Minha caixa"
      descricao="Arquivar e favoritar são SEUS: o mesmo comunicado pode estar arquivado para você e ativo para outra pessoa. A etiqueta, ao contrário, é visível a todos os envolvidos."
    >
      <div className="flex flex-wrap gap-2">
        <form data-acao="ciencia" action={acaoCiencia}>
          <input type="hidden" name="comunicadoId" value={comunicadoId} />
          <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendenteCiencia}>
            {pendenteCiencia ? "Registrando…" : "Registrar ciência"}
          </button>
        </form>
        <form data-acao="arquivo" action={acaoArquivo}>
          <input type="hidden" name="comunicadoId" value={comunicadoId} />
          <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendenteArquivo}>
            {arquivado ? "Desarquivar" : "Arquivar"}
          </button>
        </form>
        <form data-acao="favorito" action={acaoFavorito}>
          <input type="hidden" name="comunicadoId" value={comunicadoId} />
          <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendenteFavorito}>
            Favoritar
          </button>
        </form>
      </div>

      <ResultadoComunicado estado={ciencia} />
      <ResultadoComunicado estado={arquivo} />
      <ResultadoComunicado estado={favorito} />

      <form data-acao="etiqueta" action={acaoEtiqueta} className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4">
        <input type="hidden" name="comunicadoId" value={comunicadoId} />
        <CampoTexto name="tag" rotulo="Etiqueta" largura={2} placeholder="prazo curto" />
        <div className="md:col-span-4">
          <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendenteEtiqueta}>
            {pendenteEtiqueta ? "Aplicando…" : "Aplicar etiqueta"}
          </button>
          <ResultadoComunicado estado={etiqueta} />
        </div>
      </form>
    </Painel>
  );
}
