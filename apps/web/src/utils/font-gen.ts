import { Fs } from "@d0paminedriven/fs";

const fs = new Fs(process.cwd());

const basisWorkup = fs
  .readDir("public/fonts")
  .filter(t => t.startsWith("BasisGrotesquePro-"))
  .map(files => files.replace(/\b(\.woff2)\b/g, ""))
  .map(t => t.split(/-/g) as [string, string]);

const fontStyleHelper = (filename: string) => {
  if (filename.endsWith("Italic")) return "italic" as const;
  else return "normal" as const;
};
const fontWeightHelper = (v: string) => {
  return v.includes("Black")
    ? 800
    : v.includes("Bold")
      ? 700
      : v.includes("Medium")
        ? 500
        : v.includes("Light")
          ? 300
          : 400;
};

// prettier-ignore
const template = (filename: string) => `@font-face {
  font-family: "BasisGrotesquePro";
  src: url("/fonts/${filename}.woff2") format("woff2");
  font-weight: ${fontWeightHelper(filename)};
  font-style: ${fontStyleHelper(filename)};
  font-display: swap;
}`;

const templateArr = Array.of<string>();
type BasisRT<T extends "tuple" | "templates"> = T extends "templates"
  ? string[]
  : T extends "tuple"
    ? [string, string][]
    : never;
const arrHelper = Array.of<[string, string]>();
const handleTemplating = () => {
  try {
    basisWorkup.map(([k, v]) => {
      arrHelper.push([k, v]);
      const filename = `${k}-${v}`;
      templateArr.push(template(filename));
      return [
        v,
        v.includes("Black")
          ? 800
          : v.includes("Bold")
            ? 700
            : v.includes("Medium")
              ? 500
              : v.includes("Light")
                ? 300
                : 400
      ] as const;
    });
  } catch (err) {
    console.error(err);
  } finally {
    return templateArr;
  }
};
const basis = <const T extends "tuple" | "templates" = "tuple">(target?: T) =>
  (target === "templates" ? handleTemplating() : basisWorkup) as BasisRT<T>;

/**
 * outputs:
 *
 *
 *
```css
@font-face {
  font-family: "BasisGrotesquePro";
  src: url("/fonts/BasisGrotesquePro-Black.woff2") format("woff2");
  font-weight: 800;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "BasisGrotesquePro";
  src: url("/fonts/BasisGrotesquePro-BlackItalic.woff2") format("woff2");
  font-weight: 800;
  font-style: italic;
  font-display: swap;
}

@font-face {
  font-family: "BasisGrotesquePro";
  src: url("/fonts/BasisGrotesquePro-Bold.woff2") format("woff2");
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "BasisGrotesquePro";
  src: url("/fonts/BasisGrotesquePro-BoldItalic.woff2") format("woff2");
  font-weight: 700;
  font-style: italic;
  font-display: swap;
}

@font-face {
  font-family: "BasisGrotesquePro";
  src: url("/fonts/BasisGrotesquePro-Italic.woff2") format("woff2");
  font-weight: 400;
  font-style: italic;
  font-display: swap;
}

@font-face {
  font-family: "BasisGrotesquePro";
  src: url("/fonts/BasisGrotesquePro-Light.woff2") format("woff2");
  font-weight: 300;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "BasisGrotesquePro";
  src: url("/fonts/BasisGrotesquePro-LightItalic.woff2") format("woff2");
  font-weight: 300;
  font-style: italic;
  font-display: swap;
}

@font-face {
  font-family: "BasisGrotesquePro";
  src: url("/fonts/BasisGrotesquePro-Medium.woff2") format("woff2");
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "BasisGrotesquePro";
  src: url("/fonts/BasisGrotesquePro-MediumItalic.woff2") format("woff2");
  font-weight: 500;
  font-style: italic;
  font-display: swap;
}

@font-face {
  font-family: "BasisGrotesquePro";
  src: url("/fonts/BasisGrotesquePro-Regular.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
```

 */
function getCssFontFaces() {
  return basis("templates").join(`\n\n`);
}

console.log(getCssFontFaces());
