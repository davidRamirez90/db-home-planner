import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal
} from '@angular/core';
import { DeparturesService } from './departures.service';
import { SegmentDisplayComponent } from './segment-display.component';

const COUNTDOWN_INTERVAL_MS = 5000;
const MINUTES_PER_HOUR = 60;
const MS_PER_MINUTE = 60_000;

@Component({
  selector: 'app-departures-board',
  templateUrl: './departures-board.component.html',
  styleUrl: './departures-board.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SegmentDisplayComponent]
})
export class DeparturesBoardComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly departuresService = inject(DeparturesService);

  protected readonly requestStatus = this.departuresService.requestStatus;
  protected readonly errorMessage = this.departuresService.errorMessage;
  protected readonly departures = this.departuresService.departures;
  protected readonly boardTitle = signal('DEPARTURES');
  private readonly now = signal(Date.now());

  protected readonly displayStatus = computed(() => this.requestStatus().toUpperCase());
  protected readonly displayClock = computed(() => this.formatClock(this.now()));

  protected readonly displayErrorMessage = computed(() => {
    const message = this.errorMessage();
    return message ? message.toUpperCase() : '';
  });

  protected readonly boardRows = computed(() => {
    const now = this.now();
    return this.departures().map((departure) => ({
      station: this.toDisplayValue(departure.stationName),
      departure: this.toDisplayValue(departure.time),
      line: this.toDisplayValue(departure.line),
      countdown: this.formatCountdown(departure.time, now),
      status: this.toDisplayValue(departure.status),
      action: this.toDisplayValue(departure.action)
    }));
  });

  protected toChars(value: string): string[] {
    if (!value) {
      return [' '];
    }

    return Array.from(value.toUpperCase());
  }

  private toDisplayValue(value: string): string {
    if (!value) {
      return '';
    }

    return value.toUpperCase();
  }

  private formatCountdown(time: string, now: number): string {
    if (!time || time === '—') {
      return '—';
    }

    const match = time.match(/^(\d{2}):(\d{2})$/);
    if (!match) {
      return '—';
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      return '—';
    }

    const target = new Date();
    target.setHours(hours, minutes, 0, 0);
    const diffMs = target.getTime() - now;
    if (diffMs <= 0) {
      return 'DUE';
    }

    const totalMinutes = Math.floor(diffMs / MS_PER_MINUTE);
    if (totalMinutes < MINUTES_PER_HOUR) {
      return `${totalMinutes} MIN`;
    }

    const countdownHours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
    const countdownMinutes = totalMinutes % MINUTES_PER_HOUR;
    return `${countdownHours}H ${countdownMinutes.toString().padStart(2, '0')}M`;
  }

  private formatClock(now: number): string {
    const current = new Date(now);
    const hours = current.getHours().toString().padStart(2, '0');
    const minutes = current.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  constructor() {
    this.departuresService.loadDepartures();
    const intervalId = window.setInterval(() => {
      this.now.set(Date.now());
    }, COUNTDOWN_INTERVAL_MS);

    this.destroyRef.onDestroy(() => {
      window.clearInterval(intervalId);
    });
  }
}
