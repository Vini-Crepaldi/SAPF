// /transferencias — transferências de estoque entre lojas (Shopify) e a nota
// fiscal de cada uma no Tiny: rascunho, emissão e nº da NF.

'use client';

import { Fragment } from 'react';
import IconePdf from '@/components/ui/IconePdf';
import Paginacao from '@/components/ui/Paginacao';
import { formatarDataCurta, formatarMoeda } from '@/lib/format';
import { useTransferencias } from '../hooks/useTransferencias';

const STATUS_SHOPIFY = {
  DRAFT: ['Rascunho', ''],
  READY_TO_SHIP: ['Pronta p/ envio', 'marca-atacado'],
  IN_PROGRESS: ['Em trânsito', 'marca-franquia'],
  TRANSFERRED: ['Transferida', 'marca-ok'],
  CANCELED: ['Cancelada', 'marca-erro'],
};

const COLUNAS = 8;

function StatusShopify({ status }) {
  const [rotulo, classe] = STATUS_SHOPIFY[status] ?? [status, ''];
  return <span className={`marca ${classe}`}>{rotulo}</span>;
}

function StatusFiscal({ t }) {
  if (t.notaEmitida) {
    return <span className="marca marca-ok">NF emitida{t.numeroNf ? ` nº ${t.numeroNf}` : ''}</span>;
  }
  if (t.situacaoFiscal === 'rascunho_criado') {
    return <span className="marca marca-atacado">rascunho {t.tinyNotaId}</span>;
  }
  if (t.situacaoFiscal === 'erro') return <span className="marca marca-erro">erro no Tiny</span>;
  return <span className="marca marca-erro">NF pendente</span>;
}

function SeletorLoja({ id, rotulo, valor, locais, aoMudar, vazio }) {
  return (
    <div>
      <label htmlFor={id}>{rotulo}</label>
      <select id={id} value={valor} onChange={(e) => aoMudar(e.target.value)}>
        <option value="">{vazio}</option>
        {locais.map((l) => (
          <option key={l.id} value={l.id}>
            {l.nome}
            {l.ativo ? '' : ' (inativa)'}
          </option>
        ))}
      </select>
    </div>
  );
}

