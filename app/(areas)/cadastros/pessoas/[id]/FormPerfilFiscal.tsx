"use client";

import { useActionState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../../components/ui/Formulario";
import { registrarPerfilFiscalAction, type EstadoPessoa } from "../actions";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";

/** Uma versão do perfil, como a página a passa (declarada aqui: ilha client não importa porta). */
export interface PerfilFiscalParaTela {
  readonly id: string;
  readonly vigenteDesde: string;
  readonly optanteSimplesNacional: boolean;
  readonly tributadoNoAnexoIVDoSimples: boolean;
  readonly contribuiSobreReceitaBruta: boolean;
  readonly dispensaDoIR: string | null;
  readonly municipioDoEstabelecimento: string | null;
  readonly fundamento: string;
  readonly criadoPor: string;
}

const sim = (b: boolean): string => (b ? "sim" : "não");

/**
 * DADOS FISCAIS PARA A RETENÇÃO NA FONTE (V24) — o que o cálculo do IR, do INSS e do ISS precisa saber
 * do fornecedor. Cada envio é uma versão nova, com data de vigência: o pagamento usa a versão vigente
 * na data dele, e as anteriores continuam valendo para os pagamentos de antes.
 */
export function FormPerfilFiscal({
  pessoaId,
  documento,
  perfis,
}: {
  readonly pessoaId: string;
  readonly documento: string;
  readonly perfis: readonly PerfilFiscalParaTela[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoPessoa, FormData>(registrarPerfilFiscalAction, {});
  const campo = "text-xs text-[color:var(--color-ink-2)]";

  return (
    <form action={action} data-acao="registrar-perfil-fiscal" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Dados fiscais para retenção na fonte</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        Usados no cálculo do IR, do INSS e do ISS retidos nos pagamentos a este fornecedor. Cada registro vale a partir da
        data informada; os anteriores ficam no histórico.
      </p>

      {perfis.length === 0 ? (
        <p className="mb-3 text-xs text-[color:var(--color-ink-2)]" data-perfil-fiscal="ausente">
          Nenhum dado fiscal registrado: o pagamento com retenção calculada a este fornecedor fica sem cálculo até o registro.
        </p>
      ) : (
        <table className="mb-4 w-full text-left text-xs" data-perfil-fiscal="historico">
          <thead>
            <tr className="text-[color:var(--color-ink-2)]">
              <th className="py-1 pr-2">Vale desde</th>
              <th className="py-1 pr-2">Simples Nacional</th>
              <th className="py-1 pr-2">Anexo IV</th>
              <th className="py-1 pr-2">Contribui sobre a receita bruta</th>
              <th className="py-1 pr-2">Dispensa do IR</th>
              <th className="py-1 pr-2">Município (IBGE)</th>
              <th className="py-1">Comprovação</th>
            </tr>
          </thead>
          <tbody>
            {perfis.map((p) => (
              <tr key={p.id} className="border-t border-[color:var(--color-border)] align-top">
                <td className="py-1 pr-2">{p.vigenteDesde}</td>
                <td className="py-1 pr-2">{sim(p.optanteSimplesNacional)}</td>
                <td className="py-1 pr-2">{sim(p.tributadoNoAnexoIVDoSimples)}</td>
                <td className="py-1 pr-2">{sim(p.contribuiSobreReceitaBruta)}</td>
                <td className="py-1 pr-2">{p.dispensaDoIR === null ? "nenhuma" : `art. 4º, ${p.dispensaDoIR}`}</td>
                <td className="py-1 pr-2">{p.municipioDoEstabelecimento ?? "não informado"}</td>
                <td className="py-1">
                  {p.fundamento} ({p.criadoPor})
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <input type="hidden" name="pessoaId" value={pessoaId} />
      <input type="hidden" name="documento" value={documento} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className={campo}>
          <span className={ROTULO}>Vale a partir de</span>
          <input name="vigenteDesde" type="date" required className={CAMPO} />
        </label>
        <label className={campo}>
          <span className={ROTULO}>Município do estabelecimento (código IBGE)</span>
          <input name="municipioDoEstabelecimento" inputMode="numeric" maxLength={7} placeholder="2506004" className={CAMPO} />
        </label>
        <label className={campo}>
          <span className={ROTULO}>Dispensa do IR declarada (inciso do art. 4º da IN RFB 1.234/2012)</span>
          <input name="dispensaDoIR" placeholder="vazio = sem dispensa; ex.: III" className={CAMPO} />
        </label>
        <label className={`${campo} flex items-center gap-2`}>
          <input type="checkbox" name="optanteSimplesNacional" />
          <span>Optante pelo Simples Nacional</span>
        </label>
        <label className={`${campo} flex items-center gap-2`}>
          <input type="checkbox" name="tributadoNoAnexoIVDoSimples" />
          <span>Tributado no Anexo IV do Simples</span>
        </label>
        <label className={`${campo} flex items-center gap-2`}>
          <input type="checkbox" name="contribuiSobreReceitaBruta" />
          <span>Contribui para a previdência sobre a receita bruta</span>
        </label>
        <label className={`${campo} sm:col-span-2 lg:col-span-3`}>
          <span className={ROTULO}>Comprovação (de onde vem a informação)</span>
          <input name="fundamento" required minLength={10} placeholder="Consulta ao Portal do Simples Nacional em 30/09/2026" className={CAMPO} />
        </label>
      </div>

      {estado.erro !== undefined ? (
        <p role="alert" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">
          {estado.erro}
        </p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p role="status" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
          {estado.sucesso}
        </p>
      ) : null}

      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Registrando…" : "Registrar dados fiscais"}
      </button>
    </form>
  );
}
