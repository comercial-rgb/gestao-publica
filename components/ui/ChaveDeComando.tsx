"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * A CHAVE DE COMANDO DE UM FORMULÁRIO (orquestração V3, 4.3; sessão noturna V4, 3).
 *
 * Um campo oculto `__chave` que identifica UMA intenção: nasce no cliente depois da
 * hidratação (um `crypto.randomUUID()` no render do servidor e outro no do cliente
 * divergiriam e o React acusaria a hidratação) e é TROCADO a cada envio CONCLUÍDO —
 * sucesso ou erro. Enquanto o envio está pendente a chave é a mesma: o segundo clique, a
 * resposta perdida e o reenvio impaciente chegam ao servidor como O MESMO comando, e o
 * envelope responde sem repetir o fato ("em andamento" ou "já concluído"). Depois de um
 * erro de validação o operador corrige o campo e reenvia: é outra intenção, e vai com
 * outra chave — a mesma chave com outro conteúdo é CONFLITO no servidor.
 *
 * Auto-suficiente: lê o estado do próprio formulário por `useFormStatus`, sem prop. Vale
 * dentro de qualquer `<form action={serverAction}>`.
 *
 * Envio antes da hidratação (ou sem JavaScript) manda a chave vazia — e o servidor RECUSA
 * nomeando (`ComandoSemChaveError`): "recarregue e envie de novo". Não é silêncio.
 */
export function ChaveDeComando(): React.ReactElement {
  const { pending } = useFormStatus();
  const [chave, setChave] = useState("");
  const estavaPendente = useRef(false);

  useEffect(() => {
    setChave(crypto.randomUUID());
  }, []);

  useEffect(() => {
    if (estavaPendente.current && !pending) setChave(crypto.randomUUID());
    estavaPendente.current = pending;
  }, [pending]);

  return <input type="hidden" name="__chave" value={chave} data-chave-de-comando={chave === "" ? "pendente" : "pronta"} />;
}
