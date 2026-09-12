#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Regenera `catalogo-execucao.json` a partir da fonte oficial.

Entrada  : fonte/Termo_de_referencia.pdf
Saida    : catalogo-execucao.json
Validacao: resultado-auditoria.json (contagem por secao + total)

Escopo do catalogo (2.037 clausulas):
  - 5.8    caracteristicas gerais da aplicacao ............ 25
  - 5.9 a 5.47  modulos funcionais ......................  2.012

As condicoes de suporte, migracao, infraestrutura e contrato (secoes 4.x,
5.1 a 5.7, VI a XII) NAO entram aqui: vivem em
`condicoes-operacionais-e-contexto.json` e sao geradas por script proprio.

Uso:
    python3 gerar-catalogo.py
    python3 gerar-catalogo.py --validar-apenas
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
PDF = RAIZ / "fonte" / "Termo_de_referencia.pdf"
TXT = RAIZ / ".cache-tr-layout.txt"
SAIDA = RAIZ / "catalogo-execucao.json"
AUDITORIA = RAIZ / "resultado-auditoria.json"

# frente de entrega proposta por secao (MAPA-DE-LACUNAS.md)
FRENTE = {
    "5.8": "ENT02", "5.9": "ENT03", "5.10": "ENT03", "5.11": "ENT03",
    "5.12": "ENT04", "5.13": "ENT04", "5.14": "ENT04", "5.15": "ENT04",
    "5.16": "ENT04", "5.17": "ENT05", "5.18": "ENT05", "5.19": "ENT05",
    "5.20": "ENT05", "5.21": "ENT05", "5.22": "ENT09", "5.23": "ENT07",
    "5.24": "ENT07", "5.25": "ENT07", "5.26": "ENT07", "5.27": "ENT07",
    "5.28": "ENT07", "5.29": "ENT06", "5.30": "ENT06", "5.31": "ENT06",
    "5.32": "ENT06", "5.33": "ENT06", "5.34": "ENT06", "5.35": "ENT10",
    "5.36": "ENT10", "5.37": "ENT09", "5.38": "ENT09", "5.39": "ENT09",
    "5.40": "ENT09", "5.41": "ENT08", "5.42": "ENT02", "5.43": "ENT02",
    "5.44": "ENT10", "5.45": "ENT10", "5.46": "ENT10", "5.47": "ENT10",
}

# candidato de reaproveitamento no disco (MAPA-DE-LACUNAS.md secao 2)
CANDIDATO = {
    "5.8":  "siafic-cg:M16, siafic-cg:M12, packages/contracts",
    "5.9":  "siafic-cg:M02, siafic-cg:M03",
    "5.10": "siafic-cg:M01,M04,M05,M06,M07,M08,M12,M14,M17, packages/ofx",
    "5.11": "",
    "5.12": "saas-municipal:packages/folha-engine (outro ORM, exige reimplementacao Decimal)",
    "5.17": "siafic-cg:M11",
    "5.18": "siafic-cg:M10",
    "5.19": "siafic-cg:M10",
    "5.29": "siafic-cg:M20 (apenas importacao)",
    "5.34": "siafic-cg:M10 (apenas rotina contabil)",
    "5.38": "siafic-cg:M13 (datasets, sem portal)",
}

# o TR tem itens sem espaco apos o ponto final ("5.8.3.A solucao deve..."),
# por isso o separador e \s* e o texto precisa comecar em nao-espaco.
RE_ITEM = re.compile(r"^\s*(5\.\d+(?:\.\d+)+)\.?\s*(\S.*)$")
RE_SECAO = re.compile(r"^\s*(5\.\d+)\.\s+(.*)$")
RE_ALINEA = re.compile(r"^\s*([a-z])\)\s+(.*)$")


def extrair_texto() -> list[tuple[str, int]]:
    """Devolve [(linha, pagina_pdf)] preservando a paginacao do PDF."""
    if not PDF.exists():
        sys.exit(f"ERRO: fonte oficial ausente: {PDF}")
    if not TXT.exists():
        subprocess.run(
            ["pdftotext", "-layout", str(PDF), str(TXT)],
            check=True, capture_output=True,
        )
    bruto = TXT.read_text(encoding="utf-8")
    linhas: list[tuple[str, int]] = []
    pagina = 1
    for linha in bruto.split("\n"):
        # o form feed marca inicio de pagina e pode vir colado a linha
        quebras = linha.count("\f")
        if quebras:
            pagina += quebras
        linhas.append((linha.replace("\f", " "), pagina))
    return linhas


def limpar(txt: str) -> str:
    return re.sub(r"\s+", " ", txt.replace("\f", " ")).strip()


def eh_titulo(txt: str) -> bool:
    corpo = re.sub(r"[^A-Za-zÀ-Ú]", "", txt)
    if not corpo:
        return False
    return sum(1 for c in corpo if c.isupper()) / len(corpo) > 0.85 and len(txt) < 120


def hash_referencia(ident: str, texto: str) -> str:
    """SHA-256 de `id|texto normalizado`. Estavel entre execucoes."""
    norm = unicodedata.normalize("NFC", limpar(texto))
    return hashlib.sha256(f"{ident}|{norm}".encode("utf-8")).hexdigest()[:16]


