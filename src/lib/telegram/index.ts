import "server-only";
import { app } from "../db";
import { deliverTelegramAlerts } from "./deliver";

// Sends pending Telegram alerts using the app database.
export function sendTelegramAlerts() {
  return deliverTelegramAlerts(app());
}
