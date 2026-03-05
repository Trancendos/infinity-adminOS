# Content Migration Plan
## Trancendos Monorepo + Ecosystem → 50 Target Repositories

**Directive:** The 50 repos we've built ARE the architecture. All content from `Trancendos` monorepo and `trancendos-ecosystem` gets migrated INTO these repos. No new repos created. Zero-deletion policy.

**Source Codebases:**
- `Trancendos` monorepo: 1,824 files — 180 client pages, 77 server routers, 140 server services, 6 agents
- `trancendos-ecosystem`: 1,434 files — Java Alervato financial system, apps/core, apps/infinity-gateway
- `infinity-worker`: 67 files — standalone Python FastAPI backend

**Target:** 50 existing repositories

---

## MIGRATION MAP

### 1. `infinity-portal` — Primary Hub (ALREADY ACTIVE)
**Receives:** Core platform code, shell, backend, packages, workers, docs
**From Trancendos monorepo:**
- `server/routers/admin.ts` → `backend/routers/admin.py` (rewrite TS→Python or keep as Node service)
- `server/routers/health.ts` → already exists
- `server/routers/rbac.ts` → `backend/routers/rbac.py`
- `server/routers/userManagement.ts` → `backend/routers/users.py` (exists)
- `server/routers/notifications.ts` → `backend/routers/notifications.py` (exists)
- `server/routers/search.ts` → `backend/routers/search.py`
- `server/routers/sync.ts` → `backend/routers/sync.py`
- `server/routers/validation.ts` → `backend/routers/validation.py`
- `server/_core/*` → `packages/kernel/` or `packages/core/`
- `client/src/pages/Home.tsx` → `apps/shell/src/modules/`
- `client/src/pages/Settings.tsx` → `apps/shell/src/modules/`
- `client/src/pages/Admin*.tsx` → `apps/shell/src/modules/AdminDashboard.tsx`
- `client/src/pages/UserManagement.tsx` → `apps/shell/src/modules/`
- `client/src/pages/NotFound.tsx` → `apps/shell/src/`
- `client/public/logo*.png` → `apps/shell/public/`
- `client/public/robots.txt` → `apps/shell/public/`
- All infrastructure/ → `infrastructure/`
- All .github/ workflows → `.github/workflows/`
**From trancendos-ecosystem:**
- `apps/core/compliance/` → `compliance/`
- `apps/core/middleware/` → `packages/middleware/`
**From infinity-worker:**
- `backend/` → merge into `backend/` (Python FastAPI — same stack)

### 2. `cornelius-ai` — Master AI Orchestrator
**Receives:** Cornelius orchestration, multi-AI, agent mesh
**From Trancendos monorepo:**
- `agents/pillars/Cornelius.ts`
- `server/routers/cornelius.ts`
- `server/routers/corneliusOrchestrator_v2.ts`
- `server/routers/autonomousAgents.ts`
- `server/routers/agentComm.ts`
- `server/routers/agentMesh.ts`
- `server/routers/agentMonitoring.ts`
- `server/routers/agents.ts`
- `server/routers/multiAI.ts`
- `server/routers/aiRouter.ts`
- `server/services/corneliusOrchestrator.ts`
- `server/services/agentOrchestration.ts`
- `server/services/agentRegistry.ts`
- `server/services/agentAuth.ts`
- `server/services/agentCapabilities.ts`
- `server/services/agentCollaboration.ts`
- `server/services/agentMesh.ts`
- `server/services/agentMonitoring.ts`
- `server/services/agentSandbox.ts`
- `server/services/aiIntercommunication.ts`
- `server/services/mlOrchestration.ts`
- `server/services/missingAIAgents.ts`
- `server/orchestration/*`
- `client/src/pages/CorneliusDashboard.tsx`
- `client/src/pages/CorneliusPocketRocket.tsx`
- `client/src/pages/AgentDashboard.tsx`
- `client/src/pages/AgentDetail.tsx`
- `client/src/pages/AgentAnalytics.tsx`
- `client/src/pages/AgentCollaboration.tsx`
- `client/src/pages/AgentCommunicationHub.tsx`
- `client/src/pages/AgentCommunications.tsx`
- `client/src/pages/AgentMesh.tsx`
- `client/src/pages/AgentNotificationCenter.tsx`
- `client/src/pages/AgentPerformanceTrends.tsx`
- `client/src/pages/AgentTaskSettings.tsx`
- `client/src/pages/AgentTestSandbox.tsx`
- `client/src/pages/AutonomousAgentsDashboard.tsx`
- `client/src/pages/chat/CorneliusChat.tsx`
- `agents/AgentRegistry.ts`
- `agents/base/AgentBase.ts`
- `agents/locations/LocationDefinitions.ts`

