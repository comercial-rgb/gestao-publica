#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Gera `condicoes-operacionais-e-contexto.json`.

Preserva o que NAO e clausula funcional de modulo e, por isso, fica fora do
`catalogo-execucao.json` — mas continua sendo obrigacao do documento:

  IV       requisitos da contratacao, prova de conceito, orgaos de controle,
           propriedade e portabilidade dos dados
  5.1-5.7  migracao, implantacao, treinamento, suporte e SLA, manutencao,
           servicos de demanda variavel, data center e protecao de dados
  VI-XII   gestao do contrato, medicao e pagamento, selecao, valores,
           adequacao orcamentaria, locais de execucao

Estas condicoes nao viram tela. Viram infraestrutura, contrato, processo de
operacao e evidencia documental. Marcar uma delas como atendida exige o
artefato correspondente — nao inventar tela para evidenciar backup.

Uso:
    python3 gerar-condicoes.py
"""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
PDF = RAIZ / "fonte" / "Termo_de_referencia.pdf"
TXT = RAIZ / ".cache-tr-layout.txt"
SAIDA = RAIZ / "condicoes-operacionais-e-contexto.json"

RE_ITEM = re.compile(r"^\s*(\d+\.\d+(?:\.\d+)*)\.?\s*(\S.*)$")
RE_ALINEA = re.compile(r"^\s*([a-z])\)\s+(.*)$")

# natureza da evidencia exigida por bloco: define o que prova atendimento
NATUREZA = {
    "4":  ("CONTRATUAL_E_PROCESSO",
           "Prova de conceito, prazos de orgao de controle, propriedade e "
           "portabilidade dos dados. Evidencia: rotina de exportacao integral, "
           "dicionario de dados e registro de processo."),
    "5.1": ("MIGRACAO",
            "Evidencia: inventario das bases de origem, dicionario de destino, "
            "regras de transformacao com dono confirmado e reconciliacao."),
    "5.2": ("PROCESSO", "Evidencia: ordem de servico, aceite formal e ata."),
    "5.3": ("PROCESSO", "Evidencia: plano, execucao e avaliacao do treinamento."),
    "5.4": ("OPERACAO",
            "Portal de chamados, severidades configuradas e pesquisa de "
            "satisfacao sao software; disponibilidade da central e operacao."),
    "5.5": ("CONTRATUAL", "Manutencao corretiva, legal e evolutiva."),
    "5.6": ("CONTRATUAL", "Servicos tecnicos de demanda variavel por hora."),
    "5.7": ("INFRAESTRUTURA",
            "Data center, alta disponibilidade, criptografia, backup e "
            "recuperacao. Evidencia: arquitetura, certificacoes do provedor, "
            "medicao de disponibilidade e teste de restauracao documentado."),
    "6":  ("CONTRATUAL", "Gestao e fiscalizacao do contrato."),
    "7":  ("CONTRATUAL", "Criterios de medicao, recebimento e pagamento."),
    "8":  ("CONTRATUAL", "Forma e criterios de selecao do fornecedor."),
    "9":  ("CONTRATUAL", "Valores da contratacao."),
    "10": ("CONTRATUAL", "Adequacao orcamentaria."),
    "11": ("CONTRATUAL", "Especificacao do produto e catalogo eletronico."),
    "12": ("CONTRATUAL", "Locais de execucao."),
}


def natureza_de(ident: str) -> tuple[str, str]:
    for prefixo in (".".join(ident.split(".")[:2]), ident.split(".")[0]):
        if prefixo in NATUREZA:
            return NATUREZA[prefixo]
    return ("NAO_CLASSIFICADO", "Classificar ao entrar no lote.")


def limpar(txt: str) -> str:
    return re.sub(r"\s+", " ", txt.replace("\f", " ")).strip()


def main() -> None:
    if not PDF.exists():
        sys.exit(f"ERRO: fonte oficial ausente: {PDF}")
    if not TXT.exists():
        subprocess.run(["pdftotext", "-layout", str(PDF), str(TXT)],
                       check=True, capture_output=True)

    linhas, pagina = [], 1
    for linha in TXT.read_text(encoding="utf-8").split("\n"):
        pagina += linha.count("\f")
        linhas.append((linha.replace("\f", " "), pagina))

    # duas janelas: do item 4.1 ate 5.8, e de 5.48 ate o fim
    i_ini = next(i for i, (l, _) in enumerate(linhas)
                 if l.strip().startswith("4.1."))
    i_corte = next(i for i, (l, _) in enumerate(linhas)
                   if "CARACTERÍSTICAS GERAIS DA APLICAÇÃO" in l)
    i_ret = next(i for i, (l, _) in enumerate(linhas)
                 if "OBRIGAÇÕES DA CONTRATANTE" in l)

    janela = linhas[i_ini:i_corte] + linhas[i_ret:]

    registros, atual = [], None

    def fechar():
        nonlocal atual
        if atual:
            atual["texto"] = limpar(atual["texto"])
            if len(atual["texto"]) > 3:
                registros.append(atual)
        atual = None

    for linha, pag in janela:
        if not linha.strip():
            continue
        m = RE_ITEM.match(linha)
        if m and not m.group(1).startswith("5.8."):
            fechar()
            ident = m.group(1)
            nat, obs = natureza_de(ident)
            atual = {
                "id": ident,
                "texto": m.group(2),
                "pagina_pdf": pag,
                "natureza": nat,
                "observacao": obs,
                "evidencia": "",
                "situacao": "NAO_VERIFICADO",
            }
            continue
        ma = RE_ALINEA.match(linha)
        if ma and atual:
            atual["texto"] += f" [{ma.group(1)}] {ma.group(2)}"
            continue
        if atual:
            atual["texto"] += " " + linha.strip()

    fechar()

    for r in registros:
        r["hash_referencia"] = hashlib.sha256(
            f"{r['id']}|{r['texto']}".encode("utf-8")).hexdigest()[:16]

    saida = {
        "versao": 1,
        "fonte": {
            "arquivo": PDF.name,
            "sha256": hashlib.sha256(PDF.read_bytes()).hexdigest(),
        },
        "escopo": (
            "Condicoes de contratacao, migracao, implantacao, treinamento, "
            "suporte, manutencao, infraestrutura e contrato. Complementa "
            "catalogo-execucao.json; nao o duplica."
        ),
        "aviso": (
            "Estas condicoes nao se comprovam com tela. Exigem artefato: "
            "arquitetura, contrato, plano, medicao, relatorio de teste ou "
            "rotina operacional."
        ),
        "total": len(registros),
        "condicoes": registros,
    }
    SAIDA.write_text(json.dumps(saida, ensure_ascii=False, indent=2),
                     encoding="utf-8")

    from collections import Counter
    print(f"gravado: {SAIDA.name} — {len(registros)} condicoes")
    for nat, qtd in Counter(r["natureza"] for r in registros).most_common():
        print(f"  {qtd:4d}  {nat}")


if __name__ == "__main__":
    main()
