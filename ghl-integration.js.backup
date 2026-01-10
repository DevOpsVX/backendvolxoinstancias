import fetch from 'node-fetch';

/**
 * Envia uma mensagem inbound (recebida no WhatsApp) para o GHL
 * @param {string} accessToken - Token de acesso do GHL
 * @param {object} messageData - Dados da mensagem
 * @returns {Promise<object>} - Resposta da API do GHL
 */
export async function sendInboundMessageToGHL(accessToken, messageData) {
  try {
    console.log('[GHL] Enviando mensagem inbound para GHL:', messageData);
    
    const response = await fetch('https://services.leadconnectorhq.com/conversations/messages/inbound', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28'
      },
      body: JSON.stringify(messageData)
    });
    
    const responseData = await response.json();
    
    if (!response.ok) {
      console.error('[GHL] Erro ao enviar mensagem para GHL:', responseData);
      throw new Error(`Erro ao enviar mensagem para GHL: ${JSON.stringify(responseData)}`);
    }
    
    console.log('[GHL] Mensagem enviada com sucesso:', responseData);
    return responseData;
  } catch (err) {
    console.error('[GHL] Exceção ao enviar mensagem inbound:', err);
    throw err;
  }
}

/**
 * Busca um contato no GHL pelo número de telefone
 * @param {string} accessToken - Token de acesso do GHL
 * @param {string} locationId - ID da location no GHL
 * @param {string} phoneNumber - Número de telefone
 * @returns {Promise<object|null>} - Contato encontrado ou null
 */
export async function findContactInGHL(accessToken, locationId, phoneNumber) {
  try {
    console.log('[GHL] Buscando contato:', phoneNumber);
    
    // Remove caracteres especiais do número para busca
    const cleanPhone = phoneNumber.replace(/[^\d+]/g, '');
    
    const response = await fetch(
      `https://services.leadconnectorhq.com/contacts/?locationId=${locationId}&query=${encodeURIComponent(cleanPhone)}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Version': '2021-07-28'
        }
      }
    );
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('[GHL] Erro ao buscar contato:', data);
      return null;
    }
    
    if (data.contacts && data.contacts.length > 0) {
      console.log('[GHL] Contato encontrado:', data.contacts[0].id);
      return data.contacts[0];
    }
    
    console.log('[GHL] Contato não encontrado');
    return null;
  } catch (err) {
    console.error('[GHL] Exceção ao buscar contato:', err);
    return null;
  }
}

/**
 * Cria um novo contato no GHL
 * @param {string} accessToken - Token de acesso do GHL
 * @param {string} locationId - ID da location no GHL
 * @param {string} phoneNumber - Número de telefone
 * @param {string} name - Nome do contato (opcional)
 * @returns {Promise<object>} - Contato criado
 */
export async function createContactInGHL(accessToken, locationId, phoneNumber, name = null) {
  try {
    console.log('[GHL] Criando novo contato:', phoneNumber);
    
    const contactData = {
      locationId: locationId,
      phone: phoneNumber
    };
    
    if (name) {
      contactData.name = name;
    }
    
    const response = await fetch('https://services.leadconnectorhq.com/contacts/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28'
      },
      body: JSON.stringify(contactData)
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      // Tratamento especial para contato duplicado
      if (data.message && data.message.includes('duplicated contacts')) {
        console.log('[GHL] Contato duplicado detectado, usando contactId existente');
        if (data.meta && data.meta.contactId) {
          console.log('[GHL] ContactId do duplicado:', data.meta.contactId);
          // Retorna objeto no mesmo formato
          return { id: data.meta.contactId };
        }
      }
      
      console.error('[GHL] Erro ao criar contato:', data);
      throw new Error(`Erro ao criar contato: ${JSON.stringify(data)}`);
    }
    
    console.log('[GHL] Contato criado com sucesso:', data.contact.id);
    return data.contact;
  } catch (err) {
    console.error('[GHL] Exceção ao criar contato:', err);
    throw err;
  }
}

/**
 * Busca ou cria um contato no GHL
 * @param {string} accessToken - Token de acesso do GHL
 * @param {string} locationId - ID da location no GHL
 * @param {string} phoneNumber - Número de telefone
 * @param {string} name - Nome do contato (opcional)
 * @returns {Promise<string>} - ID do contato
 */
export async function findOrCreateContactInGHL(accessToken, locationId, phoneNumber, name = null) {
  try {
    // Tenta buscar contato existente
    const existingContact = await findContactInGHL(accessToken, locationId, phoneNumber);
    
    if (existingContact) {
      return existingContact.id;
    }
    
    // Se não encontrou, cria novo contato
    const newContact = await createContactInGHL(accessToken, locationId, phoneNumber, name);
    return newContact.id;
  } catch (err) {
    console.error('[GHL] Erro ao buscar ou criar contato:', err);
    throw err;
  }
}

/**
 * Atualiza o status de uma mensagem no GHL
 * @param {string} accessToken - Token de acesso do GHL
 * @param {string} messageId - ID da mensagem no GHL
 * @param {string} status - Status da mensagem (delivered, read, failed, etc.)
 * @returns {Promise<object>} - Resposta da API do GHL
 */
export async function updateMessageStatusInGHL(accessToken, messageId, status) {
  try {
    console.log('[GHL] Atualizando status da mensagem:', messageId, status);
    
    const response = await fetch(
      `https://services.leadconnectorhq.com/conversations/messages/${messageId}/status`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Version': '2021-07-28'
        },
        body: JSON.stringify({ status })
      }
    );
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('[GHL] Erro ao atualizar status:', data);
      throw new Error(`Erro ao atualizar status: ${JSON.stringify(data)}`);
    }
    
    console.log('[GHL] Status atualizado com sucesso');
    return data;
  } catch (err) {
    console.error('[GHL] Exceção ao atualizar status:', err);
    throw err;
  }
}

