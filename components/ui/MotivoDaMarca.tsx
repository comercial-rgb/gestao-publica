/**
 * O MOTIVO VISUAL DA MARCA ENGINE — para superfície grafite (a entrada do sistema).
 *
 * O manual pede, "com parcimônia, nunca competindo com o conteúdo": traços de circuito finos em laranja
 * a baixa opacidade no canto, a silhueta da engrenagem como marca d'água e um brilho laranja sutil no
 * canto inferior. A engrenagem é o símbolo oficial monocromático (`/marca/engine-simbolo-branco.svg`,
 * copiado sem alteração); os traços são linhas simples desenhadas aqui, sem pretensão de logotipo.
 *
 * É decoração: tudo `aria-hidden`, sem clique (`pointer-events-none`). O contêiner precisa de
 * `relative overflow-hidden`, e o conteúdo dele de `relative` para ficar por cima.
 */
export function MotivoDaMarca(): React.ReactElement {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" data-motivo-da-marca>
      {/* brilho laranja no canto inferior */}
      <div className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--color-engine)_22%,transparent),transparent_70%)]" />
      {/* a engrenagem oficial em marca d'água */}
      {/* eslint-disable-next-line @next/next/no-img-element -- ativo estático da marca, sem otimizador */}
      <img src="/marca/engine-simbolo-branco.svg" alt="" className="absolute -right-16 -bottom-16 h-64 w-64 opacity-[0.06]" />
      {/* traços de circuito no canto superior */}
      <svg viewBox="0 0 220 120" className="absolute top-0 right-0 h-28 w-52 opacity-[0.1]" fill="none" stroke="var(--color-engine)" strokeWidth="1.2">
        <path d="M220 18 H150 L132 36 H70" />
        <path d="M220 46 H170 L150 66 H96" />
        <path d="M200 0 V12 L178 34 V92" />
        <circle cx="70" cy="36" r="3" />
        <circle cx="96" cy="66" r="3" />
        <circle cx="178" cy="92" r="3" />
        <circle cx="150" cy="18" r="2" fill="var(--color-engine)" />
      </svg>
    </div>
  );
}
