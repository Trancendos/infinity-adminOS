// Threat Intelligence Module
// Collects, analyzes, and provides threat intelligence data

export interface ThreatData {
  id: string;
  type: "malware" | "phishing" | "ddos" | "vulnerability";
  severity: "low" | "medium" | "high" | "critical";
  source: string;
  description: string;
  indicators: string[];
  timestamp: number;
  confidence: number;
}

export interface ThreatAnalysis {
  totalThreats: number;
  highSeverityCount: number;
  recentThreats: ThreatData[];
  topThreatTypes: Record<string, number>;
  riskScore: number;
}

export class ThreatIntelligence {
  private threats: Map<string, ThreatData> = new Map();

  constructor(private kv: KVNamespace) {}

  // Collect threat data from various sources
  async collectThreatData(
    source: string,
    data: Partial<ThreatData>,
  ): Promise<void> {
    const threat: ThreatData = {
      id: crypto.randomUUID(),
      type: data.type || "malware",
      severity: data.severity || "medium",
      source,
      description: data.description || "Unknown threat",
      indicators: data.indicators || [],
      timestamp: Date.now(),
      confidence: data.confidence || 0.5,
      ...data,
    };

    this.threats.set(threat.id, threat);

    // Cache in KV for persistence
    await this.kv.put(`threat:${threat.id}`, JSON.stringify(threat), {
      expirationTtl: 86400 * 7, // 7 days
    });
  }

  // Analyze threat patterns
  async analyzeThreats(): Promise<ThreatAnalysis> {
    const allThreats = Array.from(this.threats.values());

    // Load additional threats from KV cache
    const kvThreats = await this.loadThreatsFromKV();
    allThreats.push(...kvThreats);

    const highSeverityCount = allThreats.filter(
      (t) => t.severity === "high" || t.severity === "critical",
    ).length;
    const recentThreats = allThreats
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10);

    const topThreatTypes = allThreats.reduce(
      (acc, threat) => {
        acc[threat.type] = (acc[threat.type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    // Calculate risk score based on threat patterns
    const riskScore = this.calculateRiskScore(allThreats);

    return {
      totalThreats: allThreats.length,
      highSeverityCount,
      recentThreats,
      topThreatTypes,
      riskScore,
    };
  }

  // Get threat intelligence for specific indicators
  async getThreatIntel(indicators: string[]): Promise<ThreatData[]> {
    const allThreats = Array.from(this.threats.values());
    const kvThreats = await this.loadThreatsFromKV();
    allThreats.push(...kvThreats);

    return allThreats.filter((threat) =>
      threat.indicators.some((indicator) =>
        indicators.some((searchIndicator) =>
          indicator.toLowerCase().includes(searchIndicator.toLowerCase()),
        ),
      ),
    );
  }

  private async loadThreatsFromKV(): Promise<ThreatData[]> {
    const threats: ThreatData[] = [];
    const keys = await this.kv.list({ prefix: "threat:" });

    for (const key of keys.keys) {
      const data = await this.kv.get(key.name);
      if (data) {
        try {
          threats.push(JSON.parse(data));
        } catch (e) {
          console.error("Failed to parse threat data:", e);
        }
      }
    }

    return threats;
  }

  private calculateRiskScore(threats: ThreatData[]): number {
    if (threats.length === 0) return 0;

    const severityWeights = { low: 1, medium: 2, high: 3, critical: 4 };
    const totalWeight = threats.reduce(
      (sum, threat) => sum + severityWeights[threat.severity],
      0,
    );

    // Normalize to 0-100 scale
    return Math.min(100, (totalWeight / threats.length) * 25);
  }
}
