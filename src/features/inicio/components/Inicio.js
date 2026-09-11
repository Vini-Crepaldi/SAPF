// Página inicial: mostra se as integrações estão respondendo. É o lugar para
// conferir se as variáveis de ambiente foram preenchidas corretamente.

'use client';

import { useSaude } from '../hooks/useSaude';

export default function Inicio() {
  const { saude, erro } = useSaude();

  return (
    <>
      <p>
        Este protótipo lê pedidos de atacado e de franquia e cria a nota como <strong>rascunho</strong> no
        Tiny. A conferência e a emissão continuam sendo feitas dentro do Tiny, à mão.
      </p>


      <h2>Situação das integrações</h2>

      {erro && <p className="aviso">Não foi possível consultar o status: {erro}</p>}
      {!saude && !erro && <p className="fraco">Consultando os três serviços…</p>}

      {saude && (
        <table>
          <thead>
            <tr>
              <th>Serviço</th>
              <th>Situação</th>
              <th>Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {saude.servicos.map((s) => (
              <tr key={s.servico}>
                <td>{s.servico}</td>
                <td>
                  <span className={s.ok ? 'marca marca-ok' : 'marca marca-erro'}>
                    {s.ok ? 'respondendo' : 'com problema'}
                  </span>
                </td>
                <td className="fraco">{s.detalhe}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {saude && (
        <p className="fraco">
          Emissão fiscal: {saude.permitirEmissao ? 'liberada (PERMITIR_EMISSAO=true)' : 'bloqueada por PERMITIR_EMISSAO'}.
        </p>
      )}

      <p style={{ marginTop: '2rem' }}>
        <a href="/pedidos">Ver pedidos recentes</a>
      </p>
    </>
  );
}
