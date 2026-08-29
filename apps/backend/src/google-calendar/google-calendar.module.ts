import { Module } from '@nestjs/common';
import { GoogleCalendarService } from './google-calendar.service';

// @anchor google-calendar-module
/// Modul bez kontrolera — kalendarz zapisuje sie wylacznie jako efekt decyzji
/// w module Urlopy, nie ma wlasnego endpointu.
@Module({
  providers: [GoogleCalendarService],
  exports: [GoogleCalendarService],
})
export class GoogleCalendarModule {}
