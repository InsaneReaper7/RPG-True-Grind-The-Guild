import type Phaser from 'phaser';

let isKeyboardDisabledForInput = false;
let savedCaptures: number[] = [];
let guardsInitialized = false;

/**
 * Shared guard: Returns true if the event target or document.activeElement
 * is an editable text field (input, textarea, select, or contenteditable).
 */
export function isTypingInTextField(e?: Event | KeyboardEvent | null): boolean {
  const isTextElement = (el: any): boolean => {
    if (!el || typeof el !== 'object') return false;
    const tagName = el.tagName?.toLowerCase?.();
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
      return true;
    }
    if (
      el.isContentEditable === true ||
      el.getAttribute?.('contenteditable') === 'true' ||
      el.getAttribute?.('contenteditable') === ''
    ) {
      return true;
    }
    return false;
  };

  if (e && isTextElement(e.target)) {
    return true;
  }
  if (typeof document !== 'undefined' && isTextElement(document.activeElement)) {
    return true;
  }
  return false;
}

/**
 * Disables game keyboard input and captures while a text field has focus.
 */
export function disableGameKeyboard(): void {
  isKeyboardDisabledForInput = true;
  if (typeof window === 'undefined') return;

  const game = (window as any).game;
  if (game?.input?.keyboard) {
    game.input.keyboard.enabled = false;
    game.input.keyboard.preventDefault = false;
    if (game.input.keyboard.captures?.length) {
      savedCaptures = [...game.input.keyboard.captures];
    }
  }

  const scenes: Phaser.Scene[] = game?.scene?.getScenes?.(false) || game?.scene?.scenes || [];
  for (const scene of scenes) {
    if (scene.input?.keyboard) {
      scene.input.keyboard.enabled = false;
      scene.input.keyboard.disableGlobalCapture?.();
      scene.input.keyboard.resetKeys?.();
    }
  }
}

/**
 * Restores game keyboard input and captures when focus leaves text fields.
 */
export function enableGameKeyboard(): void {
  // If another text field still has focus, do not re-enable
  if (isTypingInTextField()) {
    return;
  }
  isKeyboardDisabledForInput = false;
  if (typeof window === 'undefined') return;

  const game = (window as any).game;
  if (game?.input?.keyboard) {
    game.input.keyboard.enabled = true;
    game.input.keyboard.preventDefault = true;
    if (savedCaptures.length > 0 && (!game.input.keyboard.captures || game.input.keyboard.captures.length === 0)) {
      game.input.keyboard.addCapture?.(savedCaptures);
    }
  }

  const scenes: Phaser.Scene[] = game?.scene?.getScenes?.(false) || game?.scene?.scenes || [];
  for (const scene of scenes) {
    if (scene.input?.keyboard) {
      scene.input.keyboard.enabled = true;
      scene.input.keyboard.enableGlobalCapture?.();
      scene.input.keyboard.resetKeys?.();
    }
  }
}

/**
 * Initializes global keyboard interception for Phaser and DOM text inputs.
 */
