import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';

interface TeamCategoriesResponse {
  categories?: string[];
}

@Injectable({ providedIn: 'root' })
export class TeamCategoryService {
  private readonly apiBase = 'http://127.0.0.1:5000/api/teams';

  constructor(private readonly http: HttpClient) {}

  getCategories(): Observable<string[]> {
    return this.http.get<TeamCategoriesResponse>(`${this.apiBase}/categories`).pipe(
      map((response) => this.uniqueCategories(response.categories || [])),
      catchError(() => of([]))
    );
  }

  formatCategory(category: string): string {
    return category
      .split('_')
      .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
      .join(' ');
  }

  private uniqueCategories(categories: string[]): string[] {
    return Array.from(new Set(categories.filter((item) => !!item && item.trim().length > 0)));
  }
}
