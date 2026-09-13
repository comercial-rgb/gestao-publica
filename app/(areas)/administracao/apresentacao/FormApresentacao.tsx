"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { configurarApresentacaoAction, type EstadoApresentacao } from "./actions";

export interface ValoresDaApresentacao {
  readonly nomeDeExibicao: string;
  readonly orgao: string;
  readonly assinaturaDoFornecedor: string;
  readonly contatoEmail: string;
  readonly contatoTelefone: string;
  readonly horarioDeAtendimento: string;
  readonly sitio: string;
  readonly tema: "PADRAO" | "ALTO_CONTRASTE";
  readonly temImagem: boolean;
  readonly imagemHref: string | null;
  readonly canalTransparencia: boolean;
  readonly canalConsultaPublica: boolean;
}

/**
 * O FORMULÁRIO DA APRESENTAÇÃO — ilha client. Todo envio grava uma versão NOVA (o histórico
 * fica na tela do servidor). A imagem é um `<input type="file">` com rótulo e `accept`; a
 * validação real (bytes, tamanho) é do domínio. Tema é um `<select>` fechado.
 */
export function FormApresentacao({ valores, podeConfigurar }: { readonly valores: ValoresDaApresentacao; readonly podeConfigurar: boolean }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoApresentacao, FormData>(configurarApresentacaoAction, {});
  const ro = !podeConfigurar;

  return (
    <form action={action} className={CLASSE_PAINEL_FORMULARIO} data-acao="configurar-apresentacao" encType="multipart/form-data">
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Como o ente se apresenta</h2>
      <p className="mb-4 text-xs text-[color:var(--color-ink-3)]">
        Cada gravação é uma versão nova, com o seu nome e a hora. Os documentos já emitidos não mudam.
        {ro ? " O seu perfil consulta esta configuração, mas não a altera." : ""}
      </p>
      <fieldset disabled={ro} className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs sm:col-span-2">
          <span className={ROTULO}>Nome de exibição</span>
          <input name="nomeDeExibicao" required minLength={3} maxLength={120} defaultValue={valores.nomeDeExibicao} placeholder="Prefeitura Municipal de …" className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Órgão ou secretaria (opcional)</span>
          <input name="orgao" maxLength={120} defaultValue={valores.orgao} className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Assinatura do fornecedor (opcional)</span>
          <input name="assinaturaDoFornecedor" maxLength={120} defaultValue={valores.assinaturaDoFornecedor} className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>E-mail de contato (opcional)</span>
          <input name="contatoEmail" type="email" maxLength={120} defaultValue={valores.contatoEmail} className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Telefone (opcional)</span>
          <input name="contatoTelefone" maxLength={30} defaultValue={valores.contatoTelefone} className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Horário de atendimento (opcional)</span>
          <input name="horarioDeAtendimento" maxLength={120} defaultValue={valores.horarioDeAtendimento} className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Sítio institucional (https, opcional)</span>
          <input name="sitio" type="url" maxLength={200} defaultValue={valores.sitio} placeholder="https://" className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Tema</span>
          <select name="tema" defaultValue={valores.tema} className={CAMPO}>
            <option value="PADRAO">Padrão</option>
            <option value="ALTO_CONTRASTE">Alto contraste</option>
          </select>
        </label>
        <div className="text-xs">
          <label className="block">
            <span className={ROTULO}>Imagem institucional (PNG ou JPEG, até 256 KiB)</span>
            <input name="imagem" type="file" accept="image/png,image/jpeg" className="block w-full text-sm text-[color:var(--color-ink-2)]" />
          </label>
          {valores.temImagem ? (
            <label className="mt-2 flex items-center gap-2 text-xs text-[color:var(--color-ink-2)]">
              <input type="checkbox" name="manterImagem" defaultChecked />
              Manter a imagem atual quando nenhuma nova for enviada
            </label>
          ) : (
            <input type="hidden" name="manterImagem" value="off" />
          )}
          {valores.imagemHref !== null ? (
            // eslint-disable-next-line @next/next/no-img-element -- rota própria
            <img src={valores.imagemHref} alt="Imagem institucional vigente" className="mt-2 h-12 w-12 rounded-[var(--radius-md)] object-contain" />
          ) : null}
        </div>
        <fieldset className="text-xs sm:col-span-2">
          <legend className={ROTULO}>Canais públicos ativados</legend>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-[color:var(--color-ink-2)]">
              <input type="checkbox" name="canalTransparencia" defaultChecked={valores.canalTransparencia} />
              Transparência (demonstrativos em PDF)
            </label>
            <label className="flex items-center gap-2 text-sm text-[color:var(--color-ink-2)]">
              <input type="checkbox" name="canalConsultaPublica" defaultChecked={valores.canalConsultaPublica} />
              Acompanhar processo (consulta pelo requerente)
            </label>
          </div>
          <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">Portal do Servidor, Portal do Cidadão e Fornecedor aparecem aqui quando existirem.</p>
        </fieldset>
      </fieldset>

      {estado.erro !== undefined ? (
        <p role="alert" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">
          {estado.erro}
        </p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p role="status" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
          {estado.sucesso}
        </p>
      ) : null}

      {podeConfigurar ? (
        <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
          {pendente ? "Gravando…" : "Gravar nova versão"}
        </button>
      ) : null}
    </form>
  );
}