export function initKeyboardGuards(phaserLib?: any): void {
  if (typeof window === 'undefined' || guardsInitialized) {
    return;
  }
  guardsInitialized = true;

  // Expose on window for runtime checks & tests
  (window as any).isTypingInTextField = isTypingInTextField;
  (window as any).disableGameKeyboard = disableGameKeyboard;
  (window as any).enableGameKeyboard = enableGameKeyboard;

  const phaser =
    phaserLib ||
    (typeof window !== 'undefined' ? (window as any).Phaser : undefined) ||
    (typeof globalThis !== 'undefined' ? (globalThis as any).Phaser : undefined);

  // 1. Patch Phaser prototype methods so no scene key handler fires while typing
  if (phaser && phaser.Input?.Keyboard) {
    // KeyboardPlugin.prototype.isActive: Controls whether update() processes key queue & emits events
    if (phaser.Input.Keyboard.KeyboardPlugin?.prototype) {
      const origIsActive = phaser.Input.Keyboard.KeyboardPlugin.prototype.isActive;
      phaser.Input.Keyboard.KeyboardPlugin.prototype.isActive = function () {
        if (isTypingInTextField() || isKeyboardDisabledForInput) {
          return false;
        }
        return origIsActive.call(this);
      };
    }

    // KeyboardManager.prototype.startListeners: Wraps onKeyDown / onKeyUp to prevent Phaser capture / preventDefault
    if (phaser.Input.Keyboard.KeyboardManager?.prototype) {
      const origStartListeners = phaser.Input.Keyboard.KeyboardManager.prototype.startListeners;
      phaser.Input.Keyboard.KeyboardManager.prototype.startListeners = function () {
        origStartListeners.call(this);
        const origOnKeyDown = this.onKeyDown;
        this.onKeyDown = function (event: KeyboardEvent) {
          if (isTypingInTextField(event) || isKeyboardDisabledForInput) {
            return;
          }
          return origOnKeyDown.call(this, event);
        };
        const origOnKeyUp = this.onKeyUp;
        this.onKeyUp = function (event: KeyboardEvent) {
          if (isTypingInTextField(event) || isKeyboardDisabledForInput) {
            return;
          }
          return origOnKeyUp.call(this, event);
        };
      };
    }

    // Key.prototype.onDown: Key-level callback
    if (phaser.Input.Keyboard.Key?.prototype) {
      const origKeyOnDown = phaser.Input.Keyboard.Key.prototype.onDown;
      phaser.Input.Keyboard.Key.prototype.onDown = function (event: KeyboardEvent) {
        if (isTypingInTextField(event) || isKeyboardDisabledForInput) {
          return;
        }
        return origKeyOnDown.call(this, event);
      };
    }
  }

  // 2. Window focus/blur tracking for text fields (capture phase)
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener(
      'focusin',
      (e) => {
        if (isTypingInTextField(e)) {
          disableGameKeyboard();
        }
      },
      true
    );

    window.addEventListener(
      'focusout',
      () => {
        setTimeout(() => {
          if (!isTypingInTextField()) {
            enableGameKeyboard();
          }
        }, 0);
      },
      true
    );

    // 3. Window keydown capture to ensure Phaser is disabled before it can process
    window.addEventListener(
      'keydown',
      (e) => {
        if (isTypingInTextField(e)) {
          disableGameKeyboard();
        }
      },
      true
    );
  }

  // 4. Modal Name Fields & Text Input Enter / Escape handling (capture phase)
  // Enter confirms modal; Escape cancels or closes modal. Neither reaches the game.
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener(
      'keydown',
      (e: KeyboardEvent) => {
        if (!isTypingInTextField(e)) return;
        const target = (e.target as HTMLElement) || (document.activeElement as HTMLElement);
        if (!target) return;

      if (e.key === 'Enter') {
        if (target.id === 'new-game-hero-name') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation?.();
          const btn = document.getElementById('confirm-new-game-btn') as HTMLButtonElement | null;
          btn?.click();
        } else if (target.id === 'recruit-name-input') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation?.();
          const btn = document.getElementById('confirm-summon-recruit-btn') as HTMLButtonElement | null;
          btn?.click();
        } else if (target.id === 'fourth-name-input') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation?.();
          const btn = document.getElementById('confirm-summon-fourth-btn') as HTMLButtonElement | null;
          btn?.click();
        } else {
          const modal = target.closest?.('.custom-modal');
          const confirmBtn = modal?.querySelector<HTMLButtonElement>(
            'button[id^="confirm-"], .btn-confirm, .btn-action'
          );
          if (confirmBtn) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation?.();
            confirmBtn.click();
          }
        }
      } else if (e.key === 'Escape') {
        if (target.id === 'new-game-hero-name') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation?.();
          target.blur();
          const btn = document.getElementById('close-new-game-btn') as HTMLButtonElement | null;
          btn?.click();
        } else if (target.id === 'recruit-name-input') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation?.();
          target.blur();
          const btn = document.getElementById('close-summon-recruit-btn') as HTMLButtonElement | null;
          btn?.click();
        } else if (target.id === 'fourth-name-input') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation?.();
          target.blur();
          const btn = document.getElementById('close-summon-fourth-btn') as HTMLButtonElement | null;
          btn?.click();
        } else {
          const modal = target.closest?.('.custom-modal');
          const closeBtn = modal?.querySelector<HTMLButtonElement>(
            'button[id^="close-"], button[id^="cancel-"], .modal-close-btn, .btn-cancel'
          );
          if (closeBtn) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation?.();
            target.blur();
            closeBtn.click();
          }
        }
      }
    },
    true
  );
  }
}