### 3. `norman-ai` — Security Guardian
**Receives:** Norman security, documentation, observatory
**From Trancendos monorepo:**
- `agents/pillars/NormanHawkins.ts`
- `server/routers/norman.ts`
- `server/routers/security.ts`
- `server/services/normanDataCollection.ts`
- `server/services/normanDocumentation.ts`
- `server/services/normanLivingDocs.ts`
- `server/services/guardianAgent.ts` (shared with guardian-ai)
- `server/services/guardianEnhanced.ts`
- `server/services/guardianSecurity.ts`
- `client/src/pages/NormanDocumentEditor.tsx`
- `client/src/pages/NormanDocumentation.tsx`
- `client/src/pages/NormanObservatory.tsx`
- `client/src/pages/SecurityDashboard.tsx`
- `client/src/pages/SecurityAnalytics.tsx`
- `client/src/pages/SecurityAuditReport.tsx`
- `client/src/pages/ThreatIntelligenceDashboard.tsx`
- `client/src/pages/chat/NormanChat.tsx`
- `server/threatIntelligence.ts`

### 4. `guardian-ai` — Protection & Defense
**Receives:** Guardian security services
**From Trancendos monorepo:**
- `agents/pillars/TheGuardian.ts`
- `server/routers/guardian.ts`
- `server/services/guardianAgent.ts`
- `server/services/guardianEnhanced.ts`
- `server/services/guardianSecurity.ts`
- `client/src/pages/GuardianDashboard.tsx`
- `client/src/pages/chat/GuardianChat.tsx`
- `server/security/*`

### 5. `the-dr-ai` — Autonomous Healing & Code Repair
**Receives:** TheDr healing, code analysis, error monitoring
**From Trancendos monorepo:**
- `agents/pillars/TheDr.ts`
- `server/routers/theDr.ts`
- `server/routers/theDrIntelligence.ts`
- `server/routers/theDrMonitoring.ts`
- `server/routers/theDrRouter.ts`
- `server/routers/codeAnalysis.ts`
- `server/routers/codeReview.ts`
- `server/routers/errorMonitoring.ts`
- `server/services/theDr.ts`
- `server/services/theDrAccuracyTracking.ts`
- `server/services/theDrAdvancedHealing.ts`
- `server/services/theDrAutonomousHealing.ts`
- `server/services/theDrCodeHealing.ts`
- `server/services/theDrEnhanced.ts`
- `server/services/theDrSelfHealing.ts`
- `server/services/codeAnalysis.ts`
- `server/services/codeReview.ts`
- `server/services/codeValidator.ts`
- `server/services/errorMonitor.ts`
- `server/services/errorMonitoring.ts`
- `server/services/selfHealing.ts`
- `server/services/validationAgent.ts`
- `server/_core/errorRecovery/*`
- `client/src/pages/TheDr.tsx`
- `client/src/pages/TheDrHealth.tsx`
- `client/src/pages/TheDrMonitoringDashboard.tsx`
- `client/src/pages/CodeReviewDashboard.tsx`
- `client/src/pages/chat/TheDrChat.tsx`

