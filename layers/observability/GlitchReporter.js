// Adapted from prior (disclosed, pre-existing) infrastructure work — see README.md provenance/disclosure section.
// GlitchReporter — adversarial failure detection, risk analysis, and self-healing.
// Integrates GlitchScanner-style rule-based scanning, an AdversarialProbeRunner,
// a RootCauseAnalyzer, a GlitchStore, and a FeedbackLoop for a complete
// self-healing pipeline. AI analysis is provider-agnostic: callers inject any
// object exposing an async complete(prompt, options) method.

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

// No canonical default model — callers should configure GLITCH_ANALYSIS_MODEL
// (or pass `model` explicitly to the constructors below) to point this at
// whatever reasoning model their injected provider serves.
const DEFAULT_MODEL = process.env.GLITCH_ANALYSIS_MODEL || 'configured-reasoning-model';

// Severity levels from blueprint FEAT-005-SPEC
export const Severity = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info',
};

// Known anti-pattern categories for rule-based scanning
const ANTI_PATTERNS = [
  { id: 'missing-error-handler', category: 'error-handling', description: 'Step lacks try/catch or error handling', severity: Severity.HIGH },
  { id: 'no-timeout', category: 'reliability', description: 'Step has no timeout configured', severity: Severity.MEDIUM },
  { id: 'unvalidated-input', category: 'reliability', description: 'Step input is not validated before processing', severity: Severity.MEDIUM },
  { id: 'no-retry-logic', category: 'reliability', description: 'Transient failure-prone step lacks retry configuration', severity: Severity.LOW },
  { id: 'resource-leak', category: 'reliability', description: 'Step may leak resources (unclosed connections, handles)', severity: Severity.HIGH },
  { id: 'race-condition', category: 'race-condition', description: 'Parallel steps may have data race conditions', severity: Severity.HIGH },
  { id: 'missing-approval', category: 'security', description: 'Destructive action without approval gate', severity: Severity.CRITICAL },
  { id: 'data-exposure', category: 'security', description: 'Sensitive data may be exposed in logs or output', severity: Severity.HIGH },
  { id: 'unbounded-retry', category: 'performance', description: 'Step has unbounded retry attempts', severity: Severity.MEDIUM },
  { id: 'bottleneck-serial', category: 'performance', description: 'Step could run in parallel but is serialized', severity: Severity.LOW },
];

// Adversarial probe templates
const PROBE_TEMPLATES = {
  inputValidation: [
    { name: 'empty-payload', description: 'Send empty/null input to the step', generator: () => ({}) },
    { name: 'max-size-payload', description: 'Send extremely large input', generator: () => ({ data: 'x'.repeat(1_000_000) }) },
    { name: 'unicode-edge-cases', description: 'Send unicode edge cases', generator: () => ({ data: '🚀💀' + String.fromCharCode(0, 0xFFFD, 0x200B) }) },
    { name: 'injection-attempt', description: 'Send SQL/JS injection payloads', generator: () => ({ data: "'; DROP TABLE workflows; --" }) },
    { name: 'null-fields', description: 'Send null values for required fields', generator: () => ({ data: null, id: null, type: null }) },
  ],
  timingConcurrency: [
    { name: 'concurrent-triggers', description: 'Fire multiple triggers simultaneously', generator: (wf) => ({ workflowId: wf?.workflowId, count: 10 }) },
    { name: 'rapid-retriggers', description: 'Retrigger same workflow rapidly', generator: (wf) => ({ workflowId: wf?.workflowId, interval: 10 }) },
    { name: 'timeout-stress', description: 'Trigger steps near timeout boundary', generator: () => ({ timeoutMs: 1 }) },
  ],
  dependencyFailure: [
    { name: 'connector-offline', description: 'Simulate connector unavailability', generator: (wf) => ({ connectorType: wf?.steps?.[0]?.connector_type || 'http', simulate: 'unavailable' }) },
    { name: 'database-down', description: 'Simulate database failure', generator: () => ({ simulate: 'database_failure' }) },
    { name: 'partial-failure', description: 'Simulate mid-workflow failure', generator: (wf) => ({ failAtStep: Math.floor((wf?.steps?.length || 3) / 2) }) },
  ],
};

