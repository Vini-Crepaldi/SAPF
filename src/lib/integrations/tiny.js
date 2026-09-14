// tiny.js — integração com a API 2.0 do Tiny (Olist).
//
// A API 2.0 é antiga: recebe POST com application/x-www-form-urlencoded,
// sempre com `token` e `formato=JSON`, e o payload vai em um campo de nome
// específico por endpoint (`pesquisa`, `nota`, `id`...). A resposta vem sempre
// embrulhada em `retorno`, com `status`, `erros` e `registros`.
//
// incluirNotaRascunho usa nota.fiscal.incluir.php (JSON), como os demais
// endpoints. Já tentamos duas vezes ir por XML pra conseguir mandar
// `gtin_ean`: primeiro com o nome errado (nota.fiscal.incluir.xml.php, 404),
// depois com o nome correto da doc (incluir.nota.xml.php) — mas o Tiny
// rejeita esse endpoint nesta conta/token mesmo assim. Então ficamos em
// JSON; o campo `gtin_ean` está no payload mesmo sem confirmação de que o
// Tiny o usa de fato na emissão — ver alertas se a nota sair sem GTIN.
//
// ATENÇÃO — este token é de PRODUÇÃO:
// 
//   - incluirNotaRascunho: CRIA uma nota de verdade no Tiny, mesmo a partir de
//     um pedido fictício. A tela de preview exige uma confirmação explícita.
//   - emitirNota: dá valor fiscal à nota. Bloqueada por "permitir_emissao"
//     (Supabase — ver lib/db.js::obterPermitirEmissao).

import { obterPermitirEmissao } from '../db.js';

const BASE = () => process.env.TINY_API_BASE || 'https://api.tiny.com.br/api2';

// A API 2.0 do Tiny devolve objeto único (não array) quando só há um item em
// listas como `registros` ou `erros` — só vira array com dois ou mais.
function paraArray(valor) {
  if (Array.isArray(valor)) return valor;
  if (valor && typeof valor === 'object') return [valor];
  return [];
}

/** POST no formato que a API 2.0 espera, já desembrulhando `retorno`. */
async function chamarTiny(endpoint, params= {}) {
  const token = process.env.TINY_API_TOKEN;
  if (!token) {
    throw new Error('TINY_API_TOKEN não configurado. Preencha o .env.local.');
  }

  const corpo = new URLSearchParams({ token, formato: 'JSON', ...params });
  const url = `${BASE()}/${endpoint}`

  let resposta;
  try {
    resposta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: corpo.toString(),
      cache: 'no-store',
    });
  } catch (erro) {
    throw new Error(`Falha de rede ao chamar o Tiny (${endpoint}): ${erro.message}`);
  }

  if (!resposta.ok) {
    throw new Error(`Tiny respondeu ${resposta.status} em ${endpoint}.`);
  }

  const texto = await resposta.text();
  let dados;
  try {
    dados = JSON.parse(texto);
  } catch {
    // O Tiny às vezes devolve HTML quando o token é inválido.
    throw new Error(`Tiny devolveu uma resposta que não é JSON em ${endpoint}. Verifique o TINY_API_TOKEN.`);
  }

  const retorno = dados.retorno ?? {};

  if (retorno.status === 'Erro') {
    // O Tiny bota o detalhe do erro em lugares diferentes conforme o endpoint,
    // e vira objeto único (em vez de array) quando só há um item — por isso
    // tudo passa por paraArray antes de percorrer.
    const errosDiretos = paraArray(retorno.erros);
    const errosDeRegistros = paraArray(retorno.registros).flatMap((r) => paraArray(r.registro?.erros));
    const mensagens = [...errosDiretos, ...errosDeRegistros]
      .map((e) => e.erro ?? JSON.stringify(e))
      .join('; ');

    if (!mensagens) {
      console.error(`[tiny] ${endpoint} devolveu status "Erro" sem detalhe reconhecido:`, JSON.stringify(retorno));
    }
    throw new Error(`Tiny recusou a chamada ${endpoint}: ${mensagens || 'erro não detalhado'}`);
  }

  return retorno;
}

