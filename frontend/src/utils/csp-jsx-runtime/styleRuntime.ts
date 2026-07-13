const unitlessCssProperties = new Set([
  "animationIterationCount",
  "aspectRatio",
  "borderImageOutset",
  "borderImageSlice",
  "borderImageWidth",
  "boxFlex",
  "boxFlexGroup",
  "boxOrdinalGroup",
  "columnCount",
  "columns",
  "flex",
  "flexGrow",
  "flexPositive",
  "flexShrink",
  "flexNegative",
  "flexOrder",
  "gridArea",
  "gridRow",
  "gridRowEnd",
  "gridRowSpan",
  "gridRowStart",
  "gridColumn",
  "gridColumnEnd",
  "gridColumnSpan",
  "gridColumnStart",
  "fontWeight",
  "lineClamp",
  "lineHeight",
  "opacity",
  "order",
  "orphans",
  "tabSize",
  "widows",
  "zIndex",
  "zoom",
  "fillOpacity",
  "floodOpacity",
  "stopOpacity",
  "strokeDasharray",
  "strokeDashoffset",
  "strokeMiterlimit",
  "strokeOpacity",
  "strokeWidth",
]);

const ruleCache = new Map<string, string>();
const insertedClasses = new Set<string>();
let writableSheet: CSSStyleSheet | null = null;
let retryScheduled = false;
let runtimeStyleElement: HTMLStyleElement | null = null;

const getAdoptedStyleSheet = () => {
  if (typeof document === "undefined") return null;
  const doc = document as Document & {
    adoptedStyleSheets?: CSSStyleSheet[];
  };
  if (!Array.isArray(doc.adoptedStyleSheets)) return null;

  try {
    const sheet = new CSSStyleSheet();
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
    return sheet;
  } catch {
    return null;
  }
};

const hash = (input: string) => {
  let value = 5381;
  for (let i = 0; i < input.length; i += 1) {
    value = (value * 33) ^ input.charCodeAt(i);
  }
  return (value >>> 0).toString(36);
};

const toKebabCase = (property: string) => {
  if (property.startsWith("--")) return property;
  return property
    .replace(/^ms/, "-ms")
    .replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
};

const serializeValue = (property: string, value: unknown) => {
  if (value === null || value === undefined || typeof value === "boolean") {
    return "";
  }
  if (typeof value === "number" && value !== 0 && !unitlessCssProperties.has(property)) {
    return `${value}px`;
  }
  return String(value).trim();
};

const getWritableSheet = () => {
  if (typeof document === "undefined") return null;
  if (writableSheet) return writableSheet;

  if (runtimeStyleElement?.sheet) {
    writableSheet = runtimeStyleElement.sheet as CSSStyleSheet;
    return writableSheet;
  }

  const adoptedSheet = getAdoptedStyleSheet();
  if (adoptedSheet) {
    writableSheet = adoptedSheet;
    return writableSheet;
  }

  try {
    runtimeStyleElement = document.createElement("style");
    runtimeStyleElement.setAttribute("data-csp-style-runtime", "true");
    runtimeStyleElement.setAttribute("data-vite-dev-id", "csp-style-runtime");
    document.head.appendChild(runtimeStyleElement);
    writableSheet = runtimeStyleElement.sheet as CSSStyleSheet;
    return writableSheet;
  } catch {
    return null;
  }
};

const scheduleRetry = () => {
  if (retryScheduled || typeof window === "undefined") return;
  retryScheduled = true;
  window.requestAnimationFrame(() => {
    retryScheduled = false;
    for (const [className, rule] of ruleCache) {
      if (!insertedClasses.has(className)) {
        insertRule(className, rule);
      }
    }
  });
};

const insertRule = (className: string, rule: string): boolean => {
  if (insertedClasses.has(className)) return true;
  const sheet = getWritableSheet();
  if (!sheet) {
    scheduleRetry();
    return false;
  }

  try {
    sheet.insertRule(rule, sheet.cssRules.length);
    insertedClasses.add(className);
    return true;
  } catch {
    // Invalid style values should not break rendering.
    return false;
  }
};

const createClassName = (style: Record<string, unknown>) => {
  const declarations = Object.keys(style)
    .sort()
    .map((property) => {
      const value = serializeValue(property, style[property]);
      if (!value) return "";
      return `${toKebabCase(property)}:${value}`;
    })
    .filter(Boolean)
    .join(";");

  if (!declarations) return "";

  const className = `csp-s-${hash(declarations)}`;
  if (!ruleCache.has(className)) {
    const rule = `.${className}{${declarations}}`;
    ruleCache.set(className, rule);
    if (!insertRule(className, rule)) return "";
  } else {
    if (!insertRule(className, ruleCache.get(className) || "")) return "";
  }

  return className;
};

export const transformStyleProps = (type: unknown, props: unknown) => {
  // Runtime conversion of React style props into generated CSS classes is not
  // safe enough for the current app. The portal still has thousands of dynamic
  // inline style props and several third-party components that mutate styles at
  // runtime. Under a strict style-src CSP, browsers can block both inline style
  // attributes and runtime CSSOM injection, which leaves the app with class
  // names but no applied layout CSS. Keep this as a no-op until the remaining
  // styles are migrated into static CSS files/classes module-by-module.
  return props;

  if (typeof type !== "string" || !props || typeof props !== "object") {
    return props;
  }

  const input = props as Record<string, unknown>;
  const style = input.style;
  if (!style || typeof style !== "object" || Array.isArray(style)) {
    return props;
  }

  const generatedClassName = createClassName(style as Record<string, unknown>);
  if (!generatedClassName) {
    const { style: _style, ...rest } = input;
    return rest;
  }

  const existingClassName = typeof input.className === "string" ? input.className : "";
  const { style: _style, ...rest } = input;
  return {
    ...rest,
    className: existingClassName
      ? `${existingClassName} ${generatedClassName}`
      : generatedClassName,
  };
};