export class GlitchReporter extends EventEmitter {
  #provider;
  #modelName;
  #store;
  #probeRunner;
  #rootCauseAnalyzer;
  #feedbackLoop;
  #scanQueue = [];

  /**
   * @param {Object} options
   * @param {Object} options.provider - AI analysis provider: any object exposing
   *   an async complete(prompt, options) method.
   * @param {string} [options.model] - Model identifier to request from the
   *   provider. Defaults to GLITCH_ANALYSIS_MODEL env var, or a placeholder.
   * @param {Object} [options.store] - GlitchStore instance for persistence
   * @param {Object} [options.feedbackLoop] - FeedbackLoop instance
   */
  constructor({ provider, model, store = null, feedbackLoop = null } = {}) {
    super();
    if (!provider) throw new Error('GlitchReporter requires a provider');
    this.#provider = provider;
    this.#modelName = model || DEFAULT_MODEL;
    this.#store = store;
    this.#feedbackLoop = feedbackLoop;
    this.#probeRunner = new AdversarialProbeRunner();
    this.#rootCauseAnalyzer = new RootCauseAnalyzer(provider, this.#modelName);
  }

  /**
   * Analyze a workflow execution for potential failures and risks.
   * Scans using both rule-based patterns and AI analysis.
   * @param {object} workflowResult - The result from WorkflowOrchestrator
   * @returns {Promise<GlitchReport>}
   */
  async analyzeWorkflow(workflowResult) {
    const startTime = Date.now();
    const reportId = randomUUID();

    // Phase 1: Rule-based scanning (fast, always runs)
    const ruleBasedFindings = this.#scanAntiPatterns(workflowResult);

    // Phase 2: AI-driven adversarial analysis
    let aiAnalysis;
    try {
      aiAnalysis = await this.#aiAnalyzeWorkflow(workflowResult);
    } catch (err) {
      aiAnalysis = {
        severity: Severity.MEDIUM,
        summary: `AI analysis failed: ${err.message}`,
        failures: [],
        latent_risks: [],
        bottlenecks: [],
        security: [],
        recommendations: ['Review workflow manually due to analysis failure'],
        overall_health_score: 50,
        analysisMethod: 'rule-based',
      };
    }

    // Phase 3: Adversarial probe generation
    const probes = this.#probeRunner.generateProbes(workflowResult);

    // Merge rule-based and AI findings
    const allFindings = [
      ...ruleBasedFindings.map(f => ({
        id: f.id,
        severity: f.severity,
        category: f.category,
        description: f.description,
        affectedModules: f.affectedModules || [],
        source: 'rule-based-scanner',
      })),
      ...(aiAnalysis.failures || []).map(f => ({
        severity: Severity.MEDIUM,
        category: 'ai-detected',
        description: `${f.cause || 'Unknown'}: ${f.impact || ''}`,
        affectedModules: [f.step].filter(Boolean),
        source: 'ai-analysis',
      })),
      ...(aiAnalysis.security || []).map(s => ({
        severity: s.severity || Severity.HIGH,
        category: 'security',
        description: s.concern,
        suggestedFix: s.fix,
        source: 'ai-analysis',
      })),
    ];

    // Determine overall severity (highest found)
    const severityOrder = [Severity.CRITICAL, Severity.HIGH, Severity.MEDIUM, Severity.LOW, Severity.INFO];
    const overallSeverity = allFindings.length > 0
      ? severityOrder.reduce((worst, s) =>
          allFindings.some(f => f.severity === s) ? s : worst, Severity.INFO)
      : (aiAnalysis.severity || Severity.INFO);

    const report = {
      id: reportId,
      workflowId: workflowResult.workflowId,
      severity: overallSeverity,
      category: allFindings[0]?.category || 'general',
      title: aiAnalysis.summary || `Workflow analysis: ${overallSeverity} severity`,
      description: aiAnalysis.summary || 'No significant issues detected',
      findings: allFindings,
      failures: aiAnalysis.failures || [],
      latentRisks: aiAnalysis.latent_risks || [],
      bottlenecks: aiAnalysis.bottlenecks || [],
      securityFindings: aiAnalysis.security || [],
      probes,
      overallHealthScore: aiAnalysis.overall_health_score ?? 80,
      recommendations: aiAnalysis.recommendations || [],
      analysisMethod: aiAnalysis.analysisMethod || 'ai-enhanced',
      analyzedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      recurrenceCount: 1,
    };

    // Deduplication: check if similar report exists
    if (this.#store) {
      const existing = this.#store.findDuplicate(report);
      if (existing) {
        existing.recurrenceCount = (existing.recurrenceCount || 1) + 1;
        existing.lastSeenAt = report.analyzedAt;
        this.#store.update(existing);
        report.deduplicated = true;
        report.originalReportId = existing.id;
        this.emit('report:deduplicated', { reportId: existing.id, newOccurrence: reportId });
        return existing;
      }
      this.#store.save(report);
    }

    this.emit('report:created', { reportId, severity: overallSeverity, workflowId: report.workflowId });
    return report;
  }