### 6. `dorris-ai` — Administrative Assistant & Finance
**Receives:** Doris financial intelligence, revenue
**From Trancendos monorepo:**
- `agents/pillars/DorrisFontaine.ts`
- `server/routers/doris.ts`
- `server/routers/costs.ts`
- `server/services/dorisFinancial.ts`
- `server/services/dorisRevenueAutomation.ts`
- `server/services/costOptimization.ts`
- `server/services/costTracker.ts`
- `server/services/financialForecasting.ts`
- `server/services/revenueTracking.ts`
- `server/services/budgetAlerts.ts`
- `server/services/zeroCostOptimization.ts`
- `client/src/pages/DorisFinancialIntelligence.tsx`
- `client/src/pages/CostDashboard.tsx`
- `client/src/pages/RevenueDashboard.tsx`
- `client/src/pages/BudgetAlertPreferences.tsx`
- `client/src/pages/Billing.tsx`
- `client/src/pages/chat/DorisChat.tsx`

### 7. `prometheus-ai` — Monitoring & Alerting
**Receives:** Prometheus monitoring, observability
**From Trancendos monorepo:**
- `agents/pillars/Prometheus.ts`
- `server/observability/*`
- `server/services/performanceProfiler.ts`
- `server/services/performanceTrends.ts`
- `server/services/integrationHealthMonitor.ts`
- `client/src/pages/chat/PrometheusChat.tsx`

### 8. `mercury-ai` — Trading & Finance
**Receives:** Mercury trading, market data, Porter family trading
**From Trancendos monorepo:**
- `server/routers/mercuryTrading.ts`
- `server/services/mercuryIntegration.ts`
- `server/services/mercuryTrading.ts`
- `server/services/marketData.ts`
- `server/services/porterFamilyCrypto.ts`
- `server/services/porterFamilyTrading.ts`
- `client/src/pages/chat/MercuryChat.tsx` (if exists, mapped from chat pages)

### 9. `the-treasury` — Financial Management
**Receives:** Stripe, payments, subscriptions, RBA
**From Trancendos monorepo:**
- `server/routers/stripe.ts`
- `server/routers/subscription.ts`
- `server/services/stripePayment.ts`
- `server/services/stripeService.ts`
- `server/services/paymentNotifications.ts`
- `client/src/pages/PaymentSuccess.tsx`
- `client/src/pages/PaymentCancel.tsx`
- `client/src/pages/Pricing.tsx`
- `client/src/pages/SubscriptionPlans.tsx`
- `client/src/pages/RoyalBankOfArcadia.tsx`
**From trancendos-ecosystem:**
- `backend/java/*` (Alervato financial system)
- `apps/financials/*`

### 10. `the-hive` — Collaborative Intelligence
**Receives:** Hive scanning, intelligence, estate management
**From Trancendos monorepo:**
- `server/routers/hive.ts`
- `server/routers/hiveEnhancements.ts`
- `server/routers/hiveLearning.ts`
- `server/services/theHive.ts`
- `server/services/hiveScanner.ts`
- `server/services/hiveScanProgress.ts`
- `server/services/hiveLearning.ts`
- `server/services/hiveNotifications.ts`
- `server/services/hiveTagging.ts`
- `server/_core/hiveWebSocket.ts`
- `server/_core/integrateHiveWebSocket.ts`
- `client/src/pages/HiveDashboard.tsx`
- `client/src/pages/HiveEstateManagement.tsx`
- `client/src/pages/HiveInjectionPoints.tsx`
- `client/src/pages/HiveIntelligence.tsx`
- `client/src/pages/HiveIntelligenceDashboard.tsx`
- `client/src/pages/HiveNotifications.tsx`
- `client/src/pages/HiveScanResults.tsx`
- `client/src/pages/TheHive.tsx`

### 11. `queen-ai` — Hive Management
**Receives:** Queen analysis, honeycomb
**From Trancendos monorepo:**
- `server/routers/queen.ts`
- `server/theQueenAnalysis.ts`
- `client/src/pages/QueenHoneycomb.tsx`

