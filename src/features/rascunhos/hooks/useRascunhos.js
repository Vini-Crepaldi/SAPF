'use client';

import { useEffect, useState } from 'react';

/**
 * /rascunhos — histórico de rascunhos criados no Tiny (Supabase) + emissão.
 *
 * Emitir é irreversível e tem efeito tributário — por isso fica atrás da
 * trava "Permitir emissão" e exige confirmação por linha antes de gravar.
 */
export function useRascunhos() {
  const [rascunhos, setRascunhos] = useState(null);
  const [erro, setErro] = useState(null);
  const [permitirEmissao, setPermitirEmissao] = useState(null);
  const [alternandoTrava, setAlternandoTrava] = useState(false);

  // Estado de emissão por pedido: { [id]: { fase: 'confirmando'|'enviando'|'erro', erro? } }
  const [emissoes, setEmissoes] = useState({});

  useEffect(() => {
    fetch('/api/rascunhos')
      .then(async (r) => {
        const corpo = await r.json();
        if (!r.ok) throw new Error(corpo.erro ?? 'Falha ao carregar');
        return corpo;
      })
      .then((d) => setRascunhos(d.rascunhos))
      .catch((e) => setErro(e.message));

    fetch('/api/config/permitir-emissao')
      .then((r) => r.json())
      .then((d) => setPermitirEmissao(d.permitirEmissao))
      .catch(() => setPermitirEmissao(false));
  }, []);

  async function alternarPermitirEmissao() {
    setAlternandoTrava(true);
    try {
      const r = await fetch('/api/config/permitir-emissao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permitirEmissao: !permitirEmissao }),
      });
      const corpo = await r.json();
      if (!r.ok) throw new Error(corpo.erro ?? 'Falha ao salvar');
      setPermitirEmissao(corpo.permitirEmissao);
    } catch (e) {
      setErro(e.message);
    } finally {
      setAlternandoTrava(false);
    }
  }

  function iniciarEmissao(id) {
    setEmissoes((atual) => ({ ...atual, [id]: { fase: 'confirmando' } }));
  }

  function cancelarEmissao(id) {
    setEmissoes((atual) => {
      const { [id]: _remover, ...resto } = atual;
      return resto;
    });
  }

  async function confirmarEmissao(rascunho) {
    setEmissoes((atual) => ({ ...atual, [rascunho.id]: { fase: 'enviando' } }));
    try {
      const r = await fetch(`/api/pedidos/${rascunho.id}/emitir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tinyNotaId: rascunho.tinyNotaId }),
      });
      const corpo = await r.json();
      if (!r.ok) throw new Error(corpo.erro ?? 'O Tiny recusou a emissão.');

      setRascunhos((atual) => atual.map((x) => (x.id === rascunho.id ? { ...x, notaEmitida: true } : x)));
      setEmissoes((atual) => {
        const { [rascunho.id]: _remover, ...resto } = atual;
        return resto;
      });
    } catch (e) {
      setEmissoes((atual) => ({ ...atual, [rascunho.id]: { fase: 'erro', erro: e.message } }));
    }
  }

  return {
    rascunhos,
    erro,
    permitirEmissao,
    alternandoTrava,
    emissoes,
    alternarPermitirEmissao,
    iniciarEmissao,
    cancelarEmissao,
    confirmarEmissao,
  };
}
