/**
 * Report Generator
 * 
 * Generates JSON and Markdown reports
 */

import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from '../config/loader.js';
import { logger } from '../logging/logger.js';
import type { EdgeAnalysis } from '../../analysis/edge.js';
import type { SimulationResult } from '../../simulation/simulator.js';
import type { Run } from '../db/database.js';

export interface ReportData {
  runId: string;
  command: string;
  timestamp: number;
  analyses?: EdgeAnalysis[];
  simulations?: SimulationResult[];
  summary?: Record<string, unknown>;
}

export function generateReport(data: ReportData): { json: string; markdown: string; paths: string[] } {
  const config = getConfig();
  const outDir = config.reporting.out_dir;
  
  // Ensure output directory exists
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  
  const timestamp = new Date(data.timestamp).toISOString().replace(/[:.]/g, '-');
  const baseName = `${data.command}-${timestamp}`;
  
  // Generate JSON report
  const jsonContent = JSON.stringify(data, null, 2);
  const jsonPath = path.join(outDir, `${baseName}.json`);
  
  // Generate Markdown report
  const markdownContent = generateMarkdown(data);
  const mdPath = path.join(outDir, `${baseName}.md`);
  
  // Write files
  fs.writeFileSync(jsonPath, jsonContent);
  fs.writeFileSync(mdPath, markdownContent);
  
  logger.info(`Reports generated`, { jsonPath, mdPath });
  
  return {
    json: jsonContent,
    markdown: markdownContent,
    paths: [jsonPath, mdPath],
  };
}

function generateMarkdown(data: ReportData): string {
  const lines: string[] = [
    `# Polymarket Analysis Report`,
    '',
    `**Run ID:** ${data.runId}`,
    `**Command:** ${data.command}`,
    `**Generated:** ${new Date(data.timestamp).toISOString()}`,
    '',
    '---',
    '',
    '> **DISCLAIMER:** This report is for informational and educational purposes only.',
    '> It does NOT constitute financial advice. The analyses and simulations presented',
    '> are based on models that may be inaccurate. Never invest more than you can afford to lose.',
    '',
    '---',
    '',
  ];
  
  // Summary section
  if (data.summary) {
    lines.push('## Summary', '');
    for (const [key, value] of Object.entries(data.summary)) {
      lines.push(`- **${formatKey(key)}:** ${formatValue(value)}`);
    }
    lines.push('');
  }
  
  // Analyses section
  if (data.analyses && data.analyses.length > 0) {
    lines.push('## Market Analyses', '');
    
    for (const analysis of data.analyses) {
      lines.push(`### ${analysis.question}`, '');
      lines.push(`**Market ID:** \`${analysis.marketId}\``, '');
      lines.push('');
      lines.push('| Metric | Value |');
      lines.push('|--------|-------|');
      lines.push(`| Market Probability | ${(analysis.marketProbability * 100).toFixed(1)}% |`);
      lines.push(`| Model Probability | ${(analysis.modelProbability * 100).toFixed(1)}% |`);
      lines.push(`| Confidence | ${(analysis.confidence * 100).toFixed(0)}% |`);
      lines.push(`| Edge | ${(analysis.edge * 100).toFixed(1)}% |`);
      lines.push(`| Direction | ${analysis.edgeDirection} |`);
      lines.push(`| EV (YES) | ${(analysis.evYes * 100).toFixed(2)}% |`);
      lines.push(`| EV (NO) | ${(analysis.evNo * 100).toFixed(2)}% |`);
      lines.push(`| Estimator | ${analysis.estimatorType} |`);
      lines.push('');
      
      if (analysis.keyFactors.length > 0) {
        lines.push('**Key Factors:**');
        for (const factor of analysis.keyFactors) {
          lines.push(`- ${factor}`);
        }
        lines.push('');
      }
      
      if (analysis.assumptions.length > 0) {
        lines.push('**Assumptions:**');
        for (const assumption of analysis.assumptions) {
          lines.push(`- ${assumption}`);
        }
        lines.push('');
      }
      
      if (analysis.failureModes.length > 0) {
        lines.push('**Failure Modes:**');
        for (const mode of analysis.failureModes) {
          lines.push(`- ${mode}`);
        }
        lines.push('');
      }
      
      lines.push(`**Recommendation:** ${analysis.recommendation}`, '');
      lines.push('---', '');
    }
  }
  
  // Simulations section
  if (data.simulations && data.simulations.length > 0) {
    lines.push('## Simulations', '');
    
    for (const sim of data.simulations) {
      lines.push(`### ${sim.question}`, '');
      lines.push(`**Position:** ${sim.position} @ $${sim.entryPrice.toFixed(3)} x ${sim.positionSize}`, '');
      lines.push('');
      lines.push('| Metric | Value |');
      lines.push('|--------|-------|');
      lines.push(`| Expected Value | $${sim.expectedValue.toFixed(2)} |`);
      lines.push(`| Expected Return | ${(sim.expectedReturn * 100).toFixed(1)}% |`);
      lines.push(`| Best Case | $${sim.bestCase.toFixed(2)} |`);
      lines.push(`| Worst Case | $${sim.worstCase.toFixed(2)} |`);
      lines.push(`| Break-even | ${(sim.breakEvenProbability * 100).toFixed(1)}% |`);
      lines.push(`| Kelly Fraction | ${(sim.kellyFraction * 100).toFixed(1)}% |`);
      lines.push(`| Max Drawdown | $${sim.maxDrawdown.toFixed(2)} |`);
      lines.push('');
      
      lines.push('**Scenarios:**');
      lines.push('');
      lines.push('| Scenario | Profit | Description |');
      lines.push('|----------|--------|-------------|');
      for (const scenario of sim.scenarios) {
        lines.push(`| ${scenario.name} | $${scenario.profit.toFixed(2)} | ${scenario.description} |`);
      }
      lines.push('');
      lines.push('---', '');
    }
  }
  
  // Footer
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('*Generated by dominion-pm*');
  
  return lines.join('\n');
}

function formatKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatValue(value: unknown): string {
  if (typeof value === 'number') {
    return value.toLocaleString();
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (Array.isArray(value)) {
    return value.join(', ');
  }
  return String(value);
}

/**
 * Regenerate report from run ID
 */
export function regenerateReport(run: Run, analyses: EdgeAnalysis[], simulations: SimulationResult[]): { json: string; markdown: string; paths: string[] } {
  return generateReport({
    runId: run.id,
    command: run.command,
    timestamp: run.started_at,
    analyses,
    simulations,
    summary: {
      status: run.status,
      started_at: new Date(run.started_at).toISOString(),
      completed_at: run.completed_at ? new Date(run.completed_at).toISOString() : 'N/A',
      markets_analyzed: analyses.length,
      simulations_run: simulations.length,
    },
  });
}

