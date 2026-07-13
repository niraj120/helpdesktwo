import {
  Fragment,
  jsxDEV as reactJsxDev,
} from "react/jsx-dev-runtime";
import { transformStyleProps } from "./styleRuntime";

export { Fragment };

export const jsxDEV = (
  type: unknown,
  props: unknown,
  key: unknown,
  isStaticChildren: boolean,
  source: unknown,
  self: unknown,
) =>
  reactJsxDev(
    type as never,
    transformStyleProps(type, props) as never,
    key as never,
    isStaticChildren,
    source as never,
    self as never,
  );
