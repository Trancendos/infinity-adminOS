import React, { useState, useEffect } from 'react';
import { useAuth } from '../providers/AuthProvider';

/* ─────────────────────────────────────────────
   Infinity OS — Enhanced AI Builder
   Custom AI creation with OpenRouter, Hugging Face,
   offline models, plugin management, and multi-provider
   orchestration. Zero vendor lock-in.
   ───────────────────────────────────────────── */

interface AIProvider {
  id: string;
  name: string;
  type: 'cloud' | 'offline';
  description: string;
  freeTier: string;
  models: AIModel[];
  configured: boolean;
  status: 'healthy' | 'degraded' | 'offline';
}

interface AIModel {
  id: string;
  provider: string;
  name: string;
  type: 'chat' | 'embedding' | 'sentiment' | 'generation' | 'translation';
  contextWindow: string;
  costPer1kTokens: string;
  capabilities: string[];
  offline: boolean;
  downloaded?: boolean;
  downloadSize?: string;
}

interface AIPlugin {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: 'tool' | 'memory' | 'retrieval' | 'output' | 'guard' | 'transform';
  offline: boolean;
  functions: string[];
}

interface CustomAI {
  id: string;
  name: string;
  description: string;
  providers: string[]; // Multi-provider support
  primaryModel: string;
  fallbackModels: string[];
  plugins: string[];
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  strategy: 'direct' | 'chain-of-thought' | 'react' | 'tree-of-thought' | 'self-consistency';
  guardrails: string[];
  offline: boolean;
  status: 'active' | 'draft' | 'testing';
}

// Mock data for providers and models
const PROVIDERS: AIProvider[] = [
  {
    id: 'workers-ai',
    name: 'Cloudflare Workers AI',
    type: 'cloud',
    description: 'Cloudflare\'s edge AI with 50+ models, zero-cost tier',
    freeTier: '100K req/day',
    configured: true,
    status: 'healthy',
    models: [
      { id: '@cf/meta/llama-3.1-8b-instruct', provider: 'workers-ai', name: 'Llama 3.1 8B', type: 'chat', contextWindow: '4K', costPer1kTokens: '$0', capabilities: ['chat', 'reasoning'], offline: false },
      { id: '@cf/meta/llama-3.1-70b-instruct', provider: 'workers-ai', name: 'Llama 3.1 70B', type: 'chat', contextWindow: '4K', costPer1kTokens: '$0', capabilities: ['chat', 'reasoning'], offline: false },
      { id: '@cf/baai/bge-base-en-v1.5', provider: 'workers-ai', name: 'BGE Base Embeddings', type: 'embedding', contextWindow: '512', costPer1kTokens: '$0', capabilities: ['embeddings'], offline: false },
    ]
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    type: 'cloud',
    description: '100+ models from 20+ providers with automatic routing',
    freeTier: '1 req/sec, 200/day',
    configured: false,
    status: 'offline',
    models: [
      { id: 'anthropic/claude-3.5-sonnet', provider: 'openrouter', name: 'Claude 3.5 Sonnet', type: 'chat', contextWindow: '8K', costPer1kTokens: '$3', capabilities: ['chat', 'reasoning', 'vision'], offline: false },
      { id: 'openai/gpt-4o', provider: 'openrouter', name: 'GPT-4o', type: 'chat', contextWindow: '16K', costPer1kTokens: '$2.5', capabilities: ['chat', 'reasoning', 'vision'], offline: false },
      { id: 'meta-llama/llama-3.1-70b-instruct', provider: 'openrouter', name: 'Llama 3.1 70B', type: 'chat', contextWindow: '4K', costPer1kTokens: '$0.5', capabilities: ['chat', 'reasoning'], offline: false },
    ]
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    type: 'cloud',
    description: '500,000+ open-source models via Inference API',
    freeTier: '30K chars/month',
    configured: false,
    status: 'offline',
    models: [
      { id: 'microsoft/DialoGPT-medium', provider: 'huggingface', name: 'DialoGPT Medium', type: 'chat', contextWindow: '1K', costPer1kTokens: '$0.5', capabilities: ['chat'], offline: false },
      { id: 'facebook/blenderbot-400M-distill', provider: 'huggingface', name: 'BlenderBot 400M', type: 'chat', contextWindow: '1K', costPer1kTokens: '$0.5', capabilities: ['chat'], offline: false },
    ]
  },
  {
    id: 'offline',
    name: 'Offline (Local)',
    type: 'offline',
    description: 'Run models locally in your browser',
    freeTier: 'Unlimited',
    configured: true,
    status: 'healthy',
    models: [
      { id: 'Xenova/distilbert-base-uncased-finetuned-sst-2-english', provider: 'offline', name: 'DistilBERT SST-2', type: 'sentiment', contextWindow: '512', costPer1kTokens: '$0', capabilities: ['sentiment'], offline: true, downloaded: false, downloadSize: '67MB' },
      { id: 'Xenova/all-MiniLM-L6-v2', provider: 'offline', name: 'All MiniLM L6 v2', type: 'embedding', contextWindow: '512', costPer1kTokens: '$0', capabilities: ['embeddings'], offline: true, downloaded: true, downloadSize: '23MB' },
      { id: 'Xenova/gpt2', provider: 'offline', name: 'GPT-2 Small', type: 'generation', contextWindow: '1K', costPer1kTokens: '$0', capabilities: ['generation'], offline: true, downloaded: false, downloadSize: '550MB' },
    ]
  }
];

