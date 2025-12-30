import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal
} from '@angular/core';
import { useSegmentDisplay } from './api-config';
import { DepartureEntry } from './departure-types';
import { DeparturesService } from './departures.service';
import { formatLineLabel } from './line-format';
import { RequestState } from './station-types';
import { SegmentDisplayComponent } from './segment-display.component';

const COUNTDOWN_INTERVAL_MS = 5000;
const MINUTES_PER_HOUR = 60;
const MS_PER_MINUTE = 60_000;
const EXPIRED_GRACE_MS = 60_000;
const REFRESH_COOLDOWN_MS = 15_000;
const DAY_ROLLOVER_GRACE_MS = 3 * 60 * 60 * 1000;

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
  protected readonly boardTitle = signal('ABFAHRTEN');
  protected readonly showSegmentDisplay = useSegmentDisplay;
  private readonly now = signal(Date.now());
  private readonly lastRefresh = signal(0);

  protected readonly displayStatus = computed(() => this.formatStatus(this.requestStatus()));
  protected readonly displayClock = computed(() => this.formatClock(this.now()));

  protected readonly displayErrorMessage = computed(() => {
    const message = this.errorMessage();
    return message ? message.toUpperCase() : '';
  });

  protected readonly boardRows = computed(() => {
    const now = this.now();
    return this.departures().map((departure) => {
      const line = formatLineLabel(departure.line);
      return {
        station: this.toDisplayValue(departure.stationName),
        departure: this.toDisplayValue(departure.time),
        line,
        lineBadge: this.formatLineBadge(line),
        ...this.getCountdownInfo(departure.time, now),
        status: this.toDisplayValue(departure.status),
        ...this.formatAction(departure.action)
      };
    });
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

  private getCountdownInfo(
    time: string,
    now: number
  ): { countdown: string; countdownMinutes: number | null; isUrgent: boolean } {
    if (!time || time === '—') {
      return { countdown: '—', countdownMinutes: null, isUrgent: false };
    }

    const match = time.match(/^(\d{2}):(\d{2})$/);
    if (!match) {
      return { countdown: '—', countdownMinutes: null, isUrgent: false };
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      return { countdown: '—', countdownMinutes: null, isUrgent: false };
    }

    const target = new Date();
    target.setHours(hours, minutes, 0, 0);
    const diffMs = target.getTime() - now;
    if (diffMs <= 0) {
      return { countdown: 'JETZT', countdownMinutes: 0, isUrgent: true };
    }

    const totalMinutes = Math.floor(diffMs / MS_PER_MINUTE);
    if (totalMinutes < MINUTES_PER_HOUR) {
      return {
        countdown: `${totalMinutes} MIN`,
        countdownMinutes: totalMinutes,
        isUrgent: totalMinutes < 3
      };
    }

    const countdownHours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
    const countdownMinutes = totalMinutes % MINUTES_PER_HOUR;
    return {
      countdown: `${countdownHours}STD ${countdownMinutes.toString().padStart(2, '0')}MIN`,
      countdownMinutes: totalMinutes,
      isUrgent: false
    };
  }

  private formatLineBadge(lineLabel: string): string {
    if (!lineLabel) {
      return '—';
    }

    if (lineLabel.startsWith('S')) {
      return '●';
    }

    if (lineLabel.startsWith('U')) {
      return '■';
    }

    return '◆';
  }

  private formatAction(action: string): {
    actionLabel: string;
    actionIcon: string;
    actionDetail: string;
  } {
    if (!action) {
      return { actionLabel: '—', actionIcon: '', actionDetail: '' };
    }

    const trimmed = action.trim();
    if (!trimmed) {
      return { actionLabel: '—', actionIcon: '', actionDetail: '' };
    }

    const detail = trimmed.toUpperCase();
    const normalized = trimmed.toLowerCase();

    if (normalized.includes('beeil') || normalized.includes('renn') || normalized.includes('schnell')) {
      return { actionLabel: 'RUN', actionIcon: '🏃', actionDetail: detail };
    }

    if (normalized.includes('langsam') || normalized.includes('geh') || normalized.includes('wegzeit')) {
      return { actionLabel: 'WALK', actionIcon: '🚶', actionDetail: detail };
    }

    if (
      normalized.includes('warte') ||
      normalized.includes('prüf') ||
      normalized.includes('nächste')
    ) {
      return { actionLabel: 'WAIT', actionIcon: '☕', actionDetail: detail };
    }

    return { actionLabel: detail, actionIcon: '', actionDetail: detail };
  }

  private formatClock(now: number): string {
    const current = new Date(now);
    const hours = current.getHours().toString().padStart(2, '0');
    const minutes = current.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  private formatStatus(status: RequestState): string {
    switch (status) {
      case 'loading':
        return 'LÄDT';
      case 'success':
        return 'OK';
      case 'error':
        return 'FEHLER';
      default:
        return 'BEREIT';
    }
  }

  constructor() {
    this.refreshDepartures();
    const intervalId = window.setInterval(() => {
      this.now.set(Date.now());
    }, COUNTDOWN_INTERVAL_MS);

    this.destroyRef.onDestroy(() => {
      window.clearInterval(intervalId);
    });

    effect(() => {
      const now = this.now();
      const status = this.requestStatus();
      const departures = this.departures();
      const lastRefresh = this.lastRefresh();

      if (status !== 'success') {
        return;
      }

      if (now - lastRefresh < REFRESH_COOLDOWN_MS) {
        return;
      }

      if (this.hasExpiredDeparture(departures, now)) {
        this.refreshDepartures();
      }
    });
  }

  private refreshDepartures(): void {
    this.lastRefresh.set(Date.now());
    this.departuresService.loadDepartures();
  }

  private hasExpiredDeparture(departures: DepartureEntry[], now: number): boolean {
    return departures.some((departure) => this.isDepartureExpired(departure.time, now));
  }

  private isDepartureExpired(time: string, now: number): boolean {
    if (!time || time === '—') {
      return false;
    }

    const match = time.match(/^(\d{2}):(\d{2})$/);
    if (!match) {
      return false;
    }

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      return false;
    }

    const target = new Date(now);
    target.setHours(hours, minutes, 0, 0);
    let diffMs = target.getTime() - now;

    if (diffMs < -DAY_ROLLOVER_GRACE_MS) {
      target.setDate(target.getDate() + 1);
      diffMs = target.getTime() - now;
    }

    return diffMs < -EXPIRED_GRACE_MS;
  }
}
