import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TrackedStationsService } from './tracked-stations.service';

const placeholderDeck = [
  {
    departure: '15:02',
    line: 'ICE 612',
    destination: 'München Hbf',
    platform: '6',
    status: 'On time',
    action: 'Walk slowly'
  },
  {
    departure: '15:12',
    line: 'RE 4108',
    destination: 'Leipzig Hbf',
    platform: '2',
    status: 'Delayed',
    action: 'Wait for next one'
  },
  {
    departure: '15:24',
    line: 'RB 18652',
    destination: 'Potsdam Hbf',
    platform: '9',
    status: 'On time',
    action: 'Walk slowly'
  },
  {
    departure: '15:40',
    line: 'IC 148',
    destination: 'Hamburg Hbf',
    platform: '4',
    status: 'Cancelled',
    action: 'Wait for next one'
  }
];

@Component({
  selector: 'app-departures-board',
  templateUrl: './departures-board.component.html',
  styleUrl: './departures-board.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DeparturesBoardComponent {
  private readonly trackedStationsService = inject(TrackedStationsService);

  protected readonly requestStatus = this.trackedStationsService.requestStatus;
  protected readonly errorMessage = this.trackedStationsService.errorMessage;
  protected readonly stations = this.trackedStationsService.stations;
  protected readonly boardTitle = signal('Departures');

  protected readonly boardRows = computed(() => {
    const stations = this.stations();

    if (stations.length === 0) {
      return placeholderDeck.map((entry, index) => ({
        ...entry,
        station: index === 0 ? 'Add a station in admin config' : '—'
      }));
    }

    return stations.map((station, index) => {
      const fallback = placeholderDeck[index % placeholderDeck.length];
      return {
        station: station.name,
        departure: fallback.departure,
        line: fallback.line,
        destination: fallback.destination,
        platform: fallback.platform,
        status: fallback.status,
        action: fallback.action
      };
    });
  });

  constructor() {
    this.trackedStationsService.loadTrackedStations();
  }
}
