import axios from 'axios'

import type { AppSettings, ContractItem, HealthResponse, LawItem, MessageItem, TemplateItem } from '../types'

function createClient(settings: AppSettings) {
  return axios.create({
    baseURL: `${settings.serverUrl}/api`,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
      'X-Model-Provider': settings.modelConfig.provider,
      'X-Model-Id': settings.modelConfig.modelId,
      'X-Model-Base-Url': settings.modelConfig.baseUrl,
      'X-Model-Api-Key': settings.modelConfig.apiKey,
      'X-Model-Temperature': String(settings.modelConfig.temperature)
    }
  })
}

export const api = {
  async testModel(serverUrl: string, config: AppSettings['modelConfig']): Promise<{ ok: boolean; latency_ms: number; error?: string }> {
    const { data } = await axios.post(`${serverUrl}/api/ai/test`, {
      provider: config.provider,
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      modelId: config.modelId,
      temperature: config.temperature,
    })
    return data
  },
  async health(settings: AppSettings) {
    const client = createClient(settings)
    const { data } = await client.get<HealthResponse>('/health')
    return data
  },
  async listTemplates(settings: AppSettings) {
    const client = createClient(settings)
    const { data } = await client.get<TemplateItem[]>('/templates')
    return data
  },
  async uploadTemplate(settings: AppSettings, formData: FormData) {
    const { data } = await axios.post<TemplateItem>(`${settings.serverUrl}/api/templates/upload`, formData, {
      headers: {
        'X-Model-Provider': settings.modelConfig.provider,
        'X-Model-Id': settings.modelConfig.modelId,
        'X-Model-Base-Url': settings.modelConfig.baseUrl,
        'X-Model-Api-Key': settings.modelConfig.apiKey,
        'X-Model-Temperature': String(settings.modelConfig.temperature)
      }
    })
    return data
  },
  async deactivateTemplate(settings: AppSettings, templateId: string) {
    const client = createClient(settings)
    const { data } = await client.delete<TemplateItem>(`/templates/${templateId}`)
    return data
  },
  async getTemplate(settings: AppSettings, templateId: string) {
    const client = createClient(settings)
    const { data } = await client.get<TemplateItem>(`/templates/${templateId}`)
    return data
  },
  async searchBoe(settings: AppSettings, query: string) {
    const client = createClient(settings)
    const { data } = await client.get<Array<{ boe_id: string; title: string; source_url?: string }>>('/laws/boe/search', {
      params: { q: query }
    })
    return data
  },
  async fetchLaw(settings: AppSettings, payload: { boe_id: string; title?: string; source_url?: string }) {
    const client = createClient(settings)
    const { data } = await client.post<LawItem>('/laws/boe/fetch', payload)
    return data
  },
  async listLaws(settings: AppSettings) {
    const client = createClient(settings)
    const { data } = await client.get<LawItem[]>('/laws')
    return data
  },
  async deleteLaw(settings: AppSettings, lawId: string) {
    const client = createClient(settings)
    await client.delete(`/laws/${lawId}`)
  },
  async generateContract(settings: AppSettings, payload: { title?: string; order_input: string; model_config: AppSettings['modelConfig'] }) {
    const client = createClient(settings)
    const { data } = await client.post<ContractItem>('/contracts/generate', payload, { timeout: 300000 })
    return data
  },
  async listContracts(settings: AppSettings) {
    const client = createClient(settings)
    const { data } = await client.get<ContractItem[]>('/contracts')
    return data
  },
  async getContract(settings: AppSettings, contractId: string) {
    const client = createClient(settings)
    const { data } = await client.get<ContractItem>(`/contracts/${contractId}`)
    return data
  },
  async updateContract(settings: AppSettings, contractId: string, payload: { title?: string; generated_text: string; status: string }) {
    const client = createClient(settings)
    const { data } = await client.put<ContractItem>(`/contracts/${contractId}`, payload)
    return data
  },
  async deleteContract(settings: AppSettings, contractId: string) {
    const client = createClient(settings)
    await client.delete(`/contracts/${contractId}`)
  },
  contractDocxUrl(settings: AppSettings, contractId: string) {
    return `${settings.serverUrl}/api/contracts/${contractId}/export/docx`
  },
  contractPdfUrl(settings: AppSettings, contractId: string) {
    return `${settings.serverUrl}/api/contracts/${contractId}/export/pdf`
  },
  async createChatSession(settings: AppSettings, title?: string) {
    const client = createClient(settings)
    const { data } = await client.post('/chat/sessions', { title })
    return data
  },
  async listChatSessions(settings: AppSettings) {
    const client = createClient(settings)
    const { data } = await client.get('/chat/sessions')
    return data
  },
  async getChatHistory(settings: AppSettings, sessionId: string) {
    const client = createClient(settings)
    const { data } = await client.get<MessageItem[]>(`/chat/sessions/${sessionId}/history`)
    return data
  }
}
