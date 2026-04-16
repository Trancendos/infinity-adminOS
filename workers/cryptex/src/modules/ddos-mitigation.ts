// DDoS Mitigation Module
// Detects and mitigates Distributed Denial of Service attacks

export interface DDoSAttack {
  id: string;
  type:
    | "syn_flood"
    | "udp_flood"
    | "http_flood"
    | "amplification"
    | "slowloris";
  target: string;
  detectedAt: number;
  severity: "low" | "medium" | "high" | "critical";
  attackVector: string;
  mitigationStatus: "detected" | "mitigating" | "mitigated" | "failed";
  trafficMetrics: TrafficMetrics;
  blockedIPs: string[];
  duration: number;
}

export interface TrafficMetrics {
  requestsPerSecond: number;
  bytesPerSecond: number;
  uniqueIPs: number;
  topSourceIPs: Array<{ ip: string; count: number }>;
  suspiciousPatterns: string[];
}

export interface MitigationRule {
  id: string;
  type: "rate_limit" | "ip_block" | "geo_block" | "challenge";
  threshold: number;
  window: number; // in seconds
  enabled: boolean;
}

export class DDoSMitigation {
  private activeAttacks: Map<string, DDoSAttack> = new Map();
  private mitigationRules: MitigationRule[] = [];
  private trafficHistory: Map<string, TrafficMetrics> = new Map();

  constructor(private kv: KVNamespace) {
    this.initializeDefaultRules();
  }

  // Initialize default mitigation rules
  private initializeDefaultRules(): void {
    this.mitigationRules = [
      {
        id: "rate_limit_global",
        type: "rate_limit",
        threshold: 1000, // requests per minute
        window: 60,
        enabled: true,
      },
      {
        id: "ip_block_suspicious",
        type: "ip_block",
        threshold: 100, // requests per minute from single IP
        window: 60,
        enabled: true,
      },
      {
        id: "challenge_high_traffic",
        type: "challenge",
        threshold: 5000,
        window: 300,
        enabled: true,
      },
    ];
  }

  // Monitor incoming traffic and detect DDoS patterns
  async monitorTraffic(
    request: Request,
    clientIP: string,
  ): Promise<{
    isAttack: boolean;
    attackId?: string;
    action: "allow" | "block" | "challenge";
  }> {
    const metrics = await this.updateTrafficMetrics(clientIP, request);

    // Check against mitigation rules
    for (const rule of this.mitigationRules) {
      if (!rule.enabled) continue;

      const isViolated = await this.checkRuleViolation(rule, clientIP, metrics);

      if (isViolated) {
        const attackId = await this.detectAttack(clientIP, metrics, rule);
        const action = this.determineAction(rule.type);

        return {
          isAttack: true,
          attackId,
          action,
        };
      }
    }

    return { isAttack: false, action: "allow" };
  }

  // Apply mitigation for detected attack
  async applyMitigation(attackId: string): Promise<void> {
    const attack = this.activeAttacks.get(attackId);
    if (!attack) return;

    attack.mitigationStatus = "mitigating";

    // Implement mitigation strategies based on attack type
    switch (attack.type) {
      case "syn_flood":
      case "udp_flood":
        await this.applyNetworkLevelMitigation(attack);
        break;
      case "http_flood":
        await this.applyHTTPLevelMitigation(attack);
        break;
      case "amplification":
        await this.applyAmplificationMitigation(attack);
        break;
      case "slowloris":
        await this.applySlowlorisMitigation(attack);
        break;
    }

    attack.mitigationStatus = "mitigated";
    await this.saveAttack(attack);
  }

  // Get current DDoS status and active attacks
  async getDDoSStatus(): Promise<{
    activeAttacks: DDoSAttack[];
    totalMitigated: number;
    currentThreatLevel: "low" | "medium" | "high" | "critical";
  }> {
    const activeAttacks = Array.from(this.activeAttacks.values());
    const totalMitigated = await this.getTotalMitigatedAttacks();

    // Calculate current threat level
    const threatLevel = this.calculateThreatLevel(activeAttacks);

    return {
      activeAttacks,
      totalMitigated,
      currentThreatLevel: threatLevel,
    };
  }

  // Configure mitigation rules
  async updateMitigationRules(rules: MitigationRule[]): Promise<void> {
    this.mitigationRules = rules;
    await this.kv.put("ddos:rules", JSON.stringify(rules));
  }

