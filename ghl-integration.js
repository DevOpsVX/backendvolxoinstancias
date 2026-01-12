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
 * Normaliza número de telefone para formato consistente
 * @param {string} phoneNumber - Número de telefone
 * @returns {string} - Número normalizado
 */
function normalizePhoneNumber(phoneNumber) {
  // Remove todos os caracteres não numéricos exceto +
  let cleaned = phoneNumber.replace(/[^\d+]/g, '');
  
  // Se não começa com +, adiciona
  if (!cleaned.startsWith('+')) {
    cleaned = '+' + cleaned;
  }
  
  return cleaned;
}

/**
 * Busca um contato no GHL pelo número de telefone
 * CORRIGIDO: Usa busca mais precisa e normalização consistente
 * @param {string} accessToken - Token de acesso do GHL
 * @param {string} locationId - ID da location no GHL
 * @param {string} phoneNumber - Número de telefone
 * @returns {Promise<object|null>} - Contato encontrado ou null
 */
export async function findContactInGHL(accessToken, locationId, phoneNumber) {
  try {
    console.log('[GHL] 🔍 Buscando contato:', {
      phoneNumber: phoneNumber,
      locationId: locationId
    });
    
    // Normaliza o número para garantir formato consistente
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    console.log('[GHL] Número normalizado:', normalizedPhone);
    
    // Tenta buscar com o número normalizado
    const searchVariants = [
      normalizedPhone,                    // +5562995769957
      normalizedPhone.substring(1),       // 5562995769957
      normalizedPhone.replace('+', '')    // 5562995769957 (redundante mas seguro)
    ];
    
    // Remove duplicatas
    const uniqueVariants = [...new Set(searchVariants)];
    
    for (const variant of uniqueVariants) {
      console.log('[GHL] Tentando buscar com variante:', variant);
      
      const response = await fetch(
        `https://services.leadconnectorhq.com/contacts/?locationId=${locationId}&query=${encodeURIComponent(variant)}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Version': '2021-07-28'
          }
        }
      );
      
      const data = await response.json();
      
      if (!response.ok) {
        console.error('[GHL] Erro ao buscar contato com variante', variant, ':', data);
        continue; // Tenta próxima variante
      }
      
      console.log('[GHL] Resultado da busca com variante', variant, ':', {
        totalContacts: data.contacts?.length || 0,
        contacts: data.contacts?.map(c => ({ id: c.id, phone: c.phone, name: c.name }))
      });
      
      if (data.contacts && data.contacts.length > 0) {
        // Verifica se algum contato tem o número exato
        for (const contact of data.contacts) {
          const contactPhone = normalizePhoneNumber(contact.phone || '');
          console.log('[GHL] Comparando:', {
            contactPhone: contactPhone,
            normalizedPhone: normalizedPhone,
            match: contactPhone === normalizedPhone
          });
          
          if (contactPhone === normalizedPhone) {
            console.log('[GHL] ✅ Contato encontrado (match exato):', {
              id: contact.id,
              phone: contact.phone,
              name: contact.name
            });
            return contact;
          }
        }
        
        // Se não encontrou match exato mas tem contatos, retorna o primeiro
        console.log('[GHL] ⚠️ Contato encontrado (match parcial):', {
          id: data.contacts[0].id,
          phone: data.contacts[0].phone,
          name: data.contacts[0].name
        });
        return data.contacts[0];
      }
    }
    
    console.log('[GHL] ❌ Contato não encontrado após todas as tentativas');
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
    console.log('[GHL] ➕ Criando novo contato:', {
      phoneNumber: phoneNumber,
      name: name,
      locationId: locationId
    });
    
    // Normaliza o número antes de criar
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    console.log('[GHL] Número normalizado para criação:', normalizedPhone);
    
    // ⚠️ VERIFICAÇÃO DUPLA: Busca novamente antes de criar para evitar duplicatas
    console.log('[GHL] Verificando novamente antes de criar...');
    const existingContact = await findContactInGHL(accessToken, locationId, normalizedPhone);
    if (existingContact) {
      console.log('[GHL] ⚠️ Contato já existe! Retornando contato existente:', existingContact.id);
      return existingContact;
    }
    
    const contactData = {
      locationId: locationId,
      phone: normalizedPhone
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
        console.log('[GHL] ⚠️ Contato duplicado detectado, buscando contactId existente');
        if (data.meta && data.meta.contactId) {
          console.log('[GHL] ✅ ContactId do duplicado:', data.meta.contactId);
          // Retorna objeto no mesmo formato
          return { id: data.meta.contactId };
        }
        
        // Se não veio o contactId no erro, tenta buscar novamente
        console.log('[GHL] Tentando buscar contato duplicado...');
        const existingContact = await findContactInGHL(accessToken, locationId, normalizedPhone);
        if (existingContact) {
          console.log('[GHL] ✅ Contato duplicado encontrado na busca:', existingContact.id);
          return existingContact;
        }
      }
      
      console.error('[GHL] Erro ao criar contato:', data);
      throw new Error(`Erro ao criar contato: ${JSON.stringify(data)}`);
    }
    
    console.log('[GHL] ✅ Contato criado com sucesso:', data.contact.id);
    return data.contact;
  } catch (err) {
    console.error('[GHL] Exceção ao criar contato:', err);
    throw err;
  }
}

/**
 * Busca ou cria um contato no GHL
 * CORRIGIDO: Implementa cache local e melhor tratamento de duplicatas
 * @param {string} accessToken - Token de acesso do GHL
 * @param {string} locationId - ID da location no GHL
 * @param {string} phoneNumber - Número de telefone
 * @param {string} name - Nome do contato (opcional)
 * @returns {Promise<string>} - ID do contato
 */
// Cache de contatos por número (em memória)
const contactCache = new Map();

export async function findOrCreateContactInGHL(accessToken, locationId, phoneNumber, name = null) {
  try {
    // Normaliza o número para usar como chave do cache
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    const cacheKey = `${locationId}:${normalizedPhone}`;
    
    // Verifica cache
    if (contactCache.has(cacheKey)) {
      const cachedContactId = contactCache.get(cacheKey);
      console.log('[GHL] ✅ Contato encontrado no cache:', cachedContactId);
      return cachedContactId;
    }
    
    // Tenta buscar contato existente
    console.log('[GHL] Buscando contato existente...');
    const existingContact = await findContactInGHL(accessToken, locationId, normalizedPhone);
    
    if (existingContact) {
      console.log('[GHL] ✅ Contato existente encontrado:', existingContact.id);
      // Adiciona ao cache
      contactCache.set(cacheKey, existingContact.id);
      return existingContact.id;
    }
    
    // Se não encontrou, cria novo contato
    console.log('[GHL] Criando novo contato...');
    const newContact = await createContactInGHL(accessToken, locationId, normalizedPhone, name);
    
    // Adiciona ao cache
    contactCache.set(cacheKey, newContact.id);
    console.log('[GHL] ✅ Novo contato criado e adicionado ao cache:', newContact.id);
    
    return newContact.id;
  } catch (err) {
    console.error('[GHL] Erro ao buscar ou criar contato:', err);
    throw err;
  }
}

/**
 * Limpa o cache de contatos (útil para testes ou reset)
 */
export function clearContactCache() {
  contactCache.clear();
  console.log('[GHL] Cache de contatos limpo');
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
