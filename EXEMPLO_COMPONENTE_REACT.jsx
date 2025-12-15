// EXEMPLO_COMPONENTE_REACT.jsx
// Exemplo de como adicionar o botão de conexão visível no componente Instance.jsx

import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { connectSocket, getInstanceDetails, updateInstanceName, disconnectInstance, reconnectInstance } from '../api.js';

export default function Instance() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [qr, setQr] = useState(null);
  const [status, setStatus] = useState('pending');
  const [instance, setInstance] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  
  // ... resto do código existente ...

  // 🆕 NOVA FUNÇÃO: Conectar com navegador visível
  async function handleConnectVisible() {
    try {
      setIsConnecting(true);
      
      const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || '';
      const response = await fetch(`${API_URL}/api/instances/${id}/connect-visible`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert('✅ ' + data.message + '\n\n📱 Escaneie o QR Code na janela do navegador Chrome que será aberta!');
        console.log('Navegador Chrome abrindo...');
        
        // Inicia polling para verificar quando conectar
        const pollInterval = setInterval(async () => {
          const inst = await getInstanceDetails(id);
          if (inst && inst.phone_number) {
            setStatus('connected');
            setInstance(inst);
            setIsConnecting(false);
            clearInterval(pollInterval);
            alert('🎉 WhatsApp conectado com sucesso!\n📞 Número: ' + inst.phone_number);
          }
        }, 3000);
        
        // Para o polling após 5 minutos
        setTimeout(() => {
          clearInterval(pollInterval);
          setIsConnecting(false);
        }, 5 * 60 * 1000);
        
      } else {
        alert('❌ Erro: ' + (data.error || 'Erro desconhecido'));
        setIsConnecting(false);
      }
    } catch (err) {
      console.error('Erro ao conectar:', err);
      alert('❌ Erro ao iniciar conexão visível: ' + err.message);
      setIsConnecting(false);
    }
  }

  // 🆕 NOVA FUNÇÃO: Desconectar sessão visível
  async function handleDisconnectVisible() {
    if (!window.confirm('Desconectar a sessão visível do WhatsApp?')) return;
    
    try {
      const API_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, '') || '';
      const response = await fetch(`${API_URL}/api/instances/${id}/disconnect-visible`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        alert('✅ ' + data.message);
        setStatus('pending');
        setInstance({ ...instance, phone_number: null });
      } else {
        alert('❌ Erro: ' + (data.error || 'Erro desconhecido'));
      }
    } catch (err) {
      console.error('Erro ao desconectar:', err);
      alert('❌ Erro ao desconectar sessão visível: ' + err.message);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-dark-bg via-dark-bg to-card-bg">
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        
        {/* ... Header existente ... */}

        {/* 🆕 NOVA SEÇÃO: Conexão com Navegador Visível */}
        <div className="bg-gradient-to-br from-card-bg to-dark-bg border border-green-500/30 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Conexão com Navegador Visível</h3>
              <p className="text-sm text-gray-400">Modo de desenvolvimento - Navegador Chrome será aberto</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div className="text-sm text-blue-200">
                  <p className="font-medium mb-1">ℹ️ Como funciona:</p>
                  <ul className="list-disc list-inside space-y-1 text-blue-300">
                    <li>O navegador Chrome será aberto automaticamente</li>
                    <li>O QR Code do WhatsApp aparecerá na tela</li>
                    <li>Escaneie com seu celular para conectar</li>
                    <li>Ideal para desenvolvimento local</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div className="text-sm text-yellow-200">
                  <p className="font-medium mb-1">⚠️ Atenção:</p>
                  <p className="text-yellow-300">
                    Esta funcionalidade só funciona em ambiente local. 
                    Não utilize em servidores remotos (Render, AWS, etc).
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={handleConnectVisible}
                disabled={isConnecting || status === 'connected'}
                className="flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white px-6 py-3 rounded-lg font-medium shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                {isConnecting ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Abrindo navegador...
                  </>
                ) : (
                  '🌐 Conectar com Navegador Visível'
                )}
              </button>

              {status === 'connected' && (
                <button 
                  onClick={handleDisconnectVisible}
                  className="px-6 py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-400 rounded-lg font-medium transition-all"
                >
                  Desconectar Visível
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ... Resto do componente existente ... */}

      </div>
    </div>
  );
}
