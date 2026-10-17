export type EventLogCategory =
  | 'session'
  | 'floor'
  | 'room'
  | 'combat'
  | 'damage'
  | 'skill'
  | 'equip'
  | 'class'
  | 'progression'
  | 'item'
  | 'craft'
  | 'party'
  | 'save'
  | 'ui'
  | 'error';

export interface LogEntry {
  t: number;             // ms since session started
  at: string;            // ISO timestamp
  floor: string;         // e.g. "F3" or "Outpost"
  cat: EventLogCategory;
  msg: string;
  data?: any;
}

export class EventLog {
  private static instance: EventLog | null = null;
  public static readonly MAX_ENTRIES = 2000;

  private entries: LogEntry[] = [];
  private sessionStartTime: number = Date.now();
  private currentLocation: string = 'Outpost';

  // Error guard & crash prompt tracking
  private isHandlingError: boolean = false;
  private isHandlingLog: boolean = false;
  private lastCrashPromptTime: number = 0;
  private onCrashPromptCallback: (() => void) | null = null;

  // Recent item transaction state for 1-second burst merging
  private lastItemTx: {
    actor: string;
    direction: '+' | '-';
    itemId: string;
    count: number;
    t: number;
    entryRef: LogEntry;
  } | null = null;

  // Track original console methods so we can restore in tests
  private originalConsoleError: typeof console.error = console.error;
  private originalConsoleWarn: typeof console.warn = console.warn;
  private isErrorHandlersInstalled: boolean = false;

  private constructor() {
    this.sessionStartTime = Date.now();
  }

  public static getInstance(): EventLog {
    if (!EventLog.instance) {
      EventLog.instance = new EventLog();
    }
    return EventLog.instance;
  }

  public static resetInstance(): EventLog {
    if (EventLog.instance) {
      EventLog.instance.uninstallErrorHandlers();
    }
    EventLog.instance = new EventLog();
    return EventLog.instance;
  }

  public getSessionStartTime(): number {
    return this.sessionStartTime;
  }

  public setLocation(loc: string | number): void {
    if (typeof loc === 'number') {
      this.currentLocation = loc === 0 ? 'Outpost' : `F${loc}`;
    } else {
      const trimmed = String(loc).trim();
      if (!trimmed) {
        this.currentLocation = 'Outpost';
      } else if (/^\d+$/.test(trimmed)) {
        this.currentLocation = trimmed === '0' ? 'Outpost' : `F${trimmed}`;
      } else {
        this.currentLocation = trimmed;
      }
    }
  }

  public getLocation(): string {
    return this.currentLocation;
  }

  public setCrashPromptHandler(cb: (() => void) | null): void {
    this.onCrashPromptCallback = cb;
  }

  public add(cat: EventLogCategory, msg: string, data?: any): LogEntry {
    if (this.isHandlingLog) {
      // Re-entrancy guard
      return {
        t: Math.max(0, Date.now() - this.sessionStartTime),
        at: new Date().toISOString(),
        floor: this.currentLocation,
        cat,
        msg,
        data
      };
    }

    this.isHandlingLog = true;
    try {
      const now = Date.now();
      const t = Math.max(0, now - this.sessionStartTime);
      const entry: LogEntry = {
        t,
        at: new Date(now).toISOString(),
        floor: this.currentLocation,
        cat,
        msg,
        data
      };

      this.entries.push(entry);
      if (this.entries.length > EventLog.MAX_ENTRIES) {
        this.entries.shift(); // Drop oldest
      }

      // Invalidate lastItemTx if another non-item entry is added
      if (cat !== 'item') {
        this.lastItemTx = null;
      }

      return entry;
    } finally {
      this.isHandlingLog = false;
    }
  }

  /**
   * Merges consecutive same-member, same-item, same-direction calls within 1 s into one entry.
   * e.g., "Valerie: +7 wolf_pelt" or "Stockpile: +50 ore".
   */
  public logItemTransaction(actor: string, direction: '+' | '-', itemId: string, count: number = 1): LogEntry {
    const now = Date.now();
    const t = Math.max(0, now - this.sessionStartTime);

    if (
      this.lastItemTx &&
      this.lastItemTx.actor === actor &&
      this.lastItemTx.direction === direction &&
      this.lastItemTx.itemId === itemId &&
      (t - this.lastItemTx.t) <= 1000 &&
      this.entries.includes(this.lastItemTx.entryRef)
    ) {
      // Merge with existing entry
      this.lastItemTx.count += count;
      this.lastItemTx.t = t;
      this.lastItemTx.entryRef.t = t;
      this.lastItemTx.entryRef.msg = `${actor}: ${direction}${this.lastItemTx.count} ${itemId}`;
      this.lastItemTx.entryRef.data = {
        actor,
        direction,
        itemId,
        count: this.lastItemTx.count
      };
      return this.lastItemTx.entryRef;
    }

    // New item entry
    const entry = this.add(
      'item',
      `${actor}: ${direction}${count} ${itemId}`,
      { actor, direction, itemId, count }
    );

    this.lastItemTx = {
      actor,
      direction,
      itemId,
      count,
      t,
      entryRef: entry
    };

    return entry;
  }