def coletar() -> list[dict]:
    linhas = extrair_texto()

    # janela: do inicio de 5.8 ate 5.48 (obrigacoes da contratante)
    idx_ini = next(i for i, (l, _) in enumerate(linhas)
                   if "CARACTERÍSTICAS GERAIS DA APLICAÇÃO" in l)
    idx_fim = next(i for i, (l, _) in enumerate(linhas)
                   if "OBRIGAÇÕES DA CONTRATANTE" in l)
    linhas = linhas[idx_ini:idx_fim]

    registros: list[dict] = []
    secao = submodulo = ""
    atual: dict | None = None

    def fechar():
        nonlocal atual
        if atual:
            atual["texto"] = limpar(atual["texto"])
            if len(atual["texto"]) > 3:
                registros.append(atual)
        atual = None

    for linha, pagina in linhas:
        if not linha.strip():
            continue

        m_secao = RE_SECAO.match(linha)
        if m_secao and eh_titulo(m_secao.group(2)):
            fechar()
            secao, submodulo = m_secao.group(1), ""
            continue

        m_item = RE_ITEM.match(linha)
        if m_item:
            ident, resto = m_item.group(1), m_item.group(2)
            partes = ident.split(".")
            if len(partes) == 3 and eh_titulo(resto):
                fechar()
                submodulo = f"{ident}. {limpar(resto)}"
                continue
            fechar()
            atual = {
                "id": ident,
                "secao": ".".join(partes[:2]),
                "submodulo": submodulo,
                "texto": resto,
                "pagina_pdf": pagina,
            }
            continue

        m_alinea = RE_ALINEA.match(linha)
        if m_alinea and atual:
            atual["texto"] += f" [{m_alinea.group(1)}] {m_alinea.group(2)}"
            continue

        if atual:
            atual["texto"] += " " + linha.strip()

    fechar()
    return registros


def montar(registros: list[dict]) -> dict:
    clausulas = []
    for r in registros:
        sec = r["secao"]
        clausulas.append({
            "id": r["id"],
            "secao": sec,
            "submodulo": r["submodulo"],
            "texto": r["texto"],
            "pagina_pdf": r["pagina_pdf"],
            "hash_referencia": hash_referencia(r["id"], r["texto"]),
            "frente": FRENTE.get(sec, ""),
            "candidato_reaproveitamento": CANDIDATO.get(sec, ""),
            "destino_proposto": "",
            "rota_verificada": "",
            "evidencia": "",
            "situacao": "NAO_VERIFICADO",
        })
    return {
        "versao": 1,
        "fonte": {
            "arquivo": PDF.name,
            "sha256": hashlib.sha256(PDF.read_bytes()).hexdigest(),
            "extracao": "pdftotext -layout",
            "observacao": (
                "pagina_pdf e a pagina fisica do PDF; a numeracao impressa no "
                "rodape do documento nao coincide com ela."
            ),
        },
        "escopo": (
            "Caracteristicas gerais (5.8) e modulos funcionais (5.9 a 5.47). "
            "Condicoes de suporte, migracao, infraestrutura e contrato ficam em "
            "condicoes-operacionais-e-contexto.json."
        ),
        "situacoes_validas": [
            "NAO_VERIFICADO", "AUSENTE_CONFIRMADO", "PARCIAL",
            "IMPLEMENTADO_NAO_VALIDADO", "VALIDADO_LOCALMENTE",
            "DEPENDENCIA_EXTERNA",
        ],
        "aviso": (
            "Nenhuma clausula muda de situacao por este arquivo. "
            "Comentario de rastreio no codigo nao comprova atendimento."
        ),
        "total": len(clausulas),
        "clausulas": clausulas,
    }


def validar(catalogo: dict) -> int:
    if not AUDITORIA.exists():
        print("AVISO: resultado-auditoria.json ausente; validacao cruzada pulada.")
        return 0
    esperado = json.loads(AUDITORIA.read_text(encoding="utf-8"))
    alvo = esperado["catalogo_vs_indice"]["quantidade_por_secao"]
    total_alvo = esperado["catalogo_vs_indice"]["clausulas"]

    obtido: dict[str, int] = {}
    for c in catalogo["clausulas"]:
        obtido[c["secao"]] = obtido.get(c["secao"], 0) + 1

    falhas = []
    for sec, qtd in sorted(alvo.items(), key=lambda kv: float(kv[0][2:])):
        tem = obtido.get(sec, 0)
        if tem != qtd:
            falhas.append(f"  {sec}: esperado {qtd}, obtido {tem}")
    for sec in obtido:
        if sec not in alvo:
            falhas.append(f"  {sec}: secao inesperada ({obtido[sec]} clausulas)")

    ids = [c["id"] for c in catalogo["clausulas"]]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        falhas.append(f"  ids duplicados: {sorted(dup)}")
    if catalogo["total"] != total_alvo:
        falhas.append(f"  total: esperado {total_alvo}, obtido {catalogo['total']}")

    if falhas:
        print("VALIDACAO REPROVADA")
        print("\n".join(falhas))
        return 1
    print(f"VALIDACAO APROVADA: {catalogo['total']} clausulas, "
          f"{len(alvo)} secoes, contagem identica ao resultado-auditoria.json")
    return 0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--validar-apenas", action="store_true")
    args = ap.parse_args()

    catalogo = montar(coletar())
    codigo = validar(catalogo)
    if codigo:
        sys.exit(codigo)
    if not args.validar_apenas:
        SAIDA.write_text(
            json.dumps(catalogo, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"gravado: {SAIDA.name} ({SAIDA.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
