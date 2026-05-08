import { create } from 'zustand'

import type { AppSettings, ModelConfig, ModelProfile } from '../types'

const defaultModelConfig: ModelConfig = {
  provider: 'anthropic',
  apiKey: '',
  baseUrl: '',
  modelId: 'claude-opus-4-1',
  temperature: 0.1
}

const defaultProfile: ModelProfile = {
  id: 'default-anthropic',
  name: 'Anthropic 默认',
  config: defaultModelConfig
}

interface SettingsState extends AppSettings {
  loaded: boolean
  setServerUrl: (serverUrl: string) => void
  setModelConfig: (modelConfig: ModelConfig) => void
  addModelProfile: (profile: ModelProfile) => void
  updateModelProfile: (profileId: string, profile: Partial<ModelProfile>) => void
  deleteModelProfile: (profileId: string) => void
  setActiveModelProfileId: (profileId: string) => void
  loadFromElectron: () => Promise<void>
  persist: () => Promise<void>
}

function getActiveModelConfig(modelProfiles: ModelProfile[], activeModelProfileId: string): ModelConfig {
  const activeProfile = modelProfiles.find((profile) => profile.id === activeModelProfileId) ?? modelProfiles[0]
  return activeProfile?.config ?? defaultModelConfig
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  serverUrl: 'http://127.0.0.1:8000',
  modelProfiles: [defaultProfile],
  activeModelProfileId: defaultProfile.id,
  modelConfig: defaultModelConfig,
  loaded: false,
  setServerUrl: (serverUrl) => set({ serverUrl }),
  setModelConfig: (modelConfig) => set((state) => {
    const modelProfiles = state.modelProfiles.map((profile) =>
      profile.id === state.activeModelProfileId ? { ...profile, config: modelConfig } : profile
    )
    return {
      modelProfiles,
      modelConfig
    }
  }),
  addModelProfile: (profile) => set((state) => {
    const modelProfiles = [...state.modelProfiles, profile]
    return {
      modelProfiles,
      activeModelProfileId: profile.id,
      modelConfig: profile.config
    }
  }),
  updateModelProfile: (profileId, profilePatch) => set((state) => {
    const modelProfiles = state.modelProfiles.map((profile) =>
      profile.id === profileId
        ? {
            ...profile,
            ...profilePatch,
            config: profilePatch.config ? profilePatch.config : profile.config
          }
        : profile
    )
    return {
      modelProfiles,
      modelConfig: getActiveModelConfig(modelProfiles, state.activeModelProfileId)
    }
  }),
  deleteModelProfile: (profileId) => set((state) => {
    const filtered = state.modelProfiles.filter((profile) => profile.id !== profileId)
    const nextProfiles = filtered.length > 0 ? filtered : [defaultProfile]
    const nextActiveId = state.activeModelProfileId === profileId ? nextProfiles[0].id : state.activeModelProfileId
    return {
      modelProfiles: nextProfiles,
      activeModelProfileId: nextActiveId,
      modelConfig: getActiveModelConfig(nextProfiles, nextActiveId)
    }
  }),
  setActiveModelProfileId: (profileId) => set((state) => ({
    activeModelProfileId: profileId,
    modelConfig: getActiveModelConfig(state.modelProfiles, profileId)
  })),
  loadFromElectron: async () => {
    if (typeof window === 'undefined' || typeof window.electronAPI === 'undefined') {
      set({ loaded: true })
      return
    }
    const settings = await window.electronAPI.getSettings()
    set({
      ...settings,
      modelConfig: getActiveModelConfig(settings.modelProfiles, settings.activeModelProfileId),
      loaded: true
    })
  },
  persist: async () => {
    if (typeof window === 'undefined' || typeof window.electronAPI === 'undefined') {
      return
    }
    const payload = {
      serverUrl: get().serverUrl,
      modelProfiles: get().modelProfiles,
      activeModelProfileId: get().activeModelProfileId,
      modelConfig: get().modelConfig
    }
    const saved = await window.electronAPI.setSettings(payload)
    set({
      ...saved,
      modelConfig: getActiveModelConfig(saved.modelProfiles, saved.activeModelProfileId)
    })
  }
}))