### 12. `the-observatory` — Analytics & Insights
**Receives:** Analytics, dashboards, reporting
**From Trancendos monorepo:**
- `server/routers/analytics.ts`
- `server/services/analyticsAggregationService.ts`
- `server/services/conversationAnalytics.ts`
- `server/services/notificationAnalytics.ts`
- `server/services/reportExport.ts`
- `server/services/reportScheduler.ts`
- `client/src/pages/AnalyticsDashboard.tsx`
- `client/src/pages/AnalyticsDashboardEnhanced.tsx`
- `client/src/pages/MessageAnalytics.tsx`
- `client/src/pages/NotificationAnalytics.tsx`
- `client/src/pages/ScheduleAnalyticsDashboard.tsx`
- `client/src/pages/TagAnalytics.tsx`
- `client/src/pages/SellerAnalytics.tsx`
- `client/src/pages/AgentPerformanceTrends.tsx`

### 13. `the-lighthouse` — Monitoring & Guidance
**Receives:** Lighthouse certificates, health monitoring
**From Trancendos monorepo:**
- `server/lighthouseCertificateRouter.ts`
- `server/services/lighthouseCertificate.ts`
- `server/_core/healthCheck/HealthMonitor.ts`
- `client/src/pages/LighthouseCertificateDashboard.tsx`

### 14. `the-library` — Knowledge Management
**Receives:** Wiki, documentation, knowledge base, learning
**From Trancendos monorepo:**
- `server/routers/wiki.ts`
- `server/routers/learning.ts`
- `server/services/knowledgeAbsorption.ts`
- `server/services/knowledgeBaseService.ts`
- `server/services/knowledgeSync.ts`
- `server/services/learningSystem.ts`
- `server/services/livingDocs.ts`
- `server/services/livingDocumentation.ts`
- `client/src/pages/WikiPageEditor.tsx`
- `client/src/pages/WikiPageViewer.tsx`
- `client/src/pages/LearningCenter.tsx`
- `client/src/pages/AILearningDashboard.tsx`
- `client/src/pages/AIDictionary.tsx`
- `client/src/pages/Dictionary.tsx`

### 15. `the-forge` — AI Model Training & Playground
**Receives:** AI model playground, bot spawning, research
**From Trancendos monorepo:**
- `server/routers/botSpawning.ts`
- `server/routers/aiResearch.ts`
- `server/services/aiModelPlayground.ts`
- `server/services/autoGeneration.ts`
- `server/services/reinforcementLearning.ts`
- `server/services/workshopAI.ts`
- `client/src/pages/AIModelPlayground.tsx`
- `client/src/pages/BotSpawning.tsx`
- `client/src/pages/Research.tsx`
- `client/src/pages/TheLab.tsx`

### 16. `the-workshop` — Development & Creation
**Receives:** Workflow builder, pipeline, backlog, kanban
**From Trancendos monorepo:**
- `server/routers/workflow.ts`
- `server/routers/pipeline.ts`
- `server/routers/pipelineEngine.ts`
- `server/routers/backlogRouter.ts`
- `server/routers/kanban.ts`
- `server/routers/storyManagement.ts`
- `server/routers/enhancement.ts`
- `server/workflowEngine.ts`
- `server/workflowNodes.ts`
- `server/workflowScheduler.ts`
- `server/workflowTemplates.ts`
- `server/services/pipelineEngine.ts`
- `server/services/storyGenerator.ts`
- `server/services/plmStoryGenerator.ts`
- `client/src/pages/WorkflowBuilder.tsx`
- `client/src/pages/Workflows.tsx`
- `client/src/pages/WorkflowsList.tsx`
- `client/src/pages/WorkflowTemplates.tsx`
- `client/src/pages/PipelineDashboard.tsx`
- `client/src/pages/PipelineDesigner.tsx`
- `client/src/pages/PipelineNewProject.tsx`
- `client/src/pages/PipelineProject.tsx`
- `client/src/pages/BacklogManagement.tsx`
- `client/src/pages/DevelopmentBacklog.tsx`
- `client/src/pages/KanbanBoard.tsx`
- `client/src/pages/kanban/*` (all kanban sub-pages)
- `client/src/pages/plm/*` (PLM pages)

