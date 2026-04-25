import { spawn, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import { app } from 'electron';

export interface EngineRuntimeInfo {
  pid: number;
  port: number;
  version: string;
  started_at: string;
  status: 'starting' | 'healthy' | 'unhealthy' | 'stopped';
}

export interface SupervisorOptions {
  pythonPath: string;
  pythonSrcPath: string;
  preferredPort?: number;
  healthPath?: string;
  maxRestarts?: number;
  extraEnv?: Record<string, string>;
  onLog?: (line: string, stream: 'stdout' | 'stderr') => void;
  onStatusChange?: (info: EngineRuntimeInfo) => void;
}

export class EngineSupervisor {
  private proc: ChildProcess | null = null;
  private options: Required<Omit<SupervisorOptions, 'onLog' | 'onStatusChange' | 'extraEnv'>> &
    Pick<SupervisorOptions, 'onLog' | 'onStatusChange' | 'extraEnv'>;
  private currentPort = 0;
  private version = '';
  private restartCount = 0;
  private intentionalShutdown = false;
  private runtimeFilePath: string;
  private info: EngineRuntimeInfo | null = null;
  private healthTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: SupervisorOptions) {
    this.options = {
      preferredPort: Number(process.env.FORGE_ENGINE_PORT) || 8420,
      healthPath: '/v1/health',
      maxRestarts: 3,
      ...options,
    } as typeof this.options;

    const runtimeDir = path.join(app.getPath('home'), 'FORGE_LIBRARY', '.runtime');
    fs.mkdirSync(runtimeDir, { recursive: true });
    this.runtimeFilePath = path.join(runtimeDir, 'engine.json');
  }

  async start(): Promise<EngineRuntimeInfo> {
    this.intentionalShutdown = false;
    this.currentPort = await findAvailablePort(this.options.preferredPort);
    this.spawnEngine();
    await this.waitForHealthy(60_000);
    this.startHealthPolling();
    return this.info!;
  }

  async stop(): Promise<void> {
    this.intentionalShutdown = true;
    if (this.healthTimer) { clearInterval(this.healthTimer); this.healthTimer = null; }
    if (!this.proc) { this.writeRuntime({ status: 'stopped' }); return; }

    const proc = this.proc;
    this.proc = null;
    try { proc.kill(); } catch {}

    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        if (proc.exitCode === null) {
          try {
            if (process.platform === 'win32' && proc.pid) {
              require('child_process').execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: 'ignore' });
            } else {
              proc.kill('SIGKILL');
            }
          } catch {}
        }
        resolve();
      }, 5000);
      proc.once('exit', () => { clearTimeout(t); resolve(); });
    });
    this.writeRuntime({ status: 'stopped' });
  }

  getInfo(): EngineRuntimeInfo | null { return this.info; }

  private spawnEngine(): void {
    const { pythonPath, pythonSrcPath, extraEnv, onLog } = this.options;
    const env = {
      ...process.env,
      PYTHONPATH: pythonSrcPath,
      PYTHONDONTWRITEBYTECODE: '1',
      ...(extraEnv || {}),
    };

    const args = [
      '-m', 'uvicorn', 'forge_engine.main:app',
      '--host', '127.0.0.1',
      '--port', String(this.currentPort),
      '--log-level', 'warning',
    ];

    this.proc = spawn(pythonPath, args, {
      cwd: pythonSrcPath,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.proc.stdout?.on('data', (buf: Buffer) => {
      for (const line of buf.toString('utf8').split(/\r?\n/)) if (line) onLog?.(line, 'stdout');
    });
    this.proc.stderr?.on('data', (buf: Buffer) => {
      for (const line of buf.toString('utf8').split(/\r?\n/)) if (line) onLog?.(line, 'stderr');
    });

    this.proc.on('exit', (code) => {
      if (this.intentionalShutdown) return;
      onLog?.(`[engine] exited with code ${code}`, 'stderr');
      this.handleUnexpectedExit();
    });

    this.info = {
      pid: this.proc.pid ?? 0,
      port: this.currentPort,
      version: this.version || 'unknown',
      started_at: new Date().toISOString(),
      status: 'starting',
    };
    this.writeRuntime(this.info);
    this.options.onStatusChange?.(this.info);
  }

  private async handleUnexpectedExit(): Promise<void> {
    if (this.restartCount >= this.options.maxRestarts) {
      this.options.onLog?.('[engine] max restart limit reached', 'stderr');
      this.writeRuntime({ status: 'stopped' });
      return;
    }
    this.restartCount += 1;
    const backoff = Math.min(30_000, 1000 * Math.pow(2, this.restartCount));
    this.options.onLog?.(`[engine] restarting in ${backoff}ms (attempt ${this.restartCount})`, 'stderr');
    await new Promise((r) => setTimeout(r, backoff));
    try {
      this.currentPort = await findAvailablePort(this.currentPort);
      this.spawnEngine();
      await this.waitForHealthy(60_000);
      this.startHealthPolling();
    } catch (e: any) {
      this.options.onLog?.(`[engine] restart failed: ${e?.message}`, 'stderr');
    }
  }

  private async waitForHealthy(timeoutMs: number): Promise<void> {
    const start = Date.now();
    const url = `http://127.0.0.1:${this.currentPort}${this.options.healthPath}`;
    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const data: any = await res.json().catch(() => ({}));
          this.version = data.version ?? 'unknown';
          this.updateStatus('healthy');
          return;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`engine health timeout after ${timeoutMs}ms`);
  }

  private startHealthPolling(): void {
    if (this.healthTimer) clearInterval(this.healthTimer);
    this.healthTimer = setInterval(async () => {
      if (this.intentionalShutdown || !this.proc) return;
      try {
        const res = await fetch(`http://127.0.0.1:${this.currentPort}${this.options.healthPath}`, {
          signal: AbortSignal.timeout(3000),
        });
        this.updateStatus(res.ok ? 'healthy' : 'unhealthy');
      } catch {
        this.updateStatus('unhealthy');
      }
    }, 10_000);
  }

  private updateStatus(status: EngineRuntimeInfo['status']): void {
    if (!this.info || this.info.status === status) return;
    this.info = { ...this.info, status };
    this.writeRuntime(this.info);
    this.options.onStatusChange?.(this.info);
  }

  private writeRuntime(patch: Partial<EngineRuntimeInfo>): void {
    try {
      const merged = { ...(this.info ?? {}), ...patch };
      fs.writeFileSync(this.runtimeFilePath, JSON.stringify(merged, null, 2));
    } catch {}
  }
}

async function findAvailablePort(preferred: number): Promise<number> {
  const candidates = [preferred, ...Array.from({ length: 20 }, (_, i) => preferred + i + 1)];
  for (let i = 0; i < 5; i++) candidates.push(45000 + Math.floor(Math.random() * 10000));
  for (const p of candidates) {
    if (await isPortAvailable(p)) return p;
  }
  throw new Error('no available port');
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}