  public getEntries(): LogEntry[] {
    return [...this.entries];
  }

  public clear(): void {
    this.entries = [];
    this.lastItemTx = null;
  }

  public static formatElapsed(elapsedMs: number): string {
    const totalMs = Math.max(0, Math.floor(elapsedMs));
    const ms = totalMs % 1000;
    const totalSec = Math.floor(totalMs / 1000);
    const sec = totalSec % 60;
    const totalMin = Math.floor(totalSec / 60);
    const min = totalMin % 60;
    const hours = Math.floor(totalMin / 60);

    const pad = (n: number, w: number = 2) => String(n).padStart(w, '0');
    return `+${pad(hours)}:${pad(min)}:${pad(sec)}.${pad(ms, 3)}`;
  }

  public toText(): string {
    return this.entries
      .map((e) => {
        const timeStr = `[${EventLog.formatElapsed(e.t)}]`;
        const floorStr = (e.floor || 'Outpost').padEnd(4, ' ');
        const catStr = (e.cat || '').padEnd(11, ' ');
        return `${timeStr} ${floorStr} ${catStr} ${e.msg}`;
      })
      .join('\n');
  }

  public installErrorHandlers(): void {
    if (this.isErrorHandlersInstalled) return;
    this.isErrorHandlersInstalled = true;

    // Preserve original console references
    const origError = console.error.bind(console);
    const origWarn = console.warn.bind(console);
    this.originalConsoleError = origError;
    this.originalConsoleWarn = origWarn;

    // Wrap console.error
    console.error = (...args: any[]) => {
      try {
        if (!this.isHandlingError) {
          this.isHandlingError = true;
          const msg = args.map((a) => (typeof a === 'string' ? a : (a?.stack || a?.message || JSON.stringify(a)))).join(' ');
          this.add('error', `console.error: ${msg}`);
          this.isHandlingError = false;
        }
      } catch {
        this.isHandlingError = false;
      }
      origError(...args);
    };

    // Wrap console.warn
    console.warn = (...args: any[]) => {
      try {
        if (!this.isHandlingError) {
          this.isHandlingError = true;
          const msg = args.map((a) => (typeof a === 'string' ? a : (a?.stack || a?.message || JSON.stringify(a)))).join(' ');
          this.add('error', `console.warn: ${msg}`);
          this.isHandlingError = false;
        }
      } catch {
        this.isHandlingError = false;
      }
      origWarn(...args);
    };

    // Global window.onerror (browser only)
    if (typeof window !== 'undefined') {
      window.addEventListener('error', (event: ErrorEvent) => {
        try {
          const stack = event.error?.stack || `${event.filename}:${event.lineno}:${event.colno}`;
          this.add('error', `Uncaught Error: ${event.message || 'unknown'} | ${stack}`);
          this.triggerCrashPrompt();
        } catch {
          // ignore
        }
      });

      window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
        try {
          const reason = event.reason;
          const stack = reason?.stack || reason?.message || String(reason);
          this.add('error', `Unhandled Promise Rejection: ${stack}`);
          this.triggerCrashPrompt();
        } catch {
          // ignore
        }
      });
    }
  }

  public uninstallErrorHandlers(): void {
    if (!this.isErrorHandlersInstalled) return;
    console.error = this.originalConsoleError;
    console.warn = this.originalConsoleWarn;
    this.isErrorHandlersInstalled = false;
  }

  private triggerCrashPrompt(): void {
    const now = Date.now();
    // Fires AT MOST once per 60 s
    if (now - this.lastCrashPromptTime >= 60000) {
      this.lastCrashPromptTime = now;
      try {
        this.onCrashPromptCallback?.();
      } catch (err) {
        this.originalConsoleError('[EventLog] Failed to trigger crash prompt callback:', err);
      }
    }
  }
}