### 17. `the-agora` — Discussion & Collaboration
**Receives:** Chat, messaging, voice, notifications
**From Trancendos monorepo:**
- `server/routers/chat.ts`
- `server/routers/voice.ts`
- `server/routers/webhooks.ts`
- `server/routers/unifiedNotifications.ts`
- `server/services/websocket.ts`
- `server/services/messageBus.ts`
- `server/services/unifiedNotifications.ts`
- `server/services/notificationDelivery.ts`
- `server/services/customerNotifications.ts`
- `server/_core/socket.ts`
- `server/_core/websocket.ts`
- `server/_core/voice.ts`
- `server/_core/voiceTranscription.ts`
- `client/src/pages/ChatEngine.tsx`
- `client/src/pages/ChatFirst.tsx`
- `client/src/pages/ConversationalChat.tsx`
- `client/src/pages/NotificationCenter.tsx`
- `client/src/pages/NotificationSettings.tsx`
- `client/src/pages/NotificationDemo.tsx`
- `client/src/pages/chat/*` (all 21 agent chat pages)

### 18. `the-nexus` — Integration Hub
**Receives:** Integrations, OAuth, sync, webhooks
**From Trancendos monorepo:**
- `server/routers/integrations.ts`
- `server/routers/oauthCallback.ts`
- `server/routers/gitea.ts`
- `server/routers/manusWebhook.ts`
- `server/services/crossPlatformSync.ts`
- `server/services/infinityOAuth.ts`
- `server/services/infinityOneSync.ts`
- `server/services/linearImporter.ts`
- `server/services/linearIntegration.ts`
- `server/services/notionFetcher.ts`
- `server/services/notionIntegration.ts`
- `server/services/gitAutoCommit.ts`
- `server/services/gitMirror.ts`
- `server/services/oauthProviders.ts`
- `server/integrations/*`
- `client/src/pages/AIIntegrations.tsx`
- `client/src/pages/AdminIntegrations.tsx`
- `client/src/pages/GitSync.tsx`

### 19. `the-citadel` — Defense & Protection
**Receives:** 2FA, RBAC, compliance, governance
**From Trancendos monorepo:**
- `server/routers/twoFactor.ts`
- `server/routers/roleManagement.ts`
- `server/routers/governance.ts`
- `server/routers/approvals.ts`
- `server/services/rbacService.ts`
- `server/services/permissionsManager.ts`
- `server/services/governance.ts`
- `server/services/governanceBoard.ts`
- `server/services/governanceKnowledgeService.ts`
- `server/services/gateComplianceSystem.ts`
- `server/services/gateExecutor.ts`
- `server/services/gateReviewService.ts`
- `server/services/foundationEnforcement.ts`
- `server/services/foundationFramework.ts`
- `server/services/trancendosEnforcement.ts`
- `server/compliance.ts`
- `server/governance/*`
- `client/src/pages/TwoFactorSetup.tsx`
- `client/src/pages/ComplianceDashboard.tsx`
- `client/src/pages/GovernanceBoard.tsx`
- `client/src/pages/FrameworkAcceptance.tsx`
- `client/src/pages/FrameworkCentreDashboard.tsx`
- `client/src/pages/FrameworkHistory.tsx`
- `client/src/pages/GateReview.tsx`
- `client/src/pages/GateSubmission.tsx`
- `client/src/pages/GateExecution.tsx`
- `client/src/pages/GateDependencies.tsx`
- `client/src/pages/GateWorkflows.tsx`
- `client/src/pages/ApprovalDashboard.tsx`

### 20. `the-void` — Secure Isolated Environment
**Receives:** Sandbox, encryption, secure operations
**From Trancendos monorepo:**
- `server/encryption.ts`
- `server/services/dataProcessor.ts`
- `server/services/vectorDatabase.ts`

### 21. `the-cryptex` — Security & Encryption
**Receives:** Encryption, crypto operations
**From Trancendos monorepo:**
- `server/encryption.ts` (shared with the-void)
- `server/services/porterFamilyCrypto.ts`

### 22. `the-ice-box` — Cold Storage & Archival
**Receives:** Backup, archival, versioning
**From Trancendos monorepo:**
- `server/_core/backup/CheckpointSystem.ts`
- `server/services/versionComparisonService.ts`
- `server/services/versioningSystem.ts`

