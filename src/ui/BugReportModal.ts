import { BugReportCategory } from '../types/game';
import { buildBugReportBundle } from '../systems/BugReport';
import { EventLog } from '../systems/EventLog';

export class BugReportModal {
  private static instance: BugReportModal | null = null;

  private overlayEl: HTMLElement | null = null;
  private crashBannerEl: HTMLElement | null = null;
  private isVisible: boolean = false;

  private constructor() {
    this.createDom();
    this.bindGlobalKeys();
    EventLog.getInstance().setCrashPromptHandler(() => {
      this.showCrashPrompt();
    });
  }

  public static getInstance(): BugReportModal {
    if (!BugReportModal.instance) {
      BugReportModal.instance = new BugReportModal();
    }
    return BugReportModal.instance;
  }

  private createDom(): void {
    if (typeof document === 'undefined') return;

    // 1. Crash Banner (non-blocking prompt)
    const crashBanner = document.createElement('div');
    crashBanner.id = 'crash-prompt-banner';
    crashBanner.style.cssText = `
      display: none;
      position: fixed;
      top: 16px;
      right: 16px;
      background: rgba(185, 28, 28, 0.95);
      backdrop-filter: blur(6px);
      border: 1.5px solid #ef4444;
      border-radius: 8px;
      padding: 10px 14px;
      color: #fee2e2;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 4px 15px rgba(0,0,0,0.5);
      z-index: 10050;
      align-items: center;
      gap: 10px;
    `;
    crashBanner.innerHTML = `
      <span>⚠️ Something went wrong. Send a bug report?</span>
      <button id="crash-banner-open-btn" type="button" style="
        background: #ef4444;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 4px 10px;
        font-size: 12px;
        font-weight: bold;
        cursor: pointer;
      ">Report</button>
      <button id="crash-banner-dismiss-btn" type="button" style="
        background: transparent;
        color: #fca5a5;
        border: none;
        font-size: 14px;
        cursor: pointer;
      ">✕</button>
    `;
    document.body.appendChild(crashBanner);
    this.crashBannerEl = crashBanner;

    const crashOpenBtn = crashBanner.querySelector('#crash-banner-open-btn');
    crashOpenBtn?.addEventListener('click', () => {
      this.hideCrashPrompt();
      this.open('Crash');
    });

    const crashDismissBtn = crashBanner.querySelector('#crash-banner-dismiss-btn');
    crashDismissBtn?.addEventListener('click', () => {
      this.hideCrashPrompt();
    });

    // 2. Main Bug Report Modal Overlay
    const overlay = document.createElement('div');
    overlay.id = 'bug-report-overlay';
    overlay.style.cssText = `
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(4px);
      z-index: 10060;
      justify-content: center;
      align-items: center;
      padding: 16px;
      box-sizing: border-box;
    `;

    const modal = document.createElement('div');
    modal.id = 'bug-report-modal';
    modal.style.cssText = `
      background: #111827;
      border: 1.5px solid #ef4444;
      border-radius: 10px;
      width: 520px;
      max-width: 95vw;
      max-height: 90vh;
      overflow-y: auto;
      padding: 20px 24px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.8);
      color: #f3f4f6;
      font-family: inherit;
      display: flex;
      flex-direction: column;
      gap: 14px;
      box-sizing: border-box;
    `;

    modal.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 20px;">🐛</span>
          <span style="font-size: 18px; font-weight: 700; color: #f87171;">Report a Bug</span>
        </div>
        <button id="bug-report-close-btn" type="button" style="
          background: transparent;
          border: none;
          color: #9ca3af;
          font-size: 18px;
          cursor: pointer;
        ">✕</button>
      </div>

      <div style="font-size: 11px; color: #9ca3af; background: rgba(31, 41, 55, 0.6); padding: 8px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.06);">
        ℹ️ <strong>Note:</strong> This report includes your recent game actions and your save. No personal information is sent.
      </div>

      <!-- Category -->
      <div>
        <label for="bug-report-cat" style="display: block; font-size: 12px; font-weight: 600; color: #d1d5db; margin-bottom: 4px;">Category:</label>
        <select id="bug-report-cat" style="
          width: 100%;
          background: #1f2937;
          border: 1px solid #4b5563;
          border-radius: 6px;
          padding: 6px 10px;
          color: #f3f4f6;
          font-size: 13px;
        ">
          <option value="Combat">Combat</option>
          <option value="Items & gear">Items & gear</option>
          <option value="Classes & skills">Classes & skills</option>
          <option value="UI">UI</option>
          <option value="Crash">Crash</option>
          <option value="Other">Other</option>
        </select>
      </div>

      <!-- What happened? -->
      <div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <label for="bug-report-what" style="font-size: 12px; font-weight: 600; color: #d1d5db;">What happened? <span style="color: #ef4444;">*</span></label>
          <span id="bug-report-what-count" style="font-size: 11px; color: #9ca3af;">0 / 2,000</span>
        </div>
        <textarea id="bug-report-what" maxlength="2000" rows="4" placeholder="Describe what went wrong..." style="
          width: 100%;
          background: #1f2937;
          border: 1px solid #4b5563;
          border-radius: 6px;
          padding: 8px 10px;
          color: #f3f4f6;
          font-size: 13px;
          resize: vertical;
          box-sizing: border-box;
        "></textarea>
      </div>

      <!-- What did you expect? -->
      <div>
        <label for="bug-report-expected" style="display: block; font-size: 12px; font-weight: 600; color: #d1d5db; margin-bottom: 4px;">What did you expect? (optional)</label>
        <textarea id="bug-report-expected" rows="2" placeholder="What should have happened instead?" style="
          width: 100%;
          background: #1f2937;
          border: 1px solid #4b5563;
          border-radius: 6px;
          padding: 8px 10px;
          color: #f3f4f6;
          font-size: 13px;
          resize: vertical;
          box-sizing: border-box;
        "></textarea>
      </div>

      <!-- Feedback / Status area -->
      <div id="bug-report-status" style="display: none; padding: 10px; border-radius: 6px; font-size: 12px;"></div>

      <!-- Action buttons -->
      <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px;">
        <button id="bug-report-cancel-btn" class="btn-action" style="background: #374151; border-color: #4b5563;" type="button">Cancel</button>
        <button id="bug-report-submit-btn" class="btn-action" style="background: #dc2626; border-color: #ef4444;" type="button">Send Report</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    this.overlayEl = overlay;

    // Bind modal controls
    const closeBtn = modal.querySelector('#bug-report-close-btn');
    closeBtn?.addEventListener('click', () => this.close());

    const cancelBtn = modal.querySelector('#bug-report-cancel-btn');
    cancelBtn?.addEventListener('click', () => this.close());

    const whatInput = modal.querySelector('#bug-report-what') as HTMLTextAreaElement | null;
    const whatCount = modal.querySelector('#bug-report-what-count');
    whatInput?.addEventListener('input', () => {
      if (whatCount) {
        whatCount.textContent = `${whatInput.value.length} / 2,000`;
      }
    });

    const submitBtn = modal.querySelector('#bug-report-submit-btn');
    submitBtn?.addEventListener('click', () => this.submit());
  }

