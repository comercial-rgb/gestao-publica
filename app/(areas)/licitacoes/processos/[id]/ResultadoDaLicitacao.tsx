"use client";

import { useActionState, useState } from "react";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_PAINEL_FORMULARIO as PAINEL, CLASSE_ROTULO as ROTULO } from "../../../../../components/ui/Formulario";
import { diaCivilBr } from "../../../../../packages/datas/index.js";
import { Decimal } from "../../../../../packages/contracts/index.js";
import type { QuadroNaTela } from "../../../../../lib/portas/resultado-da-licitacao";
import {
  adjudicarAction,
  cadastrarItemAction,
  contratoDaAtaAction,
  contratoDoResultadoAction,
  homologarAction,
  registrarAtaAction,
  registrarPropostaAction,
  registrarResultadoAction,
  vincularParticipanteAction,
  type EstadoDoResultado,
} from "./resultado-actions";

/**
 * V39-R2 (R2-014 a 020) — DO PROCESSO AO CONTRATO, NA PÁGINA DO PROCESSO: itens, participantes, propostas, o ato do
 * resultado, adjudicação, homologação por ato (com correção), o contrato originado do resultado, a ata de registro de
 * preços e o contrato da ata. As propostas aparecem ordenadas pelo valor só para leitura: o vencedor é escolhido no ato,
 * nunca pelo sistema. Cada formulário só aparece para quem pode praticar o ato; o servidor confere de novo.
 */

type Item = QuadroNaTela["itens"][number];
/** Decimal em texto ("1234.5000") para a tela ("1.234,50"): pelo texto, sem passar por número de ponto flutuante. */
function n4(v: string): string {
  const neg = v.startsWith("-");
  const [inteiro = "0", dec = ""] = (neg ? v.slice(1) : v).split(".");
  const casas = dec.replace(/0+$/, "").padEnd(2, "0");
  return `${neg ? "-" : ""}${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${casas}`;
}
const SITUACAO: Readonly<Record<string, string>> = { VENCEDOR: "vencedor", FRACASSADO: "fracassado", DESERTO: "deserto" };
const CATEGORIAS = [
  { valor: "FORNECIMENTO_BENS", rotulo: "Fornecimento de bens" },
  { valor: "LOCACAO", rotulo: "Locação" },
  { valor: "PRESTACAO_SERVICOS", rotulo: "Prestação de serviços" },
  { valor: "REALIZACAO_OBRAS", rotulo: "Realização de obras" },
];

function Resultado({ estado, acao }: { readonly estado: EstadoDoResultado; readonly acao: string }): React.ReactElement | null {
  if (estado.erro !== undefined) return <p role="alert" data-resultado-da-acao={acao} className="mt-2 whitespace-pre-line text-xs text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>;
  if (estado.sucesso !== undefined) return <p role="status" data-resultado-da-acao={acao} className="mt-2 text-xs text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>;
  return null;
}

function Ato({ titulo, acao, action, processoId, children, botao }: { readonly titulo: string; readonly acao: string; readonly action: (p: EstadoDoResultado, f: FormData) => Promise<EstadoDoResultado>; readonly processoId: string; readonly children: React.ReactNode; readonly botao: string }): React.ReactElement {
  const [estado, disparar, pendente] = useActionState<EstadoDoResultado, FormData>(action, {});
  return (
    <details className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
      <summary className="cursor-pointer text-sm font-medium text-[color:var(--color-primary)]">{titulo}</summary>
      <form action={disparar} data-acao={acao} className="mt-3 space-y-3" aria-label={titulo}>
        <ChaveDeComando />
        <input type="hidden" name="processoId" value={processoId} />
        {children}
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Gravando…" : botao}</button>
        <Resultado estado={estado} acao={acao} />
      </form>
    </details>
  );
}

function Campo({ rotulo, children, largo = false }: { readonly rotulo: string; readonly children: React.ReactNode; readonly largo?: boolean }): React.ReactElement {
  return (
    <label className={`text-xs ${largo ? "sm:col-span-2" : ""}`}>
      <span className={ROTULO}>{rotulo}</span>
      {children}
    </label>
  );
}

