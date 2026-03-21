# BER Engine — Biometric Empathy Rendering

> **DPID:** DPID-PCK-PIL6-002  
> **Pillar:** Wellbeing (Tranquility Ecosystem)  
> **Prime:** Savania  
> **Port:** 3061

## Overview

The BER Engine is the **empathy layer** of the Trancendos Universe. It processes biometric inputs (HRV, stress index) and maintains the platform's empathic state, broadcasting design token changes to all connected UI components.

## BER States

| State | Trigger | Theme | Use Case |
|-------|---------|-------|----------|
| **LUCID** | HRV > 50ms, Stress < 40 | Empathy green, smooth | Daily driver |
| **OVERLOAD** | HRV 30-50ms, Stress 40-70 | Muted indigo, grounding | Elevated stress |
| **CHAOS** | HRV < 30ms, Stress > 70 | Alert red, terminal | Crisis/infrastructure |

## Design Tokens (Madam Krystal)

```css
/* LUCID */
--bg: #050505; --surface: #0A0A0B; --primary: #10B981; --accent: #3B82F6;

/* OVERLOAD */
--bg: #0A0A14; --surface: #0D0D1A; --primary: #6366F1; --accent: #8B5CF6;

/* CHAOS */
--bg: #050505; --surface: #0A0A0B; --primary: #F43F5E; --accent: #EF4444;
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health |
| GET | `/ber/state` | Current BER state + tokens |
| GET | `/ber/tokens` | All token sets |
| GET | `/ber/tokens/:state` | Tokens for specific state |
| POST | `/ber/hrv` | Update state from HRV reading |
| POST | `/ber/override` | Manual state override |
| POST | `/ber/emergency-tranquility` | Activate Emergency Tranquility Protocol |
| POST | `/ber/iot/adjust` | Get IoT adjustment recommendations |

---

*BER Engine — The empathy layer of Trancendos.*
