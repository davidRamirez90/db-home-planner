import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  private readonly http = inject(HttpClient);

  protected readonly title = signal('DB Home Planner');
  protected readonly requestStatus = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  protected readonly statusCode = signal<number | null>(null);
  protected readonly workerMessage = signal('');
  protected readonly errorMessage = signal('');

  ngOnInit(): void {
    this.fetchWorkerStatus();
  }

  protected refreshStatus(): void {
    this.fetchWorkerStatus();
  }

  private fetchWorkerStatus(): void {
    this.requestStatus.set('loading');
    this.statusCode.set(null);
    this.workerMessage.set('');
    this.errorMessage.set('');

    this.http
      .get<{ message: string }>('/api/hello', { observe: 'response' })
      .subscribe({
        next: (response) => {
          this.requestStatus.set('success');
          this.statusCode.set(response.status);
          this.workerMessage.set(response.body?.message ?? 'No message returned.');
        },
        error: (error: HttpErrorResponse) => {
          this.requestStatus.set('error');
          this.statusCode.set(error.status || null);
          this.errorMessage.set(error.message || 'Unable to reach the worker.');
        }
      });
  }
}
