export interface ServiceHealth {
  status: "healthy" | "degraded" | "unhealthy";
  service: string;
  version: string;
  timestamp: string;
  segment: string;
  isolation: "strict";
}

export interface ServiceConfig {
  port: number;
  serviceName: string;
  segment: string;
  isolation: "strict";
}

export function createHealthCheck(config: ServiceConfig): ServiceHealth {
  return {
    status: "healthy",
    service: config.serviceName,
    version: "0.1.0",
    timestamp: new Date().toISOString(),
    segment: config.segment,
    isolation: "strict",
  };
}

const config: ServiceConfig = {
  port: 3063,
  serviceName: "savania-wellbeing",
  segment: "agents",
  isolation: "strict",
};

console.log(
  `[${config.serviceName}] Agent nanoservice starting on port ${config.port}`,
);
console.log(`[${config.serviceName}] Isolation: ${config.isolation}`);
console.log(`[${config.serviceName}] Segment: ${config.segment}`);

export default config;
