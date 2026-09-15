// /rascunhos — lista os rascunhos já criados no Tiny (histórico do Supabase)
// e permite emitir a nota fiscal de cada um.

'use client';

import { Fragment } from 'react';
import IconePdf from '@/components/ui/IconePdf';
import { formatarDataHoraCurta, formatarMoedaOuTraco } from '@/lib/format';
import { useRascunhos } from '../hooks/useRascunhos';

export default function ListaRascunhos() {
  const {
    rascunhos,
    erro,
    permitirEmissao,
    alternandoTrava,
    emissoes,
    alternarPermitirEmissao,
    iniciarEmissao,
    cancelarEmissao,
    confirmarEmissao,
  } = useRascunhos();

  if (erro) {
    return (
      <div className="aviso">
        <strong>Não foi possível carregar os rascunhos.</strong>
        <p>{erro}</p>
      </div>
    );
  }

  if (!rascunhos) return <p className="fraco">Carregando rascunhos…</p>;

  return (
    <>
      <h2>Rascunhos criados no Tiny</h2>
      <p className="fraco">{rascunhos.length} rascunho(s).</p>

      <div className={permitirEmissao ? 'aviso aviso-ok' : 'aviso'}>
        <strong>
          Emissão fiscal: {permitirEmissao === null ? 'verificando…' : permitirEmissao ? 'LIBERADA' : 'BLOQUEADA'}
        </strong>
        <p>
          {permitirEmissao
            ? 'Os botões "Emitir nota" abaixo gravam valor fiscal de verdade no Tiny, de forma irreversível.'
            : 'Os botões "Emitir nota" abaixo ficam visíveis, mas desabilitados, até esta trava ser ligada.'}
        </p>
        <button
          className={permitirEmissao ? 'secundario' : ''}
          onClick={alternarPermitirEmissao}
          disabled={permitirEmissao === null || alternandoTrava}
        >
          {alternandoTrava
            ? 'Salvando…'
            : permitirEmissao
              ? 'Bloquear emissão'
              : 'Permitir emissão'}
        </button>
      </div>

      {rascunhos.length === 0 ? (
        <div className="vazio">Nenhum rascunho criado ainda.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Razão social</th>
              <th>Classificação</th>
              <th>Nota no Tiny</th>
              <th>Emitida</th>
              <th className="num">Total</th>
              <th>Criado em</th>
              <th>Editar</th>
              <th>Emitir</th>
            </tr>
          </thead>
          <tbody>
            {rascunhos.map((r) => {
              const estado = emissoes[r.id];
              return (
                <Fragment key={r.id}>
                  <tr>
                    <td>
                      <a href={`/pedidos/${r.id}/rascunho/editar`}>{r.orderName}</a>
                    </td>
                    <td>{r.razaoSocial}</td>
                    <td>
                      <span className={`marca marca-${r.classificacao}`}>{r.classificacao}</span>
                    </td>
                    <td>
                      <span className="mono">{r.tinyNotaId ?? '—'}</span>
                      {r.tinyNotasSubstituidas?.length > 0 && (
                        <div>
                          <span
                            className="marca marca-erro"
                            title={`Substituiu ${r.tinyNotasSubstituidas.join(', ')} — cancele/exclua no Tiny`}
                          >
                            {r.tinyNotasSubstituidas.length} antigo(s) p/ remover no Tiny
                          </span>
                        </div>
                      )}
                    </td>
                    <td>
                      {r.notaEmitida ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className="marca marca-ok">emitida</span>
                          <a
                            className="botao-pdf"
                            href={`/api/pedidos/${r.id}/danfe?tinyNotaId=${r.tinyNotaId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Abrir DANFE (salve como PDF pelo diálogo de impressão do navegador)"
                          >
                            <IconePdf /> DANFE
                          </a>
                        </span>
                      ) : (
                        <span className="fraco">não emitida</span>
                      )}
                    </td>
                    <td className="num">{formatarMoedaOuTraco(r.total)}</td>
                    <td className="fraco">{formatarDataHoraCurta(r.criadoEm)}</td>
                    <td>
                      {r.notaEmitida ? (
                        <span className="fraco" title="Nota já emitida — não pode ser recriada por aqui">
                          —
                        </span>
                      ) : (
                        <a href={`/pedidos/${r.id}/rascunho/editar`}>Editar</a>
                      )}
                    </td>
                    <td>
                      {r.notaEmitida ? (
                        <button disabled className="botao-emitido">
                          Emitida
                        </button>
                      ) : !permitirEmissao ? (
                        <button disabled title='Ligue "Permitir emissão" no topo da tela'>
                          Emissão bloqueada
                        </button>
                      ) : estado?.fase === 'enviando' ? (
                        <button disabled>Emitindo…</button>
                      ) : estado?.fase === 'erro' ? (
                        <button className="botao-erro" onClick={() => iniciarEmissao(r.id)}>
                          Tentar novamente
                        </button>
                      ) : (
                        <button onClick={() => iniciarEmissao(r.id)} disabled={estado?.fase === 'confirmando'}>
                          Emitir nota
                        </button>
                      )}
                    </td>
                  </tr>

                  {estado?.fase === 'confirmando' && (
                    <tr>
                      <td colSpan={9}>
                        <div className="confirmacao">
                          <p style={{ marginTop: 0 }}>
                            <strong>Confirma a emissão da nota {r.tinyNotaId}?</strong> Isso dá valor fiscal
                            real e é irreversível — não é possível desfazer pelo sistema.
                          </p>
                          <div style={{ display: 'flex', gap: '0.75rem' }}>
                            <button onClick={() => confirmarEmissao(r)}>Sim, emitir</button>
                            <button className="secundario" onClick={() => cancelarEmissao(r.id)}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}

                  {estado?.fase === 'erro' && (
                    <tr>
                      <td colSpan={9}>
                        <div className="aviso">
                          <strong>O Tiny recusou a emissão da nota {r.tinyNotaId}.</strong>
                          <p>{estado.erro}</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}

      <p style={{ marginTop: '2rem' }}>
        <a href="/pedidos">Ver pedidos recentes</a>
      </p>
    </>
  );
}
