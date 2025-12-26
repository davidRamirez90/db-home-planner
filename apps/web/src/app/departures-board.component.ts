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
  protected readonly boardTitle = signal('Departures');

  protected readonly boardRows = computed(() => {
    return this.departures().map((departure) => ({
      station: departure.stationName,
      departure: departure.time,
      line: departure.line,
      destination: departure.destination,
      platform: departure.platform,
      status: departure.status,
      action: departure.action
    }));
  });

  protected toChars(value: string): string[] {
    if (!value) {
      return [' '];
    }

    return Array.from(value);
  }

  constructor() {
    this.departuresService.loadDepartures();
  }
}
