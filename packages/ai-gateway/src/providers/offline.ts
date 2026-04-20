/**
 * Offline AI Provider Base Class
 * ═══════════════════════════════════════════════════════════════
 * Base implementation for running AI models locally in the browser
 * using WebAssembly, ONNX Runtime, and Transformers.js.
 *
 * Features:
 * - WebAssembly model execution
 * - IndexedDB model caching
 * - Progressive enhancement (online → offline)
 * - Model download and management
 */

import type { AIProvider, AIRequest, AIResponse, ProviderHealth } from '../types';

export interface OfflineConfig {
  modelCacheName?: string;
  maxCacheSize?: number; // MB
  enableBackgroundDownload?: boolean;
}

export interface OfflineModel {
  id: string;
  name: string;
  file: string;
  size: number; // bytes
  type: 'onnx' | 'wasm' | 'transformers';
  capabilities: string[];
  downloaded: boolean;
  lastUsed: number;
}

export abstract class OfflineProvider implements AIProvider {
  readonly name: string;
  readonly displayName: string;

  protected config: OfflineConfig;
  protected modelCache: Map<string, WebAssembly.Instance | any> = new Map();
  protected availableModels: Map<string, OfflineModel> = new Map();
  protected db: IDBDatabase | null = null;

  constructor(name: string, displayName: string, config: OfflineConfig = {}) {
    this.name = name;
    this.displayName = displayName;
    this.config = {
      modelCacheName: 'ai-models-cache',
      maxCacheSize: 500, // 500MB default
      enableBackgroundDownload: true,
      ...config,
    };
  }

  abstract complete(request: AIRequest): Promise<AIResponse>;

  async healthCheck(): Promise<ProviderHealth> {
    const startTime = Date.now();

    try {
      // Check if we have any downloaded models
      const models = await this.getDownloadedModels();
      const hasModels = models.length > 0;

      // Test basic functionality
      const isFunctional = await this.testBasicFunctionality();

      return {
        healthy: hasModels && isFunctional,
        latencyMs: Date.now() - startTime,
        provider: this.name,
        error: !hasModels ? 'No models downloaded' : !isFunctional ? 'Basic functionality test failed' : undefined,
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - startTime,
        provider: this.name,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Initialize the offline provider
   */
  async initialize(): Promise<void> {
    await this.initIndexedDB();
    await this.loadModelRegistry();
  }

  /**
   * Download and cache a model for offline use
   */
  async downloadModel(modelId: string): Promise<void> {
    const model = this.availableModels.get(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found in registry`);
    }

    if (model.downloaded) {
      return; // Already downloaded
    }

    // Check available storage
    const availableSpace = await this.getAvailableStorage();
    if (model.size > availableSpace) {
      throw new Error(`Insufficient storage space. Required: ${model.size} bytes, Available: ${availableSpace} bytes`);
    }

    // Download model
    const response = await fetch(model.file);
    if (!response.ok) {
      throw new Error(`Failed to download model: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();

    // Store in IndexedDB
    await this.storeModelInDB(modelId, buffer);

    // Update model status
    model.downloaded = true;
    model.lastUsed = Date.now();
    await this.updateModelRegistry();

    // Load model into memory if needed
    await this.loadModel(modelId);
  }

  /**
   * Load a model into memory for inference
   */
  async loadModel(modelId: string): Promise<void> {
    if (this.modelCache.has(modelId)) {
      return; // Already loaded
    }

    const model = this.availableModels.get(modelId);
    if (!model || !model.downloaded) {
      throw new Error(`Model ${modelId} not downloaded`);
    }

    const modelData = await this.loadModelFromDB(modelId);
    const instance = await this.instantiateModel(modelData, model.type);

    this.modelCache.set(modelId, instance);

    // Update last used time
    model.lastUsed = Date.now();
    await this.updateModelRegistry();
  }

  /**
   * Unload a model from memory
   */
  async unloadModel(modelId: string): Promise<void> {
    this.modelCache.delete(modelId);

    // Run garbage collection if available
    if (typeof globalThis !== 'undefined' && globalThis.gc) {
      globalThis.gc();
    }
  }

  /**
   * Get list of downloaded models
   */
  async getDownloadedModels(): Promise<OfflineModel[]> {
    return Array.from(this.availableModels.values()).filter(model => model.downloaded);
  }

  /**
   * Get available storage space
   */
  async getAvailableStorage(): Promise<number> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return (estimate.quota || 0) - (estimate.usage || 0);
    }
    // Fallback: assume 500MB available
    return 500 * 1024 * 1024;
  }

  /**
   * Clean up old/unused models to free space
   */
  async cleanupStorage(targetFreeSpace?: number): Promise<void> {
    const models = Array.from(this.availableModels.values())
      .filter(model => model.downloaded)
      .sort((a, b) => a.lastUsed - b.lastUsed); // Oldest first

    let freedSpace = 0;
    const target = targetFreeSpace || (this.config.maxCacheSize! * 1024 * 1024 * 0.1); // Free 10% of cache

    for (const model of models) {
      if (freedSpace >= target) break;

      await this.deleteModel(model.id);
      freedSpace += model.size;
    }
  }

  // ─── Abstract Methods ─────────────────────────────────────────

  /**
   * Instantiate a model from downloaded data
   */
  protected abstract instantiateModel(data: ArrayBuffer, type: string): Promise<any>;

  /**
   * Run inference on a loaded model
   */
  protected abstract runInference(modelId: string, input: any): Promise<any>;

  /**
   * Test basic functionality
   */
  protected abstract testBasicFunctionality(): Promise<boolean>;

  // ─── Private Methods ──────────────────────────────────────────

  private async initIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.config.modelCacheName!, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('models')) {
          db.createObjectStore('models');
        }
        if (!db.objectStoreNames.contains('registry')) {
          db.createObjectStore('registry');
        }
      };
    });
  }

  private async loadModelRegistry(): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction(['registry'], 'readonly');
    const store = transaction.objectStore('registry');
    const request = store.get('models');

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const models = request.result as OfflineModel[] || [];
        this.availableModels = new Map(models.map(model => [model.id, model]));
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async updateModelRegistry(): Promise<void> {
    if (!this.db) return;

    const transaction = this.db.transaction(['registry'], 'readwrite');
    const store = transaction.objectStore('registry');
    const models = Array.from(this.availableModels.values());

    store.put(models, 'models');
  }

  private async storeModelInDB(modelId: string, data: ArrayBuffer): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(['models'], 'readwrite');
    const store = transaction.objectStore('models');
    await new Promise<void>((resolve, reject) => {
      const request = store.put(data, modelId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async loadModelFromDB(modelId: string): Promise<ArrayBuffer> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(['models'], 'readonly');
    const store = transaction.objectStore('models');
    const request = store.get(modelId);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async deleteModel(modelId: string): Promise<void> {
    if (!this.db) return;

    const model = this.availableModels.get(modelId);
    if (!model) return;

    // Remove from cache
    this.modelCache.delete(modelId);

    // Remove from database
    const transaction = this.db.transaction(['models'], 'readwrite');
    const store = transaction.objectStore('models');
    store.delete(modelId);

    // Update registry
    model.downloaded = false;
    await this.updateModelRegistry();
  }
}

export type { OfflineConfig, OfflineModel };</content>
<parameter name="filePath">C:\Development\infinity-adminOS\packages\ai-gateway\src\providers\offline.ts