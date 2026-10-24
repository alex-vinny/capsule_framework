import { ChangeDetectorRef, Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { alerts, bridge } from '@capsule/core'

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  styles: [
    `
      *,
      *::before,
      *::after {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      :host {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background: #f0f4f8;
        color: #1c1c1e;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
      }
      .header {
        background: linear-gradient(135deg, #0a84ff 0%, #5856d6 100%);
        padding: 18px 24px;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .header-icon {
        width: 32px;
        height: 32px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
      }
      .header-name {
        font-size: 18px;
        font-weight: 700;
        color: #fff;
        letter-spacing: -0.3px;
      }
      .main {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 32px 24px;
        gap: 16px;
        overflow-y: auto;
      }
      .card {
        background: #fff;
        border-radius: 24px;
        padding: 36px 28px;
        max-width: 360px;
        width: 100%;
        box-shadow:
          0 4px 32px rgba(10, 132, 255, 0.1),
          0 1px 4px rgba(0, 0, 0, 0.06);
        text-align: center;
      }
      .card-badge {
        display: inline-block;
        background: #f0f4f8;
        color: #5856d6;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        padding: 4px 12px;
        border-radius: 20px;
        margin-bottom: 24px;
      }
      .card-title {
        font-size: 28px;
        font-weight: 800;
        line-height: 1.2;
        letter-spacing: -0.5px;
        margin-bottom: 12px;
      }
      .card-title span {
        color: #0a84ff;
      }
      .card-desc {
        font-size: 15px;
        color: #8e8e93;
        line-height: 1.5;
        margin-bottom: 20px;
      }
      .result {
        font-size: 13px;
        color: #5856d6;
        margin-top: 8px;
        word-break: break-all;
        min-height: 18px;
      }
      button {
        width: 100%;
        padding: 15px;
        border-radius: 14px;
        border: none;
        background: linear-gradient(135deg, #0a84ff 0%, #5856d6 100%);
        color: #fff;
        font-size: 16px;
        font-weight: 700;
        font-family: inherit;
        cursor: pointer;
        letter-spacing: -0.2px;
        transition:
          opacity 0.15s,
          transform 0.1s;
      }
      button:active {
        opacity: 0.85;
        transform: scale(0.98);
      }
      .secondary {
        margin-top: 10px;
      }
      .btn-clear {
        background: none;
        color: #8e8e93;
        border: 1px solid rgba(0, 0, 0, 0.12);
      }
      .tab-bar {
        display: flex;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(10px);
        border-top: 1px solid rgba(0, 0, 0, 0.08);
      }
      .tab {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 10px 0 14px;
        gap: 3px;
        background: none;
        border: none;
        cursor: pointer;
        font-family: inherit;
        color: #8e8e93;
        transition: color 0.15s;
      }
      .tab.active {
        color: #0a84ff;
      }
      .tab-icon {
        font-size: 22px;
        line-height: 1;
      }
      .tab-label {
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
    `,
  ],
  template: `
    <header class="header">
      <div class="header-icon">⚡</div>
      <span class="header-name">Capsule</span>
    </header>

    <main class="main">
      <div class="card" *ngIf="tab === 'home'">
        <span class="card-badge">Angular + TypeScript</span>
        <h1 class="card-title">Welcome to<br /><span>Capsule</span></h1>
        <p class="card-desc">Your app is ready.<br />Tap below to test native integration.</p>
        <button (click)="sayHello()">Say Hello</button>
      </div>

      <div class="card" *ngIf="tab === 'server'">
        <span class="card-badge">Server Routes</span>
        <h2 class="card-title"><span>API</span></h2>
        <p class="card-desc">Backed by QuickJS on device,<br />Node.js in dev mode.</p>
        <button (click)="callHello()">Call hello route</button>
        <p class="result">{{ rpcResult }}</p>
        <button class="secondary" (click)="callPing()">GET /api/ping</button>
        <p class="result">{{ pingResult }}</p>
        <button
          class="secondary btn-clear"
          *ngIf="rpcResult || pingResult"
          (click)="clearResults()"
        >
          Clear
        </button>
      </div>
    </main>

    <nav class="tab-bar">
      <button class="tab" [class.active]="tab === 'home'" (click)="tab = 'home'">
        <span class="tab-icon">⌂</span>
        <span class="tab-label">Home</span>
      </button>
      <button class="tab" [class.active]="tab === 'server'" (click)="tab = 'server'">
        <span class="tab-icon">⚡</span>
        <span class="tab-label">Server</span>
      </button>
    </nav>
  `,
})
export class AppComponent {
  tab = 'home'
  rpcResult = ''
  pingResult = ''

  // Zoneless change detection (main.ts): Angular re-renders after template
  // events, not after promises it can't see — the Capsule bridge's results
  // arrive from the native side (or the dev fetch wrapper). So each async
  // handler runs change detection itself once its result is in.
  constructor(private cdr: ChangeDetectorRef) {}

  sayHello() {
    alerts.show({
      title: 'Hello from Capsule!',
      message: 'Native integration is working.',
      style: { accentColor: '#0a84ff', cornerRadius: 20 },
    })
  }

  clearResults() {
    this.rpcResult = ''
    this.pingResult = ''
  }

  async callHello() {
    try {
      const res = await bridge.call<{ message: string }>('hello', { name: 'World' })
      this.rpcResult = res.message
    } catch (e) {
      this.rpcResult = e instanceof Error ? e.message : String(e)
    }
    this.cdr.detectChanges()
  }

  async callPing() {
    try {
      const res = await fetch('/api/ping')
      const data = await res.json()
      this.pingResult = JSON.stringify(data)
    } catch (e) {
      this.pingResult = e instanceof Error ? e.message : String(e)
    }
    this.cdr.detectChanges()
  }
}
