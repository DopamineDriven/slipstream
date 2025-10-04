export const COOKIES = {
  hostname: "hostname",
  viewport: "viewport",
  ios: "ios",
  latlng: "latlng",
  tz: "tz",
  ip: "ip",
  ua: "ua",
  country: "country",
  city: "city",
  isMac: "isMac",
  region: "region",
  postalCode: "postalCode",
  locale: "locale"
} as const;

export type CookieValue = {
  hostname: string;
  viewport: "mobile" | "desktop";
  ip: string;
  ua: string;
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
  locale: string;
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
