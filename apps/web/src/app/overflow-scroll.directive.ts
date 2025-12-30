import { DestroyRef, Directive, ElementRef, effect, inject, input, signal } from '@angular/core';

@Directive({
  selector: '[appOverflowScroll]',
  standalone: true,
  host: {
    '[class.is-overflowing]': 'isOverflowing()'
  }
})
export class OverflowScrollDirective {
  readonly appOverflowScroll = input('');
  protected readonly isOverflowing = signal(false);

  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private frameId: number | null = null;

  constructor() {
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.scheduleMeasure());

    if (observer) {
      observer.observe(this.elementRef.nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
    }

    effect(() => {
      this.appOverflowScroll();
      this.scheduleMeasure();
    });

    this.destroyRef.onDestroy(() => {
      if (this.frameId !== null) {
        window.cancelAnimationFrame(this.frameId);
        this.frameId = null;
      }
    });
  }

  private scheduleMeasure(): void {
    if (this.frameId !== null) {
      window.cancelAnimationFrame(this.frameId);
    }
    this.frameId = window.requestAnimationFrame(() => {
      this.frameId = null;
      this.measure();
    });
  }

  private measure(): void {
    const element = this.elementRef.nativeElement;
    const overflowPx = Math.max(0, element.scrollWidth - element.clientWidth);
    const isOverflowing = overflowPx > 1;
    this.isOverflowing.set(isOverflowing);

    if (isOverflowing) {
      const durationSeconds = Math.max(6, overflowPx / 20);
      element.style.setProperty('--scroll-distance', `${overflowPx}px`);
      element.style.setProperty('--scroll-duration', `${durationSeconds}s`);
    } else {
      element.style.removeProperty('--scroll-distance');
      element.style.removeProperty('--scroll-duration');
    }
  }
}