  /**
   * Proactive risk scan — analyze a proposed workflow before execution.
   */
  async preFlightCheck(steps) {
    const result = await this.#provider.complete(
      `Review this planned workflow for potential issues BEFORE execution:

PLANNED STEPS:
${steps.map((s, i) => `${i + 1}. ${s.action || s.name || 'unnamed'} — ${s.description || s.connector_type || 'no description'}`).join('\n')}

Check for:
- Circular dependencies
- Missing error handling
- Unnecessary human approvals (bottlenecks)
- Security risks (data exposure, injection)
- Resource waste (redundant calls, oversized payloads)
- Ordering issues (steps that should be parallel but are serial)

Respond with JSON:
{
  "approved": true/false,
  "issues": [{"step": "...", "type": "...", "description": "...", "fix": "..."}],
  "optimized_order": [{"step_id": "...", "parallel_group": 0}],
  "estimated_tokens": number,
  "risk_level": "low|medium|high"
}`,
      {
        model: this.#modelName,
        temperature: 0.3,
        responseFormat: { type: 'json_object' },
        system: 'You are a pre-flight safety checker. Find issues before they become failures.',
      }
    );

    try {
      return JSON.parse(result.content);
    } catch {
      return { approved: true, issues: [], optimized_order: [], risk_level: 'medium' };
    }
  }

  /**
   * Run adversarial probes against a workflow result.
   * @param {object} workflowResult
   * @returns {Promise<ProbeResult[]>}
   */
  async runAdversarialProbes(workflowResult) {
    const probes = this.#probeRunner.generateProbes(workflowResult);
    const results = [];

    for (const probe of probes) {
      try {
        const probeResult = await this.#probeRunner.executeProbe(probe, workflowResult);
        results.push(probeResult);
        if (probeResult.vulnerabilityFound) {
          this.emit('probe:vulnerability', { probeId: probe.id, severity: probeResult.severity });
        }
      } catch (err) {
        results.push({
          probeId: probe.id,
          name: probe.name,
          executed: false,
          error: err.message,
        });
      }
    }

    return results;
  }

  /**
   * Generate a summary report of all analyzed workflows.
   */
  generateSummary() {
    const reports = this.#store ? this.#store.list() : [];
    if (reports.length === 0) return null;

    const critical = reports.filter(r => r.severity === Severity.CRITICAL).length;
    const high = reports.filter(r => r.severity === Severity.HIGH).length;
    const medium = reports.filter(r => r.severity === Severity.MEDIUM).length;
    const low = reports.filter(r => r.severity === Severity.LOW).length;
    const info = reports.filter(r => r.severity === Severity.INFO).length;
    const avgHealth = reports.reduce((sum, r) => sum + (r.overallHealthScore || 50), 0) / reports.length;

    return {
      totalAnalyzed: reports.length,
      severityBreakdown: { critical, high, medium, low, info },
      averageHealthScore: Math.round(avgHealth),
      recentReports: reports.slice(-5),
      unresolvedCritical: reports.filter(r => r.severity === Severity.CRITICAL && !r.resolved).length,
    };
  }

  /**
   * Trigger the feedback loop to propose fixes from glitch reports.
   * @returns {Promise<FixProposal[]>}
   */
  async triggerFeedbackLoop() {
    if (!this.#feedbackLoop) return [];
    const reports = this.#store ? this.#store.list({ unresolved: true }) : [];
    return this.#feedbackLoop.generateFixProposals(reports);
  }

  /**
   * Rule-based anti-pattern scanner.
   * @private
   */
  #scanAntiPatterns(workflowResult) {
    const findings = [];
    const steps = workflowResult.steps || [];

    for (const step of steps) {
      // Check for missing error handling
      if (step.status === 'failed' && !step.error) {
        findings.push({
          ...ANTI_PATTERNS.find(p => p.id === 'missing-error-handler'),
          affectedModules: [step.connector_type || step.action],
        });
      }

      // Check for no timeout
      if (!step.timeout_ms && step.timeout_ms !== 0) {
        findings.push({
          ...ANTI_PATTERNS.find(p => p.id === 'no-timeout'),
          affectedModules: [step.connector_type],
        });
      }

      // Check for missing approval on destructive actions
      const destructiveActions = ['delete', 'remove', 'destroy', 'drop', 'cancel'];
      if (destructiveActions.some(a => (step.action || '').toLowerCase().includes(a)) && !step.requires_approval) {
        findings.push({
          ...ANTI_PATTERNS.find(p => p.id === 'missing-approval'),
          affectedModules: [step.connector_type],
        });
      }

      // Check for unvalidated input
      if (step.input_params && typeof step.input_params === 'string') {
        try {
          const params = JSON.parse(step.input_params);
          if (Object.keys(params).length === 0) {
            findings.push({
              ...ANTI_PATTERNS.find(p => p.id === 'unvalidated-input'),
              affectedModules: [step.connector_type],
            });
          }
        } catch { /* ignore parse errors */ }
      }
    }

    // Check for race conditions in parallel steps
    const runningSteps = steps.filter(s => s.status === 'running');
    const connectorTypes = runningSteps.map(s => s.connector_type);
    const duplicateConnectors = connectorTypes.filter((ct, i) => connectorTypes.indexOf(ct) !== i);
    if (duplicateConnectors.length > 0) {
      findings.push({
        ...ANTI_PATTERNS.find(p => p.id === 'race-condition'),
        affectedModules: [...new Set(duplicateConnectors)],
      });
    }

    return findings;
  }

  /**
   * AI-powered workflow analysis.
   * @private
   */
  async #aiAnalyzeWorkflow(workflowResult) {
    const result = await this.#provider.complete(
      `Analyze this workflow execution for failures, risks, and improvement opportunities:

WORKFLOW ID: ${workflowResult.workflowId || 'unknown'}
STEPS EXECUTED: ${workflowResult.totalSteps || workflowResult.steps?.length || 0}
SUCCEEDED: ${workflowResult.succeeded || 0}
FAILED: ${workflowResult.failed || 0}

STEP DETAILS:
${(workflowResult.steps || []).map(s => `
  - ${s.step_id || s.id || 'unknown'}: ${s.action || s.name || 'unknown'} → ${s.status}
    ${s.error ? `ERROR: ${s.error}` : ''}
    ${s.result ? `RESULT: ${JSON.stringify(s.result).slice(0, 200)}` : ''}
