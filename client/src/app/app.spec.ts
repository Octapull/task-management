import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      // Kök bileşen router-outlet içerdiği için yönlendirici sağlanmalı.
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('kök bileşen oluşturulabilmeli', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });
});
