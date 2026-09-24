'use client';

import { useCallback, useEffect, useState } from 'react';
import { ITENS_POR_PAGINA } from '@/lib/constants';

export const FILTROS_VAZIOS = {
  origem: '',
  destino: '',
  excluir: '',
  de: '',
  ate: '',
  nf: '',
  rascunhos: false,
  naoEmitidas: false,
};

function paraQuery(filtros) {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(filtros)) {
    if (valor === true) busca.set(chave, '1');
    else if (valor) busca.set(chave, valor);
  }
  return busca.toString();
}

async function lerJson(resposta, mensagemPadrao) {
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(corpo.erro ?? mensagemPadrao);
  return corpo;
}

/**
 * /transferencias — transferências de estoque do Shopify + nota de cada uma no Tiny.
 *
 * Por linha há três estados independentes: os produtos (preview da nota,
 * carregado sob demanda), a ação em andamento (rascunho/emissão, sempre com
 * confirmação antes) e o nº da NF digitado à mão.
 */
export function useTransferencias() {
  const [filtros, setFiltros] = useState(FILTROS_VAZIOS);
  const [transferencias, setTransferencias] = useState(null);
  const [locais, setLocais] = useState([]);
  const [truncado, setTruncado] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [permitirEmissao, setPermitirEmissao] = useState(null);

  // { [id]: { aberto, carregando, dados?, erro? } }
  const [produtos, setProdutos] = useState({});
  // { [id]: { fase: 'confirmar-rascunho'|'confirmar-emissao'|'enviando'|'erro', erro? } }
  const [acoes, setAcoes] = useState({});
  // { [id]: string }
  const [numerosDigitados, setNumerosDigitados] = useState({});
  const [marcandoTodas, setMarcandoTodas] = useState(false);
  const [pagina, setPagina] = useState(1);

  const carregar = useCallback(async (f) => {
    setCarregando(true);
    setErro(null);
    try {
      const corpo = await lerJson(await fetch(`/api/transferencias?${paraQuery(f)}`), 'Falha ao carregar');
      setTransferencias(corpo.transferencias);
      // Filtro novo, lista nova: a página antiga pode nem existir mais.
      setPagina(1);
      setLocais(corpo.locais);
      setTruncado(corpo.truncado);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar(FILTROS_VAZIOS);
    fetch('/api/config/permitir-emissao')
      .then((r) => r.json())
      .then((d) => setPermitirEmissao(!!d.permitirEmissao))
      .catch(() => setPermitirEmissao(false));
  }, [carregar]);

  function atualizarFiltro(campo, valor) {
    setFiltros((atual) => ({ ...atual, [campo]: valor }));
  }

  function aplicarFiltros() {
    carregar(filtros);
  }

  function limparFiltros() {
    setFiltros(FILTROS_VAZIOS);
    carregar(FILTROS_VAZIOS);
  }

  const filtrosAlterados = JSON.stringify(filtros) !== JSON.stringify(FILTROS_VAZIOS);

  function atualizarLinha(id, mudanca) {
    setTransferencias((atual) => atual.map((t) => (t.id === id ? { ...t, ...mudanca } : t)));
  }

  function definirAcao(id, estado) {
    setAcoes((atual) => {
      if (!estado) {
        const { [id]: _remover, ...resto } = atual;
        return resto;
      }
      return { ...atual, [id]: estado };
    });
  }

  async function carregarProdutos(id) {
    setProdutos((atual) => ({ ...atual, [id]: { aberto: true, carregando: true } }));
    try {
      const dados = await lerJson(await fetch(`/api/transferencias/${id}/preview`), 'Falha ao ler a transferência');
      setProdutos((atual) => ({ ...atual, [id]: { aberto: true, carregando: false, dados } }));
    } catch (e) {
      setProdutos((atual) => ({ ...atual, [id]: { aberto: true, carregando: false, erro: e.message } }));
    }
  }

  function alternarProdutos(id) {
    const atual = produtos[id];
    if (atual?.aberto) {
      setProdutos((p) => ({ ...p, [id]: { ...atual, aberto: false } }));
    } else if (atual?.dados) {
      setProdutos((p) => ({ ...p, [id]: { ...atual, aberto: true } }));
    } else {
      carregarProdutos(id);
    }
  }

  async function criarRascunho(t) {
    definirAcao(t.id, { fase: 'enviando' });
    try {
      const corpo = await lerJson(
        await fetch(`/api/transferencias/${t.id}/rascunho`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ confirmacaoTeste: true }),
        }),
        'O Tiny recusou a inclusão.'
      );
      atualizarLinha(t.id, { situacaoFiscal: 'rascunho_criado', tinyNotaId: corpo.tinyNotaId });
      definirAcao(t.id, null);
      setAviso(corpo.mensagem);
    } catch (e) {
      definirAcao(t.id, { fase: 'erro', erro: e.message });
    }
  }

  async function emitir(t) {
    definirAcao(t.id, { fase: 'enviando' });
    try {
      const corpo = await lerJson(
        await fetch(`/api/transferencias/${t.id}/emitir`, { method: 'POST' }),
        'O Tiny recusou a emissão.'
      );
      atualizarLinha(t.id, { notaEmitida: true, numeroNf: corpo.numeroNf ?? t.numeroNf });
      definirAcao(t.id, null);
    } catch (e) {
      definirAcao(t.id, { fase: 'erro', erro: e.message });
    }
  }

  async function salvarNumero(t) {
    const numeroNf = (numerosDigitados[t.id] ?? '').trim();
    definirAcao(t.id, { fase: 'enviando' });
    try {
      await lerJson(
        await fetch(`/api/transferencias/${t.id}/numero-nf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ numeroNf, nome: t.name }),
        }),
        'Falha ao salvar o número.'
      );
      atualizarLinha(t.id, { notaEmitida: true, numeroNf });
      setNumerosDigitados((atual) => ({ ...atual, [t.id]: '' }));
      definirAcao(t.id, null);
    } catch (e) {
      definirAcao(t.id, { fase: 'erro', erro: e.message });
    }
  }

  async function marcarTodasComoEmitidas() {
    const pendentes = (transferencias ?? []).filter((t) => !t.notaEmitida);
    if (pendentes.length === 0) return;
    const confirmou = window.confirm(
      `Marcar ${pendentes.length} transferência(s) da lista filtrada (todas as páginas) como emitidas? Isto NÃO emite nada no Tiny — ` +
        'só tira da lista de pendentes as que já tiveram nota emitida fora do sistema. ' +
        'As que têm rascunho aberto no Tiny ficam de fora.'
    );
    if (!confirmou) return;

    setMarcandoTodas(true);
    setErro(null);
    try {
      const corpo = await lerJson(
        await fetch('/api/transferencias/marcar-emitidas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            confirmacao: true,
            transferencias: pendentes.map((t) => ({ id: t.id, nome: t.name })),
          }),
        }),
        'Falha ao marcar as transferências.'
      );
      const marcadas = new Set(corpo.marcadas);
      setTransferencias((atual) => atual.map((t) => (marcadas.has(t.id) ? { ...t, notaEmitida: true } : t)));
      setAviso(
        `${corpo.marcadas.length} transferência(s) marcada(s) como emitidas.` +
          (corpo.ignoradas.length
            ? ` Ficaram de fora por terem rascunho no Tiny: ${corpo.ignoradas.join(', ')}.`
            : '')
      );
    } catch (e) {
      setErro(e.message);
    } finally {
      setMarcandoTodas(false);
    }
  }

  const totalPaginas = Math.max(1, Math.ceil((transferencias?.length ?? 0) / ITENS_POR_PAGINA));
  const inicio = (pagina - 1) * ITENS_POR_PAGINA;
  const transferenciasDaPagina = (transferencias ?? []).slice(inicio, inicio + ITENS_POR_PAGINA);

  function mudarPagina(nova) {
    setPagina(nova);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return {
    pagina,
    totalPaginas,
    mudarPagina,
    transferenciasDaPagina,
    filtros,
    atualizarFiltro,
    aplicarFiltros,
    limparFiltros,
    filtrosAlterados,
    transferencias,
    locais,
    truncado,
    carregando,
    erro,
    aviso,
    setAviso,
    permitirEmissao,
    produtos,
    alternarProdutos,
    acoes,
    definirAcao,
    numerosDigitados,
    setNumerosDigitados,
    criarRascunho,
    emitir,
    salvarNumero,
    marcandoTodas,
    marcarTodasComoEmitidas,
  };
}
