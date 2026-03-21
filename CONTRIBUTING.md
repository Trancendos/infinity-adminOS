# Contributing to the Trancendos Ecosystem

Welcome. We're building a multi-tenant SaaS platform focused on AI-powered orchestration, enterprise-grade security, and scalable microservices. Our infrastructure relies on zero-cost, modular, and self-healing architecture. 

Whether you are a human developer or an AI assistant interacting with this repository, you must adhere strictly to the workflows and philosophies outlined in this document. 

## 🧠 Core Philosophy & The Empathy Mandate

Every contribution is measured against our **Empathy Mandate**: systems must prioritize Cognitive Ease. If a feature, pull request, or architectural shift induces stress, cognitive overload, or panic, it is considered a critical failure.

1. **Architecture-First Thinking:** Every solution begins with comprehensive system design.
2. **Security by Default:** Compliance and security (OWASP, OAuth 2.0) are built into the foundational design, not bolted on later.
3. **Documentation-Driven:** Specifications and runbooks are created alongside code.
4. **Surgical Precision:** Do NOT rewrite working logic unless explicitly commanded. Provide surgical patches only.

## 🎟️ Ticket & Complexity Framework

Before writing any code, tasks must be scoped using our Ticket Template. This prevents scope creep and ensures the architectural integrity of our CI/CD pipelines.

**Ticket Template format:**
`[Ticket ID / Focus] | [Complexity Level] | [Zero-Cost & Modular Check: Y/N] | [Current Revert Hash]`

### Complexity Levels
Assess your task against this framework before opening a PR:
* **L1 - Trivial:** CSS tweaks, text changes, commenting.
* **L2 - Isolated Logic:** Updating a single microservice function or a single UI component.
* **L3 - Integration:** Connecting the frontend to the backend API.
* **L4 - Security/Architecture:** OAuth flows, database schema changes.
* **L5 - Danger Zone:** Multi-file refactoring, CI/CD pipeline overhauls.

## 🛑 The Hard-Stop Validation

If a task or feature requires modifying **more than 2 files simultaneously**, you must **STOP** and request approval from the Lead Architect before proceeding. This acts as a circuit breaker against cascading errors across the microservices.

## 🤖 AI Interaction Guidelines

If you are an AI assistant (or a human prompting one) contributing to this repository, you must obey the following operational rules:

1. **Honesty Over Hallucination:** If you cannot complete a task, lack architectural context, or cannot ensure safe execution, you MUST state: *"I lack the context to do this safely."* Do not guess.
2. **Component Isolation (UI/UX):** When working on frontend views, do not attempt to process the entire page. 
   * **Isolate:** Work on ONE specific component (e.g., 'The Login Button').
   * **Describe First, Code Second:** State your intended visual styling in plain English before writing CSS/Tailwind (e.g., "I will make it rounded with a soft blue background...").
   * **Wait for Approval:** Do not write the code until the visual description is approved. This prevents 100 lines of garbage CSS that ruins layouts.
3. **Future Horizon Log:** Do not distract an active ticket with scope creep. If you have ideas for new features or improvements, save them for a "Future Horizon Log" at the very end of your commit or response.

## 💾 Submitting Your Pull Request

1. Ensure your branch branches off `main` (or the relevant environment branch) and is up to date.
2. Run all local release gates, code validation, and security checks.
3. Keep your PR scope tight. If your PR tackles multiple Complexity Levels, break it up.
4. **Mandatory Save Point:** At the end of a complex session or PR description, you must generate a **PROJECT PULSE & REVERT LOG** table so maintainers have a safe 'save point' and know exactly which hash to revert to if a deployment fails.

### Example Project Pulse & Revert Log
| Ticket ID | Modified Files | Complexity | Revert Hash | Status |
| :--- | :--- | :--- | :--- | :--- |
| TRN-102 | `auth_service.py` | L2 | `a1b2c3d` | Awaiting Review |

---
*Thank you for contributing to a resilient, zero-cost, and secure ecosystem.*
