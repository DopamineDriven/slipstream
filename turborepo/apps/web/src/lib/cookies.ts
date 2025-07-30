export const COOKIES = {
  hostname: "hostname",
  viewport: "viewport",
  ios: "ios",
  latlng: "latlng",
  tz: "tz",
  country: "country",
  city: "city",
  isMac: "isMac",
  region: "region",
  postalCode: "postalCode"
} as const;

export type CookieValue = {
  hostname: string;
  viewport: "mobile" | "desktop";
  ios: "true" | "false";
  /**
   ```ts
   `${number},${number}` = `lat,lng`
   ```
   */
  latlng: string;
  tz: string;
  region: string;
  postalCode: string;
  country: string;
  city: string;
  isMac: "true" | "false";
};

export type CookieKey = keyof typeof COOKIES;

export type GetCookie<T extends keyof CookieValue> = {
  [P in T]: CookieValue[P];
}[T];

export interface CookieContextType {
  get: <const K extends CookieKey>(key: K) => GetCookie<K> | undefined;
  set: <const K extends CookieKey>(
    key: K,
    value: CookieValue[K],
    options?: Cookies.CookieAttributes
  ) => void;
  remove: (key: CookieKey) => void;
  getAll: () => Partial<CookieValue>;
}
