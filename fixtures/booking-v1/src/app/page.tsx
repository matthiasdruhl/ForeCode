import { BookingDemo } from "./booking-demo";
import { resources } from "../domain/booking";
export default function BookingPage() {
  return <BookingDemo resources={resources} />;
}