/**
 * Obtém informações da location no GHL
 * @param {string} accessToken - Token de acesso do GHL
 * @returns {Promise<object>} - Informações da location
 */
export async function getLocationInfo(accessToken) {
  try {
    console.log('[GHL] Obtendo informações da location');
    
    const response = await fetch('https://services.leadconnectorhq.com/locations/search', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Version': '2021-07-28'
      }
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('[GHL] Erro ao obter location:', data);
      throw new Error(`Erro ao obter location: ${JSON.stringify(data)}`);
    }
    
    console.log('[GHL] Location obtida com sucesso');
    return data;
  } catch (err) {
    console.error('[GHL] Exceção ao obter location:', err);
    throw err;
  }
}

/**
 * Busca o Conversation Provider ID da Location (não confundir com Developer Provider ID)
 * @param {string} accessToken - Token de acesso do GHL
 * @returns {Promise<string|null>} - Provider ID da location ou null
 */
export async function getLocationConversationProviderId(accessToken) {
  try {
    console.log('[GHL] Buscando Conversation Provider ID da Location...');
    
    const response = await fetch('https://services.leadconnectorhq.com/conversations/providers', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28'
      }
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('[GHL] Erro ao buscar providers:', data);
      return null;
    }
    
    console.log('[GHL] Providers encontrados:', JSON.stringify(data, null, 2));
    
    // Log detalhado de cada provider para debug
    if (data.providers && Array.isArray(data.providers)) {
      data.providers.forEach((p, index) => {
        console.log(`[GHL] Provider ${index}:`, {
          id: p.id,
          name: p.name,
          type: p.type,
          isCustom: p.isCustom,
          enabled: p.enabled
        });
      });
    }
    
    // Procura pelo provider customizado (VolxoWPP)
    const customProvider = data.providers?.find(p => p.isCustom === true && p.type === 'SMS');
    
    if (customProvider) {
      console.log('[GHL] ✅ Location Provider ID encontrado:', customProvider.id);
      return customProvider.id;
    }
    
    console.log('[GHL] ⚠️ Nenhum provider customizado encontrado');
    return null;
  } catch (err) {
    console.error('[GHL] Exceção ao buscar Location Provider ID:', err);
    return null;
  }
}