/**
 * Confere cada SKU no cadastro de produtos do Tiny.
 * O `codigo` do produto no Tiny deve ser igual ao SKU do Shopify.
 * Alguns SKUs têm barra (ex.: G668-B1S/P) — por isso a comparação é feita
 * sobre o texto exato, sem normalizar nem quebrar a string.
 *
 * Retorna { ok, naoEncontrados, multiplos }.
 */

/**
 * Cria a nota como RASCUNHO no Tiny (sem valor fiscal).
 * Isto escreve em produção — só chame depois da confirmação na interface.
 */
export async function incluirNotaRascunho(payload) {
  const retorno = await chamarTiny('nota.fiscal.incluir.php', { nota: JSON.stringify(payload) });

  const registro = paraArray(retorno.registros)[0]?.registro ?? null;
  const idNota = registro?.id ?? retorno.idNotaFiscal ?? null;

  return { idNota: idNota ? String(idNota) : null, retorno };
}

/** Consulta uma nota já criada — usado para confirmar a inclusão. */
export async function obterNota(id) {
  const retorno = await chamarTiny('nota.fiscal.obter.php', { id: String(id) });
  return retorno.nota_fiscal ?? retorno;
}

/**
 * Interpreta o campo `situacao` que o Tiny devolve para a nota.
 * TODO: confirmar com o time fiscal a lista exata de situações desta conta —
 * o valor abaixo é a leitura textual mais comum da API 2.0, não documentação
 * oficial conferida.
 */
function notaEstaEmitida(notaTiny) {
  const situacao = String(notaTiny?.situacao ?? '').toLowerCase();
  return /emitid|autorizad/.test(situacao) && !/cancelad/.test(situacao);
}

/** Consulta o Tiny e diz se a nota já foi emitida (não só criada como rascunho). */
export async function verificarNotaEmitida(id) {
  const nota = await obterNota(id);
  return notaEstaEmitida(nota);
}

/**
 * Link do DANFE — uma página HTML com impressão automática, não um PDF cru.
 * O Tiny devolve esse link mesmo pra nota ainda não emitida (rascunho), só
 * que marcado "DOCUMENTO SEM VALOR FISCAL" no rodapé; vale a pena checar
 * `notaEmitida` antes de oferecer o botão, mas a chamada em si não falha.
 * https://tiny.com.br/api-docs/api2-notas-fiscais-obter-link
 */
export async function obterLinkDanfe(id) {
  const retorno = await chamarTiny('nota.fiscal.obter.link.php', { id: String(id) });
  if (!retorno.link_nfe) {
    throw new Error('Tiny não devolveu o link do DANFE — confira se a nota já foi emitida.');
  }
  return retorno.link_nfe;
}

/**
 * Emissão fiscal — dá valor tributário à nota, de forma irreversível.
 * Travada por "permitir_emissao" (Supabase, ligado/desligado pela tela de
 * rascunhos) — checada aqui de novo, e não só na rota, porque essa trava
 * precisa valer mesmo se algum dia esta função for chamada de outro lugar.
 */
export async function emitirNota(id) {
  const permitido = await obterPermitirEmissao();
  if (!permitido) {
    throw new Error(
      'Emissão bloqueada. Ligue "Permitir emissão" na tela de rascunhos antes de tentar de novo.'
    );
  }
  return chamarTiny('nota.fiscal.emitir.php', { id: String(id) });
}

/** Ping usado pelo /api/saude. Faz só uma leitura inofensiva. */
export async function verificarTiny() {
  await chamarTiny('produtos.pesquisa.php', { pesquisa: '__ping__' }).catch((erro) => {
    // Busca sem resultado é resposta válida para o nosso teste de conectividade.
    if (!/não encontrad|nao encontrad|sem registros/i.test(erro.message));
  });
  return { servico: 'Tiny', ok: true, detalhe: 'Token aceito e API respondendo.' };
}