const PLUGINS: AIPlugin[] = [
  { id: 'web-search', name: 'Web Search', icon: '🔍', description: 'Search the web for current information', category: 'retrieval', offline: false, functions: ['search', 'browse'] },
  { id: 'calculator', name: 'Calculator', icon: '🧮', description: 'Perform mathematical calculations', category: 'tool', offline: true, functions: ['calculate', 'solve'] },
  { id: 'code-executor', name: 'Code Executor', icon: '💻', description: 'Execute code in isolated environments', category: 'tool', offline: false, functions: ['run_code', 'test_code'] },
  { id: 'memory-manager', name: 'Memory Manager', icon: '🧠', description: 'Persistent conversation memory', category: 'memory', offline: true, functions: ['store', 'retrieve', 'search'] },
  { id: 'sentiment-analyzer', name: 'Sentiment Analyzer', icon: '😊', description: 'Analyze text sentiment and emotion', category: 'transform', offline: true, functions: ['analyze_sentiment'] },
  { id: 'content-moderator', name: 'Content Moderator', icon: '🛡️', description: 'Filter inappropriate content', category: 'guard', offline: true, functions: ['moderate', 'filter'] },
];

export function AIBuilder() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'models' | 'plugins' | 'builder' | 'testing'>('models');
  const [selectedProviders, setSelectedProviders] = useState<string[]>(['workers-ai']);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [customAIs, setCustomAIs] = useState<CustomAI[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const availableModels = PROVIDERS.flatMap(p =>
    p.models.filter(m => selectedProviders.includes(p.id))
  );

  const handleProviderToggle = (providerId: string) => {
    setSelectedProviders(prev =>
      prev.includes(providerId)
        ? prev.filter(id => id !== providerId)
        : [...prev, providerId]
    );
  };

  const handleModelDownload = async (modelId: string) => {
    // Implement offline model download
    console.log(`Downloading model: ${modelId}`);
    // Update model status to downloaded
  };

  const handleCreateAI = async () => {
    setIsCreating(true);
    // Implement AI creation logic
    setTimeout(() => {
      setIsCreating(false);
      // Add new AI to list
    }, 2000);
  };

  return (
    <div className="ai-builder">
      <div className="ai-builder-header">
        <h1>🤖 AI Builder</h1>
        <p>Build custom AI agents with multi-provider support, offline capabilities, and advanced plugins</p>
      </div>

      <div className="ai-builder-tabs">
        <button
          className={activeTab === 'models' ? 'active' : ''}
          onClick={() => setActiveTab('models')}
        >
          Models & Providers
        </button>
        <button
          className={activeTab === 'plugins' ? 'active' : ''}
          onClick={() => setActiveTab('plugins')}
        >
          Plugins
        </button>
        <button
          className={activeTab === 'builder' ? 'active' : ''}
          onClick={() => setActiveTab('builder')}
        >
          AI Builder
        </button>
        <button
          className={activeTab === 'testing' ? 'active' : ''}
          onClick={() => setActiveTab('testing')}
        >
          Testing
        </button>
      </div>

      <div className="ai-builder-content">
        {activeTab === 'models' && (
          <div className="models-tab">
            <div className="provider-selector">
              <h3>Select AI Providers</h3>
              <div className="providers-grid">
                {PROVIDERS.map(provider => (
                  <div key={provider.id} className="provider-card">
                    <div className="provider-header">
                      <input
                        type="checkbox"
                        checked={selectedProviders.includes(provider.id)}
                        onChange={() => handleProviderToggle(provider.id)}
                      />
                      <h4>{provider.name}</h4>
                      <span className={`status ${provider.status}`}>
                        {provider.status}
                      </span>
                    </div>
                    <p>{provider.description}</p>
                    <small>Free Tier: {provider.freeTier}</small>
                    {!provider.configured && (
                      <div className="configure-prompt">
                        <button className="configure-btn">Configure API Key</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="models-list">
              <h3>Available Models</h3>
              <div className="models-grid">
                {availableModels.map(model => (
                  <div key={model.id} className="model-card">
                    <div className="model-header">
                      <h4>{model.name}</h4>
                      <span className="model-type">{model.type}</span>
                      {model.offline && (
                        <span className="offline-badge">Offline</span>
                      )}
                    </div>
                    <div className="model-meta">
                      <span>Context: {model.contextWindow}</span>
                      <span>Cost: {model.costPer1kTokens}/1K</span>
                    </div>
                    <div className="model-capabilities">
                      {model.capabilities.map(cap => (
                        <span key={cap} className="capability-tag">{cap}</span>
                      ))}
                    </div>
                    {model.offline && (
                      <div className="download-section">
                        {!model.downloaded ? (
                          <button
                            className="download-btn"
                            onClick={() => handleModelDownload(model.id)}
                          >
                            Download ({model.downloadSize})
                          </button>
                        ) : (
                          <span className="downloaded">✓ Downloaded</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'plugins' && (
          <div className="plugins-tab">
            <h3>AI Plugins</h3>
            <div className="plugins-grid">
              {PLUGINS.map(plugin => (
                <div key={plugin.id} className="plugin-card">
                  <div className="plugin-header">
                    <span className="plugin-icon">{plugin.icon}</span>
                    <h4>{plugin.name}</h4>
                    <span className="plugin-category">{plugin.category}</span>
                    {plugin.offline && (
                      <span className="offline-badge">Offline</span>
                    )}
                  </div>
                  <p>{plugin.description}</p>
                  <div className="plugin-functions">
                    {plugin.functions.map(func => (
                      <span key={func} className="function-tag">{func}</span>
                    ))}
                  </div>
                  <button className="add-plugin-btn">Add to AI</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'builder' && (
          <div className="builder-tab">
            <div className="builder-form">
              <h3>Create Custom AI</h3>

              <div className="form-group">
                <label>AI Name</label>
                <input type="text" placeholder="My Custom AI" />
              </div>

              <div className="form-group">
                <label>Description</label>
                <textarea placeholder="Describe your AI's purpose and capabilities" />
              </div>

              <div className="form-group">
                <label>Primary Model</label>
                <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
                  <option value="">Select a model...</option>
                  {availableModels.map(model => (
                    <option key={model.id} value={model.id}>
                      {model.name} ({model.provider})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Fallback Models</label>
                <div className="fallback-models">
                  {availableModels.filter(m => m.id !== selectedModel).slice(0, 3).map(model => (
                    <label key={model.id}>
                      <input type="checkbox" />
                      {model.name}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>System Prompt</label>
                <textarea placeholder="You are a helpful AI assistant..." />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Temperature</label>
                  <input type="range" min="0" max="2" step="0.1" defaultValue="0.7" />
                </div>
                <div className="form-group">
                  <label>Max Tokens</label>
                  <input type="number" defaultValue="1024" />
                </div>
              </div>

              <div className="form-group">
                <label>Strategy</label>
                <select defaultValue="direct">
                  <option value="direct">Direct Response</option>
                  <option value="chain-of-thought">Chain of Thought</option>
                  <option value="react">ReAct</option>
                  <option value="tree-of-thought">Tree of Thought</option>
                </select>
              </div>

              <div className="form-group">
                <label>
                  <input type="checkbox" />
                  Enable Offline Mode
                </label>
              </div>

              <button
                className="create-ai-btn"
                onClick={handleCreateAI}
                disabled={isCreating}
              >
                {isCreating ? 'Creating...' : 'Create AI'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'testing' && (
          <div className="testing-tab">
            <h3>Test Your AI</h3>
            <div className="test-interface">
              <div className="test-chat">
                {/* Chat interface for testing */}
              </div>
              <div className="test-controls">
                <button>Test Prompt</button>
                <button>Run Benchmark</button>
                <button>Export Results</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AIBuilder;</content>
<parameter name="filePath">C:\Development\infinity-adminOS\apps\shell\src\views\AIBuilderEnhanced.tsx