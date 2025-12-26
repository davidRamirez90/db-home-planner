import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

type SegmentId = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'dp';

const SEGMENT_MAP: Record<string, readonly SegmentId[]> = {
  '0': ['a', 'b', 'c', 'd', 'e', 'f'],
  '1': ['b', 'c'],
  '2': ['a', 'b', 'd', 'e', 'g'],
  '3': ['a', 'b', 'c', 'd', 'g'],
  '4': ['b', 'c', 'f', 'g'],
  '5': ['a', 'c', 'd', 'f', 'g'],
  '6': ['a', 'c', 'd', 'e', 'f', 'g'],
  '7': ['a', 'b', 'c'],
  '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  '9': ['a', 'b', 'c', 'd', 'f', 'g'],
  A: ['a', 'b', 'c', 'e', 'f', 'g'],
  B: ['c', 'd', 'e', 'f', 'g'],
  C: ['a', 'd', 'e', 'f'],
  D: ['b', 'c', 'd', 'e', 'g'],
  E: ['a', 'd', 'e', 'f', 'g'],
  F: ['a', 'e', 'f', 'g'],
  G: ['a', 'c', 'd', 'e', 'f'],
  H: ['b', 'c', 'e', 'f', 'g'],
  I: ['b', 'c'],
  J: ['b', 'c', 'd', 'e'],
  L: ['d', 'e', 'f'],
  N: ['c', 'e', 'g'],
  O: ['a', 'b', 'c', 'd', 'e', 'f'],
  P: ['a', 'b', 'e', 'f', 'g'],
  R: ['e', 'g'],
  S: ['a', 'c', 'd', 'f', 'g'],
  T: ['d', 'e', 'f', 'g'],
  U: ['b', 'c', 'd', 'e', 'f'],
  Y: ['b', 'c', 'd', 'f', 'g'],
  '-': ['g'],
  '_': ['d'],
  '.': ['dp'],
  ':': ['dp'],
  ' ': []
};

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
    const raw = this.value().trim();
    if (!raw) {
      return ' ';
    }

    return raw[0].toUpperCase();
  });

  protected readonly activeSegments = computed(() => {
    const segments = SEGMENT_MAP[this.displayChar()] ?? [];
    return new Set(segments);
  });
}
