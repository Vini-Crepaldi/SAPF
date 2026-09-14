'use client';

import { useEffect, useState } from 'react';
import { ITENS_POR_PAGINA } from '@/lib/constants';

/**
 * /pedidos/[id]/rascunho/editar — corrige um rascunho já criado no Tiny.
 *
 * A API 2.0 do Tiny não tem endpoint para alterar nem excluir uma nota — só
 * para incluir. Por isso "editar" aqui significa criar um NOVO rascunho com
 * os dados corrigidos; o antigo fica no Tiny e precisa ser cancelado ou
 * excluído manualmente lá dentro.
 *
 * Diferença para useIncluirRascunho: os dados de partida vêm do que foi
 * REALMENTE enviado ao Tiny da última vez (payload_enviado no Supabase), não
 * recalculados a partir do pedido no Shopify.
 */
export function useEditarRascunho(id) {
  const [dados, setDados] = useState(null);
  const [erroCarregamento, setErroCarregamento] = useState(null);
  const [pagina, setPagina] = useState(1);

  const [clienteEditado, setClienteEditado] = useState(null);
  const [itensEditados, setItensEditados] = useState(null);
  const [itensOriginais, setItensOriginais] = useState(null);

  const [pedindoConfirmacao, setPedindoConfirmacao] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState(null);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    fetch(`/api/pedidos/${id}/rascunho`)
      .then(async (r) => {
        const corpo = await r.json();
        if (!r.ok) throw new Error(corpo.erro ?? 'Falha ao carregar o rascunho');
        return corpo;
      })
      .then((corpo) => {
        const itens = (corpo.payload?.nota_fiscal?.itens ?? []).map((i) => ({ ...i.item }));
        setDados(corpo);
        setClienteEditado(corpo.payload?.nota_fiscal?.cliente ?? {});
        setItensEditados(itens);
        setItensOriginais(itens);
      })
      .catch((e) => setErroCarregamento(e.message));
  }, [id]);

  function atualizarCliente(campo, valor) {
    setClienteEditado((atual) => ({ ...atual, [campo]: valor }));
  }

  function atualizarItem(indiceGlobal, campo, valor) {
    setItensEditados((atual) => atual.map((it, idx) => (idx === indiceGlobal ? { ...it, [campo]: valor } : it)));
  }

  function restaurarItens() {
    setItensEditados(itensOriginais);
  }

  function removerItem(indiceGlobal) {
    setItensEditados((atual) => atual.filter((_, idx) => idx !== indiceGlobal));
  }

  async function confirmarRecriacao() {
    setEnviando(true);
    setErroEnvio(null);
    try {
      const payload = {
        nota_fiscal: {
          ...dados.payload.nota_fiscal,
          cliente: clienteEditado,
          itens: itensEditados.map((it) => ({
            item: {
              ...it,
              quantidade: Number(it.quantidade || 0),
              valor_unitario: Number(it.valor_unitario || 0).toFixed(2),
            },
          })),
        },
      };

      const resposta = await fetch(`/api/pedidos/${id}/rascunho`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload, confirmacaoTeste: true }),
      });

      const corpo = await resposta.json();
      if (!resposta.ok) throw new Error(corpo.erro ?? 'O Tiny recusou a recriação.');
      setResultado(corpo);
      setPedindoConfirmacao(false);
    } catch (e) {
      setErroEnvio(e.message);
    } finally {
      setEnviando(false);
    }
  }

  const carregado = Boolean(dados && itensEditados);
  const totalPaginas = carregado ? Math.max(1, Math.ceil(itensEditados.length / ITENS_POR_PAGINA)) : 1;
  const inicioPagina = (pagina - 1) * ITENS_POR_PAGINA;
  const itensDaPagina = carregado
    ? itensEditados.map((item, indiceGlobal) => ({ item, indiceGlobal })).slice(inicioPagina, inicioPagina + ITENS_POR_PAGINA)
    : [];
  const totalNota = carregado
    ? itensEditados.reduce((soma, it) => soma + Number(it.valor_unitario || 0) * Number(it.quantidade || 0), 0)
    : 0;
  const itensForamEditados = carregado ? JSON.stringify(itensEditados) !== JSON.stringify(itensOriginais) : false;
  const podeSalvar = carregado && !enviando && !resultado && itensEditados.length > 0;

  return {
    dados,
    erroCarregamento,
    pagina,
    setPagina,
    clienteEditado,
    pedindoConfirmacao,
    setPedindoConfirmacao,
    enviando,
    erroEnvio,
    resultado,
    carregado,
    totalPaginas,
    itensDaPagina,
    totalNota,
    itensForamEditados,
    podeSalvar,
    atualizarCliente,
    atualizarItem,
    removerItem,
    restaurarItens,
    confirmarRecriacao,
  };
}
