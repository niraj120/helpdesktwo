import {
  Fragment,
  jsx as reactJsx,
  jsxs as reactJsxs,
} from "react/jsx-runtime";
import { transformStyleProps } from "./styleRuntime";

export { Fragment };

export const jsx = (type: unknown, props: unknown, key?: unknown) =>
  reactJsx(type as never, transformStyleProps(type, props) as never, key as never);

export const jsxs = (type: unknown, props: unknown, key?: unknown) =>
  reactJsxs(type as never, transformStyleProps(type, props) as never, key as never);