`).join('\n')}

Identify:
1. Immediate failures and their root causes
2. Latent risks that didn't manifest but could
3. Performance bottlenecks
4. Security concerns
5. Recommended mitigations

Respond with JSON:
{
  "severity": "info|warning|critical",
  "summary": "one-line summary",
  "failures": [{"step": "...", "cause": "...", "impact": "..."}],
  "latent_risks": [{"risk": "...", "probability": "low|medium|high", "impact": "..."}],
  "bottlenecks": [{"step": "...", "issue": "...", "suggestion": "..."}],
  "security": [{"concern": "...", "severity": "...", "fix": "..."}],
  "recommendations": ["..."],
  "overall_health_score": 0-100
}`,
      {
        model: this.#modelName,
        temperature: 0.4,
        responseFormat: { type: 'json_object' },
        system: 'You are an adversarial QA engineer. Your job is to find every possible failure mode. Be thorough, skeptical, and specific.',
      }
    );

    let report;
    try {
      report = JSON.parse(result.content);
    } catch {
      report = {
        severity: 'warning',
        summary: 'Could not parse glitch analysis',
        failures: [],
        latent_risks: [],
        bottlenecks: [],
        security: [],
        recommendations: ['Review workflow manually'],
        overall_health_score: 50,
        analysisMethod: 'rule-based',
        _raw: result.content,
      };
    }

    return report;
  }

  /**
   * Get the underlying store instance.
   */
  getStore() { return this.#store; }
  getProvider() { return this.#provider; }
}

// ============================================================
// AdversarialProbeRunner — generates and executes adversarial test cases
// ============================================================
export class AdversarialProbeRunner {
  /**
   * Generate adversarial probes for a workflow.
   * Per blueprint: at least 3 probes per workflow type:
   * one input validation, one timing/concurrency, one dependency failure.
   * @param {object} workflowResult
   * @returns {Probe[]}
   */
  generateProbes(workflowResult) {
    const probes = [];
    let probeIndex = 0;

    // Input validation probes (at least 1)
    for (const template of PROBE_TEMPLATES.inputValidation.slice(0, 2)) {
      probes.push({
        id: `probe-${++probeIndex}`,
        name: template.name,
        description: template.description,
        category: 'inputValidation',
        input: template.generator(workflowResult),
      });
    }

    // Timing/concurrency probes (at least 1)
    for (const template of PROBE_TEMPLATES.timingConcurrency.slice(0, 1)) {
      probes.push({
        id: `probe-${++probeIndex}`,
        name: template.name,
        description: template.description,
        category: 'timingConcurrency',
        input: template.generator(workflowResult),
      });
    }

    // Dependency failure probes (at least 1)
    for (const template of PROBE_TEMPLATES.dependencyFailure.slice(0, 1)) {
      probes.push({
        id: `probe-${++probeIndex}`,
        name: template.name,
        description: template.description,
        category: 'dependencyFailure',
        input: template.generator(workflowResult),
      });
    }

    return probes;
  }

  /**
   * Execute a single adversarial probe against a workflow result.
   * Probes are read-only analysis — they don't modify the workflow.
   * @param {Probe} probe
   * @param {object} workflowResult
   * @returns {Promise<ProbeResult>}
   */
  async executeProbe(probe, workflowResult) {
    const startTime = Date.now();

    // Analyze the probe's potential impact against the workflow
    const vulnerabilityFound = this.#analyzeProbeImpact(probe, workflowResult);
    const severity = vulnerabilityFound ? this.#assessProbeSeverity(probe) : Severity.INFO;

    return {
      probeId: probe.id,
      name: probe.name,
      category: probe.category,
      executed: true,
      vulnerabilityFound,
      severity,
      description: probe.description,
      impact: vulnerabilityFound
        ? `Workflow may be vulnerable to ${probe.name}: ${probe.description}`
        : 'No immediate vulnerability detected',
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Analyze whether a probe exposes a vulnerability in the workflow.
   * @private
   */
  #analyzeProbeImpact(probe, workflowResult) {
    const steps = workflowResult.steps || [];

    switch (probe.category) {
      case 'inputValidation':
        // Check if any step processes input without validation
        return steps.some(s => !s.input_params || s.input_params === '{}');

      case 'timingConcurrency': {
        // Check for concurrent steps that might race
        const runningSteps = steps.filter(s => s.status === 'running');
        return runningSteps.length > 1;
      }

      case 'dependencyFailure':
        // Check if workflow depends on external services without fallback
        return steps.some(s => s.connector_type && !s.error_category);

      default:
        return false;
    }
  }

  /**
   * Assess the severity of a probe finding.
   * @private
   */
  #assessProbeSeverity(probe) {
    switch (probe.category) {
      case 'inputValidation': return Severity.HIGH;
      case 'timingConcurrency': return Severity.MEDIUM;
      case 'dependencyFailure': return Severity.HIGH;
      default: return Severity.LOW;
    }
  }
}

// ============================================================
// RootCauseAnalyzer — AI-powered chain-of-thought root cause analysis
// ============================================================
export class RootCauseAnalyzer {
  #provider;
  #modelName;

  constructor(provider, model) {
    if (!provider) throw new Error('RootCauseAnalyzer requires a provider');
    this.#provider = provider;
    this.#modelName = model || DEFAULT_MODEL;
  }

  /**
   * Analyze a failure chain and identify root causes with confidence scores.
   * @param {object} failureContext - { workflowId, steps, error, auditEvents }
   * @returns {Promise<RootCauseAnalysis>}
   */
  async analyze(failureContext) {
    const startTime = Date.now();

    try {
      const result = await this.#provider.complete(
        `Perform chain-of-thought root cause analysis on this workflow failure:

WORKFLOW ID: ${failureContext.workflowId || 'unknown'}
FAILED STEP: ${failureContext.failedStep || 'unknown'}
ERROR: ${failureContext.error || 'No error message'}

EXECUTION CHAIN:
${(failureContext.steps || []).map((s, i) =>
  `${i + 1}. [${s.status}] ${s.action || s.name}: ${s.error || 'ok'}`
).join('\n')}

AUDIT EVENTS:
${(failureContext.auditEvents || []).map(e =>
  `- ${e.timestamp}: ${e.eventType} (${e.status})`
).join('\n') || 'No audit events available'}

Perform a root cause analysis:
1. Trace the error from symptom to root cause
2. Identify the first failure in the chain
3. Determine if the failure is transient or permanent
4. Assess confidence in the root cause identification
5. Recommend specific fixes

Respond with JSON:
{
  "rootCause": "description of the root cause",
  "confidence": 0.0-1.0,
  "failureChain": ["step1 → step2 → step3"],
  "category": "transient|permanent|configuration|dependency|data",
  "affectedModules": ["module1", "module2"],
  "evidence": ["evidence1", "evidence2"],
  "recommendedFixes": [{"description": "...", "priority": "high|medium|low", "estimatedEffort": "..."}]
}`,
        {
          model: this.#modelName,
          temperature: 0.2,
          responseFormat: { type: 'json_object' },
          system: 'You are a senior reliability engineer performing root cause analysis. Be precise, cite evidence, and express uncertainty where appropriate.',
        }
      );

      let analysis;
      try {
        analysis = JSON.parse(result.content);
      } catch {
        analysis = {
          rootCause: 'Unable to parse root cause analysis',
          confidence: 0.1,
          failureChain: [],
          category: 'unknown',
          affectedModules: [],
          evidence: [],
          recommendedFixes: [],
          parseError: true,
        };
      }

      return {
        workflowId: failureContext.workflowId,
        ...analysis,
        analyzedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      };
    } catch (err) {
      return {
        workflowId: failureContext.workflowId,
        rootCause: `Analysis failed: ${err.message}`,
        confidence: 0,
        failureChain: [],
        category: 'unknown',
        affectedModules: [],
        evidence: [],
        recommendedFixes: [],
        error: err.message,
        analyzedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
      };
    }
  }
}

