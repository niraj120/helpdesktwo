import React, { useCallback } from "react";
import {
  resolveValue,
  Toast,
  useToaster,
} from "react-hot-toast/headless";

const toastTypeClass = (toast: Toast) => {
  if (toast.className) return toast.className;
  if (toast.type === "success") return "app-toast-success";
  if (toast.type === "error") return "app-toast-error";
  if (toast.type === "loading") return "app-toast-loading";
  return "app-toast";
};

const defaultIcon = (toast: Toast) => {
  if (toast.icon) return toast.icon;
  if (toast.type === "success") return "OK";
  if (toast.type === "error") return "!";
  if (toast.type === "loading") return "...";
  return "i";
};

const CspSafeToaster: React.FC = () => {
  const { toasts, handlers } = useToaster(
    {
      duration: 4000,
      className: "app-toast",
      success: { className: "app-toast-success" },
      error: { className: "app-toast-error" },
    },
  );

  const updateHeight = useCallback(
    (toastId: string) => (element: HTMLDivElement | null) => {
      if (!element) return;
      handlers.updateHeight(toastId, element.getBoundingClientRect().height);
    },
    [handlers],
  );

  return (
    <div
      className="app-toast-viewport"
      onMouseEnter={handlers.startPause}
      onMouseLeave={handlers.endPause}
      data-csp-safe-toaster
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          ref={updateHeight(toast.id)}
          className={[
            "app-toast-item",
            toast.visible ? "app-toast-item--visible" : "app-toast-item--hidden",
            toastTypeClass(toast),
          ].join(" ")}
          {...toast.ariaProps}
        >
          <span className="app-toast-icon" aria-hidden="true">
            {defaultIcon(toast)}
          </span>
          <span className="app-toast-message">
            {resolveValue(toast.message, toast)}
          </span>
        </div>
      ))}
    </div>
  );
};

export default CspSafeToaster;
