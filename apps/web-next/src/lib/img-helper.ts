const data = [
  {
    hostname: "localhost",
    port: "3030",
    protocol: "http"
  },
  { hostname: "lh3.googleusercontent.com", protocol: "https" },
  {
    hostname: `chat.d0paminedriven.com`,
    protocol: "https"
  },
  {
    hostname: `dev.chat.d0paminedriven.com`,
    protocol: "https"
  },
  {
    hostname: `py.d0paminedriven.com`,
    protocol: "https"
  },
  {
    hostname: `assets.d0paminedriven.com`,
    protocol: "https"
  },
  {
    hostname: `assets-dev.d0paminedriven.com`,
    protocol: "https"
  },
  {
    hostname: `chat.aicoalesce.com`,
    protocol: "https"
  },
  {
    hostname: `dev.chat.aicoalesce.com`,
    protocol: "https"
  },
  {
    hostname: `py.aicoalesce.com`,
    protocol: "https"
  },
  { hostname: "home.nps.gov", protocol: "https" },
  {
    hostname: `assets.aicoalesce.com`,
    protocol: "https"
  },
  {
    hostname: `assets-dev.aicoalesce.com`,
    protocol: "https"
  },
  { hostname: "raw.githubusercontent.com", protocol: "https" },
  { hostname: "imgen.x.ai", protocol: "https" },
  { hostname: "images.unsplash.com", protocol: "https" },
  { hostname: "tailwindcss.com", protocol: "https" }
];

export const imgSrcMapper = data.map(v => {
  const protocol = v.protocol;
  const host = v.hostname;

  return v.port ? `${protocol}://${host}:${v.port}` : `${protocol}://${host}`;
});