function Produtos({ estado }) {
  if (estado.carregando) return <p className="fraco">Lendo os itens no Shopify…</p>;
  if (estado.erro) {
    return (
      <div className="aviso">
        <strong>Não foi possível ler a transferência.</strong>
        <p>{estado.erro}</p>
      </div>
    );
  }
  const { dados } = estado;
  const nota = dados.payload.nota_fiscal;
  return (
    <>
      {dados.alertas.length > 0 && (
        <div className="aviso">
          <strong>Confira antes de criar o rascunho</strong>
          <ul>
            {dados.alertas.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="fraco">
        Destinatário na nota: {nota.cliente.nome}
        {nota.cliente.cpf_cnpj && <span className="mono"> · CNPJ {nota.cliente.cpf_cnpj}</span>}
        {nota.cliente.ie && <span className="mono"> · IE {nota.cliente.ie}</span>} · Natureza:{' '}
        {nota.natureza_operacao}
        {dados.regrasDestino && (
          <>
            {' '}
            · Valor: preço de {dados.regrasDestino.baseValor === 'venda' ? 'venda' : 'custo'}
            {dados.regrasDestino.descontoPercentual > 0 && ` com ${dados.regrasDestino.descontoPercentual}% de desconto`}
          </>
        )}
      </p>
      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Descrição</th>
            <th className="num">Qtd.</th>
            <th className="num">Valor unitário</th>
            <th className="num">Total da linha</th>
          </tr>
        </thead>
        <tbody>
          {nota.itens.map(({ item }, i) => (
            <tr key={i}>
              <td className="mono">{item.codigo || '—'}</td>
              <td>{item.descricao}</td>
              <td className="num">{item.quantidade}</td>
              <td className="num">{formatarMoeda(item.valor_unitario)}</td>
              <td className="num">{formatarMoeda(Number(item.valor_unitario) * Number(item.quantidade))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <strong>Total da nota: {formatarMoeda(dados.totalNota)}</strong>
      </p>
    </>
  );
}

export default function ControleTransferencias() {
  const {
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
    conferindo,
    precisaConferir,
    conferirNoTiny,
    criarRascunho,
    emitir,
    emitirDireto,
    podeEmitir,
    selecionadas,
    alternarSelecao,
    selecionarVarias,
    comRascunho,
    selecionadasEmitiveis,
    lote,
    emitirTodasComRascunho,
    emitirSelecionadas,
  } = useTransferencias();

  const emitiveisDaPagina = transferenciasDaPagina.filter(podeEmitir).map((t) => t.id);

  return (
    <>
      <h2>Controle de transferências do fiscal</h2>

      <div className="cartao">
        <strong>Filtros</strong>
        <div className="campos" style={{ marginTop: '0.75rem' }}>
          <SeletorLoja
            id="origem"
            rotulo="Loja de origem"
            valor={filtros.origem}
            locais={locais}
            aoMudar={(v) => atualizarFiltro('origem', v)}
            vazio="Todas as lojas"
          />
          <SeletorLoja
            id="destino"
            rotulo="Loja de destino"
            valor={filtros.destino}
            locais={locais}
            aoMudar={(v) => atualizarFiltro('destino', v)}
            vazio="Todas as lojas"
          />
          <div>
            <SeletorLoja
              id="excluir"
              rotulo="Excluir loja"
              valor={filtros.excluir}
              locais={locais}
              aoMudar={(v) => atualizarFiltro('excluir', v)}
              vazio="Nenhuma"
            />
            <span className="fraco">Oculta transferências em que a loja seja origem ou destino</span>
          </div>
          <div>
            <label htmlFor="de">Data inicial</label>
            <input id="de" type="date" value={filtros.de} onChange={(e) => atualizarFiltro('de', e.target.value)} />
          </div>
          <div>
            <label htmlFor="ate">Data final</label>
            <input id="ate" type="date" value={filtros.ate} onChange={(e) => atualizarFiltro('ate', e.target.value)} />
          </div>
          <div>
            <label htmlFor="nf">Buscar por nº da NF</label>
            <input
              id="nf"
              inputMode="numeric"
              placeholder="Nº da nota fiscal"
              value={filtros.nf}
              onChange={(e) => atualizarFiltro('nf', e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && aplicarFiltros()}
            />
          </div>
        </div>

        <div className="filtros">
          <label>
            <input
              type="checkbox"
              checked={filtros.rascunhos}
              onChange={(e) => atualizarFiltro('rascunhos', e.target.checked)}
            />
            Mostrar rascunhos do Shopify
          </label>
          <label>
            <input
              type="checkbox"
              checked={filtros.naoEmitidas}
              onChange={(e) => atualizarFiltro('naoEmitidas', e.target.checked)}
            />
            Mostrar apenas não emitidas
          </label>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button onClick={aplicarFiltros} disabled={carregando}>
            {carregando ? 'Carregando…' : 'Aplicar filtros'}
          </button>
          <button className="secundario" onClick={limparFiltros} disabled={carregando || !filtrosAlterados}>
            Limpar filtros
          </button>
          <button
            onClick={emitirTodasComRascunho}
            disabled={!permitirEmissao || carregando || !!lote || comRascunho.length === 0}
            title={
              permitirEmissao
                ? 'Emite no Tiny todas as notas com rascunho da lista filtrada (todas as páginas)'
                : 'Ligue "Permitir emissão" na tela de rascunhos'
            }
          >
            Emitir todas com rascunho ({comRascunho.length})
          </button>
          <button
            onClick={emitirSelecionadas}
            disabled={!permitirEmissao || carregando || !!lote || selecionadasEmitiveis.length === 0}
            title={
              permitirEmissao
                ? 'Cria o rascunho quando falta e emite as transferências marcadas'
                : 'Ligue "Permitir emissão" na tela de rascunhos'
            }
          >
            Emitir selecionadas ({selecionadasEmitiveis.length})
          </button>
        </div>
        {lote && (
          <p className="fraco" style={{ marginBottom: 0 }}>
            Emitindo {lote.feitas}/{lote.total}… não feche a página.
          </p>
        )}
      </div>

      <div className={permitirEmissao ? 'aviso aviso-ok' : 'aviso'}>
        <strong>
          Emissão fiscal: {permitirEmissao === null ? 'verificando…' : permitirEmissao ? 'LIBERADA' : 'BLOQUEADA'}
        </strong>
        <p>
          A trava é a mesma da tela de <a href="/rascunhos">rascunhos</a>
          {permitirEmissao ? ' — "Emitir nota" grava valor fiscal de verdade, sem volta.' : '.'}
        </p>
      </div>

      {aviso && (
        <div className="aviso aviso-ok">
          <p style={{ margin: 0 }}>{aviso}</p>
          <button className="secundario" style={{ marginTop: '0.5rem' }} onClick={() => setAviso(null)}>
            Fechar
          </button>
        </div>
      )}

      {erro && (
        <div className="aviso">
          <strong>Não foi possível carregar as transferências.</strong>
          <p>{erro}</p>
        </div>
      )}

      {truncado && (
        <div className="aviso">
          Há mais transferências do que a lista mostra (limite de 1000). Use os filtros de data ou de loja.
        </div>
      )}

      <h3>Transferências de estoque</h3>
      {!transferencias ? (
        !erro && <p className="fraco">Carregando transferências…</p>
      ) : transferencias.length === 0 ? (
        <div className="vazio">Nenhuma transferência corresponde aos filtros.</div>
      ) : (
        <>
          <p className="fraco">
            {transferencias.length} transferência(s)
            {totalPaginas > 1 && ` — página ${pagina} de ${totalPaginas}`}.
          </p>
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    aria-label="Selecionar as transferências emitíveis desta página"
                    checked={emitiveisDaPagina.length > 0 && emitiveisDaPagina.every((id) => selecionadas.has(id))}
                    disabled={emitiveisDaPagina.length === 0 || !!lote}
                    onChange={(e) => selecionarVarias(emitiveisDaPagina, e.target.checked)}
                  />
                </th>
                <th>Transferência</th>
                <th>Origem</th>
                <th>Destino</th>
                <th>Data</th>
                <th>Status</th>
                <th className="num">Quantidade</th>
                <th>Ações, status fiscal e nº da NF</th>
              </tr>
            </thead>
            <tbody>
              {transferenciasDaPagina.map((t) => {
                const estadoProdutos = produtos[t.id];
                const acao = acoes[t.id];
                const enviando = acao?.fase === 'enviando';
                const temRascunho = t.situacaoFiscal === 'rascunho_criado';
                const podeCriar = !t.notaEmitida && !temRascunho && t.status !== 'CANCELED';

                return (
                  <Fragment key={t.id}>
                    <tr>
                      <td>
                        {podeEmitir(t) && (
                          <input
                            type="checkbox"
                            aria-label={`Selecionar a transferência ${t.name}`}
                            checked={selecionadas.has(t.id)}
                            disabled={!!lote}
                            onChange={() => alternarSelecao(t.id)}
                          />
                        )}
                      </td>
                      <td className="mono">{t.name}</td>
                      <td>{t.origem}</td>
                      <td>{t.destino}</td>
                      <td>{formatarDataCurta(t.data)}</td>
                      <td>
                        <StatusShopify status={t.status} />
                      </td>
                      <td className="num">
                        {t.quantidadeRecebida}/{t.quantidadeTotal}
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', alignItems: 'flex-start' }}>
                          <StatusFiscal t={t} />
                          {enviando && <span className="fraco">Enviando…</span>}
                          <button className="secundario" onClick={() => alternarProdutos(t.id)}>
                            {estadoProdutos?.aberto ? 'Ocultar produtos' : 'Ver produtos'}
                          </button>

                          {podeCriar && (
                            <button
                              onClick={() => definirAcao(t.id, { fase: 'confirmar-rascunho' })}
                              disabled={enviando || acao?.fase === 'confirmar-rascunho'}
                            >
                              Criar rascunho
                            </button>
                          )}

                          {podeCriar && (
                            <button
                              onClick={() => definirAcao(t.id, { fase: 'confirmar-emissao-direta' })}
                              disabled={!permitirEmissao || enviando || !!lote || acao?.fase === 'confirmar-emissao-direta'}
                              title={
                                permitirEmissao
                                  ? 'Cria o rascunho no Tiny e emite em seguida'
                                  : 'Ligue "Permitir emissão" na tela de rascunhos'
                              }
                            >
                              {permitirEmissao ? 'Emitir nota' : 'Emissão bloqueada'}
                            </button>
                          )}

                          {temRascunho && !t.notaEmitida && (
                            <button
                              onClick={() => definirAcao(t.id, { fase: 'confirmar-emissao' })}
                              disabled={!permitirEmissao || enviando || !!lote || acao?.fase === 'confirmar-emissao'}
                              title={permitirEmissao ? undefined : 'Ligue "Permitir emissão" na tela de rascunhos'}
                            >
                              {permitirEmissao ? 'Emitir nota' : 'Emissão bloqueada'}
                            </button>
                          )}

                          {t.tinyNotaId && (
                            <a
                              className="botao-pdf"
                              href={`/api/pedidos/${t.id}/danfe?tinyNotaId=${t.tinyNotaId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={t.notaEmitida ? 'Abrir DANFE' : 'Prévia do DANFE — sem valor fiscal até emitir'}
                            >
                              <IconePdf /> DANFE
                            </a>
                          )}

                          {precisaConferir(t) && (
                            <button
                              className="secundario"
                              onClick={() => conferirNoTiny(t)}
                              disabled={conferindo.has(t.id) || enviando}
                              title="Busca no Tiny se a nota já foi autorizada e o número da NF"
                            >
                              {conferindo.has(t.id) ? 'Conferindo no Tiny…' : 'Conferir no Tiny'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {acao?.fase === 'confirmar-rascunho' && (
                      <tr>
                        <td colSpan={COLUNAS}>
                          <div className="confirmacao">
                            <p style={{ marginTop: 0 }}>
                              <strong>Criar o rascunho da transferência {t.name}?</strong> Isto grava uma nota
                              real no Tiny de produção. Confira os produtos e os avisos em &quot;Ver produtos&quot;
                              antes.
                            </p>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                              <button onClick={() => criarRascunho(t)}>Sim, criar o rascunho</button>
                              <button className="secundario" onClick={() => definirAcao(t.id, null)}>
                                Cancelar
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {acao?.fase === 'confirmar-emissao' && (
                      <tr>
                        <td colSpan={COLUNAS}>
                          <div className="confirmacao">
                            <p style={{ marginTop: 0 }}>
                              <strong>Emitir a nota {t.tinyNotaId} ({t.name})?</strong> Isso dá valor fiscal real
                              e é irreversível.
                            </p>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                              <button onClick={() => emitir(t)}>Sim, emitir</button>
                              <button className="secundario" onClick={() => definirAcao(t.id, null)}>
                                Cancelar
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {acao?.fase === 'confirmar-emissao-direta' && (
                      <tr>
                        <td colSpan={COLUNAS}>
                          <div className="confirmacao">
                            <p style={{ marginTop: 0 }}>
                              <strong>Criar o rascunho e emitir a nota da transferência {t.name}?</strong> Isso
                              grava a nota no Tiny de produção e dá valor fiscal real — é irreversível. Confira os
                              produtos e os avisos em &quot;Ver produtos&quot; antes.
                            </p>
                            <div style={{ display: 'flex', gap: '0.75rem' }}>
                              <button onClick={() => emitirDireto(t)}>Sim, criar e emitir</button>
                              <button className="secundario" onClick={() => definirAcao(t.id, null)}>
                                Cancelar
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}

                    {acao?.fase === 'erro' && (
                      <tr>
                        <td colSpan={COLUNAS}>
                          <div className="aviso">
                            <strong>A operação na transferência {t.name} não foi concluída.</strong>
                            <p>{acao.erro}</p>
                            <button className="secundario" onClick={() => definirAcao(t.id, null)}>
                              Fechar
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}

                    {estadoProdutos?.aberto && (
                      <tr>
                        <td colSpan={COLUNAS}>
                          <Produtos estado={estadoProdutos} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          <Paginacao pagina={pagina} totalPaginas={totalPaginas} aoMudarPagina={mudarPagina} />
        </>
      )}
    </>
  );
}