### 23. `the-sanctuary` — Safe Space Operations
**Receives:** Wellness, user settings, personal space
**From Trancendos monorepo:**
- `client/src/pages/UserSettings.tsx`
- `client/src/pages/UserDetail.tsx`
- `client/src/pages/Settings.tsx`

### 24. `the-foundation` — Core Governance Hub
**Receives:** Framework enforcement, foundation docs
**From Trancendos monorepo:**
- `server/frameworkEnforcement.ts`
- `server/services/foundationFramework.ts`
- `server/services/foundationEnforcement.ts`
- All governance docs from monorepo root (*.md files)

### 25. `porter-family-ai` — Data Transport
**Receives:** Porter family scheduling, alerts, export
**From Trancendos monorepo:**
- `server/routers/porterFamily.ts`
- `server/services/porterFamilyAlerts.ts`
- `server/services/porterFamilyExport.ts`
- `server/services/porterFamilyTrading.ts`
- `client/src/pages/PorterFamilyDashboard.tsx`
- `client/src/pages/PorterFamilySchedules.tsx`
- `client/src/pages/PorterFamilyTrading.tsx`
- `client/src/pages/PorterAlertSettings.tsx`
- `client/src/pages/PorterExport.tsx`
- `client/src/pages/chat/PorterFamilyChat.tsx`

### 26. `arcadia` — Community Platform & Marketplace
**Receives:** Marketplace, products, templates
**From Trancendos monorepo:**
- `server/routers/marketplace.ts`
- `server/services/startupTemplates.ts`
- `server/services/productIdService.ts`
- `client/src/pages/ArcadiaPlatform.tsx`
- `client/src/pages/AgentMarketplace.tsx`
- `client/src/pages/MarketplaceSeller.tsx`
- `client/src/pages/TemplateMarketplace.tsx`
- `client/src/pages/Templates.tsx`
- `client/src/pages/TemplatesNew.tsx`
- `client/src/pages/Products.tsx`
- `client/src/pages/ComponentShowcase.tsx`

### 27-35. Remaining AI Agent Repos
Each receives their chat page + any specific services:

| Repo | Chat Page | Additional Content |
|------|-----------|-------------------|
| `chronos-ai` | `chat/ChronosChat.tsx` | Scheduling services |
| `iris-ai` | — | Image generation (`server/_core/imageGeneration.ts`) |
| `lille-sc-ai` | `chat/LittleSCChat.tsx` | Learning services |
| `lunascene-ai` | `chat/LunasceneChat.tsx` | — |
| `nexus-ai` | `chat/NexusChat.tsx` | — |
| `oracle-ai` | — | `server/services/patternRecognition.ts`, `server/services/projectIntelligence.ts` |
| `sentinel-ai` | — | `server/services/errorLoggingService.ts`, `server/services/errorCodeService.ts` |
| `serenity-ai` | — | Wellness features |
| `solarscene-ai` | `chat/SolarsceneChat.tsx` | — |
| `atlas-ai` | — | `server/_core/map.ts` |
| `echo-ai` | — | `server/_core/email.ts`, `server/services/emailService.ts` |

### 36. `shared-core` — Shared Libraries
**Receives:** Core utilities, types, shared services
**From Trancendos monorepo:**
- `shared/*`
- `server/_core/context.ts`
- `server/_core/cookies.ts`
- `server/_core/env.ts`
- `server/_core/types/*`

### 37. `central-plexus` — Core Routing & Orchestration
**Receives:** Event bus, routing, SDK
**From Trancendos monorepo:**
- `server/_core/orchestration/EventBus.ts`
- `server/_core/sdk.ts`
- `server/_core/trpc.ts`
- `server/_core/systemRouter.ts`

### 38. `infrastructure` — Deployment & Configs
**Receives:** All infrastructure, deployment, K8s
**From Trancendos monorepo:**
- `infrastructure/*`
- `deployment/*`
- `config/*`
- `scripts/*`
- `ecosystem.config.js`
- `wrangler.toml`
**From trancendos-ecosystem:**
- `apps/core/docker-compose.yml`
- `apps/core/scripts/*`
- `apps/infinity-gateway/*`

