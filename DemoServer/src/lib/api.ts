import { derived, writable, type Readable, type Writable, get } from "svelte/store";
import { connectionPoints, powerTypes, powerTypesHistory, previewDatapoint } from "./stores";
import { browser } from "$app/environment";

const API_URL = "https://api.dirtywatts.nz";
const OFFSET_HRS = 24*5;
const OFFSET = OFFSET_HRS * 3600 * 1000;

export const calendarDate = writable(new Date("2023-06-28"));

const dataEndPoint: Readable<Date> = derived(calendarDate, (calendarDate) => {
  // Get datetime just before midnight
  let date = new Date(calendarDate);
  date.setHours(23, 59, 59, 999);
  return date;
}); 
const dataStartPoint: Readable<Date> = derived(dataEndPoint, (dataEndPoint) => new Date(dataEndPoint - OFFSET));


export type PowerTypes = Record<string, PowerType>;

export interface PowerStationsResponse {
  timestamp: string;
  power_types: PowerTypes;
  co2e_tonnne_per_hour: number;
  co2e_grams_per_kwh: number;
}

export interface PowerType {
  generation_mw: number;
  capacity_mw: number;
}

export interface ConnectionPoint {
  connection_code: string;
  timestamp: string;
  load_mw: number;
  generation_mw: number;
  mwh_price: number;
  latitude: number;
  longitude: number;
  address: string;
}

async function fetchAPI<T>(path: string): Promise<T> {
  return await fetch(`${API_URL}/${path}`).then((res) => res.json());
}

export async function getPowerStations(): Promise<PowerStationsResponse> {
  return fetchAPI<PowerStationsResponse>("live/power_stations");
}

export async function getPowerStationsHistory(): Promise<
  PowerStationsResponse[]
> {

  const INTERVAL = 60;
  const INTERVAL_MS = INTERVAL * 60 * 1000;

  // Round the date to the nearest interval to make the API call easier to cache

  return fetchAPI<PowerStationsResponse[]>(
    `history/power_stations?start=${get(dataStartPoint).toISOString()}&end=${get(dataEndPoint).toISOString()}&time_interval_minutes=${INTERVAL}`
  );
}

export async function getConnectionPoints(): Promise<ConnectionPoint[]> {
  return fetchAPI<ConnectionPoint[]>("live/grid_connection_points");
}
export async function getConnectionPointHistory(
  point_code: string
): Promise<ConnectionPoint[]> {

  const INTERVAL = 30;
  const INTERVAL_MS = INTERVAL * 60 * 1000;

  // Round the date to the nearest interval to make the API call easier to cache
  let startDate = new Date(Math.round((Date.now() - OFFSET) / INTERVAL_MS) * INTERVAL_MS);

  return fetchAPI<ConnectionPoint[]>(
    `history/grid_connection_points/${point_code}?start=${get(dataStartPoint).toISOString()}&end=${get(dataEndPoint).toISOString()}&time_interval_minutes=${INTERVAL}`
  );
}

export async function initialiseAPI() {
  powerTypes.set(await getPowerStations());
  powerTypesHistory.set(await getPowerStationsHistory());
  connectionPoints.set(await getConnectionPoints());
}

let serverState: PowerStationsResponse | { timestamp: "" } = { timestamp: "" };

async function syncToServer(previewDatapoint: PowerStationsResponse | null) {
  if (!previewDatapoint || !browser) {
    return;
  }
  if (previewDatapoint.timestamp != serverState.timestamp) {
    fetch("/live/power_stations", {
      method: "POST",
      body: JSON.stringify(previewDatapoint),
    });
    serverState = previewDatapoint;
  }
}

previewDatapoint.subscribe(syncToServer);
calendarDate.subscribe(initialiseAPI)