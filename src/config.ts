import brand from "../brand.json";

export const APP_NAME = brand.name; // change it in brand.json, not here
/** Every record is stamped with its business. "demo-business" until a real
 * business is established through Supabase sign-in; then swapped in by AuthProvider. */
export let BUSINESS_ID = "demo-business";
const businessIdListeners = new Set<(id: string) => void>();
export const onBusinessIdChange = (listener: (id: string) => void) => {
  businessIdListeners.add(listener);
  return () => { businessIdListeners.delete(listener); };
};
export const setBusinessId = (id: string) => {
  BUSINESS_ID = id || "demo-business";
  businessIdListeners.forEach((listener) => listener(BUSINESS_ID));
};