// ============================================================
// GlitchStore — SQLite-backed persistence with deduplication
// ============================================================
export class GlitchStore {
  #db;
  #inMemory = [];

  /**
   * @param {object|null} db - better-sqlite3 Database instance (null = in-memory only)
   */
  constructor(db = null) {
    this.#db = db;
    if (db) {
      this.#ensureSchema(db);
    }
  }

  /**
   * Create the glitch_reports table if it doesn't exist.
   * @private
   */
  #ensureSchema(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS glitch_reports (
        id TEXT PRIMARY KEY NOT NULL,
        workflow_id TEXT,
        step_id TEXT,
        severity TEXT NOT NULL
          CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        findings TEXT DEFAULT '[]',
        probes TEXT DEFAULT '[]',
        overall_health_score INTEGER DEFAULT 50,
        recommendations TEXT DEFAULT '[]',
        analysis_method TEXT DEFAULT 'ai-enhanced',
        recurrence_count INTEGER NOT NULL DEFAULT 1,
        resolved INTEGER NOT NULL DEFAULT 0,
        resolved_at TEXT,
        resolved_by TEXT,
        metadata TEXT DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_glitch_reports_workflow_id ON glitch_reports(workflow_id);
      CREATE INDEX IF NOT EXISTS idx_glitch_reports_severity ON glitch_reports(severity);
      CREATE INDEX IF NOT EXISTS idx_glitch_reports_category ON glitch_reports(category);
      CREATE INDEX IF NOT EXISTS idx_glitch_reports_resolved ON glitch_reports(resolved);
      CREATE INDEX IF NOT EXISTS idx_glitch_reports_created_at ON glitch_reports(created_at);
    `);
  }

  /**
   * Save a glitch report.
   * @param {object} report
   * @returns {object} The saved report
   */
  save(report) {
    if (this.#db) {
      const stmt = this.#db.prepare(`
        INSERT OR REPLACE INTO glitch_reports
          (id, workflow_id, step_id, severity, category, title, description,
           findings, probes, overall_health_score, recommendations, analysis_method,
           recurrence_count, resolved, metadata, created_at, updated_at)
        VALUES
          (@id, @workflowId, @stepId, @severity, @category, @title, @description,
           @findings, @probes, @overallHealthScore, @recommendations, @analysisMethod,
           @recurrenceCount, @resolved, @metadata, @createdAt, @updatedAt)
      `);

      stmt.run({
        id: report.id,
        workflowId: report.workflowId || null,
        stepId: report.stepId || null,
        severity: report.severity,
        category: report.category || 'general',
        title: report.title || '',
        description: report.description || '',
        findings: JSON.stringify(report.findings || []),
        probes: JSON.stringify(report.probes || []),
        overallHealthScore: report.overallHealthScore ?? 50,
        recommendations: JSON.stringify(report.recommendations || []),
        analysisMethod: report.analysisMethod || 'ai-enhanced',
        recurrenceCount: report.recurrenceCount || 1,
        resolved: report.resolved ? 1 : 0,
        metadata: JSON.stringify(report.metadata || {}),
        createdAt: report.analyzedAt || report.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Also keep in-memory copy
    const existingIdx = this.#inMemory.findIndex(r => r.id === report.id);
    if (existingIdx >= 0) {
      this.#inMemory[existingIdx] = report;
    } else {
      this.#inMemory.push(report);
    }

    return report;
  }

  /**
   * Update an existing glitch report.
   * @param {object} report
   */
  update(report) {
    return this.save(report);
  }

  /**
   * Find a duplicate report (same root cause + same affected module).
   * @param {object} report
   * @returns {object|null}
   */
  findDuplicate(report) {
    // Check in-memory first
    const existing = this.#inMemory.find(r =>
      r.workflowId === report.workflowId &&
      r.category === report.category &&
      !r.resolved
    );
    if (existing) return existing;

    // Check DB
    if (this.#db) {
      const row = this.#db.prepare(
        'SELECT * FROM glitch_reports WHERE workflow_id = ? AND category = ? AND resolved = 0'
      ).get(report.workflowId, report.category);

      if (row) {
        return this.#rowToReport(row);
      }
    }

    return null;
  }

  /**
   * Get a report by ID.
   * @param {string} id
   * @returns {object|null}
   */
  get(id) {
    const mem = this.#inMemory.find(r => r.id === id);
    if (mem) return mem;

    if (this.#db) {
      const row = this.#db.prepare('SELECT * FROM glitch_reports WHERE id = ?').get(id);
      return row ? this.#rowToReport(row) : null;
    }

    return null;
  }

  /**
   * List reports with optional filters.
   * @param {Object} filters - { severity, category, unresolved, workflowId, limit, offset }
   * @returns {object[]}
   */
  list(filters = {}) {
    if (this.#db) {
      const conditions = [];
      const params = [];

      if (filters.severity) { conditions.push('severity = ?'); params.push(filters.severity); }
      if (filters.category) { conditions.push('category = ?'); params.push(filters.category); }
      if (filters.unresolved) { conditions.push('resolved = 0'); }
      if (filters.workflowId) { conditions.push('workflow_id = ?'); params.push(filters.workflowId); }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = Math.min(filters.limit || 50, 200);
      const offset = filters.offset || 0;

      const rows = this.#db.prepare(
        `SELECT * FROM glitch_reports ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
      ).all(...params, limit, offset);

      return rows.map(r => this.#rowToReport(r));
    }

    // In-memory fallback
    let results = [...this.#inMemory];
    if (filters.severity) results = results.filter(r => r.severity === filters.severity);
    if (filters.category) results = results.filter(r => r.category === filters.category);
    if (filters.unresolved) results = results.filter(r => !r.resolved);
    if (filters.workflowId) results = results.filter(r => r.workflowId === filters.workflowId);

    return results.slice(0, filters.limit || 50);
  }

  /**
   * Resolve a glitch report.
   * @param {string} id
   * @param {string} resolvedBy
   */
  resolve(id, resolvedBy = 'system') {
    const report = this.get(id);
    if (!report) return null;

    report.resolved = true;
    report.resolvedAt = new Date().toISOString();
    report.resolvedBy = resolvedBy;
    return this.save(report);
  }

  /**
   * Get trend analysis.
   * @returns {object}
   */
  getTrends() {
    const reports = this.list({ limit: 200 });
    const bySeverity = {};
    const byCategory = {};

    for (const r of reports) {
      bySeverity[r.severity] = (bySeverity[r.severity] || 0) + 1;
      byCategory[r.category] = (byCategory[r.category] || 0) + 1;
    }

    return {
      total: reports.length,
      resolved: reports.filter(r => r.resolved).length,
      unresolved: reports.filter(r => !r.resolved).length,
      bySeverity,
      byCategory,
      avgHealthScore: reports.length > 0
        ? Math.round(reports.reduce((s, r) => s + (r.overallHealthScore || 50), 0) / reports.length)
        : null,
    };
  }

  /**
   * Convert a DB row to a report object.
   * @private
   */
  #rowToReport(row) {
    return {
      id: row.id,
      workflowId: row.workflow_id,
      stepId: row.step_id,
      severity: row.severity,
      category: row.category,
      title: row.title,
      description: row.description,
      findings: JSON.parse(row.findings || '[]'),
      probes: JSON.parse(row.probes || '[]'),
      overallHealthScore: row.overall_health_score,
      recommendations: JSON.parse(row.recommendations || '[]'),
      analysisMethod: row.analysis_method,
      recurrenceCount: row.recurrence_count,
      resolved: row.resolved === 1,
      resolvedAt: row.resolved_at,
      resolvedBy: row.resolved_by,
      metadata: JSON.parse(row.metadata || '{}'),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// ============================================================
// FeedbackLoop — translates glitch reports into fix proposals
// ============================================================
export class FeedbackLoop {
  #provider;
  #modelName;

  /**
   * @param {object} provider - AI analysis provider (async complete(prompt, options))
   * @param {string} [model] - Model identifier; defaults to GLITCH_ANALYSIS_MODEL env var
   */
  constructor(provider, model) {
    this.#provider = provider;
    this.#modelName = model || DEFAULT_MODEL;
  }

  /**
   * Generate fix proposals from unresolved glitch reports.
   * Per blueprint: all proposals require human approval via ChangeControl.
   * @param {object[]} reports - Array of unresolved GlitchReport objects
   * @returns {Promise<FixProposal[]>}
   */
  async generateFixProposals(reports) {
    if (!reports || reports.length === 0) return [];

    const proposals = [];

    for (const report of reports) {
      if (!report.findings || report.findings.length === 0) continue;

      try {
        const result = await this.#provider.complete(
          `Based on this glitch report, propose concrete fixes:

REPORT ID: ${report.id}
SEVERITY: ${report.severity}
CATEGORY: ${report.category}
TITLE: ${report.title}
FINDINGS: ${JSON.stringify(report.findings, null, 2)}
RECOMMENDATIONS: ${JSON.stringify(report.recommendations || [], null, 2)}

For each finding, propose:
1. A specific, actionable fix
2. Which module/file should be modified
3. Priority (must-fix, should-fix, nice-to-have)
4. Estimated implementation effort

Respond with JSON:
{
  "proposals": [
    {
      "finding": "description of the finding",
      "fix": "specific fix description",
      "targetModule": "module name",
      "priority": "must-fix|should-fix|nice-to-have",
      "effort": "small|medium|large",
      "requiresApproval": true
    }
  ]
}`,
          {
            model: this.#modelName,
            temperature: 0.3,
            responseFormat: { type: 'json_object' },
            system: 'You are a software reliability engineer. Propose specific, actionable fixes for detected issues. All fixes require human approval.',
          }
        );

        let parsed;
        try {
          parsed = JSON.parse(result.content);
        } catch {
          parsed = { proposals: [] };
        }

        for (const proposal of (parsed.proposals || [])) {
          proposals.push({
            id: randomUUID(),
            reportId: report.id,
            severity: report.severity,
            ...proposal,
            status: 'pending', // All proposals require approval
            createdAt: new Date().toISOString(),
          });
        }
      } catch {
        // Skip failed proposals
      }
    }

    return proposals;
  }
}
