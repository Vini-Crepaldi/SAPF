// /pedidos — lista dos pedidos recentes já classificados.

'use client';

import { formatarDataCurta, formatarMoeda } from '@/lib/format';
import { usePedidos } from '../hooks/usePedidos';

function Situacao({ pedido }) {
  if (pedido.status === 'rascunho_criado') {
    return <span className="marca marca-ok">rascunho {pedido.tinyNotaId ?? ''}</span>;
  }
  if (pedido.status === 'erro') return <span className="marca marca-erro">erro</span>;
  if (pedido.status === 'preview') return <span className="marca">em conferência</span>;
  return <span className="fraco">não processado</span>;
}

/** Checkbox somente leitura: marcado quando `ok` é verdadeiro. */
function Check({ ok }) {
  return <input type="checkbox" checked={!!ok} readOnly aria-label={ok ? 'sim' : 'não'} />;
}

export default function ListaPedidos() {
  const { pedidos, erro, soAtacado, setSoAtacado, criandoId, erroRascunho, criarRascunho, visiveis } =
    usePedidos();

  if (erro) {
    return (
      <div className="aviso">
        <strong>Não foi possível carregar os pedidos.</strong>
        <p>{erro}</p>
        <p>Confira as variáveis de ambiente na página inicial e recarregue.</p>
      </div>
    );
  }

  if (!pedidos) return <p className="fraco">Carregando pedidos…</p>;

  return (
    <>


      {erroRascunho && (
        <div className="aviso">
          <strong>A inclusão não foi concluída.</strong>
          <p>{erroRascunho}</p>
        </div>
      )}

      <div className="filtros">
        <label>
          <input type="checkbox" checked={soAtacado} onChange={(e) => setSoAtacado(e.target.checked)} />
          Mostrar só atacado e franquia
        </label>
        <span className="fraco">
          {visiveis.length} de {pedidos.length} pedidos
        </span>
      </div>

      {visiveis.length === 0 ? (
        <div className="vazio">Nenhum pedido corresponde ao filtro. Desmarque o filtro para ver todos.</div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Data</th>
              <th>Cliente</th>
              <th className="num">Total</th>
              <th>Classificação</th>
              <th>Situação</th>
              <th>Rascunho</th>
              <th>OK</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((p) => (
              <tr key={p.id}>
                <td>
                  <a href={`/pedidos/${p.id}/rascunho`}>{p.name}</a>
                </td>
                <td>{formatarDataCurta(p.createdAt)}</td>
                <td>
                  {p.cliente}
                  {p.cnpj && <div className="fraco mono">{p.cnpj}</div>}
                </td>
                <td className="num">{formatarMoeda(p.total)}</td>
                <td>
                  <span className={`marca marca-${p.classificacao}`}>{p.classificacao}</span>
                </td>
                <td>
                  <Situacao pedido={p} />
                </td>
                <td>
                  <button
                    onClick={() => criarRascunho(p)}
                    disabled={criandoId === p.id || p.status === 'rascunho_criado'}
                  >
                    {criandoId === p.id
                      ? 'Enviando…'
                      : p.status === 'rascunho_criado'
                        ? 'Rascunho criado'
                        : 'Criar rascunho'}
                  </button>
                </td>
                <td>
                  <Check ok={p.status === 'rascunho_criado'} />

                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
