'use client';

import { useEffect, useMemo, useState } from 'react';
import { ITENS_POR_PAGINA } from '@/lib/constants';

/** Conferência da nota (/pedidos/[id]) antes de gravar no Tiny. */
export function usePreviewPedido(id) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [cliente, setCliente] = useState(null); // campos editáveis
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    fetch(`/api/pedidos/${id}/preview`)
      .then(async (r) => {
        const corpo = await r.json();
        if (!r.ok) throw new Error(corpo.erro ?? 'Falha ao montar o preview');
        return corpo;
      })
      .then((d) => {
        setDados(d);
        setCliente(d.payload.nota_fiscal.cliente);
      })
      .catch((e) => setErro(e.message));
  }, [id]);

  const itens = dados?.pedido?.itens ?? [];
  const itensNota = dados?.payload?.nota_fiscal?.itens ?? [];
  const totalPaginas = Math.max(1, Math.ceil(itens.length / ITENS_POR_PAGINA));
  const itensDaPagina = useMemo(() => {
    const inicio = (pagina - 1) * ITENS_POR_PAGINA;
    return itens.slice(inicio, inicio + ITENS_POR_PAGINA).map((item, i) => ({
      ...item,
      // Valor que realmente vai para o Tiny — já inclui o desconto de atacado
      // quando aplicável. Vem do payload, não é recalculado aqui.
      valorNaNota: Number(itensNota[inicio + i]?.item?.valor_unitario ?? 0),
    }));
  }, [itens, itensNota, pagina]);

  function atualizarCampo(campo, valor) {
    setCliente((atual) => ({ ...atual, [campo]: valor }));
  }

  // Leva as edições do cliente para a tela de inclusão via sessionStorage —
  // é uma navegação de página cheia (não é um componente Next Link/roteado
  // por estado), então não há como passar isso por props.
  function irParaInclusao() {
    sessionStorage.setItem(`rascunho:${id}:cliente`, JSON.stringify(cliente));
  }

  return {
    dados,
    erro,
    cliente,
    pagina,
    setPagina,
    totalPaginas,
    itensDaPagina,
    atualizarCampo,
    irParaInclusao,
  };
}
