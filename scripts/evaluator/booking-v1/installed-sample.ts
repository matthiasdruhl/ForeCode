// Constant trusted sample. Enum syntax requires tsx transformation.
import "server-only";
enum Smoke {
  Value = 73,
}
export const smoke: Smoke = Smoke.Value;
export const moduleUrl = import.meta.url;
