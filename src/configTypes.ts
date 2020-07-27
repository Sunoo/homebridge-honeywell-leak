export type HoneywellLeakPlatformConfig = {
  name: string;
  consumer_key: string;
  consumer_secret: string;
  refresh_token: string;
  polling_minutes: number;
  hide_temperature: boolean;
  hide_humidity: boolean;
};