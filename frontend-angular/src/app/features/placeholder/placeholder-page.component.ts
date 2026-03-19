import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-placeholder-page',
  templateUrl: './placeholder-page.component.html',
  styleUrl: './placeholder-page.component.css'
})
export class PlaceholderPageComponent {
  private readonly route = inject(ActivatedRoute);
  readonly pageTitle = computed(() => this.route.snapshot.data['title'] ?? 'Page');
}
