'use client';

import { useEffect, useMemo, useState } from 'react';

/** Lista de pedidos recentes (/pedidos) + ação de criar rascunho direto da linha. */
export function usePedidos() {
  const [pedidos, setPedidos] = useState(null);
  const [erro, setErro] = useState(null);
  const [soAtacado, setSoAtacado] = useState(true);
  const [verificando, setVerificando] = useState(null); // id do pedido em checagem no Tiny
  const [criandoId, setCriandoId] = useState(null); // id do pedido tendo o rascunho criado
  const [erroRascunho, setErroRascunho] = useState(null);

  useEffect(() => {
    fetch('/api/pedidos')
      .then(async (r) => {
        const dados = await r.json();
        if (!r.ok) throw new Error(dados.erro ?? 'Falha ao carregar');
        return dados;
      })
      .then((d) => setPedidos(d.pedidos))
      .catch((e) => setErro(e.message));
  }, []);

  // Busca o preview (payload que vai pro Tiny) e, se confirmado, cria o
  // rascunho — tudo a partir da linha, sem passar pela tela de conferência.
  async function criarRascunho(pedido) {
    const confirmou = window.confirm(
      `Confirma a criação do rascunho para o pedido ${pedido.name}? Isto grava uma nota real no Tiny de produção.`
    );
    if (!confirmou) return;

    setCriandoId(pedido.id);
    setErroRascunho(null);
    try {
      const respPreview = await fetch(`/api/pedidos/${pedido.id}/preview`);
      const dados = await respPreview.json();
      if (!respPreview.ok) throw new Error(dados.erro ?? 'Falha ao montar o preview do pedido');
      if (dados.jaProcessado) {
        throw new Error(`Este pedido já tem rascunho no Tiny (nota ${dados.tinyNotaId ?? 'sem id retornado'}).`);
      }

      const resposta = await fetch(`/api/pedidos/${pedido.id}/rascunho`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: dados.payload,
          classificacao: dados.classificacao,
          orderName: dados.pedido.name,
          confirmacaoTeste: true,
        }),
      });

      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.erro ?? 'O Tiny recusou a inclusão.');

      setPedidos((atual) =>
        atual.map((p) =>
          p.id === pedido.id ? { ...p, status: 'rascunho_criado', tinyNotaId: corpo.tinyNotaId } : p
        )
      );
    } catch (e) {
      setErroRascunho(`Pedido ${pedido.name}: ${e.message}`);
    } finally {
      setCriandoId(null);
    }
  }

  // Consulta o Tiny (não só o Supabase) para confirmar se a nota foi emitida.
  // É sob demanda — a lista em si só lê o Supabase, que é rápido.
  async function verificarEmissao(pedido) {
    setVerificando(pedido.id);
    try {
      const r = await fetch(`/api/pedidos/${pedido.id}/situacao`);
      const corpo = await r.json();
      if (!r.ok) throw new Error(corpo.erro ?? 'Falha ao consultar o Tiny');
      setPedidos((atual) =>
        atual.map((p) => (p.id === pedido.id ? { ...p, notaEmitida: corpo.notaEmitida } : p))
      );
    } catch (e) {
      setErro(e.message);
    } finally {
      setVerificando(null);
    }
  }

  const visiveis = useMemo(() => {
    if (!pedidos) return [];
    return soAtacado ? pedidos.filter((p) => p.classificacao !== 'outro') : pedidos;
  }, [pedidos, soAtacado]);

  return {
    pedidos,
    erro,
    soAtacado,
    setSoAtacado,
    verificando,
    criandoId,
    erroRascunho,
    criarRascunho,
    verificarEmissao,
    visiveis,
  };
}