  private async updateTrafficMetrics(
    clientIP: string,
    request: Request,
  ): Promise<TrafficMetrics> {
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window

    // Get or create metrics for this IP
    let metrics = this.trafficHistory.get(clientIP) || {
      requestsPerSecond: 0,
      bytesPerSecond: 0,
      uniqueIPs: 1,
      topSourceIPs: [],
      suspiciousPatterns: [],
    };

    // Update request count (simplified - in real implementation would track over time)
    metrics.requestsPerSecond = Math.max(1, metrics.requestsPerSecond + 1);

    // Calculate bytes (approximate)
    const contentLength = request.headers.get("content-length");
    if (contentLength) {
      metrics.bytesPerSecond += parseInt(contentLength);
    }

    // Detect suspicious patterns
    if (this.isSuspiciousRequest(request)) {
      metrics.suspiciousPatterns.push(request.url);
    }

    this.trafficHistory.set(clientIP, metrics);
    return metrics;
  }

  private async checkRuleViolation(
    rule: MitigationRule,
    clientIP: string,
    metrics: TrafficMetrics,
  ): Promise<boolean> {
    switch (rule.type) {
      case "rate_limit":
        return metrics.requestsPerSecond > rule.threshold;
      case "ip_block":
        return metrics.requestsPerSecond > rule.threshold;
      case "challenge":
        return metrics.requestsPerSecond > rule.threshold;
      default:
        return false;
    }
  }

  private async detectAttack(
    clientIP: string,
    metrics: TrafficMetrics,
    rule: MitigationRule,
  ): Promise<string> {
    const attackId = crypto.randomUUID();
    const attackType = this.classifyAttack(metrics);

    const attack: DDoSAttack = {
      id: attackId,
      type: attackType,
      target: "current-service", // Would be determined by context
      detectedAt: Date.now(),
      severity: this.calculateSeverity(metrics),
      attackVector: clientIP,
      mitigationStatus: "detected",
      trafficMetrics: metrics,
      blockedIPs: [],
      duration: 0,
    };

    this.activeAttacks.set(attackId, attack);
    await this.saveAttack(attack);

    return attackId;
  }

  private classifyAttack(metrics: TrafficMetrics): DDoSAttack["type"] {
    if (metrics.requestsPerSecond > 10000) return "http_flood";
    if (metrics.suspiciousPatterns.length > 10) return "syn_flood";
    if (metrics.bytesPerSecond > 1000000) return "udp_flood";
    return "http_flood"; // default
  }

  private calculateSeverity(metrics: TrafficMetrics): DDoSAttack["severity"] {
    const score = metrics.requestsPerSecond / 100;
    if (score > 100) return "critical";
    if (score > 50) return "high";
    if (score > 20) return "medium";
    return "low";
  }

  private determineAction(
    ruleType: MitigationRule["type"],
  ): "allow" | "block" | "challenge" {
    switch (ruleType) {
      case "ip_block":
        return "block";
      case "challenge":
        return "challenge";
      default:
        return "allow";
    }
  }

  private async applyNetworkLevelMitigation(attack: DDoSAttack): Promise<void> {
    // Implement network-level filtering
    attack.blockedIPs.push(attack.attackVector);
    // In real implementation, would update firewall rules, rate limiters, etc.
  }

  private async applyHTTPLevelMitigation(attack: DDoSAttack): Promise<void> {
    // Implement HTTP-level protection
    attack.blockedIPs.push(attack.attackVector);
    // Would implement WAF rules, request throttling, etc.
  }

  private async applyAmplificationMitigation(
    attack: DDoSAttack,
  ): Promise<void> {
    // Block amplification vectors
    attack.blockedIPs.push(attack.attackVector);
  }

  private async applySlowlorisMitigation(attack: DDoSAttack): Promise<void> {
    // Implement connection limits and timeouts
    attack.blockedIPs.push(attack.attackVector);
  }

  private isSuspiciousRequest(request: Request): boolean {
    const userAgent = request.headers.get("user-agent") || "";
    const suspiciousPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /python/i,
      /curl/i,
      /wget/i,
    ];

    return suspiciousPatterns.some((pattern) => pattern.test(userAgent));
  }

  private calculateThreatLevel(
    attacks: DDoSAttack[],
  ): "low" | "medium" | "high" | "critical" {
    const criticalCount = attacks.filter(
      (a) => a.severity === "critical",
    ).length;
    const highCount = attacks.filter((a) => a.severity === "high").length;

    if (criticalCount > 0) return "critical";
    if (highCount > 2) return "high";
    if (attacks.length > 0) return "medium";
    return "low";
  }

  private async getTotalMitigatedAttacks(): Promise<number> {
    const data = await this.kv.get("ddos:mitigated_count");
    return data ? parseInt(data) : 0;
  }

  private async saveAttack(attack: DDoSAttack): Promise<void> {
    await this.kv.put(`ddos:attack:${attack.id}`, JSON.stringify(attack), {
      expirationTtl: 86400 * 7, // 7 days
    });
  }
}
