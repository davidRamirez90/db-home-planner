import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal,
  untracked
} from '@angular/core';

const FLAP_SEQUENCE = ' ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ0123456789:.-/';
const FLAP_DURATION_MS = 30;

@Component({
  selector: 'app-segment-display',
  templateUrl: './segment-display.component.html',
  styleUrl: './segment-display.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true'
  }
})
export class SegmentDisplayComponent {
  readonly value = input('');
  readonly delayMs = input(0);

  protected readonly displayChar = computed(() => {
    const raw = this.value();
    if (!raw) {
      return ' ';
    }

    const normalized = raw[0].toUpperCase();
    return FLAP_SEQUENCE.includes(normalized) ? normalized : ' ';
  });

  protected readonly currentChar = signal(' ');
  protected readonly previousChar = signal(' ');
  private readonly flipId = signal(0);
  private readonly targetChar = signal(' ');
  private startTimer: number | null = null;
  private cycleTimer: number | null = null;
  private settleTimer: number | null = null;

  protected readonly flipMode = computed(() => {
    if (this.flipId() === 0) {
      return '';
    }

    return this.flipId() % 2 === 0 ? 'a' : 'b';
  });

  constructor() {
    effect(() => {
      const next = this.displayChar();
      const delay = Math.max(0, this.delayMs());
      untracked(() => {
        this.targetChar.set(next);
        this.startCycle(delay);
      });
      return () => {
        this.clearTimers();
      };
    });
  }

  private startCycle(delayMs: number): void {
    this.clearTimers();
    if (delayMs > 0) {
      this.startTimer = window.setTimeout(() => {
        this.startTimer = null;
        this.stepCycle();
      }, delayMs);
    } else {
      this.stepCycle();
    }
  }

  private stepCycle(): void {
    const target = this.targetChar();
    const current = this.currentChar();
    if (current === target) {
      this.previousChar.set(current);
      return;
    }

    const nextChar = this.getNextChar(current);
    this.triggerFlip(nextChar);
    this.cycleTimer = window.setTimeout(() => {
      this.cycleTimer = null;
      this.stepCycle();
    }, FLAP_DURATION_MS);
  }

  private triggerFlip(nextChar: string): void {
    const current = this.currentChar();
    this.previousChar.set(current);
    this.currentChar.set(nextChar);
    this.flipId.update((value) => value + 1);

    if (this.settleTimer !== null) {
      window.clearTimeout(this.settleTimer);
    }
    this.settleTimer = window.setTimeout(() => {
      this.settleTimer = null;
      this.previousChar.set(this.currentChar());
    }, FLAP_DURATION_MS);
  }

  private getNextChar(current: string): string {
    const currentIndex = FLAP_SEQUENCE.indexOf(current);
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = (safeIndex + 1) % FLAP_SEQUENCE.length;
    return FLAP_SEQUENCE[nextIndex];
  }

  private clearTimers(): void {
    if (this.startTimer !== null) {
      window.clearTimeout(this.startTimer);
      this.startTimer = null;
    }
    if (this.cycleTimer !== null) {
      window.clearTimeout(this.cycleTimer);
      this.cycleTimer = null;
    }
    if (this.settleTimer !== null) {
      window.clearTimeout(this.settleTimer);
      this.settleTimer = null;
    }
  }
}