### 39. `secrets-portal` — Already standalone, no migration needed

### 40. `ml-compliance-service` — ML Governance
**Receives:** Compliance scanning
**From trancendos-ecosystem:**
- `apps/core/compliance/*`

### 41. `ml-inference-service` — ML Inference
**Receives:** AI model serving
**From Trancendos monorepo:**
- `server/services/huggingface.ts`
- `server/services/localLLM.ts`
- `server/_core/llm.ts`
- `server/_core/multiAI.ts`

### 42. `luminous-mastermind-ai` — AI Orchestration (Private)
**Receives:** High-level AI orchestration
**From Trancendos monorepo:**
- `server/_core/integration/IntelligentAutomationOrchestrator.ts`
- `server/_core/integration/automationRouters.ts`
- `server/intelligence/*`

### 43. `trancendos-ai-canon` — AI Canon Documentation (Private)
**Receives:** All governance/canon docs
**From Trancendos monorepo:**
- All root-level governance *.md files
- `GOVERNANCE_FRAMEWORK_AND_POLICIES.md`
- `ZERO_COST_IMPLEMENTATION_STRATEGY.md`
- `TRANCENDOS_2060_FUTURE_PROOFING_STRATEGY.md`

### 44. `trancendos-website` — Marketing Website
**Receives:** No migration needed — standalone

### 45. `trancendos-ecosystem` — BECOMES ARCHIVE
**After migration:** Archive this repo (zero-deletion — keep as read-only reference)

### 46. `Trancendos` — BECOMES ARCHIVE
**After migration:** Archive this repo (zero-deletion — keep as read-only reference)

---

## ASSET MIGRATION

### Client Assets (Avatars, Logos, Images)
All from `Trancendos/client/public/`:
- `avatars/*` → `infinity-portal/apps/shell/public/avatars/`
- `logos/*` → `infinity-portal/apps/shell/public/logos/`
- `logo*.png` → `infinity-portal/apps/shell/public/`
- `sounds/*` → `infinity-portal/apps/shell/public/sounds/`

### Documentation (Root-level .md files)
The Trancendos monorepo has 90+ root-level .md files. These are historical documentation:
- Architecture docs → `the-foundation/docs/architecture/`
- Strategy docs → `the-foundation/docs/strategy/`
- Phase summaries → `the-foundation/docs/phases/`
- Deployment guides → `infrastructure/docs/`
- Security docs → `the-citadel/docs/`
- AI/Agent docs → `cornelius-ai/docs/`

---

## EXECUTION ORDER

### Wave 1 — Core (Week 1-2)
1. `infinity-portal` — merge core server code, assets, infrastructure
2. `shared-core` — migrate shared utilities
3. `central-plexus` — migrate event bus, routing
4. `infrastructure` — migrate all deployment configs

### Wave 2 — Primary Agents (Week 3-4)
5. `cornelius-ai` — full orchestrator migration
6. `norman-ai` — security guardian migration
7. `the-dr-ai` — healing agent migration
8. `guardian-ai` — protection migration
9. `dorris-ai` — financial assistant migration

### Wave 3 — Platform Modules (Week 5-6)
10. `the-hive` — collaborative intelligence
11. `the-workshop` — development tools
12. `the-observatory` — analytics
13. `the-library` — knowledge management
14. `the-citadel` — governance & security
15. `the-agora` — communication
16. `the-nexus` — integrations
17. `the-treasury` — financial management
18. `arcadia` — marketplace

### Wave 4 — Secondary Agents & Modules (Week 7-8)
19-35. All remaining agent repos + platform modules

### Wave 5 — Archive & Cleanup (Week 9)
36. Archive `Trancendos` monorepo (read-only)
37. Archive `trancendos-ecosystem` (read-only)
38. Update all cross-references and documentation

---

## CONSTRAINTS
- **Zero-deletion:** Source repos archived, never deleted
- **Zero-cost:** All tools free (git, GitHub CLI)
- **2060 standard:** All migrated code maintains quantum-safe, governance-as-code compliance
- **Complete documentation:** Every migration logged in commit messages