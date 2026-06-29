/**
 * Service Request theme — thin alias over the app-wide OneOS design tokens.
 * Kept so existing SR imports (SR, srStyles, srButton, chip) keep working.
 * Canonical source: ../theme/oneos.ts  (docs/ONEOS_DESIGN_SYSTEM.md)
 */
export {
  tokens as SR,
  styles as srStyles,
  button as srButton,
  chip,
} from "../theme/oneos";
