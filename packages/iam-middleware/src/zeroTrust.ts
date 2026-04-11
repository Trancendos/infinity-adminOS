/**
 * @package @trancendos/iam-middleware/zeroTrust
 * ============================================================
 * Zero Trust Device Posture Middleware
 * ============================================================
 * Integrates with Cloudflare Zero Trust to enforce:
 *   - Device posture checks (healthy, unhealthy, unknown)
 *   - MFA verification for sensitive routes
 *   - Geographic access policies
 *   - Network-based access control
 * ============================================================
 * Cloudflare Zero Trust Free Tier: 50 users
 * ============================================================
 */

export type DevicePostureStatus = 'healthy' | 'unhealthy' | 'unknown';
export type AccessPolicy = 'allow' | 'deny' | 'mfa_required';

export interface ZeroTrustContext {
  deviceId?: string;
  devicePosture: DevicePostureStatus;
  country?: string;
  mfaVerified: boolean;
  accessPolicy: AccessPolicy;
  riskScore: number; // 0-100
}

export interface ZeroTrustOptions {
  /** Routes that require MFA */
  mfaRoutes?: string[];
  /** Routes that require healthy device posture */
  healthyDeviceRoutes?: string[];
  /** Allowed countries (ISO 3166-1 alpha-2) */
  allowedCountries?: string[];
  /** Blocked countries */
  blockedCountries?: string[];
  /** Minimum risk score to allow (0-100) */
  minRiskScore?: number;
  /** Whether to enforce Zero Trust on all routes */
  enforceOnAllRoutes?: boolean;
}

/**
 * Extract Zero Trust context from Cloudflare headers
 * 
 * Cloudflare Zero Trust adds these headers:
 * - Cf-Device-Posture: healthy | unhealthy | unknown
 * - Cf-Connecting-Ip: Client IP
 * - Cf-Ipcountry: Client country
 * - Cf-Access-Jwt-Assertion: Access token (if MFA enabled)
 */
export function extractZeroTrustContext(request: Request): ZeroTrustContext {
  const headers = request.headers;
  
  // Extract device posture from Cloudflare
  const devicePostureHeader = headers.get('cf-device-posture') || 
                              headers.get('CF-Device-Posture') || 
                              'unknown';
  
  const devicePosture: DevicePostureStatus = 
    devicePostureHeader.toLowerCase() === 'healthy' ? 'healthy' :
    devicePostureHeader.toLowerCase() === 'unhealthy' ? 'unhealthy' : 
    'unknown';
  
  // Extract country
  const country = headers.get('cf-ipcountry') || 
                  headers.get('CF-IPCountry') || 
                  undefined;
  
  // Check for MFA verification (Access token present)
  const mfaVerified = !!headers.get('cf-access-jwt-assertion') || 
                      !!headers.get('CF-Access-Jwt-Assertion');
  
  // Calculate risk score based on context
  let riskScore = 0;
  if (devicePosture === 'unhealthy') riskScore += 40;
  if (devicePosture === 'unknown') riskScore += 20;
  if (!mfaVerified) riskScore += 10;
  
  // Determine access policy
  let accessPolicy: AccessPolicy = 'allow';
  if (devicePosture === 'unhealthy') {
    accessPolicy = 'deny';
  } else if (!mfaVerified) {
    accessPolicy = 'mfa_required';
  }
  
  return {
    deviceId: headers.get('cf-device-id') || undefined,
    devicePosture,
    country,
    mfaVerified,
    accessPolicy,
    riskScore,
  };
}

/**
 * Zero Trust middleware for Cloudflare Workers
 */
export function createZeroTrustMiddleware(options: ZeroTrustOptions = {}) {
  const {
    mfaRoutes = [],
    healthyDeviceRoutes = [],
    allowedCountries = [],
    blockedCountries = [],
    minRiskScore = 70,
    enforceOnAllRoutes = false,
  } = options;

  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const context = extractZeroTrustContext(request);
    
    // Check blocked countries
    if (blockedCountries.length > 0 && context.country) {
      if (blockedCountries.includes(context.country)) {
        return new Response('Access denied from your location', { 
          status: 403,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    }
    
    // Check allowed countries (if specified)
    if (allowedCountries.length > 0 && context.country) {
      if (!allowedCountries.includes(context.country)) {
        return new Response('Access denied from your location', { 
          status: 403,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    }
    
    // Check risk score
    if (context.riskScore > (100 - minRiskScore)) {
      return new Response('Access denied due to high risk score', { 
        status: 403,
        headers: { 'Content-Type': 'text/plain' }
        });
    }
    
    // Check device posture for sensitive routes
    const requiresHealthyDevice = healthyDeviceRoutes.some(route => 
      pathname.startsWith(route)
    );
    
    if (requiresHealthyDevice && context.devicePosture !== 'healthy') {
      return new Response('Healthy device posture required', { 
        status: 403,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
    
    // Check MFA for protected routes
    const requiresMfa = mfaRoutes.some(route => 
      pathname.startsWith(route)
    );
    
    if (requiresMfa && !context.mfaVerified) {
      return new Response('MFA verification required', { 
        status: 401,
        headers: { 
          'Content-Type': 'text/plain',
          'WWW-Authenticate': 'Cloudflare-Access'
        }
      });
    }
    
    // All checks passed
    return null;
  };
}

/**
 * Admin route protection with Zero Trust
 * Requires: Healthy device + MFA verification
 */
export function adminZeroTrustMiddleware() {
  return createZeroTrustMiddleware({
    mfaRoutes: ['/admin'],
    healthyDeviceRoutes: ['/admin'],
    enforceOnAllRoutes: true,
    minRiskScore: 80,
  });
}

/**
 * API route protection with Zero Trust
 * Requires: Healthy device posture
 */
export function apiZeroTrustMiddleware() {
  return createZeroTrustMiddleware({
    healthyDeviceRoutes: ['/api'],
    minRiskScore: 60,
  });
}

export default createZeroTrustMiddleware;