"use client";

import { useEffect, useState } from "react";

/**
 * A CHAVE DE COMANDO DE UM FORMULÁRIO (orquestração V3, 4.3).
 *
 * Um identificador por TENTATIVA: nasce no cliente depois da hidratação (o servidor
 * renderiza vazio — um `crypto.randomUUID()` no render do servidor e outro no do cliente
 * divergiriam e o React acusaria a hidratação) e é TROCADO a cada sucesso, para que o
 * próximo comando deliberado do mesmo formulário seja outro comando. Depois de um erro de
 * validação a chave fica: o operador corrige o campo e reenvia — o fingerprint muda e o
 * envelope o trata como comando novo; se reenvia IGUAL, é o mesmo comando, e o envelope
 * responde sem repetir o fato.
 *
 * Envio antes da hidratação (ou sem JavaScript) manda a chave vazia: sem replay, como
 * antes. Degradação declarada, não silêncio.
 */
export function useChaveDeComando(sucesso: string | undefined): string {
  const [chave, setChave] = useState("");
  useEffect(() => {
    setChave(crypto.randomUUID());
  }, [sucesso]);
  return chave;
}