  private bindGlobalKeys(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'F8') {
        e.preventDefault();
        e.stopPropagation();
        if (this.isVisible) {
          this.close();
        } else {
          this.open();
        }
      } else if (e.key === 'Escape' && this.isVisible) {
        this.close();
      }
    });
  }

  public showCrashPrompt(): void {
    if (this.crashBannerEl) {
      this.crashBannerEl.style.display = 'flex';
    }
  }

  public hideCrashPrompt(): void {
    if (this.crashBannerEl) {
      this.crashBannerEl.style.display = 'none';
    }
  }

  public open(category?: BugReportCategory): void {
    if (!this.overlayEl) this.createDom();
    if (!this.overlayEl) return;

    this.isVisible = true;
    this.overlayEl.style.display = 'flex';

    const statusEl = this.overlayEl.querySelector('#bug-report-status') as HTMLElement | null;
    if (statusEl) {
      statusEl.style.display = 'none';
      statusEl.innerHTML = '';
    }

    const catSelect = this.overlayEl.querySelector('#bug-report-cat') as HTMLSelectElement | null;
    if (catSelect && category) {
      catSelect.value = category;
    }

    const whatInput = this.overlayEl.querySelector('#bug-report-what') as HTMLTextAreaElement | null;
    if (whatInput) {
      whatInput.focus();
    }
  }

  public close(): void {
    if (!this.overlayEl) return;
    this.isVisible = false;
    this.overlayEl.style.display = 'none';
  }

  private async submit(): Promise<void> {
    if (!this.overlayEl) return;

    const whatInput = this.overlayEl.querySelector('#bug-report-what') as HTMLTextAreaElement | null;
    const expectedInput = this.overlayEl.querySelector('#bug-report-expected') as HTMLTextAreaElement | null;
    const catSelect = this.overlayEl.querySelector('#bug-report-cat') as HTMLSelectElement | null;
    const statusEl = this.overlayEl.querySelector('#bug-report-status') as HTMLElement | null;
    const submitBtn = this.overlayEl.querySelector('#bug-report-submit-btn') as HTMLButtonElement | null;

    const whatHappened = (whatInput?.value || '').trim();
    const whatExpected = (expectedInput?.value || '').trim();
    const category = (catSelect?.value || 'Other') as BugReportCategory;

    if (!whatHappened) {
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(185, 28, 28, 0.4)';
        statusEl.style.border = '1px solid #ef4444';
        statusEl.style.color = '#fecaca';
        statusEl.textContent = 'Please describe what happened (required).';
      }
      whatInput?.focus();
      return;
    }

    // Disable submit button while sending
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';
    }

    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.style.background = 'rgba(31, 41, 55, 0.8)';
      statusEl.style.border = '1px solid #4b5563';
      statusEl.style.color = '#93c5fd';
      statusEl.textContent = 'Generating bug report bundle and contacting server...';
    }

    // Resolve active scene party if available
    let party: any[] | undefined = undefined;
    let progression: any = undefined;
    let sceneTime: number = 0;
    try {
      const phaserGame = (window as any).game;
      const activeScenes = phaserGame?.scene?.getScenes(true) || [];
      const gameScene = activeScenes.find((s: any) => s.scene?.key === 'MainScene' || s.scene?.key === 'OutpostScene');
      if (gameScene) {
        party = gameScene.party;
        progression = gameScene.progressionSystem;
        sceneTime = gameScene.time?.now || 0;
      }
    } catch {
      // ignore
    }

    const bundle = buildBugReportBundle({
      whatHappened,
      whatExpected,
      category,
      party,
      progression,
      sceneTime
    });

    try {
      const res = await fetch('/api/bug-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(bundle)
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error || `Server responded with status ${res.status}`);
      }

      const resData = await res.json();
      const reportId = resData.reportId || bundle.reportId;

      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(6, 95, 70, 0.5)';
        statusEl.style.border = '1px solid #10b981';
        statusEl.style.color = '#a7f3d0';
        statusEl.innerHTML = `✅ <strong>Report ${reportId} sent. Thank you!</strong>`;
      }

      if (whatInput) whatInput.value = '';
      if (expectedInput) expectedInput.value = '';

      setTimeout(() => {
        this.close();
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send Report';
        }
      }, 2500);
    } catch (err: any) {
      console.error('[BugReport] Failed to transmit report:', err);

      // Offer direct download of JSON bundle so nothing is lost
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(185, 28, 28, 0.4)';
        statusEl.style.border = '1px solid #ef4444';
        statusEl.style.color = '#fecaca';

        const jsonStr = JSON.stringify(bundle, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const blobUrl = URL.createObjectURL(blob);

        statusEl.innerHTML = `
          <div>❌ <strong>Failed to send report online:</strong> ${err?.message || 'Network error'}</div>
          <div style="margin-top: 8px;">
            <a href="${blobUrl}" download="${bundle.reportId}-bug-report.json" style="
              display: inline-block;
              background: #2563eb;
              color: white;
              padding: 6px 12px;
              border-radius: 4px;
              text-decoration: none;
              font-weight: bold;
              font-size: 12px;
            ">📥 Download Report (${bundle.reportId}.json)</a>
          </div>
        `;
      }

      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Retry Send';
      }
    }
  }
}
