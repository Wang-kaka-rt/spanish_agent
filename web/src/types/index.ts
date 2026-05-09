export type ModelProvider = 'anthropic' | 'local' | 'openai_compatible'

export interface ModelConfig {
  provider: ModelProvider
  apiKey: string
  baseUrl: string
  modelId: string
  temperature: number
}

export interface ModelProfile {
  id: string
  name: string
  config: ModelConfig
}

export interface AppSettings {
  serverUrl: string
  modelProfiles: ModelProfile[]
  activeModelProfileId: string
  modelConfig: ModelConfig
}

export interface HealthResponse {
  status: string
  app: string
  database: string
  storage: string
}

export interface TemplateItem {
  id: string
  title: string
  category: string
  subcategory?: string | null
  file_name: string
  raw_text: string
  is_active: boolean
}

export interface LawItem {
  id: string
  boe_id: string
  title: string
  category?: string | null
  raw_text: string
}

export interface ContractItem {
  id: string
  title: string
  template_id?: string | null
  order_input: string
  extracted_fields: Record<string, string>
  generated_text?: string | null
  laws_used: Array<{ boe_id: string; title: string }>
  status: string
  export_docx_path?: string | null
  export_pdf_path?: string | null
  created_at?: string | null
}

export interface ChatSessionItem {
  id: string
  title?: string | null
  created_at: string
}

export interface MessageItem {
  id: string
  session_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}