function DadosDoContrato(): React.ReactElement {
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <Campo rotulo="Número do contrato"><input name="numeroContrato" required maxLength={40} className={CAMPO} /></Campo>
      <Campo rotulo="Início da vigência"><input name="vigenciaInicio" type="date" required className={CAMPO} /></Campo>
      <Campo rotulo="Fim da vigência"><input name="vigenciaFimInicial" type="date" required className={CAMPO} /></Campo>
      <Campo rotulo="Categoria (ordem cronológica)">
        <select name="categoriaOrdemCronologica" required defaultValue="" className={CAMPO}>
          <option value="">Escolha…</option>
          {CATEGORIAS.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
        </select>
      </Campo>
    </div>
  );
}

function FormProposta({ q, processoId }: { readonly q: QuadroNaTela; readonly processoId: string }): React.ReactElement {
  const [abrangencia, setAbrangencia] = useState<"ITEM" | "LOTE">("ITEM");
  const [numero, setNumero] = useState("");
  const alvo: readonly Item[] = numero === "" ? [] : abrangencia === "ITEM" ? q.itens.filter((i) => String(i.numero) === numero) : q.itens.filter((i) => String(i.lote ?? "") === numero);
  return (
    <Ato titulo="Registrar proposta" acao="registrar-proposta" action={registrarPropostaAction} processoId={processoId} botao="Registrar proposta">
      <div className="grid gap-3 sm:grid-cols-4">
        <Campo rotulo="Participante">
          <select name="participanteId" required defaultValue="" className={CAMPO}>
            <option value="">Escolha…</option>
            {q.participantes.map((p) => <option key={p.id} value={p.id}>{p.nome} ({p.documento})</option>)}
          </select>
        </Campo>
        <Campo rotulo="Abrangência">
          <select name="abrangencia" value={abrangencia} onChange={(e) => { setAbrangencia(e.target.value as "ITEM" | "LOTE"); setNumero(""); }} className={CAMPO}>
            <option value="ITEM">Um item</option>
            <option value="LOTE">Um lote inteiro</option>
          </select>
        </Campo>
        <Campo rotulo={abrangencia === "ITEM" ? "Número do item" : "Número do lote"}>
          <input value={numero} onChange={(e) => setNumero(e.target.value.trim())} inputMode="numeric" className={CAMPO} data-numero-da-proposta />
        </Campo>
        <Campo rotulo="Documento da proposta"><input name="documento" required minLength={3} className={CAMPO} placeholder="Proposta pelo sistema de compras, protocolo" /></Campo>
      </div>
      {alvo.length === 0 && numero !== "" ? <p className="text-xs text-[color:var(--color-status-erro-fg)]">Nenhum {abrangencia === "ITEM" ? "item" : "lote"} com esse número neste processo.</p> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        {alvo.map((i) => (
          <Campo key={i.id} rotulo={`Item ${String(i.numero)} — ${i.descricao}: valor unitário (R$)`}>
            <input name={`valor_${i.id}`} required inputMode="decimal" placeholder="0,00" className={CAMPO} />
          </Campo>
        ))}
      </div>
      <Campo rotulo="Motivo (obrigatório quando corrige proposta já registrada)" largo><input name="motivo" maxLength={500} className={CAMPO} /></Campo>
    </Ato>
  );
}

function FormResultado({ q, processoId }: { readonly q: QuadroNaTela; readonly processoId: string }): React.ReactElement {
  const julgaveis = q.itens.filter((i) => i.adjudicado === null);
  return (
    <Ato titulo="Registrar o resultado (julgamento)" acao="registrar-resultado" action={registrarResultadoAction} processoId={processoId} botao="Registrar resultado">
      <div className="grid gap-3 sm:grid-cols-4">
        <Campo rotulo="Data do ato"><input name="data" type="date" required className={CAMPO} /></Campo>
        <Campo rotulo="Critério de julgamento">
          <select name="criterio" required defaultValue="" className={CAMPO}>
            <option value="">Escolha…</option>
            {q.criterios.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
          </select>
        </Campo>
        <Campo rotulo="Fundamento"><input name="fundamento" required minLength={10} className={CAMPO} placeholder="Ata da sessão, edital" /></Campo>
        <Campo rotulo="Documento"><input name="documento" required minLength={3} className={CAMPO} /></Campo>
      </div>
      <p className="text-xs text-[color:var(--color-ink-2)]">Para cada item deste ato, escolha a situação. Item sem situação fica fora do ato. Item já julgado é corrigido: a decisão anterior continua no histórico.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] text-left text-xs">
          <caption className="sr-only">Itens a julgar</caption>
          <thead><tr><th scope="col" className="pr-2">Item</th><th scope="col" className="pr-2">Situação</th><th scope="col" className="pr-2">Vencedor</th><th scope="col" className="pr-2">Valor unitário final (R$)</th><th scope="col">Justificativa</th></tr></thead>
          <tbody>
            {julgaveis.map((i) => (
              <tr key={i.id} className="border-t border-[color:var(--color-border)] align-top" data-item-a-julgar={i.numero}>
                <td className="py-1 pr-2">{i.numero}{i.lote !== null ? ` (lote ${String(i.lote)})` : ""} — {i.descricao}</td>
                <td className="py-1 pr-2">
                  <select name={`situacao_${i.id}`} defaultValue="" aria-label={`Situação do item ${String(i.numero)}`} className={CAMPO}>
                    <option value="">Fora deste ato</option>
                    <option value="VENCEDOR">Vencedor</option>
                    <option value="FRACASSADO">Fracassado</option>
                    <option value="DESERTO">Deserto</option>
                  </select>
                </td>
                <td className="py-1 pr-2">
                  <select name={`participante_${i.id}`} defaultValue="" aria-label={`Vencedor do item ${String(i.numero)}`} className={CAMPO}>
                    <option value="">—</option>
                    {i.propostas.map((p) => <option key={p.participanteId} value={p.participanteId}>{p.participante} (proposta {n4(p.valorUnitario)})</option>)}
                  </select>
                </td>
                <td className="py-1 pr-2"><input name={`valorfinal_${i.id}`} inputMode="decimal" aria-label={`Valor unitário final do item ${String(i.numero)}`} className={CAMPO} /></td>
                <td className="py-1"><input name={`justificativa_${i.id}`} maxLength={500} aria-label={`Justificativa do item ${String(i.numero)}`} className={CAMPO} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Ato>
  );
}

function FormAdjudicar({ q, processoId }: { readonly q: QuadroNaTela; readonly processoId: string }): React.ReactElement {
  const vencidos = q.itens.filter((i) => i.resultado?.situacao === "VENCEDOR" && i.adjudicado === null);
  return (
    <Ato titulo="Adjudicar" acao="adjudicar" action={adjudicarAction} processoId={processoId} botao="Registrar adjudicação">
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Data do ato"><input name="data" type="date" required className={CAMPO} /></Campo>
        <Campo rotulo="Autoridade"><input name="autoridade" required minLength={3} className={CAMPO} /></Campo>
        <Campo rotulo="Documento"><input name="documento" required minLength={3} className={CAMPO} /></Campo>
      </div>
      <fieldset className="text-xs">
        <legend className={ROTULO}>Itens que o ato adjudica</legend>
        {vencidos.length === 0 ? <p className="text-[color:var(--color-ink-3)]">Nenhum item vencido aguardando adjudicação.</p> : null}
        {vencidos.map((i) => (
          <label key={i.id} className="mr-4 inline-flex items-center gap-1">
            <input type="checkbox" name="linha" value={i.resultado!.id} /> Item {i.numero} — {i.resultado!.participante} a {n4(i.resultado!.valorUnitario ?? "0")}
          </label>
        ))}
      </fieldset>
    </Ato>
  );
}

function FormHomologar({ q, processoId }: { readonly q: QuadroNaTela; readonly processoId: string }): React.ReactElement {
  const adjudicados = q.itens.filter((i) => i.adjudicado !== null);
  const vigentes = q.atos.filter((a) => !a.corrigido);
  return (
    <Ato titulo="Homologar por ato (ou corrigir um ato)" acao="homologar-por-ato" action={homologarAction} processoId={processoId} botao="Registrar homologação">
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Data do ato"><input name="data" type="date" required className={CAMPO} /></Campo>
        <Campo rotulo="Autoridade"><input name="autoridade" required minLength={3} className={CAMPO} /></Campo>
        <Campo rotulo="Documento"><input name="documento" required minLength={3} className={CAMPO} /></Campo>
      </div>
      <fieldset className="text-xs">
        <legend className={ROTULO}>Itens que o ato homologa</legend>
        {adjudicados.map((i) => (
          <label key={i.id} className="mr-4 inline-flex items-center gap-1">
            <input type="checkbox" name="adjudicado" value={i.adjudicado!.id} /> Item {i.numero}{i.homologado !== null ? " (já homologado)" : ""}
          </label>
        ))}
      </fieldset>
      {vigentes.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Corrige o ato (deixe em branco para um ato novo)">
            <select name="corrigeId" defaultValue="" className={CAMPO}>
              <option value="">Não: ato novo</option>
              {vigentes.map((a) => <option key={a.id} value={a.id}>{diaCivilBr(new Date(a.data))} — {a.documento} (itens {a.itens.join(", ")})</option>)}
            </select>
          </Campo>
          <Campo rotulo="Motivo da correção"><input name="motivo" maxLength={500} className={CAMPO} /></Campo>
        </div>
      ) : null}
    </Ato>
  );
}

function FormContratoDoResultado({ q, processoId }: { readonly q: QuadroNaTela; readonly processoId: string }): React.ReactElement {
  const homologados = q.itens.filter((i) => i.homologado !== null && i.resultado?.situacao === "VENCEDOR" && new Decimal(i.registradoEmAta).isZero());
  const vencedores = q.participantes.filter((p) => homologados.some((i) => i.resultado?.participanteId === p.id));
  return (
    <Ato titulo="Cadastrar contrato a partir do resultado" acao="contrato-do-resultado" action={contratoDoResultadoAction} processoId={processoId} botao="Cadastrar contrato">
      <Campo rotulo="Contratado (vencedor)">
        <select name="participanteId" required defaultValue="" className={CAMPO}>
          <option value="">Escolha…</option>
          {vencedores.map((p) => <option key={p.id} value={p.id}>{p.nome} ({p.documento})</option>)}
        </select>
      </Campo>
      <p className="text-xs text-[color:var(--color-ink-2)]">Informe a quantidade dos itens que o contrato leva; descrição, unidade e preço vêm do resultado.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {homologados.map((i) => (
          <Campo key={i.id} rotulo={`Item ${String(i.numero)} — ${i.descricao} (${i.resultado!.participante}; resta ${n4(new Decimal(i.quantidade).minus(i.contratadoDireto).toFixed(4))} ${i.unidade})`}>
            <input name={`qtd_${i.resultado!.id}`} inputMode="decimal" className={CAMPO} />
          </Campo>
        ))}
      </div>
      <DadosDoContrato />
    </Ato>
  );
}

function FormAta({ q, processoId }: { readonly q: QuadroNaTela; readonly processoId: string }): React.ReactElement {
  const homologados = q.itens.filter((i) => i.homologado !== null && i.resultado?.situacao === "VENCEDOR");
  return (
    <Ato titulo="Registrar ata de registro de preços" acao="registrar-ata" action={registrarAtaAction} processoId={processoId} botao="Registrar ata">
      <div className="grid gap-3 sm:grid-cols-4">
        <Campo rotulo="Número da ata"><input name="numero" required maxLength={40} className={CAMPO} /></Campo>
        <Campo rotulo="Início da vigência"><input name="vigenciaInicio" type="date" required className={CAMPO} /></Campo>
        <Campo rotulo="Fim da vigência"><input name="vigenciaFim" type="date" required className={CAMPO} /></Campo>
        <Campo rotulo="Documento"><input name="documento" required minLength={3} className={CAMPO} /></Campo>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {homologados.map((i) => (
          <Campo key={i.id} rotulo={`Item ${String(i.numero)} — ${i.descricao} (${i.resultado!.participante}): quantidade registrada`}>
            <input name={`qtdata_${i.resultado!.id}`} inputMode="decimal" className={CAMPO} />
          </Campo>
        ))}
      </div>
    </Ato>
  );
}

function FormContratoDaAta({ q, processoId }: { readonly q: QuadroNaTela; readonly processoId: string }): React.ReactElement {
  const [ataId, setAtaId] = useState("");
  const ata = q.atas.find((a) => a.id === ataId);
  const fornecedores = ata === undefined ? [] : [...new Map(ata.itens.map((i) => [i.participanteId, i.fornecedor])).entries()];
  return (
    <Ato titulo="Cadastrar contrato pela ata" acao="contrato-da-ata" action={contratoDaAtaAction} processoId={processoId} botao="Cadastrar contrato">
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Ata">
          <select name="ataId" required value={ataId} onChange={(e) => setAtaId(e.target.value)} className={CAMPO}>
            <option value="">Escolha…</option>
            {q.atas.map((a) => <option key={a.id} value={a.id}>{a.numero} ({diaCivilBr(new Date(a.vigenciaInicio))} a {diaCivilBr(new Date(a.vigenciaFim))})</option>)}
          </select>
        </Campo>
        <Campo rotulo="Fornecedor">
          <select name="participanteId" required defaultValue="" className={CAMPO}>
            <option value="">Escolha…</option>
            {fornecedores.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
        </Campo>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(ata?.itens ?? []).map((i) => (
          <Campo key={i.id} rotulo={`Item ${String(i.item)} — ${i.descricao} (saldo da ata ${n4(i.saldo)} ${i.unidade})`}>
            <input name={`qtdcontratoata_${i.id}`} inputMode="decimal" className={CAMPO} />
          </Campo>
        ))}
      </div>
      <DadosDoContrato />
    </Ato>
  );
}

export function ResultadoDaLicitacao({ q, processoId }: { readonly q: QuadroNaTela; readonly processoId: string }): React.ReactElement {
  return (
    <section className={PAINEL} aria-label="Itens, propostas e resultado" data-resultado-da-licitacao>
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Itens, propostas e resultado</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        As propostas aparecem pelo valor, só para leitura: quem vence cada item é decidido no ato do resultado, com o critério de julgamento e, quando o escolhido não é o de melhor valor, a justificativa.
      </p>
      {q.itens.length === 0 ? (
        <p className="text-xs text-[color:var(--color-ink-3)]">Nenhum item cadastrado neste processo.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left text-xs" data-quadro-do-resultado>
            <caption className="sr-only">Itens do processo</caption>
            <thead>
              <tr className="text-[color:var(--color-ink-2)]">
                <th scope="col" className="pr-2">Item</th><th scope="col" className="pr-2">Quantidade</th><th scope="col" className="pr-2">Propostas vigentes</th>
                <th scope="col" className="pr-2">Resultado</th><th scope="col" className="pr-2">Adjudicação</th><th scope="col" className="pr-2">Homologação</th><th scope="col">Contratado / em ata</th>
              </tr>
            </thead>
            <tbody>
              {q.itens.map((i) => (
                <tr key={i.id} className="border-t border-[color:var(--color-border)] align-top" data-item-do-processo={i.numero} data-situacao={i.resultado?.situacao ?? ""}>
                  <td className="py-1 pr-2">{i.numero}{i.lote !== null ? ` (lote ${String(i.lote)})` : ""} — {i.descricao}</td>
                  <td className="py-1 pr-2">{n4(i.quantidade)} {i.unidade}</td>
                  <td className="py-1 pr-2">
                    {[...i.propostas].sort((a, b) => new Decimal(a.valorUnitario).comparedTo(b.valorUnitario)).map((p) => (
                      <span key={p.participanteId} className="block">{p.participante}: {n4(p.valorUnitario)}{p.versao > 1 ? ` (versão ${String(p.versao)})` : ""}</span>
                    ))}
                  </td>
                  <td className="py-1 pr-2">
                    {i.resultado === null ? "—" : i.resultado.situacao === "VENCEDOR" ? `${i.resultado.participante ?? ""} a ${n4(i.resultado.valorUnitario ?? "0")}` : SITUACAO[i.resultado.situacao]}
                    {i.resultado?.corrigido === true ? <span className="block text-[color:var(--color-ink-3)]">corrigido por ato posterior</span> : null}
                  </td>
                  <td className="py-1 pr-2">{i.adjudicado === null ? "—" : diaCivilBr(new Date(i.adjudicado.data))}</td>
                  <td className="py-1 pr-2">{i.homologado === null ? "—" : diaCivilBr(new Date(i.homologado.data))}</td>
                  <td className="py-1">{n4(i.contratadoDireto)} / {n4(i.registradoEmAta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {q.atos.length > 0 ? (
        <div className="mt-3 text-xs" data-atos-de-homologacao>
          <h3 className="font-semibold">Atos de homologação</h3>
          {q.atos.map((a) => (
            <p key={a.id} data-ato-corrigido={a.corrigido ? "sim" : "nao"}>
              {diaCivilBr(new Date(a.data))} — {a.documento} ({a.autoridade}), itens {a.itens.join(", ")}
              {a.corrigeId !== null ? ` — corrige ato anterior: ${a.motivo ?? ""}` : ""}
              {a.corrigido ? " — corrigido por ato posterior" : ""}
            </p>
          ))}
        </div>
      ) : null}
      {q.atas.length > 0 ? (
        <div className="mt-3 overflow-x-auto text-xs" data-atas-de-registro>
          <h3 className="font-semibold">Atas de registro de preços</h3>
          <p className="text-[color:var(--color-ink-2)]">O saldo da ata é o registrado menos o contratado por ela. Não se confunde com o saldo do contrato (valor menos o empenhado) nem com o da dotação.</p>
          <table className="w-full min-w-[40rem] text-left">
            <caption className="sr-only">Itens das atas</caption>
            <thead><tr><th scope="col" className="pr-2">Ata</th><th scope="col" className="pr-2">Item</th><th scope="col" className="pr-2">Fornecedor</th><th scope="col" className="pr-2">Preço</th><th scope="col" className="pr-2">Registrado</th><th scope="col" className="pr-2">Contratado</th><th scope="col">Saldo da ata</th></tr></thead>
            <tbody>
              {q.atas.flatMap((a) => a.itens.map((i) => (
                <tr key={i.id} className="border-t border-[color:var(--color-border)]" data-saldo-da-ata={`${a.numero}|${String(i.item)}|${i.saldo}|${i.saldoEmReais}`}>
                  <td className="pr-2">{a.numero}</td><td className="pr-2">{i.item} — {i.descricao}</td><td className="pr-2">{i.fornecedor}</td><td className="pr-2">{n4(i.valorUnitario)}</td>
                  <td className="pr-2">{n4(i.registrado)}</td><td className="pr-2">{n4(i.contratado)}</td><td>{n4(i.saldo)} {i.unidade} (R$ {n4(i.saldoEmReais)})</td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="mt-4 space-y-2">
        {q.pode.cadastrar ? (
          <>
            <Ato titulo="Cadastrar item do processo" acao="cadastrar-item-do-processo" action={cadastrarItemAction} processoId={processoId} botao="Cadastrar item">
              <div className="grid gap-3 sm:grid-cols-5">
                <Campo rotulo="Número do item"><input name="numero" required inputMode="numeric" className={CAMPO} /></Campo>
                <Campo rotulo="Lote (vazio: julgamento por item)"><input name="lote" inputMode="numeric" className={CAMPO} /></Campo>
                <Campo rotulo="Descrição" largo><input name="descricao" required minLength={3} className={CAMPO} /></Campo>
                <Campo rotulo="Unidade"><input name="unidade" required maxLength={20} className={CAMPO} /></Campo>
                <Campo rotulo="Quantidade"><input name="quantidade" required inputMode="decimal" className={CAMPO} /></Campo>
              </div>
            </Ato>
            <Ato titulo="Vincular participante" acao="vincular-participante" action={vincularParticipanteAction} processoId={processoId} botao="Vincular">
              <Campo rotulo="CPF ou CNPJ (do cadastro de pessoas)"><input name="documento" required className={CAMPO} /></Campo>
            </Ato>
            {q.itens.length > 0 && q.participantes.length > 0 ? <FormProposta q={q} processoId={processoId} /> : null}
          </>
        ) : null}
        {q.pode.julgar && q.itens.length > 0 ? <FormResultado q={q} processoId={processoId} /> : null}
        {q.pode.adjudicar ? <FormAdjudicar q={q} processoId={processoId} /> : null}
        {q.pode.homologar && q.itens.some((i) => i.adjudicado !== null) ? <FormHomologar q={q} processoId={processoId} /> : null}
        {q.pode.contratar && q.itens.some((i) => i.homologado !== null) ? (
          <>
            <FormContratoDoResultado q={q} processoId={processoId} />
            <FormAta q={q} processoId={processoId} />
            {q.atas.length > 0 ? <FormContratoDaAta q={q} processoId={processoId} /> : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
