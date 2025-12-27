import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal,
  untracked
} from '@angular/core';

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

  protected readonly displayChar = computed(() => {
    const raw = this.value();
    if (!raw) {
      return ' ';
    }

    return raw[0].toUpperCase();
  });

  protected readonly currentChar = signal(' ');
  protected readonly previousChar = signal(' ');
  private readonly flipId = signal(0);

  protected readonly flipMode = computed(() => {
    if (this.flipId() === 0) {
      return '';
    }

    return this.flipId() % 2 === 0 ? 'a' : 'b';
  });

  constructor() {
    effect(() => {
      const next = this.displayChar();
      untracked(() => {
        const current = this.currentChar();
        if (next !== current) {
          this.previousChar.set(current);
          this.currentChar.set(next);
          this.flipId.update((value) => value + 1);
        }
      });
    });
  }
}
