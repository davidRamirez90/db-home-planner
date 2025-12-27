import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DeparturesService } from './departures.service';
import { SegmentDisplayComponent } from './segment-display.component';

@Component({
  selector: 'app-departures-board',
  templateUrl: './departures-board.component.html',
  styleUrl: './departures-board.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SegmentDisplayComponent]
})
export class DeparturesBoardComponent {
  private readonly departuresService = inject(DeparturesService);

  protected readonly requestStatus = this.departuresService.requestStatus;
  protected readonly errorMessage = this.departuresService.errorMessage;
  protected readonly departures = this.departuresService.departures;
  protected readonly boardTitle = signal('DEPARTURES');

  protected readonly displayStatus = computed(() => this.requestStatus().toUpperCase());

  protected readonly displayErrorMessage = computed(() => {
    const message = this.errorMessage();
    return message ? message.toUpperCase() : '';
  });

  protected readonly boardRows = computed(() => {
    return this.departures().map((departure) => ({
      station: this.toDisplayValue(departure.stationName),
      departure: this.toDisplayValue(departure.time),
      line: this.toDisplayValue(departure.line),
      destination: this.toDisplayValue(departure.destination),
      platform: this.toDisplayValue(departure.platform),
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

  constructor() {
    this.departuresService.loadDepartures();
  }
}
