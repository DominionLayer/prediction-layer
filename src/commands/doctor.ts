/**
 * Doctor Command - Validate configuration and connectivity
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getConfig, loadConfig } from '../core/config/loader.js';
import { getDatabase, closeDatabase } from '../core/db/database.js';
import { createProvider } from '../core/providers/index.js';
import { createPolymarketClient } from '../polymarket/client.js';

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'skip';
  message: string;
  details?: string;
}

export const doctorCommand = new Command('doctor')
  .description('Validate configuration and connectivity')
  .action(async () => {
    console.log();
    console.log(chalk.bold('Dominion-PM Doctor'));
    console.log('='.repeat(60));
    console.log();

    const results: CheckResult[] = [];

    // Check config
    results.push(await checkConfig());

    // Check database
    results.push(await checkDatabase());

    // Check LLM providers
    const llmResults = await checkLLMProviders();
    results.push(...llmResults);

    // Check Polymarket connectivity
    results.push(await checkPolymarket());

    // Check environment variables
    results.push(...checkEnvironmentVariables());

    // Display results
    console.log();
    console.log(chalk.bold('Results'));
    console.log('-'.repeat(60));
    console.log();

    let hasErrors = false;
    let hasWarnings = false;

    for (const result of results) {
      const icon = result.status === 'pass' ? chalk.green('[OK]') :
                   result.status === 'fail' ? chalk.red('[FAIL]') :
                   result.status === 'warn' ? chalk.yellow('[WARN]') :
                   chalk.gray('[SKIP]');
      
      console.log(`${icon} ${result.name}`);
      console.log(`     ${chalk.gray(result.message)}`);
      if (result.details) {
        console.log(`     ${chalk.gray(result.details)}`);
      }
      console.log();

      if (result.status === 'fail') hasErrors = true;
      if (result.status === 'warn') hasWarnings = true;
    }

    // Summary
    console.log('-'.repeat(60));
    const passCount = results.filter(r => r.status === 'pass').length;
    const failCount = results.filter(r => r.status === 'fail').length;
    const warnCount = results.filter(r => r.status === 'warn').length;

    console.log(`${chalk.green(passCount)} passed, ${chalk.red(failCount)} failed, ${chalk.yellow(warnCount)} warnings`);
    console.log();

    if (hasErrors) {
      console.log(chalk.red('Some checks failed. Please fix the issues above.'));
      process.exit(1);
    } else if (hasWarnings) {
      console.log(chalk.yellow('Some warnings detected. CLI should work but may have limited functionality.'));
    } else {
      console.log(chalk.green('All checks passed! dominion-pm is ready to use.'));
    }
  });

async function checkConfig(): Promise<CheckResult> {
  try {
    const config = loadConfig();
    return {
      name: 'Configuration',
      status: 'pass',
      message: `Loaded configuration: ${config.general.name}`,
      details: `Environment: ${config.general.environment}, Provider: ${config.provider.default}`,
    };
  } catch (error) {
    return {
      name: 'Configuration',
      status: 'fail',
      message: `Failed to load config: ${(error as Error).message}`,
    };
  }
}

async function checkDatabase(): Promise<CheckResult> {
  try {
    const config = getConfig();
    const db = getDatabase(config.database.path);
    
    // Try a simple query
    const stmt = db.prepare('SELECT COUNT(*) as count FROM markets');
    const result = stmt.get() as { count: number };
    
    closeDatabase();

    return {
      name: 'Database',
      status: 'pass',
      message: `SQLite database operational at ${config.database.path}`,
      details: `Markets in database: ${result.count}`,
    };
  } catch (error) {
    return {
      name: 'Database',
      status: 'fail',
      message: `Database error: ${(error as Error).message}`,
    };
  }
}

async function checkLLMProviders(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const config = getConfig();

  // OpenAI
  if (process.env.OPENAI_API_KEY) {
    try {
      const provider = createProvider('openai');
      const available = await provider.isAvailable();
      results.push({
        name: 'OpenAI Provider',
        status: available ? 'pass' : 'warn',
        message: available ? 'OpenAI API is reachable' : 'OpenAI API key set but connection failed',
        details: `Model: ${config.provider.openai?.model || 'default'}`,
      });
    } catch (error) {
      results.push({
        name: 'OpenAI Provider',
        status: 'warn',
        message: `OpenAI check failed: ${(error as Error).message}`,
      });
    }
  } else {
    results.push({
      name: 'OpenAI Provider',
      status: 'skip',
      message: 'OPENAI_API_KEY not set',
    });
  }

  // Anthropic
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const provider = createProvider('anthropic');
      const available = await provider.isAvailable();
      results.push({
        name: 'Anthropic Provider',
        status: available ? 'pass' : 'warn',
        message: available ? 'Anthropic API is reachable' : 'Anthropic API key set but connection failed',
        details: `Model: ${config.provider.anthropic?.model || 'default'}`,
      });
    } catch (error) {
      results.push({
        name: 'Anthropic Provider',
        status: 'warn',
        message: `Anthropic check failed: ${(error as Error).message}`,
      });
    }
  } else {
    results.push({
      name: 'Anthropic Provider',
      status: 'skip',
      message: 'ANTHROPIC_API_KEY not set',
    });
  }

  // Stub (always available)
  results.push({
    name: 'Stub Provider',
    status: 'pass',
    message: 'Stub provider always available for testing',
  });

  return results;
}

async function checkPolymarket(): Promise<CheckResult> {
  try {
    const client = createPolymarketClient();
    const markets = await client.getActiveMarkets(1);
    
    if (markets.length > 0) {
      return {
        name: 'Polymarket API',
        status: 'pass',
        message: 'Successfully connected to Polymarket API',
        details: `Fetched market: ${markets[0].question.slice(0, 40)}...`,
      };
    } else {
      return {
        name: 'Polymarket API',
        status: 'warn',
        message: 'Connected but no markets returned',
      };
    }
  } catch (error) {
    return {
      name: 'Polymarket API',
      status: 'warn',
      message: `Failed to connect: ${(error as Error).message}`,
      details: 'Use --mock flag for offline testing',
    };
  }
}

function checkEnvironmentVariables(): CheckResult[] {
  const results: CheckResult[] = [];
  const config = getConfig();

  // Check if we have at least one working provider
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  const defaultProvider = config.provider.default;

  if (defaultProvider !== 'stub' && !hasOpenAI && !hasAnthropic) {
    results.push({
      name: 'LLM API Keys',
      status: 'warn',
      message: 'No LLM API keys configured',
      details: 'Set OPENAI_API_KEY or ANTHROPIC_API_KEY, or use stub provider',
    });
  } else {
    results.push({
      name: 'LLM API Keys',
      status: defaultProvider === 'stub' ? 'pass' : (hasOpenAI || hasAnthropic ? 'pass' : 'warn'),
      message: defaultProvider === 'stub' 
        ? 'Using stub provider (no API keys needed)'
        : `Default provider: ${defaultProvider}`,
    });
  }

  return results;
}

